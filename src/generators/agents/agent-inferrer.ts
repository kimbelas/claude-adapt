/**
 * Agent inferrer.
 *
 * Takes detected capabilities and agent templates, evaluates which
 * templates should activate, resolves command placeholders, and
 * produces concrete markdown command files.
 *
 * Placeholder resolution:
 *   {db.prisma.migrate}  → exact lookup: capability "db.prisma", command "migrate"
 *   {db.*.migrate}       → wildcard: highest-confidence db.* match, command "migrate"
 *   {test.**.run}         → iterate: one resolved line per matching test.* capability
 */

import type { DetectedCapability } from '../capabilities/types.js';
import type { AgentTemplate, CommandFile } from './types.js';
import { AGENT_CATALOG } from './agent-catalog.js';

// ---------------------------------------------------------------------------
// Capability matching helpers
// ---------------------------------------------------------------------------

/**
 * Check whether a capability prefix is satisfied by the detected set.
 * "db" matches "db.prisma", "db.drizzle", etc.
 * "db.prisma" matches only "db.prisma".
 */
function hasCapability(
  capabilities: DetectedCapability[],
  prefix: string,
): boolean {
  return capabilities.some(
    (c) => c.rule.id === prefix || c.rule.id.startsWith(prefix + '.'),
  );
}

/**
 * Get the highest-confidence capability matching a prefix.
 */
function getBestMatch(
  capabilities: DetectedCapability[],
  prefix: string,
): DetectedCapability | undefined {
  // Capabilities are already sorted by confidence descending
  return capabilities.find(
    (c) => c.rule.id === prefix || c.rule.id.startsWith(prefix + '.'),
  );
}

/**
 * Get all capabilities matching a prefix.
 */
function getAllMatches(
  capabilities: DetectedCapability[],
  prefix: string,
): DetectedCapability[] {
  return capabilities.filter(
    (c) => c.rule.id === prefix || c.rule.id.startsWith(prefix + '.'),
  );
}

// ---------------------------------------------------------------------------
// Placeholder resolution
// ---------------------------------------------------------------------------

/**
 * Placeholder pattern: {prefix.commandName} or {prefix.*.commandName} or {prefix.**.commandName}
 */
const PLACEHOLDER_REGEX = /\{([^}]+)\}/g;

/**
 * Resolve a single placeholder like "db.prisma.migrate", "db.*.migrate",
 * or "test.**.run" against detected capabilities.
 */
function resolveSinglePlaceholder(
  placeholder: string,
  capabilities: DetectedCapability[],
): string | string[] | null {
  const parts = placeholder.split('.');

  // {type}({scope}): {description} — not a capability placeholder, pass through
  if (parts.length < 2 || parts[0] === 'type' || parts[0] === 'scope' || parts[0] === 'description') {
    return `{${placeholder}}`;
  }

  // Iterate pattern: prefix.**.command (e.g., "lint.**.fix")
  if (parts.length === 3 && parts[1] === '**') {
    const prefix = parts[0];
    const commandKey = parts[2];
    const matches = getAllMatches(capabilities, prefix);
    const results: string[] = [];

    for (const cap of matches) {
      const cmd = cap.rule.commands[commandKey];
      if (cmd) {
        results.push(cmd);
      }
    }

    return results.length > 0 ? results : null;
  }

  // Wildcard pattern: prefix.*.command (e.g., "db.*.migrate")
  if (parts.length === 3 && parts[1] === '*') {
    const prefix = parts[0];
    const commandKey = parts[2];
    const best = getBestMatch(capabilities, prefix);
    if (best) {
      const cmd = best.rule.commands[commandKey];
      if (cmd) return cmd;
    }
    return null;
  }

  // Exact pattern: prefix.id.command (e.g., "db.prisma.migrate")
  if (parts.length === 3) {
    const capId = `${parts[0]}.${parts[1]}`;
    const commandKey = parts[2];
    const cap = capabilities.find((c) => c.rule.id === capId);
    if (cap) {
      const cmd = cap.rule.commands[commandKey];
      if (cmd) return cmd;
    }
    return null;
  }

  // Two-part: could be "build.typescript" capability prefix check — not a command lookup
  return `{${placeholder}}`;
}

/**
 * Resolve all placeholders in a step instruction.
 *
 * For iterate patterns ({**.}), returns multiple resolved lines.
 * For single patterns, returns the instruction with placeholders replaced.
 * Returns null if a required placeholder can't be resolved.
 */
function resolveInstruction(
  instruction: string,
  capabilities: DetectedCapability[],
): string | null {
  let hasUnresolved = false;
  let iterateResults: string[] | null = null;

  const resolved = instruction.replace(PLACEHOLDER_REGEX, (_match, placeholder: string) => {
    const result = resolveSinglePlaceholder(placeholder, capabilities);

    if (result === null) {
      hasUnresolved = true;
      return _match; // Keep original for logging
    }

    if (Array.isArray(result)) {
      // Iterate pattern — collect results and join
      iterateResults = result;
      return result.join('`, `');
    }

    return result;
  });

  // If we have iterate results, expand into separate lines
  if (iterateResults && iterateResults.length > 0) {
    // If there's only one result, return the instruction as-is
    if (iterateResults.length === 1) {
      return resolved;
    }

    // Multiple results — create a multi-line instruction
    return resolved;
  }

  // If a non-passthrough placeholder couldn't be resolved, skip the step
  if (hasUnresolved) {
    // Check if ALL placeholders were unresolved (skip) vs mixed (partial resolve)
    const remaining = resolved.match(PLACEHOLDER_REGEX);
    if (remaining) {
      // Filter out known passthrough placeholders
      const unresolved = remaining.filter((m) => {
        const inner = m.slice(1, -1);
        const parts = inner.split('.');
        return !(parts[0] === 'type' || parts[0] === 'scope' || parts[0] === 'description');
      });
      if (unresolved.length > 0) return null;
    }
  }

  return resolved;
}

// ---------------------------------------------------------------------------
// Template evaluation
// ---------------------------------------------------------------------------

/**
 * Check if a template's activation conditions are met.
 */
function shouldActivate(
  template: AgentTemplate,
  capabilities: DetectedCapability[],
): boolean {
  // All requiredCapabilities must match
  for (const req of template.requiredCapabilities) {
    if (!hasCapability(capabilities, req)) {
      return false;
    }
  }

  // At least one requiredAny must match (if specified)
  if (template.requiredAny && template.requiredAny.length > 0) {
    const anyMatch = template.requiredAny.some((req) =>
      hasCapability(capabilities, req),
    );
    if (!anyMatch) return false;
  }

  // If no requirements at all, always activate (e.g., /commit)
  return true;
}

/**
 * Render a template into a markdown command file.
 */
function renderTemplate(
  template: AgentTemplate,
  capabilities: DetectedCapability[],
): CommandFile | null {
  // Resolve steps
  const resolvedSteps: string[] = [];

  for (const step of template.steps) {
    // Check conditional
    if (step.ifCapability && !hasCapability(capabilities, step.ifCapability)) {
      continue;
    }

    const resolved = resolveInstruction(step.instruction, capabilities);
    if (resolved !== null) {
      resolvedSteps.push(resolved);
    }
  }

  // Need at least one step
  if (resolvedSteps.length === 0) return null;

  // Build markdown
  const lines: string[] = [];

  lines.push(`# /${template.commandName}`);
  lines.push('');
  lines.push(template.description);
  lines.push('');

  if (template.hasArguments && template.argumentDescription) {
    lines.push('## Arguments');
    lines.push(`- \`$ARGUMENTS\` — ${template.argumentDescription}`);
    lines.push('');
  }

  lines.push('## Steps');
  for (let i = 0; i < resolvedSteps.length; i++) {
    const step = resolvedSteps[i];
    // If step already has sub-items (contains \n), indent properly
    if (step.includes('\n')) {
      lines.push(`${i + 1}. ${step}`);
    } else {
      lines.push(`${i + 1}. ${step}`);
    }
  }
  lines.push('');

  if (template.constraints.length > 0) {
    lines.push('## Constraints');
    for (const c of template.constraints) {
      lines.push(`- ${c}`);
    }
    lines.push('');
  }

  return {
    filename: `${template.commandName}.md`,
    content: lines.join('\n'),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Infer which agent commands should be generated based on detected capabilities.
 *
 * @returns Array of command files ready to be written to .claude/commands/.
 */
export function inferAgents(
  capabilities: DetectedCapability[],
  catalog: AgentTemplate[] = AGENT_CATALOG,
): CommandFile[] {
  const commands: CommandFile[] = [];
  const usedNames = new Set<string>();

  // Sort by priority descending so higher-priority templates win conflicts
  const sorted = [...catalog].sort((a, b) => b.priority - a.priority);

  for (const template of sorted) {
    if (!shouldActivate(template, capabilities)) continue;

    // Deduplicate by command name
    if (usedNames.has(template.commandName)) continue;

    const file = renderTemplate(template, capabilities);
    if (file) {
      commands.push(file);
      usedNames.add(template.commandName);
    }
  }

  return commands;
}
