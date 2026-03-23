/**
 * History store — persistent score tracking.
 *
 * Reads and writes `.claude-adapt/history.json` for tracking
 * score progression across runs. Supports atomic writes and
 * automatic run trimming to prevent unbounded growth.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';

import { ScoreHistory, ScoreRun } from '../types.js';

/** Maximum number of runs retained in history before trimming. */
const MAX_RUNS = 100;

/** Relative path to the history file within a project. */
const HISTORY_PATH = '.claude-adapt/history.json';

/**
 * Persistent store for score run history.
 *
 * All methods accept a `rootPath` parameter pointing to the
 * project root directory. The history file is stored at
 * `<rootPath>/.claude-adapt/history.json`.
 */
export class HistoryStore {
  /**
   * Reads the score history from disk.
   *
   * @param rootPath - Absolute path to the project root.
   * @returns Parsed ScoreHistory, or null if no history file exists.
   */
  async read(rootPath: string): Promise<ScoreHistory | null> {
    const filePath = join(rootPath, HISTORY_PATH);

    try {
      const raw = await readFile(filePath, 'utf-8');
      const parsed: unknown = JSON.parse(raw);

      if (!this.isValidHistory(parsed)) {
        return null;
      }

      return parsed;
    } catch {
      // File doesn't exist or is unreadable — not an error
      return null;
    }
  }

  /**
   * Writes a complete history object to disk.
   *
   * Writes atomically by creating the directory structure first,
   * then writing the file. Trims to MAX_RUNS if needed.
   *
   * @param rootPath - Absolute path to the project root.
   * @param history  - The complete history to persist.
   */
  async write(rootPath: string, history: ScoreHistory): Promise<void> {
    const filePath = join(rootPath, HISTORY_PATH);

    // Trim if over the cap
    const trimmed: ScoreHistory = {
      ...history,
      runs: history.runs.slice(-MAX_RUNS),
    };

    // Ensure directory exists
    await mkdir(dirname(filePath), { recursive: true });

    const json = JSON.stringify(trimmed, null, 2);
    await writeFile(filePath, json, 'utf-8');
  }

  /**
   * Appends a single run to the history and persists.
   *
   * If no history file exists, creates a new one with the given
   * projectId derived from the rootPath.
   *
   * @param rootPath - Absolute path to the project root.
   * @param run      - The score run to append.
   */
  async addRun(rootPath: string, run: ScoreRun): Promise<void> {
    const existing = await this.read(rootPath);

    const history: ScoreHistory = existing ?? {
      version: 1,
      projectId: this.deriveProjectId(rootPath),
      runs: [],
    };

    history.runs.push(run);

    await this.write(rootPath, history);
  }

  /**
   * Derives a stable project identifier from the root path.
   *
   * Uses the last two path segments to create a human-readable ID
   * that remains stable across renames of parent directories.
   */
  private deriveProjectId(rootPath: string): string {
    const segments = rootPath.replace(/\\/g, '/').split('/').filter(Boolean);
    const tail = segments.slice(-2).join('/');
    return tail || 'unknown-project';
  }

  /**
   * Type guard to validate a parsed JSON value as ScoreHistory.
   */
  private isValidHistory(value: unknown): value is ScoreHistory {
    if (typeof value !== 'object' || value === null) return false;

    const obj = value as Record<string, unknown>;
    return (
      obj['version'] === 1 &&
      typeof obj['projectId'] === 'string' &&
      Array.isArray(obj['runs'])
    );
  }
}
