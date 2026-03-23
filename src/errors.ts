/**
 * Custom error hierarchy for claude-adapt.
 *
 * Every error thrown intentionally by the tool extends
 * `ClaudeAdaptError` so callers can distinguish operational
 * failures from unexpected crashes with a single `instanceof` check.
 */

import { AnalyzerCategory } from './types.js';

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

export type ErrorCode =
  | 'DETECTION_ERROR'
  | 'ANALYZER_ERROR'
  | 'SCORING_ERROR'
  | 'PIPELINE_ERROR'
  | 'CONFIG_ERROR';

// ---------------------------------------------------------------------------
// Base class
// ---------------------------------------------------------------------------

/**
 * Base error for all intentional failures in claude-adapt.
 *
 * Carries a machine-readable `code` alongside the human-readable
 * `message` so CLI reporters and programmatic consumers can branch
 * on the error type without fragile string matching.
 */
export class ClaudeAdaptError extends Error {
  public readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
    this.name = 'ClaudeAdaptError';

    // Maintain proper prototype chain for instanceof checks when
    // targeting ES5 or when transpiling with some bundlers.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Thrown when the detection stage fails to identify the repo profile
 * (languages, frameworks, tooling, structure).
 */
export class DetectionError extends ClaudeAdaptError {
  constructor(message: string, options?: ErrorOptions) {
    super('DETECTION_ERROR', message, options);
    this.name = 'DetectionError';
  }
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

/**
 * Thrown when an individual analyzer encounters an unrecoverable error.
 *
 * Includes the `category` so the pipeline can decide whether to skip
 * just that category or abort entirely.
 */
export class AnalyzerError extends ClaudeAdaptError {
  public readonly category: AnalyzerCategory;

  constructor(
    category: AnalyzerCategory,
    message: string,
    options?: ErrorOptions,
  ) {
    super('ANALYZER_ERROR', `[${category}] ${message}`, options);
    this.name = 'AnalyzerError';
    this.category = category;
  }
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Thrown when the scoring / aggregation stage fails — for example if
 * category weights don't sum to 100 or a required category is missing.
 */
export class ScoringError extends ClaudeAdaptError {
  constructor(message: string, options?: ErrorOptions) {
    super('SCORING_ERROR', message, options);
    this.name = 'ScoringError';
  }
}

// ---------------------------------------------------------------------------
// Pipeline orchestration
// ---------------------------------------------------------------------------

/**
 * Thrown when the top-level pipeline encounters a stage failure that
 * cannot be recovered from.
 *
 * The `stage` property indicates which pipeline step failed so
 * reporters can show a helpful breadcrumb trail.
 */
export class PipelineError extends ClaudeAdaptError {
  public readonly stage: string;

  constructor(stage: string, message: string, options?: ErrorOptions) {
    super('PIPELINE_ERROR', `Pipeline failed at "${stage}": ${message}`, options);
    this.name = 'PipelineError';
    this.stage = stage;
  }
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Thrown when user-supplied or on-disk configuration is invalid
 * (bad JSON, missing required keys, conflicting options, etc.).
 */
export class ConfigError extends ClaudeAdaptError {
  constructor(message: string, options?: ErrorOptions) {
    super('CONFIG_ERROR', message, options);
    this.name = 'ConfigError';
  }
}
