import { describe, it, expect, beforeEach } from 'vitest';

import { Container } from '../container.js';

describe('Container', () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  it('registers and resolves a value', () => {
    const token = Symbol('test');
    container.register(token, () => 'hello');

    expect(container.resolve(token)).toBe('hello');
  });

  it('returns the same instance for singleton registrations', () => {
    const token = Symbol('singleton');
    container.register(token, () => ({ id: Math.random() }), true);

    const first = container.resolve<{ id: number }>(token);
    const second = container.resolve<{ id: number }>(token);

    expect(first).toBe(second);
  });

  it('returns new instances for non-singleton registrations', () => {
    const token = Symbol('transient');
    container.register(token, () => ({ id: Math.random() }));

    const first = container.resolve<{ id: number }>(token);
    const second = container.resolve<{ id: number }>(token);

    expect(first).not.toBe(second);
  });

  it('throws on unregistered token', () => {
    const token = Symbol('missing');

    expect(() => container.resolve(token)).toThrow(
      'No registration found for token: Symbol(missing)',
    );
  });

  it('clears all registrations on reset', () => {
    const token = Symbol('clearable');
    container.register(token, () => 42);

    expect(container.has(token)).toBe(true);

    container.reset();

    expect(container.has(token)).toBe(false);
    expect(() => container.resolve(token)).toThrow();
  });

  it('returns correct boolean from has()', () => {
    const registered = Symbol('registered');
    const unregistered = Symbol('unregistered');

    container.register(registered, () => 'value');

    expect(container.has(registered)).toBe(true);
    expect(container.has(unregistered)).toBe(false);
  });
});
