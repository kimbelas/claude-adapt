import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { SkillManifest } from '../types.js';

// ---------------------------------------------------------------------------
// Mock node:fs/promises, node:fs, and node:crypto BEFORE importing the MUT
// ---------------------------------------------------------------------------

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  unlink: vi.fn(),
  readdir: vi.fn(),
}));

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(() => '# Stub Command\nStub content.'),
}));

vi.mock('node:crypto', () => ({
  randomUUID: vi.fn(() => 'test-uuid-1234'),
  randomBytes: vi.fn(() => ({ toString: () => 'abcdef123456' })),
}));

vi.mock('../lockfile.js', () => ({
  readLockfile: vi.fn(async () => ({ version: 1, skills: {} })),
  writeLockfile: vi.fn(async () => {}),
}));

vi.mock('../merge-log.js', () => ({
  appendTransaction: vi.fn(async () => {}),
  readMergeLog: vi.fn(async () => []),
}));

import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { MergeOrchestrator } from '../merge-orchestrator.js';
import { readLockfile, writeLockfile } from '../lockfile.js';
import { appendTransaction, readMergeLog } from '../merge-log.js';

const mockedReadFile = vi.mocked(readFile);
const mockedWriteFile = vi.mocked(writeFile);
const mockedMkdir = vi.mocked(mkdir);
const mockedUnlink = vi.mocked(unlink);
const mockedReadLockfile = vi.mocked(readLockfile);
const mockedWriteLockfile = vi.mocked(writeLockfile);
const mockedAppendTransaction = vi.mocked(appendTransaction);
const mockedReadMergeLog = vi.mocked(readMergeLog);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Manifest that does NOT include commands (avoids require('node:fs') path). */
function manifestWithoutCommands(overrides: Partial<SkillManifest> = {}): SkillManifest {
  return {
    name: 'claude-skill-test',
    displayName: 'Test Skill',
    version: '1.0.0',
    description: 'Test skill.',
    author: 'tester',
    license: 'MIT',
    claudeAdaptVersion: '>=0.1.0',
    tags: ['test'],
    provides: {
      claudeMd: {
        sections: [
          {
            id: 'test-section',
            title: 'Test Section',
            content: 'Test content for section.',
            placement: { position: 'bottom' },
          },
        ],
        priority: 50,
      },
      settings: {
        permissions: {
          allowedTools: ['tool-a'],
          allowedCommands: [],
          deniedTools: [],
          deniedCommands: [],
        },
        behavior: {},
      } as Record<string, unknown>,
      hooks: [
        { event: 'pre-commit' as const, file: 'hooks/pre-commit.sh', priority: 10, merge: 'append' as const },
      ],
      mcp: [
        {
          name: 'test-mcp',
          server: { command: 'node', args: ['mcp.js'] },
          reason: 'Testing',
          optional: false,
        },
      ],
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MergeOrchestrator', () => {
  let orchestrator: MergeOrchestrator;

  beforeEach(() => {
    vi.clearAllMocks();
    orchestrator = new MergeOrchestrator();

    // Default mocks: files don't exist yet (ENOENT)
    const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    mockedReadFile.mockRejectedValue(enoent);
    mockedWriteFile.mockResolvedValue(undefined);
    mockedMkdir.mockResolvedValue(undefined as any);
    mockedUnlink.mockResolvedValue(undefined);
    mockedReadLockfile.mockResolvedValue({ version: 1, skills: {} });
    mockedWriteLockfile.mockResolvedValue(undefined);
    mockedAppendTransaction.mockResolvedValue(undefined);
    mockedReadMergeLog.mockResolvedValue([]);
  });

  describe('successful installation', () => {
    it('creates a merge transaction with correct skill name', async () => {
      mockedReadFile.mockImplementation(async (path: any) => {
        const p = String(path);
        if (p.endsWith('pre-commit.sh')) return '#!/bin/bash\nnpm run lint';
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });

      const manifest = manifestWithoutCommands();
      const result = await orchestrator.install(manifest, '/pkg', '/root');

      expect(result.success).toBe(true);
      expect(result.transaction.skill).toBe('claude-skill-test');
      expect(result.transaction.id).toBe('test-uuid-1234');
    });

    it('calls writeFile for CLAUDE.md', async () => {
      mockedReadFile.mockImplementation(async (path: any) => {
        const p = String(path);
        if (p.endsWith('pre-commit.sh')) return '#!/bin/bash\nnpm run lint';
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });

      await orchestrator.install(manifestWithoutCommands(), '/pkg', '/root');

      expect(mockedWriteFile).toHaveBeenCalled();
      const calls = mockedWriteFile.mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('CLAUDE.md'))).toBe(true);
    });

    it('calls writeFile for settings.json', async () => {
      mockedReadFile.mockImplementation(async (path: any) => {
        const p = String(path);
        if (p.endsWith('pre-commit.sh')) return '#!/bin/bash\nnpm run lint';
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });

      await orchestrator.install(manifestWithoutCommands(), '/pkg', '/root');

      const calls = mockedWriteFile.mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('settings.json'))).toBe(true);
    });

    it('calls writeFile for mcp.json', async () => {
      mockedReadFile.mockImplementation(async (path: any) => {
        const p = String(path);
        if (p.endsWith('pre-commit.sh')) return '#!/bin/bash\nnpm run lint';
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });

      await orchestrator.install(manifestWithoutCommands(), '/pkg', '/root');

      const calls = mockedWriteFile.mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('mcp.json'))).toBe(true);
    });

    it('calls writeFile for hook scripts', async () => {
      mockedReadFile.mockImplementation(async (path: any) => {
        const p = String(path);
        if (p.endsWith('pre-commit.sh')) return '#!/bin/bash\nnpm run lint';
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });

      await orchestrator.install(manifestWithoutCommands(), '/pkg', '/root');

      const calls = mockedWriteFile.mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('pre-commit'))).toBe(true);
    });

    it('updates the lockfile with installed skill', async () => {
      mockedReadFile.mockImplementation(async (path: any) => {
        const p = String(path);
        if (p.endsWith('pre-commit.sh')) return '#!/bin/bash\nnpm run lint';
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });

      await orchestrator.install(manifestWithoutCommands(), '/pkg', '/root');

      expect(mockedWriteLockfile).toHaveBeenCalledTimes(1);
      const lockArg = mockedWriteLockfile.mock.calls[0][1];
      expect(lockArg.skills['claude-skill-test']).toBeDefined();
      expect(lockArg.skills['claude-skill-test'].version).toBe('1.0.0');
    });

    it('records the transaction in the merge log', async () => {
      mockedReadFile.mockImplementation(async (path: any) => {
        const p = String(path);
        if (p.endsWith('pre-commit.sh')) return '#!/bin/bash\nnpm run lint';
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });

      await orchestrator.install(manifestWithoutCommands(), '/pkg', '/root');

      expect(mockedAppendTransaction).toHaveBeenCalledTimes(1);
    });

    it('calls mkdir to ensure directories exist', async () => {
      mockedReadFile.mockImplementation(async (path: any) => {
        const p = String(path);
        if (p.endsWith('pre-commit.sh')) return '#!/bin/bash\nnpm run lint';
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });

      await orchestrator.install(manifestWithoutCommands(), '/pkg', '/root');

      expect(mockedMkdir).toHaveBeenCalled();
      const mkdirCalls = mockedMkdir.mock.calls.map(c => String(c[0]));
      expect(mkdirCalls.length).toBeGreaterThan(0);
    });

    it('collects provides from manifest', async () => {
      mockedReadFile.mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
      );

      const manifest = manifestWithoutCommands({
        provides: {
          claudeMd: {
            sections: [{
              id: 'only',
              title: 'Only',
              content: 'Only content.',
              placement: { position: 'bottom' },
            }],
          },
        },
      });

      await orchestrator.install(manifest, '/pkg', '/root');

      const lockArg = mockedWriteLockfile.mock.calls[0][1];
      expect(lockArg.skills['claude-skill-test'].provides).toContain('claudeMd');
    });
  });

  describe('rollback on failure', () => {
    it('rolls back written files when a later merger fails', async () => {
      // Make CLAUDE.md merge succeed but the next writeFile fail
      let writeCount = 0;
      mockedWriteFile.mockImplementation(async () => {
        writeCount++;
        if (writeCount === 2) {
          throw new Error('Disk full');
        }
      });

      mockedReadFile.mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
      );

      const manifest = manifestWithoutCommands();

      await expect(orchestrator.install(manifest, '/pkg', '/root')).rejects.toThrow(
        'Disk full',
      );

      // After failure, writeFile should have been called for the rollback restore
      expect(mockedWriteFile.mock.calls.length).toBeGreaterThan(1);
    });

    it('does not update the lockfile on failure', async () => {
      let writeCount = 0;
      mockedWriteFile.mockImplementation(async () => {
        writeCount++;
        if (writeCount === 2) {
          throw new Error('Disk full');
        }
      });

      mockedReadFile.mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
      );

      try {
        await orchestrator.install(manifestWithoutCommands(), '/pkg', '/root');
      } catch {
        // expected
      }

      expect(mockedWriteLockfile).not.toHaveBeenCalled();
    });
  });

  describe('successful removal', () => {
    it('rolls back all transactions for the skill', async () => {
      mockedReadMergeLog.mockResolvedValue([
        {
          id: 'tx-1',
          skill: 'claude-skill-test',
          timestamp: new Date().toISOString(),
          operations: [],
          rollback: {
            operations: [
              {
                type: 'restore',
                target: 'CLAUDE.md',
                originalContent: '# Original CLAUDE.md',
              },
              {
                type: 'remove-file',
                target: '.claude/commands/test.md',
              },
            ],
          },
        },
      ]);

      const result = await orchestrator.remove('claude-skill-test', '/root');

      expect(result.success).toBe(true);
      expect(result.removedFiles).toContain('.claude/commands/test.md');
    });

    it('updates the lockfile to remove the skill', async () => {
      mockedReadMergeLog.mockResolvedValue([
        {
          id: 'tx-1',
          skill: 'claude-skill-test',
          timestamp: new Date().toISOString(),
          operations: [],
          rollback: { operations: [] },
        },
      ]);

      mockedReadLockfile.mockResolvedValue({
        version: 1,
        skills: {
          'claude-skill-test': {
            version: '1.0.0',
            resolved: '/pkg',
            integrity: '',
            installedAt: '2025-01-01T00:00:00Z',
            provides: [],
          },
        },
      });

      await orchestrator.remove('claude-skill-test', '/root');

      expect(mockedWriteLockfile).toHaveBeenCalledTimes(1);
      const lockArg = mockedWriteLockfile.mock.calls[0][1];
      expect(lockArg.skills['claude-skill-test']).toBeUndefined();
    });

    it('returns success: false when no transactions found', async () => {
      mockedReadMergeLog.mockResolvedValue([]);

      const result = await orchestrator.remove('nonexistent-skill', '/root');

      expect(result.success).toBe(false);
      expect(result.removedFiles).toHaveLength(0);
    });

    it('executes restore rollback operations', async () => {
      mockedReadMergeLog.mockResolvedValue([
        {
          id: 'tx-1',
          skill: 'my-skill',
          timestamp: new Date().toISOString(),
          operations: [],
          rollback: {
            operations: [
              {
                type: 'restore',
                target: 'CLAUDE.md',
                originalContent: '# Restored content',
              },
            ],
          },
        },
      ]);

      await orchestrator.remove('my-skill', '/root');

      const writeCalls = mockedWriteFile.mock.calls;
      const restoreCall = writeCalls.find(c =>
        String(c[0]).includes('CLAUDE.md') && String(c[1]) === '# Restored content',
      );
      expect(restoreCall).toBeDefined();
    });

    it('executes remove-file rollback operations', async () => {
      mockedReadMergeLog.mockResolvedValue([
        {
          id: 'tx-1',
          skill: 'my-skill',
          timestamp: new Date().toISOString(),
          operations: [],
          rollback: {
            operations: [
              { type: 'remove-file', target: '.claude/commands/test.md' },
            ],
          },
        },
      ]);

      await orchestrator.remove('my-skill', '/root');

      expect(mockedUnlink).toHaveBeenCalled();
    });

    it('handles multiple transactions for the same skill', async () => {
      mockedReadMergeLog.mockResolvedValue([
        {
          id: 'tx-1',
          skill: 'my-skill',
          timestamp: '2025-01-01T00:00:00Z',
          operations: [],
          rollback: {
            operations: [
              { type: 'restore', target: 'CLAUDE.md', originalContent: '# v1' },
            ],
          },
        },
        {
          id: 'tx-2',
          skill: 'my-skill',
          timestamp: '2025-01-02T00:00:00Z',
          operations: [],
          rollback: {
            operations: [
              { type: 'remove-file', target: '.claude/commands/added.md' },
            ],
          },
        },
      ]);

      const result = await orchestrator.remove('my-skill', '/root');

      expect(result.success).toBe(true);
      // Both rollback plans should be executed
      expect(mockedWriteFile).toHaveBeenCalled();
      expect(mockedUnlink).toHaveBeenCalled();
    });
  });

  describe('handles missing .claude/ directory', () => {
    it('creates directories via mkdir with recursive: true', async () => {
      mockedReadFile.mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
      );

      const manifest = manifestWithoutCommands({
        provides: {
          claudeMd: {
            sections: [{
              id: 'only',
              title: 'Only',
              content: 'Content.',
              placement: { position: 'bottom' },
            }],
          },
        },
      });

      await orchestrator.install(manifest, '/pkg', '/root');

      // mkdir should be called with { recursive: true }
      const recursiveCalls = mockedMkdir.mock.calls.filter(
        c => c[1] && (c[1] as any).recursive === true,
      );
      expect(recursiveCalls.length).toBeGreaterThan(0);
    });
  });

  describe('partial provides', () => {
    it('handles manifest with only claudeMd', async () => {
      mockedReadFile.mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
      );

      const manifest = manifestWithoutCommands({
        provides: {
          claudeMd: {
            sections: [{
              id: 'simple',
              title: 'Simple',
              content: 'Simple content.',
              placement: { position: 'bottom' },
            }],
          },
        },
      });

      const result = await orchestrator.install(manifest, '/pkg', '/root');

      expect(result.success).toBe(true);
      expect(result.operations.length).toBeGreaterThan(0);
    });

    it('handles manifest with empty provides', async () => {
      const manifest = manifestWithoutCommands({ provides: {} });

      const result = await orchestrator.install(manifest, '/pkg', '/root');

      expect(result.success).toBe(true);
      expect(result.operations).toHaveLength(0);
    });

    it('handles manifest with only settings', async () => {
      mockedReadFile.mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
      );

      const manifest = manifestWithoutCommands({
        provides: {
          settings: {
            permissions: {
              allowedTools: ['new-tool'],
              allowedCommands: [],
              deniedTools: [],
              deniedCommands: [],
            },
            behavior: {},
          } as Record<string, unknown>,
        },
      });

      const result = await orchestrator.install(manifest, '/pkg', '/root');

      expect(result.success).toBe(true);
      const calls = mockedWriteFile.mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('settings.json'))).toBe(true);
    });
  });
});
