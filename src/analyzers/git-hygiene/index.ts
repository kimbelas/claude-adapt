import { BaseAnalyzer, type SignalDefinition } from '../_base.js';
import { AnalyzerCategory, type Signal, type Evidence } from '../../types.js';
import type { ScanContext } from '../../core/context/scan-context.js';

/**
 * Gitignore patterns grouped by ecosystem.  The analyser picks the "universal"
 * set plus every ecosystem whose primary language / framework is detected in
 * the repo, so a Node project is never penalised for missing `__pycache__`.
 */
const GITIGNORE_PATTERNS_BY_ECOSYSTEM: Record<string, string[]> = {
  universal: ['.env', '.DS_Store', '*.log', '.idea', '.vscode', 'coverage', 'tmp'],
  node: ['node_modules', 'dist', 'build', '.cache'],
  python: ['__pycache__', '*.pyc', '.venv', 'venv'],
  php: ['vendor'],
  next: ['.next'],
  nuxt: ['.nuxt'],
};

/**
 * Map a detected language / framework name (lower-cased) to the ecosystem key
 * used in GITIGNORE_PATTERNS_BY_ECOSYSTEM.
 */
const ECOSYSTEM_TRIGGERS: Record<string, string> = {
  javascript: 'node',
  typescript: 'node',
  python: 'python',
  php: 'php',
  next: 'next',
  'next.js': 'next',
  nuxt: 'nuxt',
  'nuxt.js': 'nuxt',
};

function getExpectedPatterns(profile: {
  languages: { name: string }[];
  frameworks: { name: string }[];
}): string[] {
  const ecosystems = new Set<string>(['universal']);

  for (const lang of profile.languages) {
    const key = ECOSYSTEM_TRIGGERS[lang.name.toLowerCase()];
    if (key) ecosystems.add(key);
  }
  for (const fw of profile.frameworks) {
    const key = ECOSYSTEM_TRIGGERS[fw.name.toLowerCase()];
    if (key) ecosystems.add(key);
  }

  const patterns: string[] = [];
  for (const eco of ecosystems) {
    const list = GITIGNORE_PATTERNS_BY_ECOSYSTEM[eco];
    if (list) patterns.push(...list);
  }
  return patterns;
}

const CONVENTIONAL_COMMIT_RE =
  /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+?\))?[!]?:\s/;

export class GitHygieneAnalyzer extends BaseAnalyzer {
  readonly category = AnalyzerCategory.gitHygiene;

  readonly signals: SignalDefinition[] = [
    {
      id: 'git.ignore.quality',
      name: 'Gitignore Quality',
      unit: 'ratio',
      threshold: { poor: 0.5, fair: 0.65, good: 0.8 },
      claudeImpact:
        'A comprehensive .gitignore prevents Claude from seeing or committing ' +
        'generated artifacts, secrets, and OS files that would pollute context.',
    },
    {
      id: 'git.commit.convention',
      name: 'Conventional Commit Adoption',
      unit: 'ratio',
      threshold: { poor: 0.2, fair: 0.45, good: 0.7 },
      claudeImpact:
        'Conventional commit messages teach Claude the project\'s commit style, ' +
        'enabling it to generate consistent, well-formatted commit messages.',
    },
    {
      id: 'git.commit.size.p90',
      name: 'Commit Size P90',
      unit: 'files',
      threshold: { poor: 20, fair: 14, good: 8 },
      inverted: true,
      claudeImpact:
        'Smaller commits indicate an atomic change culture. Claude performs ' +
        'best when changes are focused, making review and rollback easier.',
    },
    {
      id: 'git.binaries',
      name: 'Tracked Binary Files',
      unit: 'count',
      threshold: { poor: 5, fair: 2.5, good: 0 },
      inverted: true,
      claudeImpact:
        'Binary files tracked in git bloat the repository and cannot be meaningfully ' +
        'read or modified by Claude, wasting context window space.',
    },
  ];

  protected async evaluateSignal(
    signal: SignalDefinition,
    context: ScanContext,
  ): Promise<Signal> {
    switch (signal.id) {
      case 'git.ignore.quality':
        return this.evaluateGitignoreQuality(signal, context);
      case 'git.commit.convention':
        return this.evaluateCommitConvention(signal, context);
      case 'git.commit.size.p90':
        return this.evaluateCommitSizeP90(signal, context);
      case 'git.binaries':
        return this.evaluateBinaries(signal, context);
      default:
        return this.createSignal(signal, 0, 0);
    }
  }

  private evaluateGitignoreQuality(
    signal: SignalDefinition,
    context: ScanContext,
  ): Signal {
    const evidence: Evidence[] = [];
    const gitignoreContent = context.fileIndex.read('.gitignore');

    if (!gitignoreContent) {
      evidence.push({
        file: '.gitignore',
        suggestion: 'Create a .gitignore file with common patterns for your project type.',
      });
      return this.createSignal(signal, 0, 0.9, evidence);
    }

    const gitignoreLines = gitignoreContent
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'));

    const expectedPatterns = getExpectedPatterns(context.profile);

    let matchedPatterns = 0;
    const missingPatterns: string[] = [];

    for (const expected of expectedPatterns) {
      const found = gitignoreLines.some(line => {
        const normalized = line.replace(/^\//, '').replace(/\/\*\*$/, '').replace(/\/$/, '');
        return (
          normalized === expected ||
          normalized.includes(expected) ||
          line.includes(expected)
        );
      });

      if (found) {
        matchedPatterns++;
      } else {
        missingPatterns.push(expected);
      }
    }

    const ratio = expectedPatterns.length > 0
      ? matchedPatterns / expectedPatterns.length
      : 1;

    evidence.push({
      file: '.gitignore',
      snippet: `${matchedPatterns}/${expectedPatterns.length} common patterns found`,
    });

    if (missingPatterns.length > 0 && missingPatterns.length <= 5) {
      evidence.push({
        file: '.gitignore',
        suggestion: `Consider adding: ${missingPatterns.join(', ')}`,
      });
    }

    return this.createSignal(signal, ratio, 0.9, evidence);
  }

  private async evaluateCommitConvention(
    signal: SignalDefinition,
    context: ScanContext,
  ): Promise<Signal> {
    const evidence: Evidence[] = [];
    const commits = await context.git.getLog(20);

    if (commits.length === 0) {
      evidence.push({
        file: '',
        snippet: 'No git commits found',
      });
      return this.createSignal(signal, 0, 0.8, evidence);
    }

    let conventionalCount = 0;
    for (const commit of commits) {
      if (CONVENTIONAL_COMMIT_RE.test(commit.message)) {
        conventionalCount++;
      }
    }

    const ratio = conventionalCount / commits.length;

    evidence.push({
      file: '',
      snippet: `${conventionalCount}/${commits.length} commits follow conventional format`,
    });

    if (ratio < 0.5) {
      evidence.push({
        file: '',
        suggestion:
          'Adopt conventional commits (e.g., "feat: add feature", "fix: resolve bug") ' +
          'to help Claude match your commit style.',
      });
    }

    return this.createSignal(signal, ratio, 0.8, evidence);
  }

  private async evaluateCommitSizeP90(
    signal: SignalDefinition,
    context: ScanContext,
  ): Promise<Signal> {
    const evidence: Evidence[] = [];
    const commitSizes = await context.git.getCommitSizes(50);

    if (commitSizes.length === 0) {
      evidence.push({
        file: '',
        snippet: 'No git commit history available',
      });
      return this.createSignal(signal, 0, 0.75, evidence);
    }

    const sorted = commitSizes
      .map(c => c.filesChanged)
      .sort((a, b) => a - b);

    // P90: value at the 90th percentile index
    const p90Index = Math.ceil(sorted.length * 0.9) - 1;
    const p90 = sorted[Math.min(p90Index, sorted.length - 1)];

    evidence.push({
      file: '',
      snippet: `P90 commit size: ${p90} files changed (across ${sorted.length} commits)`,
    });

    if (p90 > 15) {
      evidence.push({
        file: '',
        suggestion:
          'Large commits make it harder for Claude to understand intent. ' +
          'Aim for smaller, focused commits.',
      });
    }

    return this.createSignal(signal, p90, 0.75, evidence);
  }

  private async evaluateBinaries(
    signal: SignalDefinition,
    context: ScanContext,
  ): Promise<Signal> {
    const evidence: Evidence[] = [];
    const binaryFiles = await context.git.getBinaryFiles();
    const count = binaryFiles.length;

    if (count > 0) {
      // Show up to 5 example binary files
      const examples = binaryFiles.slice(0, 5);
      for (const file of examples) {
        evidence.push({
          file,
          snippet: 'Binary file tracked in git',
        });
      }
      if (count > 5) {
        evidence.push({
          file: '',
          snippet: `...and ${count - 5} more binary files`,
        });
      }
      evidence.push({
        file: '',
        suggestion:
          'Consider using Git LFS for binary files or removing them from tracking ' +
          'to keep the repository lean.',
      });
    } else {
      evidence.push({
        file: '',
        snippet: 'No binary files tracked in git',
      });
    }

    return this.createSignal(signal, count, 0.85, evidence);
  }
}
