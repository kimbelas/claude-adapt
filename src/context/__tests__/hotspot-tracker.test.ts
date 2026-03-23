import { describe, it, expect, beforeEach, vi } from 'vitest';

import { HotspotTracker } from '../hotspot-tracker.js';
import type { Hotspot, SessionData } from '../types.js';

function makeSession(
  id: string,
  modified: string[] = [],
  added: string[] = [],
): SessionData {
  return {
    sessionId: id,
    startCommit: 'aaa1111',
    endCommit: 'bbb2222',
    gitDiff: {
      modifiedFiles: modified,
      addedFiles: added,
      deletedFiles: [],
      renamedFiles: [],
      totalLinesAdded: 10,
      totalLinesRemoved: 2,
    },
    commits: [],
    estimatedDuration: 30,
    dominantActivity: 'feature',
  };
}

describe('HotspotTracker', () => {
  let tracker: HotspotTracker;

  beforeEach(() => {
    tracker = new HotspotTracker();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-01T12:00:00Z'));
  });

  // ---------------------------------------------------------------------------
  // Basic tracking
  // ---------------------------------------------------------------------------

  describe('file tracking', () => {
    it('creates a new hotspot entry for a newly touched file', () => {
      const hotspots: Hotspot[] = [];
      const session = makeSession('s1', ['src/app.ts']);

      const result = tracker.update(hotspots, session);

      expect(result).toHaveLength(1);
      expect(result[0]!.file).toBe('src/app.ts');
      expect(result[0]!.editCount).toBe(1);
      expect(result[0]!.sessions).toEqual(['s1']);
      expect(result[0]!.risk).toBe('low');
    });

    it('increments editCount for a file already in the hotspot list', () => {
      const hotspots: Hotspot[] = [
        {
          file: 'src/app.ts',
          editCount: 3,
          lastEdited: '2025-05-01T00:00:00Z',
          sessions: ['s0'],
          risk: 'low',
        },
      ];
      const session = makeSession('s1', ['src/app.ts']);

      tracker.update(hotspots, session);

      expect(hotspots[0]!.editCount).toBe(4);
      expect(hotspots[0]!.sessions).toContain('s1');
    });

    it('tracks both modified and added files', () => {
      const hotspots: Hotspot[] = [];
      const session = makeSession('s1', ['src/existing.ts'], ['src/new.ts']);

      tracker.update(hotspots, session);

      expect(hotspots).toHaveLength(2);
      const files = hotspots.map((h) => h.file);
      expect(files).toContain('src/existing.ts');
      expect(files).toContain('src/new.ts');
    });

    it('does not add duplicate session IDs', () => {
      const hotspots: Hotspot[] = [
        {
          file: 'src/app.ts',
          editCount: 1,
          lastEdited: '2025-05-01T00:00:00Z',
          sessions: ['s1'],
          risk: 'low',
        },
      ];
      const session = makeSession('s1', ['src/app.ts']);

      tracker.update(hotspots, session);

      expect(hotspots[0]!.sessions).toEqual(['s1']);
      expect(hotspots[0]!.editCount).toBe(2);
    });

    it('updates lastEdited timestamp on edit', () => {
      const hotspots: Hotspot[] = [
        {
          file: 'src/app.ts',
          editCount: 1,
          lastEdited: '2024-01-01T00:00:00Z',
          sessions: ['old'],
          risk: 'low',
        },
      ];
      const session = makeSession('s1', ['src/app.ts']);

      tracker.update(hotspots, session);

      expect(hotspots[0]!.lastEdited).toBe('2025-06-01T12:00:00.000Z');
    });
  });

  // ---------------------------------------------------------------------------
  // Risk classification
  // ---------------------------------------------------------------------------

  describe('risk classification', () => {
    it('classifies as low when editCount < 5', () => {
      const hotspots: Hotspot[] = [
        {
          file: 'src/app.ts',
          editCount: 3,
          lastEdited: '2025-05-01T00:00:00Z',
          sessions: ['s1', 's2', 's3'],
          risk: 'low',
        },
      ];
      const session = makeSession('s4', ['src/app.ts']);

      tracker.update(hotspots, session);

      // editCount becomes 4, still < 5
      expect(hotspots[0]!.risk).toBe('low');
    });

    it('classifies as medium when editCount reaches 5', () => {
      const hotspots: Hotspot[] = [
        {
          file: 'src/app.ts',
          editCount: 4,
          lastEdited: '2025-05-01T00:00:00Z',
          sessions: ['s1', 's2', 's3', 's4'],
          risk: 'low',
        },
      ];
      const session = makeSession('s5', ['src/app.ts']);

      tracker.update(hotspots, session);

      // editCount becomes 5
      expect(hotspots[0]!.risk).toBe('medium');
      expect(hotspots[0]!.note).toContain('cautious');
    });

    it('classifies as medium when editCount is between 5 and 9', () => {
      const hotspots: Hotspot[] = [
        {
          file: 'src/app.ts',
          editCount: 7,
          lastEdited: '2025-05-01T00:00:00Z',
          sessions: ['s1', 's2', 's3', 's4', 's5', 's6', 's7'],
          risk: 'low',
        },
      ];
      const session = makeSession('s8', ['src/app.ts']);

      tracker.update(hotspots, session);

      // editCount becomes 8
      expect(hotspots[0]!.risk).toBe('medium');
    });

    it('classifies as high when editCount reaches 10', () => {
      const hotspots: Hotspot[] = [
        {
          file: 'src/app.ts',
          editCount: 9,
          lastEdited: '2025-05-01T00:00:00Z',
          sessions: ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9'],
          risk: 'medium',
        },
      ];
      const session = makeSession('s10', ['src/app.ts']);

      tracker.update(hotspots, session);

      // editCount becomes 10
      expect(hotspots[0]!.risk).toBe('high');
      expect(hotspots[0]!.note).toContain('refactoring');
    });

    it('classifies as high when editCount exceeds 10', () => {
      const hotspots: Hotspot[] = [
        {
          file: 'src/config.ts',
          editCount: 14,
          lastEdited: '2025-05-01T00:00:00Z',
          sessions: Array.from({ length: 14 }, (_, i) => `s${i + 1}`),
          risk: 'medium',
        },
      ];
      const session = makeSession('s15', ['src/config.ts']);

      tracker.update(hotspots, session);

      expect(hotspots[0]!.risk).toBe('high');
      expect(hotspots[0]!.editCount).toBe(15);
    });
  });

  // ---------------------------------------------------------------------------
  // Decay
  // ---------------------------------------------------------------------------

  describe('decay', () => {
    it('drops risk to low for files not seen in last 10 sessions', () => {
      // Create hotspots where the file was only edited in old sessions
      const hotspots: Hotspot[] = [
        {
          file: 'src/old-file.ts',
          editCount: 12,
          lastEdited: '2024-01-01T00:00:00Z',
          sessions: ['old-1', 'old-2'],
          risk: 'high',
          note: 'Edited 12 times',
        },
      ];

      // Create 11 newer sessions touching a different file
      // so old-file falls outside the 10-session window
      for (let i = 1; i <= 11; i++) {
        const session = makeSession(`new-${i}`, ['src/other.ts']);
        tracker.update(hotspots, session);
      }

      const oldFileHotspot = hotspots.find((h) => h.file === 'src/old-file.ts');
      expect(oldFileHotspot!.risk).toBe('low');
      expect(oldFileHotspot!.note).toBeUndefined();
    });

    it('preserves risk for files edited within last 10 sessions', () => {
      const hotspots: Hotspot[] = [
        {
          file: 'src/active.ts',
          editCount: 9,
          lastEdited: '2025-05-01T00:00:00Z',
          sessions: ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9'],
          risk: 'medium',
        },
      ];

      // Touch the file again in a recent session
      const session = makeSession('s10', ['src/active.ts']);
      tracker.update(hotspots, session);

      expect(hotspots[0]!.risk).toBe('high'); // 10 edits = high
    });

    it('does not modify files that already have low risk during decay', () => {
      const hotspots: Hotspot[] = [
        {
          file: 'src/low.ts',
          editCount: 1,
          lastEdited: '2024-01-01T00:00:00Z',
          sessions: ['old-1'],
          risk: 'low',
        },
      ];

      // Add enough sessions for decay window
      for (let i = 1; i <= 11; i++) {
        const session = makeSession(`new-${i}`, ['src/other.ts']);
        tracker.update(hotspots, session);
      }

      const lowHotspot = hotspots.find((h) => h.file === 'src/low.ts');
      expect(lowHotspot!.risk).toBe('low');
    });
  });

  // ---------------------------------------------------------------------------
  // Multiple files in one session
  // ---------------------------------------------------------------------------

  describe('multiple files in one session', () => {
    it('tracks all modified and added files in a single update call', () => {
      const hotspots: Hotspot[] = [];
      const session = makeSession(
        's1',
        ['src/a.ts', 'src/b.ts'],
        ['src/c.ts'],
      );

      tracker.update(hotspots, session);

      expect(hotspots).toHaveLength(3);
      expect(hotspots.map((h) => h.file).sort()).toEqual([
        'src/a.ts',
        'src/b.ts',
        'src/c.ts',
      ]);
    });
  });

  // ---------------------------------------------------------------------------
  // Return value
  // ---------------------------------------------------------------------------

  describe('return value', () => {
    it('returns the mutated existing array', () => {
      const hotspots: Hotspot[] = [];
      const session = makeSession('s1', ['src/x.ts']);

      const result = tracker.update(hotspots, session);

      expect(result).toBe(hotspots);
    });
  });
});
