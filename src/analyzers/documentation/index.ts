import { BaseAnalyzer, type SignalDefinition } from '../_base.js';
import { AnalyzerCategory, type Signal, type Evidence } from '../../types.js';
import type { ScanContext } from '../../core/context/scan-context.js';

const CONVENTIONAL_COMMIT_RE =
  /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+?\))?[!]?:\s/;

export class DocumentationAnalyzer extends BaseAnalyzer {
  readonly category = AnalyzerCategory.documentation;

  readonly signals: SignalDefinition[] = [
    {
      id: 'doc.readme.exists',
      name: 'README Exists',
      unit: 'boolean',
      threshold: { poor: 0, fair: 0.5, good: 1 },
      claudeImpact:
        'A README is the first file Claude reads to understand a project\'s purpose, ' +
        'setup instructions, and conventions. Without it, Claude operates blind.',
    },
    {
      id: 'doc.readme.quality',
      name: 'README Quality',
      unit: 'sections',
      threshold: { poor: 2, fair: 3.5, good: 5 },
      claudeImpact:
        'A well-structured README with multiple sections gives Claude richer context ' +
        'about architecture, usage patterns, and project conventions.',
    },
    {
      id: 'doc.readme.staleness',
      name: 'README Staleness',
      unit: 'days',
      threshold: { poor: 180, fair: 105, good: 30 },
      inverted: true,
      claudeImpact:
        'A stale README may mislead Claude with outdated instructions, deprecated APIs, ' +
        'or removed features, causing incorrect code generation.',
    },
    {
      id: 'doc.inline.density',
      name: 'Inline Comment Density',
      unit: 'ratio',
      threshold: { poor: 0.02, fair: 0.05, good: 0.08 },
      claudeImpact:
        'Inline comments explain intent and edge cases that Claude cannot infer from ' +
        'code alone, reducing hallucinated assumptions.',
    },
    {
      id: 'doc.api.coverage',
      name: 'API Documentation Coverage',
      unit: 'ratio',
      threshold: { poor: 0.1, fair: 0.3, good: 0.5 },
      claudeImpact:
        'Doc comments on exported functions tell Claude what each function does, its ' +
        'parameters, and return values, enabling correct usage in generated code.',
    },
    {
      id: 'doc.architecture',
      name: 'Architecture Documentation',
      unit: 'boolean',
      threshold: { poor: 0, fair: 0.5, good: 1 },
      claudeImpact:
        'Architecture docs (ARCHITECTURE.md, ADRs) help Claude understand high-level ' +
        'design decisions and where new code should live.',
    },
    {
      id: 'doc.changelog',
      name: 'Changelog Exists',
      unit: 'boolean',
      threshold: { poor: 0, fair: 0.5, good: 1 },
      claudeImpact:
        'A changelog helps Claude understand the project\'s evolution and avoid ' +
        'reintroducing previously removed features or patterns.',
    },
  ];

  protected async evaluateSignal(
    signal: SignalDefinition,
    context: ScanContext,
  ): Promise<Signal> {
    switch (signal.id) {
      case 'doc.readme.exists':
        return this.evaluateReadmeExists(signal, context);
      case 'doc.readme.quality':
        return this.evaluateReadmeQuality(signal, context);
      case 'doc.readme.staleness':
        return this.evaluateReadmeStaleness(signal, context);
      case 'doc.inline.density':
        return this.evaluateInlineDensity(signal, context);
      case 'doc.api.coverage':
        return this.evaluateApiCoverage(signal, context);
      case 'doc.architecture':
        return this.evaluateArchitecture(signal, context);
      case 'doc.changelog':
        return this.evaluateChangelog(signal, context);
      default:
        return this.createSignal(signal, 0, 0);
    }
  }

  private findReadmePath(context: ScanContext): string | undefined {
    const candidates = ['README.md', 'README', 'readme.md', 'Readme.md', 'README.rst', 'README.txt'];
    return candidates.find(c => context.fileIndex.exists(c));
  }

  private evaluateReadmeExists(
    signal: SignalDefinition,
    context: ScanContext,
  ): Signal {
    const evidence: Evidence[] = [];
    const readmePath = this.findReadmePath(context);

    if (readmePath) {
      evidence.push({
        file: readmePath,
        snippet: `README found: ${readmePath}`,
      });
      return this.createSignal(signal, 1, 1.0, evidence);
    }

    evidence.push({
      file: '',
      suggestion: 'Create a README.md with project description, setup instructions, ' +
        'and usage examples.',
    });
    return this.createSignal(signal, 0, 1.0, evidence);
  }

  private evaluateReadmeQuality(
    signal: SignalDefinition,
    context: ScanContext,
  ): Signal {
    const evidence: Evidence[] = [];
    const readmePath = this.findReadmePath(context);

    if (!readmePath) {
      evidence.push({
        file: '',
        snippet: 'No README found to evaluate quality',
      });
      return this.createSignal(signal, 0, 0.9, evidence);
    }

    const content = context.fileIndex.read(readmePath);
    if (!content) {
      return this.createSignal(signal, 0, 0.9, evidence);
    }

    // Count h1 and h2 headings as sections
    const headingPattern = /^#{1,2}\s+.+$/gm;
    const headings = content.match(headingPattern) ?? [];
    const sectionCount = headings.length;

    evidence.push({
      file: readmePath,
      snippet: `${sectionCount} sections (h1/h2 headings) found`,
    });

    if (sectionCount < 3) {
      evidence.push({
        file: readmePath,
        suggestion: 'Add sections for Installation, Usage, Contributing, and Architecture ' +
          'to help Claude understand your project fully.',
      });
    }

    return this.createSignal(signal, sectionCount, 0.9, evidence);
  }

  private async evaluateReadmeStaleness(
    signal: SignalDefinition,
    context: ScanContext,
  ): Promise<Signal> {
    const evidence: Evidence[] = [];
    const readmePath = this.findReadmePath(context);

    if (!readmePath) {
      evidence.push({
        file: '',
        snippet: 'No README found',
      });
      // No README means infinite staleness; use threshold.poor
      return this.createSignal(signal, signal.threshold.poor, 0.7, evidence);
    }

    // Try git last-modified first
    const lastModified = await context.git.getFileLastModified(readmePath);
    let daysSinceModified: number;

    if (lastModified) {
      const lastDate = new Date(lastModified);
      const now = new Date();
      daysSinceModified = Math.floor(
        (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      evidence.push({
        file: readmePath,
        snippet: `Last modified ${daysSinceModified} days ago (via git: ${lastModified.split('T')[0]})`,
      });
    } else {
      // Fallback: check file entry (no mtime available, assume moderately stale)
      daysSinceModified = 90;
      evidence.push({
        file: readmePath,
        snippet: 'Could not determine last modification date; assuming ~90 days',
      });
    }

    if (daysSinceModified > 120) {
      evidence.push({
        file: readmePath,
        suggestion: 'README has not been updated recently. Ensure it reflects ' +
          'current project state, especially setup instructions.',
      });
    }

    return this.createSignal(signal, daysSinceModified, 0.7, evidence);
  }

  private evaluateInlineDensity(
    signal: SignalDefinition,
    context: ScanContext,
  ): Signal {
    const evidence: Evidence[] = [];
    const sourceFiles = context.fileIndex.getSourceFiles();

    if (sourceFiles.length === 0) {
      evidence.push({
        file: '',
        snippet: 'No source files found',
      });
      return this.createSignal(signal, 0, 0.75, evidence);
    }

    // Sample up to 50 source files
    const sampled = sourceFiles.slice(0, 50);
    let totalCommentLines = 0;
    let totalCodeLines = 0;

    for (const file of sampled) {
      const content = context.fileIndex.read(file.relativePath);
      if (!content) continue;

      const lines = content.split('\n');
      let inBlockComment = false;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue; // skip blank lines

        totalCodeLines++;

        // Detect comment lines
        if (inBlockComment) {
          totalCommentLines++;
          if (trimmed.includes('*/') || trimmed.includes('"""') || trimmed.includes("'''")) {
            inBlockComment = false;
          }
          continue;
        }

        if (
          trimmed.startsWith('//') ||
          trimmed.startsWith('#') ||
          trimmed.startsWith('*') ||
          trimmed.startsWith('/*') ||
          trimmed.startsWith('"""') ||
          trimmed.startsWith("'''")
        ) {
          totalCommentLines++;

          // Start block comment tracking
          if (
            (trimmed.startsWith('/*') && !trimmed.includes('*/')) ||
            (trimmed.startsWith('"""') && trimmed.indexOf('"""', 3) === -1) ||
            (trimmed.startsWith("'''") && trimmed.indexOf("'''", 3) === -1)
          ) {
            inBlockComment = true;
          }
        }
      }
    }

    const ratio = totalCodeLines > 0 ? totalCommentLines / totalCodeLines : 0;

    evidence.push({
      file: '',
      snippet: `${totalCommentLines} comment lines / ${totalCodeLines} code lines = ${(ratio * 100).toFixed(1)}% ` +
        `(sampled ${sampled.length} files)`,
    });

    if (ratio < 0.03) {
      evidence.push({
        file: '',
        suggestion: 'Add inline comments to explain complex logic, edge cases, and ' +
          'design decisions so Claude can understand intent.',
      });
    }

    return this.createSignal(signal, ratio, 0.75, evidence);
  }

  private evaluateApiCoverage(
    signal: SignalDefinition,
    context: ScanContext,
  ): Signal {
    const evidence: Evidence[] = [];
    const sourceFiles = context.fileIndex.getSourceFiles();

    if (sourceFiles.length === 0) {
      evidence.push({
        file: '',
        snippet: 'No source files found',
      });
      return this.createSignal(signal, 0, 0.65, evidence);
    }

    // Sample source files
    const sampled = sourceFiles.slice(0, 50);
    let totalExports = 0;
    let documentedExports = 0;

    for (const file of sampled) {
      const content = context.fileIndex.read(file.relativePath);
      if (!content) continue;

      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Detect exported functions/classes in JS/TS
        const isExport =
          /^export\s+(async\s+)?function\s/.test(line) ||
          /^export\s+class\s/.test(line) ||
          /^export\s+const\s+\w+\s*=\s*(async\s+)?\(/.test(line) ||
          /^export\s+default\s+(async\s+)?function/.test(line);

        // Detect Python function definitions (def at module level)
        const isPythonDef =
          file.extension === '.py' &&
          /^def\s+[a-zA-Z_]/.test(line) &&
          !line.startsWith('def _');

        if (isExport || isPythonDef) {
          totalExports++;

          // Check preceding lines for doc comments
          let hasDocComment = false;
          if (i > 0) {
            const prevLine = lines[i - 1].trim();
            // JSDoc: previous line is */ (end of doc block)
            if (prevLine === '*/' || prevLine.endsWith('*/')) {
              hasDocComment = true;
            }
            // Python docstring: next line after def starts with """
            if (isPythonDef && i + 1 < lines.length) {
              const nextLine = lines[i + 1].trim();
              if (nextLine.startsWith('"""') || nextLine.startsWith("'''")) {
                hasDocComment = true;
              }
            }
          }

          if (hasDocComment) {
            documentedExports++;
          }
        }
      }
    }

    const ratio = totalExports > 0 ? documentedExports / totalExports : 0;

    evidence.push({
      file: '',
      snippet: `${documentedExports}/${totalExports} exported functions/classes have doc comments ` +
        `(sampled ${sampled.length} files)`,
    });

    if (ratio < 0.3 && totalExports > 0) {
      evidence.push({
        file: '',
        suggestion: 'Add JSDoc (/** ... */) or docstring comments to exported functions ' +
          'so Claude knows what each function does and how to use it.',
      });
    }

    return this.createSignal(signal, ratio, 0.65, evidence);
  }

  private evaluateArchitecture(
    signal: SignalDefinition,
    context: ScanContext,
  ): Signal {
    const evidence: Evidence[] = [];

    // Check for architecture documentation
    const archFiles = [
      'ARCHITECTURE.md',
      'architecture.md',
      'docs/architecture.md',
      'docs/ARCHITECTURE.md',
    ];

    for (const archFile of archFiles) {
      if (context.fileIndex.exists(archFile)) {
        evidence.push({
          file: archFile,
          snippet: `Architecture doc found: ${archFile}`,
        });
        return this.createSignal(signal, 1, 0.9, evidence);
      }
    }

    // Check for ADR directory
    const adrPatterns = ['docs/adr', 'docs/adrs', 'docs/architecture', 'adr'];
    for (const adrDir of adrPatterns) {
      const matches = context.fileIndex.glob(`${adrDir}/**`);
      if (matches.length > 0) {
        evidence.push({
          file: adrDir,
          snippet: `ADR directory found with ${matches.length} files`,
        });
        return this.createSignal(signal, 1, 0.9, evidence);
      }
    }

    evidence.push({
      file: '',
      suggestion: 'Create an ARCHITECTURE.md or docs/adr/ directory to document ' +
        'high-level design decisions. This helps Claude place new code correctly.',
    });
    return this.createSignal(signal, 0, 0.9, evidence);
  }

  private async evaluateChangelog(
    signal: SignalDefinition,
    context: ScanContext,
  ): Promise<Signal> {
    const evidence: Evidence[] = [];

    // Check for CHANGELOG file
    const changelogFiles = [
      'CHANGELOG.md',
      'changelog.md',
      'CHANGES.md',
      'HISTORY.md',
    ];

    for (const file of changelogFiles) {
      if (context.fileIndex.exists(file)) {
        evidence.push({
          file,
          snippet: `Changelog found: ${file}`,
        });
        return this.createSignal(signal, 1, 0.85, evidence);
      }
    }

    // Partial credit if conventional commits are used (acts as an implicit changelog)
    const commits = await context.git.getLog(20);
    if (commits.length > 0) {
      let conventionalCount = 0;
      for (const commit of commits) {
        if (CONVENTIONAL_COMMIT_RE.test(commit.message)) {
          conventionalCount++;
        }
      }
      const conventionalRatio = conventionalCount / commits.length;
      if (conventionalRatio >= 0.5) {
        evidence.push({
          file: '',
          snippet: `No CHANGELOG.md, but ${(conventionalRatio * 100).toFixed(0)}% conventional commits ` +
            'provide an implicit changelog (partial credit)',
        });
        return this.createSignal(signal, 0.5, 0.85, evidence);
      }
    }

    evidence.push({
      file: '',
      suggestion: 'Create a CHANGELOG.md to track notable changes, or adopt conventional ' +
        'commits which can auto-generate changelogs.',
    });
    return this.createSignal(signal, 0, 0.85, evidence);
  }
}
