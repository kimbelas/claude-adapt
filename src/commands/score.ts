import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';

import { Command } from 'commander';
import ora from 'ora';

import { ScorePipeline } from '../core/pipeline/pipeline.js';
import { DetectStage } from '../core/pipeline/stages/detect-stage.js';
import { IndexStage } from '../core/pipeline/stages/index-stage.js';
import { AnalyzeStage } from '../core/pipeline/stages/analyze-stage.js';
import { ScoreStage } from '../core/pipeline/stages/score-stage.js';
import { RecommendStage } from '../core/pipeline/stages/recommend-stage.js';
import { ReportStage } from '../core/pipeline/stages/report-stage.js';
import { ScoringEngine } from '../core/scoring/engine.js';
import { RecommendationEngine } from '../recommendations/engine.js';
import { TerminalReporter } from '../reporters/terminal/index.js';
import { JsonReporter } from '../reporters/json/index.js';
import { HistoryStore } from '../history/store.js';
import { detectTrends } from '../history/trends.js';
import { FixerEngine, FIXER_CATALOG } from '../fixers/index.js';
import { DocumentationAnalyzer } from '../analyzers/documentation/index.js';
import { ModularityAnalyzer } from '../analyzers/modularity/index.js';
import { ConventionsAnalyzer } from '../analyzers/conventions/index.js';
import { TypeSafetyAnalyzer } from '../analyzers/type-safety/index.js';
import { TestCoverageAnalyzer } from '../analyzers/test-coverage/index.js';
import { GitHygieneAnalyzer } from '../analyzers/git-hygiene/index.js';
import { CiCdAnalyzer } from '../analyzers/cicd/index.js';
import { DependenciesAnalyzer } from '../analyzers/dependencies/index.js';
import type { AnalyzerCategory, ScoreRun, Trend } from '../types.js';
import type { FixContext } from '../fixers/types.js';

interface ScoreOptions {
  format: 'terminal' | 'json';
  output?: string;
  ci: boolean;
  threshold: number;
  category?: string[];
  verbose: boolean;
  quiet: boolean;
  history: boolean;
  cache: boolean;
  fix: boolean;
  dryRun: boolean;
}

export function registerScoreCommand(program: Command): void {
  program
    .command('score [path]')
    .description('Scan a codebase and produce a Claude Code Readiness Score (0-100)')
    .option('-f, --format <type>', 'output format (terminal|json)', 'terminal')
    .option('-o, --output <path>', 'write report to file')
    .option('--ci', 'CI mode — exit non-zero when score is below threshold', false)
    .option('--threshold <n>', 'CI failure threshold (0-100)', parseFloat, 50)
    .option('--category <names...>', 'score specific categories only')
    .option('--verbose', 'show individual signal details', false)
    .option('--quiet', 'print the score number only', false)
    .option('--no-history', 'do not persist this run to history')
    .option('--no-cache', 'force a full rescan (ignore content-hash cache)')
    .option('--fix', 'automatically apply low-effort fixes after scoring', false)
    .option('--dry-run', 'show what --fix would do without making changes', false)
    .action(async (path: string | undefined, options: ScoreOptions) => {
      const targetPath = resolve(path ?? process.cwd());
      const format = options.ci ? 'json' : options.format;

      const spinner = options.quiet ? null : ora('Scanning repository...').start();

      try {
        // Build the pipeline
        const scoringEngine = new ScoringEngine();
        const recEngine = new RecommendationEngine();
        const reporter = format === 'json' ? new JsonReporter() : new TerminalReporter();

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
            if (spinner) spinner.text = `${name}...`;
          },
        });

        pipeline.addStage(new DetectStage() as any);
        pipeline.addStage(new IndexStage() as any);
        pipeline.addStage(new AnalyzeStage(analyzers) as any);
        pipeline.addStage(new ScoreStage(scoringEngine) as any);
        pipeline.addStage(new RecommendStage(recEngine) as any);

        // Run the pipeline (detect -> index -> analyze -> score -> recommend)
        const { output: pipelineOutput } = await pipeline.execute({ rootPath: targetPath });
        const result = pipelineOutput as {
          context: any;
          scoreResult: any;
          recommendations: any[];
          analyzerResults: any[];
        };

        spinner?.stop();

        // History & trends
        let trends: Trend[] = [];
        const historyStore = new HistoryStore();

        if (options.history !== false) {
          const history = await historyStore.read(targetPath);
          if (history) {
            trends = detectTrends(history);
          }

          const gitContext = result.context.git;
          const run: ScoreRun = {
            timestamp: new Date().toISOString(),
            commitHash: await gitContext.getHead(),
            branch: await gitContext.getBranch(),
            total: Math.round(result.scoreResult.total),
            categories: Object.fromEntries(
              Object.entries(result.scoreResult.categories).map(([key, cat]: [string, any]) => [
                key,
                { score: cat.normalized, max: cat.max, signalCount: cat.signals.length },
              ]),
            ) as Record<AnalyzerCategory, { score: number; max: number; signalCount: number }>,
            recommendations: result.recommendations.length,
            duration: pipeline.duration,
          };

          await historyStore.addRun(targetPath, run);
        }

        // Report
        const reportStage = new ReportStage(reporter);
        const { report } = await reportStage.execute({
          context: result.context,
          analyzerResults: result.analyzerResults,
          scoreResult: result.scoreResult,
          recommendations: result.recommendations,
          trends,
        });

        if (options.quiet) {
          console.log(Math.round(result.scoreResult.total));
        } else {
          console.log(report);
        }

        // Auto-fix
        if (options.fix || options.dryRun) {
          const fixSpinner = options.quiet ? null : ora('Applying auto-fixes...').start();

          const fixContext: FixContext = {
            targetPath,
            profile: result.context.profile,
            recommendations: result.recommendations.map((r: any) => ({
              id: r.id,
              signal: r.signal,
              title: r.title,
              gap: r.gap,
              effort: r.effort,
            })),
            dryRun: options.dryRun,
          };

          const fixerEngine = new FixerEngine(FIXER_CATALOG);
          const fixResults = await fixerEngine.run(fixContext);

          fixSpinner?.stop();
          FixerEngine.printSummary(fixResults);
        }

        // Write to file if requested
        if (options.output) {
          await writeFile(options.output, report, 'utf-8');
        }

        // CI mode exit code
        if (options.ci) {
          const score = Math.round(result.scoreResult.total);
          if (score < options.threshold) {
            process.exit(1);
          }
        }
      } catch (error) {
        spinner?.fail('Scoring failed');
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}
