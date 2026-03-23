import type { PipelineStage } from '../stage.js';
import type { RepoProfile } from '../../../types.js';
import { FileIndex } from '../../context/file-index.js';
import { GitContext } from '../../context/git-context.js';
import { ScanContext, type ScanOptions } from '../../context/scan-context.js';

export interface IndexStageInput {
  rootPath: string;
  profile: RepoProfile;
  options?: ScanOptions;
}

export interface IndexStageOutput {
  context: ScanContext;
}

export class IndexStage implements PipelineStage<IndexStageInput, IndexStageOutput> {
  name = 'index';

  async execute(input: IndexStageInput): Promise<IndexStageOutput> {
    const fileIndex = new FileIndex(input.rootPath);
    await fileIndex.build();

    const git = new GitContext(input.rootPath);

    const context = new ScanContext({
      rootPath: input.rootPath,
      profile: input.profile,
      fileIndex,
      git,
      options: input.options ?? {},
    });

    return { context };
  }
}
