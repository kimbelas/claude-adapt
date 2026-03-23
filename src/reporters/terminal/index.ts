import chalk from 'chalk';
import type { Reporter, ReportData } from '../renderer.js';

import { renderTotalScore } from './widgets/score-bar.js';
import { renderCategoryRow, type CategoryRowData } from './widgets/category-row.js';
import { renderRecommendations } from './widgets/recommendation.js';
import { renderTrends } from './widgets/trend-spark.js';

const CATEGORY_DISPLAY: Record<string, { name: string; tier: 1 | 2 | 3 }> = {
  documentation: { name: 'Documentation', tier: 1 },
  modularity: { name: 'Modularity', tier: 1 },
  conventions: { name: 'Conventions', tier: 1 },
  typeSafety: { name: 'Type Safety', tier: 2 },
  testCoverage: { name: 'Test Coverage', tier: 2 },
  gitHygiene: { name: 'Git Hygiene', tier: 2 },
  cicd: { name: 'CI/CD', tier: 3 },
  dependencies: { name: 'Dependencies', tier: 3 },
};

export class TerminalReporter implements Reporter {
  render(data: ReportData): string {
    const lines: string[] = [];

    // Header box
    lines.push(this.renderHeader(data));
    lines.push('');

    // Total score
    lines.push(renderTotalScore(data.scoreResult.total));
    lines.push('');

    // Category rows by tier
    for (const tier of [1, 2, 3] as const) {
      lines.push(this.renderTierHeader(tier));

      const categories = Object.entries(data.scoreResult.categories)
        .filter(([key]) => CATEGORY_DISPLAY[key]?.tier === tier);

      for (const [key, catScore] of categories) {
        const display = CATEGORY_DISPLAY[key];
        if (!display) continue;

        const rowData: CategoryRowData = {
          name: display.name,
          score: catScore.normalized,
          max: catScore.max,
          summary: catScore.summary,
          tier,
        };
        lines.push(renderCategoryRow(rowData));
      }
      lines.push('');
    }

    // Trends
    const trendsStr = renderTrends(data.trends);
    if (trendsStr) lines.push(trendsStr);

    // Recommendations
    const recsStr = renderRecommendations(data.recommendations);
    if (recsStr) lines.push(recsStr);

    // Footer
    lines.push('');
    lines.push(chalk.cyan("  Run 'claude-adapt init' to generate optimized config \u2192"));
    lines.push('');

    return lines.join('\n');
  }

  private renderHeader(data: ReportData): string {
    const border = chalk.cyan;
    const width = 37;
    const top = border(`\u256D${'─'.repeat(width)}\u256E`);
    const bottom = border(`\u2570${'─'.repeat(width)}\u256F`);
    const line = (text: string) => {
      // eslint-disable-next-line no-control-regex
      const stripped = text.replace(/\x1b\[[0-9;]*m/g, '');
      const pad = width - stripped.length - 1;
      return border('\u2502') + `  ${text}${' '.repeat(Math.max(0, pad))}` + border('\u2502');
    };

    return [
      top,
      line(chalk.bold(`claude-adapt score  \u2022  v${data.version}`)),
      line(chalk.gray(`Repo: ${data.repoName}`)),
      bottom,
    ].join('\n');
  }

  private renderTierHeader(tier: 1 | 2 | 3): string {
    const labels: Record<number, string> = {
      1: chalk.bold('  TIER 1 (Core Effectiveness)'),
      2: chalk.bold('  TIER 2 (Enhancement)'),
      3: chalk.bold('  TIER 3 (Quality Signals)'),
    };
    return labels[tier] ?? '';
  }
}
