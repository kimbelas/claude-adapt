/**
 * Convention drift detector — flags inconsistency changes.
 *
 * Compares two ConventionSnapshots and detects:
 *   - Naming pattern shifts (dominant pattern changed)
 *   - Naming entropy increases (Shannon entropy rising > 0.3)
 *   - File size drift (P90 growing > 20%)
 */

import type { ConventionDrift, ConventionSnapshot } from './types.js';

interface DominantResult {
  pattern: string;
  ratio: number;
}

/**
 * Detects convention drift between two snapshots.
 */
export class ConventionDriftDetector {
  /**
   * Compares previous and current snapshots and returns any drifts detected.
   */
  detect(
    previous: ConventionSnapshot,
    current: ConventionSnapshot,
  ): ConventionDrift[] {
    const drifts: ConventionDrift[] = [];

    // Skip comparison if previous snapshot is empty
    if (this.isEmptySnapshot(previous)) {
      return drifts;
    }

    // Check naming consistency per scope
    for (const scope of ['files', 'functions', 'classes'] as const) {
      const prevDominant = this.getDominantPattern(previous.naming[scope]);
      const currDominant = this.getDominantPattern(current.naming[scope]);

      // Skip if either side has no data
      if (!prevDominant.pattern || !currDominant.pattern) continue;

      if (prevDominant.pattern !== currDominant.pattern) {
        drifts.push({
          type: 'naming',
          scope,
          from: prevDominant.pattern,
          to: currDominant.pattern,
          severity: currDominant.ratio < 0.7 ? 'warning' : 'info',
          message: `${scope} naming shifting from ${prevDominant.pattern} to ${currDominant.pattern}`,
        });
      }

      // Flag increasing entropy (mixed patterns)
      const prevEntropy = this.shannonEntropy(previous.naming[scope]);
      const currEntropy = this.shannonEntropy(current.naming[scope]);

      if (currEntropy > prevEntropy + 0.3) {
        drifts.push({
          type: 'naming-entropy',
          scope,
          severity: 'warning',
          message: `${scope} naming becoming less consistent (entropy: ${prevEntropy.toFixed(2)} -> ${currEntropy.toFixed(2)})`,
        });
      }
    }

    // File size drift: P90 growing > 20%
    if (
      previous.fileSize.p90 > 0 &&
      current.fileSize.p90 > previous.fileSize.p90 * 1.2
    ) {
      drifts.push({
        type: 'modularity',
        severity: 'warning',
        message: `90th percentile file size growing (${previous.fileSize.p90} -> ${current.fileSize.p90} lines)`,
      });
    }

    // Import ordering drift
    if (
      previous.imports.ordering &&
      current.imports.ordering &&
      previous.imports.ordering !== current.imports.ordering
    ) {
      drifts.push({
        type: 'imports',
        from: previous.imports.ordering,
        to: current.imports.ordering,
        severity: 'info',
        message: `Import ordering changed from "${previous.imports.ordering}" to "${current.imports.ordering}"`,
      });
    }

    return drifts;
  }

  /**
   * Computes Shannon entropy of a frequency distribution.
   *
   * Higher entropy means more disorder / less consistency.
   * A perfectly consistent codebase (one pattern only) has entropy 0.
   */
  shannonEntropy(distribution: Record<string, number>): number {
    const total = Object.values(distribution).reduce((a, b) => a + b, 0);
    if (total === 0) return 0;

    return -Object.values(distribution).reduce((entropy, count) => {
      const p = count / total;
      return p > 0 ? entropy + p * Math.log2(p) : entropy;
    }, 0);
  }

  /**
   * Returns the most common pattern and its proportion.
   */
  private getDominantPattern(
    distribution: Record<string, number>,
  ): DominantResult {
    const total = Object.values(distribution).reduce((a, b) => a + b, 0);
    if (total === 0) return { pattern: '', ratio: 0 };

    let maxCount = 0;
    let maxPattern = '';

    for (const [pattern, count] of Object.entries(distribution)) {
      if (count > maxCount) {
        maxCount = count;
        maxPattern = pattern;
      }
    }

    return {
      pattern: maxPattern,
      ratio: maxCount / total,
    };
  }

  /**
   * Checks if a snapshot has no meaningful data.
   */
  private isEmptySnapshot(snapshot: ConventionSnapshot): boolean {
    const hasNaming =
      Object.keys(snapshot.naming.files).length > 0 ||
      Object.keys(snapshot.naming.functions).length > 0 ||
      Object.keys(snapshot.naming.classes).length > 0;

    return !hasNaming && snapshot.fileSize.p50 === 0;
  }
}
