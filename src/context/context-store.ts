/**
 * Context store — persistent knowledge base for sync.
 *
 * Reads and writes `.claude-adapt/context.json` with atomic writes.
 * Creates a default empty store if the file is missing.
 */

import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

import type { ContextStore, ConventionSnapshot } from './types.js';

/** Relative path to the context file within a project. */
const CONTEXT_PATH = '.claude-adapt/context.json';

/**
 * Creates a default empty convention snapshot.
 */
function emptyConventionSnapshot(): ConventionSnapshot {
  return {
    timestamp: new Date().toISOString(),
    naming: { files: {}, functions: {}, classes: {} },
    imports: { style: {}, ordering: '' },
    fileSize: { p50: 0, p90: 0, max: 0 },
  };
}

/**
 * Creates a default empty context store for a project.
 */
function createDefaultStore(projectId: string): ContextStore {
  return {
    version: 1,
    projectId,
    lastSync: '',
    lastSessionHash: '',
    decisions: [],
    patterns: [],
    hotspots: [],
    gotchas: [],
    conventions: emptyConventionSnapshot(),
    sessions: [],
    insights: [],
  };
}

/**
 * Persistent context store for the sync pipeline.
 *
 * All methods accept a `rootPath` parameter pointing to the
 * project root directory. The context file is stored at
 * `<rootPath>/.claude-adapt/context.json`.
 */
export class ContextStoreManager {
  /**
   * Reads the context store from disk.
   *
   * @returns The parsed ContextStore, or a new default store if none exists.
   */
  async read(rootPath: string): Promise<ContextStore> {
    const filePath = join(rootPath, CONTEXT_PATH);

    try {
      const raw = await readFile(filePath, 'utf-8');
      const parsed: unknown = JSON.parse(raw);

      if (!this.isValidStore(parsed)) {
        return createDefaultStore(this.deriveProjectId(rootPath));
      }

      return parsed;
    } catch {
      return createDefaultStore(this.deriveProjectId(rootPath));
    }
  }

  /**
   * Writes the context store to disk atomically.
   *
   * Writes to a temporary file first, then renames to prevent corruption
   * on crash or power loss.
   */
  async write(rootPath: string, store: ContextStore): Promise<void> {
    const filePath = join(rootPath, CONTEXT_PATH);
    const dir = dirname(filePath);
    const tmpPath = join(dir, `context.${randomUUID()}.tmp`);

    await mkdir(dir, { recursive: true });

    const json = JSON.stringify(store, null, 2);
    await writeFile(tmpPath, json, 'utf-8');

    try {
      await rename(tmpPath, filePath);
    } catch {
      // On Windows, rename can fail if the target exists. Fall back to
      // a direct overwrite which is less atomic but still functional.
      await writeFile(filePath, json, 'utf-8');
      // Clean up the temp file if the rename failed
      try {
        const { unlink } = await import('node:fs/promises');
        await unlink(tmpPath);
      } catch {
        // Best-effort cleanup
      }
    }
  }

  /**
   * Resets the context store to an empty default.
   */
  async reset(rootPath: string): Promise<ContextStore> {
    const store = createDefaultStore(this.deriveProjectId(rootPath));
    await this.write(rootPath, store);
    return store;
  }

  /**
   * Derives a stable project identifier from the root path.
   */
  private deriveProjectId(rootPath: string): string {
    const segments = rootPath.replace(/\\/g, '/').split('/').filter(Boolean);
    const tail = segments.slice(-2).join('/');
    return tail || 'unknown-project';
  }

  /**
   * Type guard to validate a parsed JSON value as ContextStore.
   */
  private isValidStore(value: unknown): value is ContextStore {
    if (typeof value !== 'object' || value === null) return false;

    const obj = value as Record<string, unknown>;
    return (
      obj['version'] === 1 &&
      typeof obj['projectId'] === 'string' &&
      typeof obj['lastSync'] === 'string' &&
      Array.isArray(obj['decisions']) &&
      Array.isArray(obj['hotspots']) &&
      Array.isArray(obj['sessions'])
    );
  }
}
