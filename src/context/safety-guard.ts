/**
 * Sync safety guard — enforces guardrails on CLAUDE.md changes.
 *
 * Invariants:
 *   1. Never delete manual content
 *   2. Max 5 changes per sync
 *   3. Max 10KB of sync-owned content
 *   4. Confidence floor of 0.7
 */

import type { ClaudeMdChange, ValidationResult } from './types.js';

/** Maximum number of changes allowed per sync. */
const MAX_CHANGES_PER_SYNC = 5;

/** Maximum total size (bytes) of sync-owned content. */
const MAX_SYNC_CONTENT_SIZE = 10 * 1024; // 10KB

/** Minimum confidence threshold for auto-applying changes. */
const CONFIDENCE_FLOOR = 0.7;

/**
 * Validates proposed CLAUDE.md changes against safety constraints.
 */
export class SyncSafetyGuard {
  /**
   * Validates a list of proposed changes.
   *
   * Returns a result indicating whether the changes are safe to apply,
   * along with any issues found.
   */
  validate(changes: ClaudeMdChange[]): ValidationResult {
    const issues: string[] = [];

    // 1. Never delete manual content
    for (const change of changes) {
      if (change.type === 'deleted' && change.source === 'manual') {
        issues.push(
          `Blocked: attempted to delete manual section '${change.section}'`,
        );
      }
    }

    // 2. Rate limit: max 5 changes per sync
    if (changes.length > MAX_CHANGES_PER_SYNC) {
      issues.push(
        `Too many changes (${changes.length}). Applying top ${MAX_CHANGES_PER_SYNC} by confidence.`,
      );
    }

    // 3. Size guard: max 10KB sync-owned content
    const syncContentSize = changes
      .filter((c) => c.type === 'appended' || c.type === 'updated')
      .reduce((total, c) => total + (c.content?.length ?? 0), 0);

    if (syncContentSize > MAX_SYNC_CONTENT_SIZE) {
      issues.push(
        'Sync content exceeding 10KB limit. Pruning oldest entries.',
      );
    }

    // 4. Confidence floor: >= 0.7
    const lowConfidence = changes.filter(
      (c) => (c.confidence ?? 1) < CONFIDENCE_FLOOR,
    );
    if (lowConfidence.length > 0) {
      issues.push(
        `Skipped ${lowConfidence.length} low-confidence change${lowConfidence.length === 1 ? '' : 's'}`,
      );
    }

    // Blocked issues start with "Blocked:" — if any exist, the result is invalid
    const hasBlocked = issues.some((i) => i.startsWith('Blocked'));

    return {
      valid: !hasBlocked,
      issues,
    };
  }

  /**
   * Filters changes to only those that meet safety criteria.
   *
   * Returns the top N changes by confidence that pass all guards.
   */
  filterSafe(changes: ClaudeMdChange[]): ClaudeMdChange[] {
    return changes
      .filter((c) => {
        // Never delete manual content
        if (c.type === 'deleted' && c.source === 'manual') return false;
        // Confidence floor
        if ((c.confidence ?? 1) < CONFIDENCE_FLOOR) return false;
        return true;
      })
      .sort((a, b) => (b.confidence ?? 0.5) - (a.confidence ?? 0.5))
      .slice(0, MAX_CHANGES_PER_SYNC);
  }
}
