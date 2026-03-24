/**
 * Type definitions for the capability detection system.
 *
 * Capabilities are project-agnostic features discovered by scanning
 * the repo (database, CLI tools, deployment configs, etc.). Each
 * capability maps to concrete CLI commands that agents can reference.
 */

import type { RepoProfile } from '../../types.js';

// ---------------------------------------------------------------------------
// Capability categories
// ---------------------------------------------------------------------------

export type CapabilityCategory =
  | 'package-management'
  | 'testing'
  | 'linting'
  | 'formatting'
  | 'building'
  | 'deploying'
  | 'containerization'
  | 'database'
  | 'api'
  | 'cli-tool'
  | 'scaffolding'
  | 'monitoring'
  | 'documentation'
  | 'vcs'
  | 'scripts';

// ---------------------------------------------------------------------------
// Detection criteria
// ---------------------------------------------------------------------------

/**
 * Declarative criteria for detecting a capability.
 * Uses OR logic across criterion types — at least one must match.
 */
export interface DetectionCriteria {
  /** Glob patterns matched against FileIndex (any match = detected). */
  files?: string[];

  /** Exact relative paths to config files. */
  configFiles?: string[];

  /** Package dependencies (checked in package.json, composer.json, etc.). */
  dependencies?: string[];

  /** Framework names from RepoProfile.frameworks. */
  frameworks?: string[];

  /** Language names from RepoProfile.languages. */
  languages?: string[];

  /** Tooling entries from RepoProfile.tooling. */
  tooling?: {
    category: keyof RepoProfile['tooling'];
    name: string;
  }[];

  /** Content patterns to search for in specific files (expensive, use sparingly). */
  contentPatterns?: {
    file: string;
    pattern: string;
  }[];

  /** Script names to check in package.json scripts field. */
  scripts?: string[];
}

// ---------------------------------------------------------------------------
// Capability rule
// ---------------------------------------------------------------------------

/**
 * A declarative, data-driven rule that detects whether a project
 * has a specific capability. Adding a new capability means adding
 * an entry to the rules array — no code changes needed.
 */
export interface CapabilityRule {
  /** Unique dot-namespaced ID, e.g. "db.prisma", "test.vitest". */
  id: string;

  /** Human-readable label, e.g. "Prisma ORM". */
  label: string;

  /** Broad grouping for filtering and agent matching. */
  category: CapabilityCategory;

  /** Detection criteria — at least one criterion type must match. */
  detect: DetectionCriteria;

  /**
   * CLI commands this capability provides.
   * Keys are semantic command names (e.g. "migrate", "run", "fix").
   * Values are the actual shell commands.
   */
  commands: Record<string, string>;

  /**
   * Capability IDs this one implies.
   * Used for agent matching — "db.prisma" implies "database".
   */
  implies?: string[];
}

// ---------------------------------------------------------------------------
// Detected capability (scanner output)
// ---------------------------------------------------------------------------

/**
 * A capability rule that matched during scanning, enriched with
 * evidence of what triggered the match.
 */
export interface DetectedCapability {
  /** The rule that matched. */
  rule: CapabilityRule;

  /** Confidence 0-1 based on how many detection criteria matched. */
  confidence: number;

  /** Files that evidenced this capability. */
  evidence: string[];
}
