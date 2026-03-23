/**
 * Recommendation engine.
 *
 * Generates a prioritized list of actionable recommendations by
 * matching score gaps against the recommendation catalog and
 * ranking by ROI (gap * impact / effortScore).
 */

import {
  Recommendation,
  ScoreResult,
  Signal,
} from '../types.js';
import { adjustForConfidence } from '../core/scoring/confidence.js';
import { getTemplate } from './catalog.js';
import { effortToScore } from './effort-estimator.js';

/**
 * Recommendation engine.
 *
 * Stateless — instantiate once and call `generate()` for each score result.
 */
export class RecommendationEngine {
  /**
   * Generates ranked recommendations from a score result.
   *
   * For each signal:
   * 1. Compute the gap: `1 - adjustedScore`
   * 2. Filter: gap > 0.5 and confidence > 0.6
   * 3. Look up the recommendation template from the catalog
   * 4. Rank by `(gap * impact) / effortScore` descending
   *
   * @param scoreResult - The score result to generate recommendations for.
   * @returns Ranked list of recommendations, highest ROI first.
   */
  generate(scoreResult: ScoreResult): Recommendation[] {
    const candidates: Recommendation[] = [];

    for (const signal of scoreResult.signals) {
      const recommendation = this.buildRecommendation(signal);
      if (recommendation) {
        candidates.push(recommendation);
      }
    }

    // Sort by ROI: (gap * impact) / effortScore, descending
    candidates.sort((a, b) => {
      const roiA = (a.gap * a.impact) / a.effortScore;
      const roiB = (b.gap * b.impact) / b.effortScore;
      return roiB - roiA;
    });

    return candidates;
  }

  /**
   * Builds a single recommendation from a signal, if it qualifies.
   *
   * @param signal - The signal to evaluate.
   * @returns A recommendation if the signal qualifies, or null.
   */
  private buildRecommendation(signal: Signal): Recommendation | null {
    const adjustedScore = adjustForConfidence(
      signal.score,
      signal.confidence,
    );
    const gap = 1 - adjustedScore;

    // Only recommend when the gap is meaningful and confidence is sufficient
    if (gap <= 0.5 || signal.confidence <= 0.6) {
      return null;
    }

    const template = getTemplate(signal.id);
    if (!template) {
      return null;
    }

    const effortScore = effortToScore(template.effort);

    return {
      id: `rec.${signal.id}`,
      signal: signal.id,
      title: template.title,
      description: template.description,
      gap,
      effort: template.effort,
      effortScore,
      impact: template.impact,
      evidence: signal.evidence,
      fixTemplate: template.fixTemplate,
    };
  }
}
