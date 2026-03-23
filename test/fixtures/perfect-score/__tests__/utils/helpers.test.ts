import { describe, expect, it } from 'vitest';

import { deepClone, formatCurrency, slugify, truncate } from '../../src/utils/helpers.js';

describe('formatCurrency', () => {
  it('formats USD correctly', () => {
    expect(formatCurrency(29.99, 'USD')).toBe('$29.99');
  });

  it('formats zero', () => {
    expect(formatCurrency(0, 'USD')).toBe('$0.00');
  });

  it('formats large numbers with grouping', () => {
    const result = formatCurrency(1234567.89, 'USD');
    expect(result).toBe('$1,234,567.89');
  });
});

describe('slugify', () => {
  it('converts a simple string', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('strips special characters', () => {
    expect(slugify('Hello, World!')).toBe('hello-world');
  });

  it('collapses multiple spaces and hyphens', () => {
    expect(slugify('  lots   of   spaces  ')).toBe('lots-of-spaces');
  });

  it('handles already-slugified input', () => {
    expect(slugify('already-good')).toBe('already-good');
  });
});

describe('truncate', () => {
  it('returns the string unchanged when within limit', () => {
    expect(truncate('short', 10)).toBe('short');
  });

  it('truncates and appends ellipsis', () => {
    expect(truncate('a very long string', 10)).toBe('a very ...');
  });

  it('throws when maxLen is less than 4', () => {
    expect(() => truncate('test', 3)).toThrow(RangeError);
  });
});

describe('deepClone', () => {
  it('clones a nested object without shared references', () => {
    const original = { a: 1, b: { c: [2, 3] } };
    const cloned = deepClone(original);

    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
    expect(cloned.b).not.toBe(original.b);
    expect(cloned.b.c).not.toBe(original.b.c);
  });

  it('clones primitive values', () => {
    expect(deepClone(42)).toBe(42);
    expect(deepClone('hello')).toBe('hello');
  });
});
