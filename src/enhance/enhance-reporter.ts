/**
 * Reporter for enhance analysis results.
 *
 * Renders the analysis as a step-by-step action plan in the terminal
 * (with chalk-colored output), or as a JSON structure for programmatic use.
 */

import chalk from 'chalk';

import type { EnhanceAnalysis, EnhanceSuggestion } from './types.js';
import type { ConfigSuggestion } from './types.js';
import type { QualityBreakdown } from './quality-scorer.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DRAFT_MAX_LINES = 20;

// ---------------------------------------------------------------------------
// EnhanceReporter
// ---------------------------------------------------------------------------

export class EnhanceReporter {
  /**
   * Render the full enhance report for terminal display.
   *
   * Produces a multi-section string with colored output including the
   * quality score breakdown, a numbered action plan of suggestions,
   * and a summary with total potential improvement.
   */
  renderTerminal(
    analysis: EnhanceAnalysis,
    breakdown: QualityBreakdown,
    configSuggestions: ConfigSuggestion[],
    projectName: string,
  ): string {
    const lines: string[] = [];

    // -- Header --------------------------------------------------------------
    lines.push('');
    lines.push(chalk.bold(`Claude Code Config Analysis for ${projectName}`));
    lines.push('');

    // -- Quality score breakdown ---------------------------------------------
    const scoreColor = this.getScoreColor(breakdown.total);
    const r = (n: number) => Math.round(n * 10) / 10;
    lines.push(`  Config Quality: ${scoreColor(`${r(breakdown.total)}/100`)}`);
    lines.push(`    Coverage:    ${r(breakdown.coverage)}/30`);
    lines.push(`    Depth:       ${r(breakdown.depth)}/20`);
    lines.push(`    Specificity: ${r(breakdown.specificity)}/20`);
    lines.push(`    Accuracy:    ${r(breakdown.accuracy)}/15`);
    lines.push(`    Freshness:   ${r(breakdown.freshness)}/15`);
    lines.push('');

    // -- Merge all suggestions into a single numbered list -------------------
    const allSuggestions = this.mergeItems(analysis.suggestions, configSuggestions);
    const totalCount = allSuggestions.length;

    if (totalCount === 0) {
      lines.push(this.renderCongrats());
      return lines.join('\n');
    }

    lines.push(chalk.bold(`  ACTION PLAN (${totalCount} improvements found)`));
    lines.push('');

    let totalGain = 0;
    let itemNumber = 1;

    // -- CLAUDE.md suggestions -----------------------------------------------
    for (const suggestion of analysis.suggestions) {
      lines.push(this.renderSuggestionItem(itemNumber, suggestion));
      totalGain += suggestion.pointsGain;
      itemNumber++;
    }

    // -- Config suggestions --------------------------------------------------
    for (const cs of configSuggestions) {
      lines.push(this.renderConfigSuggestionItem(itemNumber, cs));
      totalGain += cs.pointsGain;
      itemNumber++;
    }

    // -- Summary -------------------------------------------------------------
    const currentRounded = Math.round(breakdown.total);
    const newScore = Math.min(100, currentRounded + totalGain);
    lines.push(
      chalk.bold(`  Total potential improvement: +${totalGain} pts (${currentRounded} \u2192 ${newScore})`),
    );
    lines.push(
      chalk.cyan(`  Run 'claude-adapt enhance --apply' to apply all \u2192`),
    );
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Render the analysis as a JSON string for programmatic consumption.
   */
  renderJson(
    analysis: EnhanceAnalysis,
    breakdown: QualityBreakdown,
    configSuggestions: ConfigSuggestion[],
  ): string {
    const totalPotentialGain =
      analysis.suggestions.reduce((sum, s) => sum + s.pointsGain, 0) +
      configSuggestions.reduce((sum, s) => sum + s.pointsGain, 0);

    const data = {
      qualityScore: analysis.qualityScore,
      breakdown,
      hasExistingConfig: analysis.hasExistingConfig,
      configPath: analysis.configPath,
      suggestions: analysis.suggestions,
      configSuggestions,
      totalPotentialGain,
    };

    return JSON.stringify(data, null, 2);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Return the appropriate chalk color function based on score value.
   */
  private getScoreColor(score: number): typeof chalk.green {
    if (score >= 80) return chalk.green;
    if (score >= 50) return chalk.yellow;
    return chalk.red;
  }

  /**
   * Merge CLAUDE.md suggestions and config suggestions into a combined
   * array for counting purposes.
   */
  private mergeItems(
    suggestions: EnhanceSuggestion[],
    configSuggestions: ConfigSuggestion[],
  ): Array<EnhanceSuggestion | ConfigSuggestion> {
    return [...suggestions, ...configSuggestions];
  }

  /**
   * Render a single CLAUDE.md suggestion as a numbered action item.
   */
  private renderSuggestionItem(index: number, suggestion: EnhanceSuggestion): string {
    const lines: string[] = [];

    // Title line with points gain
    lines.push(
      `  ${index}. ${suggestion.title}${' '.repeat(Math.max(1, 40 - suggestion.title.length))}${chalk.cyan(`[+${suggestion.pointsGain} pts]`)}`,
    );

    // WHY
    lines.push(`     ${chalk.yellow.bold('WHY:')} ${suggestion.description}`);
    lines.push('');

    // WHAT TO ADD
    lines.push(`     ${chalk.green.bold('WHAT TO ADD:')}`);
    lines.push(this.formatDraftContent(suggestion.draftContent));
    lines.push('');

    // HOW
    const howText = suggestion.targetSection
      ? `Add to the '${suggestion.targetSection}' section in CLAUDE.md`
      : 'Add new section to CLAUDE.md';
    lines.push(`     ${chalk.blue.bold('HOW:')} ${howText}`);
    lines.push(`     Or run: claude-adapt enhance --apply`);
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Render a single config suggestion as a numbered action item.
   */
  private renderConfigSuggestionItem(index: number, suggestion: ConfigSuggestion): string {
    const lines: string[] = [];

    // Title line with points gain
    lines.push(
      `  ${index}. ${suggestion.title}${' '.repeat(Math.max(1, 40 - suggestion.title.length))}${chalk.cyan(`[+${suggestion.pointsGain} pts]`)}`,
    );

    // WHY
    lines.push(`     ${chalk.yellow.bold('WHY:')} ${suggestion.description}`);
    lines.push('');

    // WHAT TO ADD
    lines.push(`     ${chalk.green.bold('WHAT TO ADD:')}`);
    lines.push(this.formatDraftContent(suggestion.draftContent));
    lines.push('');

    // HOW
    lines.push(`     ${chalk.blue.bold('HOW:')} Edit ${suggestion.targetFile}`);
    lines.push(`     Or run: claude-adapt enhance --apply`);
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Format draft content for terminal display.
   *
   * Each line is indented 5 spaces and rendered in dim color.
   * Content longer than DRAFT_MAX_LINES is truncated with a notice.
   */
  private formatDraftContent(content: string): string {
    const allLines = content.split('\n');
    const truncated = allLines.length > DRAFT_MAX_LINES;
    const visibleLines = truncated ? allLines.slice(0, DRAFT_MAX_LINES) : allLines;

    const formatted = visibleLines
      .map((line) => `     ${chalk.dim(line)}`)
      .join('\n');

    if (truncated) {
      return formatted + '\n' + `     ${chalk.dim('[...truncated]')}`;
    }

    return formatted;
  }

  /**
   * Return a congratulatory message when no improvements are needed.
   */
  private renderCongrats(): string {
    const lines: string[] = [];
    lines.push(
      chalk.bold('  Your Claude Code configuration is in great shape!'),
    );
    lines.push('  No improvements found. Keep up the good work.');
    lines.push('');
    return lines.join('\n');
  }
}
