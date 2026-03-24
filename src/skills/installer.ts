/**
 * Skill installer.
 *
 * Handles the full lifecycle of installing and removing skills:
 * download/locate -> validate -> merge (orchestrator) -> record.
 *
 * Supports both local skill directories and npm package names.
 */

import { execFile } from 'node:child_process';
import { readFile, mkdtemp, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';

import { SkillValidator } from './validator.js';
import { MergeOrchestrator } from './merge-orchestrator.js';
import { readLockfile } from './lockfile.js';
import { validateManifest, asManifest } from './manifest-schema.js';
import type { SkillManifest, SkillLock } from './types.js';
import type { InstallResult, RemoveResult } from './merge-orchestrator.js';

const execFileAsync = promisify(execFile);

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
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check if a string looks like an npm package name rather than a local path.
 *
 * Returns true for:
 * - "claude-skill-typescript"
 * - "@scope/claude-skill-foo"
 *
 * Returns false for:
 * - "./my-skill"
 * - "../skills/foo"
 * - "/absolute/path/to/skill"
 * - "C:\path\to\skill"
 */
function looksLikeNpmPackage(nameOrPath: string): boolean {
  // Starts with `.`, `/`, or contains `\` — it's a path
  if (/^[./]/.test(nameOrPath) || nameOrPath.includes('\\')) {
    return false;
  }
  // Windows absolute paths like C:\...
  if (/^[A-Za-z]:/.test(nameOrPath)) {
    return false;
  }
  return true;
}

/**
 * Download an npm package to a temporary directory and return the
 * extracted skill path.
 */
async function downloadNpmPackage(packageName: string): Promise<{ skillPath: string; cleanupDir: string }> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'claude-adapt-skill-'));

  try {
    // Use `npm pack` to download the package tarball
    await execFileAsync('npm', ['pack', packageName, '--pack-destination', tmpDir], {
      timeout: 30_000,
    });

    // Find the tarball in the tmp directory
    const files = await readdir(tmpDir);
    const tarball = files.find(f => f.endsWith('.tgz'));
    if (!tarball) {
      throw new Error(`npm pack did not produce a tarball for "${packageName}"`);
    }

    // Extract the tarball
    const tarballPath = join(tmpDir, tarball);
    await execFileAsync('tar', ['xzf', tarballPath, '-C', tmpDir], {
      timeout: 15_000,
    });

    // npm pack extracts to a `package/` subdirectory
    const skillPath = join(tmpDir, 'package');

    return { skillPath, cleanupDir: tmpDir };
  } catch (error) {
    // Clean up on failure
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    throw new Error(
      `Failed to download npm package "${packageName}": ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    );
  }
}

// ---------------------------------------------------------------------------
// SkillInstaller
// ---------------------------------------------------------------------------

export class SkillInstaller {
  private readonly orchestrator = new MergeOrchestrator();

  /**
   * Install a skill from a local directory or npm package.
   *
   * Steps:
   * 1. If the source looks like an npm package name, download it first
   * 2. Read and validate the skill manifest
   * 3. Run the validator (schema, compat, requirements, conflicts, safety)
   * 4. Delegate to MergeOrchestrator for atomic merge
   */
  async install(
    skillPathOrPackage: string,
    rootPath: string,
    options: InstallOptions = {},
  ): Promise<SkillInstallResult> {
    let skillPath = skillPathOrPackage;
    let cleanupDir: string | undefined;

    // Step 0: Download from npm if it looks like a package name
    if (looksLikeNpmPackage(skillPathOrPackage)) {
      const downloaded = await downloadNpmPackage(skillPathOrPackage);
      skillPath = downloaded.skillPath;
      cleanupDir = downloaded.cleanupDir;
    }

    try {
      return await this._installFromLocal(skillPath, rootPath, options);
    } finally {
      // Clean up temporary download directory
      if (cleanupDir) {
        await rm(cleanupDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  }

  /**
   * Install a skill from a local directory (internal implementation).
   */
  private async _installFromLocal(
    skillPath: string,
    rootPath: string,
    options: InstallOptions,
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
