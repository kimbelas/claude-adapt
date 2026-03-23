/**
 * Skill registry for discovering skills.
 *
 * Searches for claude-skill-* packages. Currently a stub/mock
 * implementation since we cannot hit npm in initial development.
 * Will be replaced with real npm registry queries in a future release.
 */

import type { ActivationCondition } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkillIndexEntry {
  /** Package name on npm. */
  name: string;
  /** Human-readable display name. */
  displayName: string;
  /** Short description. */
  description: string;
  /** Searchable tags. */
  tags: string[];
  /** npm download count. */
  downloads: number;
  /** Whether the skill is verified by the maintainers. */
  verified: boolean;
  /** Conditions under which this skill is relevant. */
  activationConditions: ActivationCondition[];
}

export interface SearchResult {
  skills: SkillIndexEntry[];
  total: number;
  source: 'npm' | 'index' | 'mock';
}

// ---------------------------------------------------------------------------
// SkillRegistry
// ---------------------------------------------------------------------------

export class SkillRegistry {
  /**
   * Search for skills matching a query string.
   *
   * Searches package names, display names, descriptions, and tags.
   * Currently returns mock results since we cannot query npm
   * during initial development.
   */
  async search(query: string): Promise<SearchResult> {
    const lowerQuery = query.toLowerCase();

    // Filter built-in index by query
    const matching = BUILT_IN_INDEX.filter(entry => {
      const searchable = [
        entry.name,
        entry.displayName,
        entry.description,
        ...entry.tags,
      ]
        .join(' ')
        .toLowerCase();

      return searchable.includes(lowerQuery);
    });

    return {
      skills: matching,
      total: matching.length,
      source: 'mock',
    };
  }

  /**
   * Get detailed info for a specific skill.
   */
  async info(name: string): Promise<SkillIndexEntry | null> {
    return BUILT_IN_INDEX.find(e => e.name === name) ?? null;
  }
}

// ---------------------------------------------------------------------------
// Built-in index (stub data for known built-in skills)
// ---------------------------------------------------------------------------

const BUILT_IN_INDEX: SkillIndexEntry[] = [
  {
    name: '@built-in/typescript',
    displayName: 'TypeScript',
    description: 'TypeScript conventions and best practices for Claude Code',
    tags: ['typescript', 'ts', 'types', 'strict'],
    downloads: 0,
    verified: true,
    activationConditions: [{ type: 'language', value: 'typescript' }],
  },
  {
    name: '@built-in/git-workflow',
    displayName: 'Git Workflow',
    description: 'Git commit conventions and workflow best practices',
    tags: ['git', 'commits', 'workflow', 'conventional-commits'],
    downloads: 0,
    verified: true,
    activationConditions: [{ type: 'tool', value: 'git' }],
  },
];
