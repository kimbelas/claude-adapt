/**
 * Score normalization utilities.
 *
 * Maps raw metric values to a 0-1 score using configurable
 * poor/good thresholds with linear interpolation in between.
 */

/**
 * Normalizes a raw measurement value to a 0-1 score.
 *
 * When `inverted` is false (default, higher is better):
 *   - value <= poor  -> 0
 *   - value >= good  -> 1
 *   - between        -> linear interpolation
 *
 * When `inverted` is true (lower is better):
 *   - value >= poor  -> 0
 *   - value <= good  -> 1
 *   - between        -> linear interpolation
 *
 * @param value     - The raw measured value.
 * @param threshold - Poor and good boundaries for interpolation.
 * @param inverted  - If true, lower values produce higher scores.
 * @returns Normalized score clamped to 0-1.
 */
export function normalizeScore(
  value: number,
  threshold: { poor: number; good: number },
  inverted?: boolean,
): number {
  const { poor, good } = threshold;

  if (inverted) {
    // Lower is better (e.g., file size, circular deps)
    if (value >= poor) return 0;
    if (value <= good) return 1;
    return (poor - value) / (poor - good);
  }

  // Higher is better (default)
  if (value <= poor) return 0;
  if (value >= good) return 1;
  return (value - poor) / (good - poor);
}
