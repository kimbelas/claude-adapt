/**
 * Decision detector — analyzes git diffs to infer architectural decisions.
 *
 * Six heuristics detect meaningful changes:
 *   1. New dependency added (package.json / composer.json)
 *   2. New directory with >= 2 files
 *   3. Configuration file changes
 *   4. Pattern establishment (3+ similar new files)
 *   5. API / route changes
 *   6. Error handling additions
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { dirname, basename, extname } from 'node:path';

import type {
  ArchitecturalDecision,
  ContextStore,
  SessionData,
} from './types.js';

const exec = promisify(execFile);

/** Well-known config file names. */
const CONFIG_FILES = new Set([
  'tsconfig.json',
  'tsconfig.build.json',
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.json',
  'eslint.config.js',
  'eslint.config.mjs',
  '.prettierrc',
  '.prettierrc.json',
  'prettier.config.js',
  'jest.config.ts',
  'jest.config.js',
  'vitest.config.ts',
  'vitest.config.js',
  'vite.config.ts',
  'vite.config.js',
  'webpack.config.js',
  'rollup.config.js',
  'next.config.js',
  'next.config.mjs',
  'tailwind.config.js',
  'tailwind.config.ts',
  'postcss.config.js',
  'babel.config.js',
  '.babelrc',
  'docker-compose.yml',
  'docker-compose.yaml',
  'Dockerfile',
  '.dockerignore',
  '.github/workflows/*.yml',
  '.github/workflows/*.yaml',
  '.env.example',
  'turbo.json',
  'nx.json',
  'tsup.config.ts',
]);

/** File patterns that indicate API / route definitions. */
const API_FILE_PATTERNS = [
  /routes?\.(ts|js|py|rb)$/,
  /controller\.(ts|js|py|rb)$/,
  /api\//,
  /endpoints?\//,
  /handlers?\.(ts|js|py|rb)$/,
];

/** Patterns in file content that indicate error handling. */
const ERROR_PATTERNS = [
  /catch\s*\(/,
  /\.catch\(/,
  /try\s*\{/,
  /throw\s+new/,
  /error\s*handler/i,
  /on\s*error/i,
];

/**
 * Detects architectural decisions from a session's git diff.
 */
export class DecisionDetector {
  private readonly rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
  }

  /**
   * Runs all six detection heuristics against a session.
   */
  async detect(
    session: SessionData,
    store: ContextStore,
  ): Promise<ArchitecturalDecision[]> {
    const decisions: ArchitecturalDecision[] = [];
    const timestamp = new Date().toISOString();

    const [depDecisions, dirDecisions, configDecisions, patternDecisions, apiDecisions, errorDecisions] =
      await Promise.all([
        this.detectDependencyChanges(session, timestamp),
        this.detectNewDirectories(session, timestamp),
        this.detectConfigChanges(session, timestamp),
        this.detectPatternEstablishment(session, store, timestamp),
        this.detectApiChanges(session, timestamp),
        this.detectErrorHandling(session, timestamp),
      ]);

    decisions.push(
      ...depDecisions,
      ...dirDecisions,
      ...configDecisions,
      ...patternDecisions,
      ...apiDecisions,
      ...errorDecisions,
    );

    return decisions;
  }

  // ---------------------------------------------------------------------------
  // 1. New dependency added
  // ---------------------------------------------------------------------------

  private async detectDependencyChanges(
    session: SessionData,
    timestamp: string,
  ): Promise<ArchitecturalDecision[]> {
    const decisions: ArchitecturalDecision[] = [];
    const depFiles = [
      ...session.gitDiff.modifiedFiles,
      ...session.gitDiff.addedFiles,
    ].filter(
      (f) =>
        f === 'package.json' ||
        f === 'composer.json' ||
        f === 'requirements.txt' ||
        f === 'Gemfile' ||
        f === 'go.mod' ||
        f === 'Cargo.toml' ||
        f === 'pyproject.toml',
    );

    if (depFiles.length === 0) return decisions;

    for (const file of depFiles) {
      const diff = await this.getFileDiff(session.startCommit, session.endCommit, file);
      const addedDeps = this.parseAddedDependencies(diff, file);

      for (const dep of addedDeps) {
        decisions.push({
          id: this.makeId('dep', dep.name),
          timestamp,
          sessionId: session.sessionId,
          title: `Added dependency: ${dep.name}${dep.version ? ` (${dep.version})` : ''}`,
          description: `New ${dep.isDev ? 'dev ' : ''}dependency ${dep.name} added to ${file}.`,
          rationale: `Detected via diff of ${file}.`,
          filesAffected: [file],
          diffSummary: `+${dep.name}`,
          category: 'dependency',
          impact: dep.isDev ? 'low' : 'medium',
          confidence: 0.9,
          claudeMdSection: 'tech-stack',
          suggestedContent: `- **${dep.name}**${dep.version ? ` ${dep.version}` : ''}: ${dep.isDev ? 'Dev dependency' : 'Dependency'}`,
          applied: false,
        });
      }
    }

    return decisions;
  }

  private async getFileDiff(from: string, to: string, file: string): Promise<string> {
    try {
      const { stdout } = await exec(
        'git',
        ['diff', `${from}..${to}`, '--', file],
        { cwd: this.rootPath },
      );
      return stdout;
    } catch {
      return '';
    }
  }

  private parseAddedDependencies(
    diff: string,
    file: string,
  ): { name: string; version?: string; isDev: boolean }[] {
    const deps: { name: string; version?: string; isDev: boolean }[] = [];

    if (file === 'package.json') {
      // Parse JSON diff for added lines in dependencies / devDependencies
      let inDevDeps = false;
      for (const line of diff.split('\n')) {
        if (line.includes('"devDependencies"')) inDevDeps = true;
        if (line.includes('"dependencies"')) inDevDeps = false;

        if (line.startsWith('+') && !line.startsWith('+++')) {
          const match = line.match(/"([^"]+)":\s*"([^"]*)"/);
          if (match && match[1] && !match[1].startsWith('{')) {
            deps.push({
              name: match[1],
              version: match[2],
              isDev: inDevDeps,
            });
          }
        }
      }
    } else if (file === 'requirements.txt' || file === 'pyproject.toml') {
      for (const line of diff.split('\n')) {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          const match = line.match(/^\+\s*([a-zA-Z0-9_-]+)/);
          if (match && match[1]) {
            deps.push({ name: match[1], isDev: false });
          }
        }
      }
    } else if (file === 'go.mod') {
      for (const line of diff.split('\n')) {
        if (line.startsWith('+') && !line.startsWith('+++') && line.includes('/')) {
          const match = line.match(/^\+\s*(\S+)\s+(\S+)/);
          if (match && match[1]) {
            deps.push({ name: match[1], version: match[2], isDev: false });
          }
        }
      }
    }

    return deps;
  }

  // ---------------------------------------------------------------------------
  // 2. New directory with >= 2 files
  // ---------------------------------------------------------------------------

  private async detectNewDirectories(
    session: SessionData,
    timestamp: string,
  ): Promise<ArchitecturalDecision[]> {
    const decisions: ArchitecturalDecision[] = [];
    const addedFiles = session.gitDiff.addedFiles;

    // Group new files by directory
    const dirCounts = new Map<string, string[]>();
    for (const file of addedFiles) {
      const dir = dirname(file);
      if (dir === '.') continue;
      const existing = dirCounts.get(dir) ?? [];
      existing.push(file);
      dirCounts.set(dir, existing);
    }

    for (const [dir, files] of dirCounts) {
      if (files.length >= 2) {
        const purpose = this.inferDirectoryPurpose(dir, files);
        decisions.push({
          id: this.makeId('dir', dir),
          timestamp,
          sessionId: session.sessionId,
          title: `Created ${dir}/ directory (${files.length} files)`,
          description: `New directory ${dir}/ with ${files.length} files. Inferred purpose: ${purpose}.`,
          rationale: `${files.length} new files added in the same directory.`,
          filesAffected: files,
          diffSummary: `+${dir}/ (${files.length} files)`,
          category: 'architecture',
          impact: 'medium',
          confidence: 0.7,
          claudeMdSection: 'file-structure',
          suggestedContent: `- \`${dir}/\` — ${purpose}`,
          applied: false,
        });
      }
    }

    return decisions;
  }

  private inferDirectoryPurpose(dir: string, files: string[]): string {
    const dirName = basename(dir).toLowerCase();
    const extensions = files.map((f) => extname(f).toLowerCase());

    if (dirName.includes('test') || dirName.includes('spec')) return 'Tests';
    if (dirName.includes('util') || dirName.includes('helper')) return 'Utility functions';
    if (dirName.includes('component')) return 'UI components';
    if (dirName.includes('hook')) return 'React hooks';
    if (dirName.includes('api') || dirName.includes('route')) return 'API routes';
    if (dirName.includes('model') || dirName.includes('schema')) return 'Data models';
    if (dirName.includes('service')) return 'Service layer';
    if (dirName.includes('middleware')) return 'Middleware';
    if (dirName.includes('config')) return 'Configuration';
    if (dirName.includes('type')) return 'Type definitions';
    if (dirName.includes('migration')) return 'Database migrations';
    if (dirName.includes('seed')) return 'Database seeds';
    if (dirName.includes('fixture')) return 'Test fixtures';
    if (dirName.includes('mock')) return 'Test mocks';
    if (dirName.includes('style') || dirName.includes('css')) return 'Styles';
    if (dirName.includes('asset') || dirName.includes('static')) return 'Static assets';
    if (dirName.includes('lib')) return 'Shared library code';
    if (extensions.every((e) => e === '.ts' || e === '.js')) return 'TypeScript/JavaScript modules';

    return `${files.length} ${extensions[0] ?? ''} files`;
  }

  // ---------------------------------------------------------------------------
  // 3. Configuration file changes
  // ---------------------------------------------------------------------------

  private async detectConfigChanges(
    session: SessionData,
    timestamp: string,
  ): Promise<ArchitecturalDecision[]> {
    const decisions: ArchitecturalDecision[] = [];
    const allFiles = [
      ...session.gitDiff.modifiedFiles,
      ...session.gitDiff.addedFiles,
    ];

    for (const file of allFiles) {
      const fileName = basename(file);
      const isConfig =
        CONFIG_FILES.has(fileName) ||
        file.includes('.github/workflows/') ||
        fileName.startsWith('.') && (fileName.endsWith('rc') || fileName.endsWith('rc.json'));

      if (!isConfig) continue;

      const isNew = session.gitDiff.addedFiles.includes(file);
      const summary = isNew ? 'New config file' : 'Config updated';

      decisions.push({
        id: this.makeId('config', file),
        timestamp,
        sessionId: session.sessionId,
        title: `${isNew ? 'Added' : 'Modified'} ${fileName}`,
        description: `${summary}: ${file}`,
        rationale: `Configuration file ${isNew ? 'created' : 'modified'} during session.`,
        filesAffected: [file],
        diffSummary: `${isNew ? '+' : '~'}${file}`,
        category: 'tooling',
        impact: 'low',
        confidence: 0.8,
        claudeMdSection: 'tooling',
        suggestedContent: `- \`${file}\`: ${summary}`,
        applied: false,
      });
    }

    return decisions;
  }

  // ---------------------------------------------------------------------------
  // 4. Pattern establishment (3+ similar new files)
  // ---------------------------------------------------------------------------

  private async detectPatternEstablishment(
    session: SessionData,
    store: ContextStore,
    timestamp: string,
  ): Promise<ArchitecturalDecision[]> {
    const decisions: ArchitecturalDecision[] = [];
    const addedFiles = session.gitDiff.addedFiles;

    if (addedFiles.length < 3) return decisions;

    // Group files by structural similarity
    const groups = this.groupBySimilarity(addedFiles);

    for (const group of groups) {
      if (group.files.length >= 3) {
        const patternName = this.describePattern(group);
        const confidence = Math.min(0.9, 0.5 + group.files.length * 0.1);

        decisions.push({
          id: this.makeId('pattern', patternName),
          timestamp,
          sessionId: session.sessionId,
          title: `Established pattern: ${patternName}`,
          description: `${group.files.length} files follow the same structural pattern.`,
          rationale: `Files share the same directory structure and naming convention.`,
          filesAffected: group.files,
          diffSummary: `+${group.files.length} similar files`,
          category: 'pattern',
          impact: 'medium',
          confidence,
          claudeMdSection: 'key-patterns',
          suggestedContent: `- **${patternName}**: ${group.description} (e.g. \`${group.files[0]}\`)`,
          applied: false,
        });
      }
    }

    // Reinforce existing low-confidence patterns
    for (const existing of store.patterns) {
      if (existing.confidence < 0.8) {
        const matchingFiles = addedFiles.filter((f) =>
          this.matchesPattern(f, existing),
        );
        if (matchingFiles.length > 0) {
          existing.confidence = Math.min(1.0, existing.confidence + 0.15);
          existing.lastSeen = timestamp;
          existing.sessionCount++;
          existing.sessionIds.push(session.sessionId);
        }
      }
    }

    return decisions;
  }

  private groupBySimilarity(
    files: string[],
  ): { files: string[]; description: string }[] {
    const groups = new Map<string, string[]>();

    for (const file of files) {
      const dir = dirname(file);
      const ext = extname(file);
      const key = `${dir}|${ext}`;
      const existing = groups.get(key) ?? [];
      existing.push(file);
      groups.set(key, existing);
    }

    return Array.from(groups.entries()).map(([key, groupFiles]) => {
      const [dir, ext] = key.split('|');
      return {
        files: groupFiles,
        description: `${ext} files in ${dir}/`,
      };
    });
  }

  private describePattern(group: { files: string[]; description: string }): string {
    const dirs = [...new Set(group.files.map((f) => dirname(f)))];
    const exts = [...new Set(group.files.map((f) => extname(f)))];

    if (dirs.length === 1 && dirs[0]) {
      const dirName = basename(dirs[0]);
      return `${dirName} ${exts.join('/')} pattern`;
    }

    return `${exts.join('/')} file pattern`;
  }

  private matchesPattern(file: string, pattern: DetectedPatternLike): boolean {
    // Check if the file follows the same directory/extension pattern
    return pattern.files.some((pf) => {
      return dirname(file) === dirname(pf) && extname(file) === extname(pf);
    });
  }

  // ---------------------------------------------------------------------------
  // 5. API / route changes
  // ---------------------------------------------------------------------------

  private async detectApiChanges(
    session: SessionData,
    timestamp: string,
  ): Promise<ArchitecturalDecision[]> {
    const decisions: ArchitecturalDecision[] = [];
    const allFiles = [
      ...session.gitDiff.modifiedFiles,
      ...session.gitDiff.addedFiles,
    ];

    const apiFiles = allFiles.filter((file) =>
      API_FILE_PATTERNS.some((pattern) => pattern.test(file)),
    );

    for (const file of apiFiles) {
      const isNew = session.gitDiff.addedFiles.includes(file);

      decisions.push({
        id: this.makeId('api', file),
        timestamp,
        sessionId: session.sessionId,
        title: `${isNew ? 'New' : 'Modified'} API file: ${basename(file)}`,
        description: `API/route file ${isNew ? 'created' : 'modified'}: ${file}`,
        rationale: `File matches API/route naming pattern.`,
        filesAffected: [file],
        diffSummary: `${isNew ? '+' : '~'}${file}`,
        category: 'architecture',
        impact: 'medium',
        confidence: 0.85,
        claudeMdSection: 'common-tasks',
        suggestedContent: `- API: \`${file}\``,
        applied: false,
      });
    }

    return decisions;
  }

  // ---------------------------------------------------------------------------
  // 6. Error handling additions
  // ---------------------------------------------------------------------------

  private async detectErrorHandling(
    session: SessionData,
    timestamp: string,
  ): Promise<ArchitecturalDecision[]> {
    const decisions: ArchitecturalDecision[] = [];

    // Only look at modified files (error handling additions to existing files)
    for (const file of session.gitDiff.modifiedFiles.slice(0, 20)) {
      const diff = await this.getFileDiff(
        session.startCommit,
        session.endCommit,
        file,
      );

      const addedLines = diff
        .split('\n')
        .filter((l) => l.startsWith('+') && !l.startsWith('+++'));

      const errorLines = addedLines.filter((line) =>
        ERROR_PATTERNS.some((pattern) => pattern.test(line)),
      );

      if (errorLines.length >= 2) {
        const summary = `Error handling in ${basename(file)}`;
        decisions.push({
          id: this.makeId('error', file),
          timestamp,
          sessionId: session.sessionId,
          title: `Added error handling: ${summary}`,
          description: `${errorLines.length} error handling patterns added to ${file}.`,
          rationale: `Multiple try/catch or error handler patterns detected in diff.`,
          filesAffected: [file],
          diffSummary: `+${errorLines.length} error handling lines`,
          category: 'pattern',
          impact: 'low',
          confidence: 0.6,
          claudeMdSection: 'gotchas',
          suggestedContent: `- ${file}: New error handling added`,
          applied: false,
        });
      }
    }

    return decisions;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private makeId(prefix: string, key: string): string {
    const hash = createHash('sha256').update(key).digest('hex').slice(0, 8);
    return `${prefix}-${hash}`;
  }
}

/** Minimal shape for pattern matching. */
interface DetectedPatternLike {
  files: string[];
}
