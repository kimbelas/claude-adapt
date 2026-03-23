/**
 * Command merger for .claude/commands/ files.
 *
 * Each command is a standalone .md file. This merger handles
 * source-tracked creation, conflict detection on name collision,
 * and clean removal by skill name.
 */

import type { Conflict, MergeOperation, RollbackPlan } from '../types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CommandFile {
  /** Relative path within .claude/commands/. */
  path: string;
  /** File content. */
  content: string;
  /** Source attribution, e.g. "skill:laravel" or "manual". */
  source: string;
}

export interface CommandMergeResult {
  /** Map of command name to file entry (updated in place). */
  commands: Map<string, CommandFile>;
  /** Paths of files that were created or updated. */
  created: string[];
  operations: MergeOperation[];
  conflicts: Conflict[];
  rollback: RollbackPlan;
}

// ---------------------------------------------------------------------------
// Source marker pattern
// ---------------------------------------------------------------------------

const SOURCE_HEADER_RE = /^<!--\s*claude-adapt:source:(.+?)\s*-->/;

// ---------------------------------------------------------------------------
// CommandMerger
// ---------------------------------------------------------------------------

export class CommandMerger {
  /**
   * Merge incoming skill commands into existing commands.
   *
   * @param existingCommands - Current commands keyed by name
   * @param incoming        - Commands from the skill manifest
   * @param skillName       - Name of the skill being installed
   * @param readFile        - Callback to read the command file content
   * @returns Merge result with created files and conflicts
   */
  merge(
    existingCommands: Map<string, CommandFile>,
    incoming: { name: string; file: string; description: string; overrides?: string }[],
    skillName: string,
    readFile: (path: string) => string,
  ): CommandMergeResult {
    const created: string[] = [];
    const operations: MergeOperation[] = [];
    const conflicts: Conflict[] = [];
    const rollbackOps: { type: 'restore' | 'remove-file'; target: string; originalContent?: string }[] = [];
    const sourceMarker = `skill:${skillName}`;

    for (const cmd of incoming) {
      const cmdName = cmd.name.replace(/^\//, '');
      const targetPath = `.claude/commands/${cmdName}.md`;

      // Check for conflicts (same name, different source, no explicit override)
      if (!cmd.overrides && existingCommands.has(cmd.name)) {
        const existing = existingCommands.get(cmd.name)!;
        if (existing.source !== sourceMarker) {
          conflicts.push({
            type: 'command',
            id: cmd.name,
            existingSource: existing.source,
            incomingSource: sourceMarker,
            message:
              `Command "${cmd.name}" already exists (source: ${existing.source}). ` +
              `Use "overrides" to explicitly replace it.`,
          });
          continue;
        }
      }

      // Save existing content for rollback
      if (existingCommands.has(cmd.name)) {
        const existing = existingCommands.get(cmd.name)!;
        rollbackOps.push({
          type: 'restore',
          target: existing.path,
          originalContent: existing.content,
        });
      } else {
        rollbackOps.push({ type: 'remove-file', target: targetPath });
      }

      // Read the command file content
      let fileContent: string;
      try {
        fileContent = readFile(cmd.file);
      } catch {
        conflicts.push({
          type: 'command',
          id: cmd.name,
          existingSource: '',
          incomingSource: sourceMarker,
          message: `Could not read command file "${cmd.file}"`,
        });
        continue;
      }

      // Write with source header
      const content =
        `<!-- claude-adapt:source:${sourceMarker}:command:${cmd.name} -->\n` +
        fileContent;

      existingCommands.set(cmd.name, {
        path: targetPath,
        content,
        source: sourceMarker,
      });

      created.push(targetPath);

      operations.push({
        type: 'create',
        target: targetPath,
        content,
        marker: `${sourceMarker}:command:${cmd.name}`,
      });
    }

    const rollback: RollbackPlan = { operations: rollbackOps };

    return {
      commands: existingCommands,
      created,
      operations,
      conflicts,
      rollback,
    };
  }

  /**
   * Find all command files belonging to a skill and return their paths
   * for removal.
   */
  remove(
    existingCommands: Map<string, CommandFile>,
    skillName: string,
  ): { removedPaths: string[]; updatedCommands: Map<string, CommandFile> } {
    const sourceMarker = `skill:${skillName}`;
    const removedPaths: string[] = [];

    for (const [name, file] of existingCommands) {
      if (file.source === sourceMarker) {
        removedPaths.push(file.path);
        existingCommands.delete(name);
      }
    }

    return { removedPaths, updatedCommands: existingCommands };
  }

  /**
   * Parse the source header from an existing command file.
   */
  parseSource(content: string): string {
    const firstLine = content.split('\n')[0];
    const match = firstLine?.match(SOURCE_HEADER_RE);
    return match ? match[1] : 'manual';
  }
}
