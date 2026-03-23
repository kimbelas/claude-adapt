import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access } from 'node:fs/promises';
import { join } from 'node:path';

const exec = promisify(execFile);

export interface CommitInfo {
  hash: string;
  message: string;
  timestamp: string;
  filesChanged: number;
}

export class GitContext {
  private isGitRepoCache: boolean | null = null;

  constructor(private readonly rootPath: string) {}

  async isGitRepo(): Promise<boolean> {
    if (this.isGitRepoCache !== null) return this.isGitRepoCache;
    try {
      await access(join(this.rootPath, '.git'));
      this.isGitRepoCache = true;
    } catch {
      this.isGitRepoCache = false;
    }
    return this.isGitRepoCache;
  }

  async getHead(): Promise<string> {
    if (!(await this.isGitRepo())) return '';
    try {
      const { stdout } = await exec('git', ['rev-parse', 'HEAD'], { cwd: this.rootPath });
      return stdout.trim();
    } catch {
      return '';
    }
  }

  async getBranch(): Promise<string> {
    if (!(await this.isGitRepo())) return '';
    try {
      const { stdout } = await exec('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: this.rootPath });
      return stdout.trim();
    } catch {
      return '';
    }
  }

  async getLog(limit = 50): Promise<CommitInfo[]> {
    if (!(await this.isGitRepo())) return [];
    try {
      const { stdout } = await exec('git', [
        'log',
        `--max-count=${limit}`,
        '--format=%H|%s|%aI|%cd',
        '--date=iso',
      ], { cwd: this.rootPath });

      return stdout
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(line => {
          const [hash, message, timestamp] = line.split('|');
          return {
            hash: hash ?? '',
            message: message ?? '',
            timestamp: timestamp ?? '',
            filesChanged: 0,
          };
        });
    } catch {
      return [];
    }
  }

  async getCommitSizes(limit = 50): Promise<{ hash: string; filesChanged: number }[]> {
    if (!(await this.isGitRepo())) return [];
    try {
      const { stdout } = await exec('git', [
        'log',
        `--max-count=${limit}`,
        '--format=%H',
        '--shortstat',
      ], { cwd: this.rootPath });

      const results: { hash: string; filesChanged: number }[] = [];
      const lines = stdout.trim().split('\n').filter(Boolean);

      let currentHash = '';
      for (const line of lines) {
        if (/^[a-f0-9]{40}$/.test(line.trim())) {
          currentHash = line.trim();
        } else if (currentHash && line.includes('file')) {
          const match = line.match(/(\d+)\s+files?\s+changed/);
          results.push({
            hash: currentHash,
            filesChanged: match ? parseInt(match[1], 10) : 0,
          });
          currentHash = '';
        }
      }
      return results;
    } catch {
      return [];
    }
  }

  async getBinaryFiles(): Promise<string[]> {
    if (!(await this.isGitRepo())) return [];
    try {
      const { stdout } = await exec('git', [
        'ls-files',
        '--others',
        '--cached',
      ], { cwd: this.rootPath });

      const binaryExts = new Set([
        '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg',
        '.mp3', '.mp4', '.avi', '.mov', '.wav',
        '.zip', '.tar', '.gz', '.rar', '.7z',
        '.pdf', '.doc', '.docx', '.xls', '.xlsx',
        '.exe', '.dll', '.so', '.dylib',
        '.woff', '.woff2', '.ttf', '.eot',
        '.sqlite', '.db',
      ]);

      return stdout
        .trim()
        .split('\n')
        .filter(f => {
          const ext = f.substring(f.lastIndexOf('.')).toLowerCase();
          return binaryExts.has(ext);
        });
    } catch {
      return [];
    }
  }

  async getFileLastModified(filePath: string): Promise<string> {
    if (!(await this.isGitRepo())) return '';
    try {
      const { stdout } = await exec('git', [
        'log', '-1', '--format=%aI', '--', filePath,
      ], { cwd: this.rootPath });
      return stdout.trim();
    } catch {
      return '';
    }
  }
}
