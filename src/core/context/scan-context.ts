import type { RepoProfile } from '../../types.js';
import type { FileIndex } from './file-index.js';
import type { GitContext } from './git-context.js';

export interface ScanOptions {
  categories?: string[];
  noCache?: boolean;
  noHistory?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

export class ScanContext {
  readonly rootPath: string;
  readonly profile: RepoProfile;
  readonly fileIndex: FileIndex;
  readonly git: GitContext;
  readonly options: ScanOptions;
  readonly timestamp: string;

  constructor(params: {
    rootPath: string;
    profile: RepoProfile;
    fileIndex: FileIndex;
    git: GitContext;
    options: ScanOptions;
  }) {
    this.rootPath = params.rootPath;
    this.profile = Object.freeze(structuredClone(params.profile));
    this.fileIndex = params.fileIndex;
    this.git = params.git;
    this.options = Object.freeze(structuredClone(params.options));
    this.timestamp = new Date().toISOString();
  }
}
