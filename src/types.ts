/**
 * Core type definitions for claude-adapt.
 *
 * Every type used across the pipeline, analyzers, reporters,
 * and generators lives here as a single source of truth.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export enum AnalyzerCategory {
  documentation = 'documentation',
  modularity = 'modularity',
  conventions = 'conventions',
  typeSafety = 'typeSafety',
  testCoverage = 'testCoverage',
  gitHygiene = 'gitHygiene',
  cicd = 'cicd',
  dependencies = 'dependencies',
}

// ---------------------------------------------------------------------------
// Evidence & Thresholds
// ---------------------------------------------------------------------------

export interface Evidence {
  /** Relative path to the file that provided this evidence. */
  file: string;
  /** Line number inside the file (1-based). */
  line?: number;
  /** Short code snippet extracted from the evidence location. */
  snippet?: string;
  /** Actionable suggestion tied to this evidence. */
  suggestion?: string;
}

export interface Threshold {
  /** Below this value the metric is considered poor. */
  poor: number;
  /** Between poor and this value the metric is considered fair. */
  fair: number;
  /** At or above this value the metric is considered good. */
  good: number;
}

// ---------------------------------------------------------------------------
// Signals — the atomic unit of measurement
// ---------------------------------------------------------------------------

export interface Signal {
  /** Dot-namespaced identifier, e.g. "documentation.readme.quality". */
  id: string;
  /** Which analyzer category produced this signal. */
  category: AnalyzerCategory;
  /** Human-readable signal name, e.g. "README Quality". */
  name: string;
  /** Raw measured value before normalization. */
  value: number;
  /** Unit of the raw value ("ratio", "count", "lines", etc.). */
  unit: string;
  /** Normalized score in the 0-1 range. */
  score: number;
  /** Confidence in the measurement, 0-1. */
  confidence: number;
  /** Files and lines that contributed to this signal. */
  evidence: Evidence[];
  /** Category-specific thresholds used to bucket the raw value. */
  threshold: Threshold;
  /** Explanation of why this signal matters for Claude Code. */
  claudeImpact: string;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export interface CategoryScore {
  /** Raw score for this category, 0-1. */
  raw: number;
  /** Score normalized to category weight, 0-max. */
  normalized: number;
  /** Maximum weight this category can contribute. */
  max: number;
  /** Individual signals that make up the category score. */
  signals: Signal[];
  /** One-line human-readable summary of the category result. */
  summary: string;
}

export interface ScoreResult {
  /** Overall readiness score, 0-100. */
  total: number;
  /** Per-category breakdown. */
  categories: Record<AnalyzerCategory, CategoryScore>;
  /** Flat list of every signal across all categories. */
  signals: Signal[];
  /** ISO-8601 timestamp of when the score was computed. */
  timestamp: string;
  /** Wall-clock duration of the full scoring run in milliseconds. */
  duration: number;
}

// ---------------------------------------------------------------------------
// Repo Profile (detection output)
// ---------------------------------------------------------------------------

export interface RepoProfile {
  /** Languages detected in the repository, sorted by percentage. */
  languages: {
    name: string;
    percentage: number;
    fileCount: number;
  }[];

  /** Frameworks / libraries detected with optional version info. */
  frameworks: {
    name: string;
    version?: string;
    confidence: number;
  }[];

  /** Developer tooling discovered in config files. */
  tooling: {
    linters: string[];
    formatters: string[];
    ci: string[];
    bundlers: string[];
    testRunners: string[];
  };

  /** High-level structural characteristics. */
  structure: {
    monorepo: boolean;
    /** Maximum nesting depth of the source tree. */
    depth: number;
    /** Detected entry-point files (e.g. index.ts, main.ts). */
    entryPoints: string[];
  };

  /** Package manager in use. */
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun' | 'unknown';
}

// ---------------------------------------------------------------------------
// Analyzer
// ---------------------------------------------------------------------------

export interface AnalyzerResult {
  /** Category this analyzer is responsible for. */
  category: AnalyzerCategory;
  /** Signals produced during analysis. */
  signals: Signal[];
  /** Wall-clock time the analyzer took in milliseconds. */
  duration: number;
}

// ---------------------------------------------------------------------------
// Recommendations
// ---------------------------------------------------------------------------

export interface Recommendation {
  /** Unique recommendation id, e.g. "rec.documentation.readme.missing". */
  id: string;
  /** Signal id this recommendation addresses. */
  signal: string;
  /** Short actionable title. */
  title: string;
  /** Detailed description of what to do and why. */
  description: string;
  /** Numeric gap between current score and the "good" threshold (0-1). */
  gap: number;
  /** Qualitative effort estimate. */
  effort: 'low' | 'medium' | 'high';
  /** Numeric effort cost used in the ranking formula (1 | 3 | 5). */
  effortScore: number;
  /** Estimated impact on the overall score if fully addressed (0-1). */
  impact: number;
  /** Evidence supporting this recommendation. */
  evidence: Evidence[];
  /** Optional template string for an auto-fixable change. */
  fixTemplate?: string;
}

// ---------------------------------------------------------------------------
// History & Trends
// ---------------------------------------------------------------------------

export interface ScoreRun {
  /** ISO-8601 timestamp of the run. */
  timestamp: string;
  /** Short SHA of the commit at the time of the run. */
  commitHash: string;
  /** Git branch that was active during the run. */
  branch: string;
  /** Overall readiness score, 0-100. */
  total: number;
  /** Compact per-category summary. */
  categories: Record<
    AnalyzerCategory,
    {
      score: number;
      max: number;
      signalCount: number;
    }
  >;
  /** Total number of recommendations generated. */
  recommendations: number;
  /** Wall-clock duration of the run in milliseconds. */
  duration: number;
}

export interface ScoreHistory {
  /** Schema version for forward compatibility. */
  version: 1;
  /** Stable project identifier (derived from repo root path or git remote). */
  projectId: string;
  /** Ordered list of past runs, newest last. */
  runs: ScoreRun[];
}

export interface Trend {
  /** Category the trend applies to. */
  category: AnalyzerCategory;
  /** Direction of change. */
  type: 'regression' | 'improvement';
  /** Human-readable description of the trend. */
  message: string;
  /** Severity / sentiment. */
  severity: 'warning' | 'positive';
}
