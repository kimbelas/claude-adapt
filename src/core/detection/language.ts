import { readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';

export interface LanguageInfo {
  name: string;
  percentage: number;
  fileCount: number;
}

const EXTENSION_MAP: Record<string, string> = {
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript',
  '.mjs': 'JavaScript',
  '.cjs': 'JavaScript',
  '.py': 'Python',
  '.pyw': 'Python',
  '.rb': 'Ruby',
  '.php': 'PHP',
  '.java': 'Java',
  '.kt': 'Kotlin',
  '.kts': 'Kotlin',
  '.go': 'Go',
  '.rs': 'Rust',
  '.cs': 'C#',
  '.cpp': 'C++',
  '.cc': 'C++',
  '.cxx': 'C++',
  '.c': 'C',
  '.h': 'C',
  '.hpp': 'C++',
  '.swift': 'Swift',
  '.dart': 'Dart',
  '.lua': 'Lua',
  '.r': 'R',
  '.R': 'R',
  '.scala': 'Scala',
  '.sh': 'Shell',
  '.bash': 'Shell',
  '.zsh': 'Shell',
  '.vue': 'Vue',
  '.svelte': 'Svelte',
  '.ex': 'Elixir',
  '.exs': 'Elixir',
  '.erl': 'Erlang',
  '.hs': 'Haskell',
  '.ml': 'OCaml',
  '.clj': 'Clojure',
};

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'vendor', '__pycache__',
  '.next', '.nuxt', 'coverage', '.cache', 'target', 'bin', 'obj',
]);

export class LanguageDetector {
  async detect(rootPath: string): Promise<LanguageInfo[]> {
    const counts = new Map<string, number>();
    await this.walkDir(rootPath, rootPath, counts);

    const total = Array.from(counts.values()).reduce((a, b) => a + b, 0);
    if (total === 0) return [];

    return Array.from(counts.entries())
      .map(([name, fileCount]) => ({
        name,
        percentage: Math.round((fileCount / total) * 100),
        fileCount,
      }))
      .sort((a, b) => b.fileCount - a.fileCount);
  }

  private async walkDir(
    dir: string,
    rootPath: string,
    counts: Map<string, number>,
  ): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.isDirectory()) continue;
      if (IGNORED_DIRS.has(entry.name) && entry.isDirectory()) continue;

      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        await this.walkDir(fullPath, rootPath, counts);
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        const language = EXTENSION_MAP[ext];
        if (language) {
          counts.set(language, (counts.get(language) ?? 0) + 1);
        }
      }
    }
  }
}
