/**
 * Session collector — gathers git changes since last sync.
 *
 * Detects new commits, classifies activity type, computes
 * diff statistics, and estimates session duration from
 * commit timestamps.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';

import type { ContextStore, SessionData } from './types.js';

const exec = promisify(execFile);

type DominantActivity = SessionData['dominantActivity'];

/**
 * Collects session data by analyzing git history between
 * the last sync point and the current HEAD.
 */
export class SessionCollector {
  private readonly rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
  }

  /**
   * Collects session data since the last sync.
   *
   * @param store   - Current context store (used to find last sync commit).
   * @param since   - Optional override commit hash to analyze from.
   * @returns Session data, or null if no changes detected.
   */
  async collect(store: ContextStore, since?: string): Promise<SessionData | null> {
    const startCommit = since ?? store.lastSessionHash;
    const endCommit = await this.getHead();

    if (!endCommit) {
      return null;
    }

    // If there is no start commit, use the first commit in the repo
    const effectiveStart = startCommit || await this.getFirstCommit();

    if (!effectiveStart || effectiveStart === endCommit) {
      return null;
    }

    const [gitDiff, commits] = await Promise.all([
      this.getDiff(effectiveStart, endCommit),
      this.getLog(effectiveStart, endCommit),
    ]);

    if (commits.length === 0) {
      return null;
    }

    const sessionId = this.hashRange(effectiveStart, endCommit);

    return {
      sessionId,
      startCommit: effectiveStart,
      endCommit,
      gitDiff,
      commits,
      estimatedDuration: this.estimateDuration(commits),
      dominantActivity: this.classifyActivity(commits),
    };
  }

  // ---------------------------------------------------------------------------
  // Git operations
  // ---------------------------------------------------------------------------

  private async getHead(): Promise<string> {
    try {
      const { stdout } = await exec('git', ['rev-parse', 'HEAD'], {
        cwd: this.rootPath,
      });
      return stdout.trim();
    } catch {
      return '';
    }
  }

  private async getFirstCommit(): Promise<string> {
    try {
      const { stdout } = await exec(
        'git',
        ['rev-list', '--max-parents=0', 'HEAD'],
        { cwd: this.rootPath },
      );
      const lines = stdout.trim().split('\n').filter(Boolean);
      return lines[0] ?? '';
    } catch {
      return '';
    }
  }

  private async getDiff(
    from: string,
    to: string,
  ): Promise<SessionData['gitDiff']> {
    const modifiedFiles: string[] = [];
    const addedFiles: string[] = [];
    const deletedFiles: string[] = [];
    const renamedFiles: { from: string; to: string }[] = [];
    let totalLinesAdded = 0;
    let totalLinesRemoved = 0;

    try {
      const { stdout } = await exec(
        'git',
        ['diff', '--name-status', '--find-renames', `${from}..${to}`],
        { cwd: this.rootPath },
      );

      for (const line of stdout.trim().split('\n').filter(Boolean)) {
        const parts = line.split('\t');
        const status = parts[0] ?? '';

        if (status.startsWith('R')) {
          renamedFiles.push({ from: parts[1] ?? '', to: parts[2] ?? '' });
        } else if (status === 'A') {
          addedFiles.push(parts[1] ?? '');
        } else if (status === 'D') {
          deletedFiles.push(parts[1] ?? '');
        } else if (status === 'M') {
          modifiedFiles.push(parts[1] ?? '');
        }
      }
    } catch {
      // Gracefully handle diff failure
    }

    // Get line counts
    try {
      const { stdout } = await exec(
        'git',
        ['diff', '--numstat', `${from}..${to}`],
        { cwd: this.rootPath },
      );

      for (const line of stdout.trim().split('\n').filter(Boolean)) {
        const [added, removed] = line.split('\t');
        // Binary files show '-' for added/removed
        if (added !== '-' && removed !== '-') {
          totalLinesAdded += parseInt(added ?? '0', 10);
          totalLinesRemoved += parseInt(removed ?? '0', 10);
        }
      }
    } catch {
      // Gracefully handle numstat failure
    }

    return {
      modifiedFiles,
      addedFiles,
      deletedFiles,
      renamedFiles,
      totalLinesAdded,
      totalLinesRemoved,
    };
  }

  private async getLog(
    from: string,
    to: string,
  ): Promise<SessionData['commits']> {
    try {
      const { stdout } = await exec(
        'git',
        [
          'log',
          `${from}..${to}`,
          '--format=%H|%s|%aI',
          '--shortstat',
        ],
        { cwd: this.rootPath },
      );

      const commits: SessionData['commits'] = [];
      const lines = stdout.trim().split('\n').filter(Boolean);

      let current: { hash: string; message: string; timestamp: string } | null = null;

      for (const line of lines) {
        if (line.includes('|')) {
          // This is a commit line
          if (current) {
            commits.push({ ...current, filesChanged: 0 });
          }
          const [hash, message, timestamp] = line.split('|');
          current = {
            hash: hash ?? '',
            message: message ?? '',
            timestamp: timestamp ?? '',
          };
        } else if (current && line.includes('file')) {
          // This is a stat line
          const match = line.match(/(\d+)\s+files?\s+changed/);
          commits.push({
            ...current,
            filesChanged: match ? parseInt(match[1], 10) : 0,
          });
          current = null;
        }
      }

      // Push the last commit if it had no stat line
      if (current) {
        commits.push({ ...current, filesChanged: 0 });
      }

      return commits;
    } catch {
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // Classification
  // ---------------------------------------------------------------------------

  /**
   * Classifies the dominant activity from commit messages.
   *
   * Extracts conventional commit prefixes (feat, fix, refactor, test, docs)
   * and returns the most frequent type, or 'mixed' if no type dominates.
   */
  private classifyActivity(
    commits: SessionData['commits'],
  ): DominantActivity {
    const types = commits.map((c) => this.extractCommitType(c.message));
    const counts = this.countOccurrences(types);

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const top = sorted[0];

    if (!top) return 'mixed';

    const validTypes: DominantActivity[] = [
      'feature',
      'fix',
      'refactor',
      'test',
      'docs',
    ];
    return validTypes.includes(top[0] as DominantActivity)
      ? (top[0] as DominantActivity)
      : 'mixed';
  }

  /**
   * Extracts a commit type from a conventional commit message.
   */
  private extractCommitType(message: string): string {
    const lower = message.toLowerCase().trim();

    if (lower.startsWith('feat') || lower.startsWith('feature')) return 'feature';
    if (lower.startsWith('fix') || lower.startsWith('bugfix')) return 'fix';
    if (lower.startsWith('refactor')) return 'refactor';
    if (lower.startsWith('test')) return 'test';
    if (lower.startsWith('doc') || lower.startsWith('docs')) return 'docs';
    if (lower.startsWith('chore')) return 'mixed';
    if (lower.startsWith('style')) return 'refactor';
    if (lower.startsWith('perf')) return 'refactor';

    return 'mixed';
  }

  // ---------------------------------------------------------------------------
  // Duration estimation
  // ---------------------------------------------------------------------------

  /**
   * Estimates session duration from commit timestamps.
   *
   * Uses the time difference between first and last commit,
   * with a minimum of 5 minutes per commit.
   */
  private estimateDuration(commits: SessionData['commits']): number {
    if (commits.length === 0) return 0;
    if (commits.length === 1) return 5 * 60 * 1000; // 5 minutes default

    const timestamps = commits
      .map((c) => new Date(c.timestamp).getTime())
      .filter((t) => !isNaN(t))
      .sort((a, b) => a - b);

    if (timestamps.length < 2) return commits.length * 5 * 60 * 1000;

    const earliest = timestamps[0]!;
    const latest = timestamps[timestamps.length - 1]!;
    const diff = latest - earliest;

    // Ensure at least 5 minutes per commit
    return Math.max(diff, commits.length * 5 * 60 * 1000);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private hashRange(from: string, to: string): string {
    return createHash('sha256')
      .update(`${from}..${to}`)
      .digest('hex')
      .slice(0, 16);
  }

  private countOccurrences(items: string[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const item of items) {
      counts[item] = (counts[item] ?? 0) + 1;
    }
    return counts;
  }
}
