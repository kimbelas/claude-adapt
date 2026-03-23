import chalk from 'chalk';

export const defaultTheme = {
  header: {
    border: chalk.cyan,
    title: chalk.bold.white,
    info: chalk.gray,
  },
  score: {
    excellent: chalk.green,
    good: chalk.yellow,
    poor: chalk.red,
  },
  tier: {
    1: { label: chalk.bold('TIER 1 (Core Effectiveness)'), marker: '\u25CF' },
    2: { label: chalk.bold('TIER 2 (Enhancement)'), marker: '\u25CB' },
    3: { label: chalk.bold('TIER 3 (Quality Signals)'), marker: '\u25E6' },
  },
  footer: chalk.cyan,
} as const;
