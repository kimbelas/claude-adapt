/**
 * Skill registry for discovering skills.
 *
 * Searches for claude-skill-* packages on the npm registry.
 * Uses the npm registry API with the `claude-adapt-skill` keyword.
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
// Constants
// ---------------------------------------------------------------------------

const NPM_SEARCH_URL = 'https://registry.npmjs.org/-/v1/search';
const NPM_REGISTRY_URL = 'https://registry.npmjs.org';
const FETCH_TIMEOUT_MS = 5000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Title-case a string: "foo-bar" → "Foo Bar"
 */
function titleCase(str: string): string {
  return str
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Derive a display name from a package name.
 * Strips common prefixes like `claude-skill-` or `@scope/claude-skill-`.
 */
function deriveDisplayName(packageName: string): string {
  const stripped = packageName
    .replace(/^@[^/]+\//, '') // remove scope
    .replace(/^claude-skill-/, '');
  return titleCase(stripped);
}

/**
 * Fetch with a timeout.
 */
async function fetchWithTimeout(url: string, timeoutMs: number = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// npm response types (partial, only what we use)
// ---------------------------------------------------------------------------

interface NpmSearchObject {
  package: {
    name: string;
    version: string;
    description?: string;
    keywords?: string[];
    publisher?: { username: string };
  };
}

interface NpmSearchResponse {
  objects: NpmSearchObject[];
  total: number;
}

interface NpmPackageResponse {
  name: string;
  description?: string;
  'dist-tags'?: { latest?: string };
  versions?: Record<string, NpmVersionInfo>;
}

interface NpmVersionInfo {
  name: string;
  version: string;
  description?: string;
  keywords?: string[];
  'claude-adapt'?: {
    displayName?: string;
    tags?: string[];
    activationConditions?: ActivationCondition[];
  };
}

// ---------------------------------------------------------------------------
// SkillRegistry
// ---------------------------------------------------------------------------

export class SkillRegistry {
  /**
   * Search for skills matching a query string.
   *
   * Queries the npm registry for packages with the keyword
   * `claude-adapt-skill` that also match the user's query.
   */
  async search(query: string): Promise<SearchResult> {
    try {
      const url = `${NPM_SEARCH_URL}?text=keywords:claude-adapt-skill+${encodeURIComponent(query)}&size=20`;
      const response = await fetchWithTimeout(url);

      if (!response.ok) {
        return { skills: [], total: 0, source: 'npm' };
      }

      const data = (await response.json()) as NpmSearchResponse;

      const skills: SkillIndexEntry[] = data.objects.map(obj => {
        const pkg = obj.package;
        const keywords = pkg.keywords ?? [];
        const tags = keywords.filter(k => k !== 'claude-adapt-skill');

        return {
          name: pkg.name,
          displayName: deriveDisplayName(pkg.name),
          description: pkg.description ?? '',
          tags,
          downloads: 0,
          verified: false,
          activationConditions: [],
        };
      });

      return {
        skills,
        total: data.total,
        source: 'npm',
      };
    } catch {
      // Network error, timeout, or parse error — return empty results
      return { skills: [], total: 0, source: 'npm' };
    }
  }

  /**
   * Get detailed info for a specific skill from the npm registry.
   */
  async info(name: string): Promise<SkillIndexEntry | null> {
    try {
      const url = `${NPM_REGISTRY_URL}/${encodeURIComponent(name)}`;
      const response = await fetchWithTimeout(url);

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as NpmPackageResponse;
      const latestVersion = data['dist-tags']?.latest;

      if (!latestVersion || !data.versions?.[latestVersion]) {
        return null;
      }

      const versionInfo = data.versions[latestVersion];
      const claudeAdapt = versionInfo['claude-adapt'];
      const keywords = versionInfo.keywords ?? [];
      const tags = claudeAdapt?.tags ?? keywords.filter(k => k !== 'claude-adapt-skill');

      return {
        name: data.name,
        displayName: claudeAdapt?.displayName ?? deriveDisplayName(data.name),
        description: data.description ?? '',
        tags,
        downloads: 0,
        verified: false,
        activationConditions: claudeAdapt?.activationConditions ?? [],
      };
    } catch {
      // Network error, timeout, or parse error — return null
      return null;
    }
  }
}
