import { describe, it, expect, beforeEach } from 'vitest';

import { HookComposer } from '../hook-composer.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HookComposer', () => {
  let composer: HookComposer;

  beforeEach(() => {
    composer = new HookComposer();
  });

  describe('composing into empty hook script', () => {
    it('creates a new script with the block and standard header', () => {
      const result = composer.compose(null, [
        { content: 'echo "hello"', priority: 10, merge: 'append' },
      ], 'my-skill');

      expect(result.content).toContain('#!/bin/bash');
      expect(result.content).toContain('set -e');
      expect(result.content).toContain('echo "hello"');
    });

    it('wraps the block with source markers', () => {
      const result = composer.compose(null, [
        { content: 'npm run lint', priority: 20, merge: 'append' },
      ], 'lint-skill');

      expect(result.content).toContain(
        '# --- claude-adapt:skill:lint-skill (priority: 20) ---',
      );
      expect(result.content).toContain(
        '# --- end:claude-adapt:skill:lint-skill ---',
      );
    });

    it('records an insert operation', () => {
      const result = composer.compose(null, [
        { content: 'echo "hi"', priority: 10, merge: 'append' },
      ], 'op-skill');

      expect(result.operations).toHaveLength(1);
      expect(result.operations[0].type).toBe('insert');
      expect(result.operations[0].marker).toBe('skill:op-skill');
    });

    it('rollback plan uses remove-file when there was no existing hook', () => {
      const result = composer.compose(null, [
        { content: 'echo "hi"', priority: 10, merge: 'append' },
      ], 'new-skill');

      expect(result.rollback.operations).toHaveLength(1);
      expect(result.rollback.operations[0].type).toBe('remove-file');
    });
  });

  describe('priority-based ordering', () => {
    it('sorts blocks by priority (lower = first) from different skills', () => {
      // First skill contributes at priority 50
      const result1 = composer.compose(null, [
        { content: 'echo "second"', priority: 50, merge: 'append' },
      ], 'skill-second');

      // Second skill contributes at priority 10 (should be sorted before)
      const result2 = composer.compose(result1.content, [
        { content: 'echo "first"', priority: 10, merge: 'append' },
      ], 'skill-first');

      const lines = result2.content.split('\n');
      const firstIdx = lines.findIndex(l => l.includes('echo "first"'));
      const secondIdx = lines.findIndex(l => l.includes('echo "second"'));

      expect(firstIdx).toBeLessThan(secondIdx);
    });

    it('interleaves blocks from different skills by priority', () => {
      // Skill A contributes at priority 30
      const resultA = composer.compose(null, [
        { content: 'echo "A"', priority: 30, merge: 'append' },
      ], 'skill-a');

      // Skill B contributes at priority 10 (should go before A)
      const resultB = composer.compose(resultA.content, [
        { content: 'echo "B"', priority: 10, merge: 'append' },
      ], 'skill-b');

      const lines = resultB.content.split('\n');
      const idxB = lines.findIndex(l => l.includes('echo "B"'));
      const idxA = lines.findIndex(l => l.includes('echo "A"'));

      expect(idxB).toBeLessThan(idxA);
    });
  });

  describe('source tracking with block markers', () => {
    it('uses the format: # --- claude-adapt:skill:name (priority: N) ---', () => {
      const result = composer.compose(null, [
        { content: 'lint check', priority: 42, merge: 'append' },
      ], 'eslint-skill');

      expect(result.content).toMatch(
        /# --- claude-adapt:skill:eslint-skill \(priority: 42\) ---/,
      );
      expect(result.content).toMatch(
        /# --- end:claude-adapt:skill:eslint-skill ---/,
      );
    });
  });

  describe('removal of skill-owned blocks', () => {
    it('removing blocks is achieved by re-composing without the skill', () => {
      // Install skill-a and skill-b
      const resultA = composer.compose(null, [
        { content: 'echo "A"', priority: 10, merge: 'append' },
      ], 'skill-a');

      const resultAB = composer.compose(resultA.content, [
        { content: 'echo "B"', priority: 20, merge: 'append' },
      ], 'skill-b');

      // Parse blocks, filter out skill-a, re-serialize
      const blocks = composer.parseBlocks(resultAB.content);
      const filtered = blocks.filter(b => b.source !== 'skill:skill-a');
      const cleaned = composer.serializeBlocks(filtered);

      expect(cleaned).not.toContain('echo "A"');
      expect(cleaned).toContain('echo "B"');
      expect(cleaned).not.toContain('skill:skill-a');
    });
  });

  describe('preserving unmarked/manual blocks', () => {
    it('preserves non-trivial manual content as a "core" block', () => {
      const manualHook = [
        '#!/bin/bash',
        '# Generated by claude-adapt',
        '',
        'set -e',
        '',
        '# Custom pre-commit check',
        'npm run typecheck',
        '',
      ].join('\n');

      const blocks = composer.parseBlocks(manualHook);

      expect(blocks.length).toBeGreaterThanOrEqual(1);
      const coreBlock = blocks.find(b => b.source === 'core');
      expect(coreBlock).toBeDefined();
      expect(coreBlock!.content).toContain('npm run typecheck');
      expect(coreBlock!.priority).toBe(50);
    });

    it('keeps manual blocks alongside skill blocks after compose', () => {
      const manualHook = [
        '#!/bin/bash',
        '',
        'set -e',
        '',
        '# Manual lint check',
        'npm run lint',
        '',
      ].join('\n');

      const result = composer.compose(manualHook, [
        { content: 'npm run test', priority: 60, merge: 'append' },
      ], 'test-skill');

      expect(result.content).toContain('npm run lint');
      expect(result.content).toContain('npm run test');
    });

    it('filters out shebang, generated-by comment, and set -e from unmarked', () => {
      const trivia = [
        '#!/bin/bash',
        '# Generated by claude-adapt',
        '',
        'set -e',
        '',
      ].join('\n');

      const blocks = composer.parseBlocks(trivia);

      // Only trivial content, so no core block
      expect(blocks).toHaveLength(0);
    });
  });

  describe('multiple skills contributing to same hook', () => {
    it('correctly merges three skills with different priorities', () => {
      const r1 = composer.compose(null, [
        { content: 'echo "medium"', priority: 50, merge: 'append' },
      ], 'medium-skill');

      const r2 = composer.compose(r1.content, [
        { content: 'echo "high"', priority: 90, merge: 'append' },
      ], 'high-skill');

      const r3 = composer.compose(r2.content, [
        { content: 'echo "low"', priority: 10, merge: 'append' },
      ], 'low-skill');

      const lines = r3.content.split('\n');
      const lowIdx = lines.findIndex(l => l.includes('echo "low"'));
      const medIdx = lines.findIndex(l => l.includes('echo "medium"'));
      const highIdx = lines.findIndex(l => l.includes('echo "high"'));

      expect(lowIdx).toBeLessThan(medIdx);
      expect(medIdx).toBeLessThan(highIdx);
    });
  });

  describe('merge mode: replace', () => {
    it('replaces all existing blocks when merge is "replace"', () => {
      const existing = composer.compose(null, [
        { content: 'echo "original"', priority: 10, merge: 'append' },
      ], 'original-skill');

      const result = composer.compose(existing.content, [
        { content: 'echo "replaced"', priority: 5, merge: 'replace' },
      ], 'replacing-skill');

      expect(result.content).toContain('echo "replaced"');
      expect(result.content).not.toContain('echo "original"');
    });

    it('records a modify operation with replace position', () => {
      const result = composer.compose(null, [
        { content: 'echo "new"', priority: 10, merge: 'replace' },
      ], 'replace-skill');

      expect(result.operations[0].type).toBe('modify');
      expect(result.operations[0].position).toBe('replace');
    });
  });

  describe('merge mode: prepend', () => {
    it('records an insert operation with before position', () => {
      const result = composer.compose(null, [
        { content: 'echo "pre"', priority: 10, merge: 'prepend' },
      ], 'prepend-skill');

      expect(result.operations[0].position).toBe('before');
    });
  });

  describe('updating an existing block from the same skill', () => {
    it('replaces the block content without duplicating', () => {
      const first = composer.compose(null, [
        { content: 'echo "v1"', priority: 10, merge: 'append' },
      ], 'update-skill');

      const second = composer.compose(first.content, [
        { content: 'echo "v2"', priority: 10, merge: 'append' },
      ], 'update-skill');

      const blocks = composer.parseBlocks(second.content);
      const skillBlocks = blocks.filter(b => b.source === 'skill:update-skill');

      expect(skillBlocks).toHaveLength(1);
      expect(skillBlocks[0].content).toContain('echo "v2"');
    });
  });

  describe('rollback plan with existing hook', () => {
    it('uses restore type with original content when hook existed', () => {
      const existing = '#!/bin/bash\nset -e\necho "existing"\n';
      const result = composer.compose(existing, [
        { content: 'echo "new"', priority: 10, merge: 'append' },
      ], 'rollback-skill');

      expect(result.rollback.operations[0].type).toBe('restore');
      expect(result.rollback.operations[0].originalContent).toBe(existing);
    });
  });

  describe('parseBlocks', () => {
    it('parses a script with marked blocks', () => {
      const script = [
        '#!/bin/bash',
        '# Generated by claude-adapt',
        '',
        'set -e',
        '',
        '# --- claude-adapt:skill:lint (priority: 10) ---',
        'npm run lint',
        '# --- end:claude-adapt:skill:lint ---',
        '',
        '# --- claude-adapt:skill:test (priority: 20) ---',
        'npm test',
        '# --- end:claude-adapt:skill:test ---',
        '',
      ].join('\n');

      const blocks = composer.parseBlocks(script);

      expect(blocks).toHaveLength(2);
      expect(blocks[0].source).toBe('skill:lint');
      expect(blocks[0].priority).toBe(10);
      expect(blocks[0].content).toBe('npm run lint');
      expect(blocks[1].source).toBe('skill:test');
      expect(blocks[1].priority).toBe(20);
      expect(blocks[1].content).toBe('npm test');
    });

    it('handles mixed marked and unmarked content', () => {
      const script = [
        '#!/bin/bash',
        '',
        'echo "manual line"',
        '',
        '# --- claude-adapt:skill:auto (priority: 50) ---',
        'npm run auto',
        '# --- end:claude-adapt:skill:auto ---',
        '',
      ].join('\n');

      const blocks = composer.parseBlocks(script);

      const core = blocks.find(b => b.source === 'core');
      const auto = blocks.find(b => b.source === 'skill:auto');

      expect(core).toBeDefined();
      expect(core!.content).toContain('echo "manual line"');
      expect(auto).toBeDefined();
      expect(auto!.content).toBe('npm run auto');
    });
  });

  describe('serializeBlocks', () => {
    it('produces valid bash script with markers', () => {
      const blocks = [
        { source: 'skill:a', priority: 10, content: 'echo "a"' },
        { source: 'skill:b', priority: 20, content: 'echo "b"' },
      ];

      const output = composer.serializeBlocks(blocks);

      expect(output).toContain('#!/bin/bash');
      expect(output).toContain('set -e');
      expect(output).toContain('# --- claude-adapt:skill:a (priority: 10) ---');
      expect(output).toContain('echo "a"');
      expect(output).toContain('# --- end:claude-adapt:skill:a ---');
      expect(output).toContain('# --- claude-adapt:skill:b (priority: 20) ---');
      expect(output).toContain('echo "b"');
      expect(output).toContain('# --- end:claude-adapt:skill:b ---');
    });
  });
});
