/**
 * Type definitions for the Phase 2 generator infrastructure.
 *
 * Generators consume detection and scoring output from Phase 1
 * and produce Claude Code configuration files (.claude/).
 */

import type { RepoProfile, ScoreResult } from '../types.js';
import type { FileIndex } from '../core/context/file-index.js';
import type { GitContext } from '../core/context/git-context.js';

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

/** Safety preset controlling how restrictive the generated config is. */
export type Preset = 'minimal' | 'standard' | 'strict';

// ---------------------------------------------------------------------------
// Generator context
// ---------------------------------------------------------------------------

/** Shared context passed to every generator. */
export interface GeneratorContext {
  /** Absolute path to the repository root. */
  rootPath: string;
  /** Detection results from Phase 1. */
  repoProfile: RepoProfile;
  /** Scoring results from Phase 1 (null if --no-score was used). */
  scoreResult: ScoreResult | null;
  /** Virtual file system for reading repo contents. */
  fileIndex: FileIndex;
  /** Git operations helper. */
  gitContext: GitContext;
  /** Selected safety preset. */
  preset: Preset;
  /** Whether interactive mode is enabled. */
  interactive: boolean;
}

// ---------------------------------------------------------------------------
// Generator plan (dry-run output)
// ---------------------------------------------------------------------------

/** Describes what a generator will create without actually creating it. */
export interface GeneratorPlan {
  files: {
    /** Relative path from repo root. */
    path: string;
    /** Human-readable description of the file's purpose. */
    description: string;
  }[];
}

// ---------------------------------------------------------------------------
// Generator interface
// ---------------------------------------------------------------------------

/**
 * A generator produces a specific type of configuration output.
 *
 * @template T - The output type this generator produces.
 */
export interface Generator<T> {
  /** Human-readable generator name. */
  name: string;
  /** Execute the generator and return its output. */
  generate(ctx: GeneratorContext): Promise<T>;
}

// ---------------------------------------------------------------------------
// Claude settings (settings.json shape)
// ---------------------------------------------------------------------------

export interface ClaudeSettings {
  permissions: {
    /** Tools Claude is explicitly allowed to use. */
    allowedTools: string[];
    /** Tools Claude is explicitly denied from using. */
    deniedTools: string[];
    /** Shell commands Claude is allowed to run. */
    allowedCommands: string[];
    /** Shell commands Claude is denied from running. */
    deniedCommands: string[];
  };
  behavior: {
    /** Whether Claude should auto-format code after edits. */
    autoFormat: boolean;
    /** Whether Claude should auto-lint code after edits. */
    autoLint: boolean;
    /** Whether Claude should auto-run tests after changes. */
    autoTest: boolean;
    /** Commit message style (e.g., "conventional", "freeform"). */
    commitStyle: string;
  };
}

// ---------------------------------------------------------------------------
// Generated output
// ---------------------------------------------------------------------------

/** Map of relative file paths to their generated content. */
export type GeneratedFiles = Map<string, string>;

/** Result of the full generation run. */
export interface GeneratedOutput {
  /** Files that were generated (path -> content). */
  files: GeneratedFiles;
  /** Files that were skipped because they already exist. */
  skipped: string[];
  /** Files that were merged with existing content. */
  merged: string[];
  /** Wall-clock duration in milliseconds. */
  duration: number;
}

// ---------------------------------------------------------------------------
// Orchestrator options
// ---------------------------------------------------------------------------

export interface OrchestratorOptions {
  /** Preview what would be generated without writing files. */
  dryRun?: boolean;
  /** Overwrite existing files without prompting. */
  force?: boolean;
  /** Merge with existing files instead of overwriting. */
  merge?: boolean;
  /** Generator names to skip. */
  skip?: string[];
  /** Only run these generators (exclusive with skip). */
  only?: string[];
}
