export type HookHandler<T extends unknown[]> = (...args: T) => Promise<void> | void;
export type WaterfallHandler<T> = (value: T) => Promise<T> | T;

export interface Hook<T extends unknown[]> {
  tap(name: string, handler: HookHandler<T>): void;
  call(...args: T): Promise<void>;
}

export interface WaterfallHook<T> {
  tap(name: string, handler: WaterfallHandler<T>): void;
  call(value: T): Promise<T>;
}
