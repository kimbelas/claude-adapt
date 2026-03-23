import { BaseAnalyzer, type SignalDefinition } from '../_base.js';
import { AnalyzerCategory, type Signal, type Evidence } from '../../types.js';
import type { ScanContext } from '../../core/context/scan-context.js';
import {
  buildImportGraph,
  findCircularDependencies,
  getAfferentCoupling,
} from './utils/import-graph.js';

// ---------------------------------------------------------------------------
// Function detection patterns (regex-based, NOT AST)
// ---------------------------------------------------------------------------

/** Matches JS/TS named function declarations: `function foo(...)` */
const JS_FUNCTION_DECL = /^[ \t]*(?:export\s+)?(?:async\s+)?function\s+\w+/;

/** Matches JS/TS arrow / function-expression assignments: `const foo = async (...)=>` */
const JS_ARROW_OR_EXPR =
  /^[ \t]*(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>)/;

/** Matches JS/TS class method declarations: `async foo(...) {` */
const JS_METHOD =
  /^[ \t]*(?:(?:public|private|protected|static|readonly|async|override|abstract)\s+)*\w+\s*\([^)]*\)\s*(?::\s*[^{]+)?\s*\{/;

/** Matches Python function definitions: `def foo(...)` */
const PY_FUNCTION = /^[ \t]*(?:async\s+)?def\s+\w+/;

/** Matches PHP function definitions: `function foo(...)` */
const PHP_FUNCTION = /^[ \t]*(?:public|private|protected|static)?\s*function\s+\w+/;

const SOURCE_EXTENSIONS_FOR_FUNCTIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.php',
]);

/**
 * ModularityAnalyzer measures code organization, file sizes, function lengths,
 * coupling, folder depth, and entry-point clarity.
 *
 * Signals:
 * - mod.file.size.p90:       90th percentile source file size
 * - mod.file.size.max:       Maximum source file size
 * - mod.function.length.p90: 90th percentile function length
 * - mod.coupling.circular:   Circular dependency cycle count
 * - mod.coupling.afferent:   Maximum afferent coupling per file
 * - mod.depth.max:           Maximum folder nesting depth
 * - mod.entrypoints:         Whether clear entry points exist
 */
export class ModularityAnalyzer extends BaseAnalyzer {
  readonly category = AnalyzerCategory.modularity;

  readonly signals: SignalDefinition[] = [
    {
      id: 'mod.file.size.p90',
      name: 'File Size (P90)',
      unit: 'lines',
      threshold: { poor: 500, fair: 350, good: 200 },
      claudeImpact:
        'Large files slow down Claude context loading and make it harder to locate relevant code. Smaller files let Claude focus on one concern at a time.',
      inverted: true,
    },
    {
      id: 'mod.file.size.max',
      name: 'File Size (Max)',
      unit: 'lines',
      threshold: { poor: 1000, fair: 750, good: 500 },
      claudeImpact:
        'Extremely large files may exceed context limits or force Claude to skip important sections. Splitting them improves visibility.',
      inverted: true,
    },
    {
      id: 'mod.function.length.p90',
      name: 'Function Length (P90)',
      unit: 'lines',
      threshold: { poor: 80, fair: 55, good: 30 },
      claudeImpact:
        'Long functions are hard for Claude to reason about in one pass. Shorter functions with clear names let Claude understand intent without reading entire bodies.',
      inverted: true,
    },
    {
      id: 'mod.coupling.circular',
      name: 'Circular Dependencies',
      unit: 'count',
      threshold: { poor: 5, fair: 2.5, good: 0 },
      claudeImpact:
        'Circular imports force Claude to juggle mutual dependencies, increasing the risk of generating code that creates initialization errors or import loops.',
      inverted: true,
    },
    {
      id: 'mod.coupling.afferent',
      name: 'Max Afferent Coupling',
      unit: 'count',
      threshold: { poor: 15, fair: 11.5, good: 8 },
      claudeImpact:
        'Files imported by many others are change-sensitive. Claude must understand all downstream consumers before suggesting edits to highly-coupled modules.',
      inverted: true,
    },
    {
      id: 'mod.depth.max',
      name: 'Max Folder Depth',
      unit: 'levels',
      threshold: { poor: 7, fair: 6, good: 5 },
      claudeImpact:
        'Deep folder nesting makes it harder for Claude to discover files and understand the project layout. Flatter structures speed up navigation.',
      inverted: true,
    },
    {
      id: 'mod.entrypoints',
      name: 'Clear Entry Points',
      unit: 'binary',
      threshold: { poor: 0, fair: 0.5, good: 1 },
      claudeImpact:
        'Clear entry points (index.ts, main.ts) tell Claude where execution begins. Without them, Claude must guess the application entry, risking misguided suggestions.',
    },
  ];

  protected async evaluateSignal(
    signal: SignalDefinition,
    context: ScanContext,
  ): Promise<Signal> {
    switch (signal.id) {
      case 'mod.file.size.p90':
        return this.evaluateFileSizeP90(signal, context);
      case 'mod.file.size.max':
        return this.evaluateFileSizeMax(signal, context);
      case 'mod.function.length.p90':
        return this.evaluateFunctionLengthP90(signal, context);
      case 'mod.coupling.circular':
        return this.evaluateCircularDeps(signal, context);
      case 'mod.coupling.afferent':
        return this.evaluateAfferentCoupling(signal, context);
      case 'mod.depth.max':
        return this.evaluateDepthMax(signal, context);
      case 'mod.entrypoints':
        return this.evaluateEntryPoints(signal, context);
      default:
        return this.createSignal(signal, 0, 0);
    }
  }

  // ---------------------------------------------------------------------------
  // mod.file.size.p90
  // ---------------------------------------------------------------------------

  private async evaluateFileSizeP90(
    signal: SignalDefinition,
    context: ScanContext,
  ): Promise<Signal> {
    const sourceFiles = context.fileIndex.getSourceFiles();
    const evidence: Evidence[] = [];

    if (sourceFiles.length === 0) {
      return this.createSignal(signal, 0, 0.5, [
        { file: '', suggestion: 'No source files found.' },
      ]);
    }

    const lineCounts = sourceFiles
      .map((f) => f.lines)
      .sort((a, b) => a - b);

    const p90 = percentile(lineCounts, 0.9);

    // Evidence: files above the P90 threshold
    const largeFiles = sourceFiles
      .filter((f) => f.lines >= p90 && f.lines > signal.threshold.good)
      .sort((a, b) => b.lines - a.lines)
      .slice(0, 5);

    for (const f of largeFiles) {
      evidence.push({
        file: f.relativePath,
        snippet: `${f.lines} lines`,
        suggestion: `File exceeds P90 threshold. Consider splitting into smaller modules.`,
      });
    }

    return this.createSignal(signal, p90, 0.95, evidence);
  }

  // ---------------------------------------------------------------------------
  // mod.file.size.max
  // ---------------------------------------------------------------------------

  private async evaluateFileSizeMax(
    signal: SignalDefinition,
    context: ScanContext,
  ): Promise<Signal> {
    const sourceFiles = context.fileIndex.getSourceFiles();
    const evidence: Evidence[] = [];

    if (sourceFiles.length === 0) {
      return this.createSignal(signal, 0, 0.5, [
        { file: '', suggestion: 'No source files found.' },
      ]);
    }

    const sorted = [...sourceFiles].sort((a, b) => b.lines - a.lines);
    const maxFile = sorted[0];
    const maxLines = maxFile.lines;

    evidence.push({
      file: maxFile.relativePath,
      snippet: `${maxLines} lines`,
      suggestion:
        maxLines > signal.threshold.poor
          ? 'Largest file in the codebase. Break it into smaller, focused modules.'
          : 'Largest file is within acceptable limits.',
    });

    // Show the top 3 offenders if they are above the "good" threshold
    const offenders = sorted
      .slice(0, 3)
      .filter((f) => f.lines > signal.threshold.good);

    for (const f of offenders.slice(1)) {
      evidence.push({
        file: f.relativePath,
        snippet: `${f.lines} lines`,
        suggestion: 'Large file. Consider refactoring into smaller modules.',
      });
    }

    return this.createSignal(signal, maxLines, 0.95, evidence);
  }

  // ---------------------------------------------------------------------------
  // mod.function.length.p90
  // ---------------------------------------------------------------------------

  private async evaluateFunctionLengthP90(
    signal: SignalDefinition,
    context: ScanContext,
  ): Promise<Signal> {
    const { fileIndex } = context;
    const sourceFiles = fileIndex
      .getSourceFiles()
      .filter((f) => SOURCE_EXTENSIONS_FOR_FUNCTIONS.has(f.extension));
    const evidence: Evidence[] = [];

    if (sourceFiles.length === 0) {
      return this.createSignal(signal, 0, 0.5, [
        { file: '', suggestion: 'No source files found for function analysis.' },
      ]);
    }

    const functionLengths: number[] = [];

    interface FunctionInfo {
      file: string;
      line: number;
      length: number;
      name: string;
    }

    const longFunctions: FunctionInfo[] = [];

    for (const file of sourceFiles) {
      const content = fileIndex.read(file.relativePath);
      if (!content) continue;

      const lengths = this.measureFunctionLengths(
        content,
        file.extension,
        file.relativePath,
        longFunctions,
      );
      functionLengths.push(...lengths);
    }

    if (functionLengths.length === 0) {
      return this.createSignal(signal, 0, 0.3, [
        { file: '', suggestion: 'No functions detected (regex-based detection).' },
      ]);
    }

    functionLengths.sort((a, b) => a - b);
    const p90 = percentile(functionLengths, 0.9);

    // Show the longest functions as evidence
    longFunctions.sort((a, b) => b.length - a.length);
    for (const fn of longFunctions.slice(0, 5)) {
      if (fn.length > signal.threshold.good) {
        evidence.push({
          file: fn.file,
          line: fn.line,
          snippet: `${fn.name} (${fn.length} lines)`,
          suggestion: 'Long function. Extract sub-routines or split logic into helpers.',
        });
      }
    }

    return this.createSignal(signal, p90, 0.65, evidence);
  }

  /**
   * Detects function boundaries using regex and measures length in lines.
   *
   * Strategy: find all function start lines, then compute length as the
   * distance from one function start to the next (or end of file). This is
   * a simplification that avoids brace-matching but gives reasonable P90 data.
   */
  private measureFunctionLengths(
    content: string,
    extension: string,
    filePath: string,
    longFunctions: { file: string; line: number; length: number; name: string }[],
  ): number[] {
    const lines = content.split('\n');
    const functionStarts: { lineIndex: number; name: string }[] = [];
    const isPython = extension === '.py';
    const isPHP = extension === '.php';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (isPython) {
        if (PY_FUNCTION.test(line)) {
          const name = extractFunctionName(line, 'def');
          functionStarts.push({ lineIndex: i, name });
        }
      } else if (isPHP) {
        if (PHP_FUNCTION.test(line)) {
          const name = extractFunctionName(line, 'function');
          functionStarts.push({ lineIndex: i, name });
        }
      } else {
        // JS/TS
        if (JS_FUNCTION_DECL.test(line)) {
          const name = extractFunctionName(line, 'function');
          functionStarts.push({ lineIndex: i, name });
        } else if (JS_ARROW_OR_EXPR.test(line)) {
          const nameMatch = line.match(
            /(?:const|let|var)\s+(\w+)/,
          );
          const name = nameMatch ? nameMatch[1] : '<anonymous>';
          functionStarts.push({ lineIndex: i, name });
        } else if (JS_METHOD.test(line)) {
          // Avoid matching lines that are really `if(...) {`, `for(...) {`, etc.
          const trimmed = line.trimStart();
          if (
            !trimmed.startsWith('if') &&
            !trimmed.startsWith('for') &&
            !trimmed.startsWith('while') &&
            !trimmed.startsWith('switch') &&
            !trimmed.startsWith('catch') &&
            !trimmed.startsWith('else') &&
            !trimmed.startsWith('return') &&
            !trimmed.startsWith('{')
          ) {
            const nameMatch = trimmed.match(/^(?:(?:public|private|protected|static|readonly|async|override|abstract)\s+)*(\w+)\s*\(/);
            const name = nameMatch ? nameMatch[1] : '<method>';
            functionStarts.push({ lineIndex: i, name });
          }
        }
      }
    }

    const lengths: number[] = [];

    for (let i = 0; i < functionStarts.length; i++) {
      const start = functionStarts[i].lineIndex;
      let end: number;

      if (isPython) {
        // For Python: count lines until next function at same or lower indent, or EOF
        end = findPythonFunctionEnd(lines, start);
      } else {
        // For JS/TS/PHP: count until next function start or EOF
        end =
          i + 1 < functionStarts.length
            ? functionStarts[i + 1].lineIndex
            : lines.length;
      }

      // Subtract trailing blank lines
      let adjustedEnd = end;
      while (adjustedEnd > start + 1 && lines[adjustedEnd - 1]?.trim() === '') {
        adjustedEnd--;
      }

      const length = Math.max(1, adjustedEnd - start);
      lengths.push(length);

      // Track long functions for evidence
      if (length > 25) {
        longFunctions.push({
          file: filePath,
          line: start + 1, // 1-based
          length,
          name: functionStarts[i].name,
        });
      }
    }

    return lengths;
  }

  // ---------------------------------------------------------------------------
  // mod.coupling.circular
  // ---------------------------------------------------------------------------

  private async evaluateCircularDeps(
    signal: SignalDefinition,
    context: ScanContext,
  ): Promise<Signal> {
    const graph = buildImportGraph(context.fileIndex);
    const cycles = findCircularDependencies(graph);
    const evidence: Evidence[] = [];

    for (const cycle of cycles.slice(0, 5)) {
      const cycleStr = cycle.join(' -> ');
      evidence.push({
        file: cycle[0],
        snippet: cycleStr.length > 120 ? cycleStr.slice(0, 117) + '...' : cycleStr,
        suggestion: 'Break this circular dependency by extracting shared code into a separate module.',
      });
    }

    if (cycles.length > 5) {
      evidence.push({
        file: '',
        suggestion: `...and ${cycles.length - 5} more circular dependency cycles.`,
      });
    }

    if (cycles.length === 0) {
      evidence.push({
        file: '',
        suggestion: 'No circular dependencies detected.',
      });
    }

    return this.createSignal(signal, cycles.length, 0.6, evidence);
  }

  // ---------------------------------------------------------------------------
  // mod.coupling.afferent
  // ---------------------------------------------------------------------------

  private async evaluateAfferentCoupling(
    signal: SignalDefinition,
    context: ScanContext,
  ): Promise<Signal> {
    const graph = buildImportGraph(context.fileIndex);
    const coupling = getAfferentCoupling(graph);
    const evidence: Evidence[] = [];

    if (coupling.size === 0) {
      return this.createSignal(signal, 0, 0.5, [
        { file: '', suggestion: 'No import graph could be built.' },
      ]);
    }

    // Find max afferent coupling
    let maxCoupling = 0;
    let maxFile = '';

    const sorted = [...coupling.entries()].sort((a, b) => b[1] - a[1]);

    for (const [file, count] of sorted) {
      if (count > maxCoupling) {
        maxCoupling = count;
        maxFile = file;
      }
    }

    // Top offenders
    for (const [file, count] of sorted.slice(0, 5)) {
      if (count > signal.threshold.good) {
        evidence.push({
          file,
          snippet: `Imported by ${count} files`,
          suggestion:
            'Highly coupled module. Consider splitting public API from implementation.',
        });
      }
    }

    if (evidence.length === 0) {
      evidence.push({
        file: maxFile || '',
        snippet: `Max incoming imports: ${maxCoupling}`,
        suggestion: 'Coupling levels are within acceptable limits.',
      });
    }

    return this.createSignal(signal, maxCoupling, 0.7, evidence);
  }

  // ---------------------------------------------------------------------------
  // mod.depth.max
  // ---------------------------------------------------------------------------

  private async evaluateDepthMax(
    signal: SignalDefinition,
    context: ScanContext,
  ): Promise<Signal> {
    const depth = context.profile.structure.depth;
    const evidence: Evidence[] = [];

    if (depth > signal.threshold.good) {
      // Find the deepest file for evidence
      const allEntries = context.fileIndex.getAllEntries();
      const deepest = allEntries
        .map((f) => ({
          file: f.relativePath,
          depth: f.relativePath.split('/').length - 1,
        }))
        .sort((a, b) => b.depth - a.depth)
        .slice(0, 3);

      for (const d of deepest) {
        evidence.push({
          file: d.file,
          snippet: `Depth: ${d.depth}`,
          suggestion: 'Deeply nested file. Consider flattening the directory structure.',
        });
      }
    } else {
      evidence.push({
        file: '',
        snippet: `Max depth: ${depth}`,
        suggestion: 'Folder depth is within acceptable limits.',
      });
    }

    return this.createSignal(signal, depth, 0.9, evidence);
  }

  // ---------------------------------------------------------------------------
  // mod.entrypoints
  // ---------------------------------------------------------------------------

  private async evaluateEntryPoints(
    signal: SignalDefinition,
    context: ScanContext,
  ): Promise<Signal> {
    const entryPoints = context.profile.structure.entryPoints;
    const evidence: Evidence[] = [];

    if (entryPoints.length > 0) {
      for (const ep of entryPoints.slice(0, 5)) {
        evidence.push({
          file: ep,
          suggestion: 'Detected entry point.',
        });
      }
      return this.createSignal(signal, 1, 0.85, evidence);
    }

    // No entry points from profile — do a secondary check
    const commonEntryPatterns = [
      'src/index.ts', 'src/index.js', 'src/main.ts', 'src/main.js',
      'src/app.ts', 'src/app.js', 'index.ts', 'index.js',
      'main.ts', 'main.js', 'app.ts', 'app.js',
      'src/cli.ts', 'src/cli.js', 'bin/index.js',
      'main.py', 'app.py', '__main__.py', 'manage.py',
      'src/main.py', 'src/app.py',
    ];

    const found: string[] = [];
    for (const pattern of commonEntryPatterns) {
      if (context.fileIndex.exists(pattern)) {
        found.push(pattern);
      }
    }

    if (found.length > 0) {
      for (const ep of found.slice(0, 3)) {
        evidence.push({
          file: ep,
          suggestion: 'Likely entry point detected via common naming conventions.',
        });
      }
      return this.createSignal(signal, 1, 0.85, evidence);
    }

    evidence.push({
      file: '',
      suggestion:
        'No clear entry points found. Add an index.ts, main.ts, or similar to help Claude understand where execution starts.',
    });

    return this.createSignal(signal, 0, 0.85, evidence);
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Computes the given percentile from a sorted array of numbers.
 * Uses nearest-rank method.
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

/**
 * Extracts a function name from a line given the keyword preceding it.
 * E.g., "function foo(" with keyword "function" -> "foo"
 */
function extractFunctionName(line: string, keyword: string): string {
  const pattern = new RegExp(`${keyword}\\s+(\\w+)`);
  const match = line.match(pattern);
  return match ? match[1] : '<anonymous>';
}

/**
 * For Python: finds the end of a function by tracking indentation.
 * Returns the line index (exclusive) where the function body ends.
 */
function findPythonFunctionEnd(lines: string[], startIndex: number): number {
  if (startIndex >= lines.length) return lines.length;

  // Get the indentation of the `def` line
  const defLine = lines[startIndex];
  const defIndent = defLine.length - defLine.trimStart().length;

  // The function body is everything indented more than the def line
  // (or blank lines within the body)
  let end = startIndex + 1;

  while (end < lines.length) {
    const line = lines[end];
    const trimmed = line.trimStart();

    // Skip blank lines — they don't end the function
    if (trimmed === '') {
      end++;
      continue;
    }

    const currentIndent = line.length - trimmed.length;

    // If we encounter a line at the same or lesser indent, the function ended
    if (currentIndent <= defIndent) {
      break;
    }

    end++;
  }

  return end;
}
