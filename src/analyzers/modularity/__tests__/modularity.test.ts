import { describe, it, expect, beforeEach } from 'vitest';

import { ModularityAnalyzer } from '../index.js';
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
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.php',
  ]);

  return {
    getSourceFiles: () => entries.filter(e => sourceExtensions.has(e.extension)),
    getTestFiles: () => entries.filter(e =>
      e.relativePath.includes('.test.') || e.relativePath.includes('__tests__'),
    ),
    getAllEntries: () => entries,
    getFileCount: () => entries.length,
    read: (path: string) => files.get(path),
    exists: (path: string) => files.has(path),
    glob: (pattern: string) => {
      const regex = new RegExp(
        pattern
          .replace(/\*\*/g, '{{GLOBSTAR}}')
          .replace(/\*/g, '[^/]*')
          .replace(/\{\{GLOBSTAR\}\}/g, '.*'),
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

describe('ModularityAnalyzer', () => {
  let analyzer: ModularityAnalyzer;

  beforeEach(() => {
    analyzer = new ModularityAnalyzer();
  });

  it('has the correct category', () => {
    expect(analyzer.category).toBe(AnalyzerCategory.modularity);
  });

  it('defines 7 signals', () => {
    expect(analyzer.signals).toHaveLength(7);
  });

  it('defines all expected signal ids', () => {
    const ids = analyzer.signals.map(s => s.id);
    expect(ids).toContain('mod.file.size.p90');
    expect(ids).toContain('mod.file.size.max');
    expect(ids).toContain('mod.function.length.p90');
    expect(ids).toContain('mod.coupling.circular');
    expect(ids).toContain('mod.coupling.afferent');
    expect(ids).toContain('mod.depth.max');
    expect(ids).toContain('mod.entrypoints');
  });

  it('marks all size/coupling signals as inverted', () => {
    const invertedIds = [
      'mod.file.size.p90',
      'mod.file.size.max',
      'mod.function.length.p90',
      'mod.coupling.circular',
      'mod.coupling.afferent',
      'mod.depth.max',
    ];

    for (const id of invertedIds) {
      const signal = analyzer.signals.find(s => s.id === id);
      expect(signal?.inverted).toBe(true);
    }
  });

  // ---------------------------------------------------------------------------
  // mod.file.size.p90
  // ---------------------------------------------------------------------------

  describe('mod.file.size.p90', () => {
    it('computes P90 from source file line counts', async () => {
      // 10 files with known line counts
      const entries = Array.from({ length: 10 }, (_, i) =>
        makeFileEntry(`src/file${i}.ts`, { lines: (i + 1) * 20 }),
      );
      // lines: 20, 40, 60, 80, 100, 120, 140, 160, 180, 200
      const files = new Map<string, string>();
      const context = makeContext(files, entries);

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'mod.file.size.p90');

      expect(signal).toBeDefined();
      // P90 of [20,40,60,80,100,120,140,160,180,200] at index ceil(0.9*10)-1 = 8 -> 180
      expect(signal!.value).toBe(180);
      // 180 < 200 (good) so score should be 1
      expect(signal!.score).toBe(1);
    });

    it('handles no source files', async () => {
      const context = makeContext(new Map(), []);

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'mod.file.size.p90');

      expect(signal).toBeDefined();
      expect(signal!.value).toBe(0);
    });

    it('penalizes large files at P90', async () => {
      // With 10 files, P90 is at index ceil(0.9*10)-1 = 8 (0-based).
      // Sorted: [50,50,50,50,50,50,50,50, 400, 800] -> P90 = 400
      const entries = [
        ...Array.from({ length: 8 }, (_, i) =>
          makeFileEntry(`src/small${i}.ts`, { lines: 50 }),
        ),
        makeFileEntry('src/medium.ts', { lines: 400 }),
        makeFileEntry('src/giant.ts', { lines: 800 }),
      ];
      const files = new Map<string, string>();
      const context = makeContext(files, entries);

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'mod.file.size.p90');

      expect(signal).toBeDefined();
      // P90 at sorted index 8 -> 400
      expect(signal!.value).toBe(400);
      // 400 is between poor (500) and good (200), inverted:
      // score = (500 - 400) / (500 - 200) = 100/300 ~ 0.33
      expect(signal!.score).toBeLessThan(1);
      expect(signal!.score).toBeGreaterThan(0);
      expect(signal!.score).toBeCloseTo(100 / 300, 2);
    });
  });

  // ---------------------------------------------------------------------------
  // mod.file.size.max
  // ---------------------------------------------------------------------------

  describe('mod.file.size.max', () => {
    it('finds the largest file', async () => {
      const entries = [
        makeFileEntry('src/small.ts', { lines: 50 }),
        makeFileEntry('src/medium.ts', { lines: 300 }),
        makeFileEntry('src/large.ts', { lines: 600 }),
      ];
      const files = new Map<string, string>();
      const context = makeContext(files, entries);

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'mod.file.size.max');

      expect(signal).toBeDefined();
      expect(signal!.value).toBe(600);
    });

    it('scores 1 when max is within good threshold', async () => {
      const entries = [
        makeFileEntry('src/a.ts', { lines: 100 }),
        makeFileEntry('src/b.ts', { lines: 200 }),
      ];
      const files = new Map<string, string>();
      const context = makeContext(files, entries);

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'mod.file.size.max');

      expect(signal).toBeDefined();
      expect(signal!.value).toBe(200);
      // 200 <= good (500), inverted -> score = 1
      expect(signal!.score).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // mod.function.length.p90
  // ---------------------------------------------------------------------------

  describe('mod.function.length.p90', () => {
    it('detects JS/TS function declarations and measures length', async () => {
      const content = [
        'export function shortFn() {',
        '  return 1;',
        '}',
        '',
        'export function longFn() {',
        ...Array.from({ length: 60 }, (_, i) => `  const x${i} = ${i};`),
        '}',
      ].join('\n');

      const entries = [makeFileEntry('src/funcs.ts', { lines: content.split('\n').length })];
      const files = new Map([['src/funcs.ts', content]]);
      const context = makeContext(files, entries);

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'mod.function.length.p90');

      expect(signal).toBeDefined();
      // There are 2 functions; P90 of the longer one
      expect(signal!.value).toBeGreaterThan(10);
    });

    it('handles files with no functions', async () => {
      const content = 'export const VALUE = 42;\nexport type Foo = string;\n';
      const entries = [makeFileEntry('src/constants.ts', { lines: 2 })];
      const files = new Map([['src/constants.ts', content]]);
      const context = makeContext(files, entries);

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'mod.function.length.p90');

      expect(signal).toBeDefined();
      expect(signal!.value).toBe(0);
    });

    it('detects Python function definitions', async () => {
      const content = [
        'def short_fn():',
        '    return 1',
        '',
        'def long_fn():',
        ...Array.from({ length: 50 }, (_, i) => `    x${i} = ${i}`),
        '    return x0',
      ].join('\n');

      const entries = [makeFileEntry('src/funcs.py', { lines: content.split('\n').length })];
      const files = new Map([['src/funcs.py', content]]);
      const context = makeContext(files, entries);

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'mod.function.length.p90');

      expect(signal).toBeDefined();
      expect(signal!.value).toBeGreaterThan(10);
    });

    it('returns 0 with no source files', async () => {
      const context = makeContext(new Map(), []);

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'mod.function.length.p90');

      expect(signal).toBeDefined();
      expect(signal!.value).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // mod.coupling.circular
  // ---------------------------------------------------------------------------

  describe('mod.coupling.circular', () => {
    it('reports 0 when no circular dependencies exist', async () => {
      const entries = [
        makeFileEntry('src/a.ts'),
        makeFileEntry('src/b.ts'),
      ];
      const files = new Map([
        ['src/a.ts', "import { b } from './b.js';\nexport const a = 1;"],
        ['src/b.ts', 'export const b = 2;'],
      ]);
      const context = makeContext(files, entries);

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'mod.coupling.circular');

      expect(signal).toBeDefined();
      expect(signal!.value).toBe(0);
      expect(signal!.score).toBe(1); // 0 cycles = perfect
    });

    it('detects circular dependencies', async () => {
      const entries = [
        makeFileEntry('src/a.ts'),
        makeFileEntry('src/b.ts'),
      ];
      const files = new Map([
        ['src/a.ts', "import { b } from './b.js';\nexport const a = 1;"],
        ['src/b.ts', "import { a } from './a.js';\nexport const b = 2;"],
      ]);
      const context = makeContext(files, entries);

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'mod.coupling.circular');

      expect(signal).toBeDefined();
      expect(signal!.value).toBeGreaterThanOrEqual(1);
      expect(signal!.score).toBeLessThan(1);
    });
  });

  // ---------------------------------------------------------------------------
  // mod.coupling.afferent
  // ---------------------------------------------------------------------------

  describe('mod.coupling.afferent', () => {
    it('reports max incoming dependencies for a single file', async () => {
      const entries = [
        makeFileEntry('src/app.ts'),
        makeFileEntry('src/handler.ts'),
        makeFileEntry('src/service.ts'),
        makeFileEntry('src/utils.ts'),
      ];
      const files = new Map([
        ['src/app.ts', "import { utils } from './utils.js';"],
        ['src/handler.ts', "import { utils } from './utils.js';"],
        ['src/service.ts', "import { utils } from './utils.js';"],
        ['src/utils.ts', 'export function utils() {}'],
      ]);
      const context = makeContext(files, entries);

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'mod.coupling.afferent');

      expect(signal).toBeDefined();
      // utils.ts is imported by 3 files
      expect(signal!.value).toBe(3);
    });

    it('reports 0 when no files import each other', async () => {
      const entries = [
        makeFileEntry('src/a.ts'),
        makeFileEntry('src/b.ts'),
      ];
      const files = new Map([
        ['src/a.ts', 'export const a = 1;'],
        ['src/b.ts', 'export const b = 2;'],
      ]);
      const context = makeContext(files, entries);

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'mod.coupling.afferent');

      expect(signal).toBeDefined();
      expect(signal!.value).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // mod.depth.max
  // ---------------------------------------------------------------------------

  describe('mod.depth.max', () => {
    it('uses profile.structure.depth value', async () => {
      const context = makeContext(new Map(), [], {
        structure: {
          monorepo: false,
          depth: 4,
          entryPoints: [],
        },
      });

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'mod.depth.max');

      expect(signal).toBeDefined();
      expect(signal!.value).toBe(4);
      // depth 4 <= good (5), inverted -> score = 1
      expect(signal!.score).toBe(1);
    });

    it('penalizes deep nesting', async () => {
      const entries = [
        makeFileEntry('src/a/b/c/d/e/f/g/deeply-nested.ts'),
      ];
      const files = new Map<string, string>();
      const context = makeContext(files, entries, {
        structure: {
          monorepo: false,
          depth: 8,
          entryPoints: [],
        },
      });

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'mod.depth.max');

      expect(signal).toBeDefined();
      expect(signal!.value).toBe(8);
      // depth 8 > poor (7), inverted -> score = 0
      expect(signal!.score).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // mod.entrypoints
  // ---------------------------------------------------------------------------

  describe('mod.entrypoints', () => {
    it('scores 1 when profile has entry points', async () => {
      const context = makeContext(new Map(), [], {
        structure: {
          monorepo: false,
          depth: 3,
          entryPoints: ['src/index.ts'],
        },
      });

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'mod.entrypoints');

      expect(signal).toBeDefined();
      expect(signal!.value).toBe(1);
      expect(signal!.score).toBe(1);
    });

    it('falls back to common entry point detection', async () => {
      const entries = [makeFileEntry('src/index.ts')];
      const files = new Map([['src/index.ts', 'export {}']]);
      const context = makeContext(files, entries);

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'mod.entrypoints');

      expect(signal).toBeDefined();
      expect(signal!.value).toBe(1);
    });

    it('detects Next.js App Router entry points via exact path', async () => {
      const entries = [
        makeFileEntry('src/app/page.tsx'),
        makeFileEntry('src/app/layout.tsx'),
        makeFileEntry('src/app/about/page.tsx'),
      ];
      const files = new Map([
        ['src/app/page.tsx', 'export default function Home() {}'],
        ['src/app/layout.tsx', 'export default function Layout() {}'],
        ['src/app/about/page.tsx', 'export default function About() {}'],
      ]);
      const context = makeContext(files, entries);

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'mod.entrypoints');

      expect(signal).toBeDefined();
      expect(signal!.value).toBe(1);
      expect(signal!.score).toBe(1);
    });

    it('detects Next.js App Router entry points via glob fallback', async () => {
      // Only nested route files (not in the exact-match list)
      const entries = [
        makeFileEntry('src/app/blog/[slug]/page.tsx'),
        makeFileEntry('src/app/api/hello/route.ts'),
      ];
      const files = new Map([
        ['src/app/blog/[slug]/page.tsx', 'export default function Post() {}'],
        ['src/app/api/hello/route.ts', 'export function GET() {}'],
      ]);
      const context = makeContext(files, entries);

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'mod.entrypoints');

      expect(signal).toBeDefined();
      expect(signal!.value).toBe(1);
      expect(signal!.score).toBe(1);
    });

    it('scores 0 when no entry points found', async () => {
      const entries = [makeFileEntry('src/random-file.ts')];
      const files = new Map<string, string>();
      const context = makeContext(files, entries);

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'mod.entrypoints');

      expect(signal).toBeDefined();
      expect(signal!.value).toBe(0);
      expect(signal!.score).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Full analysis
  // ---------------------------------------------------------------------------

  describe('full analysis', () => {
    it('returns all 7 signals', async () => {
      const entries = [makeFileEntry('src/app.ts')];
      const files = new Map([['src/app.ts', 'export const app = 1;']]);
      const context = makeContext(files, entries);

      const result = await analyzer.analyze(context);

      expect(result.category).toBe(AnalyzerCategory.modularity);
      expect(result.signals).toHaveLength(7);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('all signals have required fields', async () => {
      const entries = [makeFileEntry('src/app.ts')];
      const files = new Map([['src/app.ts', 'export const app = 1;']]);
      const context = makeContext(files, entries);

      const result = await analyzer.analyze(context);

      for (const signal of result.signals) {
        expect(signal.id).toBeDefined();
        expect(signal.category).toBe(AnalyzerCategory.modularity);
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

    it('handles empty repository gracefully', async () => {
      const context = makeContext(new Map(), []);

      const result = await analyzer.analyze(context);

      expect(result.signals).toHaveLength(7);
      // No errors thrown, all signals have valid data
      for (const signal of result.signals) {
        expect(typeof signal.value).toBe('number');
        expect(Number.isFinite(signal.value)).toBe(true);
      }
    });
  });
});
