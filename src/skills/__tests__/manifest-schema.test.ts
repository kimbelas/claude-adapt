import { describe, it, expect } from 'vitest';

import { validateManifest } from '../manifest-schema.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function minimalManifest(): Record<string, unknown> {
  return {
    name: 'claude-skill-test',
    displayName: 'Test Skill',
    version: '1.0.0',
    description: 'A test skill.',
    author: 'tester',
    license: 'MIT',
    claudeAdaptVersion: '>=0.1.0',
    tags: ['test'],
    provides: {},
  };
}

function fullManifest(): Record<string, unknown> {
  return {
    name: 'claude-skill-full',
    displayName: 'Full Skill',
    version: '2.3.1',
    description: 'A fully-featured skill.',
    author: 'tester',
    license: 'MIT',
    claudeAdaptVersion: '>=0.1.0',
    repository: 'https://github.com/test/full-skill',
    icon: 'rocket',
    tags: ['full', 'test'],
    conflicts: ['claude-skill-rival'],
    requires: {
      languages: ['typescript'],
      frameworks: ['nextjs'],
      tools: ['eslint'],
      skills: ['claude-skill-base'],
    },
    provides: {
      claudeMd: {
        sections: [
          {
            id: 'conventions',
            title: 'Conventions',
            content: 'Follow these conventions.',
            placement: { position: 'bottom' },
          },
        ],
        priority: 30,
      },
      commands: [
        {
          name: '/deploy',
          file: 'commands/deploy.md',
          description: 'Deploy the app',
        },
      ],
      hooks: [
        {
          event: 'pre-commit',
          file: 'hooks/pre-commit.sh',
          priority: 10,
          merge: 'append',
        },
      ],
      mcp: [
        {
          name: 'my-mcp',
          server: { command: 'node', args: ['mcp.js'] },
          reason: 'Needed for X',
          optional: false,
        },
      ],
      analyzers: [
        {
          category: 'conventions',
          signals: [{ id: 'my-signal', file: 'analyzers/sig.ts' }],
        },
      ],
      settings: { behavior: { autoFix: true } },
    },
    autoActivate: {
      when: [
        { type: 'language', value: 'typescript' },
        { type: 'file', value: 'tsconfig.json', operator: 'exists' },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('validateManifest', () => {
  describe('valid manifests', () => {
    it('passes a minimal manifest with only required fields', () => {
      const result = validateManifest(minimalManifest());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('passes a full manifest with all provides sections', () => {
      const result = validateManifest(fullManifest());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('top-level validation', () => {
    it('rejects null input', () => {
      const result = validateManifest(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Manifest must be a non-null JSON object');
    });

    it('rejects undefined input', () => {
      const result = validateManifest(undefined);
      expect(result.valid).toBe(false);
    });

    it('rejects array input', () => {
      const result = validateManifest([]);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Manifest must be a non-null JSON object');
    });

    it('rejects a primitive', () => {
      const result = validateManifest('not-an-object');
      expect(result.valid).toBe(false);
    });
  });

  describe('required string fields', () => {
    const requiredFields = [
      'name',
      'displayName',
      'version',
      'description',
      'author',
      'license',
      'claudeAdaptVersion',
    ];

    for (const field of requiredFields) {
      it(`fails when "${field}" is missing`, () => {
        const manifest = minimalManifest();
        delete manifest[field];
        const result = validateManifest(manifest);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes(`"${field}"`))).toBe(true);
      });

      it(`fails when "${field}" is a number instead of a string`, () => {
        const manifest = minimalManifest();
        manifest[field] = 42;
        const result = validateManifest(manifest);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes(`"${field}"`) && e.includes('string'))).toBe(true);
      });

      it(`fails when "${field}" is an empty string`, () => {
        const manifest = minimalManifest();
        manifest[field] = '   ';
        const result = validateManifest(manifest);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes(`"${field}"`) && e.includes('empty'))).toBe(true);
      });
    }
  });

  describe('version format', () => {
    it('fails when version is not semver', () => {
      const manifest = minimalManifest();
      manifest['version'] = 'latest';
      const result = validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('semver'))).toBe(true);
    });

    it('passes a valid semver version', () => {
      const manifest = minimalManifest();
      manifest['version'] = '0.1.0';
      const result = validateManifest(manifest);
      expect(result.valid).toBe(true);
    });
  });

  describe('tags field', () => {
    it('fails when tags is missing', () => {
      const manifest = minimalManifest();
      delete manifest['tags'];
      const result = validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('"tags"'))).toBe(true);
    });

    it('fails when tags is not an array', () => {
      const manifest = minimalManifest();
      manifest['tags'] = 'not-array';
      const result = validateManifest(manifest);
      expect(result.valid).toBe(false);
    });

    it('fails when a tag entry is not a string', () => {
      const manifest = minimalManifest();
      manifest['tags'] = [123];
      const result = validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('tags[0]'))).toBe(true);
    });
  });

  describe('provides field', () => {
    it('fails when provides is missing', () => {
      const manifest = minimalManifest();
      delete manifest['provides'];
      const result = validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('"provides"'))).toBe(true);
    });

    it('fails when provides is not an object', () => {
      const manifest = minimalManifest();
      manifest['provides'] = 'not-object';
      const result = validateManifest(manifest);
      expect(result.valid).toBe(false);
    });
  });

  describe('provides.claudeMd validation', () => {
    it('fails when claudeMd is not an object', () => {
      const manifest = minimalManifest();
      manifest['provides'] = { claudeMd: 'bad' };
      const result = validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('provides.claudeMd'))).toBe(true);
    });

    it('fails when sections is not an array', () => {
      const manifest = minimalManifest();
      manifest['provides'] = { claudeMd: { sections: 'bad' } };
      const result = validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('sections'))).toBe(true);
    });

    it('fails when a section is missing required fields', () => {
      const manifest = minimalManifest();
      manifest['provides'] = {
        claudeMd: {
          sections: [{ id: 'x' }], // missing title, content, placement
        },
      };
      const result = validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });

    it('fails when placement.position is an invalid value', () => {
      const manifest = minimalManifest();
      manifest['provides'] = {
        claudeMd: {
          sections: [
            {
              id: 'x',
              title: 'X',
              content: 'Content',
              placement: { position: 'middle' },
            },
          ],
        },
      };
      const result = validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('position'))).toBe(true);
    });

    it('fails when priority is not a number', () => {
      const manifest = minimalManifest();
      manifest['provides'] = {
        claudeMd: {
          sections: [],
          priority: 'high',
        },
      };
      const result = validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('priority'))).toBe(true);
    });
  });

  describe('provides.hooks validation', () => {
    it('fails when hooks is not an array', () => {
      const manifest = minimalManifest();
      manifest['provides'] = { hooks: {} };
      const result = validateManifest(manifest);
      expect(result.valid).toBe(false);
    });

    it('fails when hook has an invalid event name', () => {
      const manifest = minimalManifest();
      manifest['provides'] = {
        hooks: [
          { event: 'on-save', file: 'h.sh', priority: 10, merge: 'append' },
        ],
      };
      const result = validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('event'))).toBe(true);
    });

    it('fails when hook priority is not a number', () => {
      const manifest = minimalManifest();
      manifest['provides'] = {
        hooks: [
          { event: 'pre-commit', file: 'h.sh', priority: 'low', merge: 'append' },
        ],
      };
      const result = validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('priority'))).toBe(true);
    });

    it('fails when hook merge is an invalid value', () => {
      const manifest = minimalManifest();
      manifest['provides'] = {
        hooks: [
          { event: 'pre-commit', file: 'h.sh', priority: 10, merge: 'overwrite' },
        ],
      };
      const result = validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('merge'))).toBe(true);
    });
  });

  describe('provides.mcp validation', () => {
    it('fails when mcp server entry is missing server.command', () => {
      const manifest = minimalManifest();
      manifest['provides'] = {
        mcp: [
          {
            name: 'srv',
            reason: 'need it',
            optional: false,
            server: { args: [] },
          },
        ],
      };
      const result = validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('server.command'))).toBe(true);
    });

    it('fails when mcp optional is not a boolean', () => {
      const manifest = minimalManifest();
      manifest['provides'] = {
        mcp: [
          {
            name: 'srv',
            reason: 'need it',
            optional: 'yes',
            server: { command: 'node', args: [] },
          },
        ],
      };
      const result = validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('optional'))).toBe(true);
    });
  });

  describe('provides.commands validation', () => {
    it('fails when command entry is missing required fields', () => {
      const manifest = minimalManifest();
      manifest['provides'] = {
        commands: [{ name: '/test' }],
      };
      const result = validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('file'))).toBe(true);
      expect(result.errors.some(e => e.includes('description'))).toBe(true);
    });
  });

  describe('autoActivate validation', () => {
    it('fails when autoActivate is not an object', () => {
      const manifest = minimalManifest();
      manifest['autoActivate'] = 'always';
      const result = validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('autoActivate'))).toBe(true);
    });

    it('fails when autoActivate.when condition has invalid type', () => {
      const manifest = minimalManifest();
      manifest['autoActivate'] = {
        when: [{ type: 'magic', value: 'wand' }],
      };
      const result = validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('type'))).toBe(true);
    });

    it('fails when autoActivate.when condition has invalid operator', () => {
      const manifest = minimalManifest();
      manifest['autoActivate'] = {
        when: [{ type: 'file', value: 'x.json', operator: 'contains' }],
      };
      const result = validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('operator'))).toBe(true);
    });
  });

  describe('optional fields', () => {
    it('passes when repository is a string', () => {
      const manifest = minimalManifest();
      manifest['repository'] = 'https://github.com/test';
      const result = validateManifest(manifest);
      expect(result.valid).toBe(true);
    });

    it('fails when repository is a number', () => {
      const manifest = minimalManifest();
      manifest['repository'] = 42;
      const result = validateManifest(manifest);
      expect(result.valid).toBe(false);
    });

    it('passes when conflicts is a valid string array', () => {
      const manifest = minimalManifest();
      manifest['conflicts'] = ['skill-a', 'skill-b'];
      const result = validateManifest(manifest);
      expect(result.valid).toBe(true);
    });

    it('fails when conflicts contains a non-string', () => {
      const manifest = minimalManifest();
      manifest['conflicts'] = [123];
      const result = validateManifest(manifest);
      expect(result.valid).toBe(false);
    });
  });

  describe('requires validation', () => {
    it('fails when requires is not an object', () => {
      const manifest = minimalManifest();
      manifest['requires'] = 'bad';
      const result = validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('"requires"'))).toBe(true);
    });

    it('passes when requires has valid optional arrays', () => {
      const manifest = minimalManifest();
      manifest['requires'] = {
        languages: ['typescript'],
        frameworks: ['react'],
      };
      const result = validateManifest(manifest);
      expect(result.valid).toBe(true);
    });
  });
});
