/**
 * Context pruner — prevents unbounded growth of the context store.
 *
 * Pruning rules:
 *   - Sessions: keep last 50
 *   - Decisions: keep last 100, preserving all high-impact and applied
 *   - Hotspots: remove entries for files that no longer exist
 *   - Gotchas: remove resolved, keep last 30
 *   - Insights: keep active (non-archived), max 20
 *   - Patterns: decay low-confidence patterns not seen in 10 sessions
 */

import { access } from 'node:fs/promises';
import { join } from 'node:path';

import type { ContextStore } from './types.js';

/** Maximum number of sessions to retain. */
const MAX_SESSIONS = 50;

/** Maximum number of decisions to retain. */
const MAX_DECISIONS = 100;

/** Maximum number of non-priority decisions to retain. */
const MAX_NON_PRIORITY_DECISIONS = 50;

/** Maximum number of gotchas to retain. */
const MAX_GOTCHAS = 30;

/** Maximum number of active insights. */
const MAX_INSIGHTS = 20;

/** Number of recent sessions used for pattern decay check. */
const PATTERN_DECAY_WINDOW = 10;

/** Minimum confidence for patterns to survive without recent activity. */
const PATTERN_MIN_CONFIDENCE = 0.5;

/**
 * Prunes the context store to bounded sizes.
 */
export class ContextPruner {
  /**
   * Prunes all collections in the store to their respective limits.
   *
   * @param store    - The context store to prune (mutated in place).
   * @param rootPath - Project root for checking file existence.
   * @returns The pruned store.
   */
  async prune(store: ContextStore, rootPath: string): Promise<ContextStore> {
    // Sessions: keep last 50
    store.sessions = store.sessions.slice(-MAX_SESSIONS);

    // Decisions: keep high-impact/applied + last 50 others, capped at 100
    store.decisions = this.pruneDecisions(store.decisions);

    // Hotspots: remove files that no longer exist
    store.hotspots = await this.pruneHotspots(store.hotspots, rootPath);

    // Gotchas: remove resolved, keep last 30
    store.gotchas = store.gotchas
      .filter((g) => !g.resolved)
      .slice(-MAX_GOTCHAS);

    // Insights: keep non-archived, max 20
    store.insights = store.insights
      .filter((i) => !i.archived)
      .slice(-MAX_INSIGHTS);

    // Patterns: decay low-confidence patterns not seen recently
    store.patterns = this.prunePatterns(store);

    return store;
  }

  // ---------------------------------------------------------------------------
  // Decisions
  // ---------------------------------------------------------------------------

  /**
   * Keeps all high-impact and applied decisions, plus the most recent
   * non-priority decisions, capped at MAX_DECISIONS total.
   */
  private pruneDecisions(
    decisions: ContextStore['decisions'],
  ): ContextStore['decisions'] {
    const priority = decisions.filter(
      (d) => d.impact === 'high' || d.applied,
    );
    const nonPriority = decisions
      .filter((d) => d.impact !== 'high' && !d.applied)
      .slice(-MAX_NON_PRIORITY_DECISIONS);

    return [...priority, ...nonPriority].slice(-MAX_DECISIONS);
  }

  // ---------------------------------------------------------------------------
  // Hotspots
  // ---------------------------------------------------------------------------

  /**
   * Removes hotspot entries for files that no longer exist on disk.
   */
  private async pruneHotspots(
    hotspots: ContextStore['hotspots'],
    rootPath: string,
  ): Promise<ContextStore['hotspots']> {
    const results = await Promise.all(
      hotspots.map(async (h) => {
        try {
          await access(join(rootPath, h.file));
          return h;
        } catch {
          return null;
        }
      }),
    );

    return results.filter((h): h is NonNullable<typeof h> => h !== null);
  }

  // ---------------------------------------------------------------------------
  // Patterns
  // ---------------------------------------------------------------------------

  /**
   * Removes low-confidence patterns that haven't been seen in recent sessions.
   */
  private prunePatterns(store: ContextStore): ContextStore['patterns'] {
    const recentSessionIds = new Set(
      store.sessions.slice(-PATTERN_DECAY_WINDOW).map((s) => s.id),
    );

    return store.patterns.filter((p) => {
      // Keep patterns with sufficient confidence
      if (p.confidence >= PATTERN_MIN_CONFIDENCE) return true;

      // Keep patterns seen in recent sessions
      if (p.sessionIds?.some((id) => recentSessionIds.has(id))) return true;

      // Discard low-confidence stale patterns
      return false;
    });
  }
}
