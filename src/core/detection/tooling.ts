import { access } from 'node:fs/promises';
import { join } from 'node:path';

export interface ToolingInfo {
  linters: string[];
  formatters: string[];
  ci: string[];
  bundlers: string[];
  testRunners: string[];
}

interface ToolRule {
  name: string;
  category: keyof ToolingInfo;
  configFiles: string[];
}

const TOOL_RULES: ToolRule[] = [
  // Linters
  { name: 'ESLint', category: 'linters', configFiles: ['.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json', '.eslintrc.yml', '.eslintrc.yaml', 'eslint.config.js', 'eslint.config.mjs', 'eslint.config.ts'] },
  { name: 'Biome', category: 'linters', configFiles: ['biome.json', 'biome.jsonc'] },
  { name: 'Pylint', category: 'linters', configFiles: ['.pylintrc', 'pylintrc'] },
  { name: 'Flake8', category: 'linters', configFiles: ['.flake8'] },
  { name: 'Ruff', category: 'linters', configFiles: ['ruff.toml', '.ruff.toml'] },
  { name: 'PHPStan', category: 'linters', configFiles: ['phpstan.neon', 'phpstan.neon.dist'] },
  { name: 'PHP_CodeSniffer', category: 'linters', configFiles: ['phpcs.xml', 'phpcs.xml.dist'] },
  { name: 'RuboCop', category: 'linters', configFiles: ['.rubocop.yml'] },
  { name: 'golangci-lint', category: 'linters', configFiles: ['.golangci.yml', '.golangci.yaml', '.golangci.toml'] },
  { name: 'Clippy', category: 'linters', configFiles: ['clippy.toml', '.clippy.toml'] },
  { name: 'Stylelint', category: 'linters', configFiles: ['.stylelintrc', '.stylelintrc.json', '.stylelintrc.yml', 'stylelint.config.js', 'stylelint.config.mjs'] },

  // Formatters
  { name: 'Prettier', category: 'formatters', configFiles: ['.prettierrc', '.prettierrc.js', '.prettierrc.cjs', '.prettierrc.json', '.prettierrc.yml', '.prettierrc.yaml', '.prettierrc.toml', 'prettier.config.js', 'prettier.config.mjs'] },
  { name: 'Black', category: 'formatters', configFiles: ['pyproject.toml'] },
  { name: 'gofmt', category: 'formatters', configFiles: ['.gofmt'] },
  { name: 'rustfmt', category: 'formatters', configFiles: ['rustfmt.toml', '.rustfmt.toml'] },

  // CI
  { name: 'GitHub Actions', category: 'ci', configFiles: ['.github/workflows/ci.yml', '.github/workflows/ci.yaml', '.github/workflows/build.yml', '.github/workflows/test.yml', '.github/workflows/main.yml'] },
  { name: 'GitLab CI', category: 'ci', configFiles: ['.gitlab-ci.yml'] },
  { name: 'CircleCI', category: 'ci', configFiles: ['.circleci/config.yml'] },
  { name: 'Travis CI', category: 'ci', configFiles: ['.travis.yml'] },
  { name: 'Jenkins', category: 'ci', configFiles: ['Jenkinsfile'] },
  { name: 'Azure Pipelines', category: 'ci', configFiles: ['azure-pipelines.yml'] },

  // Bundlers
  { name: 'Webpack', category: 'bundlers', configFiles: ['webpack.config.js', 'webpack.config.ts', 'webpack.config.mjs'] },
  { name: 'Vite', category: 'bundlers', configFiles: ['vite.config.js', 'vite.config.ts', 'vite.config.mjs'] },
  { name: 'Rollup', category: 'bundlers', configFiles: ['rollup.config.js', 'rollup.config.ts', 'rollup.config.mjs'] },
  { name: 'esbuild', category: 'bundlers', configFiles: ['esbuild.config.js', 'esbuild.config.mjs'] },
  { name: 'tsup', category: 'bundlers', configFiles: ['tsup.config.ts', 'tsup.config.js'] },
  { name: 'Parcel', category: 'bundlers', configFiles: ['.parcelrc'] },
  { name: 'Turbopack', category: 'bundlers', configFiles: ['turbo.json'] },

  // Test Runners
  { name: 'Vitest', category: 'testRunners', configFiles: ['vitest.config.ts', 'vitest.config.js', 'vitest.config.mjs'] },
  { name: 'Jest', category: 'testRunners', configFiles: ['jest.config.js', 'jest.config.ts', 'jest.config.mjs', 'jest.config.cjs'] },
  { name: 'Mocha', category: 'testRunners', configFiles: ['.mocharc.yml', '.mocharc.yaml', '.mocharc.json', '.mocharc.js'] },
  { name: 'pytest', category: 'testRunners', configFiles: ['pytest.ini', 'pyproject.toml', 'setup.cfg'] },
  { name: 'PHPUnit', category: 'testRunners', configFiles: ['phpunit.xml', 'phpunit.xml.dist'] },
  { name: 'RSpec', category: 'testRunners', configFiles: ['.rspec'] },
  { name: 'Playwright', category: 'testRunners', configFiles: ['playwright.config.ts', 'playwright.config.js'] },
  { name: 'Cypress', category: 'testRunners', configFiles: ['cypress.config.js', 'cypress.config.ts', 'cypress.json'] },
];

export class ToolingDetector {
  async detect(rootPath: string): Promise<ToolingInfo> {
    const result: ToolingInfo = {
      linters: [],
      formatters: [],
      ci: [],
      bundlers: [],
      testRunners: [],
    };

    for (const rule of TOOL_RULES) {
      for (const configFile of rule.configFiles) {
        try {
          await access(join(rootPath, configFile));
          if (!result[rule.category].includes(rule.name)) {
            result[rule.category].push(rule.name);
          }
          break;
        } catch { /* file doesn't exist */ }
      }
    }

    return result;
  }
}
