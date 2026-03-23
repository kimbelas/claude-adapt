import chalk from 'chalk';

export const minimalTheme = {
  header: {
    border: chalk.white,
    title: chalk.bold,
    info: chalk.gray,
  },
  score: {
    excellent: chalk.white,
    good: chalk.white,
    poor: chalk.white,
  },
  tier: {
    1: { label: 'Core', marker: '-' },
    2: { label: 'Enhancement', marker: '-' },
    3: { label: 'Quality', marker: '-' },
  },
  footer: chalk.gray,
} as const;
