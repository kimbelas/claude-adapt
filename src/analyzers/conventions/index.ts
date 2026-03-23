import { basename } from 'node:path';

import { BaseAnalyzer, type SignalDefinition } from '../_base.js';
import { AnalyzerCategory, type Signal, type Evidence } from '../../types.js';
import type { ScanContext } from '../../core/context/scan-context.js';

export class ConventionsAnalyzer extends BaseAnalyzer {
  readonly category = AnalyzerCategory.conventions;

  readonly signals: SignalDefinition[] = [
    {
      id: 'conv.naming.consistency',
      name: 'File Naming Consistency',
      unit: 'entropy',
      threshold: { poor: 0.5, fair: 0.35, good: 0.2 },
      inverted: true,
      claudeImpact:
        'Consistent file naming lets Claude predict where code lives and name ' +
        'new files correctly without explicit instructions.',
    },
    {
      id: 'conv.linter.exists',
      name: 'Linter Configured',
      unit: 'boolean',
      threshold: { poor: 0, fair: 0.5, good: 1 },
      claudeImpact:
        'A linter catches style and correctness issues in Claude-generated code ' +
        'before it reaches review, acting as an automated quality gate.',
    },
    {
      id: 'conv.linter.strictness',
      name: 'Linter Strictness',
      unit: 'rules',
      threshold: { poor: 10, fair: 20, good: 30 },
      claudeImpact:
        'Stricter lint rules give Claude more constraints to follow, resulting in ' +
        'code that matches existing patterns more closely.',
    },
    {
      id: 'conv.formatter.exists',
      name: 'Formatter Configured',
      unit: 'boolean',
      threshold: { poor: 0, fair: 0.5, good: 1 },
      claudeImpact:
        'A formatter ensures Claude\'s output matches the project\'s style exactly, ' +
        'eliminating whitespace and formatting noise in diffs.',
    },
    {
      id: 'conv.structure.pattern',
      name: 'Project Structure Pattern',
      unit: 'score',
      threshold: { poor: 0, fair: 0.5, good: 1 },
      claudeImpact:
        'A recognizable folder structure helps Claude know where to place new files ' +
        'and how to organize imports.',
    },
    {
      id: 'conv.imports.ordering',
      name: 'Import Ordering Consistency',
      unit: 'ratio',
      threshold: { poor: 0, fair: 0.5, good: 1 },
      claudeImpact:
        'Consistent import ordering helps Claude generate imports that match existing ' +
        'patterns without manual cleanup.',
    },
    {
      id: 'conv.editorconfig',
      name: 'EditorConfig Exists',
      unit: 'boolean',
      threshold: { poor: 0, fair: 0.5, good: 1 },
      claudeImpact:
        'An .editorconfig ensures consistent indentation and line endings across editors, ' +
        'including Claude\'s output, reducing formatting conflicts.',
    },
  ];

  protected async evaluateSignal(
    signal: SignalDefinition,
    context: ScanContext,
  ): Promise<Signal> {
    switch (signal.id) {
      case 'conv.naming.consistency':
        return this.evaluateNamingConsistency(signal, context);
      case 'conv.linter.exists':
        return this.evaluateLinterExists(signal, context);
      case 'conv.linter.strictness':
        return this.evaluateLinterStrictness(signal, context);
      case 'conv.formatter.exists':
        return this.evaluateFormatterExists(signal, context);
      case 'conv.structure.pattern':
        return this.evaluateStructurePattern(signal, context);
      case 'conv.imports.ordering':
        return this.evaluateImportsOrdering(signal, context);
      case 'conv.editorconfig':
        return this.evaluateEditorconfig(signal, context);
      default:
        return this.createSignal(signal, 0, 0);
    }
  }

  private evaluateNamingConsistency(
    signal: SignalDefinition,
    context: ScanContext,
  ): Signal {
    const evidence: Evidence[] = [];
    const sourceFiles = context.fileIndex.getSourceFiles();

    if (sourceFiles.length === 0) {
      evidence.push({ file: '', snippet: 'No source files found' });
      return this.createSignal(signal, 0, 0.8, evidence);
    }

    const counts: Record<string, number> = {
      camelCase: 0,
      snake_case: 0,
      'kebab-case': 0,
      PascalCase: 0,
      other: 0,
    };

    for (const file of sourceFiles) {
      const name = basename(file.relativePath).replace(/\.[^.]+$/, '');
      // Remove test/spec suffixes for cleaner classification
      const cleanName = name
        .replace(/\.(test|spec|e2e|stories)$/, '')
        .replace(/_(test|spec)$/, '');

      if (!cleanName || cleanName === 'index') continue;

      const style = this.classifyNamingStyle(cleanName);
      counts[style]++;
    }

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total === 0) {
      evidence.push({ file: '', snippet: 'Not enough files to classify naming style' });
      return this.createSignal(signal, 0, 0.8, evidence);
    }

    // Compute Shannon entropy of the distribution
    let entropy = 0;
    for (const count of Object.values(counts)) {
      if (count === 0) continue;
      const p = count / total;
      entropy -= p * Math.log2(p);
    }

    // Normalize entropy to 0-1 range (max entropy for 5 categories is log2(5) ~ 2.32)
    const normalizedEntropy = entropy / Math.log2(Object.keys(counts).length);

    const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    evidence.push({
      file: '',
      snippet: `Naming distribution: ${dominant
        .filter(([, c]) => c > 0)
        .map(([style, c]) => `${style}: ${c}`)
        .join(', ')} (entropy: ${normalizedEntropy.toFixed(2)})`,
    });

    if (normalizedEntropy > 0.4) {
      evidence.push({
        file: '',
        suggestion: `Inconsistent file naming detected. Dominant style is ${dominant[0][0]}. ` +
          'Standardize on one convention for better Claude predictions.',
      });
    }

    return this.createSignal(signal, normalizedEntropy, 0.8, evidence);
  }

  private classifyNamingStyle(name: string): string {
    // kebab-case: contains hyphens, all lowercase segments
    if (/^[a-z][a-z0-9]*(-[a-z0-9]+)+$/.test(name)) return 'kebab-case';
    // snake_case: contains underscores, all lowercase segments
    if (/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(name)) return 'snake_case';
    // PascalCase: starts with uppercase, no separators
    if (/^[A-Z][a-zA-Z0-9]*$/.test(name) && /[a-z]/.test(name)) return 'PascalCase';
    // camelCase: starts with lowercase, has uppercase letters, no separators
    if (/^[a-z][a-zA-Z0-9]*$/.test(name) && /[A-Z]/.test(name)) return 'camelCase';
    // Single lowercase word could be camelCase or kebab-case; classify as camelCase
    if (/^[a-z][a-z0-9]*$/.test(name)) return 'camelCase';

    return 'other';
  }

  private evaluateLinterExists(
    signal: SignalDefinition,
    context: ScanContext,
  ): Signal {
    const evidence: Evidence[] = [];
    const linters = context.profile.tooling.linters;

    if (linters.length > 0) {
      for (const linter of linters) {
        evidence.push({
          file: '',
          snippet: `Linter detected: ${linter}`,
        });
      }
      return this.createSignal(signal, 1, 1.0, evidence);
    }

    evidence.push({
      file: '',
      suggestion: 'Configure a linter (e.g., ESLint, Pylint, RuboCop) to enforce ' +
        'code style and catch common errors automatically.',
    });
    return this.createSignal(signal, 0, 1.0, evidence);
  }

  private evaluateLinterStrictness(
    signal: SignalDefinition,
    context: ScanContext,
  ): Signal {
    const evidence: Evidence[] = [];
    const linters = context.profile.tooling.linters;

    if (linters.length === 0) {
      evidence.push({ file: '', snippet: 'No linter configured' });
      return this.createSignal(signal, 0, 0.7, evidence);
    }

    // Check ESLint configs
    const eslintConfigs = [
      '.eslintrc.json',
      '.eslintrc.js',
      '.eslintrc.cjs',
      '.eslintrc.yml',
      '.eslintrc.yaml',
      '.eslintrc',
      'eslint.config.js',
      'eslint.config.mjs',
      'eslint.config.cjs',
      'eslint.config.ts',
    ];

    for (const configPath of eslintConfigs) {
      const content = context.fileIndex.read(configPath);
      if (!content) continue;

      evidence.push({ file: configPath, snippet: 'ESLint configuration found' });

      // Try to estimate rule count
      let ruleCount = 0;

      // JSON format: count keys under "rules"
      if (configPath.endsWith('.json') || configPath === '.eslintrc') {
        try {
          const config = JSON.parse(content) as Record<string, unknown>;
          const rules = config.rules as Record<string, unknown> | undefined;
          if (rules) {
            ruleCount = Object.keys(rules).length;
          }
          // Check for extends (each extend adds ~20-50 rules)
          const ext = config.extends;
          if (ext) {
            const extCount = Array.isArray(ext) ? ext.length : 1;
            ruleCount += extCount * 25; // Estimate 25 rules per extended config
          }
        } catch {
          // Not valid JSON
        }
      } else {
        // JS/TS config: count rule-like patterns
        const ruleMatches = content.match(/['"][a-z@][\w/-]+['"]\s*:/g);
        if (ruleMatches) {
          ruleCount = ruleMatches.length;
        }
        // Check for extends
        const extendsMatches = content.match(/extends\s*[:[]/g);
        if (extendsMatches) {
          // Count extended configs
          const extendedConfigs = content.match(/['"][\w@/.-]+['"]/g);
          if (extendedConfigs) {
            ruleCount += Math.min(extendedConfigs.length, 5) * 25;
          }
        }
      }

      evidence.push({
        file: configPath,
        snippet: `Estimated ~${ruleCount} active rules (including extended configs)`,
      });

      return this.createSignal(signal, ruleCount, 0.7, evidence);
    }

    // Fallback for other linters: estimate moderate strictness
    evidence.push({
      file: '',
      snippet: `Linter "${linters[0]}" detected but strictness could not be estimated precisely`,
    });
    return this.createSignal(signal, 15, 0.5, evidence);
  }

  private evaluateFormatterExists(
    signal: SignalDefinition,
    context: ScanContext,
  ): Signal {
    const evidence: Evidence[] = [];
    const formatters = context.profile.tooling.formatters;

    if (formatters.length > 0) {
      for (const formatter of formatters) {
        evidence.push({
          file: '',
          snippet: `Formatter detected: ${formatter}`,
        });
      }
      return this.createSignal(signal, 1, 1.0, evidence);
    }

    evidence.push({
      file: '',
      suggestion: 'Configure a code formatter (e.g., Prettier, Black, gofmt) to ensure ' +
        'consistent code style across all contributors, including Claude.',
    });
    return this.createSignal(signal, 0, 1.0, evidence);
  }

  private evaluateStructurePattern(
    signal: SignalDefinition,
    context: ScanContext,
  ): Signal {
    const evidence: Evidence[] = [];

    // Check for common directory structure patterns
    const structureDirs = [
      { dir: 'src', label: 'source directory' },
      { dir: 'lib', label: 'library directory' },
      { dir: 'tests', label: 'tests directory' },
      { dir: 'test', label: 'test directory' },
      { dir: '__tests__', label: 'tests directory' },
      { dir: 'docs', label: 'docs directory' },
      { dir: 'scripts', label: 'scripts directory' },
      { dir: 'config', label: 'config directory' },
    ];

    let foundCount = 0;
    const foundDirs: string[] = [];

    for (const { dir, label } of structureDirs) {
      // Check if any files exist under this directory
      const matches = context.fileIndex.glob(`${dir}/**`);
      if (matches.length > 0) {
        foundCount++;
        foundDirs.push(dir);
        evidence.push({
          file: dir,
          snippet: `${label} found (${matches.length} files)`,
        });
      }
    }

    // Scoring: 0 dirs = 0, 1-2 = 0.5, 3+ = 1.0
    let value: number;
    if (foundCount === 0) {
      value = 0;
      evidence.push({
        file: '',
        suggestion: 'Organize code into standard directories (src/, tests/, docs/) ' +
          'to help Claude navigate the project.',
      });
    } else if (foundCount <= 2) {
      value = 0.5;
    } else {
      value = 1.0;
    }

    return this.createSignal(signal, value, 0.75, evidence);
  }

  private evaluateImportsOrdering(
    signal: SignalDefinition,
    context: ScanContext,
  ): Signal {
    const evidence: Evidence[] = [];
    const sourceFiles = context.fileIndex.getSourceFiles();

    if (sourceFiles.length === 0) {
      evidence.push({ file: '', snippet: 'No source files found' });
      return this.createSignal(signal, 0, 0.6, evidence);
    }

    // Only check JS/TS files where import ordering conventions are well-defined
    const jstsFiles = sourceFiles.filter(f =>
      ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(f.extension),
    );

    if (jstsFiles.length === 0) {
      evidence.push({ file: '', snippet: 'No JS/TS files found to check import ordering' });
      return this.createSignal(signal, 0.5, 0.4, evidence);
    }

    const sampled = jstsFiles.slice(0, 30);
    let consistentFiles = 0;
    let filesWithImports = 0;

    for (const file of sampled) {
      const content = context.fileIndex.read(file.relativePath);
      if (!content) continue;

      const lines = content.split('\n');
      const importLines: string[] = [];
      let pastImports = false;

      for (const line of lines) {
        const trimmed = line.trim();
        if (pastImports) break;

        if (trimmed.startsWith('import ') || trimmed.startsWith('import{')) {
          importLines.push(trimmed);
        } else if (
          importLines.length > 0 &&
          trimmed !== '' &&
          !trimmed.startsWith('//') &&
          !trimmed.startsWith('/*') &&
          !trimmed.startsWith('*') &&
          !trimmed.startsWith("'use ") &&
          !trimmed.startsWith('"use ')
        ) {
          pastImports = true;
        }
      }

      if (importLines.length < 2) continue;
      filesWithImports++;

      // Check if imports are grouped with blank-line separators
      // Look at the original lines to detect blank lines between import blocks
      const importRegion: string[] = [];
      let inImports = false;
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('import ') || trimmed.startsWith('import{')) {
          inImports = true;
          importRegion.push(line);
        } else if (inImports) {
          if (trimmed === '') {
            importRegion.push(line);
          } else if (
            !trimmed.startsWith('//') &&
            !trimmed.startsWith('/*') &&
            !trimmed.startsWith('*') &&
            !trimmed.startsWith("} from")
          ) {
            break;
          } else {
            importRegion.push(line);
          }
        }
      }

      // Check for blank line separators between groups (indicates intentional grouping)
      const hasBlankLineSeparators = importRegion.some(l => l.trim() === '');
      if (hasBlankLineSeparators) {
        consistentFiles++;
      }
    }

    const ratio = filesWithImports > 0 ? consistentFiles / filesWithImports : 0;

    evidence.push({
      file: '',
      snippet: `${consistentFiles}/${filesWithImports} files with grouped imports ` +
        `(sampled ${sampled.length} files)`,
    });

    if (ratio < 0.5 && filesWithImports > 0) {
      evidence.push({
        file: '',
        suggestion: 'Group imports by category (builtins, externals, internals) ' +
          'separated by blank lines for consistent ordering.',
      });
    }

    return this.createSignal(signal, ratio, 0.6, evidence);
  }

  private evaluateEditorconfig(
    signal: SignalDefinition,
    context: ScanContext,
  ): Signal {
    const evidence: Evidence[] = [];

    if (context.fileIndex.exists('.editorconfig')) {
      evidence.push({
        file: '.editorconfig',
        snippet: '.editorconfig found',
      });
      return this.createSignal(signal, 1, 1.0, evidence);
    }

    evidence.push({
      file: '',
      suggestion: 'Add an .editorconfig to enforce consistent indentation, line endings, ' +
        'and charset across all editors and tools.',
    });
    return this.createSignal(signal, 0, 1.0, evidence);
  }
}
