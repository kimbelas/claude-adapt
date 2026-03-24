import { describe, expect, it } from 'vitest';

import { scanCapabilities, hasCapability, getCapability, getCapabilitiesByCategory } from '../capabilities/capability-scanner.js';
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

describe('CapabilityScanner', () => {
  it('detects npm when package-lock.json exists', () => {
    const ctx = makeContext({
      fileIndex: makeMockFileIndex({
        'package-lock.json': '{}',
      }),
    });

    const caps = scanCapabilities(ctx);

    expect(hasCapability(caps, 'pkg.npm')).toBe(true);
  });

  it('detects Vitest from tooling.testRunners', () => {
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

    const caps = scanCapabilities(ctx);

    expect(hasCapability(caps, 'test.vitest')).toBe(true);
    const cap = getCapability(caps, 'test.vitest');
    expect(cap).toBeDefined();
    expect(cap!.rule.commands.run).toBe('npx vitest run');
  });

  it('detects ESLint from tooling.linters', () => {
    const ctx = makeContext({
      repoProfile: makeRepoProfile({
        tooling: {
          linters: ['ESLint'],
          formatters: [],
          ci: [],
          bundlers: [],
          testRunners: [],
        },
      }),
    });

    const caps = scanCapabilities(ctx);

    expect(hasCapability(caps, 'lint.eslint')).toBe(true);
    const cap = getCapability(caps, 'lint.eslint');
    expect(cap).toBeDefined();
    expect(cap!.rule.commands.fix).toBe('npx eslint --fix .');
  });

  it('detects Prisma from dependencies', () => {
    const ctx = makeContext({
      fileIndex: makeMockFileIndex({
        'package.json': JSON.stringify({
          dependencies: { prisma: '^5.0.0' },
        }),
      }),
    });

    const caps = scanCapabilities(ctx);

    expect(hasCapability(caps, 'db.prisma')).toBe(true);
    const cap = getCapability(caps, 'db.prisma');
    expect(cap).toBeDefined();
    expect(cap!.rule.commands.migrate).toBe('npx prisma migrate dev');
  });

  it('detects Docker from Dockerfile', () => {
    const ctx = makeContext({
      fileIndex: makeMockFileIndex(
        {},
        [makeFileEntry('Dockerfile')],
      ),
    });

    const caps = scanCapabilities(ctx);

    expect(hasCapability(caps, 'deploy.docker')).toBe(true);
  });

  it('detects WP-CLI from wp-config.php', () => {
    const ctx = makeContext({
      fileIndex: makeMockFileIndex(
        { 'wp-config.php': '<?php define("DB_NAME", "wordpress");' },
        [makeFileEntry('wp-config.php')],
      ),
    });

    const caps = scanCapabilities(ctx);

    expect(hasCapability(caps, 'cli.wp')).toBe(true);
  });

  it('returns higher confidence when more criteria match', () => {
    // Prisma with only dependency (1/2 criteria)
    const ctxOneCriterion = makeContext({
      fileIndex: makeMockFileIndex({
        'package.json': JSON.stringify({
          dependencies: { prisma: '^5.0.0' },
        }),
      }),
    });

    const capsOne = scanCapabilities(ctxOneCriterion);
    const capOne = getCapability(capsOne, 'db.prisma');

    // Prisma with dependency AND config file (2/2 criteria)
    const ctxTwoCriteria = makeContext({
      fileIndex: makeMockFileIndex(
        {
          'package.json': JSON.stringify({
            dependencies: { prisma: '^5.0.0' },
          }),
          'prisma/schema.prisma': 'datasource db {}',
        },
        [makeFileEntry('prisma/schema.prisma')],
      ),
    });

    const capsTwo = scanCapabilities(ctxTwoCriteria);
    const capTwo = getCapability(capsTwo, 'db.prisma');

    expect(capOne).toBeDefined();
    expect(capTwo).toBeDefined();
    expect(capTwo!.confidence).toBeGreaterThan(capOne!.confidence);
  });

  it('returns empty array when nothing matches', () => {
    const ctx = makeContext({
      fileIndex: makeMockFileIndex(),
      repoProfile: makeRepoProfile(),
    });

    const caps = scanCapabilities(ctx);

    expect(caps).toEqual([]);
  });

  it('reads dependencies from package.json', () => {
    const ctx = makeContext({
      fileIndex: makeMockFileIndex({
        'package.json': JSON.stringify({
          dependencies: { 'drizzle-orm': '^0.30.0' },
          devDependencies: { prisma: '^5.0.0' },
        }),
      }),
    });

    const caps = scanCapabilities(ctx);

    expect(hasCapability(caps, 'db.drizzle')).toBe(true);
    expect(hasCapability(caps, 'db.prisma')).toBe(true);
  });

  it('reads dependencies from composer.json', () => {
    const ctx = makeContext({
      fileIndex: makeMockFileIndex({
        'composer.json': JSON.stringify({
          require: { 'laravel/framework': '^10.0' },
          'require-dev': { 'phpunit/phpunit': '^10.0' },
        }),
      }),
    });

    // composer.json existence alone triggers pkg.composer
    const caps = scanCapabilities(ctx);
    expect(hasCapability(caps, 'pkg.composer')).toBe(true);
  });

  it('detects capabilities by category', () => {
    const ctx = makeContext({
      repoProfile: makeRepoProfile({
        tooling: {
          linters: ['ESLint'],
          formatters: ['Prettier'],
          ci: [],
          bundlers: [],
          testRunners: ['Vitest'],
        },
      }),
    });

    const caps = scanCapabilities(ctx);

    const lintCaps = getCapabilitiesByCategory(caps, 'linting');
    expect(lintCaps.length).toBe(1);
    expect(lintCaps[0].rule.id).toBe('lint.eslint');

    const testCaps = getCapabilitiesByCategory(caps, 'testing');
    expect(testCaps.length).toBe(1);
    expect(testCaps[0].rule.id).toBe('test.vitest');
  });

  it('detects TypeScript build capability from language and config', () => {
    const ctx = makeContext({
      fileIndex: makeMockFileIndex({
        'tsconfig.json': '{}',
      }),
      repoProfile: makeRepoProfile({
        languages: [{ name: 'TypeScript', percentage: 80, fileCount: 50 }],
      }),
    });

    const caps = scanCapabilities(ctx);

    expect(hasCapability(caps, 'build.typescript')).toBe(true);
  });

  it('supports prefix matching in hasCapability', () => {
    const ctx = makeContext({
      fileIndex: makeMockFileIndex({
        'package.json': JSON.stringify({
          dependencies: { prisma: '^5.0.0' },
        }),
      }),
    });

    const caps = scanCapabilities(ctx);

    // "db" prefix should match "db.prisma"
    expect(hasCapability(caps, 'db')).toBe(true);
    // Exact match should also work
    expect(hasCapability(caps, 'db.prisma')).toBe(true);
    // Non-existent prefix should not match
    expect(hasCapability(caps, 'deploy')).toBe(false);
  });

  it('results are sorted by confidence descending', () => {
    // Create a context where some capabilities match with different confidence
    const ctx = makeContext({
      fileIndex: makeMockFileIndex(
        {
          'package.json': JSON.stringify({
            dependencies: { prisma: '^5.0.0' },
          }),
          'package-lock.json': '{}',
          'tsconfig.json': '{}',
        },
        [],
      ),
      repoProfile: makeRepoProfile({
        languages: [{ name: 'TypeScript', percentage: 80, fileCount: 50 }],
      }),
    });

    const caps = scanCapabilities(ctx);

    // Verify sort order: confidence descending
    for (let i = 1; i < caps.length; i++) {
      if (caps[i].confidence === caps[i - 1].confidence) {
        // Same confidence: sorted alphabetically by rule.id
        expect(caps[i].rule.id >= caps[i - 1].rule.id).toBe(true);
      } else {
        expect(caps[i].confidence).toBeLessThanOrEqual(caps[i - 1].confidence);
      }
    }
  });
});
