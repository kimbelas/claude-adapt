import { describe, it, expect, beforeEach } from 'vitest';

import { ConventionDriftDetector } from '../convention-drift-detector.js';
import type { ConventionSnapshot } from '../types.js';

function makeSnapshot(overrides: Partial<ConventionSnapshot> = {}): ConventionSnapshot {
  return {
    timestamp: new Date().toISOString(),
    naming: {
      files: {},
      functions: {},
      classes: {},
    },
    imports: {
      style: {},
      ordering: '',
    },
    fileSize: {
      p50: 0,
      p90: 0,
      max: 0,
    },
    ...overrides,
  };
}

describe('ConventionDriftDetector', () => {
  let detector: ConventionDriftDetector;

  beforeEach(() => {
    detector = new ConventionDriftDetector();
  });

  // ---------------------------------------------------------------------------
  // No drift
  // ---------------------------------------------------------------------------

  describe('no drift', () => {
    it('returns empty array when snapshots are identical', () => {
      const snapshot = makeSnapshot({
        naming: {
          files: { camelCase: 50 },
          functions: { camelCase: 100 },
          classes: { PascalCase: 30 },
        },
        imports: { style: { esm: 50 }, ordering: 'alphabetical' },
        fileSize: { p50: 80, p90: 200, max: 500 },
      });

      const drifts = detector.detect(snapshot, snapshot);
      expect(drifts).toEqual([]);
    });

    it('returns empty array when previous snapshot is empty', () => {
      const previous = makeSnapshot(); // all empty
      const current = makeSnapshot({
        naming: {
          files: { camelCase: 50 },
          functions: { camelCase: 100 },
          classes: { PascalCase: 30 },
        },
      });

      const drifts = detector.detect(previous, current);
      expect(drifts).toEqual([]);
    });

    it('returns empty array when both snapshots have no naming data', () => {
      const previous = makeSnapshot();
      const current = makeSnapshot();

      const drifts = detector.detect(previous, current);
      expect(drifts).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Naming pattern shift
  // ---------------------------------------------------------------------------

  describe('naming pattern shift detection', () => {
    it('detects when file naming pattern shifts from camelCase to snake_case', () => {
      const previous = makeSnapshot({
        naming: {
          files: { camelCase: 80, snake_case: 20 },
          functions: { camelCase: 100 },
          classes: { PascalCase: 30 },
        },
        fileSize: { p50: 80, p90: 200, max: 500 },
      });

      const current = makeSnapshot({
        naming: {
          files: { camelCase: 30, snake_case: 70 },
          functions: { camelCase: 100 },
          classes: { PascalCase: 30 },
        },
        fileSize: { p50: 80, p90: 200, max: 500 },
      });

      const drifts = detector.detect(previous, current);
      const namingDrift = drifts.find(
        (d) => d.type === 'naming' && d.scope === 'files',
      );

      expect(namingDrift).toBeDefined();
      expect(namingDrift!.from).toBe('camelCase');
      expect(namingDrift!.to).toBe('snake_case');
    });

    it('detects function naming pattern shift', () => {
      const previous = makeSnapshot({
        naming: {
          files: { camelCase: 50 },
          functions: { camelCase: 90, snake_case: 10 },
          classes: { PascalCase: 30 },
        },
        fileSize: { p50: 80, p90: 200, max: 500 },
      });

      const current = makeSnapshot({
        naming: {
          files: { camelCase: 50 },
          functions: { camelCase: 20, snake_case: 80 },
          classes: { PascalCase: 30 },
        },
        fileSize: { p50: 80, p90: 200, max: 500 },
      });

      const drifts = detector.detect(previous, current);
      const fnDrift = drifts.find(
        (d) => d.type === 'naming' && d.scope === 'functions',
      );

      expect(fnDrift).toBeDefined();
      expect(fnDrift!.from).toBe('camelCase');
      expect(fnDrift!.to).toBe('snake_case');
    });

    it('detects class naming pattern shift', () => {
      const previous = makeSnapshot({
        naming: {
          files: { camelCase: 50 },
          functions: { camelCase: 100 },
          classes: { PascalCase: 90, camelCase: 10 },
        },
        fileSize: { p50: 80, p90: 200, max: 500 },
      });

      const current = makeSnapshot({
        naming: {
          files: { camelCase: 50 },
          functions: { camelCase: 100 },
          classes: { PascalCase: 20, camelCase: 80 },
        },
        fileSize: { p50: 80, p90: 200, max: 500 },
      });

      const drifts = detector.detect(previous, current);
      const classDrift = drifts.find(
        (d) => d.type === 'naming' && d.scope === 'classes',
      );

      expect(classDrift).toBeDefined();
      expect(classDrift!.from).toBe('PascalCase');
      expect(classDrift!.to).toBe('camelCase');
    });

    it('sets severity to warning when new dominant ratio is < 0.7', () => {
      const previous = makeSnapshot({
        naming: {
          files: { camelCase: 80, snake_case: 20 },
          functions: {},
          classes: {},
        },
        fileSize: { p50: 80, p90: 200, max: 500 },
      });

      // snake_case dominant but only 60% — below 0.7 threshold
      const current = makeSnapshot({
        naming: {
          files: { camelCase: 40, snake_case: 60 },
          functions: {},
          classes: {},
        },
        fileSize: { p50: 80, p90: 200, max: 500 },
      });

      const drifts = detector.detect(previous, current);
      const namingDrift = drifts.find(
        (d) => d.type === 'naming' && d.scope === 'files',
      );

      expect(namingDrift).toBeDefined();
      expect(namingDrift!.severity).toBe('warning');
    });

    it('sets severity to info when new dominant ratio is >= 0.7', () => {
      const previous = makeSnapshot({
        naming: {
          files: { camelCase: 80, snake_case: 20 },
          functions: {},
          classes: {},
        },
        fileSize: { p50: 80, p90: 200, max: 500 },
      });

      // snake_case dominant and at 80% — above 0.7 threshold
      const current = makeSnapshot({
        naming: {
          files: { camelCase: 20, snake_case: 80 },
          functions: {},
          classes: {},
        },
        fileSize: { p50: 80, p90: 200, max: 500 },
      });

      const drifts = detector.detect(previous, current);
      const namingDrift = drifts.find(
        (d) => d.type === 'naming' && d.scope === 'files',
      );

      expect(namingDrift).toBeDefined();
      expect(namingDrift!.severity).toBe('info');
    });

    it('does not flag drift when dominant pattern stays the same', () => {
      const previous = makeSnapshot({
        naming: {
          files: { camelCase: 80, snake_case: 20 },
          functions: {},
          classes: {},
        },
        fileSize: { p50: 80, p90: 200, max: 500 },
      });

      const current = makeSnapshot({
        naming: {
          files: { camelCase: 70, snake_case: 30 },
          functions: {},
          classes: {},
        },
        fileSize: { p50: 80, p90: 200, max: 500 },
      });

      const drifts = detector.detect(previous, current);
      const namingDrift = drifts.find(
        (d) => d.type === 'naming' && d.scope === 'files',
      );

      expect(namingDrift).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Entropy detection
  // ---------------------------------------------------------------------------

  describe('entropy increase detection', () => {
    it('detects entropy increase greater than 0.3', () => {
      // Previous: very consistent (one dominant pattern)
      const previous = makeSnapshot({
        naming: {
          files: { camelCase: 100 },
          functions: {},
          classes: {},
        },
        fileSize: { p50: 80, p90: 200, max: 500 },
      });

      // Current: more mixed (multiple patterns with entropy > previous + 0.3)
      const current = makeSnapshot({
        naming: {
          files: { camelCase: 40, snake_case: 30, 'kebab-case': 30 },
          functions: {},
          classes: {},
        },
        fileSize: { p50: 80, p90: 200, max: 500 },
      });

      const drifts = detector.detect(previous, current);
      const entropyDrift = drifts.find(
        (d) => d.type === 'naming-entropy' && d.scope === 'files',
      );

      expect(entropyDrift).toBeDefined();
      expect(entropyDrift!.severity).toBe('warning');
      expect(entropyDrift!.message).toContain('entropy');
    });

    it('does not flag entropy when increase is less than 0.3', () => {
      const previous = makeSnapshot({
        naming: {
          files: { camelCase: 80, snake_case: 20 },
          functions: {},
          classes: {},
        },
        fileSize: { p50: 80, p90: 200, max: 500 },
      });

      // Slight increase in mixing, but still close
      const current = makeSnapshot({
        naming: {
          files: { camelCase: 75, snake_case: 25 },
          functions: {},
          classes: {},
        },
        fileSize: { p50: 80, p90: 200, max: 500 },
      });

      const drifts = detector.detect(previous, current);
      const entropyDrift = drifts.find(
        (d) => d.type === 'naming-entropy',
      );

      expect(entropyDrift).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Shannon entropy calculation
  // ---------------------------------------------------------------------------

  describe('shannonEntropy', () => {
    it('returns 0 for a single-pattern distribution', () => {
      const entropy = detector.shannonEntropy({ camelCase: 100 });
      // Shannon formula: -1 * (1 * log2(1)) = -0, which is IEEE -0
      expect(entropy).toBeCloseTo(0, 10);
    });

    it('returns 1 for a perfectly balanced two-pattern distribution', () => {
      const entropy = detector.shannonEntropy({ a: 50, b: 50 });
      expect(entropy).toBeCloseTo(1, 5);
    });

    it('returns 0 for an empty distribution', () => {
      const entropy = detector.shannonEntropy({});
      expect(entropy).toBe(0);
    });

    it('returns higher entropy for more mixed distributions', () => {
      const low = detector.shannonEntropy({ a: 90, b: 10 });
      const high = detector.shannonEntropy({ a: 50, b: 50 });
      expect(high).toBeGreaterThan(low);
    });

    it('handles three-pattern distributions', () => {
      // Perfectly balanced 3-pattern entropy = log2(3) ≈ 1.585
      const entropy = detector.shannonEntropy({ a: 33, b: 33, c: 34 });
      expect(entropy).toBeCloseTo(Math.log2(3), 1);
    });
  });

  // ---------------------------------------------------------------------------
  // File size growth detection
  // ---------------------------------------------------------------------------

  describe('file size growth detection', () => {
    it('detects P90 file size growth exceeding 20%', () => {
      const previous = makeSnapshot({
        naming: {
          files: { camelCase: 50 },
          functions: {},
          classes: {},
        },
        fileSize: { p50: 80, p90: 200, max: 500 },
      });

      const current = makeSnapshot({
        naming: {
          files: { camelCase: 50 },
          functions: {},
          classes: {},
        },
        fileSize: { p50: 90, p90: 260, max: 600 },
      });

      const drifts = detector.detect(previous, current);
      const sizeDrift = drifts.find((d) => d.type === 'modularity');

      expect(sizeDrift).toBeDefined();
      expect(sizeDrift!.severity).toBe('warning');
      expect(sizeDrift!.message).toContain('90th percentile');
    });

    it('does not flag file size growth within 20%', () => {
      const previous = makeSnapshot({
        naming: {
          files: { camelCase: 50 },
          functions: {},
          classes: {},
        },
        fileSize: { p50: 80, p90: 200, max: 500 },
      });

      const current = makeSnapshot({
        naming: {
          files: { camelCase: 50 },
          functions: {},
          classes: {},
        },
        fileSize: { p50: 85, p90: 230, max: 520 },
      });

      const drifts = detector.detect(previous, current);
      const sizeDrift = drifts.find((d) => d.type === 'modularity');

      expect(sizeDrift).toBeUndefined();
    });

    it('does not flag when previous P90 is zero', () => {
      const previous = makeSnapshot({
        naming: {
          files: { camelCase: 50 },
          functions: {},
          classes: {},
        },
        fileSize: { p50: 0, p90: 0, max: 0 },
      });

      const current = makeSnapshot({
        naming: {
          files: { camelCase: 50 },
          functions: {},
          classes: {},
        },
        fileSize: { p50: 80, p90: 200, max: 500 },
      });

      const drifts = detector.detect(previous, current);
      const sizeDrift = drifts.find((d) => d.type === 'modularity');

      expect(sizeDrift).toBeUndefined();
    });

    it('flags exactly at the boundary (p90 * 1.2 + 1)', () => {
      const previous = makeSnapshot({
        naming: {
          files: { camelCase: 50 },
          functions: {},
          classes: {},
        },
        fileSize: { p50: 80, p90: 100, max: 200 },
      });

      // Exactly 121 > 100 * 1.2 = 120 → should flag
      const current = makeSnapshot({
        naming: {
          files: { camelCase: 50 },
          functions: {},
          classes: {},
        },
        fileSize: { p50: 85, p90: 121, max: 250 },
      });

      const drifts = detector.detect(previous, current);
      const sizeDrift = drifts.find((d) => d.type === 'modularity');

      expect(sizeDrift).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Import ordering change
  // ---------------------------------------------------------------------------

  describe('import ordering change detection', () => {
    it('detects import ordering change', () => {
      const previous = makeSnapshot({
        naming: {
          files: { camelCase: 50 },
          functions: {},
          classes: {},
        },
        imports: { style: { esm: 50 }, ordering: 'alphabetical' },
        fileSize: { p50: 80, p90: 200, max: 500 },
      });

      const current = makeSnapshot({
        naming: {
          files: { camelCase: 50 },
          functions: {},
          classes: {},
        },
        imports: { style: { esm: 50 }, ordering: 'grouped' },
        fileSize: { p50: 80, p90: 200, max: 500 },
      });

      const drifts = detector.detect(previous, current);
      const importDrift = drifts.find((d) => d.type === 'imports');

      expect(importDrift).toBeDefined();
      expect(importDrift!.from).toBe('alphabetical');
      expect(importDrift!.to).toBe('grouped');
      expect(importDrift!.severity).toBe('info');
    });

    it('does not flag when import ordering stays the same', () => {
      const previous = makeSnapshot({
        naming: {
          files: { camelCase: 50 },
          functions: {},
          classes: {},
        },
        imports: { style: { esm: 50 }, ordering: 'alphabetical' },
        fileSize: { p50: 80, p90: 200, max: 500 },
      });

      const current = makeSnapshot({
        naming: {
          files: { camelCase: 50 },
          functions: {},
          classes: {},
        },
        imports: { style: { esm: 60 }, ordering: 'alphabetical' },
        fileSize: { p50: 80, p90: 200, max: 500 },
      });

      const drifts = detector.detect(previous, current);
      const importDrift = drifts.find((d) => d.type === 'imports');

      expect(importDrift).toBeUndefined();
    });

    it('does not flag when either ordering is empty', () => {
      const previous = makeSnapshot({
        naming: {
          files: { camelCase: 50 },
          functions: {},
          classes: {},
        },
        imports: { style: {}, ordering: '' },
        fileSize: { p50: 80, p90: 200, max: 500 },
      });

      const current = makeSnapshot({
        naming: {
          files: { camelCase: 50 },
          functions: {},
          classes: {},
        },
        imports: { style: { esm: 50 }, ordering: 'alphabetical' },
        fileSize: { p50: 80, p90: 200, max: 500 },
      });

      const drifts = detector.detect(previous, current);
      const importDrift = drifts.find((d) => d.type === 'imports');

      expect(importDrift).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Multiple drift dimensions
  // ---------------------------------------------------------------------------

  describe('multiple drift dimensions in one comparison', () => {
    it('detects naming shift, entropy increase, and file size growth simultaneously', () => {
      const previous = makeSnapshot({
        naming: {
          files: { camelCase: 100 },
          functions: { camelCase: 100 },
          classes: { PascalCase: 100 },
        },
        imports: { style: { esm: 50 }, ordering: 'alphabetical' },
        fileSize: { p50: 80, p90: 100, max: 200 },
      });

      const current = makeSnapshot({
        naming: {
          // Shift from camelCase to snake_case
          files: { camelCase: 20, snake_case: 50, 'kebab-case': 30 },
          functions: { camelCase: 100 },
          classes: { PascalCase: 100 },
        },
        imports: { style: { esm: 50 }, ordering: 'grouped' },
        // p90 grows more than 20%
        fileSize: { p50: 100, p90: 150, max: 400 },
      });

      const drifts = detector.detect(previous, current);

      const types = drifts.map((d) => d.type);
      expect(types).toContain('naming');         // file naming shift
      expect(types).toContain('naming-entropy'); // entropy increase (files)
      expect(types).toContain('modularity');     // p90 file size growth
      expect(types).toContain('imports');        // import ordering change

      expect(drifts.length).toBeGreaterThanOrEqual(4);
    });
  });
});
