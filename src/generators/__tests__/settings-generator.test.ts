import { describe, expect, it } from 'vitest';

import { settingsGenerator } from '../settings-generator.js';
import { getPresetSettings } from '../presets.js';
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
    languages: [
      { name: 'TypeScript', percentage: 90, fileCount: 50 },
    ],
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
      entryPoints: ['src/index.ts'],
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
// Preset base tests
// ---------------------------------------------------------------------------

describe('Presets', () => {
  it('minimal preset has the most allowed tools', () => {
    const minimal = getPresetSettings('minimal');
    const standard = getPresetSettings('standard');
    const strict = getPresetSettings('strict');

    expect(minimal.permissions.allowedTools.length).toBeGreaterThanOrEqual(
      standard.permissions.allowedTools.length,
    );
    expect(standard.permissions.allowedTools.length).toBeGreaterThanOrEqual(
      strict.permissions.allowedTools.length,
    );
  });

  it('minimal preset has the fewest denied commands', () => {
    const minimal = getPresetSettings('minimal');
    const standard = getPresetSettings('standard');
    const strict = getPresetSettings('strict');

    expect(minimal.permissions.deniedCommands.length).toBeLessThanOrEqual(
      standard.permissions.deniedCommands.length,
    );
    expect(standard.permissions.deniedCommands.length).toBeLessThanOrEqual(
      strict.permissions.deniedCommands.length,
    );
  });

  it('strict preset has maximum restrictions', () => {
    const strict = getPresetSettings('strict');

    // Strict should deny more tools
    expect(strict.permissions.deniedTools.length).toBeGreaterThan(0);

    // Strict should have the fewest allowed commands
    expect(strict.permissions.allowedCommands.length).toBeLessThan(20);

    // Strict should have the most denied commands
    expect(strict.permissions.deniedCommands.length).toBeGreaterThan(10);
  });

  it('standard preset blocks destructive git operations', () => {
    const standard = getPresetSettings('standard');

    expect(standard.permissions.deniedCommands).toContain('git push --force');
    expect(standard.permissions.deniedCommands).toContain('git reset --hard');
  });

  it('minimal preset allows broad tool wildcards', () => {
    const minimal = getPresetSettings('minimal');

    // Minimal has broad wildcards like 'npm *', 'git *'
    expect(minimal.permissions.allowedCommands.some(c => c.includes('npm *'))).toBe(true);
    expect(minimal.permissions.allowedCommands.some(c => c.includes('git *'))).toBe(true);
  });

  it('strict preset enables autoTest', () => {
    const strict = getPresetSettings('strict');
    expect(strict.behavior.autoTest).toBe(true);
  });

  it('minimal preset disables autoLint and autoTest', () => {
    const minimal = getPresetSettings('minimal');
    expect(minimal.behavior.autoLint).toBe(false);
    expect(minimal.behavior.autoTest).toBe(false);
  });

  it('strict preset uses conventional commit style', () => {
    const strict = getPresetSettings('strict');
    expect(strict.behavior.commitStyle).toBe('conventional');
  });

  it('returns deep clones that can be mutated safely', () => {
    const a = getPresetSettings('standard');
    const b = getPresetSettings('standard');

    a.permissions.allowedTools.push('CustomTool');
    expect(b.permissions.allowedTools).not.toContain('CustomTool');
  });
});

// ---------------------------------------------------------------------------
// Settings generator tests
// ---------------------------------------------------------------------------

describe('SettingsGenerator', () => {
  it('starts from the selected preset base', async () => {
    const ctx = makeContext({ preset: 'minimal' });
    const result = await settingsGenerator.generate(ctx);

    // Minimal should include broad tools
    expect(result.permissions.allowedTools).toContain('Bash');
    expect(result.permissions.allowedTools).toContain('WebSearch');
  });

  it('adds detected tools to allowedCommands', async () => {
    const ctx = makeContext({
      repoProfile: makeRepoProfile({
        tooling: {
          linters: ['eslint'],
          formatters: ['prettier'],
          ci: ['github-actions'],
          bundlers: [],
          testRunners: ['vitest'],
        },
      }),
    });

    const result = await settingsGenerator.generate(ctx);

    // Should have added eslint and prettier commands
    expect(
      result.permissions.allowedCommands.some(c => c.includes('eslint')),
    ).toBe(true);
    expect(
      result.permissions.allowedCommands.some(c => c.includes('prettier')),
    ).toBe(true);
    expect(
      result.permissions.allowedCommands.some(c => c.includes('vitest')),
    ).toBe(true);
  });

  it('adds framework-specific commands', async () => {
    const ctx = makeContext({
      repoProfile: makeRepoProfile({
        frameworks: [{ name: 'Next.js', version: '14.0.0', confidence: 0.9 }],
      }),
    });

    const result = await settingsGenerator.generate(ctx);

    expect(
      result.permissions.allowedCommands.some(c => c.includes('next')),
    ).toBe(true);
  });

  it('detects conventional commits and sets commitStyle', async () => {
    const ctx = makeContext({
      fileIndex: makeMockFileIndex({
        'package.json': JSON.stringify({
          devDependencies: {
            '@commitlint/cli': '^17.0.0',
          },
        }),
      }),
    });

    const result = await settingsGenerator.generate(ctx);

    expect(result.behavior.commitStyle).toBe('conventional');
  });

  it('detects conventional commits from config file', async () => {
    const ctx = makeContext({
      fileIndex: makeMockFileIndex({
        'commitlint.config.js': 'module.exports = {}',
        'package.json': JSON.stringify({ name: 'test' }),
      }),
    });

    const result = await settingsGenerator.generate(ctx);

    expect(result.behavior.commitStyle).toBe('conventional');
  });

  it('disables autoFormat when no formatter detected', async () => {
    const ctx = makeContext({
      repoProfile: makeRepoProfile({
        tooling: {
          linters: [],
          formatters: [],
          ci: [],
          bundlers: [],
          testRunners: [],
        },
      }),
    });

    const result = await settingsGenerator.generate(ctx);

    expect(result.behavior.autoFormat).toBe(false);
  });

  it('disables autoLint when no linter detected', async () => {
    const ctx = makeContext({
      repoProfile: makeRepoProfile({
        tooling: {
          linters: [],
          formatters: ['prettier'],
          ci: [],
          bundlers: [],
          testRunners: [],
        },
      }),
    });

    const result = await settingsGenerator.generate(ctx);

    expect(result.behavior.autoLint).toBe(false);
  });

  it('adds package-manager-specific commands for pnpm', async () => {
    const ctx = makeContext({
      repoProfile: makeRepoProfile({
        packageManager: 'pnpm',
      }),
    });

    const result = await settingsGenerator.generate(ctx);

    expect(
      result.permissions.allowedCommands.some(c => c.includes('pnpm')),
    ).toBe(true);
  });

  it('adds package-manager-specific commands for yarn', async () => {
    const ctx = makeContext({
      repoProfile: makeRepoProfile({
        packageManager: 'yarn',
      }),
    });

    const result = await settingsGenerator.generate(ctx);

    expect(
      result.permissions.allowedCommands.some(c => c.includes('yarn')),
    ).toBe(true);
  });

  it('adds monorepo workspace commands', async () => {
    const ctx = makeContext({
      repoProfile: makeRepoProfile({
        structure: { monorepo: true, depth: 3, entryPoints: [] },
        packageManager: 'pnpm',
      }),
    });

    const result = await settingsGenerator.generate(ctx);

    expect(
      result.permissions.allowedCommands.some(c => c.includes('--filter')),
    ).toBe(true);
  });

  it('adds database safety restrictions when docker-compose has postgres', async () => {
    const ctx = makeContext({
      fileIndex: makeMockFileIndex({
        'docker-compose.yml': 'services:\n  db:\n    image: postgres:15',
        'package.json': JSON.stringify({ name: 'test' }),
      }),
    });

    const result = await settingsGenerator.generate(ctx);

    expect(result.permissions.deniedCommands).toContain('DROP DATABASE *');
    expect(result.permissions.deniedCommands).toContain('DROP TABLE *');
  });

  it('adds database restrictions when db packages detected', async () => {
    const ctx = makeContext({
      fileIndex: makeMockFileIndex({
        'package.json': JSON.stringify({
          name: 'test',
          dependencies: {
            pg: '^8.0.0',
          },
        }),
      }),
    });

    const result = await settingsGenerator.generate(ctx);

    expect(result.permissions.deniedCommands).toContain('DROP DATABASE *');
  });

  it('deduplicates allowed and denied commands', async () => {
    const ctx = makeContext({
      repoProfile: makeRepoProfile({
        tooling: {
          linters: ['eslint'],
          formatters: ['prettier'],
          ci: ['github-actions'],
          bundlers: [],
          testRunners: ['vitest', 'jest'],
        },
      }),
    });

    const result = await settingsGenerator.generate(ctx);

    const allowedSet = new Set(result.permissions.allowedCommands);
    expect(allowedSet.size).toBe(result.permissions.allowedCommands.length);

    const deniedSet = new Set(result.permissions.deniedCommands);
    expect(deniedSet.size).toBe(result.permissions.deniedCommands.length);
  });

  it('adds gh command when github-actions CI detected', async () => {
    const ctx = makeContext({
      repoProfile: makeRepoProfile({
        tooling: {
          linters: [],
          formatters: [],
          ci: ['github-actions'],
          bundlers: [],
          testRunners: [],
        },
      }),
    });

    const result = await settingsGenerator.generate(ctx);

    expect(
      result.permissions.allowedCommands.some(c => c.includes('gh')),
    ).toBe(true);
  });

  it('strict preset with Docker denies docker operations', async () => {
    const ctx = makeContext({
      preset: 'strict',
      fileIndex: makeMockFileIndex({
        'Dockerfile': 'FROM node:18',
        'package.json': JSON.stringify({ name: 'test' }),
      }),
    });

    const result = await settingsGenerator.generate(ctx);

    expect(
      result.permissions.deniedCommands.some(c => c.includes('docker')),
    ).toBe(true);
  });

  it('protects CI config in strict mode', async () => {
    // The settings generator checks fileIndex.exists('.github/workflows'),
    // so we must include it as a readable path in the mock.
    const ctx = makeContext({
      preset: 'strict',
      fileIndex: makeMockFileIndex(
        {
          'package.json': JSON.stringify({ name: 'test' }),
          '.github/workflows': '',
        },
        [makeFileEntry('.github/workflows/ci.yml')],
      ),
    });

    const result = await settingsGenerator.generate(ctx);

    expect(
      result.permissions.deniedTools.some(t => t.includes('.github/workflows')),
    ).toBe(true);
  });

  it('handles Python project tooling', async () => {
    const ctx = makeContext({
      repoProfile: makeRepoProfile({
        languages: [{ name: 'Python', percentage: 100, fileCount: 30 }],
        tooling: {
          linters: ['ruff'],
          formatters: ['black'],
          ci: [],
          bundlers: [],
          testRunners: ['pytest'],
        },
        packageManager: 'unknown',
      }),
    });

    const result = await settingsGenerator.generate(ctx);

    expect(
      result.permissions.allowedCommands.some(c => c.includes('ruff')),
    ).toBe(true);
    expect(
      result.permissions.allowedCommands.some(c => c.includes('black')),
    ).toBe(true);
    expect(
      result.permissions.allowedCommands.some(c => c.includes('pytest')),
    ).toBe(true);
  });

  it('adds Laravel-specific commands', async () => {
    const ctx = makeContext({
      repoProfile: makeRepoProfile({
        frameworks: [{ name: 'Laravel', version: '10.0', confidence: 0.9 }],
      }),
    });

    const result = await settingsGenerator.generate(ctx);

    expect(
      result.permissions.allowedCommands.some(c => c.includes('artisan')),
    ).toBe(true);
  });

  it('adds Django-specific commands', async () => {
    const ctx = makeContext({
      repoProfile: makeRepoProfile({
        frameworks: [{ name: 'Django', version: '4.2', confidence: 0.9 }],
      }),
    });

    const result = await settingsGenerator.generate(ctx);

    expect(
      result.permissions.allowedCommands.some(c => c.includes('manage.py')),
    ).toBe(true);
  });
});
