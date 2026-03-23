/**
 * Auto-fix module — public API.
 *
 * Re-exports the fixer engine, catalog, and types so consumers
 * can import everything from a single entry point.
 */

export { FixerEngine } from './fixer-engine.js';
export { FIXER_CATALOG } from './catalog.js';
export type {
  FixAction,
  FixContext,
  FixResult,
  FixRecommendation,
} from './types.js';
