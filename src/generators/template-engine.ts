/**
 * Template engine backed by Handlebars.
 *
 * Provides a thin wrapper around Handlebars that pre-registers
 * common helpers and compiles template strings with a data context.
 * Supports {{variable}}, {{#if}}, {{#each}}, and {{#unless}} blocks.
 */

import Handlebars from 'handlebars';

// ---------------------------------------------------------------------------
// Custom helpers
// ---------------------------------------------------------------------------

/** Register helpers once at module load. */
function registerHelpers(hbs: typeof Handlebars): void {
  /**
   * Join an array with a separator.
   * Usage: {{join items ", "}}
   */
  hbs.registerHelper('join', (items: unknown[], separator: string) => {
    if (!Array.isArray(items)) return '';
    return items.join(typeof separator === 'string' ? separator : ', ');
  });

  /**
   * Equality check.
   * Usage: {{#if (eq a b)}}...{{/if}}
   */
  hbs.registerHelper('eq', (a: unknown, b: unknown) => a === b);

  /**
   * Greater-than check.
   * Usage: {{#if (gt count 5)}}...{{/if}}
   */
  hbs.registerHelper('gt', (a: number, b: number) => a > b);

  /**
   * Less-than check.
   * Usage: {{#if (lt count 5)}}...{{/if}}
   */
  hbs.registerHelper('lt', (a: number, b: number) => a < b);

  /**
   * Indent a multi-line string by N spaces.
   * Usage: {{indent content 4}}
   */
  hbs.registerHelper('indent', (text: string, spaces: number) => {
    if (typeof text !== 'string') return '';
    const pad = ' '.repeat(typeof spaces === 'number' ? spaces : 2);
    return text
      .split('\n')
      .map((line) => (line.trim() ? `${pad}${line}` : line))
      .join('\n');
  });

  /**
   * Coalesce: return first truthy value.
   * Usage: {{coalesce name "Unknown Project"}}
   */
  hbs.registerHelper('coalesce', (...args: unknown[]) => {
    // Last arg is the Handlebars options hash — skip it
    for (let i = 0; i < args.length - 1; i++) {
      if (args[i]) return args[i];
    }
    return '';
  });
}

// Register on module load
registerHelpers(Handlebars);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compile a Handlebars template string with data and return the rendered output.
 *
 * @param template - Handlebars template string.
 * @param data     - Context object whose properties are available in the template.
 * @returns Rendered string.
 */
export function renderTemplate(template: string, data: Record<string, unknown>): string {
  const compiled = Handlebars.compile(template, { noEscape: true });
  return compiled(data);
}

/**
 * Register a named partial that can be referenced from other templates
 * via `{{> partialName}}`.
 */
export function registerPartial(name: string, template: string): void {
  Handlebars.registerPartial(name, template);
}
