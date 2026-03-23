import { describe, it, expect, beforeEach } from 'vitest';

import { SyncSafetyGuard } from '../safety-guard.js';
import type { ClaudeMdChange } from '../types.js';

function makeChange(overrides: Partial<ClaudeMdChange> = {}): ClaudeMdChange {
  return {
    section: 'tech-stack',
    type: 'appended',
    content: '- New entry',
    confidence: 0.85,
    source: 'sync',
    ...overrides,
  };
}

describe('SyncSafetyGuard', () => {
  let guard: SyncSafetyGuard;

  beforeEach(() => {
    guard = new SyncSafetyGuard();
  });

  // ---------------------------------------------------------------------------
  // validate()
  // ---------------------------------------------------------------------------

  describe('validate', () => {
    // --- Manual content deletion ---

    it('rejects changes that delete manual content', () => {
      const changes: ClaudeMdChange[] = [
        makeChange({ type: 'deleted', source: 'manual', section: 'custom' }),
      ];

      const result = guard.validate(changes);

      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.startsWith('Blocked'))).toBe(true);
      expect(result.issues[0]).toContain('manual');
      expect(result.issues[0]).toContain('custom');
    });

    it('allows deleting sync-owned content', () => {
      const changes: ClaudeMdChange[] = [
        makeChange({ type: 'deleted', source: 'sync', section: 'gotchas' }),
      ];

      const result = guard.validate(changes);

      expect(result.valid).toBe(true);
      expect(result.issues.filter((i) => i.startsWith('Blocked'))).toHaveLength(0);
    });

    it('allows non-delete operations on manual content', () => {
      const changes: ClaudeMdChange[] = [
        makeChange({ type: 'appended', source: 'manual' }),
      ];

      const result = guard.validate(changes);

      expect(result.valid).toBe(true);
    });

    // --- Max 5 changes per sync ---

    it('reports issue when more than 5 changes are proposed', () => {
      const changes = Array.from({ length: 7 }, (_, i) =>
        makeChange({ section: `section-${i}` }),
      );

      const result = guard.validate(changes);

      expect(result.issues.some((i) => i.includes('Too many changes'))).toBe(true);
      expect(result.issues.some((i) => i.includes('7'))).toBe(true);
    });

    it('does not report rate limit issue for exactly 5 changes', () => {
      const changes = Array.from({ length: 5 }, (_, i) =>
        makeChange({ section: `section-${i}` }),
      );

      const result = guard.validate(changes);

      expect(result.issues.some((i) => i.includes('Too many changes'))).toBe(false);
    });

    it('does not report rate limit issue for fewer than 5 changes', () => {
      const changes = [makeChange(), makeChange({ section: 'other' })];

      const result = guard.validate(changes);

      expect(result.issues.some((i) => i.includes('Too many changes'))).toBe(false);
    });

    // --- 10KB content limit ---

    it('reports issue when sync content exceeds 10KB', () => {
      const largeContent = 'x'.repeat(11 * 1024); // 11KB
      const changes: ClaudeMdChange[] = [
        makeChange({ type: 'appended', content: largeContent }),
      ];

      const result = guard.validate(changes);

      expect(result.issues.some((i) => i.includes('10KB'))).toBe(true);
    });

    it('does not report size issue for content under 10KB', () => {
      const changes: ClaudeMdChange[] = [
        makeChange({ type: 'appended', content: 'small content' }),
      ];

      const result = guard.validate(changes);

      expect(result.issues.some((i) => i.includes('10KB'))).toBe(false);
    });

    it('only counts appended and updated content toward the size limit', () => {
      const largeContent = 'x'.repeat(9 * 1024);
      const changes: ClaudeMdChange[] = [
        makeChange({ type: 'appended', content: largeContent }),
        makeChange({ type: 'deleted', content: 'x'.repeat(5 * 1024) }),
      ];

      const result = guard.validate(changes);

      // Deleted content should not count
      expect(result.issues.some((i) => i.includes('10KB'))).toBe(false);
    });

    it('sums content size across multiple appended/updated changes', () => {
      const changes: ClaudeMdChange[] = [
        makeChange({ type: 'appended', content: 'x'.repeat(6 * 1024) }),
        makeChange({ type: 'updated', content: 'x'.repeat(6 * 1024) }),
      ];

      const result = guard.validate(changes);

      // Combined 12KB > 10KB limit
      expect(result.issues.some((i) => i.includes('10KB'))).toBe(true);
    });

    // --- Confidence floor ---

    it('reports issue for low-confidence changes (< 0.7)', () => {
      const changes: ClaudeMdChange[] = [
        makeChange({ confidence: 0.5 }),
      ];

      const result = guard.validate(changes);

      expect(result.issues.some((i) => i.includes('low-confidence'))).toBe(true);
    });

    it('does not flag changes with confidence exactly 0.7', () => {
      const changes: ClaudeMdChange[] = [
        makeChange({ confidence: 0.7 }),
      ];

      const result = guard.validate(changes);

      expect(result.issues.some((i) => i.includes('low-confidence'))).toBe(false);
    });

    it('does not flag changes with confidence above 0.7', () => {
      const changes: ClaudeMdChange[] = [
        makeChange({ confidence: 0.9 }),
      ];

      const result = guard.validate(changes);

      expect(result.issues.some((i) => i.includes('low-confidence'))).toBe(false);
    });

    it('treats undefined confidence as 1.0 (safe)', () => {
      const changes: ClaudeMdChange[] = [
        makeChange({ confidence: undefined }),
      ];

      const result = guard.validate(changes);

      expect(result.issues.some((i) => i.includes('low-confidence'))).toBe(false);
    });

    it('counts multiple low-confidence changes in the message', () => {
      const changes: ClaudeMdChange[] = [
        makeChange({ confidence: 0.3, section: 'a' }),
        makeChange({ confidence: 0.4, section: 'b' }),
        makeChange({ confidence: 0.5, section: 'c' }),
      ];

      const result = guard.validate(changes);

      expect(result.issues.some((i) => i.includes('3'))).toBe(true);
    });

    // --- Blocked detection ---

    it('marks result as invalid only when manual deletion is blocked', () => {
      const changes: ClaudeMdChange[] = [
        makeChange({ confidence: 0.3 }), // low confidence - not a block
      ];

      const result = guard.validate(changes);

      // Low confidence issue is not a "Blocked:" issue
      expect(result.valid).toBe(true);
    });

    it('marks result as valid when only non-blocking issues exist', () => {
      const changes = Array.from({ length: 7 }, (_, i) =>
        makeChange({ section: `s-${i}`, confidence: 0.5 }),
      );

      const result = guard.validate(changes);

      // Rate limit + low confidence issues, but no manual deletion
      expect(result.valid).toBe(true);
      expect(result.issues.length).toBeGreaterThan(0);
    });

    // --- Multiple issue types ---

    it('reports multiple types of issues simultaneously', () => {
      const changes: ClaudeMdChange[] = [
        makeChange({ type: 'deleted', source: 'manual', section: 'custom' }),
        makeChange({ type: 'appended', content: 'x'.repeat(11 * 1024) }),
        makeChange({ confidence: 0.3 }),
        makeChange({ section: 'a' }),
        makeChange({ section: 'b' }),
        makeChange({ section: 'c' }),
      ];

      const result = guard.validate(changes);

      expect(result.valid).toBe(false);
      // Should have: blocked manual delete, rate limit, size, low confidence
      expect(result.issues.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ---------------------------------------------------------------------------
  // filterSafe()
  // ---------------------------------------------------------------------------

  describe('filterSafe', () => {
    it('removes changes that delete manual content', () => {
      const changes: ClaudeMdChange[] = [
        makeChange({ type: 'appended', section: 'a' }),
        makeChange({ type: 'deleted', source: 'manual', section: 'b' }),
        makeChange({ type: 'updated', section: 'c' }),
      ];

      const safe = guard.filterSafe(changes);

      expect(safe).toHaveLength(2);
      expect(safe.every((c) => !(c.type === 'deleted' && c.source === 'manual'))).toBe(true);
    });

    it('removes changes with confidence below 0.7', () => {
      const changes: ClaudeMdChange[] = [
        makeChange({ confidence: 0.9, section: 'a' }),
        makeChange({ confidence: 0.3, section: 'b' }),
        makeChange({ confidence: 0.7, section: 'c' }),
      ];

      const safe = guard.filterSafe(changes);

      expect(safe).toHaveLength(2);
      expect(safe.map((c) => c.section)).toEqual(['a', 'c']);
    });

    it('limits to max 5 changes', () => {
      const changes = Array.from({ length: 10 }, (_, i) =>
        makeChange({ confidence: 0.9 - i * 0.02, section: `s-${i}` }),
      );

      const safe = guard.filterSafe(changes);

      expect(safe).toHaveLength(5);
    });

    it('sorts by confidence descending before limiting', () => {
      const changes: ClaudeMdChange[] = [
        makeChange({ confidence: 0.7, section: 'low' }),
        makeChange({ confidence: 0.95, section: 'highest' }),
        makeChange({ confidence: 0.85, section: 'mid' }),
        makeChange({ confidence: 0.9, section: 'high' }),
        makeChange({ confidence: 0.8, section: 'mid-low' }),
        makeChange({ confidence: 0.75, section: 'lower' }),
      ];

      const safe = guard.filterSafe(changes);

      expect(safe).toHaveLength(5);
      expect(safe[0]!.section).toBe('highest');
      expect(safe[1]!.section).toBe('high');
      expect(safe[2]!.section).toBe('mid');
    });

    it('treats undefined confidence as 1.0 for sorting and filtering', () => {
      const changes: ClaudeMdChange[] = [
        makeChange({ confidence: 0.8, section: 'with-conf' }),
        makeChange({ confidence: undefined, section: 'no-conf' }),
      ];

      const safe = guard.filterSafe(changes);

      expect(safe).toHaveLength(2);
      // undefined confidence (treated as 1.0) should not be filtered out
      expect(safe.some((c) => c.section === 'no-conf')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  describe('edge cases', () => {
    it('validate returns valid with empty issues for empty change list', () => {
      const result = guard.validate([]);

      expect(result.valid).toBe(true);
      expect(result.issues).toEqual([]);
    });

    it('filterSafe returns empty array for empty input', () => {
      const safe = guard.filterSafe([]);

      expect(safe).toEqual([]);
    });

    it('validate handles all changes being safe', () => {
      const changes: ClaudeMdChange[] = [
        makeChange({ confidence: 0.9, section: 'a' }),
        makeChange({ confidence: 0.85, section: 'b' }),
      ];

      const result = guard.validate(changes);

      expect(result.valid).toBe(true);
      expect(result.issues).toEqual([]);
    });

    it('filterSafe returns all changes when all are safe and under limit', () => {
      const changes: ClaudeMdChange[] = [
        makeChange({ confidence: 0.9, section: 'a' }),
        makeChange({ confidence: 0.8, section: 'b' }),
        makeChange({ confidence: 0.75, section: 'c' }),
      ];

      const safe = guard.filterSafe(changes);

      expect(safe).toHaveLength(3);
    });

    it('handles changes with null-ish content in size calculation', () => {
      const changes: ClaudeMdChange[] = [
        makeChange({ type: 'appended', content: undefined }),
      ];

      const result = guard.validate(changes);

      // Should not throw and size should be treated as 0
      expect(result.valid).toBe(true);
    });

    it('singular grammar for single low-confidence change', () => {
      const changes: ClaudeMdChange[] = [
        makeChange({ confidence: 0.3 }),
      ];

      const result = guard.validate(changes);

      const lcIssue = result.issues.find((i) => i.includes('low-confidence'));
      expect(lcIssue).toBeDefined();
      expect(lcIssue).toContain('1');
      // "1 low-confidence change" (singular)
      expect(lcIssue).not.toContain('changes');
    });

    it('plural grammar for multiple low-confidence changes', () => {
      const changes: ClaudeMdChange[] = [
        makeChange({ confidence: 0.3, section: 'a' }),
        makeChange({ confidence: 0.4, section: 'b' }),
      ];

      const result = guard.validate(changes);

      const lcIssue = result.issues.find((i) => i.includes('low-confidence'));
      expect(lcIssue).toBeDefined();
      expect(lcIssue).toContain('changes');
    });
  });
});
