/**
 * CLI command handler for `claude-adapt sync`.
 *
 * Thin wrapper that parses options and delegates to the SyncPipeline.
 */

import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';

import { Command } from 'commander';
import ora from 'ora';

import { SyncPipeline } from '../context/sync-pipeline.js';
import type { SyncOptions } from '../context/types.js';

/**
 * Registers the `sync` subcommand on the Commander program.
 */
export function registerSyncCommand(program: Command): void {
  program
    .command('sync [path]')
    .description(
      'Evolve your Claude Code config based on session insights',
    )
    .option('--quiet', 'Minimal output (for hook usage)', false)
    .option(
      '--quick',
      'Fast mode: skip insight generation and quick score',
      false,
    )
    .option(
      '--dry-run',
      'Show what would change without writing',
      false,
    )
    .option(
      '--no-claude-md',
      'Update context store but do not touch CLAUDE.md',
    )
    .option('--no-score', 'Skip quick score')
    .option(
      '--reset',
      'Clear context store and start fresh',
      false,
    )
    .option(
      '--since <commit>',
      'Analyze changes since a specific commit',
    )
    .option(
      '--export <path>',
      'Export context store as markdown report',
    )
    .option(
      '--verbose',
      'Show all detected decisions (including low confidence)',
      false,
    )
    .option(
      '--interactive',
      'Confirm each CLAUDE.md change before applying',
      false,
    )
    .option(
      '--auto-apply',
      'Apply all decisions without confirmation (default in hook mode)',
      false,
    )
    .action(
      async (
        path: string | undefined,
        opts: {
          quiet: boolean;
          quick: boolean;
          dryRun: boolean;
          claudeMd: boolean;
          score: boolean;
          reset: boolean;
          since?: string;
          export?: string;
          verbose: boolean;
          interactive: boolean;
          autoApply: boolean;
        },
      ) => {
        const targetPath = resolve(path ?? process.cwd());

        const options: SyncOptions = {
          quiet: opts.quiet,
          quick: opts.quick,
          dryRun: opts.dryRun,
          noClaudeMd: opts.claudeMd === false,
          noScore: opts.score === false,
          reset: opts.reset,
          since: opts.since,
          export: opts.export,
          verbose: opts.verbose,
          interactive: opts.interactive,
          autoApply: opts.autoApply,
        };

        const spinner = options.quiet
          ? null
          : ora('Syncing session...').start();

        try {
          const pipeline = new SyncPipeline(targetPath, options);
          const result = await pipeline.execute();

          spinner?.stop();

          // Print the formatted output
          if (result.formattedOutput) {
            console.log(result.formattedOutput);
          }

          // Export if requested
          if (options.export) {
            const exportContent = formatExport(result.store);
            await writeFile(options.export, exportContent, 'utf-8');
            if (!options.quiet) {
              console.log(`\n  Context exported to ${options.export}`);
            }
          }

          // Dry run notice
          if (options.dryRun && !options.quiet) {
            console.log(
              '\n  (dry run — no files were modified)',
            );
          }
        } catch (error) {
          spinner?.fail('Sync failed');
          console.error(
            error instanceof Error ? error.message : String(error),
          );
          process.exit(1);
        }
      },
    );
}

/**
 * Formats the context store as a markdown export.
 */
function formatExport(
  store: import('../context/types.js').ContextStore,
): string {
  const lines: string[] = [];

  lines.push('# claude-adapt Context Export');
  lines.push('');
  lines.push(`**Project:** ${store.projectId}`);
  lines.push(`**Last Sync:** ${store.lastSync || 'never'}`);
  lines.push(`**Sessions:** ${store.sessions.length}`);
  lines.push('');

  // Decisions
  if (store.decisions.length > 0) {
    lines.push('## Architectural Decisions');
    lines.push('');
    for (const d of store.decisions.slice(-20)) {
      const status = d.applied ? '[applied]' : '[pending]';
      lines.push(
        `- ${status} **${d.title}** (${d.category}, ${d.impact} impact, confidence: ${d.confidence.toFixed(2)})`,
      );
    }
    lines.push('');
  }

  // Hotspots
  const highRisk = store.hotspots.filter((h) => h.risk !== 'low');
  if (highRisk.length > 0) {
    lines.push('## Hotspots');
    lines.push('');
    for (const h of highRisk) {
      lines.push(
        `- \`${h.file}\` — ${h.editCount} edits (${h.risk} risk)`,
      );
    }
    lines.push('');
  }

  // Patterns
  if (store.patterns.length > 0) {
    lines.push('## Detected Patterns');
    lines.push('');
    for (const p of store.patterns) {
      lines.push(
        `- **${p.name}** (confidence: ${p.confidence.toFixed(2)}, seen in ${p.sessionCount} session${p.sessionCount === 1 ? '' : 's'})`,
      );
    }
    lines.push('');
  }

  // Insights
  const activeInsights = store.insights.filter((i) => !i.archived);
  if (activeInsights.length > 0) {
    lines.push('## Active Insights');
    lines.push('');
    for (const i of activeInsights) {
      lines.push(`- **${i.title}** (${i.type})`);
      if (i.suggestion) {
        lines.push(`  ${i.suggestion}`);
      }
    }
    lines.push('');
  }

  // Gotchas
  const unresolved = store.gotchas.filter((g) => !g.resolved);
  if (unresolved.length > 0) {
    lines.push('## Open Gotchas');
    lines.push('');
    for (const g of unresolved) {
      lines.push(`- ${g.description}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
