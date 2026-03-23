/**
 * Read/write .claude-adapt/skills.lock with atomic writes.
 *
 * Uses write-to-temp + rename to prevent partial writes from
 * corrupting the lockfile if the process is interrupted.
 */

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

import type { SkillLock } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOCK_DIR = '.claude-adapt';
const LOCK_FILE = 'skills.lock';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function readLockfile(rootPath: string): Promise<SkillLock> {
  const lockPath = join(rootPath, LOCK_DIR, LOCK_FILE);

  try {
    const raw = await readFile(lockPath, 'utf-8');
    const parsed = JSON.parse(raw) as SkillLock;

    // Forward-compatibility guard: accept only version 1
    if (parsed.version !== 1) {
      throw new Error(`Unsupported lockfile version: ${parsed.version}`);
    }

    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return createEmptyLock();
    }
    throw error;
  }
}

export async function writeLockfile(rootPath: string, lock: SkillLock): Promise<void> {
  const dir = join(rootPath, LOCK_DIR);
  const lockPath = join(dir, LOCK_FILE);

  // Ensure directory exists
  await mkdir(dir, { recursive: true });

  // Atomic write: temp file -> rename
  const tempSuffix = randomBytes(6).toString('hex');
  const tempPath = join(dir, `${LOCK_FILE}.${tempSuffix}.tmp`);

  const content = JSON.stringify(lock, null, 2) + '\n';

  await writeFile(tempPath, content, 'utf-8');

  try {
    await rename(tempPath, lockPath);
  } catch (renameError) {
    // On Windows, rename can fail if the target exists. Fall back to overwrite.
    try {
      await writeFile(lockPath, content, 'utf-8');
    } catch {
      throw renameError;
    }

    // Clean up temp file (best effort)
    try {
      const { unlink } = await import('node:fs/promises');
      await unlink(tempPath);
    } catch {
      // Ignore cleanup failures
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createEmptyLock(): SkillLock {
  return {
    version: 1,
    skills: {},
  };
}
