import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ClaudeMdUpdater } from '../claude-md-updater.js';
import type {
  ArchitecturalDecision,
  ConventionDrift,
  Hotspot,
} from '../types.js';

// Mock fs/promises
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  access: vi.fn(),
}));

import { readFile, writeFile, access } from 'node:fs/promises';

const mockAccess = vi.mocked(access);
const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);

function makeDecision(overrides: Partial<ArchitecturalDecision> = {}): ArchitecturalDecision {
  return {
    id: 'dec-001',
    timestamp: '2025-06-01T00:00:00Z',
    sessionId: 's1',
    title: 'Added dependency: lodash',
    description: 'New dependency lodash added to package.json.',
    rationale: 'Detected via diff.',
    filesAffected: ['package.json'],
    diffSummary: '+lodash',
    category: 'dependency',
    impact: 'medium',
    confidence: 0.9,
    claudeMdSection: 'tech-stack',
    suggestedContent: '- **lodash**: Utility library',
    applied: false,
    ...overrides,
  };
}

function makeHotspot(
  file: string,
  editCount: number,
  risk: 'low' | 'medium' | 'high',
): Hotspot {
  return {
    file,
    editCount,
    lastEdited: '2025-06-01T00:00:00Z',
    sessions: ['s1'],
    risk,
    note: risk === 'high' ? `Edited ${editCount} times` : undefined,
  };
}

function makeDrift(overrides: Partial<ConventionDrift> = {}): ConventionDrift {
  return {
    type: 'naming',
    scope: 'files',
    from: 'camelCase',
    to: 'snake_case',
    severity: 'warning',
    message: 'files naming shifting from camelCase to snake_case',
    ...overrides,
  };
}

const BASE_CLAUDE_MD = `# My Project

## Tech Stack

- TypeScript
- Node.js

## Gotchas

<!-- claude-adapt:sync:gotchas -->
<!-- /claude-adapt:sync:gotchas -->

## Conventions

<!-- claude-adapt:sync:conventions -->
<!-- /claude-adapt:sync:conventions -->
`;

describe('ClaudeMdUpdater', () => {
  let updater: ClaudeMdUpdater;

  beforeEach(() => {
    updater = new ClaudeMdUpdater();
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // File does not exist
  // ---------------------------------------------------------------------------

  describe('when CLAUDE.md does not exist', () => {
    it('returns unchanged result with empty content', async () => {
      mockAccess.mockRejectedValueOnce(new Error('ENOENT'));

      const result = await updater.update('/project', [], [], [], []);

      expect(result.unchanged).toBe(true);
      expect(result.changes).toEqual([]);
      expect(result.content).toBe('');
    });
  });

  // ---------------------------------------------------------------------------
  // Sync-owned sections (hotspots/gotchas)
  // ---------------------------------------------------------------------------

  describe('sync-owned sections', () => {
    it('updates the gotchas sync section with high-risk hotspots', async () => {
      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(BASE_CLAUDE_MD);
      mockWriteFile.mockResolvedValueOnce(undefined);

      const hotspots = [
        makeHotspot('src/app.ts', 15, 'high'),
      ];

      const result = await updater.update('/project', [], hotspots, [], []);

      expect(result.content).toContain('src/app.ts');
      const gotchaChange = result.changes.find((c) => c.section === 'gotchas');
      expect(gotchaChange).toBeDefined();
      expect(gotchaChange!.type).toBe('updated');
      expect(gotchaChange!.source).toBe('sync');
    });

    it('does not update gotchas section when no high-risk hotspots exist', async () => {
      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(BASE_CLAUDE_MD);

      const hotspots = [
        makeHotspot('src/safe.ts', 2, 'low'),
      ];

      const result = await updater.update('/project', [], hotspots, [], []);

      // The gotchas section should remain empty (same as original)
      // No change if empty content matches empty existing content
      expect(result.changes.filter((c) => c.section === 'gotchas')).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Decision application (high confidence)
  // ---------------------------------------------------------------------------

  describe('decision application', () => {
    it('applies high-confidence decisions (>= 0.7) to CLAUDE.md', async () => {
      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(BASE_CLAUDE_MD);
      mockWriteFile.mockResolvedValueOnce(undefined);

      const decisions = [makeDecision({ confidence: 0.9 })];

      const result = await updater.update('/project', decisions, [], [], []);

      const decChange = result.changes.find(
        (c) => c.section === 'tech-stack',
      );
      expect(decChange).toBeDefined();
      expect(decChange!.type).toBe('appended');
      expect(decChange!.confidence).toBe(0.9);
      expect(result.content).toContain('lodash');
    });

    it('does not apply decisions with confidence below 0.7', async () => {
      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(BASE_CLAUDE_MD);

      const decisions = [makeDecision({ confidence: 0.5 })];

      const result = await updater.update('/project', decisions, [], [], []);

      const decChange = result.changes.find(
        (c) => c.section === 'tech-stack',
      );
      expect(decChange).toBeUndefined();
    });

    it('does not apply already-applied decisions', async () => {
      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(BASE_CLAUDE_MD);

      const decisions = [makeDecision({ applied: true })];

      const result = await updater.update('/project', decisions, [], [], []);

      const decChange = result.changes.find(
        (c) => c.section === 'tech-stack',
      );
      expect(decChange).toBeUndefined();
    });

    it('does not add duplicate content', async () => {
      const contentWithLodash = BASE_CLAUDE_MD.replace(
        '- Node.js',
        '- Node.js\n- **lodash**: Utility library',
      );
      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(contentWithLodash);

      const decisions = [makeDecision()];

      const result = await updater.update('/project', decisions, [], [], []);

      const decChanges = result.changes.filter(
        (c) => c.section === 'tech-stack',
      );
      expect(decChanges).toHaveLength(0);
    });

    it('marks decisions as applied after successful insertion', async () => {
      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(BASE_CLAUDE_MD);
      mockWriteFile.mockResolvedValueOnce(undefined);

      const decisions = [makeDecision()];
      await updater.update('/project', decisions, [], [], []);

      expect(decisions[0]!.applied).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Convention drift notes
  // ---------------------------------------------------------------------------

  describe('convention drift notes', () => {
    it('adds drift notes to the sync:conventions section', async () => {
      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(BASE_CLAUDE_MD);
      mockWriteFile.mockResolvedValueOnce(undefined);

      const drifts = [makeDrift()];

      const result = await updater.update('/project', [], [], drifts, []);

      const driftChange = result.changes.find(
        (c) => c.section === 'conventions',
      );
      expect(driftChange).toBeDefined();
      expect(driftChange!.type).toBe('drift-noted');
      expect(result.content).toContain('[warning]');
      expect(result.content).toContain('camelCase to snake_case');
    });

    it('does not add drift notes when there are no drifts', async () => {
      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(BASE_CLAUDE_MD);

      const result = await updater.update('/project', [], [], [], []);

      const driftChange = result.changes.find(
        (c) => c.section === 'conventions',
      );
      expect(driftChange).toBeUndefined();
    });

    it('ignores drift when no sync:conventions marker exists', async () => {
      const noMarker = `# My Project\n\n## Tech Stack\n\n- TypeScript\n`;
      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(noMarker);

      const drifts = [makeDrift()];

      const result = await updater.update('/project', [], [], drifts, []);

      const driftChange = result.changes.find(
        (c) => c.type === 'drift-noted',
      );
      expect(driftChange).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Safety: never deletes manual content
  // ---------------------------------------------------------------------------

  describe('safety: no manual content deletion', () => {
    it('preserves all manual content in CLAUDE.md', async () => {
      const manualContent = `# My Project

## Custom Section

This is manual content that must not be touched.

## Tech Stack

- TypeScript

## Gotchas

<!-- claude-adapt:sync:gotchas -->
<!-- /claude-adapt:sync:gotchas -->
`;
      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(manualContent);

      const result = await updater.update('/project', [], [], [], []);

      expect(result.content).toContain('This is manual content that must not be touched.');
    });
  });

  // ---------------------------------------------------------------------------
  // Max 5 changes per sync
  // ---------------------------------------------------------------------------

  describe('max 5 changes per sync', () => {
    it('trims changes to 5 when more are generated', async () => {
      mockAccess.mockResolvedValueOnce(undefined);

      // Create content with many sections to match
      const manyHeadings = `# Project
## tech-stack
- A
## api
- B
## patterns
- C
## deployment
- D
## security
- E
## monitoring
- F
## Gotchas
<!-- claude-adapt:sync:gotchas -->
<!-- /claude-adapt:sync:gotchas -->
## Conventions
<!-- claude-adapt:sync:conventions -->
<!-- /claude-adapt:sync:conventions -->
`;
      mockReadFile.mockResolvedValueOnce(manyHeadings);
      mockWriteFile.mockResolvedValueOnce(undefined);

      // Create 7 unique decisions that each target different sections
      const decisions = [
        makeDecision({ id: 'd1', confidence: 0.95, claudeMdSection: 'tech-stack', suggestedContent: '- New1' }),
        makeDecision({ id: 'd2', confidence: 0.92, claudeMdSection: 'api', suggestedContent: '- New2' }),
        makeDecision({ id: 'd3', confidence: 0.88, claudeMdSection: 'patterns', suggestedContent: '- New3' }),
        makeDecision({ id: 'd4', confidence: 0.85, claudeMdSection: 'deployment', suggestedContent: '- New4' }),
        makeDecision({ id: 'd5', confidence: 0.82, claudeMdSection: 'security', suggestedContent: '- New5' }),
        makeDecision({ id: 'd6', confidence: 0.78, claudeMdSection: 'monitoring', suggestedContent: '- New6' }),
      ];

      const hotspots = [makeHotspot('src/app.ts', 20, 'high')];

      const result = await updater.update('/project', decisions, hotspots, [], []);

      expect(result.changes.length).toBeLessThanOrEqual(5);
    });
  });

  // ---------------------------------------------------------------------------
  // Max 10KB content limit
  // ---------------------------------------------------------------------------

  describe('content limit', () => {
    it('validation reports issue when sync content exceeds 10KB', async () => {
      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(BASE_CLAUDE_MD);
      mockWriteFile.mockResolvedValueOnce(undefined);

      // Create a decision with extremely large suggested content
      const largeContent = 'x'.repeat(12 * 1024); // 12KB
      const decisions = [
        makeDecision({
          suggestedContent: largeContent,
          claudeMdSection: 'tech-stack',
        }),
      ];

      const result = await updater.update('/project', decisions, [], [], []);

      // The safety guard should flag the size issue
      expect(result.validation.issues.some((i) => i.includes('10KB'))).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Dry run
  // ---------------------------------------------------------------------------

  describe('dry run mode', () => {
    it('does not write to disk in dry-run mode', async () => {
      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(BASE_CLAUDE_MD);

      const hotspots = [makeHotspot('src/app.ts', 15, 'high')];

      await updater.update('/project', [], hotspots, [], [], true);

      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it('still computes changes in dry-run mode', async () => {
      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(BASE_CLAUDE_MD);

      const hotspots = [makeHotspot('src/app.ts', 15, 'high')];

      const result = await updater.update('/project', [], hotspots, [], [], true);

      expect(result.changes.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Writes when changes exist
  // ---------------------------------------------------------------------------

  describe('writing changes', () => {
    it('writes to disk when changes exist and not dry-run', async () => {
      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(BASE_CLAUDE_MD);
      mockWriteFile.mockResolvedValueOnce(undefined);

      const hotspots = [makeHotspot('src/app.ts', 15, 'high')];

      await updater.update('/project', [], hotspots, [], [], false);

      expect(mockWriteFile).toHaveBeenCalledTimes(1);
    });

    it('does not write when there are no changes', async () => {
      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(BASE_CLAUDE_MD);

      await updater.update('/project', [], [], [], [], false);

      expect(mockWriteFile).not.toHaveBeenCalled();
    });
  });
});
