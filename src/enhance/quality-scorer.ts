/**
 * Quality scorer for existing CLAUDE.md configurations.
 *
 * Evaluates a CLAUDE.md file across five dimensions — coverage, depth,
 * specificity, accuracy, and freshness — producing a 0-100 score with
 * a per-dimension breakdown.
 */

import semver from 'semver';

import type { Section } from '../skills/mergers/claude-md-parser.js';
import type { RepoProfile } from '../types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QualityBreakdown {
  /** Section coverage score, 0-30. */
  coverage: number;
  /** Content depth score, 0-20. */
  depth: number;
  /** Specificity score, 0-20. */
  specificity: number;
  /** Accuracy score, 0-15. */
  accuracy: number;
  /** Freshness score, 0-15. */
  freshness: number;
  /** Overall quality score, 0-100. */
  total: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Expected sections with fuzzy aliases for matching against existing
 * CLAUDE.md headings. Same approach as the gap analyzer.
 */
const EXPECTED_SECTIONS: Record<string, string[]> = {
  'tech-stack': ['stack', 'technology', 'technologies', 'tech', 'dependencies'],
  'architecture': ['design', 'system-design', 'structure'],
  'conventions': ['code-conventions', 'coding-standards', 'style', 'code-style'],
  'testing': ['tests', 'test', 'test-strategy', 'quality'],
  'common-tasks': ['tasks', 'scripts', 'commands', 'npm-scripts'],
  'environment-variables': ['environment', 'env', 'env-vars', 'configuration'],
  'security': ['security-policies', 'rls', 'auth', 'authentication'],
  'gotchas': ['pitfalls', 'caveats', 'known-issues', 'warnings'],
  'routes': ['routing', 'route-structure', 'api-routes', 'pages', 'endpoints'],
  'overview': ['about', 'introduction', 'summary', 'project'],
};

const TOTAL_EXPECTED = Object.keys(EXPECTED_SECTIONS).length; // 10

const FILE_PATH_RE = /\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+/;
const CODE_FENCE_RE = /```|~~~/;
const SHELL_CMD_RE = /^\s*\$\s|npm run|npx |yarn |pnpm /;
const TABLE_ROW_RE = /\|.+\|/;

// ---------------------------------------------------------------------------
// QualityScorer
// ---------------------------------------------------------------------------

export class QualityScorer {
  /**
   * Score the quality of a CLAUDE.md configuration.
   *
   * @param sections - Parsed sections from the CLAUDE.md file.
   * @param content  - Raw content of the CLAUDE.md file.
   * @param profile  - Detected repo profile for cross-referencing.
   * @returns A breakdown of scores across all five dimensions.
   */
  score(sections: Section[], content: string, profile: RepoProfile): QualityBreakdown {
    const coverage = this.scoreCoverage(sections);
    const depth = this.scoreDepth(sections);
    const specificity = this.scoreSpecificity(sections);
    const accuracy = this.scoreAccuracy(content, profile);
    const freshness = this.scoreFreshness(content, profile);

    const total = Math.min(
      100,
      Math.max(0, coverage + depth + specificity + accuracy + freshness),
    );

    return { coverage, depth, specificity, accuracy, freshness, total };
  }

  // -----------------------------------------------------------------------
  // Dimension 1: Section Coverage (max 30)
  // -----------------------------------------------------------------------

  /**
   * Check how many of the 10 expected sections are present, using
   * fuzzy alias matching on slugified heading titles.
   */
  private scoreCoverage(sections: Section[]): number {
    const slugs = this.collectSlugs(sections);
    let matched = 0;

    for (const [canonical, aliases] of Object.entries(EXPECTED_SECTIONS)) {
      const candidates = [canonical, ...aliases];
      if (candidates.some((c) => slugs.has(c))) {
        matched++;
      }
    }

    return (matched / TOTAL_EXPECTED) * 30;
  }

  // -----------------------------------------------------------------------
  // Dimension 2: Content Depth (max 20)
  // -----------------------------------------------------------------------

  /**
   * Compute the average number of non-empty lines per section.
   * 10+ lines average earns full marks; below 10 scales linearly.
   */
  private scoreDepth(sections: Section[]): number {
    if (sections.length === 0) return 0;

    let totalNonEmpty = 0;

    for (const section of sections) {
      const lines = section.content.split('\n');
      totalNonEmpty += lines.filter((l) => l.trim().length > 0).length;
    }

    const avgLines = totalNonEmpty / sections.length;

    if (avgLines >= 10) return 20;
    return (avgLines / 10) * 20;
  }

  // -----------------------------------------------------------------------
  // Dimension 3: Specificity (max 20)
  // -----------------------------------------------------------------------

  /**
   * Search all section content for concrete, actionable indicators:
   * code fences, file paths, shell commands, and table syntax.
   */
  private scoreSpecificity(sections: Section[]): number {
    let points = 0;

    let hasCodeFences = false;
    let hasFilePaths = false;
    let hasShellCmds = false;
    let hasTableSyntax = false;

    for (const section of sections) {
      const lines = section.content.split('\n');

      for (const line of lines) {
        if (!hasCodeFences && CODE_FENCE_RE.test(line)) {
          hasCodeFences = true;
        }
        if (!hasFilePaths && FILE_PATH_RE.test(line)) {
          hasFilePaths = true;
        }
        if (!hasShellCmds && SHELL_CMD_RE.test(line)) {
          hasShellCmds = true;
        }
        if (!hasTableSyntax && TABLE_ROW_RE.test(line)) {
          hasTableSyntax = true;
        }

        // Early exit if all four indicators are found
        if (hasCodeFences && hasFilePaths && hasShellCmds && hasTableSyntax) {
          break;
        }
      }

      if (hasCodeFences && hasFilePaths && hasShellCmds && hasTableSyntax) {
        break;
      }
    }

    if (hasCodeFences) points += 5;
    if (hasFilePaths) points += 5;
    if (hasShellCmds) points += 5;
    if (hasTableSyntax) points += 5;

    return points;
  }

  // -----------------------------------------------------------------------
  // Dimension 4: Accuracy (max 15)
  // -----------------------------------------------------------------------

  /**
   * Cross-reference detected frameworks against the CLAUDE.md content.
   * Each framework whose name appears (case-insensitive) scores a point.
   */
  private scoreAccuracy(content: string, profile: RepoProfile): number {
    const frameworks = profile.frameworks;

    if (frameworks.length === 0) return 15;

    const lowerContent = content.toLowerCase();
    let mentioned = 0;

    for (const fw of frameworks) {
      if (lowerContent.includes(fw.name.toLowerCase())) {
        mentioned++;
      }
    }

    return (mentioned / frameworks.length) * 15;
  }

  // -----------------------------------------------------------------------
  // Dimension 5: Freshness (max 15)
  // -----------------------------------------------------------------------

  /**
   * For each framework with a known version, search the CLAUDE.md
   * content for version-like strings near the framework name and
   * compare using semver.
   */
  private scoreFreshness(content: string, profile: RepoProfile): number {
    const versionedFrameworks = profile.frameworks.filter((fw) => fw.version);

    if (versionedFrameworks.length === 0) return 15;

    let matching = 0;

    for (const fw of versionedFrameworks) {
      const detectedVersion = semver.coerce(fw.version);
      if (!detectedVersion) continue;

      const mentionedVersion = this.findVersionNearName(content, fw.name);
      if (!mentionedVersion) continue;

      const coerced = semver.coerce(mentionedVersion);
      if (coerced && semver.eq(coerced, detectedVersion)) {
        matching++;
      }
    }

    return (matching / versionedFrameworks.length) * 15;
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  /**
   * Collect all slugified section titles from a section tree (recursive).
   */
  private collectSlugs(sections: Section[]): Set<string> {
    const slugs = new Set<string>();

    const walk = (list: Section[]): void => {
      for (const section of list) {
        slugs.add(this.slugify(section.title));
        if (section.children.length > 0) {
          walk(section.children);
        }
      }
    };

    walk(sections);
    return slugs;
  }

  /**
   * Convert a heading title into a URL-friendly slug.
   * Lowercase, replace non-alphanumeric runs with `-`, trim dashes.
   */
  private slugify(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Search for a semver-like version string within a few lines of
   * where a framework name appears in the content.
   */
  private findVersionNearName(content: string, name: string): string | null {
    const lines = content.split('\n');
    const lowerName = name.toLowerCase();
    const versionRe = /\d+\.\d+(?:\.\d+)?/;

    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].toLowerCase().includes(lowerName)) continue;

      // Search the current line and the next 2 lines for a version
      const window = lines.slice(i, Math.min(i + 3, lines.length)).join(' ');
      const match = window.match(versionRe);
      if (match) return match[0];
    }

    return null;
  }
}
