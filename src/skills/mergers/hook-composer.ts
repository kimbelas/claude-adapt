/**
 * Hook script composer.
 *
 * Composes multiple skill-contributed hook scripts into a single
 * priority-ordered shell script with block markers for clean
 * insertion and removal.
 */

import type { HookBlock, MergeOperation, RollbackPlan } from '../types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HookComposeResult {
  content: string;
  operations: MergeOperation[];
  rollback: RollbackPlan;
}

// ---------------------------------------------------------------------------
// Block marker patterns
// ---------------------------------------------------------------------------

const BLOCK_START_RE =
  /^#\s*---\s*claude-adapt:(.+?)\s*\(priority:\s*(\d+)\)\s*---\s*$/;
const BLOCK_END_RE =
  /^#\s*---\s*end:claude-adapt:(.+?)\s*---\s*$/;

// ---------------------------------------------------------------------------
// HookComposer
// ---------------------------------------------------------------------------

export class HookComposer {
  /**
   * Compose hook scripts from multiple skills into a single script.
   *
   * @param existingHook - Current hook script content (null if new)
   * @param incomingBlocks - New blocks to merge in
   * @param skillName - Name of the skill contributing these blocks
   * @returns Composed result with content, operations, and rollback
   */
  compose(
    existingHook: string | null,
    incomingBlocks: { content: string; priority: number; merge: 'prepend' | 'append' | 'replace' }[],
    skillName: string,
  ): HookComposeResult {
    const blocks = existingHook ? this.parseBlocks(existingHook) : [];
    const operations: MergeOperation[] = [];
    const sourceMarker = `skill:${skillName}`;

    for (const incoming of incomingBlocks) {
      const newBlock: HookBlock = {
        source: sourceMarker,
        priority: incoming.priority,
        content: incoming.content.trim(),
      };

      switch (incoming.merge) {
        case 'replace': {
          blocks.splice(0, blocks.length);
          blocks.push(newBlock);
          operations.push({
            type: 'modify',
            target: 'hooks',
            content: incoming.content,
            position: 'replace',
            marker: sourceMarker,
          });
          break;
        }
        case 'prepend':
        case 'append': {
          const existingIdx = blocks.findIndex(b => b.source === sourceMarker);
          if (existingIdx !== -1) {
            // Update existing block from the same skill
            blocks[existingIdx] = newBlock;
          } else {
            const insertIdx = this.findInsertIndex(blocks, incoming.priority);
            blocks.splice(insertIdx, 0, newBlock);
          }
          operations.push({
            type: 'insert',
            target: 'hooks',
            content: incoming.content,
            position: incoming.merge === 'prepend' ? 'before' : 'after',
            marker: sourceMarker,
          });
          break;
        }
      }
    }

    // Sort by priority (lower = first)
    blocks.sort((a, b) => a.priority - b.priority);

    const content = this.serializeBlocks(blocks);

    const rollback: RollbackPlan = {
      operations: [
        {
          type: existingHook ? 'restore' : 'remove-file',
          target: 'hooks',
          originalContent: existingHook ?? undefined,
        },
      ],
    };

    return { content, operations, rollback };
  }

  /**
   * Parse an existing hook script into blocks.
   *
   * Marked blocks use the format:
   *   # --- claude-adapt:skill:name (priority: N) ---
   *   ...content...
   *   # --- end:claude-adapt:skill:name ---
   *
   * Unmarked content becomes a "core" block at priority 50.
   */
  parseBlocks(content: string): HookBlock[] {
    const lines = content.split('\n');
    const blocks: HookBlock[] = [];
    let currentBlock: HookBlock | null = null;
    const unmarkedLines: string[] = [];

    for (const line of lines) {
      const startMatch = line.match(BLOCK_START_RE);
      const endMatch = line.match(BLOCK_END_RE);

      if (startMatch) {
        // Flush any accumulated unmarked lines
        this.flushUnmarked(unmarkedLines, blocks);

        currentBlock = {
          source: startMatch[1],
          priority: parseInt(startMatch[2], 10),
          content: '',
        };
        continue;
      }

      if (endMatch && currentBlock) {
        currentBlock.content = currentBlock.content.trim();
        blocks.push(currentBlock);
        currentBlock = null;
        continue;
      }

      if (currentBlock) {
        currentBlock.content += (currentBlock.content ? '\n' : '') + line;
      } else {
        unmarkedLines.push(line);
      }
    }

    // Flush remaining unmarked lines
    this.flushUnmarked(unmarkedLines, blocks);

    return blocks;
  }

  /**
   * Serialize blocks into a complete hook script with markers.
   */
  serializeBlocks(blocks: HookBlock[]): string {
    const lines: string[] = [
      '#!/bin/bash',
      '# Generated by claude-adapt',
      '',
      'set -e',
      '',
    ];

    for (const block of blocks) {
      lines.push(
        `# --- claude-adapt:${block.source} (priority: ${block.priority}) ---`,
      );
      lines.push(block.content);
      lines.push(
        `# --- end:claude-adapt:${block.source} ---`,
      );
      lines.push('');
    }

    return lines.join('\n');
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  /**
   * Find the insertion index for a block with the given priority,
   * maintaining sorted order.
   */
  private findInsertIndex(blocks: HookBlock[], priority: number): number {
    for (let i = 0; i < blocks.length; i++) {
      if (blocks[i].priority > priority) return i;
    }
    return blocks.length;
  }

  /**
   * Flush accumulated unmarked lines as a "core" block if non-trivial.
   */
  private flushUnmarked(lines: string[], blocks: HookBlock[]): void {
    // Filter out shebang, generated-by comment, set -e, and blank lines
    const meaningful = lines.filter(
      l =>
        l.trim() !== '' &&
        !l.startsWith('#!/') &&
        !l.startsWith('# Generated by') &&
        l.trim() !== 'set -e',
    );

    if (meaningful.length > 0) {
      blocks.push({
        source: 'core',
        priority: 50,
        content: meaningful.join('\n').trim(),
      });
    }

    lines.length = 0;
  }
}
