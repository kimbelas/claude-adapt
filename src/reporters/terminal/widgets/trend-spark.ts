import chalk from 'chalk';
import type { Trend } from '../../../types.js';

export function renderTrend(trend: Trend): string {
  if (trend.type === 'improvement') {
    return chalk.green(`  \u2191 ${trend.message}`);
  }
  return chalk.yellow(`  \u26A0 ${trend.message}`);
}

export function renderTrends(trends: Trend[]): string {
  if (trends.length === 0) return '';

  const lines = [''];
  for (const trend of trends) {
    lines.push(renderTrend(trend));
  }
  return lines.join('\n');
}
