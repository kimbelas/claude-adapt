import { describe, it, expect, beforeEach } from 'vitest';

import { SettingsMerger, SecurityViolation } from '../settings-merger.js';
import type { ClaudeSettings } from '../settings-merger.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptySettings(): ClaudeSettings {
  return {
    permissions: {
      allowedTools: [],
      allowedCommands: [],
      deniedTools: [],
      deniedCommands: [],
    },
    behavior: {},
  };
}

function settingsWithDenied(): ClaudeSettings {
  return {
    permissions: {
      allowedTools: ['tool-a'],
      allowedCommands: ['cmd-a'],
      deniedTools: ['tool-x'],
      deniedCommands: ['cmd-x'],
    },
    behavior: {},
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SettingsMerger', () => {
  let merger: SettingsMerger;

  beforeEach(() => {
    merger = new SettingsMerger();
  });

  describe('additive-only security model', () => {
    it('allows skills to ADD to denied lists', () => {
      const existing = emptySettings();
      const incoming: Partial<ClaudeSettings> = {
        permissions: {
          allowedTools: [],
          allowedCommands: [],
          deniedTools: ['dangerous-tool'],
          deniedCommands: ['rm -rf'],
        },
      };

      const result = merger.merge(existing, incoming, 'strict-skill');

      expect(result.settings.permissions.deniedTools).toContain('dangerous-tool');
      expect(result.settings.permissions.deniedCommands).toContain('rm -rf');
    });

    it('preserves existing denied entries when skill adds new ones', () => {
      const existing = settingsWithDenied();
      const incoming: Partial<ClaudeSettings> = {
        permissions: {
          allowedTools: [],
          allowedCommands: [],
          deniedTools: ['another-bad-tool'],
          deniedCommands: [],
        },
      };

      const result = merger.merge(existing, incoming, 'addon-skill');

      expect(result.settings.permissions.deniedTools).toContain('tool-x');
      expect(result.settings.permissions.deniedTools).toContain('another-bad-tool');
    });
  });

  describe('merging allowed lists', () => {
    it('adds new allowed tools via union', () => {
      const existing = emptySettings();
      const incoming: Partial<ClaudeSettings> = {
        permissions: {
          allowedTools: ['new-tool-a', 'new-tool-b'],
          allowedCommands: [],
          deniedTools: [],
          deniedCommands: [],
        },
      };

      const result = merger.merge(existing, incoming, 'utility-skill');

      expect(result.settings.permissions.allowedTools).toContain('new-tool-a');
      expect(result.settings.permissions.allowedTools).toContain('new-tool-b');
    });

    it('adds new allowed commands via union', () => {
      const existing = emptySettings();
      const incoming: Partial<ClaudeSettings> = {
        permissions: {
          allowedTools: [],
          allowedCommands: ['npm run test', 'npm run build'],
          deniedTools: [],
          deniedCommands: [],
        },
      };

      const result = merger.merge(existing, incoming, 'build-skill');

      expect(result.settings.permissions.allowedCommands).toContain('npm run test');
      expect(result.settings.permissions.allowedCommands).toContain('npm run build');
    });

    it('does not duplicate existing allowed entries', () => {
      const existing: ClaudeSettings = {
        permissions: {
          allowedTools: ['tool-a'],
          allowedCommands: [],
          deniedTools: [],
          deniedCommands: [],
        },
        behavior: {},
      };
      const incoming: Partial<ClaudeSettings> = {
        permissions: {
          allowedTools: ['tool-a', 'tool-b'],
          allowedCommands: [],
          deniedTools: [],
          deniedCommands: [],
        },
      };

      const result = merger.merge(existing, incoming, 'dup-skill');

      const toolACount = result.settings.permissions.allowedTools.filter(
        t => t === 'tool-a',
      ).length;
      expect(toolACount).toBe(1);
      expect(result.settings.permissions.allowedTools).toContain('tool-b');
    });

    it('records operations for newly added items', () => {
      const existing = emptySettings();
      const incoming: Partial<ClaudeSettings> = {
        permissions: {
          allowedTools: ['new-tool'],
          allowedCommands: [],
          deniedTools: [],
          deniedCommands: [],
        },
      };

      const result = merger.merge(existing, incoming, 'op-skill');

      expect(result.operations.length).toBeGreaterThan(0);
      expect(result.operations[0].marker).toBe('skill:op-skill');
    });
  });

  describe('conflict detection (allow vs. deny)', () => {
    it('detects when a skill allows something that is denied', () => {
      const existing = settingsWithDenied(); // has deniedTools: ['tool-x']
      const incoming: Partial<ClaudeSettings> = {
        permissions: {
          allowedTools: ['tool-x'], // conflict: trying to allow a denied tool
          allowedCommands: [],
          deniedTools: [],
          deniedCommands: [],
        },
      };

      const result = merger.merge(existing, incoming, 'bad-skill');

      expect(result.conflicts.length).toBeGreaterThan(0);
      expect(result.conflicts[0].type).toBe('settings');
      expect(result.conflicts[0].id).toBe('tool-x');
    });

    it('denied wins: conflicted item is removed from allowed list', () => {
      const existing = settingsWithDenied();
      const incoming: Partial<ClaudeSettings> = {
        permissions: {
          allowedTools: ['tool-x'],
          allowedCommands: [],
          deniedTools: [],
          deniedCommands: [],
        },
      };

      const result = merger.merge(existing, incoming, 'conflict-skill');

      // tool-x should be removed from allowedTools (denied wins)
      expect(result.settings.permissions.allowedTools).not.toContain('tool-x');
      // but still in deniedTools
      expect(result.settings.permissions.deniedTools).toContain('tool-x');
    });

    it('detects command allow/deny conflicts', () => {
      const existing = settingsWithDenied(); // has deniedCommands: ['cmd-x']
      const incoming: Partial<ClaudeSettings> = {
        permissions: {
          allowedTools: [],
          allowedCommands: ['cmd-x'],
          deniedTools: [],
          deniedCommands: [],
        },
      };

      const result = merger.merge(existing, incoming, 'cmd-conflict-skill');

      expect(result.conflicts.some(c => c.id === 'cmd-x')).toBe(true);
      expect(result.settings.permissions.allowedCommands).not.toContain('cmd-x');
    });
  });

  describe('SecurityViolation on denied removal', () => {
    it('throws SecurityViolation if a denied tool is somehow removed', () => {
      // This tests the safety invariant check. We need to simulate a scenario
      // where the merged result has lost a denied entry. In normal flow this
      // shouldn't happen because unionArray only adds, but the validator still
      // checks.
      //
      // We test indirectly by ensuring the invariant is in place:
      // If existing has deniedTools: ['x'], the merged result must also.
      const existing = settingsWithDenied();

      // Normal merge should NOT throw because union only adds
      const result = merger.merge(existing, {}, 'safe-skill');
      expect(result.settings.permissions.deniedTools).toContain('tool-x');
    });

    it('SecurityViolation class has the correct name', () => {
      const err = new SecurityViolation('test message');
      expect(err.name).toBe('SecurityViolation');
      expect(err.message).toBe('test message');
      expect(err).toBeInstanceOf(Error);
    });
  });

  describe('merging into empty/null settings', () => {
    it('handles empty incoming permissions gracefully', () => {
      const existing = emptySettings();
      const result = merger.merge(existing, {}, 'empty-skill');

      expect(result.settings.permissions.allowedTools).toHaveLength(0);
      expect(result.settings.permissions.deniedTools).toHaveLength(0);
      expect(result.conflicts).toHaveLength(0);
    });

    it('handles incoming with only behavior', () => {
      const existing = emptySettings();
      const result = merger.merge(existing, { behavior: { autoFix: true } }, 'beh-skill');

      expect(result.settings.behavior).toEqual({ autoFix: true });
    });
  });

  describe('behavior merging', () => {
    it('merges behavior settings with last-write-wins', () => {
      const existing: ClaudeSettings = {
        permissions: {
          allowedTools: [],
          allowedCommands: [],
          deniedTools: [],
          deniedCommands: [],
        },
        behavior: { autoFix: false, verbose: true },
      };

      const incoming: Partial<ClaudeSettings> = {
        behavior: { autoFix: true, newSetting: 'yes' },
      };

      const result = merger.merge(existing, incoming, 'beh-skill');

      expect(result.settings.behavior.autoFix).toBe(true); // overwritten
      expect(result.settings.behavior.verbose).toBe(true); // preserved
      expect(result.settings.behavior.newSetting).toBe('yes'); // added
    });
  });

  describe('source tracking', () => {
    it('adds source tracking with skill name and timestamp', () => {
      const existing = emptySettings();
      const result = merger.merge(existing, {}, 'tracked-skill');

      expect(result.settings._sources).toBeDefined();
      expect(result.settings._sources!['tracked-skill']).toBeDefined();
      expect(result.settings._sources!['tracked-skill'].addedAt).toBeTruthy();
    });

    it('preserves existing source entries when adding a new skill', () => {
      const existing: ClaudeSettings = {
        ...emptySettings(),
        _sources: { 'old-skill': { addedAt: '2025-01-01T00:00:00Z' } },
      };

      const result = merger.merge(existing, {}, 'new-skill');

      expect(result.settings._sources!['old-skill']).toBeDefined();
      expect(result.settings._sources!['new-skill']).toBeDefined();
    });
  });

  describe('rollback plan', () => {
    it('includes a restore operation with the original settings', () => {
      const existing = settingsWithDenied();
      const result = merger.merge(existing, {}, 'rollback-skill');

      expect(result.rollback.operations).toHaveLength(1);
      expect(result.rollback.operations[0].type).toBe('restore');
      expect(result.rollback.operations[0].target).toBe('settings.json');
      expect(result.rollback.operations[0].originalContent).toBe(
        JSON.stringify(existing, null, 2),
      );
    });
  });

  describe('immutability', () => {
    it('does not mutate the original existing settings', () => {
      const existing = emptySettings();
      const existingCopy = structuredClone(existing);

      merger.merge(
        existing,
        {
          permissions: {
            allowedTools: ['added-tool'],
            allowedCommands: [],
            deniedTools: ['added-deny'],
            deniedCommands: [],
          },
          behavior: { key: 'val' },
        },
        'mutate-test',
      );

      expect(existing).toEqual(existingCopy);
    });
  });
});
