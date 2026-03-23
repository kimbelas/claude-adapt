import { describe, it, expect, beforeEach } from 'vitest';

import { ClaudeMdMerger } from '../claude-md-merger.js';
import type { SkillSection } from '../../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSection(overrides: Partial<SkillSection> = {}): SkillSection {
  return {
    id: 'test-section',
    title: 'Test Section',
    content: 'Some test content.',
    placement: { position: 'bottom' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ClaudeMdMerger', () => {
  let merger: ClaudeMdMerger;

  beforeEach(() => {
    merger = new ClaudeMdMerger();
  });

  describe('merging into empty CLAUDE.md', () => {
    it('creates a new section at the bottom by default', () => {
      const result = merger.merge('', [makeSection()], 'test-skill', 50);

      expect(result.content).toContain('## Test Section');
      expect(result.content).toContain('Some test content.');
      expect(result.operations).toHaveLength(1);
      expect(result.conflicts).toHaveLength(0);
    });

    it('creates a new section at the top when position is "top"', () => {
      const section = makeSection({
        placement: { position: 'top' },
      });
      const result = merger.merge('', [section], 'test-skill', 50);

      expect(result.content).toContain('## Test Section');
      expect(result.operations[0].position).toBe('before');
    });

    it('includes source tracking markers for skill sections', () => {
      const result = merger.merge('', [makeSection()], 'my-skill', 50);

      expect(result.content).toContain('<!-- claude-adapt:source:skill:my-skill:test-section -->');
      expect(result.content).toContain('<!-- claude-adapt:end:skill:my-skill:test-section -->');
    });
  });

  describe('merging into existing CLAUDE.md', () => {
    const existingContent = [
      '# My Project',
      '',
      '## Overview',
      '',
      'This is an overview section.',
      '',
      '## Architecture',
      '',
      'Architecture details here.',
      '',
    ].join('\n');

    it('appends a section at the bottom of existing content', () => {
      const section = makeSection({
        id: 'conventions',
        title: 'Conventions',
        content: 'Follow these rules.',
        placement: { position: 'bottom' },
      });

      const result = merger.merge(existingContent, [section], 'my-skill', 50);

      expect(result.content).toContain('## Conventions');
      expect(result.content).toContain('Follow these rules.');
      // Existing content is preserved
      expect(result.content).toContain('## Overview');
      expect(result.content).toContain('## Architecture');
    });

    it('inserts a section after a specific anchor', () => {
      const section = makeSection({
        id: 'testing',
        title: 'Testing',
        content: 'Run tests with vitest.',
        placement: { after: 'overview' },
      });

      const result = merger.merge(existingContent, [section], 'my-skill', 50);

      const lines = result.content.split('\n');
      const overviewIdx = lines.findIndex(l => l.includes('## Overview'));
      const testingIdx = lines.findIndex(l => l.includes('## Testing'));
      const archIdx = lines.findIndex(l => l.includes('## Architecture'));

      expect(testingIdx).toBeGreaterThan(overviewIdx);
      expect(testingIdx).toBeLessThan(archIdx);
    });

    it('inserts a section before a specific anchor', () => {
      const section = makeSection({
        id: 'intro',
        title: 'Introduction',
        content: 'Welcome.',
        placement: { before: 'architecture' },
      });

      const result = merger.merge(existingContent, [section], 'my-skill', 50);

      const lines = result.content.split('\n');
      const introIdx = lines.findIndex(l => l.includes('## Introduction'));
      const archIdx = lines.findIndex(l => l.includes('## Architecture'));

      expect(introIdx).toBeLessThan(archIdx);
    });

    it('merges a section as a child of an existing section', () => {
      const section = makeSection({
        id: 'api-docs',
        title: 'API Documentation',
        content: 'REST API docs.',
        placement: { section: 'architecture' },
      });

      const result = merger.merge(existingContent, [section], 'my-skill', 50);

      // Child should have deeper heading level
      expect(result.content).toContain('### API Documentation');
    });

    it('falls back to bottom when anchor is not found', () => {
      const section = makeSection({
        id: 'misc',
        title: 'Misc',
        content: 'Fallback.',
        placement: { after: 'nonexistent-section', position: 'bottom' },
      });

      const result = merger.merge(existingContent, [section], 'my-skill', 50);

      expect(result.content).toContain('## Misc');
      // It should still be there without errors
      expect(result.conflicts).toHaveLength(0);
    });
  });

  describe('priority ordering', () => {
    it('inserts lower priority sections before higher priority ones', () => {
      const existing = [
        '# Project',
        '',
        '## Base',
        '',
        'Base content.',
        '',
      ].join('\n');

      // Install skill A at priority 20, then skill B at priority 80
      const sectionA = makeSection({
        id: 'sec-a',
        title: 'Section A',
        content: 'A content.',
        placement: { section: 'base' },
      });

      const resultA = merger.merge(existing, [sectionA], 'skill-a', 20);

      const sectionB = makeSection({
        id: 'sec-b',
        title: 'Section B',
        content: 'B content.',
        placement: { section: 'base' },
      });

      const resultB = merger.merge(resultA.content, [sectionB], 'skill-b', 80);

      const lines = resultB.content.split('\n');
      const idxA = lines.findIndex(l => l.includes('Section A'));
      const idxB = lines.findIndex(l => l.includes('Section B'));

      // Lower priority (20) comes first
      expect(idxA).toBeLessThan(idxB);
    });
  });

  describe('source tracking markers', () => {
    it('writes source and end markers around skill sections', () => {
      const result = merger.merge(
        '',
        [makeSection({ id: 'my-sec', title: 'My Section' })],
        'laravel',
        50,
      );

      expect(result.content).toContain('<!-- claude-adapt:source:skill:laravel:my-sec -->');
      expect(result.content).toContain('<!-- claude-adapt:end:skill:laravel:my-sec -->');
    });

    it('does not add markers for manual sections in original content', () => {
      const existing = '# Project\n\n## Manual Section\n\nManual content.\n';
      const result = merger.merge(
        existing,
        [makeSection({ id: 'extra', title: 'Extra', content: 'Extra.' })],
        'skill-x',
        50,
      );

      // Manual Section should not get markers
      const sourceMarkers = result.content.match(/claude-adapt:source:/g) || [];
      const endMarkers = result.content.match(/claude-adapt:end:/g) || [];

      // Only one source + one end marker (for the skill section)
      expect(sourceMarkers).toHaveLength(1);
      expect(endMarkers).toHaveLength(1);
    });
  });

  describe('removal of skill-owned sections', () => {
    it('rollback plan stores the original content for clean restoration', () => {
      const existing = '# Project\n\n## Overview\n\nExisting.\n';
      const result = merger.merge(
        existing,
        [makeSection()],
        'test-skill',
        50,
      );

      expect(result.rollback.operations).toHaveLength(1);
      expect(result.rollback.operations[0].type).toBe('restore');
      expect(result.rollback.operations[0].target).toBe('CLAUDE.md');
      expect(result.rollback.operations[0].originalContent).toBe(existing);
    });
  });

  describe('conflict detection', () => {
    it('reports a conflict when section ID is owned by a different source', () => {
      // First, merge a section from skill-a
      const sectionA = makeSection({
        id: 'shared',
        title: 'Shared Section',
        content: 'From A.',
      });
      const firstResult = merger.merge('', [sectionA], 'skill-a', 50);

      // Now try to merge a section with the same ID from skill-b
      const sectionB = makeSection({
        id: 'shared',
        title: 'Shared Section',
        content: 'From B.',
      });
      const secondResult = merger.merge(firstResult.content, [sectionB], 'skill-b', 50);

      expect(secondResult.conflicts).toHaveLength(1);
      expect(secondResult.conflicts[0].type).toBe('section');
      expect(secondResult.conflicts[0].id).toBe('shared');
      expect(secondResult.conflicts[0].existingSource).toContain('skill-a');
      expect(secondResult.conflicts[0].incomingSource).toContain('skill-b');
    });

    it('allows re-merge of the same section from the same skill (update in place)', () => {
      const section = makeSection({
        id: 'updatable',
        title: 'Updatable',
        content: 'Version 1.',
      });
      const first = merger.merge('', [section], 'my-skill', 50);

      const updated = makeSection({
        id: 'updatable',
        title: 'Updatable',
        content: 'Version 2.',
      });
      const second = merger.merge(first.content, [updated], 'my-skill', 50);

      expect(second.conflicts).toHaveLength(0);
      expect(second.content).toContain('Version 2.');
    });
  });

  describe('multiple skills coexisting', () => {
    it('preserves sections from different skills', () => {
      const sectionA = makeSection({
        id: 'from-a',
        title: 'From Skill A',
        content: 'A content.',
      });
      const resultA = merger.merge('', [sectionA], 'skill-a', 50);

      const sectionB = makeSection({
        id: 'from-b',
        title: 'From Skill B',
        content: 'B content.',
      });
      const resultB = merger.merge(resultA.content, [sectionB], 'skill-b', 50);

      expect(resultB.content).toContain('## From Skill A');
      expect(resultB.content).toContain('A content.');
      expect(resultB.content).toContain('## From Skill B');
      expect(resultB.content).toContain('B content.');
    });
  });

  describe('topological sorting', () => {
    it('processes dependency section before the dependent one', () => {
      // Section B is placed "after" section A.
      // Even if B comes first in the array, A should be processed first.
      const sections: SkillSection[] = [
        makeSection({
          id: 'sec-b',
          title: 'Section B',
          content: 'After A.',
          placement: { after: 'sec-a' },
        }),
        makeSection({
          id: 'sec-a',
          title: 'Section A',
          content: 'First.',
          placement: { position: 'bottom' },
        }),
      ];

      const result = merger.merge('', sections, 'topo-skill', 50);

      // Both sections should be present without errors
      expect(result.content).toContain('## Section A');
      expect(result.content).toContain('## Section B');
      expect(result.conflicts).toHaveLength(0);

      // Section A should appear before Section B in output
      const lines = result.content.split('\n');
      const idxA = lines.findIndex(l => l.includes('## Section A'));
      const idxB = lines.findIndex(l => l.includes('## Section B'));
      expect(idxA).toBeLessThan(idxB);
    });

    it('handles circular references gracefully (appends remaining)', () => {
      const sections: SkillSection[] = [
        makeSection({
          id: 'x',
          title: 'X',
          content: 'X.',
          placement: { after: 'y' },
        }),
        makeSection({
          id: 'y',
          title: 'Y',
          content: 'Y.',
          placement: { after: 'x' },
        }),
      ];

      // Should not throw, even with a cycle
      const result = merger.merge('', sections, 'cycle-skill', 50);

      expect(result.content).toContain('## X');
      expect(result.content).toContain('## Y');
    });
  });

  describe('operation tracking', () => {
    it('records insert operation with correct marker', () => {
      const result = merger.merge(
        '',
        [makeSection({ id: 'ops-test', title: 'Ops Test' })],
        'op-skill',
        50,
      );

      expect(result.operations).toHaveLength(1);
      expect(result.operations[0].marker).toBe('skill:op-skill:ops-test');
    });

    it('records modify operation when updating same-skill section', () => {
      const section = makeSection({ id: 'mod', title: 'Mod', content: 'v1' });
      const first = merger.merge('', [section], 'mod-skill', 50);

      const updated = makeSection({ id: 'mod', title: 'Mod', content: 'v2' });
      const second = merger.merge(first.content, [updated], 'mod-skill', 50);

      expect(second.operations.some(op => op.type === 'modify')).toBe(true);
    });
  });
});
