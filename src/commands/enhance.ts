/**
 * CLI command handler for claude-adapt enhance.
 *
 * Reads existing .claude/ configuration, runs detection + scoring,
 * performs gap analysis, and produces ranked suggestions with draft
 * content — or auto-applies them with --apply.
 */

import { resolve, join, basename } from 'node:path';
import { readFile, mkdir, writeFile, readdir, chmod } from 'node:fs/promises';

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';

import { DetectorChain } from '../core/detection/detector-chain.js';
import { FileIndex } from '../core/context/file-index.js';
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
import { ClaudeMdParser } from '../skills/mergers/claude-md-parser.js';
import type { SectionTree } from '../skills/mergers/claude-md-parser.js';
import { GapAnalyzer } from '../enhance/gap-analyzer.js';
import { QualityScorer } from '../enhance/quality-scorer.js';
import { EnhanceReporter } from '../enhance/enhance-reporter.js';
import { EnhanceApplier } from '../enhance/enhance-applier.js';
import { SettingsAnalyzer } from '../enhance/config-analyzers/settings-analyzer.js';
import { CommandsAnalyzer } from '../enhance/config-analyzers/commands-analyzer.js';
import { HooksAnalyzer } from '../enhance/config-analyzers/hooks-analyzer.js';
import { McpAnalyzer } from '../enhance/config-analyzers/mcp-analyzer.js';
import type { RepoProfile, ScoreResult } from '../types.js';
import type { EnhanceAnalysis, GapContext, SuggestionCategory, ConfigSuggestion } from '../enhance/types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EnhanceOptions {
  apply: boolean;
  dryRun: boolean;
  verbose: boolean;
  format: 'terminal' | 'json';
  categories: string[] | undefined;
  score: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function readSafe(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

async function listDir(dirPath: string): Promise<string[]> {
  try {
    const entries = await readdir(dirPath);
    return entries;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main action
// ---------------------------------------------------------------------------

async function enhanceAction(
  targetPath: string,
  options: EnhanceOptions,
): Promise<void> {
  const spinner = ora({ isSilent: options.format === 'json' });

  try {
    // --- Step 1: Find existing CLAUDE.md ---
    const claudeMdPaths = [
      join(targetPath, '.claude', 'CLAUDE.md'),
      join(targetPath, 'CLAUDE.md'),
    ];

    let claudeMdPath: string | null = null;
    let claudeMdContent: string | null = null;

    for (const candidate of claudeMdPaths) {
      const content = await readSafe(candidate);
      if (content !== null) {
        claudeMdPath = candidate;
        claudeMdContent = content;
        break;
      }
    }

    const hasExistingConfig = claudeMdContent !== null;

    if (!hasExistingConfig && !options.apply) {
      console.log(chalk.yellow('No existing CLAUDE.md found.'));
      console.log(chalk.dim('Run "claude-adapt init" to generate a new configuration.'));
      return;
    }

    // --- Step 2: Detection ---
    spinner.start('Detecting project profile...');
    const detectorChain = new DetectorChain();
    const profile: RepoProfile = await detectorChain.detect(targetPath);
    spinner.succeed('Detected project profile');

    // --- Step 3: Indexing ---
    spinner.start('Indexing files...');
    const fileIndex = new FileIndex(targetPath);
    await fileIndex.build();
    spinner.succeed(`Indexed ${fileIndex.getFileCount()} files`);

    // --- Step 4: Scoring (optional) ---
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
            spinner.text = `Scoring: ${name}...`;
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

      spinner.succeed(`Repo score: ${Math.round(scoreResult.total)}/100`);
    }

    // --- Step 5: Parse existing CLAUDE.md ---
    const parser = new ClaudeMdParser();
    const tree: SectionTree = claudeMdContent
      ? parser.parse(claudeMdContent)
      : { sections: [], preamble: '' };

    const allSections = ClaudeMdParser.flatten(tree.sections);
    const sectionTitles = new Set(
      allSections.map((s) => parser.slugify(s.title)),
    );
    const sectionContent = allSections.map((s) => s.content).join('\n');

    // --- Step 6: Gap Analysis ---
    spinner.start('Analyzing configuration gaps...');

    const gapCtx: GapContext = {
      tree,
      sections: allSections,
      sectionTitles,
      sectionContent,
      profile,
      scoreResult,
      fileIndex,
    };

    const gapAnalyzer = new GapAnalyzer();
    let suggestions = gapAnalyzer.analyze(gapCtx);

    // Filter by categories if specified
    if (options.categories) {
      const cats = new Set(options.categories as SuggestionCategory[]);
      suggestions = suggestions.filter((s) => cats.has(s.category));
    }

    spinner.succeed(`Found ${suggestions.length} CLAUDE.md suggestions`);

    // --- Step 7: Config analyzers ---
    spinner.start('Analyzing .claude/ directory...');

    const claudeDir = join(targetPath, '.claude');
    const settingsContent = await readSafe(join(claudeDir, 'settings.json'));
    const mcpContent = await readSafe(join(claudeDir, 'mcp.json'));
    const existingCommands = await listDir(join(claudeDir, 'commands'));
    const existingHooks = await listDir(join(claudeDir, 'hooks'));

    const configSuggestions: ConfigSuggestion[] = [];

    const settingsAnalyzer = new SettingsAnalyzer();
    configSuggestions.push(...settingsAnalyzer.analyze(settingsContent, profile, fileIndex));

    const commandsAnalyzer = new CommandsAnalyzer();
    configSuggestions.push(...commandsAnalyzer.analyze(existingCommands, profile, fileIndex));

    const hooksAnalyzer = new HooksAnalyzer();
    configSuggestions.push(...hooksAnalyzer.analyze(existingHooks, profile));

    const mcpAnalyzer = new McpAnalyzer();
    configSuggestions.push(...mcpAnalyzer.analyze(mcpContent, profile, fileIndex));

    spinner.succeed(`Found ${configSuggestions.length} config suggestions`);

    // --- Step 8: Quality scoring ---
    const qualityScorer = new QualityScorer();
    const breakdown = qualityScorer.score(allSections, claudeMdContent ?? '', profile);

    // --- Step 9: Build analysis result ---
    const categoryCounts = {} as Record<SuggestionCategory, number>;
    const allCategories: SuggestionCategory[] = [
      'missing', 'incomplete', 'stale', 'security', 'environment', 'routes', 'tasks',
    ];
    for (const cat of allCategories) {
      categoryCounts[cat] = suggestions.filter((s) => s.category === cat).length;
    }

    const analysis: EnhanceAnalysis = {
      qualityScore: breakdown.total,
      suggestions,
      categoryCounts,
      hasExistingConfig,
      configPath: claudeMdPath ?? join(claudeDir, 'CLAUDE.md'),
    };

    // --- Step 10: Apply or report ---
    if (options.apply) {
      await applyEnhancements(
        targetPath,
        claudeMdContent ?? '',
        claudeMdPath ?? join(claudeDir, 'CLAUDE.md'),
        analysis,
        configSuggestions,
        settingsContent,
        mcpContent,
        options,
        spinner,
      );
    } else {
      const reporter = new EnhanceReporter();
      const projectName = basename(targetPath);

      if (options.format === 'json') {
        console.log(reporter.renderJson(analysis, breakdown, configSuggestions));
      } else {
        console.log(reporter.renderTerminal(analysis, breakdown, configSuggestions, projectName));
      }
    }
  } catch (error) {
    spinner.fail('Enhancement analysis failed');
    console.error(
      chalk.red(error instanceof Error ? error.message : String(error)),
    );
    if (options.verbose && error instanceof Error && error.stack) {
      console.error(chalk.dim(error.stack));
    }
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Apply mode
// ---------------------------------------------------------------------------

async function applyEnhancements(
  targetPath: string,
  claudeMdContent: string,
  claudeMdPath: string,
  analysis: EnhanceAnalysis,
  configSuggestions: ConfigSuggestion[],
  settingsContent: string | null,
  mcpContent: string | null,
  options: EnhanceOptions,
  spinner: ReturnType<typeof ora>,
): Promise<void> {
  const applier = new EnhanceApplier();

  const existingConfigs = new Map<string, string>();
  if (settingsContent) existingConfigs.set('.claude/settings.json', settingsContent);
  if (mcpContent) existingConfigs.set('.claude/mcp.json', mcpContent);

  const result = applier.apply(
    claudeMdContent,
    analysis.suggestions,
    configSuggestions,
    existingConfigs,
  );

  if (options.dryRun) {
    console.log('');
    console.log(chalk.bold('Dry run — changes that would be applied:'));
    console.log('');

    if (result.claudeMd) {
      console.log(chalk.green(`  + ${claudeMdPath} (CLAUDE.md updated)`));
    }
    for (const [path] of result.configFiles) {
      console.log(chalk.green(`  + ${join(targetPath, path)}`));
    }
    if (result.skipped.length > 0) {
      for (const id of result.skipped) {
        console.log(chalk.yellow(`  ~ ${id} (skipped)`));
      }
    }

    console.log('');
    console.log(chalk.yellow('Run without --dry-run to write files.'));
    return;
  }

  spinner.start('Applying enhancements...');

  let writtenCount = 0;

  // Write updated CLAUDE.md
  if (result.claudeMd) {
    const dir = join(targetPath, '.claude');
    await mkdir(dir, { recursive: true });
    await writeFile(claudeMdPath, result.claudeMd, 'utf-8');
    writtenCount++;
  }

  // Write config files
  for (const [relativePath, content] of result.configFiles) {
    const fullPath = join(targetPath, relativePath);
    const dir = join(fullPath, '..');
    await mkdir(dir, { recursive: true });
    await writeFile(fullPath, content, 'utf-8');

    if (relativePath.endsWith('.sh')) {
      try {
        await chmod(fullPath, 0o755);
      } catch {
        // chmod may not work on all platforms
      }
    }

    writtenCount++;
  }

  spinner.succeed(
    `Applied ${result.appliedCount} enhancements across ${writtenCount} files`,
  );

  if (result.skipped.length > 0) {
    console.log(
      chalk.yellow(
        `  ${result.skipped.length} suggestion(s) could not be applied automatically.`,
      ),
    );
  }

  console.log('');
  console.log(chalk.bold.green('Enhancement complete!'));
  console.log(
    chalk.dim('Run "claude-adapt enhance" again to check for remaining improvements.'),
  );
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerEnhanceCommand(program: Command): void {
  program
    .command('enhance [path]')
    .description(
      'Analyze existing .claude/ config and suggest improvements',
    )
    .option('--apply', 'apply suggestions (add missing sections, never overwrite)', false)
    .option('--dry-run', 'preview changes without writing', false)
    .option('--verbose', 'show evidence details and draft content', false)
    .option(
      '--format <type>',
      'output format (terminal | json)',
      'terminal',
    )
    .option(
      '--categories <list>',
      'filter by categories (comma-separated: missing,incomplete,stale,security,environment,routes,tasks)',
    )
    .option('--no-score', 'skip scoring (faster, fewer staleness checks)')
    .action(
      async (path: string | undefined, opts: Record<string, unknown>) => {
        const targetPath = resolve(path ?? process.cwd());

        const format = (opts.format as string) || 'terminal';
        if (format !== 'terminal' && format !== 'json') {
          console.error(
            chalk.red(`Invalid format "${format}". Valid options: terminal, json`),
          );
          process.exit(1);
        }

        const categories = opts.categories
          ? (opts.categories as string).split(',').map((c) => c.trim())
          : undefined;

        const options: EnhanceOptions = {
          apply: Boolean(opts.apply),
          dryRun: Boolean(opts.dryRun),
          verbose: Boolean(opts.verbose),
          format: format as 'terminal' | 'json',
          categories,
          score: opts.score !== false,
        };

        await enhanceAction(targetPath, options);
      },
    );
}
