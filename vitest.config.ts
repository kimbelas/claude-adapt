import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts', 'test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/__tests__/**', 'src/cli.ts'],
    },
  },
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core'),
      '@analyzers': resolve(__dirname, 'src/analyzers'),
      '@reporters': resolve(__dirname, 'src/reporters'),
      '@generators': resolve(__dirname, 'src/generators'),
      '@skills': resolve(__dirname, 'src/skills'),
      '@context': resolve(__dirname, 'src/context'),
      '@utils': resolve(__dirname, 'src/utils'),
    },
  },
});
