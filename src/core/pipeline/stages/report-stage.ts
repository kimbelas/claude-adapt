import type { PipelineStage } from '../stage.js';
import type { AnalyzerResult, ScoreResult, Recommendation, Trend } from '../../../types.js';
import type { ScanContext } from '../../context/scan-context.js';
import type { Reporter, ReportData } from '../../../reporters/renderer.js';
import { basename } from 'node:path';

export interface ReportStageInput {
  context: ScanContext;
  analyzerResults: AnalyzerResult[];
  scoreResult: ScoreResult;
  recommendations: Recommendation[];
  trends?: Trend[];
}

export interface ReportStageOutput {
  report: string;
  scoreResult: ScoreResult;
  recommendations: Recommendation[];
}

export class ReportStage implements PipelineStage<ReportStageInput, ReportStageOutput> {
  name = 'report';

  constructor(
    private readonly reporter: Reporter,
    private readonly version = '0.1.0',
  ) {}

  async execute(input: ReportStageInput): Promise<ReportStageOutput> {
    const reportData: ReportData = {
      scoreResult: input.scoreResult,
      recommendations: input.recommendations,
      trends: input.trends ?? [],
      repoName: basename(input.context.rootPath),
      version: this.version,
    };

    const report = this.reporter.render(reportData);

    return {
      report,
      scoreResult: input.scoreResult,
      recommendations: input.recommendations,
    };
  }
}
