import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ContextPruner } from '../context-pruner.js';
import type {
  ContextStore,
  ArchitecturalDecision,
  Hotspot,
  Gotcha,
  Insight,
  DetectedPattern,
  SessionSummary,
} from '../types.js';

// Mock fs/promises for hotspot pruning (file existence check)
vi.mock('node:fs/promises', () => ({
  access: vi.fn(),
}));

import { access } from 'node:fs/promises';

const mockAccess = vi.mocked(access);

function makeStore(overrides: Partial<ContextStore> = {}): ContextStore {
  return {
    version: 1,
    projectId: 'test/project',
    lastSync: '',
    lastSessionHash: '',
    decisions: [],
    patterns: [],
    hotspots: [],
    gotchas: [],
    conventions: {
      timestamp: new Date().toISOString(),
      naming: { files: {}, functions: {}, classes: {} },
      imports: { style: {}, ordering: '' },
      fileSize: { p50: 0, p90: 0, max: 0 },
    },
    sessions: [],
    insights: [],
    ...overrides,
  };
}

function makeSession(id: string, score?: number): SessionSummary {
  return {
    id,
    timestamp: '2025-06-01T00:00:00Z',
    commitCount: 3,
    filesModified: 5,
    dominantActivity: 'feature',
    quickScore: score,
  };
}

function makeDecision(
  id: string,
  impact: 'low' | 'medium' | 'high' = 'low',
  applied = false,
): ArchitecturalDecision {
  return {
    id,
    timestamp: '2025-06-01T00:00:00Z',
    sessionId: 's1',
    title: `Decision ${id}`,
    description: 'Test decision',
    rationale: 'Test',
    filesAffected: [],
    diffSummary: 'test',
    category: 'architecture',
    impact,
    confidence: 0.8,
    applied,
  };
}

function makeHotspot(file: string): Hotspot {
  return {
    file,
    editCount: 3,
    lastEdited: '2025-06-01T00:00:00Z',
    sessions: ['s1'],
    risk: 'low',
  };
}

function makeGotcha(id: string, resolved: boolean): Gotcha {
  return {
    id,
    description: `Gotcha ${id}`,
    resolved,
    firstSeen: '2025-06-01T00:00:00Z',
    sessionId: 's1',
  };
}

function makeInsight(id: string, archived = false): Insight {
  return {
    id,
    type: 'quality',
    title: `Insight ${id}`,
    description: 'Test insight',
    evidence: [],
    actionable: true,
    firstDetected: '2025-06-01T00:00:00Z',
    lastConfirmed: '2025-06-01T00:00:00Z',
    archived,
  };
}

function makePattern(
  name: string,
  confidence: number,
  sessionIds: string[],
): DetectedPattern {
  return {
    name,
    description: `Pattern ${name}`,
    confidence,
    files: ['src/a.ts'],
    lastSeen: '2025-06-01T00:00:00Z',
    sessionCount: sessionIds.length,
    sessionIds,
  };
}

describe('ContextPruner', () => {
  let pruner: ContextPruner;

  beforeEach(() => {
    pruner = new ContextPruner();
    vi.clearAllMocks();
    // Default: all files exist
    mockAccess.mockResolvedValue(undefined);
  });

  // ---------------------------------------------------------------------------
  // Sessions: keep last 50
  // ---------------------------------------------------------------------------

  describe('session pruning', () => {
    it('keeps at most 50 sessions', async () => {
      const sessions = Array.from({ length: 60 }, (_, i) =>
        makeSession(`s${i}`),
      );
      const store = makeStore({ sessions });

      await pruner.prune(store, '/fake/root');

      expect(store.sessions).toHaveLength(50);
    });

    it('keeps the most recent 50 sessions', async () => {
      const sessions = Array.from({ length: 60 }, (_, i) =>
        makeSession(`s${i}`),
      );
      const store = makeStore({ sessions });

      await pruner.prune(store, '/fake/root');

      expect(store.sessions[0]!.id).toBe('s10');
      expect(store.sessions[49]!.id).toBe('s59');
    });

    it('does not prune when there are fewer than 50 sessions', async () => {
      const sessions = Array.from({ length: 10 }, (_, i) =>
        makeSession(`s${i}`),
      );
      const store = makeStore({ sessions });

      await pruner.prune(store, '/fake/root');

      expect(store.sessions).toHaveLength(10);
    });
  });

  // ---------------------------------------------------------------------------
  // Decisions: keep last 100, prioritize high-impact/applied
  // ---------------------------------------------------------------------------

  describe('decision pruning', () => {
    it('preserves all high-impact decisions', async () => {
      const decisions = [
        ...Array.from({ length: 60 }, (_, i) =>
          makeDecision(`low-${i}`, 'low'),
        ),
        ...Array.from({ length: 10 }, (_, i) =>
          makeDecision(`high-${i}`, 'high'),
        ),
      ];
      const store = makeStore({ decisions });

      await pruner.prune(store, '/fake/root');

      const highDecisions = store.decisions.filter(
        (d) => d.impact === 'high',
      );
      expect(highDecisions).toHaveLength(10);
    });

    it('preserves all applied decisions', async () => {
      const decisions = [
        ...Array.from({ length: 60 }, (_, i) =>
          makeDecision(`unapplied-${i}`, 'low', false),
        ),
        ...Array.from({ length: 5 }, (_, i) =>
          makeDecision(`applied-${i}`, 'low', true),
        ),
      ];
      const store = makeStore({ decisions });

      await pruner.prune(store, '/fake/root');

      const applied = store.decisions.filter((d) => d.applied);
      expect(applied).toHaveLength(5);
    });

    it('caps total decisions at 100', async () => {
      const decisions = Array.from({ length: 120 }, (_, i) =>
        makeDecision(`d-${i}`, 'high', true),
      );
      const store = makeStore({ decisions });

      await pruner.prune(store, '/fake/root');

      expect(store.decisions.length).toBeLessThanOrEqual(100);
    });

    it('keeps last 50 non-priority decisions', async () => {
      const decisions = Array.from({ length: 80 }, (_, i) =>
        makeDecision(`low-${i}`, 'low', false),
      );
      const store = makeStore({ decisions });

      await pruner.prune(store, '/fake/root');

      // Should keep only last 50 non-priority
      const nonPriority = store.decisions.filter(
        (d) => d.impact !== 'high' && !d.applied,
      );
      expect(nonPriority.length).toBeLessThanOrEqual(50);
    });
  });

  // ---------------------------------------------------------------------------
  // Hotspots: remove files that no longer exist
  // ---------------------------------------------------------------------------

  describe('hotspot pruning', () => {
    it('removes hotspots for files that no longer exist', async () => {
      mockAccess
        .mockResolvedValueOnce(undefined)          // exists
        .mockRejectedValueOnce(new Error('ENOENT')) // doesn't exist
        .mockResolvedValueOnce(undefined);          // exists

      const store = makeStore({
        hotspots: [
          makeHotspot('src/exists1.ts'),
          makeHotspot('src/deleted.ts'),
          makeHotspot('src/exists2.ts'),
        ],
      });

      await pruner.prune(store, '/fake/root');

      expect(store.hotspots).toHaveLength(2);
      expect(store.hotspots.map((h) => h.file)).toEqual([
        'src/exists1.ts',
        'src/exists2.ts',
      ]);
    });

    it('keeps all hotspots when all files exist', async () => {
      mockAccess.mockResolvedValue(undefined);

      const store = makeStore({
        hotspots: [
          makeHotspot('src/a.ts'),
          makeHotspot('src/b.ts'),
          makeHotspot('src/c.ts'),
        ],
      });

      await pruner.prune(store, '/fake/root');

      expect(store.hotspots).toHaveLength(3);
    });

    it('removes all hotspots when all files are deleted', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));

      const store = makeStore({
        hotspots: [
          makeHotspot('src/gone1.ts'),
          makeHotspot('src/gone2.ts'),
        ],
      });

      await pruner.prune(store, '/fake/root');

      expect(store.hotspots).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Gotchas: remove resolved, keep last 30
  // ---------------------------------------------------------------------------

  describe('gotcha pruning', () => {
    it('removes resolved gotchas', async () => {
      const store = makeStore({
        gotchas: [
          makeGotcha('g1', false),
          makeGotcha('g2', true),  // resolved
          makeGotcha('g3', false),
          makeGotcha('g4', true),  // resolved
        ],
      });

      await pruner.prune(store, '/fake/root');

      expect(store.gotchas).toHaveLength(2);
      expect(store.gotchas.every((g) => !g.resolved)).toBe(true);
    });

    it('keeps at most 30 unresolved gotchas', async () => {
      const gotchas = Array.from({ length: 40 }, (_, i) =>
        makeGotcha(`g${i}`, false),
      );
      const store = makeStore({ gotchas });

      await pruner.prune(store, '/fake/root');

      expect(store.gotchas).toHaveLength(30);
    });

    it('keeps the most recent 30 after removing resolved', async () => {
      const gotchas = Array.from({ length: 35 }, (_, i) =>
        makeGotcha(`g${i}`, false),
      );
      const store = makeStore({ gotchas });

      await pruner.prune(store, '/fake/root');

      expect(store.gotchas[0]!.id).toBe('g5');
      expect(store.gotchas[29]!.id).toBe('g34');
    });
  });

  // ---------------------------------------------------------------------------
  // Insights: keep active (non-archived), max 20
  // ---------------------------------------------------------------------------

  describe('insight pruning', () => {
    it('removes archived insights', async () => {
      const store = makeStore({
        insights: [
          makeInsight('i1', false),
          makeInsight('i2', true),  // archived
          makeInsight('i3', false),
        ],
      });

      await pruner.prune(store, '/fake/root');

      expect(store.insights).toHaveLength(2);
      expect(store.insights.every((i) => !i.archived)).toBe(true);
    });

    it('keeps at most 20 active insights', async () => {
      const insights = Array.from({ length: 25 }, (_, i) =>
        makeInsight(`i${i}`, false),
      );
      const store = makeStore({ insights });

      await pruner.prune(store, '/fake/root');

      expect(store.insights).toHaveLength(20);
    });

    it('keeps the most recent 20 active insights', async () => {
      const insights = Array.from({ length: 25 }, (_, i) =>
        makeInsight(`i${i}`, false),
      );
      const store = makeStore({ insights });

      await pruner.prune(store, '/fake/root');

      expect(store.insights[0]!.id).toBe('i5');
      expect(store.insights[19]!.id).toBe('i24');
    });
  });

  // ---------------------------------------------------------------------------
  // Patterns: decay low-confidence patterns not seen in 10 sessions
  // ---------------------------------------------------------------------------

  describe('pattern pruning', () => {
    it('keeps high-confidence patterns regardless of recency', async () => {
      const sessions = Array.from({ length: 15 }, (_, i) =>
        makeSession(`s${i}`),
      );
      const store = makeStore({
        sessions,
        patterns: [
          makePattern('high-conf', 0.8, ['s0']), // old session but high confidence
        ],
      });

      await pruner.prune(store, '/fake/root');

      expect(store.patterns).toHaveLength(1);
    });

    it('removes low-confidence patterns not seen in recent 10 sessions', async () => {
      const sessions = Array.from({ length: 15 }, (_, i) =>
        makeSession(`s${i}`),
      );
      const store = makeStore({
        sessions,
        patterns: [
          makePattern('stale-low', 0.3, ['s0', 's1']), // old sessions, low confidence
        ],
      });

      await pruner.prune(store, '/fake/root');

      expect(store.patterns).toHaveLength(0);
    });

    it('keeps low-confidence patterns seen in recent sessions', async () => {
      const sessions = Array.from({ length: 15 }, (_, i) =>
        makeSession(`s${i}`),
      );
      const store = makeStore({
        sessions,
        patterns: [
          makePattern('recent-low', 0.3, ['s14']), // recent session
        ],
      });

      await pruner.prune(store, '/fake/root');

      expect(store.patterns).toHaveLength(1);
    });

    it('uses last 10 sessions for the decay window', async () => {
      const sessions = Array.from({ length: 12 }, (_, i) =>
        makeSession(`s${i}`),
      );
      const store = makeStore({
        sessions,
        patterns: [
          // s2 is the 3rd session (index 2), outside last 10 (s2..s11)
          // Actually s2 IS in the last 10 of 12 sessions (s2..s11)
          makePattern('edge-case', 0.3, ['s2']),
        ],
      });

      await pruner.prune(store, '/fake/root');

      // s2 is in sessions[2], last 10 = sessions[2..11]
      expect(store.patterns).toHaveLength(1);
    });

    it('removes pattern when sessionIds is empty and confidence is low', async () => {
      const sessions = Array.from({ length: 15 }, (_, i) =>
        makeSession(`s${i}`),
      );
      const store = makeStore({
        sessions,
        patterns: [
          makePattern('no-sessions', 0.2, []),
        ],
      });

      await pruner.prune(store, '/fake/root');

      expect(store.patterns).toHaveLength(0);
    });

    it('keeps patterns at exactly the confidence threshold (0.5)', async () => {
      const sessions = Array.from({ length: 15 }, (_, i) =>
        makeSession(`s${i}`),
      );
      const store = makeStore({
        sessions,
        patterns: [
          makePattern('at-threshold', 0.5, ['s0']), // old session but at threshold
        ],
      });

      await pruner.prune(store, '/fake/root');

      expect(store.patterns).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Full prune integration
  // ---------------------------------------------------------------------------

  describe('full prune', () => {
    it('prunes all collections in a single pass', async () => {
      mockAccess
        .mockResolvedValueOnce(undefined)          // exists
        .mockRejectedValueOnce(new Error('ENOENT')); // doesn't exist

      const store = makeStore({
        sessions: Array.from({ length: 55 }, (_, i) =>
          makeSession(`s${i}`),
        ),
        decisions: Array.from({ length: 110 }, (_, i) =>
          makeDecision(`d-${i}`, 'low'),
        ),
        hotspots: [
          makeHotspot('src/exists.ts'),
          makeHotspot('src/deleted.ts'),
        ],
        gotchas: [
          ...Array.from({ length: 5 }, (_, i) =>
            makeGotcha(`resolved-${i}`, true),
          ),
          ...Array.from({ length: 35 }, (_, i) =>
            makeGotcha(`active-${i}`, false),
          ),
        ],
        insights: Array.from({ length: 25 }, (_, i) =>
          makeInsight(`i${i}`, false),
        ),
      });

      const result = await pruner.prune(store, '/fake/root');

      expect(result.sessions.length).toBeLessThanOrEqual(50);
      expect(result.decisions.length).toBeLessThanOrEqual(100);
      expect(result.hotspots).toHaveLength(1);
      expect(result.gotchas.length).toBeLessThanOrEqual(30);
      expect(result.gotchas.every((g) => !g.resolved)).toBe(true);
      expect(result.insights.length).toBeLessThanOrEqual(20);
    });

    it('returns the same store reference (mutates in place)', async () => {
      const store = makeStore();

      const result = await pruner.prune(store, '/fake/root');

      expect(result).toBe(store);
    });
  });
});
