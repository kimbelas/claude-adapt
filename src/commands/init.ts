/**
 * CLI command handler for claude-adapt init.
 *
 * Runs Phase 1 detection (and optionally scoring), then Phase 2
 * generators, and writes the resulting .claude/ configuration
 * files to disk. Supports dry-run, diff, merge, force, and
 * interactive modes.
 */

import { resolve, join, dirname } from 'node:path';
import { mkdir, writeFile, readFile, chmod } from 'node:fs/promises';

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';

import { DetectorChain } from '../core/detection/detector-chain.js';
import { FileIndex } from '../core/context/file-index.js';
import { GitContext } from '../core/context/git-context.js';
import { ScoringEngine } from '../core/scoring/engine.js';
import { ScorePipeline } from '../core/pipeline/pipeline.js';
import { DetectStage } from '../core/pipeline/stages/detect-stage.js';
import { IndexStage } from '../core/pipeline/stages/index-stage.js';
import { AnalyzeStage } from '../core/pipeline/stages/analyze-stage.js';
import { ScoreStage } from '../core/pipeline/stages/score-stage.js';
import { DocumentationAnalyzer } from '../analyzers/documentation/index.js';
import { ModularityAnalyzer } from '../analyzers/modularity/index.js';
import { ConventionsAnalyzer } from '../analyzers/conventions/index.js';
import { TypeSafetyAnalyzer } from '../analyzers/type-safety/index.js';
import { TestCoverageAnalyzer } from '../analyzers/test-coverage/index.js';
import { GitHygieneAnalyzer } from '../analyzers/git-hygiene/index.js';
import { CiCdAnalyzer } from '../analyzers/cicd/index.js';
import { DependenciesAnalyzer } from '../analyzers/dependencies/index.js';
import { runGenerators } from '../generators/generator-orchestrator.js';
import { getPresetDescription, getPresetNames } from '../generators/presets.js';
import { scanCapabilities } from '../generators/capabilities/capability-scanner.js';
import { inferAgents } from '../generators/agents/agent-inferrer.js';
import type { DetectedCapability } from '../generators/capabilities/types.js';
import type { CommandFile } from '../generators/agents/types.js';
import type { Preset, GeneratorContext, OrchestratorOptions } from '../generators/types.js';
import type { RepoProfile, ScoreResult } from '../types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InitOptions {
  interactive: boolean;
  preset: Preset;
  skip: string[] | undefined;
  only: string[] | undefined;
  force: boolean;
  dryRun: boolean;
  diff: boolean;
  merge: boolean;
  score: boolean;
  verbose: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

function showDiff(
  filePath: string,
  existing: string | null,
  generated: string,
): string {
  if (existing === null) {
    const newLines = generated
      .split('\n')
      .map((l) => chalk.green('+ ' + l))
      .join('\n');
    return chalk.green('+ NEW ' + filePath + '\n') + newLines;
  }

  const existingLines = existing.split('\n');
  const generatedLines = generated.split('\n');
  const lines: string[] = [
    chalk.bold('--- ' + filePath + ' (existing)'),
    chalk.bold('+++ ' + filePath + ' (generated)'),
  ];

  const maxLen = Math.max(existingLines.length, generatedLines.length);
  for (let i = 0; i < maxLen; i++) {
    const oldLine = existingLines[i];
    const newLine = generatedLines[i];

    if (oldLine === undefined) {
      lines.push(chalk.green('+ ' + newLine));
    } else if (newLine === undefined) {
      lines.push(chalk.red('- ' + oldLine));
    } else if (oldLine !== newLine) {
      lines.push(chalk.red('- ' + oldLine));
      lines.push(chalk.green('+ ' + newLine));
    }
  }

  return lines.join('\n');
}

async function readExisting(fullPath: string): Promise<string | null> {
  try {
    return await readFile(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

function summarizeProfile(profile: RepoProfile): string {
  const parts: string[] = [];

  if (profile.languages.length > 0) {
    const topLangs = profile.languages
      .slice(0, 3)
      .map((l) => l.name)
      .join(', ');
    parts.push(topLangs);
  }

  if (profile.frameworks.length > 0) {
    const topFw = profile.frameworks
      .slice(0, 2)
      .map((f) => f.name)
      .join(', ');
    parts.push(topFw);
  }

  if (profile.packageManager !== 'unknown') {
    parts.push(profile.packageManager);
  }

  if (profile.structure.monorepo) {
    parts.push('monorepo');
  }

  return parts.join(' + ') || 'minimal project';
}

// ---------------------------------------------------------------------------
// Capability summary
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<string, string> = {
  'package-management': 'Package Management',
  testing: 'Testing',
  linting: 'Linting',
  formatting: 'Formatting',
  building: 'Building',
  deploying: 'Deploying',
  containerization: 'Containers',
  database: 'Database',
  api: 'API',
  'cli-tool': 'CLI Tools',
  scaffolding: 'Scaffolding',
  monitoring: 'Monitoring',
  documentation: 'Documentation',
  vcs: 'Version Control',
};

function showCapabilitySummary(
  capabilities: DetectedCapability[],
  agents: CommandFile[],
): void {
  console.log('');
  console.log(chalk.bold('  Capabilities detected:'));

  // Group by category
  const byCategory = new Map<string, DetectedCapability[]>();
  for (const cap of capabilities) {
    const cat = cap.rule.category;
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(cap);
  }

  for (const [category, caps] of byCategory) {
    const label = CATEGORY_LABELS[category] ?? category;
    const names = caps.map((c) => c.rule.label).join(', ');
    console.log(chalk.dim('    ' + label.padEnd(20)) + ' ' + names);
  }

  if (agents.length > 0) {
    console.log('');
    console.log(chalk.bold('  Agents to generate:'));

    for (const agent of agents) {
      // Extract the description from the markdown (second non-empty line after header)
      const lines = agent.content.split('\n').filter((l) => l.trim());
      const description = lines.length > 1 ? lines[1] : '';
      const name = chalk.cyan('/' + agent.filename.replace('.md', ''));
      console.log('    ' + name.padEnd(24) + chalk.dim(description));
    }
  }

  console.log('');
}

// ---------------------------------------------------------------------------
// Main action
// ---------------------------------------------------------------------------

async function initAction(
  targetPath: string,
  options: InitOptions,
): Promise<void> {
  const spinner = ora({ isSilent: options.dryRun && !options.verbose });

  try {
    // --- Step 1: Detection ---
    spinner.start('Detecting project profile...');
    const detectorChain = new DetectorChain();
    const repoProfile: RepoProfile = await detectorChain.detect(targetPath);
    spinner.succeed('Detected: ' + summarizeProfile(repoProfile));

    // --- Step 2: Index ---
    spinner.start('Indexing files...');
    const fileIndex = new FileIndex(targetPath);
    await fileIndex.build();
    const gitContext = new GitContext(targetPath);
    spinner.succeed('Indexed ' + fileIndex.getFileCount() + ' files');

    // --- Step 2.5: Capability Discovery ---
    const generatorCtxForScan: GeneratorContext = {
      rootPath: targetPath,
      repoProfile,
      scoreResult: null,
      fileIndex,
      gitContext,
      preset: options.preset,
      interactive: options.interactive,
    };

    const capabilities = scanCapabilities(generatorCtxForScan);
    const agents = inferAgents(capabilities);

    if (capabilities.length > 0) {
      showCapabilitySummary(capabilities, agents);
    }

    // --- Step 3: Scoring (optional) ---
    let scoreResult: ScoreResult | null = null;

    if (options.score) {
      spinner.start('Scoring repository...');

      const scoringEngine = new ScoringEngine();
      const analyzers = [
        new DocumentationAnalyzer(),
        new ModularityAnalyzer(),
        new ConventionsAnalyzer(),
        new TypeSafetyAnalyzer(),
        new TestCoverageAnalyzer(),
        new GitHygieneAnalyzer(),
        new CiCdAnalyzer(),
        new DependenciesAnalyzer(),
      ];

      const pipeline = new ScorePipeline({
        onBeforeStage: (name) => {
          if (options.verbose) {
            spinner.text = 'Scoring: ' + name + '...';
          }
        },
      });

      pipeline.addStage(new DetectStage() as any);
      pipeline.addStage(new IndexStage() as any);
      pipeline.addStage(new AnalyzeStage(analyzers) as any);
      pipeline.addStage(new ScoreStage(scoringEngine) as any);

      const { output: pipelineOutput } = await pipeline.execute({
        rootPath: targetPath,
      });
      const result = pipelineOutput as { scoreResult: ScoreResult };
      scoreResult = result.scoreResult;

      spinner.succeed(
        'Score: ' + Math.round(scoreResult.total) + '/100',
      );
    }

    // --- Step 4: Generate ---
    spinner.start('Generating configuration...');

    const generatorCtx: GeneratorContext = {
      rootPath: targetPath,
      repoProfile,
      scoreResult,
      fileIndex,
      gitContext,
      preset: options.preset,
      interactive: options.interactive,
    };

    const orchestratorOptions: OrchestratorOptions = {
      dryRun: options.dryRun,
      force: options.force,
      merge: options.merge,
      skip: options.skip,
      only: options.only,
    };

    const output = await runGenerators(generatorCtx, orchestratorOptions);
    spinner.succeed(
      'Generated ' +
        output.files.size +
        ' files in ' +
        output.duration.toFixed(0) +
        'ms',
    );

    // --- Step 5: Diff mode ---
    if (options.diff) {
      console.log('');
      console.log(chalk.bold('Changes:'));
      console.log('');

      for (const [relativePath, content] of output.files) {
        const fullPath = join(targetPath, relativePath);
        const existing = await readExisting(fullPath);
        console.log(showDiff(relativePath, existing, content));
        console.log('');
      }

      if (options.dryRun) {
        console.log(chalk.yellow('Dry run: no files written.'));
        return;
      }
    }

    // --- Step 6: Dry-run summary ---
    if (options.dryRun) {
      console.log('');
      console.log(chalk.bold('Dry run: files that would be generated:'));
      console.log('');

      for (const [relativePath] of output.files) {
        console.log(chalk.green('  + ' + relativePath));
      }
      for (const p of output.skipped) {
        console.log(
          chalk.yellow('  ~ ' + p + ' (skipped, already exists)'),
        );
      }
      for (const p of output.merged) {
        console.log(chalk.cyan('  * ' + p + ' (merged)'));
      }

      console.log('');
      console.log(chalk.yellow('Run without --dry-run to write files.'));
      return;
    }

    // --- Step 7: Write files ---
    spinner.start('Writing files...');

    let writtenCount = 0;
    for (const [relativePath, content] of output.files) {
      const fullPath = join(targetPath, relativePath);
      await ensureDir(dirname(fullPath));
      await writeFile(fullPath, content, 'utf-8');

      // Make shell scripts executable
      if (relativePath.endsWith('.sh')) {
        try {
          await chmod(fullPath, 0o755);
        } catch {
          // chmod may not work on all platforms
        }
      }

      writtenCount++;
    }

    spinner.succeed('Wrote ' + writtenCount + ' files');

    // --- Step 8: Summary ---
    printSummary(output, options);
  } catch (error) {
    spinner.fail('Initialization failed');
    console.error(
      chalk.red(error instanceof Error ? error.message : String(error)),
    );
    if (options.verbose && error instanceof Error && error.stack) {
      console.error(chalk.dim(error.stack));
    }
    process.exit(1);
  }
}

function printSummary(
  output: { files: Map<string, string>; skipped: string[]; merged: string[] },
  options: InitOptions,
): void {
  console.log('');
  console.log(
    chalk.bold.green('Claude Code configuration generated successfully!'),
  );
  console.log('');

  const categories = {
    config: [] as string[],
    commands: [] as string[],
    hooks: [] as string[],
  };

  for (const [relativePath] of output.files) {
    if (
      relativePath.endsWith('CLAUDE.md') ||
      relativePath.endsWith('settings.json') ||
      relativePath.endsWith('mcp.json')
    ) {
      categories.config.push(relativePath);
    } else if (relativePath.includes('/commands/')) {
      categories.commands.push(relativePath);
    } else if (relativePath.includes('/hooks/')) {
      categories.hooks.push(relativePath);
    }
  }

  if (categories.config.length > 0) {
    console.log(chalk.bold('  Configuration:'));
    for (const p of categories.config) {
      console.log(chalk.green('    ' + p));
    }
  }
  if (categories.commands.length > 0) {
    console.log(chalk.bold('  Commands:'));
    for (const p of categories.commands) {
      console.log(chalk.green('    ' + p));
    }
  }
  if (categories.hooks.length > 0) {
    console.log(chalk.bold('  Hooks:'));
    for (const p of categories.hooks) {
      console.log(chalk.green('    ' + p));
    }
  }

  if (output.skipped.length > 0) {
    console.log('');
    console.log(
      chalk.yellow(
        '  Skipped ' +
          output.skipped.length +
          ' existing file(s). Use --force to overwrite or --merge to merge.',
      ),
    );
  }
  if (output.merged.length > 0) {
    console.log('');
    console.log(
      chalk.cyan(
        '  Merged ' + output.merged.length + ' file(s) with existing config.',
      ),
    );
  }

  console.log('');
  console.log(
    'Preset: ' +
      chalk.bold(options.preset) +
      ' - ' +
      getPresetDescription(options.preset),
  );
  console.log('');
  console.log(
    chalk.dim('Run "claude-adapt score" to analyze your codebase quality.'),
  );
  console.log(
    chalk.dim(
      'Edit .claude/CLAUDE.md to customize project instructions for Claude.',
    ),
  );
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerInitCommand(program: Command): void {
  const validPresets = getPresetNames();

  program
    .command('init [path]')
    .description(
      'Generate optimized .claude/ configuration for your project',
    )
    .option(
      '-i, --interactive',
      'interactive mode: prompt for each decision',
      false,
    )
    .option(
      '-p, --preset <preset>',
      'safety preset (' + validPresets.join('|') + ')',
      'standard',
    )
    .option(
      '--skip <generators...>',
      'skip specific generators (claude-md,settings,commands,hooks,mcp)',
    )
    .option('--only <generators...>', 'only run specific generators')
    .option(
      '--force',
      'overwrite existing files without prompting',
      false,
    )
    .option(
      '--dry-run',
      'preview what would be generated without writing',
      false,
    )
    .option(
      '--diff',
      'show diff between existing and generated files',
      false,
    )
    .option(
      '--merge',
      'merge with existing files instead of skipping',
      false,
    )
    .option(
      '--no-score',
      'skip scoring (faster but fewer gotchas in CLAUDE.md)',
    )
    .option('--verbose', 'show detailed progress', false)
    .action(
      async (path: string | undefined, opts: Record<string, unknown>) => {
        const targetPath = resolve(path ?? process.cwd());

        const preset = (opts.preset as string) || 'standard';
        if (!validPresets.includes(preset as Preset)) {
          console.error(
            chalk.red(
              'Invalid preset "' +
                preset +
                '". Valid options: ' +
                validPresets.join(', '),
            ),
          );
          process.exit(1);
        }

        const options: InitOptions = {
          interactive: Boolean(opts.interactive),
          preset: preset as Preset,
          skip: opts.skip as string[] | undefined,
          only: opts.only as string[] | undefined,
          force: Boolean(opts.force),
          dryRun: Boolean(opts.dryRun),
          diff: Boolean(opts.diff),
          merge: Boolean(opts.merge),
          score: opts.score !== false,
          verbose: Boolean(opts.verbose),
        };

        await initAction(targetPath, options);
      },
    );
}
