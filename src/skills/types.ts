/**
 * Type definitions for the claude-adapt skills system (Phase 3).
 *
 * Covers skill manifests, merge transactions, rollback plans,
 * lockfile entries, and all supporting structures for the
 * five sub-mergers.
 */

import type { AnalyzerCategory } from '../types.js';

// ---------------------------------------------------------------------------
// Skill Manifest — the core package definition
// ---------------------------------------------------------------------------

export interface SkillManifest {
  /** Package name, e.g. "claude-skill-laravel". */
  name: string;
  /** Human-readable display name, e.g. "Laravel". */
  displayName: string;
  /** Semver version string. */
  version: string;
  /** Short description of what the skill provides. */
  description: string;
  /** Author name or handle. */
  author: string;
  /** SPDX license identifier. */
  license: string;
  /** Optional repository URL. */
  repository?: string;

  /** Semver range of compatible claude-adapt versions. */
  claudeAdaptVersion: string;

  /** What the project must have for this skill to be applicable. */
  requires?: {
    languages?: string[];
    frameworks?: string[];
    tools?: string[];
    /** Dependency on other installed skills. */
    skills?: string[];
  };

  /** Skill names that cannot coexist with this skill. */
  conflicts?: string[];

  /** Content this skill contributes. */
  provides: {
    claudeMd?: {
      sections: SkillSection[];
      /** Merge order priority (higher = later). Default 50. */
      priority?: number;
    };
    commands?: SkillCommand[];
    hooks?: SkillHook[];
    mcp?: SkillMcp[];
    analyzers?: SkillAnalyzer[];
    settings?: Record<string, unknown>;
  };

  /** Conditions under which this skill auto-activates. */
  autoActivate?: {
    when: ActivationCondition[];
  };

  /** Searchable tags. */
  tags: string[];
  /** Optional display icon. */
  icon?: string;
}

// ---------------------------------------------------------------------------
// Skill Content Types
// ---------------------------------------------------------------------------

export interface SkillSection {
  /** Unique section identifier within the skill. */
  id: string;
  /** Section heading title. */
  title: string;
  /** Markdown content or relative file path. */
  content: string;
  /** Where to place the section in CLAUDE.md. */
  placement: {
    /** Insert after this existing section ID. */
    after?: string;
    /** Insert before this existing section ID. */
    before?: string;
    /** Merge into an existing section as a subsection. */
    section?: string;
    /** Fallback position when no anchor is found. */
    position?: 'top' | 'bottom';
  };
  /** Optional JS expression for conditional inclusion. */
  condition?: string;
}

export interface SkillCommand {
  /** Command name, e.g. "/artisan". */
  name: string;
  /** Relative path to the command .md file. */
  file: string;
  /** Short description of the command. */
  description: string;
  /** If set, replaces an existing command by name. */
  overrides?: string;
}

export interface SkillHook {
  /** Hook event name. */
  event:
    | 'pre-commit'
    | 'post-commit'
    | 'pre-tool-use'
    | 'post-tool-use'
    | 'pre-session'
    | 'post-session';
  /** Relative path to the hook script. */
  file: string;
  /** Execution priority (lower = first). */
  priority: number;
  /** How to merge with existing hooks. */
  merge: 'prepend' | 'append' | 'replace';
}

export interface SkillMcp {
  /** MCP server name. */
  name: string;
  /** Server configuration. */
  server: {
    command: string;
    args: string[];
    env?: Record<string, string>;
  };
  /** Why this MCP server is needed. */
  reason: string;
  /** Whether the server is optional (recommended) vs required. */
  optional: boolean;
}

export interface SkillAnalyzer {
  /** Target analyzer category. */
  category: AnalyzerCategory | string;
  /** Signals contributed by this analyzer extension. */
  signals: {
    id: string;
    /** Relative path to the analyzer module. */
    file: string;
  }[];
}

// ---------------------------------------------------------------------------
// Activation Conditions
// ---------------------------------------------------------------------------

export interface ActivationCondition {
  /** What to check. */
  type: 'language' | 'framework' | 'tool' | 'file' | 'dependency';
  /** Value to match against. */
  value: string;
  /** Comparison operator. Default "exists". */
  operator?: 'exists' | 'matches' | 'version';
}

// ---------------------------------------------------------------------------
// Merge Transaction — atomic operation recording
// ---------------------------------------------------------------------------

export interface MergeTransaction {
  /** Unique transaction identifier. */
  id: string;
  /** Name of the skill being installed/removed. */
  skill: string;
  /** ISO-8601 timestamp. */
  timestamp: string;
  /** Ordered list of operations performed. */
  operations: MergeOperation[];
  /** Plan for reverting the transaction. */
  rollback: RollbackPlan;
}

export interface MergeOperation {
  /** Type of merge operation. */
  type: 'create' | 'insert' | 'append' | 'modify' | 'delete';
  /** File path relative to .claude/. */
  target: string;
  /** Content that was written or inserted. */
  content?: string;
  /** Section or marker used as an anchor. */
  anchor?: string;
  /** Position relative to the anchor. */
  position?: 'before' | 'after' | 'within' | 'replace';
  /** Source tracking marker. */
  marker: string;
}

export interface RollbackPlan {
  /** Operations to execute in order to revert the transaction. */
  operations: RollbackOperation[];
}

export interface RollbackOperation {
  /** Rollback strategy. */
  type: 'restore' | 'remove-section' | 'remove-file';
  /** Target file path relative to .claude/. */
  target: string;
  /** Original content to restore (for "restore" type). */
  originalContent?: string;
}

// ---------------------------------------------------------------------------
// Skill Lockfile
// ---------------------------------------------------------------------------

export interface SkillLock {
  /** Schema version for forward compatibility. */
  version: 1;
  /** Map of skill name to lock entry. */
  skills: Record<
    string,
    {
      version: string;
      /** Source path or registry URL. */
      resolved: string;
      /** Content integrity hash. */
      integrity: string;
      /** ISO-8601 install timestamp. */
      installedAt: string;
      /** List of provided artifact keys. */
      provides: string[];
    }
  >;
}

// ---------------------------------------------------------------------------
// Conflict & Merge Results
// ---------------------------------------------------------------------------

export interface Conflict {
  /** Type of conflict. */
  type: 'section' | 'command' | 'hook' | 'mcp' | 'settings';
  /** Identifier of the conflicting item. */
  id: string;
  /** Source that currently owns the item. */
  existingSource: string;
  /** Source attempting to claim the item. */
  incomingSource: string;
  /** Human-readable explanation. */
  message: string;
}

export interface MergeResult {
  /** Resulting content after the merge. */
  content: string;
  /** Operations that were performed. */
  operations: MergeOperation[];
  /** Conflicts that were detected but not resolved. */
  conflicts: Conflict[];
  /** Plan for reverting the merge. */
  rollback: RollbackPlan;
}

// ---------------------------------------------------------------------------
// Hook Block — parsed unit within a composed hook script
// ---------------------------------------------------------------------------

export interface HookBlock {
  /** Source identifier: "core", "skill:laravel", etc. */
  source: string;
  /** Priority for ordering (lower = first). */
  priority: number;
  /** Script content of the block. */
  content: string;
}
