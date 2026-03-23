import { describe, expect, it } from 'vitest';

import {
  AnalyzerCategory,
  AnalyzerResult,
  Signal,
} from '../../../types.js';
import { CATEGORY_WEIGHTS, ScoringEngine } from '../engine.js';
import { adjustForConfidence } from '../confidence.js';
import { normalizeScore } from '../normalizer.js';
import { compareScores } from '../comparator.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a single signal with the given score and confidence. */
function makeSignal(
  category: AnalyzerCategory,
  id: string,
  score: number,
  confidence: number,
): Signal {
  return {
    id,
    category,
    name: `Test Signal ${id}`,
    value: score,
    unit: 'ratio',
    score,
    confidence,
    evidence: [],
    threshold: { poor: 0, fair: 0.5, good: 1 },
    claudeImpact: 'Test impact description.',
  };
}

/** Creates an AnalyzerResult with uniform score and confidence across N signals. */
function makeResult(
  category: AnalyzerCategory,
  score: number,
  confidence: number,
  signalCount = 1,
): AnalyzerResult {
  const signals: Signal[] = [];
  for (let i = 0; i < signalCount; i++) {
    signals.push(
      makeSignal(category, `${category}.signal.${i}`, score, confidence),
    );
  }
  return { category, signals, duration: 0 };
}

/** Creates a full set of analyzer results for all 8 categories. */
function makeAllResults(
  score: number,
  confidence: number,
): AnalyzerResult[] {
  return Object.values(AnalyzerCategory).map((category) =>
    makeResult(category, score, confidence),
  );
}

// ---------------------------------------------------------------------------
// ScoringEngine tests
// ---------------------------------------------------------------------------

describe('ScoringEngine', () => {
  const engine = new ScoringEngine();

  it('scores perfect signals (all score=1, confidence=1) to total=100', () => {
    const results = makeAllResults(1, 1);
    const scoreResult = engine.score(results);

    expect(scoreResult.total).toBe(100);
  });

  it('scores zero signals (all score=0, confidence=1) to total=0', () => {
    const results = makeAllResults(0, 1);
    const scoreResult = engine.score(results);

    expect(scoreResult.total).toBe(0);
  });

  it('scores confidence=0 signals to neutral (~50)', () => {
    // With confidence=0, adjustedScore = score*0 + 0.5*(1-0) = 0.5
    // regardless of the raw score. 0.5 * 100 weight = 50
    const results = makeAllResults(0, 0);
    const scoreResult = engine.score(results);

    expect(scoreResult.total).toBeCloseTo(50, 5);
  });

  it('applies confidence=0 pull-to-neutral regardless of raw score', () => {
    const resultsHigh = makeAllResults(1, 0);
    const resultHigh = engine.score(resultsHigh);

    const resultsLow = makeAllResults(0, 0);
    const resultLow = engine.score(resultsLow);

    expect(resultHigh.total).toBeCloseTo(50, 5);
    expect(resultLow.total).toBeCloseTo(50, 5);
    expect(resultHigh.total).toBeCloseTo(resultLow.total, 5);
  });

  it('uses correct category weights', () => {
    const expectedWeights: Record<AnalyzerCategory, number> = {
      [AnalyzerCategory.documentation]: 20,
      [AnalyzerCategory.modularity]: 20,
      [AnalyzerCategory.conventions]: 20,
      [AnalyzerCategory.typeSafety]: 12,
      [AnalyzerCategory.testCoverage]: 12,
      [AnalyzerCategory.gitHygiene]: 8,
      [AnalyzerCategory.cicd]: 4,
      [AnalyzerCategory.dependencies]: 4,
    };

    for (const category of Object.values(AnalyzerCategory)) {
      expect(CATEGORY_WEIGHTS[category]).toBe(expectedWeights[category]);
    }

    // Weights must sum to 100
    const totalWeight = Object.values(CATEGORY_WEIGHTS).reduce(
      (sum, w) => sum + w,
      0,
    );
    expect(totalWeight).toBe(100);
  });

  it('reports correct per-category normalized scores', () => {
    const results = makeAllResults(1, 1);
    const scoreResult = engine.score(results);

    for (const category of Object.values(AnalyzerCategory)) {
      const catScore = scoreResult.categories[category];
      expect(catScore.raw).toBe(1);
      expect(catScore.normalized).toBe(catScore.max);
      expect(catScore.max).toBe(CATEGORY_WEIGHTS[category]);
    }
  });

  it('handles a single category with signals and rest empty', () => {
    const results: AnalyzerResult[] = [
      makeResult(AnalyzerCategory.documentation, 1, 1),
    ];
    const scoreResult = engine.score(results);

    expect(scoreResult.total).toBe(20);
    expect(scoreResult.categories[AnalyzerCategory.documentation].normalized).toBe(20);
    expect(scoreResult.categories[AnalyzerCategory.modularity].normalized).toBe(0);
  });

  it('handles partial confidence correctly', () => {
    const results = makeAllResults(1, 0.5);
    const scoreResult = engine.score(results);
    // adjustedScore = 1 * 0.5 + 0.5 * (1 - 0.5) = 0.5 + 0.25 = 0.75
    // 0.75 * 100 = 75
    expect(scoreResult.total).toBeCloseTo(75, 5);
  });

  it('pulls zero raw scores up when confidence is low', () => {
    const results = makeAllResults(0, 0.5);
    const scoreResult = engine.score(results);
    // adjustedScore = 0 * 0.5 + 0.5 * 0.5 = 0.25
    // 0.25 * 100 = 25
    expect(scoreResult.total).toBeCloseTo(25, 5);
  });

  it('collects all signals in the flat signals array', () => {
    const results = [
      makeResult(AnalyzerCategory.documentation, 0.8, 1, 3),
      makeResult(AnalyzerCategory.modularity, 0.6, 1, 2),
    ];
    const scoreResult = engine.score(results);

    expect(scoreResult.signals).toHaveLength(5);
  });

  it('includes timestamp and duration in the result', () => {
    const results = makeAllResults(0.5, 1);
    const scoreResult = engine.score(results);

    expect(scoreResult.timestamp).toBeTruthy();
    expect(typeof scoreResult.timestamp).toBe('string');
    expect(scoreResult.duration).toBeGreaterThanOrEqual(0);
  });

  it('averages multiple signals within a single category', () => {
    const docResult: AnalyzerResult = {
      category: AnalyzerCategory.documentation,
      signals: [
        makeSignal(AnalyzerCategory.documentation, 'doc.a', 1, 1),
        makeSignal(AnalyzerCategory.documentation, 'doc.b', 0, 1),
      ],
      duration: 0,
    };

    const scoreResult = engine.score([docResult]);

    expect(scoreResult.categories[AnalyzerCategory.documentation].raw).toBeCloseTo(0.5, 5);
    expect(scoreResult.categories[AnalyzerCategory.documentation].normalized).toBeCloseTo(10, 5);
  });

  it('generates category summaries', () => {
    const results = makeAllResults(1, 1);
    const scoreResult = engine.score(results);

    for (const category of Object.values(AnalyzerCategory)) {
      expect(typeof scoreResult.categories[category].summary).toBe('string');
      expect(scoreResult.categories[category].summary.length).toBeGreaterThan(0);
    }
  });

  it('handles empty results gracefully', () => {
    const scoreResult = engine.score([]);

    expect(scoreResult.total).toBe(0);
    expect(scoreResult.signals).toHaveLength(0);

    for (const category of Object.values(AnalyzerCategory)) {
      expect(scoreResult.categories[category]).toBeDefined();
      expect(scoreResult.categories[category].raw).toBe(0);
      expect(scoreResult.categories[category].normalized).toBe(0);
    }
  });

  describe('manual calculation verification', () => {
    it('matches hand-calculated score with known signal values', () => {
      const results: AnalyzerResult[] = [
        // Documentation: 2 signals with different scores/confidences
        {
          category: AnalyzerCategory.documentation,
          signals: [
            makeSignal(AnalyzerCategory.documentation, 'doc.readme.quality', 0.8, 1.0),
            makeSignal(AnalyzerCategory.documentation, 'doc.inline.density', 0.6, 0.9),
          ],
          duration: 0,
        },
        // Modularity: 1 signal
        {
          category: AnalyzerCategory.modularity,
          signals: [
            makeSignal(AnalyzerCategory.modularity, 'mod.file.size.p90', 0.5, 0.7),
          ],
          duration: 0,
        },
      ];

      const scoreResult = engine.score(results);

      // Documentation:
      //   signal1: adjustForConfidence(0.8, 1.0) = 0.8
      //   signal2: adjustForConfidence(0.6, 0.9) = 0.6*0.9 + 0.5*0.1 = 0.59
      //   raw = (0.8 + 0.59) / 2 = 0.695
      //   normalized = 0.695 * 20 = 13.9
      const docAdj1 = adjustForConfidence(0.8, 1.0);
      const docAdj2 = adjustForConfidence(0.6, 0.9);
      const docRaw = (docAdj1 + docAdj2) / 2;

      expect(docAdj1).toBeCloseTo(0.8, 10);
      expect(docAdj2).toBeCloseTo(0.59, 10);
      expect(scoreResult.categories[AnalyzerCategory.documentation].raw).toBeCloseTo(docRaw, 5);
      expect(scoreResult.categories[AnalyzerCategory.documentation].normalized).toBeCloseTo(docRaw * 20, 5);

      // Modularity:
      //   signal1: adjustForConfidence(0.5, 0.7) = 0.5*0.7 + 0.5*0.3 = 0.5
      //   raw = 0.5
      //   normalized = 0.5 * 20 = 10
      const modAdj1 = adjustForConfidence(0.5, 0.7);
      const modRaw = modAdj1;

      expect(modAdj1).toBeCloseTo(0.5, 10);
      expect(scoreResult.categories[AnalyzerCategory.modularity].raw).toBeCloseTo(modRaw, 5);
      expect(scoreResult.categories[AnalyzerCategory.modularity].normalized).toBeCloseTo(modRaw * 20, 5);

      // Total = doc + mod (all other categories contribute 0)
      const expectedTotal = docRaw * 20 + modRaw * 20;
      expect(scoreResult.total).toBeCloseTo(expectedTotal, 5);
    });
  });
});

// ---------------------------------------------------------------------------
// adjustForConfidence
// ---------------------------------------------------------------------------

describe('adjustForConfidence', () => {
  it('returns rawScore unchanged when confidence is 1', () => {
    expect(adjustForConfidence(0.8, 1)).toBe(0.8);
    expect(adjustForConfidence(0, 1)).toBe(0);
    expect(adjustForConfidence(1, 1)).toBe(1);
  });

  it('returns 0.5 (neutral) when confidence is 0', () => {
    expect(adjustForConfidence(0, 0)).toBe(0.5);
    expect(adjustForConfidence(0.5, 0)).toBe(0.5);
    expect(adjustForConfidence(1, 0)).toBe(0.5);
  });

  it('interpolates correctly at intermediate confidence', () => {
    // 0.8 * 0.5 + 0.5 * 0.5 = 0.4 + 0.25 = 0.65
    expect(adjustForConfidence(0.8, 0.5)).toBeCloseTo(0.65, 10);
  });

  it('pulls low scores up with medium confidence', () => {
    // 0.2 * 0.6 + 0.5 * 0.4 = 0.12 + 0.20 = 0.32
    expect(adjustForConfidence(0.2, 0.6)).toBeCloseTo(0.32, 10);
  });
});

// ---------------------------------------------------------------------------
// normalizeScore
// ---------------------------------------------------------------------------

describe('normalizeScore', () => {
  describe('higher-is-better (default)', () => {
    it('returns 0 at or below poor threshold', () => {
      expect(normalizeScore(0, { poor: 0.1, good: 0.8 })).toBe(0);
      expect(normalizeScore(0.1, { poor: 0.1, good: 0.8 })).toBe(0);
      expect(normalizeScore(-5, { poor: 0.1, good: 0.8 })).toBe(0);
    });

    it('returns 1 at or above good threshold', () => {
      expect(normalizeScore(0.8, { poor: 0.1, good: 0.8 })).toBe(1);
      expect(normalizeScore(1.0, { poor: 0.1, good: 0.8 })).toBe(1);
    });

    it('interpolates linearly between poor and good', () => {
      expect(normalizeScore(0.45, { poor: 0.1, good: 0.8 })).toBeCloseTo(0.5, 5);
    });
  });

  describe('lower-is-better (inverted)', () => {
    it('returns 0 at or above poor threshold', () => {
      expect(normalizeScore(500, { poor: 500, good: 200 }, true)).toBe(0);
      expect(normalizeScore(600, { poor: 500, good: 200 }, true)).toBe(0);
    });

    it('returns 1 at or below good threshold', () => {
      expect(normalizeScore(200, { poor: 500, good: 200 }, true)).toBe(1);
      expect(normalizeScore(100, { poor: 500, good: 200 }, true)).toBe(1);
    });

    it('interpolates linearly between good and poor', () => {
      expect(normalizeScore(350, { poor: 500, good: 200 }, true)).toBeCloseTo(0.5, 5);
    });
  });
});

// ---------------------------------------------------------------------------
// compareScores
// ---------------------------------------------------------------------------

describe('compareScores', () => {
  it('computes correct deltas between current and previous', () => {
    const scoringEngine = new ScoringEngine();
    const results = makeAllResults(0.8, 1);
    const current = scoringEngine.score(results);

    const previousCategories = {} as Record<
      AnalyzerCategory,
      { score: number; max: number; signalCount: number }
    >;
    for (const cat of Object.values(AnalyzerCategory)) {
      previousCategories[cat] = {
        score: CATEGORY_WEIGHTS[cat] * 0.6,
        max: CATEGORY_WEIGHTS[cat],
        signalCount: 1,
      };
    }

    const previous = {
      timestamp: '2024-01-01T00:00:00.000Z',
      commitHash: 'abc123',
      branch: 'main',
      total: 60,
      categories: previousCategories,
      recommendations: 5,
      duration: 100,
    };

    const delta = compareScores(current, previous);

    expect(delta.totalCurrent).toBeCloseTo(80, 5);
    expect(delta.totalPrevious).toBe(60);
    expect(delta.totalDelta).toBeCloseTo(20, 5);
    expect(delta.categories).toHaveLength(8);
  });

  it('reports zero delta when scores are identical', () => {
    const scoringEngine = new ScoringEngine();
    const results = makeAllResults(0.5, 1);
    const current = scoringEngine.score(results);

    const previousCategories = {} as Record<
      AnalyzerCategory,
      { score: number; max: number; signalCount: number }
    >;
    for (const cat of Object.values(AnalyzerCategory)) {
      previousCategories[cat] = {
        score: current.categories[cat].normalized,
        max: CATEGORY_WEIGHTS[cat],
        signalCount: 1,
      };
    }

    const previous = {
      timestamp: '2024-01-01T00:00:00.000Z',
      commitHash: 'abc123',
      branch: 'main',
      total: current.total,
      categories: previousCategories,
      recommendations: 5,
      duration: 100,
    };

    const delta = compareScores(current, previous);

    expect(delta.totalDelta).toBeCloseTo(0, 5);
    for (const catDelta of delta.categories) {
      expect(catDelta.delta).toBeCloseTo(0, 5);
    }
  });
});
