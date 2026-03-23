/**
 * Analyzes `.claude/hooks/` for missing hook scripts.
 *
 * Suggests pre-commit hooks when linters or formatters are
 * detected but no corresponding hook file exists.
 */

import type { ConfigSuggestion } from '../types.js';
import type { RepoProfile } from '../../types.js';

export class HooksAnalyzer {
  analyze(
    existingHooks: string[],
    profile: RepoProfile,
  ): ConfigSuggestion[] {
    const suggestions: ConfigSuggestion[] = [];

    const hasLinterOrFormatter =
      profile.tooling.linters.length > 0 || profile.tooling.formatters.length > 0;

    if (hasLinterOrFormatter && !this.hasPreCommitHook(existingHooks)) {
      const command = this.resolvePreCommitCommand(profile);
      suggestions.push({
        id: 'hooks-pre-commit',
        title: 'Add a pre-commit hook for linting/formatting',
        description:
          'A linter or formatter is detected but there is no pre-commit hook. ' +
          'Adding one ensures Claude-generated code passes quality checks before committing.',
        pointsGain: 3,
        draftContent: this.draftPreCommitHook(command),
        targetFile: '.claude/hooks/pre-commit.sh',
        evidence: this.buildEvidence(profile),
      });
    }

    return suggestions;
  }

  // ---------------------------------------------------------------------------
  // Hook detection
  // ---------------------------------------------------------------------------

  /**
   * Returns true if any existing hook filename indicates a pre-commit or lint hook.
   */
  private hasPreCommitHook(existingHooks: string[]): boolean {
    return existingHooks.some((file) => {
      const lower = file.toLowerCase();
      return lower.includes('pre-commit') || lower.includes('lint');
    });
  }

  // ---------------------------------------------------------------------------
  // Command resolution
  // ---------------------------------------------------------------------------

  private resolvePreCommitCommand(profile: RepoProfile): string {
    // Prefer the linter command; fall back to formatter
    if (profile.tooling.linters.length > 0) {
      return this.linterCommand(profile.tooling.linters[0], profile);
    }

    return this.formatterCommand(profile.tooling.formatters[0], profile);
  }

  private linterCommand(linter: string, profile: RepoProfile): string {
    const lower = linter.toLowerCase();
    const pm = profile.packageManager;

    if (lower.includes('eslint')) return pm === 'npm' ? 'npx eslint .' : `${pm} eslint .`;
    if (lower.includes('biome')) return pm === 'npm' ? 'npx biome check .' : `${pm} biome check .`;
    if (lower.includes('pylint')) return 'pylint .';
    if (lower.includes('ruff')) return 'ruff check .';
    if (lower.includes('rubocop')) return 'bundle exec rubocop';

    return 'npm run lint';
  }

  private formatterCommand(formatter: string, profile: RepoProfile): string {
    const lower = formatter.toLowerCase();
    const pm = profile.packageManager;

    if (lower.includes('prettier')) return pm === 'npm' ? 'npx prettier --check .' : `${pm} prettier --check .`;
    if (lower.includes('biome')) return pm === 'npm' ? 'npx biome format .' : `${pm} biome format .`;
    if (lower.includes('black')) return 'black --check .';
    if (lower.includes('ruff')) return 'ruff format --check .';

    return 'npm run format';
  }

  // ---------------------------------------------------------------------------
  // Draft content
  // ---------------------------------------------------------------------------

  private draftPreCommitHook(command: string): string {
    return [
      '#!/bin/bash',
      '',
      '# Pre-commit hook: run linting/formatting checks',
      `${command}`,
    ].join('\n');
  }

  // ---------------------------------------------------------------------------
  // Evidence
  // ---------------------------------------------------------------------------

  private buildEvidence(profile: RepoProfile): string[] {
    const evidence: string[] = [];
    for (const linter of profile.tooling.linters) {
      evidence.push(`linter: ${linter}`);
    }
    for (const formatter of profile.tooling.formatters) {
      evidence.push(`formatter: ${formatter}`);
    }
    return evidence;
  }
}
