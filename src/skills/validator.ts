/**
 * Skill validation pipeline.
 *
 * Runs five checks in sequence: schema, compatibility, requirements,
 * conflicts, and hook safety. Each check appends to a shared list of
 * issues so the caller gets a complete picture in one pass.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import semver from 'semver';

import { validateManifest } from './manifest-schema.js';
import type { SkillLock, SkillManifest } from './types.js';

// ---------------------------------------------------------------------------
// Public result type
// ---------------------------------------------------------------------------

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Dangerous shell patterns used in hook safety checks
// ---------------------------------------------------------------------------

const DANGEROUS_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|--recursive\s+--force|-[a-zA-Z]*f[a-zA-Z]*r)\b/, label: 'rm -rf' },
  { pattern: /\brm\s+-rf\s+\/\b/, label: 'rm -rf /' },
  { pattern: /\bdd\s+.*\bof=\/dev\//, label: 'dd to device' },
  { pattern: /\bmkfs\b/, label: 'mkfs' },
  { pattern: /\b:\(\)\s*\{\s*:\|\s*:\s*&\s*\}\s*;\s*:/, label: 'fork bomb' },
  { pattern: />\s*\/dev\/sd[a-z]/, label: 'write to block device' },
  { pattern: /\bcurl\b.*\|\s*\b(bash|sh|zsh)\b/, label: 'curl | bash' },
  { pattern: /\bwget\b.*\|\s*\b(bash|sh|zsh)\b/, label: 'wget | bash' },
  { pattern: /\bchmod\s+(-[a-zA-Z]*R[a-zA-Z]*\s+)?777\s+\//, label: 'chmod 777 /' },
  { pattern: /\beval\s*\(/, label: 'eval()' },
];

// ---------------------------------------------------------------------------
// SkillValidator
// ---------------------------------------------------------------------------

export class SkillValidator {
  private readonly claudeAdaptVersion: string;
  private readonly installedSkills: SkillLock;
  private readonly detectedLanguages: string[];
  private readonly detectedFrameworks: string[];

  constructor(options: {
    claudeAdaptVersion?: string;
    installedSkills?: SkillLock;
    detectedLanguages?: string[];
    detectedFrameworks?: string[];
  } = {}) {
    this.claudeAdaptVersion = options.claudeAdaptVersion ?? '0.1.0';
    this.installedSkills = options.installedSkills ?? { version: 1, skills: {} };
    this.detectedLanguages = options.detectedLanguages ?? [];
    this.detectedFrameworks = options.detectedFrameworks ?? [];
  }

  async validate(manifest: SkillManifest, packagePath: string): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Schema validation
    this.checkSchema(manifest, errors);

    // 2. Compatibility check (semver range on claudeAdaptVersion)
    this.checkCompatibility(manifest, errors);

    // 3. Requirements check (languages, frameworks)
    this.checkRequirements(manifest, warnings);

    // 4. Conflict check vs installed skills
    this.checkConflicts(manifest, errors);

    // 5. Hook safety (no dangerous shell commands)
    await this.checkHookSafety(manifest, packagePath, errors, warnings);

    return { valid: errors.length === 0, errors, warnings };
  }

  // -----------------------------------------------------------------------
  // Step 1 — Schema
  // -----------------------------------------------------------------------

  private checkSchema(manifest: SkillManifest, errors: string[]): void {
    const result = validateManifest(manifest);
    if (!result.valid) {
      for (const e of result.errors) {
        errors.push(`Schema: ${e}`);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Step 2 — Compatibility
  // -----------------------------------------------------------------------

  private checkCompatibility(manifest: SkillManifest, errors: string[]): void {
    if (!manifest.claudeAdaptVersion) return;

    const range = semver.validRange(manifest.claudeAdaptVersion);
    if (!range) {
      errors.push(
        `Compatibility: "${manifest.claudeAdaptVersion}" is not a valid semver range`,
      );
      return;
    }

    if (!semver.satisfies(this.claudeAdaptVersion, range)) {
      errors.push(
        `Compatibility: skill requires claude-adapt ${manifest.claudeAdaptVersion} ` +
        `but current version is ${this.claudeAdaptVersion}`,
      );
    }
  }

  // -----------------------------------------------------------------------
  // Step 3 — Requirements
  // -----------------------------------------------------------------------

  private checkRequirements(manifest: SkillManifest, warnings: string[]): void {
    if (!manifest.requires) return;

    if (manifest.requires.languages && this.detectedLanguages.length > 0) {
      for (const lang of manifest.requires.languages) {
        if (!this.detectedLanguages.includes(lang.toLowerCase())) {
          warnings.push(
            `Requirement: skill requires language "${lang}" which was not detected`,
          );
        }
      }
    }

    if (manifest.requires.frameworks && this.detectedFrameworks.length > 0) {
      for (const fw of manifest.requires.frameworks) {
        if (!this.detectedFrameworks.includes(fw.toLowerCase())) {
          warnings.push(
            `Requirement: skill requires framework "${fw}" which was not detected`,
          );
        }
      }
    }

    if (manifest.requires.skills) {
      for (const dep of manifest.requires.skills) {
        if (!this.installedSkills.skills[dep]) {
          warnings.push(
            `Requirement: skill depends on "${dep}" which is not installed`,
          );
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Step 4 — Conflicts
  // -----------------------------------------------------------------------

  private checkConflicts(manifest: SkillManifest, errors: string[]): void {
    if (!manifest.conflicts) return;

    for (const conflict of manifest.conflicts) {
      if (this.installedSkills.skills[conflict]) {
        errors.push(
          `Conflict: skill "${manifest.name}" conflicts with installed skill "${conflict}"`,
        );
      }
    }
  }

  // -----------------------------------------------------------------------
  // Step 5 — Hook Safety
  // -----------------------------------------------------------------------

  private async checkHookSafety(
    manifest: SkillManifest,
    packagePath: string,
    errors: string[],
    warnings: string[],
  ): Promise<void> {
    if (!manifest.provides.hooks) return;

    for (const hook of manifest.provides.hooks) {
      const filePath = join(packagePath, hook.file);

      let content: string;
      try {
        content = await readFile(filePath, 'utf-8');
      } catch {
        warnings.push(`Hook safety: could not read hook file "${hook.file}"`);
        continue;
      }

      for (const { pattern, label } of DANGEROUS_PATTERNS) {
        if (pattern.test(content)) {
          errors.push(
            `Hook safety: "${hook.file}" contains dangerous pattern: ${label}`,
          );
        }
      }
    }
  }
}
