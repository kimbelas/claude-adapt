import { describe, it, expect, beforeEach, vi } from 'vitest';

import { InsightEngine } from '../insight-engine.js';
import type { ContextStore, Insight, Gotcha, Hotspot, SessionSummary } from '../types.js';

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

function makeGotcha(description: string, sessionId: string): Gotcha {
  return {
    id: `gotcha-${description}-${sessionId}`,
    description,
    resolved: false,
    firstSeen: '2025-01-01T00:00:00Z',
    sessionId,
  };
}

function makeHotspot(
  file: string,
  editCount: number,
  risk: 'low' | 'medium' | 'high',
  sessions: string[] = [],
): Hotspot {
  return {
    file,
    editCount,
    lastEdited: '2025-06-01T00:00:00Z',
    sessions,
    risk,
  };
}

function makeSession(id: string, score?: number): SessionSummary {
  return {
    id,
    timestamp: '2025-06-01T00:00:00Z',
    commitCount: 5,
    filesModified: 3,
    dominantActivity: 'feature',
    quickScore: score,
  };
}

describe('InsightEngine', () => {
  let engine: InsightEngine;

  beforeEach(() => {
    engine = new InsightEngine();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-01T12:00:00Z'));
  });

  // ---------------------------------------------------------------------------
  // Recurring error patterns
  // ---------------------------------------------------------------------------

  describe('recurring error patterns', () => {
    it('detects recurring errors when the same gotcha appears 3+ times', () => {
      const store = makeStore({
        gotchas: [
          makeGotcha('TypeScript null assertion error', 's1'),
          makeGotcha('TypeScript null assertion error', 's2'),
          makeGotcha('TypeScript null assertion error', 's3'),
        ],
      });

      const insights = engine.generate(store);
      const recurring = insights.find((i) => i.type === 'quality');

      expect(recurring).toBeDefined();
      expect(recurring!.title).toContain('Recurring error');
      expect(recurring!.actionable).toBe(true);
      expect(recurring!.evidence.length).toBeGreaterThanOrEqual(1);
    });

    it('does not flag errors appearing fewer than 3 times', () => {
      const store = makeStore({
        gotchas: [
          makeGotcha('Import not found', 's1'),
          makeGotcha('Import not found', 's2'),
        ],
      });

      const insights = engine.generate(store);
      const recurring = insights.find(
        (i) => i.type === 'quality' && i.title.includes('Recurring'),
      );

      expect(recurring).toBeUndefined();
    });

    it('clusters gotchas by normalized description (case-insensitive)', () => {
      const store = makeStore({
        gotchas: [
          makeGotcha('Module not found', 's1'),
          makeGotcha('module not found', 's2'),
          makeGotcha('MODULE NOT FOUND', 's3'),
        ],
      });

      const insights = engine.generate(store);
      const recurring = insights.find(
        (i) => i.type === 'quality' && i.title.includes('Recurring'),
      );

      expect(recurring).toBeDefined();
    });

    it('handles multiple distinct recurring error clusters', () => {
      const store = makeStore({
        gotchas: [
          makeGotcha('Null reference', 's1'),
          makeGotcha('Null reference', 's2'),
          makeGotcha('Null reference', 's3'),
          makeGotcha('Missing import', 's1'),
          makeGotcha('Missing import', 's2'),
          makeGotcha('Missing import', 's3'),
        ],
      });

      const insights = engine.generate(store);
      const recurringInsights = insights.filter(
        (i) => i.type === 'quality' && i.title.includes('Recurring'),
      );

      expect(recurringInsights).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Productivity bottleneck detection
  // ---------------------------------------------------------------------------

  describe('productivity bottleneck detection', () => {
    it('detects bottlenecks from high-risk hotspots', () => {
      const store = makeStore({
        hotspots: [
          makeHotspot('src/app.ts', 15, 'high', ['s1', 's2', 's3']),
          makeHotspot('src/config.ts', 12, 'high', ['s1', 's2']),
        ],
      });

      const insights = engine.generate(store);
      const bottleneck = insights.find((i) => i.type === 'productivity');

      expect(bottleneck).toBeDefined();
      expect(bottleneck!.title).toContain('bottleneck');
      expect(bottleneck!.evidence).toContain('src/app.ts');
      expect(bottleneck!.evidence).toContain('src/config.ts');
    });

    it('limits top files to 5 in the bottleneck evidence', () => {
      const store = makeStore({
        hotspots: Array.from({ length: 8 }, (_, i) =>
          makeHotspot(`src/file${i}.ts`, 20 - i, 'high', [`s${i}`]),
        ),
      });

      const insights = engine.generate(store);
      const bottleneck = insights.find(
        (i) => i.type === 'productivity' && i.title.includes('bottleneck'),
      );

      expect(bottleneck).toBeDefined();
      expect(bottleneck!.evidence.length).toBeLessThanOrEqual(5);
    });

    it('does not produce bottleneck insight when no hotspots are high-risk', () => {
      const store = makeStore({
        hotspots: [
          makeHotspot('src/a.ts', 3, 'low'),
          makeHotspot('src/b.ts', 6, 'medium'),
        ],
      });

      const insights = engine.generate(store);
      const bottleneck = insights.find(
        (i) => i.type === 'productivity' && i.title.includes('bottleneck'),
      );

      expect(bottleneck).toBeUndefined();
    });

    it('sorts high-risk hotspots by editCount descending', () => {
      const store = makeStore({
        hotspots: [
          makeHotspot('src/low-edit.ts', 11, 'high'),
          makeHotspot('src/high-edit.ts', 25, 'high'),
          makeHotspot('src/mid-edit.ts', 15, 'high'),
        ],
      });

      const insights = engine.generate(store);
      const bottleneck = insights.find(
        (i) => i.type === 'productivity' && i.title.includes('bottleneck'),
      );

      expect(bottleneck).toBeDefined();
      // First in evidence should be the highest edit count
      expect(bottleneck!.evidence[0]).toBe('src/high-edit.ts');
    });

    it('detects frequently edited files in recent sessions (4+ of last 5)', () => {
      const sessions = [
        makeSession('s1'), makeSession('s2'), makeSession('s3'),
        makeSession('s4'), makeSession('s5'),
      ];

      const store = makeStore({
        sessions,
        hotspots: [
          // Edited in 4 of last 5 sessions (not s3)
          makeHotspot('src/frequent.ts', 8, 'medium', ['s1', 's2', 's4', 's5']),
        ],
      });

      const insights = engine.generate(store);
      const frequentEdit = insights.find(
        (i) => i.type === 'productivity' && i.title.includes('src/frequent.ts'),
      );

      expect(frequentEdit).toBeDefined();
      expect(frequentEdit!.title).toContain('4 of last 5');
    });
  });

  // ---------------------------------------------------------------------------
  // Score regression detection
  // ---------------------------------------------------------------------------

  describe('score regression detection', () => {
    it('detects declining scores with negative slope below -1.5', () => {
      const store = makeStore({
        sessions: [
          makeSession('s1', 85),
          makeSession('s2', 80),
          makeSession('s3', 72),
          makeSession('s4', 65),
          makeSession('s5', 55),
        ],
      });

      const insights = engine.generate(store);
      const regression = insights.find((i) => i.type === 'risk');

      expect(regression).toBeDefined();
      expect(regression!.title).toContain('declining');
      expect(regression!.actionable).toBe(true);
    });

    it('does not flag when scores are stable', () => {
      const store = makeStore({
        sessions: [
          makeSession('s1', 80),
          makeSession('s2', 79),
          makeSession('s3', 81),
          makeSession('s4', 80),
          makeSession('s5', 80),
        ],
      });

      const insights = engine.generate(store);
      const regression = insights.find((i) => i.type === 'risk');

      expect(regression).toBeUndefined();
    });

    it('does not flag when scores are increasing', () => {
      const store = makeStore({
        sessions: [
          makeSession('s1', 60),
          makeSession('s2', 65),
          makeSession('s3', 70),
          makeSession('s4', 75),
          makeSession('s5', 80),
        ],
      });

      const insights = engine.generate(store);
      const regression = insights.find((i) => i.type === 'risk');

      expect(regression).toBeUndefined();
    });

    it('requires at least 3 scores to detect regression', () => {
      const store = makeStore({
        sessions: [
          makeSession('s1', 85),
          makeSession('s2', 50),
        ],
      });

      const insights = engine.generate(store);
      const regression = insights.find((i) => i.type === 'risk');

      expect(regression).toBeUndefined();
    });

    it('only uses the last 5 sessions for slope calculation', () => {
      const store = makeStore({
        sessions: [
          // Old sessions with bad scores (should be ignored)
          makeSession('old1', 30),
          makeSession('old2', 25),
          makeSession('old3', 20),
          // Recent 5 sessions with good, stable scores
          makeSession('s1', 80),
          makeSession('s2', 81),
          makeSession('s3', 79),
          makeSession('s4', 80),
          makeSession('s5', 82),
        ],
      });

      const insights = engine.generate(store);
      const regression = insights.find((i) => i.type === 'risk');

      expect(regression).toBeUndefined();
    });

    it('ignores sessions without quickScore', () => {
      const store = makeStore({
        sessions: [
          makeSession('s1', undefined),
          makeSession('s2', 80),
          makeSession('s3', undefined),
          makeSession('s4', 75),
          makeSession('s5', 70),
        ],
      });

      // Only 3 valid scores: 80, 75, 70 — slope ≈ -5
      const insights = engine.generate(store);
      const regression = insights.find((i) => i.type === 'risk');

      expect(regression).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Insight merging
  // ---------------------------------------------------------------------------

  describe('insight merging', () => {
    it('confirms existing insight by updating lastConfirmed', () => {
      // The engine generates IDs via sha256('Null ref').slice(0,8) = 'fec959c7'
      const generatedId = 'insight-recurring-error-fec959c7';

      const existingInsight: Insight = {
        id: generatedId,
        type: 'quality',
        title: 'Recurring error: Null ref',
        description: 'Old description',
        evidence: ['s1'],
        actionable: true,
        firstDetected: '2025-01-01T00:00:00Z',
        lastConfirmed: '2025-01-01T00:00:00Z',
      };

      // Generate same recurring error insight to trigger merge
      const store = makeStore({
        insights: [existingInsight],
        gotchas: [
          makeGotcha('Null ref', 's1'),
          makeGotcha('Null ref', 's2'),
          makeGotcha('Null ref', 's3'),
        ],
      });

      const merged = engine.generate(store);

      // Existing insight should still be there
      const confirmed = merged.find((i) => i.id === generatedId);
      expect(confirmed).toBeDefined();
      // firstDetected should be preserved from original
      expect(confirmed!.firstDetected).toBe('2025-01-01T00:00:00Z');
      // lastConfirmed should be updated to current time
      expect(confirmed!.lastConfirmed).toBe('2025-06-01T12:00:00.000Z');
    });

    it('adds new insight when no matching ID exists', () => {
      const store = makeStore({
        insights: [],
        gotchas: [
          makeGotcha('New error type', 's1'),
          makeGotcha('New error type', 's2'),
          makeGotcha('New error type', 's3'),
        ],
      });

      const insights = engine.generate(store);

      expect(insights.length).toBeGreaterThanOrEqual(1);
      const newInsight = insights.find(
        (i) => i.type === 'quality' && i.title.includes('New error type'),
      );
      expect(newInsight).toBeDefined();
    });

    it('preserves existing insights that are not regenerated', () => {
      const existingInsight: Insight = {
        id: 'insight-custom-xyz',
        type: 'pattern',
        title: 'Custom insight',
        description: 'A manually tracked insight',
        evidence: [],
        actionable: false,
        firstDetected: '2025-01-01T00:00:00Z',
        lastConfirmed: '2025-01-01T00:00:00Z',
      };

      const store = makeStore({
        insights: [existingInsight],
      });

      const merged = engine.generate(store);

      const preserved = merged.find((i) => i.id === 'insight-custom-xyz');
      expect(preserved).toBeDefined();
      expect(preserved!.title).toBe('Custom insight');
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  describe('edge cases', () => {
    it('returns empty array for completely empty store', () => {
      const store = makeStore();
      const insights = engine.generate(store);

      // Should only contain preserved existing insights (none)
      expect(insights).toEqual([]);
    });

    it('handles store with no errors and no hotspots and no scores', () => {
      const store = makeStore({
        sessions: [makeSession('s1'), makeSession('s2')],
      });

      const insights = engine.generate(store);
      expect(insights).toEqual([]);
    });

    it('handles gotchas with empty descriptions', () => {
      const store = makeStore({
        gotchas: [
          makeGotcha('', 's1'),
          makeGotcha('', 's2'),
          makeGotcha('', 's3'),
        ],
      });

      // Should not throw
      const insights = engine.generate(store);
      expect(insights).toBeInstanceOf(Array);
    });
  });
});
