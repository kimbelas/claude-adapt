import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';

export interface CacheEntry {
  hash: string;
  signals: Record<string, unknown>;
  timestamp: string;
}

export interface CacheStore {
  version: 1;
  entries: Record<string, CacheEntry>;
}

export class PipelineCache {
  private cache: CacheStore = { version: 1, entries: {} };
  private dirty = false;

  async load(rootPath: string): Promise<void> {
    const cachePath = join(rootPath, '.claude-adapt', 'cache.json');
    try {
      const content = await readFile(cachePath, 'utf-8');
      this.cache = JSON.parse(content);
    } catch {
      this.cache = { version: 1, entries: {} };
    }
  }

  get(filePath: string, hash: string): CacheEntry | undefined {
    const entry = this.cache.entries[filePath];
    if (entry && entry.hash === hash) return entry;
    return undefined;
  }

  set(filePath: string, hash: string, signals: Record<string, unknown>): void {
    this.cache.entries[filePath] = {
      hash,
      signals,
      timestamp: new Date().toISOString(),
    };
    this.dirty = true;
  }

  async save(rootPath: string): Promise<void> {
    if (!this.dirty) return;
    const cachePath = join(rootPath, '.claude-adapt', 'cache.json');
    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(cachePath, JSON.stringify(this.cache, null, 2));
    this.dirty = false;
  }
}
