import { posix } from 'node:path';
import type { FileIndex } from '../../../core/context/file-index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImportGraph {
  /** Map from file path to its list of imported file paths. */
  adjacencyList: Map<string, string[]>;
  /** Set of all unique file paths present in the graph. */
  nodes: Set<string>;
}

// ---------------------------------------------------------------------------
// Import regex patterns
// ---------------------------------------------------------------------------

/**
 * Matches ES module static imports:
 *   import Foo from './foo'
 *   import { bar } from "./bar"
 *   import * as baz from './baz'
 *   import './side-effect'
 */
const ES_IMPORT_PATTERN = /import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g;

/**
 * Matches dynamic import() expressions:
 *   import('./module')
 *   import("./module")
 */
const DYNAMIC_IMPORT_PATTERN = /import\(\s*['"]([^'"]+)['"]\s*\)/g;

/**
 * Matches CommonJS require() calls:
 *   require('./module')
 *   require("./module")
 */
const REQUIRE_PATTERN = /require\(\s*['"]([^'"]+)['"]\s*\)/g;

/**
 * Matches Python from...import statements:
 *   from .module import something
 *   from ..package.module import something
 */
const PYTHON_FROM_IMPORT_PATTERN = /from\s+(\.+[\w.]*)\s+import/g;

/** Extensions to try when resolving imports without explicit extensions. */
const RESOLVE_EXTENSIONS = [
  '',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '/index.ts',
  '/index.tsx',
  '/index.js',
  '/index.jsx',
];

// ---------------------------------------------------------------------------
// Build graph
// ---------------------------------------------------------------------------

/**
 * Builds a directed import graph from all source files in the index.
 *
 * Only relative imports (starting with `.` or `..`) are tracked because
 * third-party package imports are not useful for measuring internal coupling.
 */
export function buildImportGraph(fileIndex: FileIndex): ImportGraph {
  const adjacencyList = new Map<string, string[]>();
  const nodes = new Set<string>();
  const sourceFiles = fileIndex.getSourceFiles();

  for (const entry of sourceFiles) {
    const normalized = normalizePath(entry.relativePath);
    nodes.add(normalized);
  }

  for (const entry of sourceFiles) {
    const content = fileIndex.read(entry.relativePath);
    if (!content) continue;

    const fromFile = normalizePath(entry.relativePath);
    const imports = extractRelativeImports(content, entry.extension);
    const resolvedImports: string[] = [];

    for (const importSpecifier of imports) {
      const resolved = resolveImport(fromFile, importSpecifier, nodes);
      if (resolved) {
        resolvedImports.push(resolved);
      }
    }

    if (resolvedImports.length > 0) {
      adjacencyList.set(fromFile, resolvedImports);
    }
  }

  return { adjacencyList, nodes };
}

// ---------------------------------------------------------------------------
// Circular dependency detection
// ---------------------------------------------------------------------------

/**
 * Finds all circular dependency cycles in the import graph using DFS
 * with back-edge detection.
 *
 * Returns an array of cycles, where each cycle is an array of file paths
 * that form the loop (the first element is repeated at the end).
 */
export function findCircularDependencies(graph: ImportGraph): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const pathStack: string[] = [];
  const seen = new Set<string>();

  function dfs(node: string): void {
    visited.add(node);
    inStack.add(node);
    pathStack.push(node);

    const neighbors = graph.adjacencyList.get(node) ?? [];

    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      } else if (inStack.has(neighbor)) {
        // Back edge found — extract the cycle
        const cycleStart = pathStack.indexOf(neighbor);
        if (cycleStart !== -1) {
          const cycle = [...pathStack.slice(cycleStart), neighbor];

          // Deduplicate cycles by creating a canonical key:
          // rotate to start with the lexicographically smallest node
          const key = canonicalizeCycle(cycle);
          if (!seen.has(key)) {
            seen.add(key);
            cycles.push(cycle);
          }
        }
      }
    }

    pathStack.pop();
    inStack.delete(node);
  }

  for (const node of graph.nodes) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }

  return cycles;
}

// ---------------------------------------------------------------------------
// Afferent coupling
// ---------------------------------------------------------------------------

/**
 * Computes afferent (incoming) coupling for each node in the graph.
 *
 * Afferent coupling counts how many other files import a given file.
 * High afferent coupling means a file is widely depended upon, making
 * changes risky and indicating a potential "god module".
 */
export function getAfferentCoupling(graph: ImportGraph): Map<string, number> {
  const incomingCount = new Map<string, number>();

  // Initialize all nodes to 0
  for (const node of graph.nodes) {
    incomingCount.set(node, 0);
  }

  // Count incoming edges
  for (const [, targets] of graph.adjacencyList) {
    for (const target of targets) {
      incomingCount.set(target, (incomingCount.get(target) ?? 0) + 1);
    }
  }

  return incomingCount;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extracts relative import specifiers from file content.
 * Only returns specifiers that start with `.` or `..`.
 */
function extractRelativeImports(content: string, extension: string): string[] {
  const imports: string[] = [];
  const isPython = extension === '.py';

  if (isPython) {
    // Python relative imports
    for (const match of content.matchAll(PYTHON_FROM_IMPORT_PATTERN)) {
      const specifier = match[1];
      if (specifier.startsWith('.')) {
        imports.push(specifier);
      }
    }
  } else {
    // JavaScript / TypeScript
    for (const match of content.matchAll(ES_IMPORT_PATTERN)) {
      const specifier = match[1];
      if (isRelativeImport(specifier)) {
        imports.push(specifier);
      }
    }

    for (const match of content.matchAll(DYNAMIC_IMPORT_PATTERN)) {
      const specifier = match[1];
      if (isRelativeImport(specifier)) {
        imports.push(specifier);
      }
    }

    for (const match of content.matchAll(REQUIRE_PATTERN)) {
      const specifier = match[1];
      if (isRelativeImport(specifier)) {
        imports.push(specifier);
      }
    }
  }

  return imports;
}

function isRelativeImport(specifier: string): boolean {
  return specifier.startsWith('./') || specifier.startsWith('../');
}

/**
 * Resolves a relative import specifier from the importing file's location
 * to a normalized path that exists in the node set.
 */
function resolveImport(
  fromFile: string,
  specifier: string,
  knownNodes: Set<string>,
): string | null {
  const fromDir = posix.dirname(fromFile);

  // For Python dot-notation imports, convert to path
  const pathSpecifier = specifier.includes('.')
    && !specifier.includes('/')
    && !specifier.endsWith('.js')
    && !specifier.endsWith('.ts')
    ? convertPythonImport(specifier)
    : specifier;

  // Strip .js/.ts extension from specifier for resolution (TypeScript
  // convention: import paths use .js but the actual file is .ts)
  const stripped = pathSpecifier.replace(/\.[jt]sx?$/, '');
  const raw = posix.normalize(posix.join(fromDir, stripped));
  const rawWithExt = posix.normalize(posix.join(fromDir, pathSpecifier));

  // Try exact match first (with the extension as-is in the specifier)
  if (knownNodes.has(rawWithExt)) return rawWithExt;

  // Try with various extensions
  for (const ext of RESOLVE_EXTENSIONS) {
    const candidate = normalizePath(raw + ext);
    if (knownNodes.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Converts a Python relative import specifier to a path-like string.
 * E.g., "..package.module" -> "../../package/module"
 */
function convertPythonImport(specifier: string): string {
  let dots = 0;
  while (dots < specifier.length && specifier[dots] === '.') {
    dots++;
  }

  const prefix = dots === 1 ? './' : '../'.repeat(dots - 1);
  const rest = specifier
    .slice(dots)
    .split('.')
    .filter(Boolean)
    .join('/');

  return rest ? `${prefix}${rest}.py` : prefix.replace(/\/$/, '');
}

/**
 * Normalizes a path to use forward slashes and remove leading `./`.
 */
function normalizePath(p: string): string {
  return posix.normalize(p).replace(/^\.\//, '');
}

/**
 * Creates a canonical string key for a cycle to deduplicate cycles
 * that represent the same loop starting at different nodes.
 */
function canonicalizeCycle(cycle: string[]): string {
  // Remove the repeated last element
  const core = cycle.slice(0, -1);
  if (core.length === 0) return '';

  // Find the lexicographically smallest element and rotate to it
  let minIndex = 0;
  for (let i = 1; i < core.length; i++) {
    if (core[i] < core[minIndex]) {
      minIndex = i;
    }
  }

  const rotated = [...core.slice(minIndex), ...core.slice(0, minIndex)];
  return rotated.join(' -> ');
}
