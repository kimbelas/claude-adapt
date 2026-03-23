/**
 * Scoring engine — the weighted multi-signal aggregator.
 *
 * Accepts analyzer results from all 8 categories, computes
 * confidence-adjusted per-signal scores, aggregates into
 * per-category weighted averages, and produces a 0-100 total.
 */

import {
  AnalyzerCategory,
  AnalyzerResult,
  CategoryScore,
  ScoreResult,
  Signal,
} from '../../types.js';
import { adjustForConfidence } from './confidence.js';

/** Maximum weight each category can contribute to the total score. */
export const CATEGORY_WEIGHTS: Record<AnalyzerCategory, number> = {
  [AnalyzerCategory.documentation]: 20,
  [AnalyzerCategory.modularity]: 20,
  [AnalyzerCategory.conventions]: 20,
  [AnalyzerCategory.typeSafety]: 12,
  [AnalyzerCategory.testCoverage]: 12,
  [AnalyzerCategory.gitHygiene]: 8,
  [AnalyzerCategory.cicd]: 4,
  [AnalyzerCategory.dependencies]: 4,
};

/**
 * Generates a one-line human-readable summary for a category result.
 *
 * Identifies the lowest-scoring signal and reports it, or confirms
 * that the category is in good shape.
 */
function generateCategorySummary(
  category: AnalyzerCategory,
  signals: Signal[],
  raw: number,
): string {
  if (signals.length === 0) {
    return `No signals detected for ${category}`;
  }

  if (raw >= 0.9) {
    return `Excellent ${category} — all signals strong`;
  }

  // Find the weakest signal to highlight as the top issue
  let weakest: Signal | undefined;
  let weakestAdjusted = Infinity;

  for (const signal of signals) {
    const adjusted = adjustForConfidence(signal.score, signal.confidence);
    if (adjusted < weakestAdjusted) {
      weakestAdjusted = adjusted;
      weakest = signal;
    }
  }

  if (weakest && weakestAdjusted < 0.5) {
    return `${weakest.name} needs attention (score: ${(weakestAdjusted * 100).toFixed(0)}%)`;
  }

  if (raw >= 0.7) {
    return `Good ${category} — minor improvements possible`;
  }

  return `${category} has room for improvement (${(raw * 100).toFixed(0)}%)`;
}

/**
 * Main scoring engine.
 *
 * Stateless — instantiate once and call `score()` for each analysis run.
 */
export class ScoringEngine {
  /**
   * Computes a full score result from analyzer outputs.
   *
   * @param analyzerResults - Results from all (or a subset of) analyzers.
   * @returns Complete score breakdown with total, per-category, and per-signal data.
   */
  score(analyzerResults: AnalyzerResult[]): ScoreResult {
    const start = Date.now();

    // Build a lookup from category to its analyzer result
    const resultsByCategory = new Map<AnalyzerCategory, AnalyzerResult>();
    for (const result of analyzerResults) {
      resultsByCategory.set(result.category, result);
    }

    const allSignals: Signal[] = [];
    const categories = {} as Record<AnalyzerCategory, CategoryScore>;
    let total = 0;

    // Process every category, even those without analyzer results
    for (const category of Object.values(AnalyzerCategory)) {
      const maxWeight = CATEGORY_WEIGHTS[category];
      const result = resultsByCategory.get(category);
      const signals = result?.signals ?? [];

      allSignals.push(...signals);

      // Compute confidence-adjusted average across all signals in this category
      let raw: number;
      if (signals.length === 0) {
        raw = 0;
      } else {
        let adjustedSum = 0;
        for (const signal of signals) {
          adjustedSum += adjustForConfidence(signal.score, signal.confidence);
        }
        raw = adjustedSum / signals.length;
      }

      // Normalize to the category's weight allocation
      const normalized = raw * maxWeight;

      categories[category] = {
        raw,
        normalized,
        max: maxWeight,
        signals,
        summary: generateCategorySummary(category, signals, raw),
      };

      total += normalized;
    }

    const duration = Date.now() - start;

    return {
      total,
      categories,
      signals: allSignals,
      timestamp: new Date().toISOString(),
      duration,
    };
  }
}
