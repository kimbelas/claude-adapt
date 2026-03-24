/**
 * Master merge orchestrator.
 *
 * Coordinates all five sub-mergers (CLAUDE.md, settings, commands,
 * hooks, MCP) within a single atomic transaction. On failure, all
 * operations are rolled back in reverse order.
 */

import { readFileSync } from 'node:fs';
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Security helper
// ---------------------------------------------------------------------------

/**
 * Validate that a relative path does not escape the base directory.
 * Prevents directory traversal attacks from skill manifest paths.
 */
function validatePath(basePath: string, relativePath: string): string {
  const resolved = resolve(basePath, relativePath);
  if (!resolved.startsWith(resolve(basePath))) {
    throw new Error(
      `Path traversal detected: "${relativePath}" escapes base directory "${basePath}"`,
    );
  }
  return resolved;
}

import { ClaudeMdMerger } from './mergers/claude-md-merger.js';
import { SettingsMerger } from './mergers/settings-merger.js';
import { CommandMerger } from './mergers/command-merger.js';
import { HookComposer } from './mergers/hook-composer.js';
import { McpMerger } from './mergers/mcp-merger.js';
import { readLockfile, writeLockfile } from './lockfile.js';
import { appendTransaction, readMergeLog } from './merge-log.js';
import type {
  Conflict,
  MergeOperation,
  MergeTransaction,
  RollbackOperation,
  RollbackPlan,
  SkillManifest,
} from './types.js';
import type { CommandFile } from './mergers/command-merger.js';
import type { ClaudeSettings } from './mergers/settings-merger.js';
import type { McpConfig } from './mergers/mcp-merger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InstallResult {
  success: boolean;
  operations: MergeOperation[];
  conflicts: Conflict[];
  transaction: MergeTransaction;
}

export interface RemoveResult {
  success: boolean;
  removedFiles: string[];
}

// ---------------------------------------------------------------------------
// MergeOrchestrator
// ---------------------------------------------------------------------------

export class MergeOrchestrator {
  private readonly claudeMdMerger = new ClaudeMdMerger();
  private readonly settingsMerger = new SettingsMerger();
  private readonly commandMerger = new CommandMerger();
  private readonly hookComposer = new HookComposer();
  private readonly mcpMerger = new McpMerger();

  /**
   * Install a skill by running all applicable sub-mergers.
   *
   * The operation is atomic: if any sub-merger fails, all preceding
   * merges are rolled back in reverse order.
   */
  async install(
    skill: SkillManifest,
    packagePath: string,
    rootPath: string,
  ): Promise<InstallResult> {
    const transaction: MergeTransaction = {
      id: randomUUID(),
      skill: skill.name,
      timestamp: new Date().toISOString(),
      operations: [],
      rollback: { operations: [] },
    };

    const allConflicts: Conflict[] = [];
    const executedRollbacks: RollbackPlan[] = [];

    try {
      // 1. CLAUDE.md sections
      if (skill.provides.claudeMd) {
        const claudeMdPath = join(rootPath, 'CLAUDE.md');
        const existingContent = await this.safeReadFile(claudeMdPath);

        // Resolve section content from files
        const sections = await this.resolveSectionContent(
          skill.provides.claudeMd.sections,
          packagePath,
        );

        const result = this.claudeMdMerger.merge(
          existingContent,
          sections,
          skill.name,
          skill.provides.claudeMd.priority ?? 50,
        );

        await this.ensureDir(claudeMdPath);
        await writeFile(claudeMdPath, result.content, 'utf-8');

        transaction.operations.push(...result.operations);
        allConflicts.push(...result.conflicts);
        executedRollbacks.push(result.rollback);
      }

      // 2. Settings
      if (skill.provides.settings) {
        const settingsPath = join(rootPath, '.claude', 'settings.json');
        const existingSettings = await this.safeReadJson<ClaudeSettings>(settingsPath, {
          permissions: {
            allowedTools: [],
            allowedCommands: [],
            deniedTools: [],
            deniedCommands: [],
          },
          behavior: {},
        });

        const result = this.settingsMerger.merge(
          existingSettings,
          skill.provides.settings as Partial<ClaudeSettings>,
          skill.name,
        );

        await this.ensureDir(settingsPath);
        await writeFile(settingsPath, JSON.stringify(result.settings, null, 2) + '\n', 'utf-8');

        transaction.operations.push(...result.operations);
        allConflicts.push(...result.conflicts);
        executedRollbacks.push(result.rollback);
      }

      // 3. Commands
      if (skill.provides.commands) {
        const commandsDir = join(rootPath, '.claude', 'commands');
        const existingCommands = await this.loadExistingCommands(commandsDir);

        const result = this.commandMerger.merge(
          existingCommands,
          skill.provides.commands,
          skill.name,
          (filePath: string) => {
            // Validate path before reading (traversal check also done in merger)
            const safePath = validatePath(packagePath, filePath);
            return readFileSync(safePath, 'utf-8');
          },
          packagePath,
        );

        // Write created/updated command files
        await mkdir(commandsDir, { recursive: true });
        for (const path of result.created) {
          const fullPath = join(rootPath, path);
          const cmd = [...result.commands.values()].find(c => c.path === path);
          if (cmd) {
            await writeFile(fullPath, cmd.content, 'utf-8');
          }
        }

        transaction.operations.push(...result.operations);
        allConflicts.push(...result.conflicts);
        executedRollbacks.push(result.rollback);
      }

      // 4. Hooks
      if (skill.provides.hooks) {
        // Group hooks by event
        const hooksByEvent = new Map<string, typeof skill.provides.hooks>();
        for (const hook of skill.provides.hooks) {
          const existing = hooksByEvent.get(hook.event) ?? [];
          existing.push(hook);
          hooksByEvent.set(hook.event, existing);
        }

        for (const [event, hooks] of hooksByEvent) {
          const hookPath = join(rootPath, '.claude', 'hooks', `${event}.sh`);
          const existingHook = await this.safeReadFile(hookPath) || null;

          const blocks = await Promise.all(
            hooks.map(async h => ({
              content: await readFile(validatePath(packagePath, h.file), 'utf-8'),
              priority: h.priority,
              merge: h.merge,
            })),
          );

          const result = this.hookComposer.compose(existingHook, blocks, skill.name);

          await this.ensureDir(hookPath);
          await writeFile(hookPath, result.content, 'utf-8');

          transaction.operations.push(...result.operations);
          executedRollbacks.push(result.rollback);
        }
      }

      // 5. MCP config
      if (skill.provides.mcp) {
        const mcpPath = join(rootPath, '.claude', 'mcp.json');
        const existingConfig = await this.safeReadJson<McpConfig>(mcpPath, {
          mcpServers: {},
          recommended: [],
        });

        const result = this.mcpMerger.merge(
          existingConfig,
          skill.provides.mcp,
          skill.name,
        );

        await this.ensureDir(mcpPath);
        await writeFile(mcpPath, JSON.stringify(result.config, null, 2) + '\n', 'utf-8');

        transaction.operations.push(...result.operations);
        allConflicts.push(...result.conflicts);
        executedRollbacks.push(result.rollback);
      }

      // Assemble the full rollback plan
      for (const plan of executedRollbacks) {
        transaction.rollback.operations.push(...plan.operations);
      }

      // Record transaction in merge log
      await appendTransaction(rootPath, transaction);

      // Update lockfile
      const lock = await readLockfile(rootPath);
      lock.skills[skill.name] = {
        version: skill.version,
        resolved: packagePath,
        integrity: '',
        installedAt: new Date().toISOString(),
        provides: this.collectProvides(skill),
      };
      await writeLockfile(rootPath, lock);

      return {
        success: true,
        operations: transaction.operations,
        conflicts: allConflicts,
        transaction,
      };
    } catch (error) {
      // ROLLBACK: replay all rollback operations in reverse
      const allRollbackOps: RollbackOperation[] = [];
      for (const plan of executedRollbacks) {
        allRollbackOps.push(...plan.operations);
      }

      for (const op of allRollbackOps.reverse()) {
        await this.executeRollback(op, rootPath);
      }

      throw error;
    }
  }

  /**
   * Remove a skill by finding its transactions and rolling back.
   */
  async remove(
    skillName: string,
    rootPath: string,
  ): Promise<RemoveResult> {
    const transactions = await readMergeLog(rootPath);
    const removedFiles: string[] = [];

    // Find transactions for this skill (newest first for rollback)
    const skillTx = transactions
      .filter(tx => tx.skill === skillName)
      .reverse();

    if (skillTx.length === 0) {
      return { success: false, removedFiles: [] };
    }

    // Execute rollback for each transaction
    for (const tx of skillTx) {
      for (const op of tx.rollback.operations.reverse()) {
        await this.executeRollback(op, rootPath);
        if (op.type === 'remove-file') {
          removedFiles.push(op.target);
        }
      }
    }

    // Update lockfile
    const lock = await readLockfile(rootPath);
    delete lock.skills[skillName];
    await writeLockfile(rootPath, lock);

    return { success: true, removedFiles };
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private async executeRollback(
    op: RollbackOperation,
    rootPath: string,
  ): Promise<void> {
    const fullPath = join(rootPath, op.target);

    switch (op.type) {
      case 'restore':
        if (op.originalContent !== undefined) {
          await this.ensureDir(fullPath);
          await writeFile(fullPath, op.originalContent, 'utf-8');
        }
        break;

      case 'remove-section':
        // Section removal is handled by re-parsing and serializing CLAUDE.md
        // The restore operation above handles the full file
        break;

      case 'remove-file':
        try {
          await unlink(fullPath);
        } catch (err: unknown) {
          // ENOENT is expected — the file may already be gone
          if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
            // Ignore: file already removed
          } else {
            console.warn(`[merge-orchestrator] Warning: failed to remove ${op.target}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
        break;
    }
  }

  private async safeReadFile(filePath: string): Promise<string> {
    try {
      return await readFile(filePath, 'utf-8');
    } catch {
      return '';
    }
  }

  private async safeReadJson<T>(filePath: string, fallback: T): Promise<T> {
    try {
      const raw = await readFile(filePath, 'utf-8');
      return JSON.parse(raw) as T;
    } catch {
      return structuredClone(fallback);
    }
  }

  private async ensureDir(filePath: string): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true });
  }

  private async resolveSectionContent(
    sections: { id: string; title: string; content: string; placement: any; condition?: string }[],
    packagePath: string,
  ): Promise<typeof sections> {
    const resolved = [];

    for (const section of sections) {
      let content = section.content;

      // If content looks like a file path, read it
      if (
        content.endsWith('.md') &&
        !content.includes('\n') &&
        content.length < 256
      ) {
        try {
          content = await readFile(validatePath(packagePath, content), 'utf-8');
        } catch {
          // Keep the original string as content if the file doesn't exist
        }
      }

      resolved.push({ ...section, content });
    }

    return resolved;
  }

  private async loadExistingCommands(
    commandsDir: string,
  ): Promise<Map<string, CommandFile>> {
    const commands = new Map<string, CommandFile>();

    try {
      const { readdir } = await import('node:fs/promises');
      const files = await readdir(commandsDir);

      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        const filePath = join(commandsDir, file);
        const content = await readFile(filePath, 'utf-8');
        const name = `/${file.replace(/\.md$/, '')}`;

        const source = this.commandMerger.parseSource(content);

        commands.set(name, {
          path: `.claude/commands/${file}`,
          content,
          source,
        });
      }
    } catch {
      // Directory doesn't exist yet
    }

    return commands;
  }

  private collectProvides(skill: SkillManifest): string[] {
    const provides: string[] = [];

    if (skill.provides.claudeMd) {
      provides.push('claudeMd');
    }
    if (skill.provides.settings) {
      provides.push('settings');
    }
    if (skill.provides.commands?.length) {
      provides.push('commands');
    }
    if (skill.provides.hooks?.length) {
      provides.push('hooks');
    }
    if (skill.provides.mcp?.length) {
      provides.push('mcp');
    }
    if (skill.provides.analyzers?.length) {
      provides.push('analyzers');
    }

    return provides;
  }
}
