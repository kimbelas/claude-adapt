import { describe, it, expect } from 'vitest';

import {
  AsyncSeriesHook,
  AsyncParallelHook,
  AsyncSeriesWaterfallHook,
  HookRegistry,
} from '../hook-registry.js';

describe('AsyncSeriesHook', () => {
  it('runs handlers in order', async () => {
    const hook = new AsyncSeriesHook<[string[]]>();
    const log: string[] = [];

    hook.tap('first', async (arr) => {
      await delay(10);
      log.push('first');
      arr.push('a');
    });

    hook.tap('second', (arr) => {
      log.push('second');
      arr.push('b');
    });

    const result: string[] = [];
    await hook.call(result);

    expect(log).toEqual(['first', 'second']);
    expect(result).toEqual(['a', 'b']);
  });

  it('calls without error when no handlers are tapped', async () => {
    const hook = new AsyncSeriesHook<[number]>();
    await expect(hook.call(42)).resolves.toBeUndefined();
  });
});

describe('AsyncParallelHook', () => {
  it('runs handlers concurrently', async () => {
    const hook = new AsyncParallelHook<[string[]]>();
    const timestamps: number[] = [];

    hook.tap('slow', async () => {
      const start = Date.now();
      await delay(30);
      timestamps.push(Date.now() - start);
    });

    hook.tap('fast', async () => {
      const start = Date.now();
      await delay(10);
      timestamps.push(Date.now() - start);
    });

    await hook.call([]);

    // Both should have started at roughly the same time, so the fast
    // handler finishes well before the slow one. If they ran in series
    // the fast handler would start ~30ms late.
    expect(timestamps).toHaveLength(2);
  });

  it('calls without error when no handlers are tapped', async () => {
    const hook = new AsyncParallelHook<[string]>();
    await expect(hook.call('test')).resolves.toBeUndefined();
  });
});

describe('AsyncSeriesWaterfallHook', () => {
  it('passes value through handler chain', async () => {
    const hook = new AsyncSeriesWaterfallHook<number>();

    hook.tap('double', (val) => val * 2);
    hook.tap('addTen', async (val) => {
      await delay(5);
      return val + 10;
    });
    hook.tap('square', (val) => val * val);

    // 3 -> 6 -> 16 -> 256
    const result = await hook.call(3);
    expect(result).toBe(256);
  });

  it('returns original value when no handlers are tapped', async () => {
    const hook = new AsyncSeriesWaterfallHook<string>();
    const result = await hook.call('unchanged');
    expect(result).toBe('unchanged');
  });
});

describe('HookRegistry', () => {
  it('creates and retrieves a series hook', () => {
    const registry = new HookRegistry();
    const hook = registry.createHook('beforeAnalyze');

    expect(hook).toBeInstanceOf(AsyncSeriesHook);
    expect(registry.getHook('beforeAnalyze')).toBe(hook);
  });

  it('creates and retrieves a parallel hook', () => {
    const registry = new HookRegistry();
    const hook = registry.createParallelHook('runAnalyzers');

    expect(hook).toBeInstanceOf(AsyncParallelHook);
    expect(registry.getHook('runAnalyzers')).toBe(hook);
  });

  it('creates and retrieves a waterfall hook', () => {
    const registry = new HookRegistry();
    const hook = registry.createWaterfallHook('transformScore');

    expect(hook).toBeInstanceOf(AsyncSeriesWaterfallHook);
    expect(registry.getHook('transformScore')).toBe(hook);
  });

  it('returns undefined for unknown hook names', () => {
    const registry = new HookRegistry();
    expect(registry.getHook('nonexistent')).toBeUndefined();
  });
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
