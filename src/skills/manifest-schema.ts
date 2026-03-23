/**
 * JSON schema validator for claude-skill.json manifests.
 *
 * Performs structural validation without external schema libraries —
 * hand-rolled checks that produce clear, actionable error messages.
 */

import type { SkillManifest } from './types.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function validateManifest(data: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (data === null || data === undefined || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, errors: ['Manifest must be a non-null JSON object'] };
  }

  const manifest = data as Record<string, unknown>;

  // ----- Required top-level string fields ----------------------------------
  requireString(manifest, 'name', errors);
  requireString(manifest, 'displayName', errors);
  requireString(manifest, 'version', errors);
  requireString(manifest, 'description', errors);
  requireString(manifest, 'author', errors);
  requireString(manifest, 'license', errors);
  requireString(manifest, 'claudeAdaptVersion', errors);

  // Validate semver-like format for version
  if (typeof manifest['version'] === 'string' && !/^\d+\.\d+\.\d+/.test(manifest['version'])) {
    errors.push('Field "version" must be a valid semver string (e.g. "1.0.0")');
  }

  // ----- Optional string fields -------------------------------------------
  optionalString(manifest, 'repository', errors);
  optionalString(manifest, 'icon', errors);

  // ----- tags (required string array) --------------------------------------
  requireStringArray(manifest, 'tags', errors);

  // ----- conflicts (optional string array) ---------------------------------
  optionalStringArray(manifest, 'conflicts', errors);

  // ----- requires (optional object) ----------------------------------------
  if (manifest['requires'] !== undefined) {
    if (typeof manifest['requires'] !== 'object' || manifest['requires'] === null || Array.isArray(manifest['requires'])) {
      errors.push('Field "requires" must be an object');
    } else {
      const req = manifest['requires'] as Record<string, unknown>;
      optionalStringArray(req, 'languages', errors, 'requires.languages');
      optionalStringArray(req, 'frameworks', errors, 'requires.frameworks');
      optionalStringArray(req, 'tools', errors, 'requires.tools');
      optionalStringArray(req, 'skills', errors, 'requires.skills');
    }
  }

  // ----- provides (required object) ----------------------------------------
  if (manifest['provides'] === undefined) {
    errors.push('Field "provides" is required');
  } else if (typeof manifest['provides'] !== 'object' || manifest['provides'] === null || Array.isArray(manifest['provides'])) {
    errors.push('Field "provides" must be an object');
  } else {
    const provides = manifest['provides'] as Record<string, unknown>;
    validateProvidesClaudeMd(provides, errors);
    validateProvidesCommands(provides, errors);
    validateProvidesHooks(provides, errors);
    validateProvidesMcp(provides, errors);
    validateProvidesAnalyzers(provides, errors);
  }

  // ----- autoActivate (optional) -------------------------------------------
  if (manifest['autoActivate'] !== undefined) {
    validateAutoActivate(manifest['autoActivate'], errors);
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// provides.claudeMd
// ---------------------------------------------------------------------------

function validateProvidesClaudeMd(provides: Record<string, unknown>, errors: string[]): void {
  if (provides['claudeMd'] === undefined) return;

  if (typeof provides['claudeMd'] !== 'object' || provides['claudeMd'] === null || Array.isArray(provides['claudeMd'])) {
    errors.push('Field "provides.claudeMd" must be an object');
    return;
  }

  const claudeMd = provides['claudeMd'] as Record<string, unknown>;

  if (!Array.isArray(claudeMd['sections'])) {
    errors.push('Field "provides.claudeMd.sections" must be an array');
    return;
  }

  for (let i = 0; i < (claudeMd['sections'] as unknown[]).length; i++) {
    const section = (claudeMd['sections'] as unknown[])[i];
    const prefix = `provides.claudeMd.sections[${i}]`;

    if (typeof section !== 'object' || section === null || Array.isArray(section)) {
      errors.push(`${prefix} must be an object`);
      continue;
    }

    const s = section as Record<string, unknown>;
    requireString(s, 'id', errors, `${prefix}.id`);
    requireString(s, 'title', errors, `${prefix}.title`);
    requireString(s, 'content', errors, `${prefix}.content`);

    if (s['placement'] === undefined) {
      errors.push(`${prefix}.placement is required`);
    } else if (typeof s['placement'] !== 'object' || s['placement'] === null || Array.isArray(s['placement'])) {
      errors.push(`${prefix}.placement must be an object`);
    } else {
      const p = s['placement'] as Record<string, unknown>;
      optionalString(p, 'after', errors, `${prefix}.placement.after`);
      optionalString(p, 'before', errors, `${prefix}.placement.before`);
      optionalString(p, 'section', errors, `${prefix}.placement.section`);
      if (p['position'] !== undefined && p['position'] !== 'top' && p['position'] !== 'bottom') {
        errors.push(`${prefix}.placement.position must be "top" or "bottom"`);
      }
    }
  }

  if (claudeMd['priority'] !== undefined && typeof claudeMd['priority'] !== 'number') {
    errors.push('Field "provides.claudeMd.priority" must be a number');
  }
}

// ---------------------------------------------------------------------------
// provides.commands
// ---------------------------------------------------------------------------

function validateProvidesCommands(provides: Record<string, unknown>, errors: string[]): void {
  if (provides['commands'] === undefined) return;

  if (!Array.isArray(provides['commands'])) {
    errors.push('Field "provides.commands" must be an array');
    return;
  }

  for (let i = 0; i < (provides['commands'] as unknown[]).length; i++) {
    const cmd = (provides['commands'] as unknown[])[i];
    const prefix = `provides.commands[${i}]`;

    if (typeof cmd !== 'object' || cmd === null || Array.isArray(cmd)) {
      errors.push(`${prefix} must be an object`);
      continue;
    }

    const c = cmd as Record<string, unknown>;
    requireString(c, 'name', errors, `${prefix}.name`);
    requireString(c, 'file', errors, `${prefix}.file`);
    requireString(c, 'description', errors, `${prefix}.description`);
    optionalString(c, 'overrides', errors, `${prefix}.overrides`);
  }
}

// ---------------------------------------------------------------------------
// provides.hooks
// ---------------------------------------------------------------------------

function validateProvidesHooks(provides: Record<string, unknown>, errors: string[]): void {
  if (provides['hooks'] === undefined) return;

  if (!Array.isArray(provides['hooks'])) {
    errors.push('Field "provides.hooks" must be an array');
    return;
  }

  const validEvents = new Set([
    'pre-commit', 'post-commit', 'pre-tool-use',
    'post-tool-use', 'pre-session', 'post-session',
  ]);

  const validMergeModes = new Set(['prepend', 'append', 'replace']);

  for (let i = 0; i < (provides['hooks'] as unknown[]).length; i++) {
    const hook = (provides['hooks'] as unknown[])[i];
    const prefix = `provides.hooks[${i}]`;

    if (typeof hook !== 'object' || hook === null || Array.isArray(hook)) {
      errors.push(`${prefix} must be an object`);
      continue;
    }

    const h = hook as Record<string, unknown>;
    requireString(h, 'event', errors, `${prefix}.event`);
    requireString(h, 'file', errors, `${prefix}.file`);

    if (typeof h['event'] === 'string' && !validEvents.has(h['event'])) {
      errors.push(`${prefix}.event must be one of: ${[...validEvents].join(', ')}`);
    }

    if (typeof h['priority'] !== 'number') {
      errors.push(`${prefix}.priority must be a number`);
    }

    requireString(h, 'merge', errors, `${prefix}.merge`);
    if (typeof h['merge'] === 'string' && !validMergeModes.has(h['merge'])) {
      errors.push(`${prefix}.merge must be one of: ${[...validMergeModes].join(', ')}`);
    }
  }
}

// ---------------------------------------------------------------------------
// provides.mcp
// ---------------------------------------------------------------------------

function validateProvidesMcp(provides: Record<string, unknown>, errors: string[]): void {
  if (provides['mcp'] === undefined) return;

  if (!Array.isArray(provides['mcp'])) {
    errors.push('Field "provides.mcp" must be an array');
    return;
  }

  for (let i = 0; i < (provides['mcp'] as unknown[]).length; i++) {
    const mcp = (provides['mcp'] as unknown[])[i];
    const prefix = `provides.mcp[${i}]`;

    if (typeof mcp !== 'object' || mcp === null || Array.isArray(mcp)) {
      errors.push(`${prefix} must be an object`);
      continue;
    }

    const m = mcp as Record<string, unknown>;
    requireString(m, 'name', errors, `${prefix}.name`);
    requireString(m, 'reason', errors, `${prefix}.reason`);

    if (typeof m['optional'] !== 'boolean') {
      errors.push(`${prefix}.optional must be a boolean`);
    }

    if (typeof m['server'] !== 'object' || m['server'] === null || Array.isArray(m['server'])) {
      errors.push(`${prefix}.server must be an object`);
    } else {
      const srv = m['server'] as Record<string, unknown>;
      requireString(srv, 'command', errors, `${prefix}.server.command`);
      if (!Array.isArray(srv['args'])) {
        errors.push(`${prefix}.server.args must be an array`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// provides.analyzers
// ---------------------------------------------------------------------------

function validateProvidesAnalyzers(provides: Record<string, unknown>, errors: string[]): void {
  if (provides['analyzers'] === undefined) return;

  if (!Array.isArray(provides['analyzers'])) {
    errors.push('Field "provides.analyzers" must be an array');
    return;
  }

  for (let i = 0; i < (provides['analyzers'] as unknown[]).length; i++) {
    const analyzer = (provides['analyzers'] as unknown[])[i];
    const prefix = `provides.analyzers[${i}]`;

    if (typeof analyzer !== 'object' || analyzer === null || Array.isArray(analyzer)) {
      errors.push(`${prefix} must be an object`);
      continue;
    }

    const a = analyzer as Record<string, unknown>;
    requireString(a, 'category', errors, `${prefix}.category`);

    if (!Array.isArray(a['signals'])) {
      errors.push(`${prefix}.signals must be an array`);
    } else {
      for (let j = 0; j < (a['signals'] as unknown[]).length; j++) {
        const sig = (a['signals'] as unknown[])[j];
        const sp = `${prefix}.signals[${j}]`;
        if (typeof sig !== 'object' || sig === null || Array.isArray(sig)) {
          errors.push(`${sp} must be an object`);
          continue;
        }
        const s = sig as Record<string, unknown>;
        requireString(s, 'id', errors, `${sp}.id`);
        requireString(s, 'file', errors, `${sp}.file`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// autoActivate
// ---------------------------------------------------------------------------

function validateAutoActivate(value: unknown, errors: string[]): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    errors.push('Field "autoActivate" must be an object');
    return;
  }

  const aa = value as Record<string, unknown>;

  if (!Array.isArray(aa['when'])) {
    errors.push('Field "autoActivate.when" must be an array');
    return;
  }

  const validTypes = new Set(['language', 'framework', 'tool', 'file', 'dependency']);
  const validOperators = new Set(['exists', 'matches', 'version']);

  for (let i = 0; i < (aa['when'] as unknown[]).length; i++) {
    const cond = (aa['when'] as unknown[])[i];
    const prefix = `autoActivate.when[${i}]`;

    if (typeof cond !== 'object' || cond === null || Array.isArray(cond)) {
      errors.push(`${prefix} must be an object`);
      continue;
    }

    const c = cond as Record<string, unknown>;
    requireString(c, 'type', errors, `${prefix}.type`);
    requireString(c, 'value', errors, `${prefix}.value`);

    if (typeof c['type'] === 'string' && !validTypes.has(c['type'])) {
      errors.push(`${prefix}.type must be one of: ${[...validTypes].join(', ')}`);
    }

    if (c['operator'] !== undefined) {
      if (typeof c['operator'] !== 'string' || !validOperators.has(c['operator'])) {
        errors.push(`${prefix}.operator must be one of: ${[...validOperators].join(', ')}`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireString(
  obj: Record<string, unknown>,
  field: string,
  errors: string[],
  label?: string,
): void {
  const key = label ?? field;
  if (obj[field] === undefined) {
    errors.push(`Field "${key}" is required`);
  } else if (typeof obj[field] !== 'string') {
    errors.push(`Field "${key}" must be a string`);
  } else if ((obj[field] as string).trim().length === 0) {
    errors.push(`Field "${key}" must not be empty`);
  }
}

function optionalString(
  obj: Record<string, unknown>,
  field: string,
  errors: string[],
  label?: string,
): void {
  if (obj[field] !== undefined && typeof obj[field] !== 'string') {
    errors.push(`Field "${label ?? field}" must be a string`);
  }
}

function requireStringArray(
  obj: Record<string, unknown>,
  field: string,
  errors: string[],
  label?: string,
): void {
  const key = label ?? field;
  if (!Array.isArray(obj[field])) {
    errors.push(`Field "${key}" must be an array`);
    return;
  }
  for (let i = 0; i < (obj[field] as unknown[]).length; i++) {
    if (typeof (obj[field] as unknown[])[i] !== 'string') {
      errors.push(`${key}[${i}] must be a string`);
    }
  }
}

function optionalStringArray(
  obj: Record<string, unknown>,
  field: string,
  errors: string[],
  label?: string,
): void {
  if (obj[field] === undefined) return;
  requireStringArray(obj, field, errors, label);
}

/**
 * Type guard to narrow validated data to SkillManifest.
 * Only valid after `validateManifest` returns `{ valid: true }`.
 */
export function asManifest(data: unknown): SkillManifest {
  return data as SkillManifest;
}
