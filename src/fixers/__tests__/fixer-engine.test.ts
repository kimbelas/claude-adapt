import { describe, it, expect, vi } from 'vitest';

import { FixerEngine } from '../fixer-engine.js';
import type { FixAction, FixContext, FixResult, FixRecommendation } from '../types.js';
import type { RepoProfile } from '../../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProfile(overrides: Partial<RepoProfile> = {}): RepoProfile {
  return {
    languages: [{ name: 'TypeScript', percentage: 90, fileCount: 50 }],
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

function makeRecommendation(
  signal: string,
  gap: number,
  effort: 'low' | 'medium' | 'high' = 'low',
): FixRecommendation {
  return {
    id: `rec.${signal}`,
    signal,
    title: `Fix ${signal}`,
    gap,
    effort,
  };
}

function makeContext(
  recommendations: FixRecommendation[],
  overrides: Partial<FixContext> = {},
): FixContext {
  return {
    targetPath: '/tmp/test-repo',
    profile: makeProfile(),
    recommendations,
    dryRun: false,
    ...overrides,
  };
}

function makeFixer(
  signalId: string,
  result: Partial<FixResult> = {},
): FixAction {
  return {
    signalId,
    type: 'create-file',
    description: `Fix for ${signalId}`,
    execute: vi.fn().mockResolvedValue({
      signalId,
      applied: true,
      description: `Applied fix for ${signalId}`,
      ...result,
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FixerEngine', () => {
  it('runs only fixers whose signal has a recommendation with gap > 0', async () => {
    const fixerA = makeFixer('signal.a');
    const fixerB = makeFixer('signal.b');
    const fixerC = makeFixer('signal.c');

    const engine = new FixerEngine([fixerA, fixerB, fixerC]);

    const recs = [
      makeRecommendation('signal.a', 0.8),
      // signal.b has no recommendation
      makeRecommendation('signal.c', 0.6),
    ];

    const ctx = makeContext(recs);
    const results = await engine.run(ctx);

    expect(fixerA.execute).toHaveBeenCalledOnce();
    expect(fixerB.execute).not.toHaveBeenCalled();
    expect(fixerC.execute).toHaveBeenCalledOnce();
    expect(results).toHaveLength(2);
  });

  it('does not run fixers when gap is 0', async () => {
    const fixer = makeFixer('signal.a');
    const engine = new FixerEngine([fixer]);

    const recs = [makeRecommendation('signal.a', 0)];
    const ctx = makeContext(recs);
    const results = await engine.run(ctx);

    expect(fixer.execute).not.toHaveBeenCalled();
    expect(results).toHaveLength(0);
  });

  it('returns empty array when no fixers are applicable', async () => {
    const fixer = makeFixer('signal.a');
    const engine = new FixerEngine([fixer]);

    const ctx = makeContext([]); // no recommendations
    const results = await engine.run(ctx);

    expect(results).toHaveLength(0);
  });

  it('handles fixer errors gracefully', async () => {
    const fixer: FixAction = {
      signalId: 'signal.a',
      type: 'create-file',
      description: 'Broken fixer',
      execute: vi.fn().mockRejectedValue(new Error('disk full')),
    };

    const engine = new FixerEngine([fixer]);
    const recs = [makeRecommendation('signal.a', 0.9)];
    const ctx = makeContext(recs);

    const results = await engine.run(ctx);

    expect(results).toHaveLength(1);
    expect(results[0].applied).toBe(false);
    expect(results[0].skipped).toContain('disk full');
  });

  it('reports skipped fixers when already applied', async () => {
    const fixer = makeFixer('signal.a', {
      applied: false,
      skipped: 'already present',
    });

    const engine = new FixerEngine([fixer]);
    const recs = [makeRecommendation('signal.a', 0.7)];
    const ctx = makeContext(recs);

    const results = await engine.run(ctx);

    expect(results).toHaveLength(1);
    expect(results[0].applied).toBe(false);
    expect(results[0].skipped).toBe('already present');
  });

  it('passes full context to each fixer', async () => {
    const fixer = makeFixer('signal.a');
    const engine = new FixerEngine([fixer]);

    const recs = [makeRecommendation('signal.a', 0.5, 'low')];
    const profile = makeProfile({ packageManager: 'yarn' });
    const ctx = makeContext(recs, {
      targetPath: '/custom/path',
      profile,
      dryRun: true,
    });

    await engine.run(ctx);

    expect(fixer.execute).toHaveBeenCalledWith(ctx);
  });

  it('runs fixers in order and collects all results', async () => {
    const order: string[] = [];

    const fixerA: FixAction = {
      signalId: 'signal.a',
      type: 'create-file',
      description: 'First',
      execute: vi.fn(async () => {
        order.push('a');
        return { signalId: 'signal.a', applied: true, description: 'First' };
      }),
    };

    const fixerB: FixAction = {
      signalId: 'signal.b',
      type: 'create-file',
      description: 'Second',
      execute: vi.fn(async () => {
        order.push('b');
        return { signalId: 'signal.b', applied: true, description: 'Second' };
      }),
    };

    const engine = new FixerEngine([fixerA, fixerB]);

    const recs = [
      makeRecommendation('signal.a', 0.8),
      makeRecommendation('signal.b', 0.6),
    ];

    const results = await engine.run(makeContext(recs));

    expect(order).toEqual(['a', 'b']);
    expect(results).toHaveLength(2);
    expect(results[0].signalId).toBe('signal.a');
    expect(results[1].signalId).toBe('signal.b');
  });

  describe('printSummary', () => {
    it('does not throw for empty results', () => {
      expect(() => FixerEngine.printSummary([])).not.toThrow();
    });

    it('does not throw for mixed results', () => {
      const results: FixResult[] = [
        {
          signalId: 'sig.a',
          applied: true,
          description: 'Created file',
          filesCreated: ['foo.md'],
        },
        {
          signalId: 'sig.b',
          applied: false,
          description: 'Skipped',
          skipped: 'already exists',
        },
        {
          signalId: 'sig.c',
          applied: true,
          description: 'Installed packages',
          packagesInstalled: ['@types/node'],
        },
        {
          signalId: 'sig.d',
          applied: true,
          description: 'Modified config',
          filesModified: ['tsconfig.json'],
        },
      ];

      expect(() => FixerEngine.printSummary(results)).not.toThrow();
    });
  });
});
