import type { PipelineStage } from '../stage.js';
import type { AnalyzerResult } from '../../../types.js';
import type { ScanContext } from '../../context/scan-context.js';
import type { BaseAnalyzer } from '../../../analyzers/_base.js';

export interface AnalyzeStageInput {
  context: ScanContext;
}

export interface AnalyzeStageOutput {
  context: ScanContext;
  analyzerResults: AnalyzerResult[];
}

export class AnalyzeStage implements PipelineStage<AnalyzeStageInput, AnalyzeStageOutput> {
  name = 'analyze';

  constructor(private readonly analyzers: BaseAnalyzer[]) {}

  async execute(input: AnalyzeStageInput): Promise<AnalyzeStageOutput> {
    const results = await Promise.all(
      this.analyzers.map(analyzer => analyzer.analyze(input.context)),
    );

    return {
      context: input.context,
      analyzerResults: results,
    };
  }
}
