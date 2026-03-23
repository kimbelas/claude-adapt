/**
 * Skill installer.
 *
 * Handles the full lifecycle of installing and removing skills:
 * download/locate -> validate -> merge (orchestrator) -> record.
 *
 * Currently works with local skill directories. npm registry
 * integration will be added in a future release.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { SkillValidator } from './validator.js';
import { MergeOrchestrator } from './merge-orchestrator.js';
import { readLockfile } from './lockfile.js';
import { validateManifest, asManifest } from './manifest-schema.js';
import type { SkillManifest, SkillLock } from './types.js';
import type { InstallResult, RemoveResult } from './merge-orchestrator.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InstallOptions {
  /** Skip compatibility and requirement checks. */
  force?: boolean;
  /** Preview changes without writing. */
  dryRun?: boolean;
}

export interface SkillInstallResult extends InstallResult {
  manifest: SkillManifest;
  validationWarnings: string[];
}

// ---------------------------------------------------------------------------
// SkillInstaller
// ---------------------------------------------------------------------------

export class SkillInstaller {
  private readonly orchestrator = new MergeOrchestrator();

  /**
   * Install a skill from a local directory.
   *
   * Steps:
   * 1. Read and validate the skill manifest
   * 2. Run the validator (schema, compat, requirements, conflicts, safety)
   * 3. Delegate to MergeOrchestrator for atomic merge
   */
  async install(
    skillPath: string,
    rootPath: string,
    options: InstallOptions = {},
  ): Promise<SkillInstallResult> {
    // Step 1: Read manifest
    const manifestPath = join(skillPath, 'claude-skill.json');
    let rawManifest: unknown;

    try {
      const content = await readFile(manifestPath, 'utf-8');
      rawManifest = JSON.parse(content);
    } catch (error) {
      throw new Error(
        `Failed to read skill manifest at "${manifestPath}": ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error },
      );
    }

    // Step 2: Validate schema
    const schemaResult = validateManifest(rawManifest);
    if (!schemaResult.valid) {
      throw new Error(
        `Invalid skill manifest:\n${schemaResult.errors.map(e => `  - ${e}`).join('\n')}`,
      );
    }

    const manifest = asManifest(rawManifest);

    // Step 3: Check if already installed
    const lock = await readLockfile(rootPath);
    if (lock.skills[manifest.name]) {
      throw new Error(
        `Skill "${manifest.name}" is already installed (version ${lock.skills[manifest.name].version}). ` +
        `Remove it first with "claude-adapt skills remove ${manifest.name}".`,
      );
    }

    // Step 4: Run full validation
    const validator = new SkillValidator({
      installedSkills: lock,
    });

    const validation = await validator.validate(manifest, skillPath);

    if (!options.force && !validation.valid) {
      throw new Error(
        `Skill validation failed:\n${validation.errors.map(e => `  - ${e}`).join('\n')}`,
      );
    }

    // Step 5: Dry run check
    if (options.dryRun) {
      return {
        success: true,
        operations: [],
        conflicts: [],
        transaction: {
          id: 'dry-run',
          skill: manifest.name,
          timestamp: new Date().toISOString(),
          operations: [],
          rollback: { operations: [] },
        },
        manifest,
        validationWarnings: validation.warnings,
      };
    }

    // Step 6: Run the merge orchestrator
    const result = await this.orchestrator.install(manifest, skillPath, rootPath);

    return {
      ...result,
      manifest,
      validationWarnings: validation.warnings,
    };
  }

  /**
   * Remove a skill by name.
   *
   * Finds all transactions for the skill in the merge log and
   * rolls them back in reverse order.
   */
  async remove(
    skillName: string,
    rootPath: string,
  ): Promise<RemoveResult> {
    // Check if the skill is installed
    const lock = await readLockfile(rootPath);
    if (!lock.skills[skillName]) {
      throw new Error(`Skill "${skillName}" is not installed.`);
    }

    return this.orchestrator.remove(skillName, rootPath);
  }

  /**
   * List all installed skills.
   */
  async list(rootPath: string): Promise<SkillLock> {
    return readLockfile(rootPath);
  }
}
