/**
 * MCP config merger for mcp.json.
 *
 * Handles source-tracked MCP server entries. Required servers are
 * added to mcpServers; optional ones go to the recommended list.
 * Clean removal is possible by filtering on the _source field.
 */

import type { Conflict, MergeOperation, RollbackPlan } from '../types.js';
import type { SkillMcp } from '../types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface McpServerEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
  /** Source tracking field for skill attribution. */
  _source?: string;
}

export interface McpRecommendation {
  name: string;
  reason: string;
  _source?: string;
}

export interface McpConfig {
  mcpServers: Record<string, McpServerEntry>;
  recommended: McpRecommendation[];
}

export interface McpMergeResult {
  config: McpConfig;
  operations: MergeOperation[];
  conflicts: Conflict[];
  rollback: RollbackPlan;
}

// ---------------------------------------------------------------------------
// McpMerger
// ---------------------------------------------------------------------------

export class McpMerger {
  /**
   * Merge incoming MCP entries from a skill into the existing config.
   *
   * Required servers go to mcpServers.
   * Optional servers go to the recommended list.
   * Name collisions from different sources are reported as conflicts.
   */
  merge(
    existing: McpConfig,
    incoming: SkillMcp[],
    skillName: string,
  ): McpMergeResult {
    const merged = structuredClone(existing);
    const operations: MergeOperation[] = [];
    const conflicts: Conflict[] = [];
    const sourceMarker = `skill:${skillName}`;

    for (const mcp of incoming) {
      // Check for name collision from a different source
      if (
        merged.mcpServers[mcp.name] &&
        merged.mcpServers[mcp.name]._source !== sourceMarker
      ) {
        conflicts.push({
          type: 'mcp',
          id: mcp.name,
          existingSource: merged.mcpServers[mcp.name]._source ?? 'manual',
          incomingSource: sourceMarker,
          message:
            `MCP server "${mcp.name}" already exists from a different source. ` +
            `Cannot overwrite.`,
        });
        continue;
      }

      if (mcp.optional) {
        // Add to recommended list (avoid duplicates)
        const alreadyRecommended = merged.recommended.some(
          r => r.name === mcp.name && r._source === sourceMarker,
        );

        if (!alreadyRecommended) {
          merged.recommended.push({
            name: mcp.name,
            reason: mcp.reason,
            _source: sourceMarker,
          });
        }

        operations.push({
          type: 'append',
          target: 'mcp.json',
          content: JSON.stringify({ name: mcp.name, reason: mcp.reason }),
          marker: sourceMarker,
        });
      } else {
        // Add as required server
        merged.mcpServers[mcp.name] = {
          command: mcp.server.command,
          args: mcp.server.args,
          ...(mcp.server.env ? { env: mcp.server.env } : {}),
          _source: sourceMarker,
        };

        operations.push({
          type: 'create',
          target: 'mcp.json',
          content: JSON.stringify(mcp.server),
          marker: sourceMarker,
        });
      }
    }

    const rollback: RollbackPlan = {
      operations: [
        {
          type: 'restore',
          target: 'mcp.json',
          originalContent: JSON.stringify(existing, null, 2),
        },
      ],
    };

    return { config: merged, operations, conflicts, rollback };
  }

  /**
   * Remove all MCP entries contributed by a skill.
   */
  remove(config: McpConfig, skillName: string): McpConfig {
    const cleaned = structuredClone(config);
    const sourceMarker = `skill:${skillName}`;

    // Remove from mcpServers
    for (const [name, entry] of Object.entries(cleaned.mcpServers)) {
      if (entry._source === sourceMarker) {
        delete cleaned.mcpServers[name];
      }
    }

    // Remove from recommended
    cleaned.recommended = cleaned.recommended.filter(
      r => r._source !== sourceMarker,
    );

    return cleaned;
  }
}
