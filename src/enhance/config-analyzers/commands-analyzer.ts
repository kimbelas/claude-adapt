/**
 * Analyzes `.claude/commands/` against detected capabilities.
 *
 * Suggests missing command files for test runners, e2e frameworks,
 * linters, and formatters discovered in the repository.
 */

import type { ConfigSuggestion } from '../types.js';
import type { RepoProfile } from '../../types.js';
import type { FileIndex } from '../../core/context/file-index.js';

export class CommandsAnalyzer {
  analyze(
    existingCommands: string[],
    profile: RepoProfile,
    _fileIndex: FileIndex,
  ): ConfigSuggestion[] {
    const suggestions: ConfigSuggestion[] = [];
    const existing = new Set(existingCommands.map((c) => c.toLowerCase()));

    if (profile.tooling.testRunners.length > 0 && !existing.has('test.md')) {
      const runner = profile.tooling.testRunners[0];
      suggestions.push({
        id: 'commands-test',
        title: 'Add a test command',
        description:
          `A test runner (${runner}) is detected but there is no test command file. ` +
          'Adding one lets Claude run the test suite with a single slash command.',
        pointsGain: 5,
        draftContent: this.draftTestCommand(runner, profile),
        targetFile: '.claude/commands/test.md',
        evidence: [`test runner: ${runner}`],
      });
    }

    if (this.hasE2eRunner(profile) && !existing.has('e2e.md')) {
      const runner = this.getE2eRunnerName(profile);
      suggestions.push({
        id: 'commands-e2e',
        title: 'Add an e2e test command',
        description:
          `An end-to-end test framework (${runner}) is detected but there is no e2e command file. ` +
          'Adding one lets Claude trigger e2e tests directly.',
        pointsGain: 3,
        draftContent: this.draftE2eCommand(runner),
        targetFile: '.claude/commands/e2e.md',
        evidence: [`e2e runner: ${runner}`],
      });
    }

    if (profile.tooling.linters.length > 0 && !existing.has('lint.md')) {
      const linter = profile.tooling.linters[0];
      suggestions.push({
        id: 'commands-lint',
        title: 'Add a lint command',
        description:
          `A linter (${linter}) is detected but there is no lint command file. ` +
          'Adding one lets Claude check code quality on demand.',
        pointsGain: 2,
        draftContent: this.draftLintCommand(linter, profile),
        targetFile: '.claude/commands/lint.md',
        evidence: [`linter: ${linter}`],
      });
    }

    if (profile.tooling.formatters.length > 0 && !existing.has('format.md')) {
      const formatter = profile.tooling.formatters[0];
      suggestions.push({
        id: 'commands-format',
        title: 'Add a format command',
        description:
          `A formatter (${formatter}) is detected but there is no format command file. ` +
          'Adding one lets Claude auto-format code on demand.',
        pointsGain: 2,
        draftContent: this.draftFormatCommand(formatter, profile),
        targetFile: '.claude/commands/format.md',
        evidence: [`formatter: ${formatter}`],
      });
    }

    return suggestions;
  }

  // ---------------------------------------------------------------------------
  // E2E detection helpers
  // ---------------------------------------------------------------------------

  private hasE2eRunner(profile: RepoProfile): boolean {
    return profile.tooling.testRunners.some((r) => this.isE2eFramework(r));
  }

  private getE2eRunnerName(profile: RepoProfile): string {
    return (
      profile.tooling.testRunners.find((r) => this.isE2eFramework(r)) ?? 'playwright'
    );
  }

  private isE2eFramework(name: string): boolean {
    const lower = name.toLowerCase();
    return lower.includes('playwright') || lower.includes('cypress');
  }

  // ---------------------------------------------------------------------------
  // Draft content generators
  // ---------------------------------------------------------------------------

  private draftTestCommand(runner: string, profile: RepoProfile): string {
    const cmd = this.resolveTestRunCommand(runner, profile);
    return [
      `Run the test suite using ${runner}:`,
      '',
      '```',
      cmd,
      '```',
    ].join('\n');
  }

  private draftE2eCommand(runner: string): string {
    const lower = runner.toLowerCase();
    let cmd: string;
    if (lower.includes('playwright')) {
      cmd = 'npx playwright test';
    } else if (lower.includes('cypress')) {
      cmd = 'npx cypress run';
    } else {
      cmd = `npx ${lower}`;
    }

    return [
      `Run end-to-end tests using ${runner}:`,
      '',
      '```',
      cmd,
      '```',
    ].join('\n');
  }

  private draftLintCommand(linter: string, profile: RepoProfile): string {
    const cmd = this.resolveLintRunCommand(linter, profile);
    return [
      `Run the linter (${linter}):`,
      '',
      '```',
      cmd,
      '```',
    ].join('\n');
  }

  private draftFormatCommand(formatter: string, profile: RepoProfile): string {
    const cmd = this.resolveFormatRunCommand(formatter, profile);
    return [
      `Run the formatter (${formatter}):`,
      '',
      '```',
      cmd,
      '```',
    ].join('\n');
  }

  // ---------------------------------------------------------------------------
  // Run command resolution
  // ---------------------------------------------------------------------------

  private resolveTestRunCommand(runner: string, profile: RepoProfile): string {
    const lower = runner.toLowerCase();
    const pm = profile.packageManager;

    if (lower.includes('vitest')) return pm === 'npm' ? 'npx vitest' : `${pm} vitest`;
    if (lower.includes('jest')) return pm === 'npm' ? 'npx jest' : `${pm} jest`;
    if (lower.includes('mocha')) return pm === 'npm' ? 'npx mocha' : `${pm} mocha`;
    if (lower.includes('pytest')) return 'pytest';
    if (lower.includes('rspec')) return 'bundle exec rspec';

    return 'npm test';
  }

  private resolveLintRunCommand(linter: string, profile: RepoProfile): string {
    const lower = linter.toLowerCase();
    const pm = profile.packageManager;

    if (lower.includes('eslint')) return pm === 'npm' ? 'npx eslint .' : `${pm} eslint .`;
    if (lower.includes('biome')) return pm === 'npm' ? 'npx biome check .' : `${pm} biome check .`;
    if (lower.includes('pylint')) return 'pylint .';
    if (lower.includes('ruff')) return 'ruff check .';
    if (lower.includes('rubocop')) return 'bundle exec rubocop';

    return 'npm run lint';
  }

  private resolveFormatRunCommand(formatter: string, profile: RepoProfile): string {
    const lower = formatter.toLowerCase();
    const pm = profile.packageManager;

    if (lower.includes('prettier')) return pm === 'npm' ? 'npx prettier --write .' : `${pm} prettier --write .`;
    if (lower.includes('biome')) return pm === 'npm' ? 'npx biome format --write .' : `${pm} biome format --write .`;
    if (lower.includes('black')) return 'black .';
    if (lower.includes('ruff')) return 'ruff format .';

    return 'npm run format';
  }
}
