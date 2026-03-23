/**
 * Generator orchestrator.
 *
 * Runs all 5 generators in sequence and collects their output into
 * a unified GeneratedOutput. Supports dry-run (preview), diff,
 * merge, and force modes.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type {
  GeneratorContext,
  ClaudeSettings,
  GeneratedOutput,
  GeneratedFiles,
  OrchestratorOptions,
} from './types.js';
import { claudeMdGenerator } from './claude-md-generator.js';
import { settingsGenerator } from './settings-generator.js';
import { commandsGenerator } from './commands-generator.js';
import { hooksGenerator } from './hooks-generator.js';
import { mcpGenerator } from './mcp-generator.js';

// ---------------------------------------------------------------------------
// Generator registry
// ---------------------------------------------------------------------------

/**
 * Names that match the --skip / --only CLI flags.
 * Order matters — generators run in this sequence.
 */
const GENERATOR_NAMES = ['claude-md', 'settings', 'commands', 'hooks', 'mcp'] as const;
type GeneratorName = (typeof GENERATOR_NAMES)[number];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check whether an existing file on disk differs from the generated content.
 * Returns null if the file does not exist.
 */
async function readExistingFile(rootPath: string, relativePath: string): Promise<string | null> {
  try {
    return await readFile(join(rootPath, relativePath), 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Filter the generator list based on skip/only options.
 */
function filterGenerators(options: OrchestratorOptions): Set<GeneratorName> {
  const active = new Set<GeneratorName>(GENERATOR_NAMES);

  if (options.only && options.only.length > 0) {
    const onlySet = new Set(options.only);
    for (const name of GENERATOR_NAMES) {
      if (!onlySet.has(name)) {
        active.delete(name);
      }
    }
  } else if (options.skip && options.skip.length > 0) {
    const skipSet = new Set(options.skip);
    for (const name of GENERATOR_NAMES) {
      if (skipSet.has(name)) {
        active.delete(name);
      }
    }
  }

  return active;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Run all enabled generators and return the collected files.
 *
 * Generators produce content; the orchestrator decides whether to
 * include each file based on force/merge/dry-run semantics. Actual
 * file I/O is NOT performed here — the caller (init command) handles
 * writing to disk.
 */
export async function runGenerators(
  ctx: GeneratorContext,
  options: OrchestratorOptions = {},
): Promise<GeneratedOutput> {
  const start = performance.now();
  const files: GeneratedFiles = new Map();
  const skipped: string[] = [];
  const merged: string[] = [];

  const active = filterGenerators(options);

  // --- 1. CLAUDE.md ------------------------------------------------------
  if (active.has('claude-md')) {
    const content = await claudeMdGenerator.generate(ctx);
    const path = '.claude/CLAUDE.md';
    const result = await resolveFile(ctx.rootPath, path, content, options);
    if (result.action === 'write') {
      files.set(path, result.content);
    } else if (result.action === 'skip') {
      skipped.push(path);
    } else if (result.action === 'merge') {
      files.set(path, result.content);
      merged.push(path);
    }
  }

  // --- 2. settings.json -------------------------------------------------
  if (active.has('settings')) {
    const settings: ClaudeSettings = await settingsGenerator.generate(ctx);
    const content = JSON.stringify(settings, null, 2) + '\n';
    const path = '.claude/settings.json';
    const result = await resolveFile(ctx.rootPath, path, content, options);
    if (result.action === 'write') {
      files.set(path, result.content);
    } else if (result.action === 'skip') {
      skipped.push(path);
    } else if (result.action === 'merge') {
      files.set(path, result.content);
      merged.push(path);
    }
  }

  // --- 3. Commands -------------------------------------------------------
  if (active.has('commands')) {
    const commands = await commandsGenerator.generate(ctx);
    for (const [filename, content] of Object.entries(commands)) {
      const path = `.claude/commands/${filename}`;
      const result = await resolveFile(ctx.rootPath, path, content, options);
      if (result.action === 'write') {
        files.set(path, result.content);
      } else if (result.action === 'skip') {
        skipped.push(path);
      } else if (result.action === 'merge') {
        files.set(path, result.content);
        merged.push(path);
      }
    }
  }

  // --- 4. Hooks ----------------------------------------------------------
  if (active.has('hooks')) {
    const hooks = await hooksGenerator.generate(ctx);
    for (const [filename, content] of Object.entries(hooks)) {
      const path = `.claude/hooks/${filename}`;
      const result = await resolveFile(ctx.rootPath, path, content, options);
      if (result.action === 'write') {
        files.set(path, result.content);
      } else if (result.action === 'skip') {
        skipped.push(path);
      } else if (result.action === 'merge') {
        files.set(path, result.content);
        merged.push(path);
      }
    }
  }

  // --- 5. MCP ------------------------------------------------------------
  if (active.has('mcp')) {
    const mcpConfig = await mcpGenerator.generate(ctx);
    const content = JSON.stringify(mcpConfig, null, 2) + '\n';
    const path = '.claude/mcp.json';
    const result = await resolveFile(ctx.rootPath, path, content, options);
    if (result.action === 'write') {
      files.set(path, result.content);
    } else if (result.action === 'skip') {
      skipped.push(path);
    } else if (result.action === 'merge') {
      files.set(path, result.content);
      merged.push(path);
    }
  }

  return {
    files,
    skipped,
    merged,
    duration: performance.now() - start,
  };
}

// ---------------------------------------------------------------------------
// File resolution (force / merge / skip logic)
// ---------------------------------------------------------------------------

interface FileResolution {
  action: 'write' | 'skip' | 'merge';
  content: string;
}

async function resolveFile(
  rootPath: string,
  relativePath: string,
  generatedContent: string,
  options: OrchestratorOptions,
): Promise<FileResolution> {
  const existing = await readExistingFile(rootPath, relativePath);

  // No existing file — always write
  if (existing === null) {
    return { action: 'write', content: generatedContent };
  }

  // Existing file is identical — skip
  if (existing === generatedContent) {
    return { action: 'skip', content: generatedContent };
  }

  // Force mode — overwrite
  if (options.force) {
    return { action: 'write', content: generatedContent };
  }

  // Merge mode — attempt merge
  if (options.merge) {
    const merged = mergeContent(relativePath, existing, generatedContent);
    return { action: 'merge', content: merged };
  }

  // Default: skip existing files
  return { action: 'skip', content: generatedContent };
}

/**
 * Simple merge strategy:
 * - For JSON files: deep-merge objects (generated values win for new keys,
 *   existing values preserved for existing keys).
 * - For markdown/shell: append generated content after existing with a marker.
 */
function mergeContent(
  relativePath: string,
  existing: string,
  generated: string,
): string {
  // JSON merge
  if (relativePath.endsWith('.json')) {
    try {
      const existingObj = JSON.parse(existing) as Record<string, unknown>;
      const generatedObj = JSON.parse(generated) as Record<string, unknown>;
      const merged = deepMerge(existingObj, generatedObj);
      return JSON.stringify(merged, null, 2) + '\n';
    } catch {
      // Fall back to replacement if JSON is malformed
      return generated;
    }
  }

  // Markdown / shell: append new sections after a marker
  const marker = '\n\n<!-- claude-adapt:generated -->\n';
  const markerIndex = existing.indexOf(marker);

  if (markerIndex !== -1) {
    // Replace everything after the marker
    return existing.slice(0, markerIndex) + marker + generated;
  }

  // No marker — append
  return existing + marker + generated;
}

/**
 * Recursively merge two objects. Source values win for new keys;
 * existing values are preserved when they already exist and both
 * are not plain objects. Arrays are concatenated and deduplicated.
 */
function deepMerge(
  existing: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = structuredClone(existing);

  for (const [key, sourceValue] of Object.entries(source)) {
    const existingValue = result[key];

    if (
      existingValue !== null &&
      existingValue !== undefined &&
      typeof existingValue === 'object' &&
      !Array.isArray(existingValue) &&
      typeof sourceValue === 'object' &&
      sourceValue !== null &&
      !Array.isArray(sourceValue)
    ) {
      result[key] = deepMerge(
        existingValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>,
      );
    } else if (Array.isArray(existingValue) && Array.isArray(sourceValue)) {
      // Concatenate and deduplicate
      result[key] = [...new Set([...existingValue, ...sourceValue])];
    } else if (existingValue === undefined) {
      // Only set if not already present
      result[key] = sourceValue;
    }
    // else: existing value wins — do not overwrite
  }

  return result;
}
