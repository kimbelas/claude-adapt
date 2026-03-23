import { describe, it, expect, beforeEach } from 'vitest';

import { McpMerger } from '../mcp-merger.js';
import type { McpConfig } from '../mcp-merger.js';
import type { SkillMcp } from '../../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyConfig(): McpConfig {
  return { mcpServers: {}, recommended: [] };
}

function configWithServers(): McpConfig {
  return {
    mcpServers: {
      'existing-server': {
        command: 'node',
        args: ['server.js'],
        _source: 'skill:base-skill',
      },
    },
    recommended: [
      { name: 'optional-srv', reason: 'Useful for dev', _source: 'skill:base-skill' },
    ],
  };
}

function requiredMcp(overrides: Partial<SkillMcp> = {}): SkillMcp {
  return {
    name: 'new-server',
    server: { command: 'npx', args: ['mcp-serve'] },
    reason: 'Required for the skill',
    optional: false,
    ...overrides,
  };
}

function optionalMcp(overrides: Partial<SkillMcp> = {}): SkillMcp {
  return {
    name: 'opt-server',
    server: { command: 'npx', args: ['mcp-optional'] },
    reason: 'Nice to have',
    optional: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('McpMerger', () => {
  let merger: McpMerger;

  beforeEach(() => {
    merger = new McpMerger();
  });

  describe('merging into empty config', () => {
    it('adds a required server to mcpServers', () => {
      const result = merger.merge(emptyConfig(), [requiredMcp()], 'my-skill');

      expect(result.config.mcpServers['new-server']).toBeDefined();
      expect(result.config.mcpServers['new-server'].command).toBe('npx');
      expect(result.config.mcpServers['new-server'].args).toEqual(['mcp-serve']);
      expect(result.config.mcpServers['new-server']._source).toBe('skill:my-skill');
    });

    it('adds an optional server to recommended list', () => {
      const result = merger.merge(emptyConfig(), [optionalMcp()], 'my-skill');

      expect(result.config.recommended).toHaveLength(1);
      expect(result.config.recommended[0].name).toBe('opt-server');
      expect(result.config.recommended[0].reason).toBe('Nice to have');
      expect(result.config.recommended[0]._source).toBe('skill:my-skill');
      // Should NOT be in mcpServers
      expect(result.config.mcpServers['opt-server']).toBeUndefined();
    });

    it('records create operation for required server', () => {
      const result = merger.merge(emptyConfig(), [requiredMcp()], 'my-skill');

      expect(result.operations).toHaveLength(1);
      expect(result.operations[0].type).toBe('create');
      expect(result.operations[0].target).toBe('mcp.json');
      expect(result.operations[0].marker).toBe('skill:my-skill');
    });

    it('records append operation for optional server', () => {
      const result = merger.merge(emptyConfig(), [optionalMcp()], 'my-skill');

      expect(result.operations).toHaveLength(1);
      expect(result.operations[0].type).toBe('append');
    });
  });

  describe('merging into existing config', () => {
    it('preserves existing servers when adding new ones', () => {
      const result = merger.merge(
        configWithServers(),
        [requiredMcp({ name: 'another-server' })],
        'new-skill',
      );

      expect(result.config.mcpServers['existing-server']).toBeDefined();
      expect(result.config.mcpServers['another-server']).toBeDefined();
    });

    it('preserves existing recommended entries when adding new ones', () => {
      const result = merger.merge(
        configWithServers(),
        [optionalMcp({ name: 'new-opt' })],
        'new-skill',
      );

      expect(result.config.recommended).toHaveLength(2);
      expect(result.config.recommended.some(r => r.name === 'optional-srv')).toBe(true);
      expect(result.config.recommended.some(r => r.name === 'new-opt')).toBe(true);
    });
  });

  describe('handling required vs optional servers', () => {
    it('required servers go to mcpServers, optional to recommended', () => {
      const incoming: SkillMcp[] = [
        requiredMcp({ name: 'required-one' }),
        optionalMcp({ name: 'optional-one' }),
      ];

      const result = merger.merge(emptyConfig(), incoming, 'mixed-skill');

      expect(result.config.mcpServers['required-one']).toBeDefined();
      expect(result.config.mcpServers['optional-one']).toBeUndefined();
      expect(result.config.recommended.some(r => r.name === 'optional-one')).toBe(true);
    });

    it('includes env in required server when provided', () => {
      const mcp = requiredMcp({
        name: 'env-server',
        server: {
          command: 'node',
          args: ['serve.js'],
          env: { API_KEY: 'secret' },
        },
      });

      const result = merger.merge(emptyConfig(), [mcp], 'env-skill');

      expect(result.config.mcpServers['env-server'].env).toEqual({ API_KEY: 'secret' });
    });

    it('omits env when not provided', () => {
      const mcp = requiredMcp({ name: 'no-env' });

      const result = merger.merge(emptyConfig(), [mcp], 'no-env-skill');

      expect(result.config.mcpServers['no-env'].env).toBeUndefined();
    });
  });

  describe('conflict detection for duplicate server names', () => {
    it('reports a conflict when server name exists from a different source', () => {
      const result = merger.merge(
        configWithServers(), // has 'existing-server' from skill:base-skill
        [requiredMcp({ name: 'existing-server' })],
        'conflict-skill',
      );

      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].type).toBe('mcp');
      expect(result.conflicts[0].id).toBe('existing-server');
      expect(result.conflicts[0].existingSource).toBe('skill:base-skill');
      expect(result.conflicts[0].incomingSource).toBe('skill:conflict-skill');
    });

    it('does not add the server when there is a conflict', () => {
      const existing = configWithServers();
      const result = merger.merge(
        existing,
        [requiredMcp({ name: 'existing-server' })],
        'conflict-skill',
      );

      // Server should still belong to the original source
      expect(result.config.mcpServers['existing-server']._source).toBe('skill:base-skill');
    });

    it('allows re-merge of the same server from the same skill', () => {
      const result = merger.merge(
        configWithServers(),
        [requiredMcp({ name: 'existing-server', server: { command: 'bun', args: ['run'] } })],
        'base-skill', // same skill as existing
      );

      expect(result.conflicts).toHaveLength(0);
      expect(result.config.mcpServers['existing-server'].command).toBe('bun');
    });

    it('detects conflict with manual (no _source) servers', () => {
      const config: McpConfig = {
        mcpServers: {
          'manual-server': { command: 'node', args: ['m.js'] },
        },
        recommended: [],
      };

      const result = merger.merge(
        config,
        [requiredMcp({ name: 'manual-server' })],
        'intruder',
      );

      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].existingSource).toBe('manual');
    });
  });

  describe('avoiding duplicate recommended entries', () => {
    it('does not add duplicate recommended from same source', () => {
      const config = configWithServers();
      // config already has optional-srv from skill:base-skill

      const result = merger.merge(
        config,
        [optionalMcp({ name: 'optional-srv' })],
        'base-skill',
      );

      const matching = result.config.recommended.filter(
        r => r.name === 'optional-srv' && r._source === 'skill:base-skill',
      );
      expect(matching).toHaveLength(1);
    });
  });

  describe('clean removal', () => {
    it('removes all servers contributed by a skill', () => {
      const config = configWithServers();
      const cleaned = merger.remove(config, 'base-skill');

      expect(cleaned.mcpServers['existing-server']).toBeUndefined();
      expect(cleaned.recommended).toHaveLength(0);
    });

    it('preserves servers from other skills', () => {
      const config: McpConfig = {
        mcpServers: {
          'a-server': { command: 'a', args: [], _source: 'skill:skill-a' },
          'b-server': { command: 'b', args: [], _source: 'skill:skill-b' },
        },
        recommended: [
          { name: 'opt-a', reason: 'A', _source: 'skill:skill-a' },
          { name: 'opt-b', reason: 'B', _source: 'skill:skill-b' },
        ],
      };

      const cleaned = merger.remove(config, 'skill-a');

      expect(cleaned.mcpServers['a-server']).toBeUndefined();
      expect(cleaned.mcpServers['b-server']).toBeDefined();
      expect(cleaned.recommended).toHaveLength(1);
      expect(cleaned.recommended[0].name).toBe('opt-b');
    });

    it('does not mutate the original config', () => {
      const config = configWithServers();
      const configCopy = structuredClone(config);

      merger.remove(config, 'base-skill');

      expect(config).toEqual(configCopy);
    });

    it('returns unchanged config when skill has no servers', () => {
      const config = configWithServers();
      const cleaned = merger.remove(config, 'nonexistent-skill');

      expect(Object.keys(cleaned.mcpServers)).toHaveLength(1);
      expect(cleaned.recommended).toHaveLength(1);
    });
  });

  describe('rollback plan', () => {
    it('includes restore operation with original config content', () => {
      const existing = configWithServers();
      const result = merger.merge(existing, [requiredMcp()], 'test-skill');

      expect(result.rollback.operations).toHaveLength(1);
      expect(result.rollback.operations[0].type).toBe('restore');
      expect(result.rollback.operations[0].target).toBe('mcp.json');
      expect(result.rollback.operations[0].originalContent).toBe(
        JSON.stringify(existing, null, 2),
      );
    });
  });

  describe('immutability', () => {
    it('does not mutate the original config on merge', () => {
      const existing = configWithServers();
      const existingCopy = structuredClone(existing);

      merger.merge(existing, [requiredMcp()], 'immut-skill');

      expect(existing).toEqual(existingCopy);
    });
  });

  describe('multiple MCP entries in one merge', () => {
    it('processes all incoming entries', () => {
      const incoming: SkillMcp[] = [
        requiredMcp({ name: 'srv-1' }),
        requiredMcp({ name: 'srv-2' }),
        optionalMcp({ name: 'srv-3' }),
      ];

      const result = merger.merge(emptyConfig(), incoming, 'multi-skill');

      expect(Object.keys(result.config.mcpServers)).toHaveLength(2);
      expect(result.config.recommended).toHaveLength(1);
      expect(result.operations).toHaveLength(3);
      expect(result.conflicts).toHaveLength(0);
    });
  });
});
