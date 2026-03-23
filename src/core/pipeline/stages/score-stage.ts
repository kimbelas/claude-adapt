import type { PipelineStage } from '../stage.js';
import type { AnalyzerResult, ScoreResult } from '../../../types.js';
import type { ScanContext } from '../../context/scan-context.js';

export interface ScoreStageInput {
  context: ScanContext;
  analyzerResults: AnalyzerResult[];
}

export interface ScoreStageOutput {
  context: ScanContext;
  analyzerResults: AnalyzerResult[];
  scoreResult: ScoreResult;
}

export class ScoreStage implements PipelineStage<ScoreStageInput, ScoreStageOutput> {
  name = 'score';

  private scoringEngine: { score(results: AnalyzerResult[]): ScoreResult };

  constructor(scoringEngine: { score(results: AnalyzerResult[]): ScoreResult }) {
    this.scoringEngine = scoringEngine;
  }

  async execute(input: ScoreStageInput): Promise<ScoreStageOutput> {
    const scoreResult = this.scoringEngine.score(input.analyzerResults);

    return {
      context: input.context,
      analyzerResults: input.analyzerResults,
      scoreResult,
    };
  }
}
