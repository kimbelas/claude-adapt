/**
 * Score comparison utilities.
 *
 * Computes deltas between a current score result and a previous
 * historical run, enabling trend reporting and progress tracking.
 */

import {
  AnalyzerCategory,
  ScoreResult,
  ScoreRun,
} from '../../types.js';

/** Per-category delta between two scoring runs. */
export interface CategoryDelta {
  category: AnalyzerCategory;
  current: number;
  previous: number;
  delta: number;
  currentMax: number;
}

/** Full delta between two scoring runs. */
export interface ScoreDelta {
  totalCurrent: number;
  totalPrevious: number;
  totalDelta: number;
  categories: CategoryDelta[];
  timestamp: {
    current: string;
    previous: string;
  };
}

/**
 * Compares a current ScoreResult against a previous ScoreRun from history.
 *
 * @param current  - The freshly computed score result.
 * @param previous - A historical run to compare against.
 * @returns Per-category and total deltas.
 */
export function compareScores(
  current: ScoreResult,
  previous: ScoreRun,
): ScoreDelta {
  const categories: CategoryDelta[] = [];

  for (const category of Object.values(AnalyzerCategory)) {
    const currentCat = current.categories[category];
    const previousCat = previous.categories[category];

    const currentScore = currentCat?.normalized ?? 0;
    const previousScore = previousCat?.score ?? 0;

    categories.push({
      category,
      current: currentScore,
      previous: previousScore,
      delta: currentScore - previousScore,
      currentMax: currentCat?.max ?? 0,
    });
  }

  return {
    totalCurrent: current.total,
    totalPrevious: previous.total,
    totalDelta: current.total - previous.total,
    categories,
    timestamp: {
      current: current.timestamp,
      previous: previous.timestamp,
    },
  };
}
