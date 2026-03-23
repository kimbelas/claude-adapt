import { describe, it, expect } from 'vitest';
import { SettingsAnalyzer } from '../config-analyzers/settings-analyzer.js';
import { CommandsAnalyzer } from '../config-analyzers/commands-analyzer.js';
import { HooksAnalyzer } from '../config-analyzers/hooks-analyzer.js';
import { McpAnalyzer } from '../config-analyzers/mcp-analyzer.js';
import type { RepoProfile } from '../../types.js';

function makeProfile(overrides?: Partial<RepoProfile>): RepoProfile {
  return {
    languages: [],
    frameworks: [],
    tooling: { linters: [], formatters: [], ci: [], bundlers: [], testRunners: [] },
    structure: { monorepo: false, depth: 3, entryPoints: [] },
    packageManager: 'npm',
    ...overrides,
  };
}

function makeFileIndex(files: Record<string, string> = {}): any {
  return {
    glob(pattern: string) {
      return Object.keys(files).filter(p => p.match(pattern.replace(/\*/g, '.*'))).map(p => ({ relativePath: p }));
    },
    read(path: string) { return files[path] ?? undefined; },
    exists(path: string) { return path in files; },
  };
}

// ---------------------------------------------------------------------------
// SettingsAnalyzer
// ---------------------------------------------------------------------------

describe('SettingsAnalyzer', () => {
  const analyzer = new SettingsAnalyzer();

  it('returns empty when no settings file', () => {
    const profile = makeProfile();
    const fileIndex = makeFileIndex();

    const result = analyzer.analyze(null, profile, fileIndex);

    expect(result).toEqual([]);
  });

  it('returns empty when settings is invalid JSON', () => {
    const profile = makeProfile();
    const fileIndex = makeFileIndex();

    const result = analyzer.analyze('not json', profile, fileIndex);

    expect(result).toEqual([]);
  });

  it('suggests Supabase CLI when Supabase detected but not in allowedCommands', () => {
    const settingsContent = JSON.stringify({
      permissions: { allowedCommands: ['npm run *'] },
    });
    const profile = makeProfile({
      frameworks: [{ name: 'Supabase', confidence: 1 }],
    });
    const fileIndex = makeFileIndex();

    const result = analyzer.analyze(settingsContent, profile, fileIndex);

    expect(result.some(s => s.id === 'settings-supabase-cli')).toBe(true);
  });

  it('skips Supabase CLI when already allowed', () => {
    const settingsContent = JSON.stringify({
      permissions: { allowedCommands: ['npx supabase *'] },
    });
    const profile = makeProfile({
      frameworks: [{ name: 'Supabase', confidence: 1 }],
    });
    const fileIndex = makeFileIndex();

    const result = analyzer.analyze(settingsContent, profile, fileIndex);

    expect(result.some(s => s.id === 'settings-supabase-cli')).toBe(false);
  });

  it('suggests Prisma CLI when Prisma detected', () => {
    const settingsContent = JSON.stringify({
      permissions: { allowedCommands: ['npm run *'] },
    });
    const profile = makeProfile({
      frameworks: [{ name: 'prisma', confidence: 1 }],
    });
    const fileIndex = makeFileIndex();

    const result = analyzer.analyze(settingsContent, profile, fileIndex);

    expect(result.some(s => s.id === 'settings-prisma-cli')).toBe(true);
  });

  it('suggests Docker when Docker files exist', () => {
    const settingsContent = JSON.stringify({
      permissions: { allowedCommands: ['npm run *'] },
    });
    const profile = makeProfile();
    const fileIndex = makeFileIndex({
      'Dockerfile': 'FROM node:18',
      'docker-compose.yml': 'version: "3"',
    });

    const result = analyzer.analyze(settingsContent, profile, fileIndex);

    expect(result.some(s => s.id === 'settings-docker')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CommandsAnalyzer
// ---------------------------------------------------------------------------

describe('CommandsAnalyzer', () => {
  const analyzer = new CommandsAnalyzer();

  it('suggests test command when test runner detected', () => {
    const profile = makeProfile({
      tooling: { linters: [], formatters: [], ci: [], bundlers: [], testRunners: ['vitest'] },
    });
    const fileIndex = makeFileIndex();

    const result = analyzer.analyze([], profile, fileIndex);

    expect(result.some(s => s.id === 'commands-test')).toBe(true);
  });

  it('skips test command when test.md already exists', () => {
    const profile = makeProfile({
      tooling: { linters: [], formatters: [], ci: [], bundlers: [], testRunners: ['vitest'] },
    });
    const fileIndex = makeFileIndex();

    const result = analyzer.analyze(['test.md'], profile, fileIndex);

    expect(result.some(s => s.id === 'commands-test')).toBe(false);
  });

  it('suggests e2e command when Playwright detected', () => {
    const profile = makeProfile({
      tooling: { linters: [], formatters: [], ci: [], bundlers: [], testRunners: ['vitest', 'playwright'] },
    });
    const fileIndex = makeFileIndex();

    const result = analyzer.analyze(['test.md'], profile, fileIndex);

    expect(result.some(s => s.id === 'commands-e2e')).toBe(true);
  });

  it('suggests lint command when linter detected', () => {
    const profile = makeProfile({
      tooling: { linters: ['eslint'], formatters: [], ci: [], bundlers: [], testRunners: [] },
    });
    const fileIndex = makeFileIndex();

    const result = analyzer.analyze([], profile, fileIndex);

    expect(result.some(s => s.id === 'commands-lint')).toBe(true);
  });

  it('suggests format command when formatter detected', () => {
    const profile = makeProfile({
      tooling: { linters: [], formatters: ['prettier'], ci: [], bundlers: [], testRunners: [] },
    });
    const fileIndex = makeFileIndex();

    const result = analyzer.analyze([], profile, fileIndex);

    expect(result.some(s => s.id === 'commands-format')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// HooksAnalyzer
// ---------------------------------------------------------------------------

describe('HooksAnalyzer', () => {
  const analyzer = new HooksAnalyzer();

  it('suggests pre-commit hook when linter detected and no hook exists', () => {
    const profile = makeProfile({
      tooling: { linters: ['eslint'], formatters: [], ci: [], bundlers: [], testRunners: [] },
    });

    const result = analyzer.analyze([], profile);

    expect(result.some(s => s.id === 'hooks-pre-commit')).toBe(true);
  });

  it('skips when pre-commit hook already exists', () => {
    const profile = makeProfile({
      tooling: { linters: ['eslint'], formatters: [], ci: [], bundlers: [], testRunners: [] },
    });

    const result = analyzer.analyze(['pre-commit.sh'], profile);

    expect(result.some(s => s.id === 'hooks-pre-commit')).toBe(false);
  });

  it('returns empty when no linter or formatter', () => {
    const profile = makeProfile();

    const result = analyzer.analyze([], profile);

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// McpAnalyzer
// ---------------------------------------------------------------------------

describe('McpAnalyzer', () => {
  const analyzer = new McpAnalyzer();

  it('suggests Supabase MCP when Supabase detected', () => {
    const profile = makeProfile({
      frameworks: [{ name: 'Supabase', confidence: 1 }],
    });
    const fileIndex = makeFileIndex();

    const result = analyzer.analyze(null, profile, fileIndex);

    expect(result.some(s => s.id === 'mcp-supabase')).toBe(true);
  });

  it('skips Supabase MCP when already configured', () => {
    const mcpContent = JSON.stringify({
      mcpServers: { supabase: { command: 'npx' } },
    });
    const profile = makeProfile({
      frameworks: [{ name: 'Supabase', confidence: 1 }],
    });
    const fileIndex = makeFileIndex();

    const result = analyzer.analyze(mcpContent, profile, fileIndex);

    expect(result.some(s => s.id === 'mcp-supabase')).toBe(false);
  });

  it('suggests browser MCP when Playwright detected', () => {
    const profile = makeProfile({
      tooling: { linters: [], formatters: [], ci: [], bundlers: [], testRunners: ['playwright'] },
    });
    const fileIndex = makeFileIndex();

    const result = analyzer.analyze(null, profile, fileIndex);

    expect(result.some(s => s.id === 'mcp-browser')).toBe(true);
  });

  it('suggests database MCP when Prisma detected', () => {
    const profile = makeProfile({
      frameworks: [{ name: 'prisma', confidence: 1 }],
    });
    const fileIndex = makeFileIndex();

    const result = analyzer.analyze(null, profile, fileIndex);

    expect(result.some(s => s.id === 'mcp-database')).toBe(true);
  });
});
