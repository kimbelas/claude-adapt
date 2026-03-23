import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'node18',
  esbuildOptions(options) {
    options.alias = {
      '@core': './src/core',
      '@analyzers': './src/analyzers',
      '@reporters': './src/reporters',
      '@generators': './src/generators',
      '@skills': './src/skills',
      '@context': './src/context',
      '@utils': './src/utils',
    };
  },
});
