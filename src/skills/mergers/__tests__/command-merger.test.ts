import { describe, it, expect, beforeEach } from 'vitest';

import { CommandMerger } from '../command-merger.js';
import type { CommandFile } from '../command-merger.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyCommands(): Map<string, CommandFile> {
  return new Map();
}

function commandsWithExisting(): Map<string, CommandFile> {
  const map = new Map<string, CommandFile>();
  map.set('/deploy', {
    path: '.claude/commands/deploy.md',
    content: '<!-- claude-adapt:source:skill:infra:command:/deploy -->\n# Deploy\nDeploy instructions.',
    source: 'skill:infra',
  });
  map.set('/lint', {
    path: '.claude/commands/lint.md',
    content: '# Lint\nRun linting.',
    source: 'manual',
  });
  return map;
}

function stubReadFile(contentMap: Record<string, string>): (path: string) => string {
  return (path: string) => {
    if (path in contentMap) return contentMap[path];
    throw new Error(`File not found: ${path}`);
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CommandMerger', () => {
  let merger: CommandMerger;

  beforeEach(() => {
    merger = new CommandMerger();
  });

  describe('adding new command files', () => {
    it('creates a new command in an empty commands map', () => {
      const readFile = stubReadFile({
        'commands/test.md': '# Test\nRun tests.',
      });

      const result = merger.merge(
        emptyCommands(),
        [{ name: '/test', file: 'commands/test.md', description: 'Run tests' }],
        'test-skill',
        readFile,
      );

      expect(result.created).toContain('.claude/commands/test.md');
      expect(result.commands.has('/test')).toBe(true);
      expect(result.conflicts).toHaveLength(0);
    });

    it('creates multiple commands at once', () => {
      const readFile = stubReadFile({
        'commands/build.md': '# Build\nBuild the project.',
        'commands/deploy.md': '# Deploy\nDeploy the project.',
      });

      const result = merger.merge(
        emptyCommands(),
        [
          { name: '/build', file: 'commands/build.md', description: 'Build' },
          { name: '/deploy', file: 'commands/deploy.md', description: 'Deploy' },
        ],
        'ci-skill',
        readFile,
      );

      expect(result.created).toHaveLength(2);
      expect(result.commands.size).toBe(2);
    });

    it('strips the leading slash for the filename', () => {
      const readFile = stubReadFile({
        'commands/artisan.md': '# Artisan\nLaravel commands.',
      });

      const result = merger.merge(
        emptyCommands(),
        [{ name: '/artisan', file: 'commands/artisan.md', description: 'Artisan' }],
        'laravel',
        readFile,
      );

      expect(result.created[0]).toBe('.claude/commands/artisan.md');
    });
  });

  describe('source tracking in command files', () => {
    it('prepends a source header to the command content', () => {
      const readFile = stubReadFile({
        'commands/test.md': '# Test\nTest content.',
      });

      const result = merger.merge(
        emptyCommands(),
        [{ name: '/test', file: 'commands/test.md', description: 'Test' }],
        'my-skill',
        readFile,
      );

      const cmd = result.commands.get('/test')!;
      expect(cmd.content).toMatch(
        /^<!-- claude-adapt:source:skill:my-skill:command:\/test -->/,
      );
      expect(cmd.source).toBe('skill:my-skill');
    });
  });

  describe('conflict detection', () => {
    it('reports a conflict when command name already exists from a different source', () => {
      const readFile = stubReadFile({
        'commands/deploy.md': '# Deploy\nNew deploy.',
      });

      const result = merger.merge(
        commandsWithExisting(), // has /deploy from skill:infra
        [{ name: '/deploy', file: 'commands/deploy.md', description: 'Deploy' }],
        'other-skill',
        readFile,
      );

      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].type).toBe('command');
      expect(result.conflicts[0].id).toBe('/deploy');
      expect(result.conflicts[0].existingSource).toBe('skill:infra');
      expect(result.conflicts[0].incomingSource).toBe('skill:other-skill');
    });

    it('does not create the file when there is a conflict', () => {
      const readFile = stubReadFile({
        'commands/deploy.md': '# Deploy\nNew.',
      });

      const result = merger.merge(
        commandsWithExisting(),
        [{ name: '/deploy', file: 'commands/deploy.md', description: 'Deploy' }],
        'other-skill',
        readFile,
      );

      expect(result.created).toHaveLength(0);
    });

    it('allows overriding when "overrides" is set', () => {
      const readFile = stubReadFile({
        'commands/deploy.md': '# Deploy\nOverridden deploy.',
      });

      const result = merger.merge(
        commandsWithExisting(),
        [
          {
            name: '/deploy',
            file: 'commands/deploy.md',
            description: 'Overridden Deploy',
            overrides: '/deploy',
          },
        ],
        'override-skill',
        readFile,
      );

      expect(result.conflicts).toHaveLength(0);
      expect(result.created).toContain('.claude/commands/deploy.md');
      expect(result.commands.get('/deploy')!.source).toBe('skill:override-skill');
    });

    it('allows updating a command owned by the same skill', () => {
      const readFile = stubReadFile({
        'commands/deploy.md': '# Deploy\nUpdated.',
      });

      const result = merger.merge(
        commandsWithExisting(), // /deploy is owned by skill:infra
        [{ name: '/deploy', file: 'commands/deploy.md', description: 'Deploy' }],
        'infra', // same skill
        readFile,
      );

      expect(result.conflicts).toHaveLength(0);
      expect(result.created).toContain('.claude/commands/deploy.md');
    });

    it('detects conflict with a manual command', () => {
      const readFile = stubReadFile({
        'commands/lint.md': '# Lint\nSkill lint.',
      });

      const result = merger.merge(
        commandsWithExisting(), // /lint is owned by "manual"
        [{ name: '/lint', file: 'commands/lint.md', description: 'Lint' }],
        'lint-skill',
        readFile,
      );

      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].existingSource).toBe('manual');
    });
  });

  describe('reading command file errors', () => {
    it('reports a conflict when the command file cannot be read', () => {
      const readFile = stubReadFile({}); // empty — everything throws

      const result = merger.merge(
        emptyCommands(),
        [{ name: '/broken', file: 'commands/broken.md', description: 'Broken' }],
        'broken-skill',
        readFile,
      );

      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].message).toContain('Could not read');
    });
  });

  describe('clean removal of skill-owned commands', () => {
    it('removes all commands belonging to a skill', () => {
      const commands = commandsWithExisting(); // has /deploy (skill:infra) and /lint (manual)

      const { removedPaths, updatedCommands } = merger.remove(commands, 'infra');

      expect(removedPaths).toContain('.claude/commands/deploy.md');
      expect(updatedCommands.has('/deploy')).toBe(false);
      // Manual command is preserved
      expect(updatedCommands.has('/lint')).toBe(true);
    });

    it('returns empty array when no commands match the skill', () => {
      const commands = commandsWithExisting();

      const { removedPaths } = merger.remove(commands, 'nonexistent-skill');

      expect(removedPaths).toHaveLength(0);
    });
  });

  describe('rollback plan', () => {
    it('includes remove-file for newly created commands', () => {
      const readFile = stubReadFile({
        'commands/new.md': '# New\nNew command.',
      });

      const result = merger.merge(
        emptyCommands(),
        [{ name: '/new', file: 'commands/new.md', description: 'New' }],
        'new-skill',
        readFile,
      );

      expect(result.rollback.operations).toHaveLength(1);
      expect(result.rollback.operations[0].type).toBe('remove-file');
      expect(result.rollback.operations[0].target).toBe('.claude/commands/new.md');
    });

    it('includes restore for overwritten commands', () => {
      const readFile = stubReadFile({
        'commands/deploy.md': '# Deploy\nUpdated.',
      });

      const commands = commandsWithExisting();
      const originalContent = commands.get('/deploy')!.content;

      const result = merger.merge(
        commands,
        [{ name: '/deploy', file: 'commands/deploy.md', description: 'Deploy', overrides: '/deploy' }],
        'override-skill',
        readFile,
      );

      expect(result.rollback.operations).toHaveLength(1);
      expect(result.rollback.operations[0].type).toBe('restore');
      expect(result.rollback.operations[0].originalContent).toBe(originalContent);
    });
  });

  describe('parseSource', () => {
    it('extracts source from a valid source header', () => {
      const content =
        '<!-- claude-adapt:source:skill:laravel:command:/artisan -->\n# Artisan\n';
      const source = merger.parseSource(content);
      expect(source).toBe('skill:laravel:command:/artisan');
    });

    it('returns "manual" when no source header is found', () => {
      const content = '# Manual Command\nJust a regular command.';
      const source = merger.parseSource(content);
      expect(source).toBe('manual');
    });

    it('returns "manual" for empty content', () => {
      const source = merger.parseSource('');
      expect(source).toBe('manual');
    });
  });

  describe('operations tracking', () => {
    it('records a create operation for each added command', () => {
      const readFile = stubReadFile({
        'commands/a.md': '# A',
        'commands/b.md': '# B',
      });

      const result = merger.merge(
        emptyCommands(),
        [
          { name: '/a', file: 'commands/a.md', description: 'A' },
          { name: '/b', file: 'commands/b.md', description: 'B' },
        ],
        'multi-skill',
        readFile,
      );

      expect(result.operations).toHaveLength(2);
      expect(result.operations.every(op => op.type === 'create')).toBe(true);
      expect(result.operations[0].marker).toBe('skill:multi-skill:command:/a');
      expect(result.operations[1].marker).toBe('skill:multi-skill:command:/b');
    });
  });
});
