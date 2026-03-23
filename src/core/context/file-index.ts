import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, extname } from 'node:path';
import fg from 'fast-glob';

export interface FileEntry {
  path: string;
  relativePath: string;
  size: number;
  lines: number;
  hash: string;
  extension: string;
}

export class FileIndex {
  private files = new Map<string, FileEntry>();
  private contentCache = new Map<string, string>();
  private ignorePatterns: string[] = [];

  constructor(
    private readonly rootPath: string,
  ) {}

  async build(): Promise<void> {
    this.ignorePatterns = await this.loadIgnorePatterns();

    const globPatterns = ['**/*'];
    const ignorePatterns = [
      '**/node_modules/**',
      '**/.git/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.next/**',
      '**/.nuxt/**',
      '**/vendor/**',
      '**/__pycache__/**',
      '**/target/**',
      '**/*.min.js',
      '**/*.min.css',
      '**/*.map',
      '**/*.lock',
      '**/package-lock.json',
      ...this.ignorePatterns,
    ];

    const paths = await fg(globPatterns, {
      cwd: this.rootPath,
      ignore: ignorePatterns,
      onlyFiles: true,
      dot: false,
      absolute: false,
    });

    for (const relativePath of paths) {
      const fullPath = join(this.rootPath, relativePath);
      try {
        const fileStat = await stat(fullPath);
        if (!fileStat.isFile()) continue;
        if (fileStat.size > 1_000_000) continue; // Skip files > 1MB

        const content = await readFile(fullPath, 'utf-8');
        const lines = content.split('\n').length;
        const hash = createHash('sha256').update(content).digest('hex').slice(0, 16);

        const entry: FileEntry = {
          path: fullPath,
          relativePath,
          size: fileStat.size,
          lines,
          hash,
          extension: extname(relativePath),
        };

        this.files.set(relativePath, entry);
        this.contentCache.set(relativePath, content);
      } catch {
        // Skip files that can't be read (binary, permission issues, etc.)
      }
    }
  }

  glob(pattern: string): FileEntry[] {
    const results: FileEntry[] = [];
    const regex = this.globToRegex(pattern);
    for (const [path, entry] of this.files) {
      if (regex.test(path)) {
        results.push(entry);
      }
    }
    return results;
  }

  read(relativePath: string): string | undefined {
    return this.contentCache.get(relativePath);
  }

  getEntry(relativePath: string): FileEntry | undefined {
    return this.files.get(relativePath);
  }

  exists(relativePath: string): boolean {
    return this.files.has(relativePath);
  }

  getAllEntries(): FileEntry[] {
    return Array.from(this.files.values());
  }

  getFileCount(): number {
    return this.files.size;
  }

  getSourceFiles(): FileEntry[] {
    const sourceExtensions = new Set([
      '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
      '.py', '.rb', '.php', '.java', '.kt', '.go', '.rs',
      '.cs', '.cpp', '.c', '.h', '.hpp', '.swift', '.dart',
      '.vue', '.svelte', '.ex', '.exs', '.scala', '.clj',
    ]);
    return this.getAllEntries().filter(e => sourceExtensions.has(e.extension));
  }

  getTestFiles(): FileEntry[] {
    return this.getAllEntries().filter(e => this.isTestFile(e.relativePath));
  }

  private isTestFile(path: string): boolean {
    const lower = path.toLowerCase();
    return (
      lower.includes('__tests__') ||
      lower.includes('test/') ||
      lower.includes('tests/') ||
      lower.includes('spec/') ||
      lower.includes('.test.') ||
      lower.includes('.spec.') ||
      lower.includes('_test.') ||
      lower.includes('_spec.') ||
      lower.startsWith('test_')
    );
  }

  private async loadIgnorePatterns(): Promise<string[]> {
    const patterns: string[] = [];

    // .claude-adapt-ignore
    try {
      const content = await readFile(join(this.rootPath, '.claude-adapt-ignore'), 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          patterns.push(trimmed.endsWith('/') ? `${trimmed}**` : trimmed);
        }
      }
    } catch { /* no ignore file */ }

    return patterns;
  }

  private globToRegex(pattern: string): RegExp {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '{{GLOBSTAR}}')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]')
      .replace(/{{GLOBSTAR}}/g, '.*');
    return new RegExp(`^${escaped}$`);
  }
}
