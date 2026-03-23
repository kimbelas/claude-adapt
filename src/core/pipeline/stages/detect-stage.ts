import type { PipelineStage } from '../stage.js';
import type { RepoProfile } from '../../../types.js';
import { DetectorChain } from '../../detection/detector-chain.js';

export interface DetectStageInput {
  rootPath: string;
}

export interface DetectStageOutput {
  rootPath: string;
  profile: RepoProfile;
}

export class DetectStage implements PipelineStage<DetectStageInput, DetectStageOutput> {
  name = 'detect';
  private detectorChain = new DetectorChain();

  async execute(input: DetectStageInput): Promise<DetectStageOutput> {
    const profile = await this.detectorChain.detect(input.rootPath);
    return { rootPath: input.rootPath, profile };
  }
}
