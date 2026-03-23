import chalk from 'chalk';

export function renderScoreBar(score: number, max: number, width = 20): string {
  const filled = Math.round((score / max) * width);
  const empty = width - filled;

  let color: typeof chalk.green;
  const ratio = score / max;
  if (ratio >= 0.8) color = chalk.green;
  else if (ratio >= 0.5) color = chalk.yellow;
  else color = chalk.red;

  const bar = color('\u2588'.repeat(filled)) + chalk.gray('\u2591'.repeat(empty));
  return bar;
}

export function renderTotalScore(score: number): string {
  let color: typeof chalk.green;
  if (score >= 80) color = chalk.green;
  else if (score >= 50) color = chalk.yellow;
  else color = chalk.red;

  const bar = renderScoreBar(score, 100, 20);
  const rounded = (Math.round(score * 10) / 10).toFixed(1);
  return `  Claude Code Readiness Score: ${color(`${rounded}/100`)}  ${bar}`;
}
