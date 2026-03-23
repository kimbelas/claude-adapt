/**
 * Effort estimation utilities for recommendations.
 *
 * Maps qualitative effort labels to numeric scores used in
 * the recommendation ranking formula.
 */

/** Effort scale: low=1 (config change), medium=3 (multi-file refactor), high=5 (architectural). */
const EFFORT_SCORES: Record<'low' | 'medium' | 'high', 1 | 3 | 5> = {
  low: 1,
  medium: 3,
  high: 5,
};

/**
 * Converts a qualitative effort label to a numeric score.
 *
 * @param effort - Qualitative effort classification.
 * @returns Numeric effort score (1, 3, or 5).
 */
export function effortToScore(effort: 'low' | 'medium' | 'high'): 1 | 3 | 5 {
  return EFFORT_SCORES[effort];
}
