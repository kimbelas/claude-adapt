/**
 * CLAUDE.md generator.
 *
 * Produces a comprehensive CLAUDE.md file from detection results,
 * scoring signals, and architectural pattern analysis. This is the
 * "intelligence core" of the generated .claude/ directory — it tells
 * Claude Code everything it needs to know about the project.
 */

import type { GeneratorContext, Generator } from './types.js';
import type { ScoreResult } from '../types.js';
import { renderTemplate } from './template-engine.js';
import { detectPatterns, type DetectedPattern } from './pattern-detector.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a human-readable project name from package manifests or
 * fall back to the directory name.
 */
function resolveProjectName(ctx: GeneratorContext): string {
  // Try package.json
  const packageJson = ctx.fileIndex.read('package.json');
  if (packageJson) {
    try {
      const parsed = JSON.parse(packageJson) as { name?: string };
      if (parsed.name) return parsed.name;
    } catch { /* malformed json */ }
  }

  // Try composer.json (PHP/Laravel)
  const composerJson = ctx.fileIndex.read('composer.json');
  if (composerJson) {
    try {
      const parsed = JSON.parse(composerJson) as { name?: string };
      if (parsed.name) return parsed.name;
    } catch { /* malformed json */ }
  }

  // Try pyproject.toml name line
  const pyproject = ctx.fileIndex.read('pyproject.toml');
  if (pyproject) {
    const match = pyproject.match(/^name\s*=\s*"([^"]+)"/m);
    if (match?.[1]) return match[1];
  }

  // Fall back to directory basename
  const parts = ctx.rootPath.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] ?? 'project';
}

/**
 * Extract the first meaningful paragraph from a README file.
 */
function extractOverview(ctx: GeneratorContext): string {
  const readmePaths = ['README.md', 'readme.md', 'README.rst', 'README.txt', 'README'];
  for (const p of readmePaths) {
    const content = ctx.fileIndex.read(p);
    if (!content) continue;

    const lines = content.split('\n');
    let paragraph = '';
    let inParagraph = false;

    for (const line of lines) {
      const trimmed = line.trim();
      // Skip headings, badges, empty lines, and HTML
      if (trimmed.startsWith('#') || trimmed.startsWith('![') || trimmed.startsWith('<') || trimmed.startsWith('---')) {
        if (inParagraph && paragraph) break;
        continue;
      }
      if (!trimmed) {
        if (inParagraph && paragraph) break;
        continue;
      }
      inParagraph = true;
      paragraph += (paragraph ? ' ' : '') + trimmed;
    }

    if (paragraph) return paragraph;
  }

  return 'No README found. Add a project description here.';
}

/**
 * Build a markdown file-structure tree of key directories.
 */
function buildFileStructure(ctx: GeneratorContext): string {
  const allEntries = ctx.fileIndex.getAllEntries();
  const dirs = new Set<string>();

  for (const entry of allEntries) {
    const parts = entry.relativePath.replace(/\\/g, '/').split('/');
    // Collect top-level and second-level directories
    if (parts.length >= 2) {
      dirs.add(parts[0]);
      dirs.add(`${parts[0]}/${parts[1]}`);
    } else if (parts.length === 1) {
      // root-level files — skip for tree, they are not directories
    }
  }

  if (dirs.size === 0) return 'No directory structure detected.';

  // Build a tree from top-level dirs
  const topLevel = new Map<string, string[]>();
  for (const d of dirs) {
    const parts = d.split('/');
    if (parts.length === 1) {
      if (!topLevel.has(parts[0])) topLevel.set(parts[0], []);
    } else {
      const parent = parts[0];
      if (!topLevel.has(parent)) topLevel.set(parent, []);
      topLevel.get(parent)!.push(parts[1]);
    }
  }

  const lines: string[] = [];
  const sortedDirs = [...topLevel.entries()].sort(([a], [b]) => a.localeCompare(b));

  for (const [dir, children] of sortedDirs) {
    // Skip hidden and build artifact dirs
    if (dir.startsWith('.') || ['node_modules', 'dist', 'build', 'coverage', 'vendor', '__pycache__', 'target'].includes(dir)) {
      continue;
    }
    lines.push(`${dir}/`);
    const sortedChildren = children.sort();
    for (let i = 0; i < sortedChildren.length && i < 10; i++) {
      const prefix = i === sortedChildren.length - 1 || i === 9 ? '  ' : '  ';
      lines.push(`${prefix}${sortedChildren[i]}/`);
    }
    if (sortedChildren.length > 10) {
      lines.push(`  ... (${sortedChildren.length - 10} more)`);
    }
  }

  return lines.length > 0 ? lines.join('\n') : 'Flat project structure.';
}

/**
 * Build the tech stack section from detection results.
 */
function buildTechStack(ctx: GeneratorContext): string {
  const parts: string[] = [];

  if (ctx.repoProfile.languages.length > 0) {
    const langs = ctx.repoProfile.languages
      .slice(0, 5)
      .map((l) => `${l.name} (${l.percentage.toFixed(0)}%)`)
      .join(', ');
    parts.push(`- **Languages:** ${langs}`);
  }

  if (ctx.repoProfile.frameworks.length > 0) {
    const fws = ctx.repoProfile.frameworks
      .map((f) => (f.version ? `${f.name} ${f.version}` : f.name))
      .join(', ');
    parts.push(`- **Frameworks:** ${fws}`);
  }

  if (ctx.repoProfile.packageManager !== 'unknown') {
    parts.push(`- **Package Manager:** ${ctx.repoProfile.packageManager}`);
  }

  const { tooling } = ctx.repoProfile;
  if (tooling.bundlers.length > 0) {
    parts.push(`- **Bundler:** ${tooling.bundlers.join(', ')}`);
  }

  return parts.length > 0 ? parts.join('\n') : 'No tech stack detected.';
}

/**
 * Build the code conventions section from detected linter/formatter configs.
 */
function buildConventions(ctx: GeneratorContext): string {
  const parts: string[] = [];
  const { tooling } = ctx.repoProfile;

  if (tooling.formatters.length > 0) {
    parts.push(`- **Formatter:** ${tooling.formatters.join(', ')}`);
  }

  if (tooling.linters.length > 0) {
    parts.push(`- **Linter:** ${tooling.linters.join(', ')}`);
  }

  // Detect TypeScript strict mode
  const tsconfig = ctx.fileIndex.read('tsconfig.json');
  if (tsconfig) {
    try {
      const parsed = JSON.parse(tsconfig) as { compilerOptions?: { strict?: boolean } };
      if (parsed.compilerOptions?.strict) {
        parts.push('- **TypeScript:** strict mode enabled');
      }
    } catch { /* malformed json */ }
  }

  // Detect .editorconfig
  if (ctx.fileIndex.exists('.editorconfig')) {
    parts.push('- **EditorConfig:** present (ensures consistent editor settings)');
  }

  return parts.length > 0 ? parts.join('\n') : 'No specific conventions detected.';
}

/**
 * Build the testing section from detected test runner/scripts.
 */
function buildTesting(ctx: GeneratorContext): string {
  const parts: string[] = [];
  const { tooling } = ctx.repoProfile;

  if (tooling.testRunners.length > 0) {
    parts.push(`- **Runner:** ${tooling.testRunners.join(', ')}`);
  }

  // Detect test command from package.json
  const packageJson = ctx.fileIndex.read('package.json');
  if (packageJson) {
    try {
      const parsed = JSON.parse(packageJson) as { scripts?: Record<string, string> };
      if (parsed.scripts?.test) {
        parts.push(`- **Command:** \`${parsed.scripts.test}\``);
      }
      if (parsed.scripts?.['test:coverage']) {
        parts.push(`- **Coverage:** \`${parsed.scripts['test:coverage']}\``);
      }
    } catch { /* malformed json */ }
  }

  // Detect test file naming convention
  const testFiles = ctx.fileIndex.getTestFiles();
  if (testFiles.length > 0) {
    const sample = testFiles[0].relativePath;
    if (sample.includes('.test.')) {
      parts.push('- **Convention:** `*.test.{ts,js}` files');
    } else if (sample.includes('.spec.')) {
      parts.push('- **Convention:** `*.spec.{ts,js}` files');
    } else if (sample.includes('__tests__')) {
      parts.push('- **Convention:** `__tests__/` directories');
    }
  }

  return parts.length > 0 ? parts.join('\n') : 'No test configuration detected.';
}

/**
 * Build the build & deploy section from detected CI/scripts.
 */
function buildBuildDeploy(ctx: GeneratorContext): string {
  const parts: string[] = [];

  // From package.json scripts
  const packageJson = ctx.fileIndex.read('package.json');
  if (packageJson) {
    try {
      const parsed = JSON.parse(packageJson) as { scripts?: Record<string, string> };
      const scripts = parsed.scripts ?? {};
      if (scripts.build) parts.push(`- **Build:** \`${scripts.build}\``);
      if (scripts.dev) parts.push(`- **Dev:** \`${scripts.dev}\``);
      if (scripts.start) parts.push(`- **Start:** \`${scripts.start}\``);
    } catch { /* malformed json */ }
  }

  // CI detection
  const { tooling } = ctx.repoProfile;
  if (tooling.ci.length > 0) {
    parts.push(`- **CI:** ${tooling.ci.join(', ')}`);
  }

  // Dockerfile
  if (ctx.fileIndex.exists('Dockerfile') || ctx.fileIndex.exists('docker-compose.yml') || ctx.fileIndex.exists('docker-compose.yaml')) {
    parts.push('- **Docker:** Containerized deployment detected');
  }

  return parts.length > 0 ? parts.join('\n') : 'No build/deploy configuration detected.';
}

/**
 * Build the common tasks section from package.json scripts.
 */
function buildCommonTasks(ctx: GeneratorContext): string {
  const packageJson = ctx.fileIndex.read('package.json');
  if (!packageJson) return 'No scripts detected.';

  try {
    const parsed = JSON.parse(packageJson) as { scripts?: Record<string, string> };
    const scripts = parsed.scripts ?? {};
    const entries = Object.entries(scripts);

    if (entries.length === 0) return 'No scripts detected.';

    const lines: string[] = [];
    for (const [name, cmd] of entries) {
      // Skip lifecycle hooks
      if (name.startsWith('pre') || name.startsWith('post')) continue;
      lines.push(`- \`npm run ${name}\` — ${cmd}`);
    }
    return lines.length > 0 ? lines.join('\n') : 'No scripts detected.';
  } catch {
    return 'No scripts detected.';
  }
}

/**
 * Generate gotchas from scoring signals.
 */
function buildGotchas(scoreResult: ScoreResult | null): string {
  if (!scoreResult) return 'Run `claude-adapt score` for detailed analysis.';

  const gotchas: string[] = [];

  for (const signal of scoreResult.signals) {
    // Large files
    if (signal.id.includes('file.size') && signal.score < 0.5 && signal.evidence.length > 0) {
      const files = signal.evidence.slice(0, 3).map((e) => e.file).join(', ');
      gotchas.push(
        `- **Large files:** ${files} — these may exceed context limits. Consider breaking them up.`,
      );
    }

    // Circular dependencies
    if (signal.id.includes('circular') && signal.score < 0.5 && signal.evidence.length > 0) {
      const files = signal.evidence.slice(0, 3).map((e) => e.file).join(', ');
      gotchas.push(
        `- **Circular dependencies:** Editing these files may cause unexpected side effects: ${files}`,
      );
    }

    // High any usage
    if (signal.id.includes('any') && signal.score < 0.5) {
      gotchas.push(
        '- **High `any` usage:** Claude may introduce type-unsafe code. Review type assertions carefully.',
      );
    }

    // Missing tests
    if (signal.id.includes('test') && signal.id.includes('coverage') && signal.score < 0.3) {
      gotchas.push(
        '- **Low test coverage:** Be careful when refactoring — insufficient tests may hide regressions.',
      );
    }

    // Missing documentation
    if (signal.id.includes('readme') && signal.score < 0.3) {
      gotchas.push(
        '- **Sparse documentation:** README is minimal or missing. Update it when making significant changes.',
      );
    }
  }

  return gotchas.length > 0 ? gotchas.join('\n') : 'No significant gotchas detected.';
}

/**
 * Format detected patterns into a markdown section.
 */
function buildPatterns(patterns: DetectedPattern[]): string {
  if (patterns.length === 0) return 'No specific architectural patterns detected.';

  const sections: string[] = [];
  for (const pattern of patterns) {
    const files = pattern.files.length > 0
      ? `\n  - Files: ${pattern.files.slice(0, 3).join(', ')}`
      : '';
    sections.push(`- **${pattern.name}:** ${pattern.description}${files}`);
  }
  return sections.join('\n');
}

// ---------------------------------------------------------------------------
// Main template
// ---------------------------------------------------------------------------

const CLAUDE_MD_TEMPLATE = `# Project: {{projectName}}

## Overview
{{overview}}

## Architecture
{{architecture}}

## Tech Stack
{{techStack}}

## Code Conventions
{{conventions}}

## File Structure
\`\`\`
{{fileStructure}}
\`\`\`

## Key Patterns
{{patterns}}

## Testing
{{testing}}

## Build & Deploy
{{buildDeploy}}

## Common Tasks
{{commonTasks}}

## Gotchas
{{gotchas}}
`;

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export const claudeMdGenerator: Generator<string> = {
  name: 'claude-md',

  async generate(ctx: GeneratorContext): Promise<string> {
    const patterns = detectPatterns(ctx.fileIndex);

    // Build architecture description
    const archParts: string[] = [];
    if (ctx.repoProfile.structure.monorepo) {
      archParts.push('This is a **monorepo** project.');
    }
    if (ctx.repoProfile.structure.entryPoints.length > 0) {
      archParts.push(`Entry points: ${ctx.repoProfile.structure.entryPoints.join(', ')}`);
    }
    archParts.push(`Max directory depth: ${ctx.repoProfile.structure.depth}`);

    const data = {
      projectName: resolveProjectName(ctx),
      overview: extractOverview(ctx),
      architecture: archParts.join('\n'),
      techStack: buildTechStack(ctx),
      conventions: buildConventions(ctx),
      fileStructure: buildFileStructure(ctx),
      patterns: buildPatterns(patterns),
      testing: buildTesting(ctx),
      buildDeploy: buildBuildDeploy(ctx),
      commonTasks: buildCommonTasks(ctx),
      gotchas: buildGotchas(ctx.scoreResult),
    };

    return renderTemplate(CLAUDE_MD_TEMPLATE, data).trim() + '\n';
  },
};
