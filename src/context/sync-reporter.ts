/**
 * Sync reporter — terminal output for sync results.
 *
 * Formats:
 *   - Session summary (commits, files, duration)
 *   - Decisions detected (applied vs. skipped)
 *   - Context updates (hotspots, conventions, patterns)
 *   - Insights
 *   - CLAUDE.md changes
 *   - Quick score delta
 */

import type { SyncReport, SyncOptions } from './types.js';

/**
 * Formats a sync report for terminal output.
 */
export class SyncReporter {
  /**
   * Generates a formatted terminal report string.
   */
  format(report: SyncReport, options: SyncOptions): string {
    if (options.quiet) {
      return this.formatQuiet(report);
    }

    const sections: string[] = [];

    sections.push(this.formatHeader());
    sections.push(this.formatSessionSummary(report));
    sections.push(this.formatDecisions(report, options));
    sections.push(this.formatContextUpdates(report));

    if (report.insights.length > 0) {
      sections.push(this.formatInsights(report));
    }

    if (report.claudeMdChanges.length > 0) {
      sections.push(this.formatClaudeMdChanges(report));
    }

    if (report.quickScore) {
      sections.push(this.formatQuickScore(report));
    }

    return sections.filter(Boolean).join('\n\n');
  }

  // ---------------------------------------------------------------------------
  // Quiet mode
  // ---------------------------------------------------------------------------

  private formatQuiet(report: SyncReport): string {
    const parts: string[] = [];

    parts.push(
      `sync: ${report.sessionSummary.commitCount} commits, ${report.sessionSummary.filesModified + report.sessionSummary.filesCreated} files`,
    );

    if (report.decisions.applied.length > 0) {
      parts.push(
        `decisions: ${report.decisions.applied.length} applied`,
      );
    }

    if (report.quickScore) {
      const delta = report.quickScore.delta;
      const sign = delta >= 0 ? '+' : '';
      parts.push(`score: ${report.quickScore.current} (${sign}${delta})`);
    }

    return parts.join(' | ');
  }

  // ---------------------------------------------------------------------------
  // Sections
  // ---------------------------------------------------------------------------

  private formatHeader(): string {
    return '  claude-adapt sync  --  analyzing session...';
  }

  private formatSessionSummary(report: SyncReport): string {
    const s = report.sessionSummary;
    const lines: string[] = [];

    lines.push('  SESSION SUMMARY');

    // Commit messages
    const commitSummary = s.commitMessages
      .slice(0, 5)
      .map((m) => m.slice(0, 60))
      .join(', ');
    lines.push(`  Commits: ${s.commitCount} (${commitSummary})`);

    // File changes
    const fileParts: string[] = [];
    if (s.filesModified > 0) fileParts.push(`${s.filesModified} modified`);
    if (s.filesCreated > 0) fileParts.push(`${s.filesCreated} created`);
    if (s.filesDeleted > 0) fileParts.push(`${s.filesDeleted} deleted`);
    lines.push(`  Files: ${fileParts.join(', ') || 'none'}`);

    // Duration
    const minutes = Math.round(s.estimatedDuration / 60_000);
    lines.push(`  Duration: ~${minutes} min`);

    return lines.join('\n');
  }

  private formatDecisions(report: SyncReport, options: SyncOptions): string {
    const lines: string[] = [];
    lines.push('  DECISIONS DETECTED');

    if (
      report.decisions.applied.length === 0 &&
      report.decisions.skipped.length === 0
    ) {
      lines.push('  (none)');
      return lines.join('\n');
    }

    for (const d of report.decisions.applied) {
      const section = d.claudeMdSection ? ` (-> ${d.claudeMdSection})` : '';
      lines.push(`  [applied] ${d.title}${section}`);
    }

    for (const d of report.decisions.skipped) {
      if (options.verbose) {
        lines.push(
          `  [skipped] ${d.title} (confidence: ${d.confidence.toFixed(2)})`,
        );
      }
    }

    if (!options.verbose && report.decisions.skipped.length > 0) {
      lines.push(
        `  (${report.decisions.skipped.length} low-confidence decision${report.decisions.skipped.length === 1 ? '' : 's'} skipped — use --verbose to see)`,
      );
    }

    return lines.join('\n');
  }

  private formatContextUpdates(report: SyncReport): string {
    const lines: string[] = [];
    lines.push('  CONTEXT UPDATED');

    if (report.contextUpdates.hotspotsChanged > 0) {
      lines.push(
        `  Hotspots: ${report.contextUpdates.hotspotsChanged} file${report.contextUpdates.hotspotsChanged === 1 ? '' : 's'} updated`,
      );
    }

    if (report.contextUpdates.patternsDetected > 0) {
      lines.push(
        `  Patterns: ${report.contextUpdates.patternsDetected} detected`,
      );
    }

    for (const drift of report.contextUpdates.conventionDrifts) {
      const prefix = drift.severity === 'warning' ? '[warning]' : '[info]';
      lines.push(`  Convention: ${prefix} ${drift.message}`);
    }

    if (
      report.contextUpdates.hotspotsChanged === 0 &&
      report.contextUpdates.patternsDetected === 0 &&
      report.contextUpdates.conventionDrifts.length === 0
    ) {
      lines.push('  (no changes)');
    }

    return lines.join('\n');
  }

  private formatInsights(report: SyncReport): string {
    const lines: string[] = [];
    lines.push('  INSIGHTS');

    for (const insight of report.insights) {
      const prefix = insight.actionable ? '[action]' : '[info]';
      lines.push(`  ${prefix} ${insight.title}`);
      if (insight.suggestion) {
        lines.push(`         ${insight.suggestion}`);
      }
    }

    return lines.join('\n');
  }

  private formatClaudeMdChanges(report: SyncReport): string {
    const lines: string[] = [];
    lines.push('  CLAUDE.MD CHANGES');

    for (const change of report.claudeMdChanges) {
      const prefix =
        change.type === 'appended'
          ? '+'
          : change.type === 'updated'
            ? '~'
            : change.type === 'drift-noted'
              ? '~'
              : '-';

      const reason = change.reason ? `: ${change.reason}` : '';
      lines.push(`  ${prefix} ${change.section}${reason}`);
    }

    return lines.join('\n');
  }

  private formatQuickScore(report: SyncReport): string {
    if (!report.quickScore) return '';

    const lines: string[] = [];
    const delta = report.quickScore.delta;
    const sign = delta >= 0 ? '+' : '';

    lines.push(
      `  QUICK SCORE: ${report.quickScore.current}/100 (${sign}${delta} since last sync)`,
    );

    for (const cat of report.quickScore.categoryChanges) {
      if (cat.delta !== 0) {
        const catSign = cat.delta > 0 ? '+' : '';
        lines.push(`  ${cat.delta > 0 ? 'up' : 'down'} ${cat.category}: ${catSign}${cat.delta}`);
      }
    }

    return lines.join('\n');
  }
}
