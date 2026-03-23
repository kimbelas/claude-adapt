import { describe, it, expect, beforeEach } from 'vitest';

import { TestCoverageAnalyzer } from '../index.js';
import { AnalyzerCategory } from '../../../types.js';
import type { ScanContext } from '../../../core/context/scan-context.js';
import type { FileEntry, FileIndex } from '../../../core/context/file-index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFileEntry(
  relativePath: string,
  overrides: Partial<FileEntry> = {},
): FileEntry {
  const ext = relativePath.substring(relativePath.lastIndexOf('.'));
  return {
    path: `/repo/${relativePath}`,
    relativePath,
    size: 100,
    lines: 20,
    hash: 'abc123',
    extension: ext,
    ...overrides,
  };
}

function makeFileIndex(
  files: Map<string, string>,
  entries: FileEntry[],
): Partial<FileIndex> {
  const sourceExtensions = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py',
  ]);

  return {
    getSourceFiles: () => entries.filter(e => sourceExtensions.has(e.extension)),
    getTestFiles: () => entries.filter(e =>
      e.relativePath.includes('.test.') ||
      e.relativePath.includes('.spec.') ||
      e.relativePath.includes('__tests__') ||
      e.relativePath.includes('test/') ||
      e.relativePath.includes('tests/') ||
      e.relativePath.startsWith('test_'),
    ),
    getAllEntries: () => entries,
    getFileCount: () => entries.length,
    read: (path: string) => files.get(path),
    exists: (path: string) => files.has(path),
    glob: (pattern: string) => {
      const regex = new RegExp(
        pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'),
      );
      return entries.filter(e => regex.test(e.relativePath));
    },
    getEntry: (path: string) => entries.find(e => e.relativePath === path),
  };
}

function makeContext(
  files: Map<string, string>,
  entries: FileEntry[],
  profileOverrides: Partial<ScanContext['profile']> = {},
): ScanContext {
  const fileIndex = makeFileIndex(files, entries);

  return {
    rootPath: '/repo',
    profile: {
      languages: [{ name: 'TypeScript', percentage: 100, fileCount: entries.length }],
      frameworks: [],
      tooling: {
        linters: [],
        formatters: [],
        ci: [],
        bundlers: [],
        testRunners: [],
      },
      structure: {
        monorepo: false,
        depth: 3,
        entryPoints: [],
      },
      packageManager: 'npm',
      ...profileOverrides,
    },
    fileIndex: fileIndex as FileIndex,
    git: {} as ScanContext['git'],
    options: {},
    timestamp: new Date().toISOString(),
  } as ScanContext;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TestCoverageAnalyzer', () => {
  let analyzer: TestCoverageAnalyzer;

  beforeEach(() => {
    analyzer = new TestCoverageAnalyzer();
  });

  it('has the correct category', () => {
    expect(analyzer.category).toBe(AnalyzerCategory.testCoverage);
  });

  it('defines 5 signals', () => {
    expect(analyzer.signals).toHaveLength(5);
  });

  it('defines all expected signal ids', () => {
    const ids = analyzer.signals.map(s => s.id);
    expect(ids).toContain('test.ratio');
    expect(ids).toContain('test.runner');
    expect(ids).toContain('test.scripts');
    expect(ids).toContain('test.coverage.config');
    expect(ids).toContain('test.naming');
  });

  // ---------------------------------------------------------------------------
  // test.ratio
  // ---------------------------------------------------------------------------

  describe('test.ratio', () => {
    it('computes correct test-to-source ratio', async () => {
      const entries = [
        makeFileEntry('src/app.ts'),
        makeFileEntry('src/handler.ts'),
        makeFileEntry('src/utils.ts'),
        makeFileEntry('src/service.ts'),
        makeFileEntry('src/__tests__/app.test.ts'),
        makeFileEntry('src/__tests__/handler.test.ts'),
      ];
      const files = new Map<string, string>();
      const context = makeContext(files, entries);

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'test.ratio');

      expect(signal).toBeDefined();
      // 2 test files out of 6 source files (all .ts)
      // The getTestFiles includes test files, getSourceFiles includes all .ts
      // ratio = 2/6 = 0.333
      expect(signal!.value).toBeCloseTo(2 / 6, 2);
    });

    it('returns 0 when no source files', async () => {
      const context = makeContext(new Map(), []);

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'test.ratio');

      expect(signal).toBeDefined();
      expect(signal!.value).toBe(0);
    });

    it('returns high ratio when well-tested', async () => {
      const entries = [
        makeFileEntry('src/app.ts'),
        makeFileEntry('src/__tests__/app.test.ts'),
      ];
      const files = new Map<string, string>();
      const context = makeContext(files, entries);

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'test.ratio');

      expect(signal).toBeDefined();
      // 1 test file / 2 source files = 0.5
      expect(signal!.value).toBe(0.5);
      expect(signal!.score).toBe(1); // 0.5 >= good threshold
    });
  });

  // ---------------------------------------------------------------------------
  // test.runner
  // ---------------------------------------------------------------------------

  describe('test.runner', () => {
    it('scores 1 when a test runner is detected', async () => {
      const context = makeContext(new Map(), [], {
        tooling: {
          linters: [],
          formatters: [],
          ci: [],
          bundlers: [],
          testRunners: ['vitest'],
        },
      });

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'test.runner');

      expect(signal).toBeDefined();
      expect(signal!.value).toBe(1);
      expect(signal!.score).toBe(1);
    });

    it('scores 0 when no test runner detected', async () => {
      const context = makeContext(new Map(), []);

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'test.runner');

      expect(signal).toBeDefined();
      expect(signal!.value).toBe(0);
      expect(signal!.score).toBe(0);
    });

    it('reports multiple runners when available', async () => {
      const context = makeContext(new Map(), [], {
        tooling: {
          linters: [],
          formatters: [],
          ci: [],
          bundlers: [],
          testRunners: ['vitest', 'jest'],
        },
      });

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'test.runner');

      expect(signal).toBeDefined();
      expect(signal!.value).toBe(1);
      expect(signal!.evidence).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------------------
  // test.scripts
  // ---------------------------------------------------------------------------

  describe('test.scripts', () => {
    it('detects test script in package.json', async () => {
      const packageJson = JSON.stringify({
        scripts: {
          test: 'vitest run',
          'test:coverage': 'vitest run --coverage',
        },
      });

      const files = new Map([['package.json', packageJson]]);
      const entries = [makeFileEntry('package.json')];
      const context = makeContext(files, entries);

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'test.scripts');

      expect(signal).toBeDefined();
      expect(signal!.value).toBe(1);
    });

    it('scores 0 when no test script exists', async () => {
      const packageJson = JSON.stringify({
        scripts: {
          build: 'tsc',
          lint: 'eslint .',
        },
      });

      const files = new Map([['package.json', packageJson]]);
      const entries = [makeFileEntry('package.json')];
      const context = makeContext(files, entries);

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'test.scripts');

      expect(signal).toBeDefined();
      expect(signal!.value).toBe(0);
    });

    it('handles missing package.json', async () => {
      const context = makeContext(new Map(), []);

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'test.scripts');

      expect(signal).toBeDefined();
      expect(signal!.value).toBe(0);
    });

    it('gives partial credit for test script without coverage', async () => {
      const packageJson = JSON.stringify({
        scripts: {
          test: 'vitest run',
        },
      });

      const files = new Map([['package.json', packageJson]]);
      const entries = [makeFileEntry('package.json')];
      const context = makeContext(files, entries);

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'test.scripts');

      expect(signal).toBeDefined();
      expect(signal!.value).toBe(0.5);
    });
  });

  // ---------------------------------------------------------------------------
  // test.coverage.config
  // ---------------------------------------------------------------------------

  describe('test.coverage.config', () => {
    it('detects coverage in vitest config', async () => {
      const vitestConfig = `
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    coverage: { provider: 'v8' },
  },
});`;

      const files = new Map([['vitest.config.ts', vitestConfig]]);
      const entries = [makeFileEntry('vitest.config.ts')];
      const context = makeContext(files, entries);

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'test.coverage.config');

      expect(signal).toBeDefined();
      expect(signal!.value).toBe(1);
    });

    it('detects .nycrc coverage config file', async () => {
      const files = new Map([['.nycrc', '{"all": true}']]);
      const entries = [makeFileEntry('.nycrc')];
      const context = makeContext(files, entries);

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'test.coverage.config');

      expect(signal).toBeDefined();
      expect(signal!.value).toBe(1);
    });

    it('detects coverage in jest.config', async () => {
      const jestConfig = `
module.exports = {
  collectCoverage: true,
  coverageDirectory: 'coverage',
};`;

      const files = new Map([['jest.config.js', jestConfig]]);
      const entries = [makeFileEntry('jest.config.js')];
      const context = makeContext(files, entries);

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'test.coverage.config');

      expect(signal).toBeDefined();
      expect(signal!.value).toBe(1);
    });

    it('detects nyc config in package.json', async () => {
      const packageJson = JSON.stringify({
        nyc: { all: true, reporter: ['lcov'] },
      });

      const files = new Map([['package.json', packageJson]]);
      const entries = [makeFileEntry('package.json')];
      const context = makeContext(files, entries);

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'test.coverage.config');

      expect(signal).toBeDefined();
      expect(signal!.value).toBe(1);
    });

    it('scores 0 when no coverage config found', async () => {
      const context = makeContext(new Map(), []);

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'test.coverage.config');

      expect(signal).toBeDefined();
      expect(signal!.value).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // test.naming
  // ---------------------------------------------------------------------------

  describe('test.naming', () => {
    it('scores high when all tests use .test. pattern', async () => {
      const entries = [
        makeFileEntry('src/app.ts'),
        makeFileEntry('src/__tests__/app.test.ts'),
        makeFileEntry('src/__tests__/handler.test.ts'),
        makeFileEntry('src/__tests__/utils.test.ts'),
      ];
      const files = new Map<string, string>();
      const context = makeContext(files, entries);

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'test.naming');

      expect(signal).toBeDefined();
      // All 3 test files use .test. pattern
      expect(signal!.value).toBe(1);
      expect(signal!.score).toBe(1);
    });

    it('scores lower when test naming is inconsistent', async () => {
      const entries = [
        makeFileEntry('src/app.ts'),
        makeFileEntry('src/__tests__/app.test.ts'),
        makeFileEntry('tests/handler.spec.ts'),
        makeFileEntry('test/utils.ts'),
      ];
      const files = new Map<string, string>();
      const context = makeContext(files, entries);

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'test.naming');

      expect(signal).toBeDefined();
      // Mixed naming -> lower score
      expect(signal!.value).toBeLessThan(1);
    });

    it('handles no test files', async () => {
      const entries = [makeFileEntry('src/app.ts')];
      const files = new Map<string, string>();
      const context = makeContext(files, entries);

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'test.naming');

      expect(signal).toBeDefined();
      expect(signal!.value).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Full analysis
  // ---------------------------------------------------------------------------

  describe('full analysis', () => {
    it('returns all 5 signals', async () => {
      const context = makeContext(new Map(), []);

      const result = await analyzer.analyze(context);

      expect(result.category).toBe(AnalyzerCategory.testCoverage);
      expect(result.signals).toHaveLength(5);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('all signals have required fields', async () => {
      const context = makeContext(new Map(), []);

      const result = await analyzer.analyze(context);

      for (const signal of result.signals) {
        expect(signal.id).toBeDefined();
        expect(signal.category).toBe(AnalyzerCategory.testCoverage);
        expect(signal.name).toBeDefined();
        expect(typeof signal.value).toBe('number');
        expect(typeof signal.score).toBe('number');
        expect(signal.score).toBeGreaterThanOrEqual(0);
        expect(signal.score).toBeLessThanOrEqual(1);
        expect(signal.confidence).toBeGreaterThanOrEqual(0);
        expect(signal.confidence).toBeLessThanOrEqual(1);
        expect(signal.threshold).toBeDefined();
        expect(signal.claudeImpact).toBeDefined();
      }
    });
  });
});
