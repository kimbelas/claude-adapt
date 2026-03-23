/**
 * Pure utility functions used across the application.
 *
 * Every function in this module is stateless and free of side effects.
 */

/**
 * Formats a numeric amount as a locale-aware currency string.
 *
 * @param amount - The numeric value to format.
 * @param currency - An ISO 4217 currency code (e.g. "USD", "EUR").
 * @returns The formatted currency string.
 */
export function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

/**
 * Converts an arbitrary string into a URL-safe slug.
 *
 * @param text - The input string.
 * @returns A lower-cased, hyphen-separated slug.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');
}

/**
 * Truncates a string to the given maximum length, appending an ellipsis if truncated.
 *
 * @param str - The string to truncate.
 * @param maxLen - The maximum allowed length (must be >= 4).
 * @returns The original string if within limits, or a truncated version with "...".
 */
export function truncate(str: string, maxLen: number): string {
  if (maxLen < 4) {
    throw new RangeError('maxLen must be at least 4');
  }
  if (str.length <= maxLen) {
    return str;
  }
  return `${str.slice(0, maxLen - 3)}...`;
}

/**
 * Creates a deep clone of a JSON-serialisable object.
 *
 * @param obj - The object to clone.
 * @returns A deep copy with no shared references.
 */
export function deepClone<T>(obj: T): T {
  return structuredClone(obj);
}
