/**
 * Settings merger with ADDITIVE-ONLY security model.
 *
 * Skills can add to both allowed and denied lists, but can NEVER
 * remove items from denied lists. If a skill attempts to allow
 * something that is denied, the denied entry wins.
 */

import type { Conflict, MergeOperation, RollbackPlan } from '../types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClaudeSettings {
  permissions: {
    allowedTools: string[];
    allowedCommands: string[];
    deniedTools: string[];
    deniedCommands: string[];
  };
  behavior: Record<string, unknown>;
  _sources?: Record<string, { addedAt: string }>;
}

export interface SettingsMergeResult {
  settings: ClaudeSettings;
  operations: MergeOperation[];
  conflicts: Conflict[];
  rollback: RollbackPlan;
}

// ---------------------------------------------------------------------------
// Security violation
// ---------------------------------------------------------------------------

export class SecurityViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityViolation';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// SettingsMerger
// ---------------------------------------------------------------------------

export class SettingsMerger {
  merge(
    existing: ClaudeSettings,
    incoming: Partial<ClaudeSettings>,
    skillName: string,
  ): SettingsMergeResult {
    const merged = structuredClone(existing);
    const operations: MergeOperation[] = [];
    const conflicts: Conflict[] = [];
    const sourceMarker = `skill:${skillName}`;

    // -- ALLOWED lists: union (skills can ADD capabilities) -----------------
    if (incoming.permissions?.allowedTools) {
      const added = this.unionArray(
        merged.permissions.allowedTools,
        incoming.permissions.allowedTools,
      );
      if (added.length > 0) {
        operations.push({
          type: 'modify',
          target: 'settings.json',
          content: JSON.stringify(added),
          marker: sourceMarker,
        });
      }
    }

    if (incoming.permissions?.allowedCommands) {
      const added = this.unionArray(
        merged.permissions.allowedCommands,
        incoming.permissions.allowedCommands,
      );
      if (added.length > 0) {
        operations.push({
          type: 'modify',
          target: 'settings.json',
          content: JSON.stringify(added),
          marker: sourceMarker,
        });
      }
    }

    // -- DENIED lists: union (skills can ADD restrictions, NEVER remove) ----
    if (incoming.permissions?.deniedTools) {
      this.unionArray(
        merged.permissions.deniedTools,
        incoming.permissions.deniedTools,
      );
    }

    if (incoming.permissions?.deniedCommands) {
      this.unionArray(
        merged.permissions.deniedCommands,
        incoming.permissions.deniedCommands,
      );
    }

    // -- SAFETY INVARIANT: verify no denied item was removed ----------------
    for (const denied of existing.permissions.deniedTools) {
      if (!merged.permissions.deniedTools.includes(denied)) {
        throw new SecurityViolation(
          `Skill "${skillName}" attempted to remove denied tool: ${denied}`,
        );
      }
    }
    for (const denied of existing.permissions.deniedCommands) {
      if (!merged.permissions.deniedCommands.includes(denied)) {
        throw new SecurityViolation(
          `Skill "${skillName}" attempted to remove denied command: ${denied}`,
        );
      }
    }

    // -- CONFLICT: if skill allows something that's denied, denied wins -----
    const toolConflicts = this.detectAllowDenyConflicts(
      merged.permissions.allowedTools,
      merged.permissions.deniedTools,
      'tool',
      skillName,
    );
    const cmdConflicts = this.detectAllowDenyConflicts(
      merged.permissions.allowedCommands,
      merged.permissions.deniedCommands,
      'command',
      skillName,
    );

    conflicts.push(...toolConflicts, ...cmdConflicts);

    // Remove conflicted items from allowed lists (denied wins)
    for (const conflict of toolConflicts) {
      const idx = merged.permissions.allowedTools.indexOf(conflict.id);
      if (idx !== -1) merged.permissions.allowedTools.splice(idx, 1);
    }
    for (const conflict of cmdConflicts) {
      const idx = merged.permissions.allowedCommands.indexOf(conflict.id);
      if (idx !== -1) merged.permissions.allowedCommands.splice(idx, 1);
    }

    // -- Behavior: last-write-wins with source tracking ---------------------
    if (incoming.behavior) {
      Object.assign(merged.behavior, incoming.behavior);
    }

    // -- Source tracking ----------------------------------------------------
    if (!merged._sources) merged._sources = {};
    merged._sources[skillName] = { addedAt: new Date().toISOString() };

    const rollback: RollbackPlan = {
      operations: [
        {
          type: 'restore',
          target: 'settings.json',
          originalContent: JSON.stringify(existing, null, 2),
        },
      ],
    };

    return { settings: merged, operations, conflicts, rollback };
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  /**
   * Union two arrays, adding only items not already present.
   * Mutates `target` and returns the list of newly added items.
   */
  private unionArray(target: string[], incoming: string[]): string[] {
    const added: string[] = [];
    for (const item of incoming) {
      if (!target.includes(item)) {
        target.push(item);
        added.push(item);
      }
    }
    return added;
  }

  /**
   * Detect items that appear in both allowed and denied lists.
   * Returns conflicts; the caller is responsible for resolution.
   */
  private detectAllowDenyConflicts(
    allowed: string[],
    denied: string[],
    kind: string,
    skillName: string,
  ): Conflict[] {
    const deniedSet = new Set(denied);
    const conflicts: Conflict[] = [];

    for (const item of allowed) {
      if (deniedSet.has(item)) {
        conflicts.push({
          type: 'settings',
          id: item,
          existingSource: 'denied-list',
          incomingSource: `skill:${skillName}`,
          message:
            `${kind} "${item}" is both allowed and denied. ` +
            `Denied wins (security invariant).`,
        });
      }
    }

    return conflicts;
  }
}
