/**
 * Domain types for the enhance command.
 *
 * Defines suggestion categories, priorities, gap analysis rules,
 * and the overall enhance analysis result structure.
 */

import type { Section, SectionTree } from '../skills/mergers/claude-md-parser.js';
import type { RepoProfile, ScoreResult } from '../types.js';
import type { FileIndex } from '../core/context/file-index.js';

// ---------------------------------------------------------------------------
// Suggestion types
// ---------------------------------------------------------------------------

export type SuggestionCategory =
  | 'missing'
  | 'incomplete'
  | 'stale'
  | 'security'
  | 'environment'
  | 'routes'
  | 'tasks';

export type SuggestionPriority = 'high' | 'medium' | 'low';

export interface EnhanceSuggestion {
  /** Unique identifier for this suggestion. */
  id: string;
  /** Category of the suggestion. */
  category: SuggestionCategory;
  /** Priority level for ordering. */
  priority: SuggestionPriority;
  /** Short actionable title. */
  title: string;
  /** Description of why this matters for Claude Code. */
  description: string;
  /** Estimated score improvement if applied. */
  pointsGain: number;
  /** Ready-to-insert markdown content. */
  draftContent: string;
  /** Existing section to append to, or null if a new section is needed. */
  targetSection: string | null;
  /** Files or patterns that provided evidence for this suggestion. */
  evidence: string[];
}

// ---------------------------------------------------------------------------
// Analysis result
// ---------------------------------------------------------------------------

export interface EnhanceAnalysis {
  /** Quality score for existing config, 0-100. */
  qualityScore: number;
  /** Ranked list of improvement suggestions. */
  suggestions: EnhanceSuggestion[];
  /** Count of suggestions per category. */
  categoryCounts: Record<SuggestionCategory, number>;
  /** Whether an existing CLAUDE.md was found. */
  hasExistingConfig: boolean;
  /** Path to the config file analyzed. */
  configPath: string;
}

// ---------------------------------------------------------------------------
// Gap analysis
// ---------------------------------------------------------------------------

export interface GapContext {
  /** Parsed section tree from existing CLAUDE.md. */
  tree: SectionTree;
  /** Flattened sections for easy lookup. */
  sections: Section[];
  /** Slugified section titles for O(1) membership checks. */
  sectionTitles: Set<string>;
  /** All section content concatenated for keyword search. */
  sectionContent: string;
  /** Detection results from the repo. */
  profile: RepoProfile;
  /** Scoring results (null if scoring was skipped). */
  scoreResult: ScoreResult | null;
  /** File index for scanning repo contents. */
  fileIndex: FileIndex;
}

export interface GapRule {
  /** Unique rule identifier. */
  id: string;
  /** Analyze the context and optionally return a suggestion. */
  analyze(ctx: GapContext): EnhanceSuggestion | null;
}

// ---------------------------------------------------------------------------
// Config analyzer types (settings, commands, hooks, mcp)
// ---------------------------------------------------------------------------

export interface ConfigSuggestion {
  /** Unique identifier for this config suggestion. */
  id: string;
  /** Short title describing the suggestion. */
  title: string;
  /** Description of why this matters for Claude Code. */
  description: string;
  /** Estimated score improvement. */
  pointsGain: number;
  /** Draft content or instructions for the change. */
  draftContent: string;
  /** The target config file (e.g. "settings.json", "commands/test.md"). */
  targetFile: string;
  /** Evidence files or patterns. */
  evidence: string[];
}
