import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { LanguageDetector } from './language.js';
import { FrameworkDetector } from './framework.js';
import { ToolingDetector } from './tooling.js';
import { MonorepoDetector } from './monorepo.js';
import type { RepoProfile } from '../../types.js';

export class DetectorChain {
  private languageDetector = new LanguageDetector();
  private frameworkDetector = new FrameworkDetector();
  private toolingDetector = new ToolingDetector();
  private monorepoDetector = new MonorepoDetector();

  async detect(rootPath: string): Promise<RepoProfile> {
    const [languages, frameworks, tooling, monorepo] = await Promise.all([
      this.languageDetector.detect(rootPath),
      this.frameworkDetector.detect(rootPath),
      this.toolingDetector.detect(rootPath),
      this.monorepoDetector.detect(rootPath),
    ]);

    const packageManager = await this.detectPackageManager(rootPath);
    const depth = await this.calculateMaxDepth(rootPath);
    const entryPoints = await this.detectEntryPoints(rootPath);

    return {
      languages,
      frameworks,
      tooling,
      structure: {
        monorepo: monorepo.detected,
        depth,
        entryPoints,
      },
      packageManager,
    };
  }

  private async detectPackageManager(
    rootPath: string,
  ): Promise<RepoProfile['packageManager']> {
    const checks: [string, RepoProfile['packageManager']][] = [
      ['bun.lockb', 'bun'],
      ['pnpm-lock.yaml', 'pnpm'],
      ['yarn.lock', 'yarn'],
      ['package-lock.json', 'npm'],
    ];

    for (const [lockfile, manager] of checks) {
      try {
        await access(join(rootPath, lockfile));
        return manager;
      } catch { /* not found */ }
    }

    return 'unknown';
  }

  private async calculateMaxDepth(rootPath: string): Promise<number> {
    const { readdir } = await import('node:fs/promises');
    let maxDepth = 0;

    const walk = async (dir: string, depth: number): Promise<void> => {
      if (depth > 10) return;
      maxDepth = Math.max(maxDepth, depth);

      const ignoredDirs = new Set([
        'node_modules', '.git', 'dist', 'build', 'vendor',
        '__pycache__', '.next', 'coverage', 'target',
      ]);

      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (entry.isDirectory() && !ignoredDirs.has(entry.name) && !entry.name.startsWith('.')) {
          await walk(join(dir, entry.name), depth + 1);
        }
      }
    };

    await walk(rootPath, 0);
    return maxDepth;
  }

  private async detectEntryPoints(rootPath: string): Promise<string[]> {
    const candidates = [
      'src/index.ts', 'src/index.js', 'src/main.ts', 'src/main.js',
      'src/app.ts', 'src/app.js', 'index.ts', 'index.js',
      'main.ts', 'main.js', 'app.ts', 'app.js',
      'src/cli.ts', 'src/cli.js', 'src/server.ts', 'src/server.js',
      'manage.py', 'app.py', 'main.py',
      'artisan', 'config/routes.rb',
    ];

    const found: string[] = [];
    for (const candidate of candidates) {
      try {
        await access(join(rootPath, candidate));
        found.push(candidate);
      } catch { /* not found */ }
    }
    return found;
  }
}
