/**
 * Trend detection for score history.
 *
 * Analyzes the last N runs per category using linear regression
 * to detect regressions (declining scores) and improvements
 * (rising scores) over time.
 */

import { AnalyzerCategory, ScoreHistory, Trend } from '../types.js';

/** Result of a simple linear regression. */
export interface RegressionResult {
  slope: number;
  intercept: number;
}

/**
 * Computes a simple linear regression (ordinary least squares) over
 * an array of numeric values.
 *
 * The x-values are assumed to be indices 0, 1, 2, ... n-1.
 *
 * @param values - Ordered numeric values to regress over.
 * @returns Slope and intercept of the best-fit line.
 */
export function linearRegression(values: number[]): RegressionResult {
  const n = values.length;

  if (n === 0) {
    return { slope: 0, intercept: 0 };
  }

  if (n === 1) {
    return { slope: 0, intercept: values[0] };
  }

  // x-values are 0, 1, 2, ... n-1
  // Mean of x = (n - 1) / 2
  // Mean of y = sum(y) / n
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumXX += i * i;
  }

  const denominator = n * sumXX - sumX * sumX;

  if (denominator === 0) {
    return { slope: 0, intercept: sumY / n };
  }

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  return { slope, intercept };
}

/**
 * Detects trends across scoring history.
 *
 * Examines the last 5 runs per category using linear regression.
 * A category is flagged as:
 * - **regression** if slope < -0.5 and at least 3 data points exist
 * - **improvement** if slope > 0.3 and at least 3 data points exist
 *
 * @param history - The full score history for a project.
 * @returns List of detected trends (regressions and improvements).
 */
export function detectTrends(history: ScoreHistory): Trend[] {
  const trends: Trend[] = [];
  const runs = history.runs;

  if (runs.length < 3) {
    return trends;
  }

  // Take the last 5 runs (or fewer if history is short)
  const recent = runs.slice(-5);

  for (const category of Object.values(AnalyzerCategory)) {
    const scores = recent.map((run) => run.categories[category]?.score ?? 0);

    if (scores.length < 3) {
      continue;
    }

    const { slope } = linearRegression(scores);

    if (slope < -0.5) {
      trends.push({
        category,
        type: 'regression',
        message: `${category} declining over last ${recent.length} runs`,
        severity: 'warning',
      });
    }

    if (slope > 0.3) {
      trends.push({
        category,
        type: 'improvement',
        message: `${category} improving — ${recent.length} run streak`,
        severity: 'positive',
      });
    }
  }

  return trends;
}
