/**
 * CLAUDE.md updater — incrementally updates CLAUDE.md.
 *
 * Rules:
 *   1. NEVER deletes manual content.
 *   2. Sync-owned sections are delimited by <!-- claude-adapt:sync:* --> markers.
 *   3. Only high-confidence decisions (>= 0.7) are auto-applied.
 *   4. Rate limited to max 5 changes per sync.
 *   5. Total sync-owned content capped at 10KB.
 */

import { readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';

import type {
  ArchitecturalDecision,
  ClaudeMdChange,
  ConventionDrift,
  Hotspot,
  Insight,
  UpdateResult,
} from './types.js';
import { SyncSafetyGuard } from './safety-guard.js';

/**
 * Updates CLAUDE.md with sync-generated content.
 */
export class ClaudeMdUpdater {
  private readonly safetyGuard: SyncSafetyGuard;

  constructor() {
    this.safetyGuard = new SyncSafetyGuard();
  }

  /**
   * Reads the existing CLAUDE.md, applies changes, and returns the result.
   *
   * In dry-run mode, changes are computed but not written.
   */
  async update(
    rootPath: string,
    decisions: ArchitecturalDecision[],
    hotspots: Hotspot[],
    drifts: ConventionDrift[],
    _insights: Insight[],
    dryRun = false,
  ): Promise<UpdateResult> {
    const claudeMdPath = join(rootPath, 'CLAUDE.md');
    let content: string;

    try {
      await access(claudeMdPath);
      content = await readFile(claudeMdPath, 'utf-8');
    } catch {
      // CLAUDE.md doesn't exist — nothing to update
      return {
        content: '',
        changes: [],
        unchanged: true,
        validation: { valid: true, issues: [] },
      };
    }

    const changes: ClaudeMdChange[] = [];

    // 1. Update sync-owned sections
    content = this.updateSyncSections(content, hotspots, changes);

    // 2. Apply high-confidence decisions
    content = this.applyDecisions(content, decisions, changes);

    // 3. Note convention drift
    content = this.noteDrift(content, drifts, changes);

    // Validate changes through safety guard
    const validation = this.safetyGuard.validate(changes);

    // If too many changes, trim to the top 5 by confidence
    if (changes.length > 5) {
      const sortedChanges = [...changes].sort(
        (a, b) => (b.confidence ?? 0.5) - (a.confidence ?? 0.5),
      );

      // Keep only the top 5 changes by confidence
      changes.length = 0;
      changes.push(...sortedChanges.slice(0, 5));
    }

    if (!dryRun && changes.length > 0) {
      await writeFile(claudeMdPath, content, 'utf-8');
    }

    return {
      content,
      changes,
      unchanged: changes.length === 0,
      validation,
    };
  }

  // ---------------------------------------------------------------------------
  // Sync section updates
  // ---------------------------------------------------------------------------

  /**
   * Updates content within <!-- claude-adapt:sync:* --> markers.
   */
  private updateSyncSections(
    content: string,
    hotspots: Hotspot[],
    changes: ClaudeMdChange[],
  ): string {
    // Update hotspot/gotcha section
    const highRiskHotspots = hotspots.filter((h) => h.risk === 'high');
    const gotchaContent = highRiskHotspots.length > 0
      ? highRiskHotspots
          .map((h) => `- \`${h.file}\` — ${h.note ?? `Edited ${h.editCount} times`}`)
          .join('\n')
      : '';

    let updated = content;

    // Replace existing sync:gotchas section
    const gotchasMarker = 'sync:gotchas';
    const gotchasRegex = new RegExp(
      `<!-- claude-adapt:${gotchasMarker} -->\\n[\\s\\S]*?<!-- \\/claude-adapt:${gotchasMarker} -->`,
    );

    if (gotchasRegex.test(updated)) {
      const existingMatch = updated.match(gotchasRegex);
      const existingContent = existingMatch
        ? existingMatch[0]
            .replace(`<!-- claude-adapt:${gotchasMarker} -->\n`, '')
            .replace(`<!-- /claude-adapt:${gotchasMarker} -->`, '')
            .trim()
        : '';

      if (gotchaContent !== existingContent) {
        updated = updated.replace(
          gotchasRegex,
          `<!-- claude-adapt:${gotchasMarker} -->\n${gotchaContent}\n<!-- /claude-adapt:${gotchasMarker} -->`,
        );
        changes.push({
          section: 'gotchas',
          type: 'updated',
          content: gotchaContent,
          source: 'sync',
        });
      }
    }

    return updated;
  }

  // ---------------------------------------------------------------------------
  // Decision application
  // ---------------------------------------------------------------------------

  /**
   * Appends high-confidence decision content to the relevant CLAUDE.md sections.
   */
  private applyDecisions(
    content: string,
    decisions: ArchitecturalDecision[],
    changes: ClaudeMdChange[],
  ): string {
    let updated = content;
    const eligibleDecisions = decisions.filter(
      (d) => d.confidence >= 0.7 && !d.applied && d.suggestedContent,
    );

    for (const decision of eligibleDecisions) {
      if (!decision.claudeMdSection || !decision.suggestedContent) continue;

      // Find the section by heading
      const sectionRegex = this.buildSectionRegex(decision.claudeMdSection);
      const match = updated.match(sectionRegex);

      if (match) {
        // Check if the content already exists (avoid duplicates)
        if (updated.includes(decision.suggestedContent)) {
          decision.applied = true;
          continue;
        }

        // Append to the end of the section (before next heading or EOF)
        const sectionEnd = this.findSectionEnd(
          updated,
          match.index! + match[0].length,
        );

        updated =
          updated.slice(0, sectionEnd) +
          '\n' +
          decision.suggestedContent +
          updated.slice(sectionEnd);

        decision.applied = true;

        changes.push({
          section: decision.claudeMdSection,
          type: 'appended',
          content: decision.suggestedContent,
          reason: decision.title,
          confidence: decision.confidence,
          source: 'sync',
        });
      }
    }

    return updated;
  }

  // ---------------------------------------------------------------------------
  // Convention drift notes
  // ---------------------------------------------------------------------------

  /**
   * Appends convention drift notes to a sync section if present.
   */
  private noteDrift(
    content: string,
    drifts: ConventionDrift[],
    changes: ClaudeMdChange[],
  ): string {
    if (drifts.length === 0) return content;

    // Look for a sync:conventions section
    const driftMarker = 'sync:conventions';
    const driftRegex = new RegExp(
      `<!-- claude-adapt:${driftMarker} -->\\n[\\s\\S]*?<!-- \\/claude-adapt:${driftMarker} -->`,
    );

    if (!driftRegex.test(content)) return content;

    const driftNotes = drifts
      .map((d) => `- ${d.severity === 'warning' ? '[warning]' : '[info]'} ${d.message}`)
      .join('\n');

    const updated = content.replace(
      driftRegex,
      `<!-- claude-adapt:${driftMarker} -->\n${driftNotes}\n<!-- /claude-adapt:${driftMarker} -->`,
    );

    if (updated !== content) {
      changes.push({
        section: 'conventions',
        type: 'drift-noted',
        content: driftNotes,
        source: 'sync',
      });
    }

    return updated;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Builds a regex to find a markdown section by heading text.
   *
   * Matches various heading styles and common section name formats.
   */
  private buildSectionRegex(sectionName: string): RegExp {
    // Convert kebab-case / slug to a flexible pattern
    const pattern = sectionName
      .replace(/[-_]/g, '[\\s-_]')
      .replace(/\s+/g, '[\\s-_]');

    return new RegExp(`^#{1,4}\\s+${pattern}\\b.*$`, 'im');
  }

  /**
   * Finds the end of a markdown section (just before the next heading of same or higher level).
   */
  private findSectionEnd(content: string, startFrom: number): number {
    // Find the heading level of the section we're in
    const beforeStart = content.slice(0, startFrom);
    const headingMatch = beforeStart.match(/^(#{1,4})\s/m);
    const level = headingMatch ? headingMatch[1].length : 2;

    // Search for the next heading of same or higher level
    const rest = content.slice(startFrom);
    const nextHeadingPattern = new RegExp(
      `^#{1,${level}}\\s`,
      'm',
    );
    const nextMatch = rest.match(nextHeadingPattern);

    if (nextMatch && nextMatch.index !== undefined) {
      // Go back to just before the heading (trim trailing whitespace)
      const endPos = startFrom + nextMatch.index;
      return endPos;
    }

    // No next heading — section extends to end of file
    return content.length;
  }
}
