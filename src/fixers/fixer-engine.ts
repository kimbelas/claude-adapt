/**
 * Fixer engine — orchestrates auto-fix actions.
 *
 * Takes the recommendations list from the scoring pipeline, filters
 * to only auto-fixable recommendations with gap > 0, runs each
 * fixer, and returns a summary of results.
 */

import chalk from 'chalk';

import type { FixAction, FixContext, FixResult } from './types.js';

export class FixerEngine {
  private readonly fixers: FixAction[];

  constructor(fixers: FixAction[]) {
    this.fixers = fixers;
  }

  /**
   * Run all applicable fixers against the given context.
   *
   * A fixer is applicable when:
   * 1. There is a recommendation for its signal ID
   * 2. That recommendation has gap > 0
   *
   * @returns Array of fix results (one per attempted fixer).
   */
  async run(context: FixContext): Promise<FixResult[]> {
    const recBySignal = new Map(
      context.recommendations.map((r) => [r.signal, r]),
    );

    const applicableFixers = this.fixers.filter((f) => {
      const rec = recBySignal.get(f.signalId);
      return rec !== undefined && rec.gap > 0;
    });

    if (applicableFixers.length === 0) {
      return [];
    }

    const results: FixResult[] = [];

    for (const fixer of applicableFixers) {
      try {
        const result = await fixer.execute(context);
        results.push(result);
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : String(error);
        results.push({
          signalId: fixer.signalId,
          applied: false,
          description: fixer.description,
          skipped: `Error: ${message}`,
        });
      }
    }

    return results;
  }

  /**
   * Print a colored summary of fix results to stdout.
   */
  static printSummary(results: FixResult[]): void {
    if (results.length === 0) {
      console.log(chalk.dim('\nNo auto-fixes were applicable.'));
      return;
    }

    const applied = results.filter((r) => r.applied);
    const skipped = results.filter((r) => !r.applied);

    console.log('');
    console.log(
      chalk.bold.underline(`Auto-fix results: ${applied.length} applied, ${skipped.length} skipped`),
    );
    console.log('');

    for (const result of applied) {
      console.log(chalk.green('  ✓ ') + chalk.bold(result.signalId));
      console.log(chalk.dim(`    ${result.description}`));

      if (result.filesCreated?.length) {
        for (const f of result.filesCreated) {
          console.log(chalk.cyan(`    + created ${f}`));
        }
      }
      if (result.filesModified?.length) {
        for (const f of result.filesModified) {
          console.log(chalk.yellow(`    ~ modified ${f}`));
        }
      }
      if (result.packagesInstalled?.length) {
        console.log(
          chalk.magenta(`    + installed ${result.packagesInstalled.join(', ')}`),
        );
      }
    }

    for (const result of skipped) {
      console.log(chalk.dim('  - ') + chalk.dim(result.signalId));
      console.log(chalk.dim(`    ${result.skipped ?? 'already present'}`));
    }

    console.log('');
  }
}
