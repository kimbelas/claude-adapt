import type { PipelineStage } from '../stage.js';
import type { AnalyzerResult, ScoreResult, Recommendation } from '../../../types.js';
import type { ScanContext } from '../../context/scan-context.js';

export interface RecommendStageInput {
  context: ScanContext;
  analyzerResults: AnalyzerResult[];
  scoreResult: ScoreResult;
}

export interface RecommendStageOutput {
  context: ScanContext;
  analyzerResults: AnalyzerResult[];
  scoreResult: ScoreResult;
  recommendations: Recommendation[];
}

export class RecommendStage implements PipelineStage<RecommendStageInput, RecommendStageOutput> {
  name = 'recommend';

  private engine: { generate(scoreResult: ScoreResult): Recommendation[] };

  constructor(engine: { generate(scoreResult: ScoreResult): Recommendation[] }) {
    this.engine = engine;
  }

  async execute(input: RecommendStageInput): Promise<RecommendStageOutput> {
    const recommendations = this.engine.generate(input.scoreResult);

    return {
      context: input.context,
      analyzerResults: input.analyzerResults,
      scoreResult: input.scoreResult,
      recommendations,
    };
  }
}
