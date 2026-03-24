import { describe, expect, it } from 'vitest';

import { commandsGenerator } from '../commands-generator.js';
import type { GeneratorContext } from '../types.js';
import type { RepoProfile } from '../../types.js';
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

function makeRepoProfile(overrides: Partial<RepoProfile> = {}): RepoProfile {
  return {
    languages: [],
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
  return {
    rootPath: '/project',
    repoProfile: makeRepoProfile(),
    scoreResult: null,
    fileIndex: makeMockFileIndex(),
    gitContext: makeMockGitContext(),
    preset: 'standard',
    interactive: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CommandsGenerator (integration)', () => {
  it('generates correct commands for a TypeScript+Vitest+ESLint project', async () => {
    const ctx = makeContext({
      fileIndex: makeMockFileIndex(
        {
          'package.json': JSON.stringify({
            name: 'ts-project',
            dependencies: {},
            devDependencies: {
              vitest: '^2.0.0',
              eslint: '^9.0.0',
              prettier: '^3.0.0',
              typescript: '^5.0.0',
            },
          }),
          'package-lock.json': '{}',
          'tsconfig.json': '{}',
        },
        [
          makeFileEntry('src/index.ts'),
          makeFileEntry('src/__tests__/index.test.ts'),
        ],
      ),
      repoProfile: makeRepoProfile({
        languages: [{ name: 'TypeScript', percentage: 95, fileCount: 50 }],
        tooling: {
          linters: ['ESLint'],
          formatters: ['Prettier'],
          ci: ['github-actions'],
          bundlers: [],
          testRunners: ['Vitest'],
        },
      }),
    });

    const result = await commandsGenerator.generate(ctx);

    // Should generate /test
    expect(result['test.md']).toBeDefined();
    expect(result['test.md']).toContain('npx vitest run');

    // Should generate /lint
    expect(result['lint.md']).toBeDefined();
    expect(result['lint.md']).toContain('npx eslint --fix .');
    expect(result['lint.md']).toContain('npx prettier --write .');

    // Should generate /commit (always generated)
    expect(result['commit.md']).toBeDefined();

    // Should generate /setup (has pkg.npm)
    expect(result['setup.md']).toBeDefined();
    expect(result['setup.md']).toContain('npm install');

    // Should NOT generate /db (no database)
    expect(result['db.md']).toBeUndefined();
  });

  it('generates correct commands for a PHP+PHPUnit+Laravel project', async () => {
    const ctx = makeContext({
      fileIndex: makeMockFileIndex(
        {
          'composer.json': JSON.stringify({
            require: { 'laravel/framework': '^10.0' },
            'require-dev': { 'phpunit/phpunit': '^10.0' },
          }),
        },
        [
          makeFileEntry('app/Http/Controllers/UserController.php'),
          makeFileEntry('artisan'),
        ],
      ),
      repoProfile: makeRepoProfile({
        languages: [{ name: 'PHP', percentage: 90, fileCount: 100 }],
        frameworks: [{ name: 'Laravel', version: '10.0', confidence: 0.95 }],
        tooling: {
          linters: [],
          formatters: [],
          ci: [],
          bundlers: [],
          testRunners: ['PHPUnit'],
        },
      }),
    });

    const result = await commandsGenerator.generate(ctx);

    // Should generate /test with PHPUnit
    expect(result['test.md']).toBeDefined();
    expect(result['test.md']).toContain('vendor/bin/phpunit');

    // Should generate /commit (always)
    expect(result['commit.md']).toBeDefined();

    // Should generate /db (Laravel has db.laravel)
    expect(result['db.md']).toBeDefined();
    // The db template resolves steps — the main step references {db.*.migrate},
    // {db.*.seed}, etc. Some may not resolve if the ORM doesn't have all commands,
    // but the command file should still be generated.
    expect(result['db.md']).toContain('/db');

    // Should generate /setup (has pkg.composer)
    expect(result['setup.md']).toBeDefined();
    expect(result['setup.md']).toContain('composer install');

    // Should generate /scaffold (Laravel has cli.artisan)
    expect(result['scaffold.md']).toBeDefined();
    expect(result['scaffold.md']).toContain('php artisan');
  });

  it('generates /db for a project with Prisma', async () => {
    const ctx = makeContext({
      fileIndex: makeMockFileIndex(
        {
          'package.json': JSON.stringify({
            dependencies: { prisma: '^5.0.0', '@prisma/client': '^5.0.0' },
          }),
          'package-lock.json': '{}',
          'prisma/schema.prisma': 'datasource db { provider = "postgresql" }',
        },
        [makeFileEntry('prisma/schema.prisma')],
      ),
    });

    const result = await commandsGenerator.generate(ctx);

    expect(result['db.md']).toBeDefined();
    expect(result['db.md']).toContain('npx prisma migrate dev');
    expect(result['db.md']).toContain('npx prisma db seed');
  });

  it('returns only /commit for a minimal project with no tooling', async () => {
    const ctx = makeContext({
      fileIndex: makeMockFileIndex(),
      repoProfile: makeRepoProfile(),
    });

    const result = await commandsGenerator.generate(ctx);

    // /commit has no requirements, so it always generates
    expect(result['commit.md']).toBeDefined();

    // No other commands should be generated
    expect(result['test.md']).toBeUndefined();
    expect(result['lint.md']).toBeUndefined();
    expect(result['db.md']).toBeUndefined();
    expect(result['setup.md']).toBeUndefined();
    expect(result['deploy.md']).toBeUndefined();
    expect(result['scaffold.md']).toBeUndefined();
  });

  it('returns a Record<string, string> with filename keys and markdown values', async () => {
    const ctx = makeContext({
      repoProfile: makeRepoProfile({
        tooling: {
          linters: [],
          formatters: [],
          ci: [],
          bundlers: [],
          testRunners: ['Vitest'],
        },
      }),
    });

    const result = await commandsGenerator.generate(ctx);

    // All keys should be .md filenames
    for (const key of Object.keys(result)) {
      expect(key).toMatch(/\.md$/);
    }

    // All values should be non-empty strings
    for (const value of Object.values(result)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it('includes TypeScript type check step in /lint when build.typescript detected', async () => {
    const ctx = makeContext({
      fileIndex: makeMockFileIndex({
        'package-lock.json': '{}',
        'tsconfig.json': '{}',
      }),
      repoProfile: makeRepoProfile({
        languages: [{ name: 'TypeScript', percentage: 90, fileCount: 50 }],
        tooling: {
          linters: ['ESLint'],
          formatters: [],
          ci: [],
          bundlers: [],
          testRunners: [],
        },
      }),
    });

    const result = await commandsGenerator.generate(ctx);

    expect(result['lint.md']).toBeDefined();
    expect(result['lint.md']).toContain('npx tsc --noEmit');
  });
});
