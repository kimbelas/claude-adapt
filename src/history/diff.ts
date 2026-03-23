/**
 * Score diff computation between two historical runs.
 *
 * Compares two ScoreRun objects and produces a detailed
 * diff showing changes per category and overall.
 */

import { AnalyzerCategory, ScoreRun } from '../types.js';

/** Per-category diff between two score runs. */
export interface CategoryDiff {
  category: AnalyzerCategory;
  currentScore: number;
  previousScore: number;
  delta: number;
  max: number;
  currentSignalCount: number;
  previousSignalCount: number;
}

/** Complete diff between two score runs. */
export interface ScoreDiff {
  totalCurrent: number;
  totalPrevious: number;
  totalDelta: number;
  categories: CategoryDiff[];
  timestamp: {
    current: string;
    previous: string;
  };
  commitHash: {
    current: string;
    previous: string;
  };
}

/**
 * Computes a detailed diff between two historical score runs.
 *
 * @param current  - The more recent run.
 * @param previous - The older run to compare against.
 * @returns Detailed diff with per-category and total deltas.
 */
export function computeScoreDiff(
  current: ScoreRun,
  previous: ScoreRun,
): ScoreDiff {
  const categories: CategoryDiff[] = [];

  for (const category of Object.values(AnalyzerCategory)) {
    const currentCat = current.categories[category];
    const previousCat = previous.categories[category];

    categories.push({
      category,
      currentScore: currentCat?.score ?? 0,
      previousScore: previousCat?.score ?? 0,
      delta: (currentCat?.score ?? 0) - (previousCat?.score ?? 0),
      max: currentCat?.max ?? previousCat?.max ?? 0,
      currentSignalCount: currentCat?.signalCount ?? 0,
      previousSignalCount: previousCat?.signalCount ?? 0,
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
    commitHash: {
      current: current.commitHash,
      previous: previous.commitHash,
    },
  };
}
