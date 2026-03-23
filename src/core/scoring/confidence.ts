/**
 * Confidence adjustment for signal scores.
 *
 * Uncertain signals pull toward neutral (0.5) rather than zero,
 * preventing low-confidence measurements from unfairly tanking
 * or inflating the overall score.
 */

/**
 * Adjusts a raw score based on measurement confidence.
 *
 * Formula: `adjustedScore = rawScore * confidence + 0.5 * (1 - confidence)`
 *
 * At confidence = 1.0 the raw score passes through unchanged.
 * At confidence = 0.0 the result is always 0.5 (neutral).
 *
 * @param rawScore  - Normalized score in 0-1 range.
 * @param confidence - Measurement confidence in 0-1 range.
 * @returns Confidence-adjusted score in 0-1 range.
 */
export function adjustForConfidence(
  rawScore: number,
  confidence: number,
): number {
  return rawScore * confidence + 0.5 * (1 - confidence);
}
