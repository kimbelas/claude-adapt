/**
 * Hotspot tracker — identifies frequently-edited files.
 *
 * Tracks file edit frequency across sessions, classifies risk,
 * and applies decay for files not touched recently.
 *
 * Risk thresholds:
 *   - >= 10 edits: high
 *   - >= 5 edits:  medium
 *   - < 5 edits:   low
 *
 * Decay: files not touched in the last 10 sessions drop to low risk.
 */

import type { Hotspot, SessionData } from './types.js';

/**
 * Tracks and classifies file edit hotspots across sessions.
 */
export class HotspotTracker {
  /**
   * Updates the hotspot list with changes from a new session.
   *
   * @param existing   - Current hotspot array from the context store.
   * @param session    - The session data containing the git diff.
   * @returns Updated hotspot array (mutates and returns `existing`).
   */
  update(existing: Hotspot[], session: SessionData): Hotspot[] {
    const touchedFiles = new Set([
      ...session.gitDiff.modifiedFiles,
      ...session.gitDiff.addedFiles,
    ]);

    const now = new Date().toISOString();

    // Update or create hotspot entries for each touched file
    for (const file of touchedFiles) {
      const hotspot = existing.find((h) => h.file === file);

      if (hotspot) {
        hotspot.editCount++;
        hotspot.lastEdited = now;
        if (!hotspot.sessions.includes(session.sessionId)) {
          hotspot.sessions.push(session.sessionId);
        }
      } else {
        existing.push({
          file,
          editCount: 1,
          lastEdited: now,
          sessions: [session.sessionId],
          risk: 'low',
        });
      }
    }

    // Classify risk based on edit count
    for (const hotspot of existing) {
      if (hotspot.editCount >= 10) {
        hotspot.risk = 'high';
        hotspot.note = `Edited ${hotspot.editCount} times — consider refactoring`;
      } else if (hotspot.editCount >= 5) {
        hotspot.risk = 'medium';
        hotspot.note = `Frequently modified — Claude should be cautious`;
      }
    }

    // Decay: reduce risk for files not touched in the last 10 sessions
    this.applyDecay(existing);

    return existing;
  }

  /**
   * Applies decay to hotspots whose sessions do not overlap with
   * the 10 most recent distinct session IDs.
   */
  private applyDecay(hotspots: Hotspot[]): void {
    // Collect all session IDs in chronological order (latest last)
    const allSessionIds: string[] = [];
    for (const h of hotspots) {
      for (const sid of h.sessions) {
        if (!allSessionIds.includes(sid)) {
          allSessionIds.push(sid);
        }
      }
    }

    const recentSessions = new Set(allSessionIds.slice(-10));

    for (const hotspot of hotspots) {
      const recentEdits = hotspot.sessions.filter((s) =>
        recentSessions.has(s),
      ).length;

      if (recentEdits === 0 && hotspot.risk !== 'low') {
        hotspot.risk = 'low';
        hotspot.note = undefined;
      }
    }
  }
}
