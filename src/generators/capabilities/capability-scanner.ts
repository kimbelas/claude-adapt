/**
 * Capability scanner.
 *
 * Evaluates all capability rules against a GeneratorContext and
 * returns the set of detected capabilities with confidence scores
 * and evidence.
 */

import type { GeneratorContext } from '../types.js';
import type { CapabilityRule, DetectedCapability } from './types.js';
import { CAPABILITY_RULES } from './capability-rules.js';

// ---------------------------------------------------------------------------
// Dependency reader (shared across ecosystems)
// ---------------------------------------------------------------------------

/**
 * Read all declared dependencies from package.json, composer.json,
 * requirements.txt, Gemfile, go.mod, and Cargo.toml.
 *
 * Returns a Set of dependency names (lowercased for case-insensitive match).
 */
function readDependencies(ctx: GeneratorContext): Set<string> {
  const deps = new Set<string>();

  // package.json
  const packageJson = ctx.fileIndex.read('package.json');
  if (packageJson) {
    try {
      const parsed = JSON.parse(packageJson) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      for (const name of Object.keys(parsed.dependencies ?? {})) deps.add(name);
      for (const name of Object.keys(parsed.devDependencies ?? {})) deps.add(name);
    } catch { /* malformed */ }
  }

  // composer.json
  const composerJson = ctx.fileIndex.read('composer.json');
  if (composerJson) {
    try {
      const parsed = JSON.parse(composerJson) as {
        require?: Record<string, string>;
        'require-dev'?: Record<string, string>;
      };
      for (const name of Object.keys(parsed.require ?? {})) deps.add(name);
      for (const name of Object.keys(parsed['require-dev'] ?? {})) deps.add(name);
    } catch { /* malformed */ }
  }

  // requirements.txt
  const reqTxt = ctx.fileIndex.read('requirements.txt');
  if (reqTxt) {
    for (const line of reqTxt.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) continue;
      const match = trimmed.match(/^([a-zA-Z0-9_-]+)/);
      if (match) deps.add(match[1].toLowerCase());
    }
  }

  // Gemfile
  const gemfile = ctx.fileIndex.read('Gemfile');
  if (gemfile) {
    for (const match of gemfile.matchAll(/gem\s+['"]([^'"]+)['"]/g)) {
      deps.add(match[1]);
    }
  }

  // go.mod
  const gomod = ctx.fileIndex.read('go.mod');
  if (gomod) {
    for (const match of gomod.matchAll(/require\s+(\S+)/g)) {
      deps.add(match[1]);
    }
  }

  // Cargo.toml (dependencies section)
  const cargoToml = ctx.fileIndex.read('Cargo.toml');
  if (cargoToml) {
    // Match [dependencies] section entries like: serde = "1.0"
    const depSection = cargoToml.match(/\[dependencies\]([\s\S]*?)(?:\n\[|$)/);
    if (depSection) {
      for (const match of depSection[1].matchAll(/^(\S+)\s*=/gm)) {
        deps.add(match[1]);
      }
    }
  }

  return deps;
}

// ---------------------------------------------------------------------------
// Script name reader
// ---------------------------------------------------------------------------

/**
 * Read all script names from package.json.
 *
 * Returns a Set of script names (exact, case-sensitive).
 */
function readScriptNames(ctx: GeneratorContext): Set<string> {
  const scripts = new Set<string>();

  const packageJson = ctx.fileIndex.read('package.json');
  if (packageJson) {
    try {
      const parsed = JSON.parse(packageJson) as {
        scripts?: Record<string, string>;
      };
      for (const name of Object.keys(parsed.scripts ?? {})) scripts.add(name);
    } catch { /* malformed */ }
  }

  return scripts;
}

// ---------------------------------------------------------------------------
// Rule evaluator
// ---------------------------------------------------------------------------

interface EvalResult {
  matched: boolean;
  matchCount: number;
  totalCriteria: number;
  evidence: string[];
}

function evaluateRule(
  rule: CapabilityRule,
  ctx: GeneratorContext,
  deps: Set<string>,
  scriptNames: Set<string>,
): EvalResult {
  const criteria = rule.detect;
  let matchCount = 0;
  let totalCriteria = 0;
  const evidence: string[] = [];

  // --- configFiles (exact paths) ---
  if (criteria.configFiles && criteria.configFiles.length > 0) {
    totalCriteria++;
    for (const path of criteria.configFiles) {
      if (ctx.fileIndex.exists(path)) {
        matchCount++;
        evidence.push(path);
        break;
      }
    }
  }

  // --- files (glob patterns) ---
  if (criteria.files && criteria.files.length > 0) {
    totalCriteria++;
    for (const pattern of criteria.files) {
      // If it looks like a glob, use fileIndex.glob; otherwise check exists
      if (pattern.includes('*')) {
        const matches = ctx.fileIndex.glob(pattern);
        if (matches.length > 0) {
          matchCount++;
          evidence.push(matches[0].relativePath);
          break;
        }
      } else {
        if (ctx.fileIndex.exists(pattern)) {
          matchCount++;
          evidence.push(pattern);
          break;
        }
      }
    }
  }

  // --- dependencies ---
  if (criteria.dependencies && criteria.dependencies.length > 0) {
    totalCriteria++;
    for (const dep of criteria.dependencies) {
      if (deps.has(dep)) {
        matchCount++;
        evidence.push(`dependency: ${dep}`);
        break;
      }
    }
  }

  // --- frameworks ---
  if (criteria.frameworks && criteria.frameworks.length > 0) {
    totalCriteria++;
    for (const fw of criteria.frameworks) {
      if (ctx.repoProfile.frameworks.some((f) => f.name === fw)) {
        matchCount++;
        evidence.push(`framework: ${fw}`);
        break;
      }
    }
  }

  // --- languages ---
  if (criteria.languages && criteria.languages.length > 0) {
    totalCriteria++;
    for (const lang of criteria.languages) {
      if (ctx.repoProfile.languages.some((l) => l.name === lang)) {
        matchCount++;
        evidence.push(`language: ${lang}`);
        break;
      }
    }
  }

  // --- tooling ---
  if (criteria.tooling && criteria.tooling.length > 0) {
    totalCriteria++;
    for (const t of criteria.tooling) {
      const toolList = ctx.repoProfile.tooling[t.category];
      if (toolList && toolList.some((name) => name.toLowerCase() === t.name.toLowerCase())) {
        matchCount++;
        evidence.push(`tooling: ${t.name}`);
        break;
      }
    }
  }

  // --- scripts (check package.json scripts field) ---
  if (criteria.scripts && criteria.scripts.length > 0) {
    totalCriteria++;
    for (const name of criteria.scripts) {
      if (scriptNames.has(name)) {
        matchCount++;
        evidence.push(`script: ${name}`);
        break;
      }
    }
  }

  // --- contentPatterns (expensive, only check if other criteria already matched) ---
  if (criteria.contentPatterns && criteria.contentPatterns.length > 0) {
    totalCriteria++;
    for (const cp of criteria.contentPatterns) {
      const content = ctx.fileIndex.read(cp.file);
      if (content && content.includes(cp.pattern)) {
        matchCount++;
        evidence.push(`${cp.file} contains "${cp.pattern}"`);
        break;
      }
    }
  }

  return {
    matched: matchCount > 0,
    matchCount,
    totalCriteria,
    evidence,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scan a project for capabilities using all registered rules.
 *
 * @returns Array of detected capabilities sorted by confidence (highest first).
 */
export function scanCapabilities(
  ctx: GeneratorContext,
  rules: CapabilityRule[] = CAPABILITY_RULES,
): DetectedCapability[] {
  const deps = readDependencies(ctx);
  const scriptNames = readScriptNames(ctx);
  const detected: DetectedCapability[] = [];

  for (const rule of rules) {
    const result = evaluateRule(rule, ctx, deps, scriptNames);

    if (result.matched) {
      detected.push({
        rule,
        confidence: result.totalCriteria > 0 ? result.matchCount / result.totalCriteria : 1,
        evidence: result.evidence,
      });
    }
  }

  // Sort by confidence descending, then by rule ID alphabetically
  detected.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.rule.id.localeCompare(b.rule.id);
  });

  return detected;
}

/**
 * Check whether a specific capability (by ID prefix) was detected.
 * Supports exact match ("db.prisma") and prefix match ("db" matches "db.prisma").
 */
export function hasCapability(
  capabilities: DetectedCapability[],
  idOrPrefix: string,
): boolean {
  return capabilities.some(
    (c) => c.rule.id === idOrPrefix || c.rule.id.startsWith(idOrPrefix + '.'),
  );
}

/**
 * Get the highest-confidence capability matching an ID or prefix.
 */
export function getCapability(
  capabilities: DetectedCapability[],
  idOrPrefix: string,
): DetectedCapability | undefined {
  return capabilities.find(
    (c) => c.rule.id === idOrPrefix || c.rule.id.startsWith(idOrPrefix + '.'),
  );
}

/**
 * Get all capabilities matching a category.
 */
export function getCapabilitiesByCategory(
  capabilities: DetectedCapability[],
  category: string,
): DetectedCapability[] {
  return capabilities.filter((c) => c.rule.category === category);
}
