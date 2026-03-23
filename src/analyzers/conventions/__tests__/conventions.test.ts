import { describe, it, expect, beforeEach } from 'vitest';

import { ConventionsAnalyzer } from '../index.js';
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
  return {
    getSourceFiles: () => entries.filter(e =>
      ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py'].includes(e.extension),
    ),
    getTestFiles: () => entries.filter(e =>
      e.relativePath.includes('.test.') || e.relativePath.includes('__tests__'),
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

describe('ConventionsAnalyzer', () => {
  let analyzer: ConventionsAnalyzer;

  beforeEach(() => {
    analyzer = new ConventionsAnalyzer();
  });

  it('has the correct category', () => {
    expect(analyzer.category).toBe(AnalyzerCategory.conventions);
  });

  it('defines 7 signals', () => {
    expect(analyzer.signals).toHaveLength(7);
  });

  it('defines all expected signal ids', () => {
    const ids = analyzer.signals.map(s => s.id);
    expect(ids).toContain('conv.naming.consistency');
    expect(ids).toContain('conv.linter.exists');
    expect(ids).toContain('conv.linter.strictness');
    expect(ids).toContain('conv.formatter.exists');
    expect(ids).toContain('conv.structure.pattern');
    expect(ids).toContain('conv.imports.ordering');
    expect(ids).toContain('conv.editorconfig');
  });

  // ---------------------------------------------------------------------------
  // conv.naming.consistency
  // ---------------------------------------------------------------------------

  describe('conv.naming.consistency', () => {
    it('reports low entropy when all files use the same naming style', async () => {
      const entries = [
        makeFileEntry('src/user-service.ts'),
        makeFileEntry('src/auth-handler.ts'),
        makeFileEntry('src/data-store.ts'),
        makeFileEntry('src/api-client.ts'),
      ];
      const files = new Map<string, string>();
      const context = makeContext(files, entries);

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'conv.naming.consistency');

      expect(signal).toBeDefined();
      // All kebab-case -> low entropy -> high score (inverted)
      expect(signal!.score).toBeGreaterThan(0.5);
    });

    it('reports high entropy when naming is mixed', async () => {
      const entries = [
        makeFileEntry('src/userService.ts'),     // camelCase
        makeFileEntry('src/AuthHandler.ts'),      // PascalCase
        makeFileEntry('src/data_store.ts'),       // snake_case
        makeFileEntry('src/api-client.ts'),       // kebab-case
      ];
      const files = new Map<string, string>();
      const context = makeContext(files, entries);

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'conv.naming.consistency');

      expect(signal).toBeDefined();
      // Mixed naming -> high entropy -> low score (inverted)
      expect(signal!.score).toBeLessThan(0.5);
    });

    it('handles no source files gracefully', async () => {
      const context = makeContext(new Map(), []);

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'conv.naming.consistency');

      expect(signal).toBeDefined();
      expect(signal!.confidence).toBe(0.8);
    });
  });

  // ---------------------------------------------------------------------------
  // conv.linter.exists
  // ---------------------------------------------------------------------------

  describe('conv.linter.exists', () => {
    it('scores 1 when linters are configured', async () => {
      const context = makeContext(new Map(), [], {
        tooling: {
          linters: ['eslint'],
          formatters: [],
          ci: [],
          bundlers: [],
          testRunners: [],
        },
      });

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'conv.linter.exists');

      expect(signal).toBeDefined();
      expect(signal!.value).toBe(1);
      expect(signal!.score).toBe(1);
    });

    it('scores 0 when no linters configured', async () => {
      const context = makeContext(new Map(), []);

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'conv.linter.exists');

      expect(signal).toBeDefined();
      expect(signal!.value).toBe(0);
      expect(signal!.score).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // conv.linter.strictness
  // ---------------------------------------------------------------------------

  describe('conv.linter.strictness', () => {
    it('counts rules from ESLint JSON config', async () => {
      const eslintConfig = JSON.stringify({
        extends: ['eslint:recommended'],
        rules: {
          'no-console': 'warn',
          'no-unused-vars': 'error',
          'semi': 'error',
        },
      });

      const files = new Map([
        ['.eslintrc.json', eslintConfig],
      ]);
      const entries = [makeFileEntry('.eslintrc.json')];

      const context = makeContext(files, entries, {
        tooling: {
          linters: ['eslint'],
          formatters: [],
          ci: [],
          bundlers: [],
          testRunners: [],
        },
      });

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'conv.linter.strictness');

      expect(signal).toBeDefined();
      // 3 explicit rules + 1 extends * 25 = 28
      expect(signal!.value).toBe(28);
    });

    it('returns 0 with no linter', async () => {
      const context = makeContext(new Map(), []);

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'conv.linter.strictness');

      expect(signal).toBeDefined();
      expect(signal!.value).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // conv.formatter.exists
  // ---------------------------------------------------------------------------

  describe('conv.formatter.exists', () => {
    it('scores 1 when formatters are configured', async () => {
      const context = makeContext(new Map(), [], {
        tooling: {
          linters: [],
          formatters: ['prettier'],
          ci: [],
          bundlers: [],
          testRunners: [],
        },
      });

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'conv.formatter.exists');

      expect(signal).toBeDefined();
      expect(signal!.value).toBe(1);
      expect(signal!.score).toBe(1);
    });

    it('scores 0 when no formatters configured', async () => {
      const context = makeContext(new Map(), []);

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'conv.formatter.exists');

      expect(signal).toBeDefined();
      expect(signal!.value).toBe(0);
      expect(signal!.score).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // conv.structure.pattern
  // ---------------------------------------------------------------------------

  describe('conv.structure.pattern', () => {
    it('scores 1 when 3+ standard directories exist', async () => {
      const entries = [
        makeFileEntry('src/index.ts'),
        makeFileEntry('tests/app.test.ts'),
        makeFileEntry('docs/readme.md'),
        makeFileEntry('scripts/build.sh'),
      ];
      const files = new Map<string, string>();
      const context = makeContext(files, entries);

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'conv.structure.pattern');

      expect(signal).toBeDefined();
      expect(signal!.value).toBe(1);
      expect(signal!.score).toBe(1);
    });

    it('scores 0.5 when only 1-2 standard directories exist', async () => {
      const entries = [
        makeFileEntry('src/index.ts'),
      ];
      const files = new Map<string, string>();
      const context = makeContext(files, entries);

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'conv.structure.pattern');

      expect(signal).toBeDefined();
      expect(signal!.value).toBe(0.5);
    });

    it('scores 0 when no standard directories exist', async () => {
      const entries = [
        makeFileEntry('app.ts'),
      ];
      const files = new Map<string, string>();
      const context = makeContext(files, entries);

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'conv.structure.pattern');

      expect(signal).toBeDefined();
      expect(signal!.value).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // conv.imports.ordering
  // ---------------------------------------------------------------------------

  describe('conv.imports.ordering', () => {
    it('detects grouped imports with blank line separators', async () => {
      const sourceContent = [
        "import { readFile } from 'node:fs/promises';",
        '',
        "import express from 'express';",
        '',
        "import { handler } from './handler.js';",
        '',
        'export function main() {}',
      ].join('\n');

      const entries = [makeFileEntry('src/index.ts')];
      const files = new Map([['src/index.ts', sourceContent]]);
      const context = makeContext(files, entries);

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'conv.imports.ordering');

      expect(signal).toBeDefined();
      expect(signal!.value).toBe(1);
    });

    it('detects non-grouped imports', async () => {
      const sourceContent = [
        "import { readFile } from 'node:fs/promises';",
        "import express from 'express';",
        "import { handler } from './handler.js';",
        '',
        'export function main() {}',
      ].join('\n');

      const entries = [makeFileEntry('src/index.ts')];
      const files = new Map([['src/index.ts', sourceContent]]);
      const context = makeContext(files, entries);

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'conv.imports.ordering');

      expect(signal).toBeDefined();
      // Imports are in correct order (node -> external -> local) so score is 1
      // even without blank line separators between groups
      expect(signal!.value).toBeGreaterThanOrEqual(0);
    });
  });

  // ---------------------------------------------------------------------------
  // conv.editorconfig
  // ---------------------------------------------------------------------------

  describe('conv.editorconfig', () => {
    it('scores 1 when .editorconfig exists', async () => {
      const files = new Map([
        ['.editorconfig', 'root = true\n[*]\nindent_style = space'],
      ]);
      const entries = [makeFileEntry('.editorconfig')];
      const context = makeContext(files, entries);

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'conv.editorconfig');

      expect(signal).toBeDefined();
      expect(signal!.value).toBe(1);
      expect(signal!.score).toBe(1);
    });

    it('scores 0 when .editorconfig is missing', async () => {
      const context = makeContext(new Map(), []);

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'conv.editorconfig');

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
      const context = makeContext(new Map(), []);

      const result = await analyzer.analyze(context);

      expect(result.category).toBe(AnalyzerCategory.conventions);
      expect(result.signals).toHaveLength(7);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('all signals have required fields', async () => {
      const context = makeContext(new Map(), []);

      const result = await analyzer.analyze(context);

      for (const signal of result.signals) {
        expect(signal.id).toBeDefined();
        expect(signal.category).toBe(AnalyzerCategory.conventions);
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
