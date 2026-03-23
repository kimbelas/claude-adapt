import chalk from 'chalk';
import type { Recommendation } from '../../../types.js';

export function renderRecommendation(rec: Recommendation, index: number): string {
  const effortColor = {
    low: chalk.green,
    medium: chalk.yellow,
    high: chalk.red,
  }[rec.effort];

  const effortLabel = effortColor(`${rec.effort.toUpperCase()} effort`);
  const points = chalk.cyan(`+${Math.round(rec.gap)} pts`);
  const title = chalk.white(rec.title);

  const lines = [`  ${index + 1}. [${effortLabel} \u00B7 ${points}] ${title}`];

  if (rec.description) {
    lines.push(chalk.gray(`     \u2192 ${rec.description}`));
  }

  return lines.join('\n');
}

export function renderRecommendations(recs: Recommendation[]): string {
  if (recs.length === 0) return '';

  const lines = [
    '',
    chalk.bold('  RECOMMENDATIONS (ranked by impact/effort)'),
  ];

  for (let i = 0; i < Math.min(recs.length, 10); i++) {
    lines.push(renderRecommendation(recs[i], i));
  }

  if (recs.length > 10) {
    lines.push(chalk.gray(`  ... and ${recs.length - 10} more`));
  }

  return lines.join('\n');
}
