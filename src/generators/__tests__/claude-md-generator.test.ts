import { describe, expect, it } from 'vitest';

import { claudeMdGenerator } from '../claude-md-generator.js';
import type { GeneratorContext } from '../types.js';
import type { RepoProfile, ScoreResult, Signal, AnalyzerCategory, CategoryScore } from '../../types.js';
import type { FileIndex, FileEntry } from '../../core/context/file-index.js';
import type { GitContext } from '../../core/context/git-context.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFileEntry(relativePath: string, lines = 100): FileEntry {
  return {
    path: '/project/' + relativePath,
    relativePath,
    size: lines * 40,
    lines,
    hash: 'abc123',
    extension: '.' + (relativePath.split('.').pop() ?? 'ts'),
  };
}

function makeSignal(
  id: string,
  score: number,
  category: string = 'documentation',
): Signal {
  return {
    id,
    category: category as AnalyzerCategory,
    name: 'Test Signal ' + id,
    value: score,
    unit: 'ratio',
    score,
    confidence: 1,
    evidence: score < 0.3 ? [{ file: 'src/test.ts' }] : [],
    threshold: { poor: 0, fair: 0.5, good: 1 },
    claudeImpact: 'This signal affects how Claude understands the project.',
  };
}

function makeCategoryScore(raw: number, signals: Signal[] = []): CategoryScore {
  return {
    raw,
    normalized: raw * 20,
    max: 20,
    signals,
    summary: 'Test summary',
  };
}

function makeScoreResult(
  total: number,
  signals: Signal[] = [],
): ScoreResult {
  const categories = {} as Record<AnalyzerCategory, CategoryScore>;
  const cats = [
    'documentation', 'modularity', 'conventions', 'typeSafety',
    'testCoverage', 'gitHygiene', 'cicd', 'dependencies',
  ] as AnalyzerCategory[];

  for (const cat of cats) {
    const catSignals = signals.filter(s => s.category === cat);
    categories[cat] = makeCategoryScore(
      catSignals.length > 0 ? catSignals[0].score : 0.5,
      catSignals,
    );
  }

  return {
    total,
    categories,
    signals,
    timestamp: new Date().toISOString(),
    duration: 100,
  };
}

function makeRepoProfile(overrides: Partial<RepoProfile> = {}): RepoProfile {
  return {
    languages: [
      { name: 'TypeScript', percentage: 80, fileCount: 50 },
      { name: 'JavaScript', percentage: 15, fileCount: 10 },
      { name: 'CSS', percentage: 5, fileCount: 3 },
    ],
    frameworks: [
      { name: 'React', version: '18.2.0', confidence: 0.95 },
      { name: 'Next.js', version: '14.0.0', confidence: 0.9 },
    ],
    tooling: {
      linters: ['eslint'],
      formatters: ['prettier'],
      ci: ['github-actions'],
      bundlers: ['webpack'],
      testRunners: ['vitest'],
    },
    structure: {
      monorepo: false,
      depth: 5,
      entryPoints: ['src/index.ts', 'src/cli.ts'],
    },
    packageManager: 'npm',
    ...overrides,
  };
}

function makeMockFileIndex(
  files: Record<string, string> = {},
  entries: FileEntry[] = [],
): FileIndex {
  const fileMap = new Map<string, string>(Object.entries(files));
  const entryMap = new Map<string, FileEntry>();
  for (const entry of entries) {
    entryMap.set(entry.relativePath, entry);
  }

  return {
    read: (path: string) => fileMap.get(path) ?? undefined,
    exists: (path: string) => fileMap.has(path) || entryMap.has(path),
    glob: (pattern: string) => {
      const regex = new RegExp(
        pattern
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/\*\*/g, '{{GLOBSTAR}}')
          .replace(/\*/g, '[^/]*')
          .replace(/\?/g, '[^/]')
          .replace(/{{GLOBSTAR}}/g, '.*'),
      );
      return entries.filter(e => regex.test(e.relativePath));
    },
    getEntry: (path: string) => entryMap.get(path),
    getAllEntries: () => entries,
    getFileCount: () => entries.length,
    getSourceFiles: () => entries.filter(e =>
      ['.ts', '.tsx', '.js', '.jsx'].some(ext => e.extension === ext),
    ),
    getTestFiles: () => entries.filter(e =>
      e.relativePath.includes('__tests__') || e.relativePath.includes('.test.'),
    ),
    build: async () => {},
  } as unknown as FileIndex;
}

function makeMockGitContext(): GitContext {
  return {
    isGitRepo: async () => true,
    getHead: async () => 'abc123',
    getBranch: async () => 'main',
    getLog: async () => [],
    getCommitSizes: async () => [],
    getBinaryFiles: async () => [],
    getFileLastModified: async () => '',
  } as unknown as GitContext;
}

function makeContext(overrides: Partial<GeneratorContext> = {}): GeneratorContext {
  const defaultFiles: Record<string, string> = {
    'package.json': JSON.stringify({
      name: 'my-project',
      description: 'A test project for testing the CLAUDE.md generator',
      scripts: {
        build: 'tsc',
        test: 'vitest',
        lint: 'eslint .',
        dev: 'next dev',
      },
      dependencies: {
        react: '^18.2.0',
        next: '^14.0.0',
      },
      devDependencies: {
        vitest: '^2.0.0',
        eslint: '^9.0.0',
        prettier: '^3.0.0',
      },
    }),
    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        strict: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
        noImplicitReturns: true,
      },
    }),
  };

  const defaultEntries: FileEntry[] = [
    makeFileEntry('src/index.ts'),
    makeFileEntry('src/app.tsx'),
    makeFileEntry('src/components/Button.tsx'),
    makeFileEntry('src/utils/helpers.ts'),
    makeFileEntry('src/__tests__/app.test.tsx'),
    makeFileEntry('package.json', 50),
    makeFileEntry('tsconfig.json', 30),
  ];

  return {
    rootPath: '/project',
    repoProfile: makeRepoProfile(),
    scoreResult: null,
    fileIndex: makeMockFileIndex(defaultFiles, defaultEntries),
    gitContext: makeMockGitContext(),
    preset: 'standard',
    interactive: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ClaudeMdGenerator', () => {
  it('generates valid markdown', async () => {
    const ctx = makeContext();
    const result = await claudeMdGenerator.generate(ctx);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);

    // Should contain key markdown headings
    expect(result).toContain('# ');
    expect(result).toContain('## ');
  });

  it('includes project name from package.json', async () => {
    const ctx = makeContext();
    const result = await claudeMdGenerator.generate(ctx);

    expect(result).toContain('my-project');
  });

  it('includes detected frameworks in Tech Stack', async () => {
    const ctx = makeContext();
    const result = await claudeMdGenerator.generate(ctx);

    expect(result).toContain('React');
    expect(result).toContain('Next.js');
  });

  it('includes detected languages with percentages', async () => {
    const ctx = makeContext();
    const result = await claudeMdGenerator.generate(ctx);

    expect(result).toContain('TypeScript');
    // Should have a percentage
    expect(result).toMatch(/TypeScript.*80/);
  });

  it('includes entry points in Architecture section', async () => {
    const ctx = makeContext();
    const result = await claudeMdGenerator.generate(ctx);

    expect(result).toContain('src/index.ts');
    expect(result).toContain('src/cli.ts');
  });

  it('includes linter and formatter info in Conventions', async () => {
    const ctx = makeContext();
    const result = await claudeMdGenerator.generate(ctx);

    expect(result).toContain('eslint');
    expect(result).toContain('prettier');
  });

  it('includes test runner in Testing section', async () => {
    const ctx = makeContext();
    const result = await claudeMdGenerator.generate(ctx);

    expect(result).toContain('vitest');
  });

  it('includes build scripts in Build & Deploy', async () => {
    const ctx = makeContext();
    const result = await claudeMdGenerator.generate(ctx);

    expect(result).toContain('tsc');
  });

  it('includes common tasks from package.json scripts', async () => {
    const ctx = makeContext();
    const result = await claudeMdGenerator.generate(ctx);

    expect(result).toContain('npm run');
  });

  it('includes gotchas when score signals are poor', async () => {
    const poorSignals = [
      makeSignal('modularity.circular.deps', 0.1, 'modularity'),
      makeSignal('typeSafety.any.usage', 0.2, 'typeSafety'),
      makeSignal('documentation.readme.quality', 0.15, 'documentation'),
    ];

    const scoreResult = makeScoreResult(30, poorSignals);
    const ctx = makeContext({ scoreResult });
    const result = await claudeMdGenerator.generate(ctx);

    // Should contain gotcha-related content from signals
    expect(result).toMatch(/[Gg]otcha|[Cc]ircular|[Aa]ny/);
  });

  it('handles missing package.json gracefully', async () => {
    const fileIndex = makeMockFileIndex({}, [
      makeFileEntry('src/main.py'),
    ]);

    const ctx = makeContext({
      fileIndex,
      repoProfile: makeRepoProfile({
        languages: [{ name: 'Python', percentage: 100, fileCount: 10 }],
        frameworks: [{ name: 'Django', confidence: 0.9, version: '4.2' }],
        packageManager: 'unknown',
      }),
    });

    const result = await claudeMdGenerator.generate(ctx);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain('Python');
  });

  it('detects monorepo structure', async () => {
    const ctx = makeContext({
      repoProfile: makeRepoProfile({
        structure: {
          monorepo: true,
          depth: 4,
          entryPoints: ['packages/core/src/index.ts'],
        },
      }),
    });

    const result = await claudeMdGenerator.generate(ctx);

    expect(result).toMatch(/[Mm]onorepo/);
  });

  it('handles no score result', async () => {
    const ctx = makeContext({ scoreResult: null });
    const result = await claudeMdGenerator.generate(ctx);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('includes TypeScript strict mode in conventions when detected', async () => {
    const ctx = makeContext();
    const result = await claudeMdGenerator.generate(ctx);

    expect(result).toMatch(/[Ss]trict/);
  });

  it('includes package manager info', async () => {
    const ctx = makeContext();
    const result = await claudeMdGenerator.generate(ctx);

    expect(result).toContain('npm');
  });

  it('includes CI/CD info in Build & Deploy', async () => {
    const ctx = makeContext();
    const result = await claudeMdGenerator.generate(ctx);

    expect(result).toContain('github-actions');
  });

  it('detects barrel export pattern when many index files exist', async () => {
    const entries = [
      makeFileEntry('src/index.ts'),
      makeFileEntry('src/core/index.ts'),
      makeFileEntry('src/utils/index.ts'),
      makeFileEntry('src/components/index.ts'),
      makeFileEntry('src/hooks/index.ts'),
      makeFileEntry('src/types/index.ts'),
    ];

    const fileIndex = makeMockFileIndex(
      {
        'package.json': JSON.stringify({ name: 'barrel-project' }),
      },
      entries,
    );

    const ctx = makeContext({ fileIndex });
    const result = await claudeMdGenerator.generate(ctx);

    expect(result).toMatch(/[Bb]arrel/);
  });
});
