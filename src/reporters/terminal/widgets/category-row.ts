import chalk from 'chalk';
import { renderScoreBar } from './score-bar.js';

export interface CategoryRowData {
  name: string;
  score: number;
  max: number;
  summary: string;
  tier: 1 | 2 | 3;
}

const TIER_MARKERS: Record<number, string> = {
  1: '\u25CF', // ●
  2: '\u25CB', // ○
  3: '\u25E6', // ◦
};

export function renderCategoryRow(data: CategoryRowData): string {
  const marker = TIER_MARKERS[data.tier] ?? '\u25CF';
  const bar = renderScoreBar(data.score, data.max, 12);
  const name = data.name.padEnd(20);
  const roundedScore = (Math.round(data.score * 10) / 10).toFixed(1);
  const scoreStr = `${roundedScore.padStart(4)}/${data.max}`;
  const summary = data.summary ? chalk.gray(`  ${data.summary}`) : '';

  return `  ${marker} ${name} ${bar}  ${scoreStr}${summary}`;
}
