/**
 * App B - Shared utilities package.
 *
 * Provides common functions used across the monorepo.
 */

export function greet(name: string): string {
  return `Hello from ${name}!`;
}

export function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}
