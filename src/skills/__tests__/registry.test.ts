import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { SkillRegistry } from '../registry.js';

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function okJson(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
  } as unknown as Response;
}

function notFound(): Response {
  return {
    ok: false,
    status: 404,
    json: () => Promise.resolve({ error: 'Not found' }),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// search()
// ---------------------------------------------------------------------------

describe('SkillRegistry.search', () => {
  it('returns results when npm responds with packages', async () => {
    mockFetch.mockResolvedValueOnce(
      okJson({
        objects: [
          {
            package: {
              name: 'claude-skill-typescript',
              version: '1.0.0',
              description: 'TypeScript skill for claude-adapt',
              keywords: ['claude-adapt-skill', 'typescript'],
              publisher: { username: 'author' },
            },
          },
          {
            package: {
              name: 'claude-skill-react',
              version: '2.1.0',
              description: 'React skill',
              keywords: ['claude-adapt-skill', 'react', 'frontend'],
            },
          },
        ],
        total: 2,
      }),
    );

    const registry = new SkillRegistry();
    const result = await registry.search('typescript');

    expect(result.source).toBe('npm');
    expect(result.total).toBe(2);
    expect(result.skills).toHaveLength(2);

    // First skill
    expect(result.skills[0].name).toBe('claude-skill-typescript');
    expect(result.skills[0].displayName).toBe('Typescript');
    expect(result.skills[0].description).toBe('TypeScript skill for claude-adapt');
    expect(result.skills[0].tags).toEqual(['typescript']);
    expect(result.skills[0].downloads).toBe(0);
    expect(result.skills[0].verified).toBe(false);
    expect(result.skills[0].activationConditions).toEqual([]);

    // Second skill
    expect(result.skills[1].name).toBe('claude-skill-react');
    expect(result.skills[1].tags).toEqual(['react', 'frontend']);

    // Check the URL
    expect(mockFetch).toHaveBeenCalledOnce();
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('keywords:claude-adapt-skill');
    expect(calledUrl).toContain('typescript');
  });

  it('returns empty results when npm returns no matches', async () => {
    mockFetch.mockResolvedValueOnce(
      okJson({ objects: [], total: 0 }),
    );

    const registry = new SkillRegistry();
    const result = await registry.search('nonexistent-skill');

    expect(result.skills).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.source).toBe('npm');
  });

  it('handles network errors gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('fetch failed'));

    const registry = new SkillRegistry();
    const result = await registry.search('anything');

    expect(result.skills).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.source).toBe('npm');
  });

  it('handles non-ok HTTP responses', async () => {
    mockFetch.mockResolvedValueOnce(notFound());

    const registry = new SkillRegistry();
    const result = await registry.search('anything');

    expect(result.skills).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.source).toBe('npm');
  });

  it('handles abort/timeout errors gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new DOMException('The operation was aborted', 'AbortError'));

    const registry = new SkillRegistry();
    const result = await registry.search('anything');

    expect(result.skills).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.source).toBe('npm');
  });
});

// ---------------------------------------------------------------------------
// info()
// ---------------------------------------------------------------------------

describe('SkillRegistry.info', () => {
  it('returns entry when package exists with claude-adapt metadata', async () => {
    mockFetch.mockResolvedValueOnce(
      okJson({
        name: 'claude-skill-typescript',
        description: 'TypeScript skill for claude-adapt',
        'dist-tags': { latest: '1.0.0' },
        versions: {
          '1.0.0': {
            name: 'claude-skill-typescript',
            version: '1.0.0',
            description: 'TypeScript skill for claude-adapt',
            keywords: ['claude-adapt-skill', 'typescript'],
            'claude-adapt': {
              displayName: 'TypeScript Pro',
              tags: ['typescript', 'strict'],
              activationConditions: [{ type: 'language', value: 'typescript' }],
            },
          },
        },
      }),
    );

    const registry = new SkillRegistry();
    const entry = await registry.info('claude-skill-typescript');

    expect(entry).not.toBeNull();
    expect(entry!.name).toBe('claude-skill-typescript');
    expect(entry!.displayName).toBe('TypeScript Pro');
    expect(entry!.description).toBe('TypeScript skill for claude-adapt');
    expect(entry!.tags).toEqual(['typescript', 'strict']);
    expect(entry!.activationConditions).toEqual([
      { type: 'language', value: 'typescript' },
    ]);
    expect(entry!.downloads).toBe(0);
    expect(entry!.verified).toBe(false);
  });

  it('falls back to derived display name when claude-adapt metadata is absent', async () => {
    mockFetch.mockResolvedValueOnce(
      okJson({
        name: 'claude-skill-react',
        description: 'React skill',
        'dist-tags': { latest: '1.0.0' },
        versions: {
          '1.0.0': {
            name: 'claude-skill-react',
            version: '1.0.0',
            description: 'React skill',
            keywords: ['claude-adapt-skill', 'react'],
          },
        },
      }),
    );

    const registry = new SkillRegistry();
    const entry = await registry.info('claude-skill-react');

    expect(entry).not.toBeNull();
    expect(entry!.displayName).toBe('React');
    expect(entry!.tags).toEqual(['react']);
    expect(entry!.activationConditions).toEqual([]);
  });

  it('returns null when package does not exist', async () => {
    mockFetch.mockResolvedValueOnce(notFound());

    const registry = new SkillRegistry();
    const entry = await registry.info('nonexistent-package');

    expect(entry).toBeNull();
  });

  it('handles network errors gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ENOTFOUND'));

    const registry = new SkillRegistry();
    const entry = await registry.info('claude-skill-typescript');

    expect(entry).toBeNull();
  });

  it('handles abort/timeout errors gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new DOMException('The operation was aborted', 'AbortError'));

    const registry = new SkillRegistry();
    const entry = await registry.info('claude-skill-typescript');

    expect(entry).toBeNull();
  });

  it('returns null when no versions are available', async () => {
    mockFetch.mockResolvedValueOnce(
      okJson({
        name: 'claude-skill-empty',
        description: 'Empty',
        'dist-tags': {},
        versions: {},
      }),
    );

    const registry = new SkillRegistry();
    const entry = await registry.info('claude-skill-empty');

    expect(entry).toBeNull();
  });
});
