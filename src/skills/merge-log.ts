/**
 * Append-only merge log stored at .claude-adapt/merge-log.json.
 *
 * Every skill install/remove is recorded as a MergeTransaction so
 * that rollbacks can be performed deterministically.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { MergeTransaction } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOG_DIR = '.claude-adapt';
const LOG_FILE = 'merge-log.json';

// ---------------------------------------------------------------------------
// Internal shape
// ---------------------------------------------------------------------------

interface MergeLog {
  version: 1;
  transactions: MergeTransaction[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function readMergeLog(rootPath: string): Promise<MergeTransaction[]> {
  const logPath = join(rootPath, LOG_DIR, LOG_FILE);

  try {
    const raw = await readFile(logPath, 'utf-8');
    const parsed = JSON.parse(raw) as MergeLog;

    if (parsed.version !== 1) {
      throw new Error(`Unsupported merge-log version: ${parsed.version}`);
    }

    return parsed.transactions;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function appendTransaction(
  rootPath: string,
  tx: MergeTransaction,
): Promise<void> {
  const dir = join(rootPath, LOG_DIR);
  const logPath = join(dir, LOG_FILE);

  // Ensure directory exists
  await mkdir(dir, { recursive: true });

  // Read existing transactions
  const existing = await readMergeLog(rootPath);
  existing.push(tx);

  const log: MergeLog = {
    version: 1,
    transactions: existing,
  };

  await writeFile(logPath, JSON.stringify(log, null, 2) + '\n', 'utf-8');
}
