import { describe, it, expect, beforeEach } from 'vitest';

import { GitHygieneAnalyzer } from '../index.js';
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
    getSourceFiles: () =>
      entries.filter(e =>
        ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py'].includes(e.extension),
      ),
    getTestFiles: () =>
      entries.filter(
        e => e.relativePath.includes('.test.') || e.relativePath.includes('__tests__'),
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

function makeGitContext(overrides: Partial<ScanContext['git']> = {}) {
  return {
    getLog: async () => [],
    getCommitSizes: async () => [],
    getBinaryFiles: async () => [],
    ...overrides,
  };
}

function makeContext(
  files: Map<string, string>,
  entries: FileEntry[],
  profileOverrides: Partial<ScanContext['profile']> = {},
  gitOverrides: Partial<ScanContext['git']> = {},
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
    git: makeGitContext(gitOverrides) as ScanContext['git'],
    options: {},
    timestamp: new Date().toISOString(),
  } as ScanContext;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GitHygieneAnalyzer', () => {
  let analyzer: GitHygieneAnalyzer;

  beforeEach(() => {
    analyzer = new GitHygieneAnalyzer();
  });

  it('has the correct category', () => {
    expect(analyzer.category).toBe(AnalyzerCategory.gitHygiene);
  });

  it('defines 4 signals', () => {
    expect(analyzer.signals).toHaveLength(4);
  });

  // ---------------------------------------------------------------------------
  // git.ignore.quality
  // ---------------------------------------------------------------------------

  describe('git.ignore.quality', () => {
    it('scores 0 when .gitignore is missing', async () => {
      const context = makeContext(new Map(), []);

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'git.ignore.quality');

      expect(signal).toBeDefined();
      expect(signal!.value).toBe(0);
      expect(signal!.score).toBe(0);
    });

    it('scores high for a Node project with relevant patterns', async () => {
      // universal (7) + node (4) = 11 expected patterns
      // gitignore covers: node_modules, dist, .env, coverage, .DS_Store, *.log,
      // build, .cache, tmp = 9 out of 11 (missing .idea, .vscode)
      const gitignore = [
        'node_modules/',
        'dist/',
        '.env',
        '.env.*',
        'coverage/',
        '.DS_Store',
        '*.log',
        'build/',
        '.cache/',
        'tmp/',
      ].join('\n');

      const files = new Map([['.gitignore', gitignore]]);
      const entries = [makeFileEntry('.gitignore')];
      const context = makeContext(files, entries);

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'git.ignore.quality');

      expect(signal).toBeDefined();
      // 9/11 = ~0.818 -> above good threshold (0.8) -> score = 1
      expect(signal!.score).toBeGreaterThanOrEqual(0.8);
    });

    it('does not penalise a Node project for missing Python patterns', async () => {
      // A minimal but perfectly valid Node .gitignore
      const gitignore = [
        'node_modules/',
        'dist/',
        'build/',
        '.cache/',
        '.env',
        'coverage/',
        '.DS_Store',
        '*.log',
        '.idea/',
        '.vscode/',
        'tmp/',
      ].join('\n');

      const files = new Map([['.gitignore', gitignore]]);
      const entries = [makeFileEntry('.gitignore')];
      const context = makeContext(files, entries);

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'git.ignore.quality');

      expect(signal).toBeDefined();
      // All 11 universal+node patterns covered -> ratio = 1.0 -> score = 1
      expect(signal!.value).toBe(1);
      expect(signal!.score).toBe(1);
    });

    it('includes Python patterns when Python is detected', async () => {
      // Only universal patterns, missing all Python-specific ones
      const gitignore = [
        '.env',
        '.DS_Store',
        '*.log',
        '.idea/',
        '.vscode/',
        'coverage/',
        'tmp/',
      ].join('\n');

      const files = new Map([['.gitignore', gitignore]]);
      const entries = [makeFileEntry('.gitignore')];
      const context = makeContext(files, entries, {
        languages: [{ name: 'Python', percentage: 100, fileCount: 10 }],
      });

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'git.ignore.quality');

      expect(signal).toBeDefined();
      // 7 universal matched out of 11 (7 universal + 4 python) = ~0.636
      // That falls between poor (0.5) and good (0.8) -> partial score
      expect(signal!.score).toBeGreaterThan(0);
      expect(signal!.score).toBeLessThan(1);
    });

    it('includes Next.js patterns when framework is detected', async () => {
      const gitignore = [
        'node_modules/',
        'dist/',
        'build/',
        '.cache/',
        '.env',
        'coverage/',
        '.DS_Store',
        '*.log',
        '.idea/',
        '.vscode/',
        'tmp/',
        '.next/',
      ].join('\n');

      const files = new Map([['.gitignore', gitignore]]);
      const entries = [makeFileEntry('.gitignore')];
      const context = makeContext(files, entries, {
        languages: [{ name: 'TypeScript', percentage: 100, fileCount: 10 }],
        frameworks: [{ name: 'Next.js', confidence: 0.9 }],
      });

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'git.ignore.quality');

      expect(signal).toBeDefined();
      // All 12 patterns matched (7 universal + 4 node + 1 next) -> score = 1
      expect(signal!.value).toBe(1);
      expect(signal!.score).toBe(1);
    });

    it('shows missing patterns in evidence when few are missing', async () => {
      const gitignore = [
        'node_modules/',
        'dist/',
        '.env',
        'coverage/',
        '.DS_Store',
        '*.log',
      ].join('\n');

      const files = new Map([['.gitignore', gitignore]]);
      const entries = [makeFileEntry('.gitignore')];
      const context = makeContext(files, entries);

      const result = await analyzer.analyze(context);
      const signal = result.signals.find(s => s.id === 'git.ignore.quality');

      expect(signal).toBeDefined();
      const suggestion = signal!.evidence.find(e => e.suggestion?.startsWith('Consider adding'));
      expect(suggestion).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Full analysis
  // ---------------------------------------------------------------------------

  describe('full analysis', () => {
    it('returns all 4 signals', async () => {
      const context = makeContext(new Map(), []);

      const result = await analyzer.analyze(context);

      expect(result.category).toBe(AnalyzerCategory.gitHygiene);
      expect(result.signals).toHaveLength(4);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('all signals have required fields', async () => {
      const context = makeContext(new Map(), []);

      const result = await analyzer.analyze(context);

      for (const signal of result.signals) {
        expect(signal.id).toBeDefined();
        expect(signal.category).toBe(AnalyzerCategory.gitHygiene);
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
