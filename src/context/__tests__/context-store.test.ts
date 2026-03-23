import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ContextStoreManager } from '../context-store.js';
import type { ContextStore } from '../types.js';

// Mock node:fs/promises
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  rename: vi.fn(),
}));

// Mock node:crypto
vi.mock('node:crypto', () => ({
  randomUUID: vi.fn(() => 'test-uuid-1234'),
}));

import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';

const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);
const mockMkdir = vi.mocked(mkdir);
const mockRename = vi.mocked(rename);

function makeValidStore(overrides: Partial<ContextStore> = {}): ContextStore {
  return {
    version: 1,
    projectId: 'test/project',
    lastSync: '2025-06-01T00:00:00Z',
    lastSessionHash: 'abc123',
    decisions: [],
    patterns: [],
    hotspots: [],
    gotchas: [],
    conventions: {
      timestamp: '2025-06-01T00:00:00Z',
      naming: { files: {}, functions: {}, classes: {} },
      imports: { style: {}, ordering: '' },
      fileSize: { p50: 0, p90: 0, max: 0 },
    },
    sessions: [],
    insights: [],
    ...overrides,
  };
}

describe('ContextStoreManager', () => {
  let manager: ContextStoreManager;

  beforeEach(() => {
    manager = new ContextStoreManager();
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Reading
  // ---------------------------------------------------------------------------

  describe('read', () => {
    it('reads and parses an existing valid context store', async () => {
      const store = makeValidStore({ projectId: 'my/project' });
      mockReadFile.mockResolvedValueOnce(JSON.stringify(store));

      const result = await manager.read('/fake/root');

      expect(result.version).toBe(1);
      expect(result.projectId).toBe('my/project');
      expect(result.decisions).toEqual([]);
      expect(result.sessions).toEqual([]);
    });

    it('passes the correct file path to readFile', async () => {
      mockReadFile.mockResolvedValueOnce(JSON.stringify(makeValidStore()));

      await manager.read('/fake/root');

      expect(mockReadFile).toHaveBeenCalledWith(
        expect.stringContaining('.claude-adapt'),
        'utf-8',
      );
    });

    it('returns a default store when file does not exist', async () => {
      mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));

      const result = await manager.read('/fake/root');

      expect(result.version).toBe(1);
      expect(result.projectId).toBe('fake/root');
      expect(result.lastSync).toBe('');
      expect(result.decisions).toEqual([]);
      expect(result.hotspots).toEqual([]);
      expect(result.sessions).toEqual([]);
    });

    it('returns a default store when JSON is invalid', async () => {
      mockReadFile.mockResolvedValueOnce('not valid json!!!');

      const result = await manager.read('/fake/root');

      expect(result.version).toBe(1);
      expect(result.decisions).toEqual([]);
    });

    it('returns a default store when structure validation fails', async () => {
      // Missing required fields
      mockReadFile.mockResolvedValueOnce(JSON.stringify({ foo: 'bar' }));

      const result = await manager.read('/fake/root');

      expect(result.version).toBe(1);
      expect(result.decisions).toEqual([]);
    });

    it('rejects store with wrong version number', async () => {
      const badStore = { ...makeValidStore(), version: 2 };
      mockReadFile.mockResolvedValueOnce(JSON.stringify(badStore));

      const result = await manager.read('/fake/root');

      // Should fall through to default because version !== 1
      expect(result.version).toBe(1);
      expect(result.lastSync).toBe('');
    });

    it('rejects store with non-string projectId', async () => {
      const badStore = { ...makeValidStore(), projectId: 42 };
      mockReadFile.mockResolvedValueOnce(JSON.stringify(badStore));

      const result = await manager.read('/fake/root');

      expect(result.lastSync).toBe('');
    });

    it('rejects store with non-array decisions', async () => {
      const badStore = { ...makeValidStore(), decisions: 'not-array' };
      mockReadFile.mockResolvedValueOnce(JSON.stringify(badStore));

      const result = await manager.read('/fake/root');

      expect(result.decisions).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Writing (atomic temp-file pattern)
  // ---------------------------------------------------------------------------

  describe('write', () => {
    it('creates directory before writing', async () => {
      mockMkdir.mockResolvedValueOnce(undefined);
      mockWriteFile.mockResolvedValueOnce(undefined);
      mockRename.mockResolvedValueOnce(undefined);

      await manager.write('/fake/root', makeValidStore());

      expect(mockMkdir).toHaveBeenCalledWith(
        expect.stringContaining('.claude-adapt'),
        { recursive: true },
      );
    });

    it('writes to a temporary file first', async () => {
      mockMkdir.mockResolvedValueOnce(undefined);
      mockWriteFile.mockResolvedValueOnce(undefined);
      mockRename.mockResolvedValueOnce(undefined);

      await manager.write('/fake/root', makeValidStore());

      // First writeFile call should be to the temp path
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('context.test-uuid-1234.tmp'),
        expect.any(String),
        'utf-8',
      );
    });

    it('renames temp file to final path', async () => {
      mockMkdir.mockResolvedValueOnce(undefined);
      mockWriteFile.mockResolvedValueOnce(undefined);
      mockRename.mockResolvedValueOnce(undefined);

      await manager.write('/fake/root', makeValidStore());

      expect(mockRename).toHaveBeenCalledWith(
        expect.stringContaining('context.test-uuid-1234.tmp'),
        expect.stringContaining('context.json'),
      );
    });

    it('writes pretty-printed JSON', async () => {
      mockMkdir.mockResolvedValueOnce(undefined);
      mockWriteFile.mockResolvedValueOnce(undefined);
      mockRename.mockResolvedValueOnce(undefined);

      const store = makeValidStore();
      await manager.write('/fake/root', store);

      const writtenJson = mockWriteFile.mock.calls[0]![1] as string;
      expect(writtenJson).toBe(JSON.stringify(store, null, 2));
    });

    it('falls back to direct write when rename fails (Windows)', async () => {
      mockMkdir.mockResolvedValueOnce(undefined);
      mockWriteFile.mockResolvedValue(undefined);
      mockRename.mockRejectedValueOnce(new Error('EPERM'));

      await manager.write('/fake/root', makeValidStore());

      // Should have written twice: once to temp, once direct
      expect(mockWriteFile).toHaveBeenCalledTimes(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Default store creation
  // ---------------------------------------------------------------------------

  describe('default store creation', () => {
    it('derives projectId from the last two path segments', async () => {
      mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));

      const result = await manager.read('/home/user/my-project');

      expect(result.projectId).toBe('user/my-project');
    });

    it('handles Windows-style paths', async () => {
      mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));

      const result = await manager.read('C:\\Users\\dev\\project');

      expect(result.projectId).toBe('dev/project');
    });

    it('creates default empty conventions', async () => {
      mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));

      const result = await manager.read('/fake/root');

      expect(result.conventions.naming.files).toEqual({});
      expect(result.conventions.naming.functions).toEqual({});
      expect(result.conventions.naming.classes).toEqual({});
      expect(result.conventions.imports.style).toEqual({});
      expect(result.conventions.imports.ordering).toBe('');
      expect(result.conventions.fileSize.p50).toBe(0);
      expect(result.conventions.fileSize.p90).toBe(0);
      expect(result.conventions.fileSize.max).toBe(0);
    });

    it('creates empty arrays for all collection fields', async () => {
      mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));

      const result = await manager.read('/fake/root');

      expect(result.decisions).toEqual([]);
      expect(result.patterns).toEqual([]);
      expect(result.hotspots).toEqual([]);
      expect(result.gotchas).toEqual([]);
      expect(result.sessions).toEqual([]);
      expect(result.insights).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Reset
  // ---------------------------------------------------------------------------

  describe('reset', () => {
    it('writes a fresh default store and returns it', async () => {
      mockMkdir.mockResolvedValueOnce(undefined);
      mockWriteFile.mockResolvedValueOnce(undefined);
      mockRename.mockResolvedValueOnce(undefined);

      const result = await manager.reset('/home/user/project');

      expect(result.version).toBe(1);
      expect(result.projectId).toBe('user/project');
      expect(result.decisions).toEqual([]);
      expect(mockWriteFile).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Validation of store structure
  // ---------------------------------------------------------------------------

  describe('validation', () => {
    it('rejects null as invalid', async () => {
      mockReadFile.mockResolvedValueOnce('null');

      const result = await manager.read('/fake/root');
      expect(result.lastSync).toBe('');
    });

    it('rejects arrays as invalid', async () => {
      mockReadFile.mockResolvedValueOnce('[]');

      const result = await manager.read('/fake/root');
      expect(result.lastSync).toBe('');
    });

    it('rejects store missing hotspots array', async () => {
      const partial = {
        version: 1,
        projectId: 'test',
        lastSync: '',
        decisions: [],
        sessions: [],
        // hotspots missing
      };
      mockReadFile.mockResolvedValueOnce(JSON.stringify(partial));

      const result = await manager.read('/fake/root');
      expect(result.hotspots).toEqual([]);
    });

    it('accepts a fully valid store', async () => {
      const store = makeValidStore({
        decisions: [
          {
            id: 'dec-1',
            timestamp: '2025-06-01T00:00:00Z',
            sessionId: 's1',
            title: 'Test',
            description: 'Test decision',
            rationale: 'Test',
            filesAffected: [],
            diffSummary: 'test',
            category: 'architecture',
            impact: 'low',
            confidence: 0.8,
            applied: false,
          },
        ],
      });
      mockReadFile.mockResolvedValueOnce(JSON.stringify(store));

      const result = await manager.read('/fake/root');

      expect(result.decisions).toHaveLength(1);
      expect(result.decisions[0]!.id).toBe('dec-1');
    });
  });
});
