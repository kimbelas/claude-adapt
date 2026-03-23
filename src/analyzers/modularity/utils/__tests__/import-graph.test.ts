import { describe, it, expect } from 'vitest';

import {
  buildImportGraph,
  findCircularDependencies,
  getAfferentCoupling,
} from '../import-graph.js';
import type { FileIndex } from '../../../../core/context/file-index.js';
import type { FileEntry } from '../../../../core/context/file-index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFileEntry(
  relativePath: string,
  lines = 20,
): FileEntry {
  const ext = relativePath.substring(relativePath.lastIndexOf('.'));
  return {
    path: `/repo/${relativePath}`,
    relativePath,
    size: lines * 40,
    lines,
    hash: 'abc123',
    extension: ext,
  };
}

/**
 * Creates a minimal FileIndex-like object from a map of path -> content.
 */
function makeFileIndex(
  fileContents: Record<string, string>,
): FileIndex {
  const sourceExtensions = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py',
  ]);

  const entries: FileEntry[] = Object.keys(fileContents).map(p => makeFileEntry(p));

  return {
    getSourceFiles: () => entries.filter(e => sourceExtensions.has(e.extension)),
    read: (path: string) => fileContents[path],
    exists: (path: string) => path in fileContents,
    getAllEntries: () => entries,
    getTestFiles: () => [],
    getFileCount: () => entries.length,
    glob: () => [],
    getEntry: (path: string) => entries.find(e => e.relativePath === path),
  } as unknown as FileIndex;
}

// ---------------------------------------------------------------------------
// buildImportGraph
// ---------------------------------------------------------------------------

describe('buildImportGraph', () => {
  it('builds an empty graph when there are no files', () => {
    const index = makeFileIndex({});
    const graph = buildImportGraph(index);

    expect(graph.nodes.size).toBe(0);
    expect(graph.adjacencyList.size).toBe(0);
  });

  it('builds a graph from ES module imports', () => {
    const index = makeFileIndex({
      'src/app.ts': "import { handler } from './handler.js';\nimport { utils } from './utils.js';",
      'src/handler.ts': "import { utils } from './utils.js';",
      'src/utils.ts': 'export const add = (a: number, b: number) => a + b;',
    });

    const graph = buildImportGraph(index);

    expect(graph.nodes.size).toBe(3);
    expect(graph.adjacencyList.has('src/app.ts')).toBe(true);
    expect(graph.adjacencyList.get('src/app.ts')).toContain('src/handler.ts');
    expect(graph.adjacencyList.get('src/app.ts')).toContain('src/utils.ts');
    expect(graph.adjacencyList.get('src/handler.ts')).toContain('src/utils.ts');
  });

  it('ignores non-relative imports (packages)', () => {
    const index = makeFileIndex({
      'src/app.ts': "import express from 'express';\nimport { handler } from './handler.js';",
      'src/handler.ts': "import chalk from 'chalk';",
    });

    const graph = buildImportGraph(index);

    // app.ts imports handler (relative) and express (non-relative, ignored)
    expect(graph.adjacencyList.get('src/app.ts')?.length).toBe(1);
    // handler.ts only imports chalk (non-relative) -> no entries
    expect(graph.adjacencyList.has('src/handler.ts')).toBe(false);
  });

  it('resolves imports without explicit extensions', () => {
    const index = makeFileIndex({
      'src/app.ts': "import { handler } from './handler';",
      'src/handler.ts': 'export function handler() {}',
    });

    const graph = buildImportGraph(index);

    expect(graph.adjacencyList.get('src/app.ts')).toContain('src/handler.ts');
  });

  it('handles dynamic imports', () => {
    const index = makeFileIndex({
      'src/app.ts': "const mod = await import('./lazy-module.js');",
      'src/lazy-module.ts': 'export const value = 42;',
    });

    const graph = buildImportGraph(index);

    expect(graph.adjacencyList.get('src/app.ts')).toContain('src/lazy-module.ts');
  });

  it('handles CommonJS require calls', () => {
    const index = makeFileIndex({
      'src/app.js': "const handler = require('./handler');",
      'src/handler.js': 'module.exports = {};',
    });

    const graph = buildImportGraph(index);

    expect(graph.adjacencyList.get('src/app.js')).toContain('src/handler.js');
  });

  it('handles index file resolution', () => {
    const index = makeFileIndex({
      'src/app.ts': "import { something } from './utils';",
      'src/utils/index.ts': 'export const something = 1;',
    });

    const graph = buildImportGraph(index);

    expect(graph.adjacencyList.get('src/app.ts')).toContain('src/utils/index.ts');
  });
});

// ---------------------------------------------------------------------------
// findCircularDependencies
// ---------------------------------------------------------------------------

describe('findCircularDependencies', () => {
  it('returns empty array when no cycles exist', () => {
    const index = makeFileIndex({
      'src/a.ts': "import { b } from './b.js';",
      'src/b.ts': "import { c } from './c.js';",
      'src/c.ts': 'export const c = 1;',
    });

    const graph = buildImportGraph(index);
    const cycles = findCircularDependencies(graph);

    expect(cycles).toHaveLength(0);
  });

  it('detects a simple A -> B -> A cycle', () => {
    const index = makeFileIndex({
      'src/a.ts': "import { b } from './b.js';",
      'src/b.ts': "import { a } from './a.js';",
    });

    const graph = buildImportGraph(index);
    const cycles = findCircularDependencies(graph);

    expect(cycles.length).toBeGreaterThanOrEqual(1);

    // Verify the cycle contains both files
    const cycleFiles = cycles[0];
    expect(cycleFiles).toContain('src/a.ts');
    expect(cycleFiles).toContain('src/b.ts');
  });

  it('detects a longer A -> B -> C -> A cycle', () => {
    const index = makeFileIndex({
      'src/a.ts': "import { b } from './b.js';",
      'src/b.ts': "import { c } from './c.js';",
      'src/c.ts': "import { a } from './a.js';",
    });

    const graph = buildImportGraph(index);
    const cycles = findCircularDependencies(graph);

    expect(cycles.length).toBeGreaterThanOrEqual(1);

    const cycleFiles = cycles[0];
    expect(cycleFiles).toContain('src/a.ts');
    expect(cycleFiles).toContain('src/b.ts');
    expect(cycleFiles).toContain('src/c.ts');
  });

  it('deduplicates cycles that start at different nodes', () => {
    const index = makeFileIndex({
      'src/a.ts': "import { b } from './b.js';",
      'src/b.ts': "import { a } from './a.js';",
    });

    const graph = buildImportGraph(index);
    const cycles = findCircularDependencies(graph);

    // A->B->A and B->A->B are the same cycle; should appear once
    expect(cycles).toHaveLength(1);
  });

  it('handles disconnected components', () => {
    const index = makeFileIndex({
      'src/a.ts': "import { b } from './b.js';",
      'src/b.ts': 'export const b = 1;',
      'src/x.ts': "import { y } from './y.js';",
      'src/y.ts': "import { x } from './x.js';",
    });

    const graph = buildImportGraph(index);
    const cycles = findCircularDependencies(graph);

    // Only one cycle: x <-> y
    expect(cycles).toHaveLength(1);
    const cycleFiles = cycles[0];
    expect(cycleFiles).toContain('src/x.ts');
    expect(cycleFiles).toContain('src/y.ts');
  });
});

// ---------------------------------------------------------------------------
// getAfferentCoupling
// ---------------------------------------------------------------------------

describe('getAfferentCoupling', () => {
  it('returns zero coupling when graph has no edges', () => {
    const index = makeFileIndex({
      'src/a.ts': 'export const a = 1;',
      'src/b.ts': 'export const b = 2;',
    });

    const graph = buildImportGraph(index);
    const coupling = getAfferentCoupling(graph);

    expect(coupling.get('src/a.ts')).toBe(0);
    expect(coupling.get('src/b.ts')).toBe(0);
  });

  it('counts incoming edges correctly', () => {
    const index = makeFileIndex({
      'src/app.ts': "import { utils } from './utils.js';",
      'src/handler.ts': "import { utils } from './utils.js';",
      'src/service.ts': "import { utils } from './utils.js';",
      'src/utils.ts': 'export function utils() {}',
    });

    const graph = buildImportGraph(index);
    const coupling = getAfferentCoupling(graph);

    // utils.ts is imported by 3 files
    expect(coupling.get('src/utils.ts')).toBe(3);
    // other files are not imported by anything
    expect(coupling.get('src/app.ts')).toBe(0);
    expect(coupling.get('src/handler.ts')).toBe(0);
    expect(coupling.get('src/service.ts')).toBe(0);
  });

  it('handles files imported by a single consumer', () => {
    const index = makeFileIndex({
      'src/app.ts': "import { handler } from './handler.js';\nimport { utils } from './utils.js';",
      'src/handler.ts': 'export function handler() {}',
      'src/utils.ts': 'export function utils() {}',
    });

    const graph = buildImportGraph(index);
    const coupling = getAfferentCoupling(graph);

    expect(coupling.get('src/handler.ts')).toBe(1);
    expect(coupling.get('src/utils.ts')).toBe(1);
    expect(coupling.get('src/app.ts')).toBe(0);
  });

  it('returns all nodes even with no imports', () => {
    const index = makeFileIndex({
      'src/a.ts': 'export const a = 1;',
    });

    const graph = buildImportGraph(index);
    const coupling = getAfferentCoupling(graph);

    expect(coupling.size).toBe(1);
    expect(coupling.get('src/a.ts')).toBe(0);
  });

  it('returns empty map for empty graph', () => {
    const index = makeFileIndex({});
    const graph = buildImportGraph(index);
    const coupling = getAfferentCoupling(graph);

    expect(coupling.size).toBe(0);
  });
});
