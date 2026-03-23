/**
 * Type definitions for the auto-fix system.
 *
 * Fixers are small, idempotent operations that can automatically
 * address low-effort recommendations from the scoring pipeline.
 */

import type { RepoProfile } from '../types.js';

export interface FixAction {
  /** The signal ID this fixer addresses (e.g. "doc.changelog"). */
  signalId: string;
  /** What kind of operation this fixer performs. */
  type: 'create-file' | 'modify-file' | 'npm-install' | 'config-change';
  /** Human-readable description of the fix. */
  description: string;
  /** Execute the fix. Must be idempotent. */
  execute: (context: FixContext) => Promise<FixResult>;
}

export interface FixContext {
  /** Absolute path to the repo being scored. */
  targetPath: string;
  /** Detection profile (languages, frameworks, tooling, etc.). */
  profile: RepoProfile;
  /** Recommendations with gap > 0 from the scoring pipeline. */
  recommendations: FixRecommendation[];
  /** When true, report what would be done without writing anything. */
  dryRun: boolean;
}

/** Minimal recommendation shape needed by the fixer engine. */
export interface FixRecommendation {
  id: string;
  signal: string;
  title: string;
  gap: number;
  effort: 'low' | 'medium' | 'high';
}

export interface FixResult {
  /** The signal ID that was addressed. */
  signalId: string;
  /** Whether the fix was actually applied. */
  applied: boolean;
  /** Human-readable description of what was done. */
  description: string;
  /** Files that were created (relative to targetPath). */
  filesCreated?: string[];
  /** Files that were modified (relative to targetPath). */
  filesModified?: string[];
  /** npm packages that were installed. */
  packagesInstalled?: string[];
  /** Reason the fix was skipped, if applicable. */
  skipped?: string;
}
