import type { Hook, HookHandler, WaterfallHandler, WaterfallHook } from './types.js';

interface TapEntry<H> {
  name: string;
  handler: H;
}

export class AsyncSeriesHook<T extends unknown[]> implements Hook<T> {
  private taps: TapEntry<HookHandler<T>>[] = [];

  tap(name: string, handler: HookHandler<T>): void {
    this.taps.push({ name, handler });
  }

  async call(...args: T): Promise<void> {
    for (const { handler } of this.taps) {
      await handler(...args);
    }
  }
}

export class AsyncParallelHook<T extends unknown[]> implements Hook<T> {
  private taps: TapEntry<HookHandler<T>>[] = [];

  tap(name: string, handler: HookHandler<T>): void {
    this.taps.push({ name, handler });
  }

  async call(...args: T): Promise<void> {
    await Promise.all(this.taps.map(({ handler }) => handler(...args)));
  }
}

export class AsyncSeriesWaterfallHook<T> implements WaterfallHook<T> {
  private taps: TapEntry<WaterfallHandler<T>>[] = [];

  tap(name: string, handler: WaterfallHandler<T>): void {
    this.taps.push({ name, handler });
  }

  async call(value: T): Promise<T> {
    let current = value;
    for (const { handler } of this.taps) {
      current = await handler(current);
    }
    return current;
  }
}

export class HookRegistry {
  private hooks = new Map<string, Hook<unknown[]> | WaterfallHook<unknown>>();

  createHook<T extends unknown[]>(name: string): AsyncSeriesHook<T> {
    const hook = new AsyncSeriesHook<T>();
    this.hooks.set(name, hook as unknown as Hook<unknown[]>);
    return hook;
  }

  createParallelHook<T extends unknown[]>(name: string): AsyncParallelHook<T> {
    const hook = new AsyncParallelHook<T>();
    this.hooks.set(name, hook as unknown as Hook<unknown[]>);
    return hook;
  }

  createWaterfallHook<T>(name: string): AsyncSeriesWaterfallHook<T> {
    const hook = new AsyncSeriesWaterfallHook<T>();
    this.hooks.set(name, hook as unknown as WaterfallHook<unknown>);
    return hook;
  }

  getHook(name: string): Hook<unknown[]> | WaterfallHook<unknown> | undefined {
    return this.hooks.get(name);
  }
}
