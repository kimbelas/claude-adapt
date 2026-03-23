import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';

export interface MonorepoInfo {
  detected: boolean;
  tool?: string;
  workspaces: string[];
}

export class MonorepoDetector {
  async detect(rootPath: string): Promise<MonorepoInfo> {
    // Check Nx
    if (await this.fileExists(join(rootPath, 'nx.json'))) {
      const workspaces = await this.detectNxWorkspaces(rootPath);
      return { detected: true, tool: 'Nx', workspaces };
    }

    // Check Turborepo
    if (await this.fileExists(join(rootPath, 'turbo.json'))) {
      const workspaces = await this.detectPackageWorkspaces(rootPath);
      return { detected: true, tool: 'Turborepo', workspaces };
    }

    // Check Lerna
    if (await this.fileExists(join(rootPath, 'lerna.json'))) {
      const workspaces = await this.detectLernaPackages(rootPath);
      return { detected: true, tool: 'Lerna', workspaces };
    }

    // Check npm/yarn/pnpm workspaces
    const workspaces = await this.detectPackageWorkspaces(rootPath);
    if (workspaces.length > 0) {
      return { detected: true, tool: 'workspaces', workspaces };
    }

    // Check pnpm workspaces
    if (await this.fileExists(join(rootPath, 'pnpm-workspace.yaml'))) {
      const pnpmWorkspaces = await this.detectPnpmWorkspaces(rootPath);
      return { detected: true, tool: 'pnpm', workspaces: pnpmWorkspaces };
    }

    return { detected: false, workspaces: [] };
  }

  private async detectNxWorkspaces(rootPath: string): Promise<string[]> {
    try {
      const nxJson = JSON.parse(await readFile(join(rootPath, 'nx.json'), 'utf-8'));
      if (nxJson.workspaceLayout) {
        const dirs: string[] = [];
        if (nxJson.workspaceLayout.appsDir) dirs.push(nxJson.workspaceLayout.appsDir);
        if (nxJson.workspaceLayout.libsDir) dirs.push(nxJson.workspaceLayout.libsDir);
        return dirs;
      }
    } catch { /* parse error */ }
    return await this.detectPackageWorkspaces(rootPath);
  }

  private async detectPackageWorkspaces(rootPath: string): Promise<string[]> {
    try {
      const pkgJson = JSON.parse(await readFile(join(rootPath, 'package.json'), 'utf-8'));
      if (Array.isArray(pkgJson.workspaces)) {
        return pkgJson.workspaces;
      }
      if (pkgJson.workspaces?.packages) {
        return pkgJson.workspaces.packages;
      }
    } catch { /* no package.json or parse error */ }
    return [];
  }

  private async detectLernaPackages(rootPath: string): Promise<string[]> {
    try {
      const lernaJson = JSON.parse(await readFile(join(rootPath, 'lerna.json'), 'utf-8'));
      return lernaJson.packages ?? ['packages/*'];
    } catch { /* parse error */ }
    return ['packages/*'];
  }

  private async detectPnpmWorkspaces(rootPath: string): Promise<string[]> {
    try {
      const content = await readFile(join(rootPath, 'pnpm-workspace.yaml'), 'utf-8');
      const packages: string[] = [];
      let inPackages = false;
      for (const line of content.split('\n')) {
        if (line.trim() === 'packages:') {
          inPackages = true;
          continue;
        }
        if (inPackages && line.trim().startsWith('-')) {
          packages.push(line.trim().replace(/^-\s*['"]?/, '').replace(/['"]?\s*$/, ''));
        } else if (inPackages && !line.startsWith(' ') && !line.startsWith('\t')) {
          break;
        }
      }
      return packages;
    } catch { /* parse error */ }
    return [];
  }

  private async fileExists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }
}
