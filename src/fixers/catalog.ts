/**
 * Auto-fixer catalog — all 15 auto-fixable signal fixers.
 *
 * Each fixer is idempotent: it checks whether the fix is already
 * applied before making changes, and skips if so.
 */

import { readFile, writeFile, access, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';

import type { FixAction, FixContext, FixResult } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile(filePath: string): Promise<any> {
  try {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function writeJsonFile(filePath: string, data: any): Promise<void> {
  await writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function hasPrimaryLanguage(ctx: FixContext, lang: string): boolean {
  return ctx.profile.languages.some(
    (l) => l.name.toLowerCase() === lang.toLowerCase(),
  );
}

function isTypeScriptProject(ctx: FixContext): boolean {
  return hasPrimaryLanguage(ctx, 'TypeScript');
}

function isPythonProject(ctx: FixContext): boolean {
  return hasPrimaryLanguage(ctx, 'Python');
}

// ---------------------------------------------------------------------------
// File creation fixers
// ---------------------------------------------------------------------------

const changelogFixer: FixAction = {
  signalId: 'doc.changelog',
  type: 'create-file',
  description: 'Create CHANGELOG.md with Keep a Changelog template',
  async execute(ctx: FixContext): Promise<FixResult> {
    const target = join(ctx.targetPath, 'CHANGELOG.md');

    if (await fileExists(target)) {
      return {
        signalId: this.signalId,
        applied: false,
        description: this.description,
        skipped: 'CHANGELOG.md already exists',
      };
    }

    if (ctx.dryRun) {
      return {
        signalId: this.signalId,
        applied: false,
        description: this.description,
        skipped: 'dry-run mode',
      };
    }

    const content = `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

### Changed

### Fixed
`;

    await writeFile(target, content, 'utf-8');

    return {
      signalId: this.signalId,
      applied: true,
      description: this.description,
      filesCreated: ['CHANGELOG.md'],
    };
  },
};

const editorconfigFixer: FixAction = {
  signalId: 'conv.editorconfig',
  type: 'create-file',
  description: 'Create .editorconfig with sensible defaults',
  async execute(ctx: FixContext): Promise<FixResult> {
    const target = join(ctx.targetPath, '.editorconfig');

    if (await fileExists(target)) {
      return {
        signalId: this.signalId,
        applied: false,
        description: this.description,
        skipped: '.editorconfig already exists',
      };
    }

    if (ctx.dryRun) {
      return {
        signalId: this.signalId,
        applied: false,
        description: this.description,
        skipped: 'dry-run mode',
      };
    }

    const indentSize = isPythonProject(ctx) ? '4' : '2';

    const content = `# EditorConfig — https://editorconfig.org
root = true

[*]
indent_style = space
indent_size = ${indentSize}
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false

[Makefile]
indent_style = tab
`;

    await writeFile(target, content, 'utf-8');

    return {
      signalId: this.signalId,
      applied: true,
      description: this.description,
      filesCreated: ['.editorconfig'],
    };
  },
};

const formatterFixer: FixAction = {
  signalId: 'conv.formatter.exists',
  type: 'create-file',
  description: 'Create formatter configuration file',
  async execute(ctx: FixContext): Promise<FixResult> {
    if (isPythonProject(ctx)) {
      return applyPythonFormatter(ctx, this);
    }

    // Default to Prettier for JS/TS ecosystems
    return applyPrettierFormatter(ctx, this);
  },
};

async function applyPrettierFormatter(
  ctx: FixContext,
  action: FixAction,
): Promise<FixResult> {
  const prettierFiles = [
    '.prettierrc',
    '.prettierrc.json',
    '.prettierrc.yml',
    '.prettierrc.yaml',
    '.prettierrc.js',
    '.prettierrc.cjs',
    '.prettierrc.mjs',
    'prettier.config.js',
    'prettier.config.cjs',
    'prettier.config.mjs',
  ];

  for (const f of prettierFiles) {
    if (await fileExists(join(ctx.targetPath, f))) {
      return {
        signalId: action.signalId,
        applied: false,
        description: action.description,
        skipped: `${f} already exists`,
      };
    }
  }

  if (ctx.dryRun) {
    return {
      signalId: action.signalId,
      applied: false,
      description: action.description,
      skipped: 'dry-run mode',
    };
  }

  const config = {
    semi: true,
    singleQuote: true,
    trailingComma: 'all',
    printWidth: 100,
    tabWidth: 2,
  };

  await writeFile(
    join(ctx.targetPath, '.prettierrc'),
    JSON.stringify(config, null, 2) + '\n',
    'utf-8',
  );

  return {
    signalId: action.signalId,
    applied: true,
    description: action.description,
    filesCreated: ['.prettierrc'],
  };
}

async function applyPythonFormatter(
  ctx: FixContext,
  action: FixAction,
): Promise<FixResult> {
  const pyprojectPath = join(ctx.targetPath, 'pyproject.toml');
  const exists = await fileExists(pyprojectPath);

  if (exists) {
    const content = await readFile(pyprojectPath, 'utf-8');
    if (content.includes('[tool.black]') || content.includes('[tool.ruff')) {
      return {
        signalId: action.signalId,
        applied: false,
        description: action.description,
        skipped: 'Python formatter config already present in pyproject.toml',
      };
    }
  }

  if (ctx.dryRun) {
    return {
      signalId: action.signalId,
      applied: false,
      description: action.description,
      skipped: 'dry-run mode',
    };
  }

  const blackConfig = `
[tool.black]
line-length = 88
target-version = ["py311"]
`;

  if (exists) {
    const content = await readFile(pyprojectPath, 'utf-8');
    await writeFile(pyprojectPath, content + '\n' + blackConfig, 'utf-8');
    return {
      signalId: action.signalId,
      applied: true,
      description: action.description,
      filesModified: ['pyproject.toml'],
    };
  }

  await writeFile(pyprojectPath, blackConfig.trimStart(), 'utf-8');
  return {
    signalId: action.signalId,
    applied: true,
    description: action.description,
    filesCreated: ['pyproject.toml'],
  };
}

const architectureFixer: FixAction = {
  signalId: 'doc.architecture',
  type: 'create-file',
  description: 'Create ARCHITECTURE.md skeleton',
  async execute(ctx: FixContext): Promise<FixResult> {
    const target = join(ctx.targetPath, 'ARCHITECTURE.md');

    if (await fileExists(target)) {
      return {
        signalId: this.signalId,
        applied: false,
        description: this.description,
        skipped: 'ARCHITECTURE.md already exists',
      };
    }

    if (ctx.dryRun) {
      return {
        signalId: this.signalId,
        applied: false,
        description: this.description,
        skipped: 'dry-run mode',
      };
    }

    const content = `# Architecture

## Overview

<!-- Describe the high-level architecture of this project. -->

## Key Components

<!-- List the major components/modules and their responsibilities. -->

## Data Flow

<!-- Describe how data flows through the system. -->

## Design Decisions

<!-- Document important architectural decisions and their rationale. -->

## Directory Structure

\`\`\`
<!-- Add your project directory structure here. -->
\`\`\`
`;

    await writeFile(target, content, 'utf-8');

    return {
      signalId: this.signalId,
      applied: true,
      description: this.description,
      filesCreated: ['ARCHITECTURE.md'],
    };
  },
};

const gitignoreFixer: FixAction = {
  signalId: 'git.ignore.quality',
  type: 'modify-file',
  description: 'Append missing patterns to .gitignore',
  async execute(ctx: FixContext): Promise<FixResult> {
    const target = join(ctx.targetPath, '.gitignore');
    let existing = '';

    if (await fileExists(target)) {
      existing = await readFile(target, 'utf-8');
    }

    const patternsToAdd: string[] = [];

    // Common patterns that should always be present
    const commonPatterns = ['.env', '.env.local', '.DS_Store', 'Thumbs.db'];
    for (const p of commonPatterns) {
      if (!existing.includes(p)) {
        patternsToAdd.push(p);
      }
    }

    // Node.js ecosystem
    if (hasPrimaryLanguage(ctx, 'TypeScript') || hasPrimaryLanguage(ctx, 'JavaScript')) {
      const nodePatterns = ['node_modules/', 'dist/', 'coverage/', '*.tsbuildinfo'];
      for (const p of nodePatterns) {
        if (!existing.includes(p.replace('/', ''))) {
          patternsToAdd.push(p);
        }
      }
    }

    // Python ecosystem
    if (isPythonProject(ctx)) {
      const pyPatterns = [
        '__pycache__/',
        '*.pyc',
        '.venv/',
        'venv/',
        '*.egg-info/',
        'dist/',
        '.mypy_cache/',
      ];
      for (const p of pyPatterns) {
        if (!existing.includes(p.replace('/', ''))) {
          patternsToAdd.push(p);
        }
      }
    }

    if (patternsToAdd.length === 0) {
      return {
        signalId: this.signalId,
        applied: false,
        description: this.description,
        skipped: '.gitignore already covers common patterns',
      };
    }

    if (ctx.dryRun) {
      return {
        signalId: this.signalId,
        applied: false,
        description: this.description,
        skipped: 'dry-run mode',
      };
    }

    const addition =
      '\n# Added by claude-adapt --fix\n' + patternsToAdd.join('\n') + '\n';

    await writeFile(target, existing + addition, 'utf-8');

    return {
      signalId: this.signalId,
      applied: true,
      description: `Appended ${patternsToAdd.length} patterns to .gitignore`,
      filesModified: ['.gitignore'],
    };
  },
};

const cicdPipelineFixer: FixAction = {
  signalId: 'cicd.pipeline',
  type: 'create-file',
  description: 'Create .github/workflows/ci.yml based on detected stack',
  async execute(ctx: FixContext): Promise<FixResult> {
    const target = join(ctx.targetPath, '.github', 'workflows', 'ci.yml');

    if (await fileExists(target)) {
      return {
        signalId: this.signalId,
        applied: false,
        description: this.description,
        skipped: 'CI workflow already exists',
      };
    }

    if (ctx.dryRun) {
      return {
        signalId: this.signalId,
        applied: false,
        description: this.description,
        skipped: 'dry-run mode',
      };
    }

    let content: string;

    if (isPythonProject(ctx)) {
      content = `name: CI

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        python-version: ["3.11", "3.12"]

    steps:
      - uses: actions/checkout@v4
      - name: Set up Python \${{ matrix.python-version }}
        uses: actions/setup-python@v5
        with:
          python-version: \${{ matrix.python-version }}
      - name: Install dependencies
        run: pip install -r requirements.txt
      - name: Run tests
        run: python -m pytest
`;
    } else {
      content = `name: CI

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

jobs:
  build:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20, 22]

    steps:
      - uses: actions/checkout@v4
      - name: Use Node.js \${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node-version }}
          cache: npm
      - run: npm ci
      - run: npm run build --if-present
      - run: npm test
`;
    }

    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, 'utf-8');

    return {
      signalId: this.signalId,
      applied: true,
      description: this.description,
      filesCreated: ['.github/workflows/ci.yml'],
    };
  },
};

// ---------------------------------------------------------------------------
// Config change fixers
// ---------------------------------------------------------------------------

const typeStrictnessFixer: FixAction = {
  signalId: 'type.strictness',
  type: 'config-change',
  description: 'Set "strict": true in tsconfig.json',
  async execute(ctx: FixContext): Promise<FixResult> {
    if (!isTypeScriptProject(ctx)) {
      return {
        signalId: this.signalId,
        applied: false,
        description: this.description,
        skipped: 'Not a TypeScript project',
      };
    }

    const tsconfigPath = join(ctx.targetPath, 'tsconfig.json');

    if (!(await fileExists(tsconfigPath))) {
      return {
        signalId: this.signalId,
        applied: false,
        description: this.description,
        skipped: 'tsconfig.json not found',
      };
    }

    const tsconfig = await readJsonFile(tsconfigPath);
    if (!tsconfig) {
      return {
        signalId: this.signalId,
        applied: false,
        description: this.description,
        skipped: 'Could not parse tsconfig.json',
      };
    }

    if (tsconfig.compilerOptions?.strict === true) {
      return {
        signalId: this.signalId,
        applied: false,
        description: this.description,
        skipped: 'strict mode already enabled',
      };
    }

    if (ctx.dryRun) {
      return {
        signalId: this.signalId,
        applied: false,
        description: this.description,
        skipped: 'dry-run mode',
      };
    }

    tsconfig.compilerOptions = tsconfig.compilerOptions ?? {};
    tsconfig.compilerOptions.strict = true;

    await writeJsonFile(tsconfigPath, tsconfig);

    return {
      signalId: this.signalId,
      applied: true,
      description: this.description,
      filesModified: ['tsconfig.json'],
    };
  },
};

const testCoverageConfigFixer: FixAction = {
  signalId: 'test.coverage.config',
  type: 'config-change',
  description: 'Add coverage config to test runner',
  async execute(ctx: FixContext): Promise<FixResult> {
    // Try vitest first
    const vitestConfigs = [
      'vitest.config.ts',
      'vitest.config.js',
      'vitest.config.mts',
      'vitest.config.mjs',
    ];

    for (const configFile of vitestConfigs) {
      const configPath = join(ctx.targetPath, configFile);
      if (await fileExists(configPath)) {
        const content = await readFile(configPath, 'utf-8');
        if (content.includes('coverage')) {
          return {
            signalId: this.signalId,
            applied: false,
            description: this.description,
            skipped: 'Coverage config already present in vitest config',
          };
        }

        if (ctx.dryRun) {
          return {
            signalId: this.signalId,
            applied: false,
            description: this.description,
            skipped: 'dry-run mode',
          };
        }

        // Insert coverage config into defineConfig
        const updated = content.replace(
          /defineConfig\(\s*\{/,
          `defineConfig({\n  coverage: {\n    provider: 'v8',\n    reporter: ['text', 'lcov'],\n    exclude: ['node_modules/', 'dist/', '**/*.test.*', '**/__tests__/'],\n  },`,
        );

        if (updated !== content) {
          await writeFile(configPath, updated, 'utf-8');
          return {
            signalId: this.signalId,
            applied: true,
            description: this.description,
            filesModified: [configFile],
          };
        }
      }
    }

    // Try jest
    const jestConfigs = ['jest.config.js', 'jest.config.ts', 'jest.config.cjs', 'jest.config.mjs'];
    for (const configFile of jestConfigs) {
      const configPath = join(ctx.targetPath, configFile);
      if (await fileExists(configPath)) {
        const content = await readFile(configPath, 'utf-8');
        if (content.includes('coverage') || content.includes('collectCoverage')) {
          return {
            signalId: this.signalId,
            applied: false,
            description: this.description,
            skipped: 'Coverage config already present in jest config',
          };
        }
      }
    }

    // Try package.json jest config
    const pkgPath = join(ctx.targetPath, 'package.json');
    const pkg = await readJsonFile(pkgPath);
    if (pkg?.jest) {
      if (pkg.jest.collectCoverage || pkg.jest.coverageReporters) {
        return {
          signalId: this.signalId,
          applied: false,
          description: this.description,
          skipped: 'Coverage config already present in package.json jest config',
        };
      }
    }

    return {
      signalId: this.signalId,
      applied: false,
      description: this.description,
      skipped: 'No supported test runner config found to modify',
    };
  },
};

const typeDefinitionsFixer: FixAction = {
  signalId: 'type.definitions',
  type: 'npm-install',
  description: 'Install missing @types packages',
  async execute(ctx: FixContext): Promise<FixResult> {
    if (!isTypeScriptProject(ctx)) {
      return {
        signalId: this.signalId,
        applied: false,
        description: this.description,
        skipped: 'Not a TypeScript project',
      };
    }

    const pkgPath = join(ctx.targetPath, 'package.json');
    const pkg = await readJsonFile(pkgPath);
    if (!pkg) {
      return {
        signalId: this.signalId,
        applied: false,
        description: this.description,
        skipped: 'package.json not found',
      };
    }

    const deps = Object.keys(pkg.dependencies ?? {});
    const devDeps = Object.keys(pkg.devDependencies ?? {});
    const allInstalled = new Set([...deps, ...devDeps]);

    // Well-known packages that have @types/* counterparts
    const knownTypesMap: Record<string, string> = {
      express: '@types/express',
      lodash: '@types/lodash',
      react: '@types/react',
      'react-dom': '@types/react-dom',
      node: '@types/node',
      jest: '@types/jest',
      mocha: '@types/mocha',
      cors: '@types/cors',
      'body-parser': '@types/body-parser',
      compression: '@types/compression',
      'cookie-parser': '@types/cookie-parser',
      morgan: '@types/morgan',
      'serve-static': '@types/serve-static',
      supertest: '@types/supertest',
      'node-fetch': '@types/node-fetch',
      uuid: '@types/uuid',
      semver: '@types/semver',
      glob: '@types/glob',
      minimatch: '@types/minimatch',
      'pg': '@types/pg',
      'better-sqlite3': '@types/better-sqlite3',
    };

    const missing: string[] = [];
    for (const [dep, typePkg] of Object.entries(knownTypesMap)) {
      if (allInstalled.has(dep) && !allInstalled.has(typePkg)) {
        missing.push(typePkg);
      }
    }

    if (missing.length === 0) {
      return {
        signalId: this.signalId,
        applied: false,
        description: this.description,
        skipped: 'No missing @types packages detected',
      };
    }

    if (ctx.dryRun) {
      return {
        signalId: this.signalId,
        applied: false,
        description: `Would install: ${missing.join(', ')}`,
        skipped: 'dry-run mode',
      };
    }

    const [installBin, ...installBaseArgs] =
      ctx.profile.packageManager === 'yarn'
        ? ['yarn', 'add', '-D']
        : ctx.profile.packageManager === 'pnpm'
          ? ['pnpm', 'add', '-D']
          : ['npm', 'install', '-D'];
    const installArgs = [...installBaseArgs, ...missing];

    try {
      execFileSync(installBin, installArgs, { cwd: ctx.targetPath, stdio: 'pipe' });
    } catch {
      return {
        signalId: this.signalId,
        applied: false,
        description: this.description,
        skipped: `Failed to run: ${installBin} ${installArgs.join(' ')}`,
      };
    }

    return {
      signalId: this.signalId,
      applied: true,
      description: this.description,
      packagesInstalled: missing,
    };
  },
};

const linterExistsFixer: FixAction = {
  signalId: 'conv.linter.exists',
  type: 'create-file',
  description: 'Create linter configuration if linter is installed but unconfigured',
  async execute(ctx: FixContext): Promise<FixResult> {
    const pkgPath = join(ctx.targetPath, 'package.json');
    const pkg = await readJsonFile(pkgPath);

    const allDeps = {
      ...(pkg?.dependencies ?? {}),
      ...(pkg?.devDependencies ?? {}),
    };

    const hasEslint = 'eslint' in allDeps;
    if (!hasEslint) {
      return {
        signalId: this.signalId,
        applied: false,
        description: this.description,
        skipped: 'ESLint not installed',
      };
    }

    // Check for existing eslint config files
    const eslintFiles = [
      'eslint.config.js',
      'eslint.config.mjs',
      'eslint.config.cjs',
      '.eslintrc',
      '.eslintrc.js',
      '.eslintrc.cjs',
      '.eslintrc.json',
      '.eslintrc.yml',
      '.eslintrc.yaml',
    ];

    for (const f of eslintFiles) {
      if (await fileExists(join(ctx.targetPath, f))) {
        return {
          signalId: this.signalId,
          applied: false,
          description: this.description,
          skipped: `${f} already exists`,
        };
      }
    }

    if (ctx.dryRun) {
      return {
        signalId: this.signalId,
        applied: false,
        description: this.description,
        skipped: 'dry-run mode',
      };
    }

    let content: string;

    if (isTypeScriptProject(ctx)) {
      content = `import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['dist/', 'node_modules/', 'coverage/'],
  },
);
`;
    } else {
      content = `import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    ignores: ['dist/', 'node_modules/', 'coverage/'],
  },
];
`;
    }

    await writeFile(join(ctx.targetPath, 'eslint.config.js'), content, 'utf-8');

    return {
      signalId: this.signalId,
      applied: true,
      description: this.description,
      filesCreated: ['eslint.config.js'],
    };
  },
};

const lockfileFixer: FixAction = {
  signalId: 'deps.lockfile',
  type: 'npm-install',
  description: 'Generate package lockfile',
  async execute(ctx: FixContext): Promise<FixResult> {
    const lockfiles = [
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml',
      'bun.lockb',
    ];

    for (const lf of lockfiles) {
      if (await fileExists(join(ctx.targetPath, lf))) {
        return {
          signalId: this.signalId,
          applied: false,
          description: this.description,
          skipped: `${lf} already exists`,
        };
      }
    }

    // Must have a package.json
    if (!(await fileExists(join(ctx.targetPath, 'package.json')))) {
      return {
        signalId: this.signalId,
        applied: false,
        description: this.description,
        skipped: 'No package.json found',
      };
    }

    if (ctx.dryRun) {
      return {
        signalId: this.signalId,
        applied: false,
        description: this.description,
        skipped: 'dry-run mode',
      };
    }

    const [lockBin, ...lockArgs] =
      ctx.profile.packageManager === 'yarn'
        ? ['yarn', 'install']
        : ctx.profile.packageManager === 'pnpm'
          ? ['pnpm', 'install']
          : ['npm', 'install'];

    try {
      execFileSync(lockBin, lockArgs, { cwd: ctx.targetPath, stdio: 'pipe' });
    } catch {
      return {
        signalId: this.signalId,
        applied: false,
        description: this.description,
        skipped: `Failed to run: ${lockBin} ${lockArgs.join(' ')}`,
      };
    }

    const generatedLockfile =
      ctx.profile.packageManager === 'yarn'
        ? 'yarn.lock'
        : ctx.profile.packageManager === 'pnpm'
          ? 'pnpm-lock.yaml'
          : 'package-lock.json';

    return {
      signalId: this.signalId,
      applied: true,
      description: this.description,
      filesCreated: [generatedLockfile],
    };
  },
};

const linterStrictnessFixer: FixAction = {
  signalId: 'conv.linter.strictness',
  type: 'config-change',
  description: 'Upgrade linter config to use recommended rules',
  async execute(ctx: FixContext): Promise<FixResult> {
    // Look for eslint flat config
    const configPath = join(ctx.targetPath, 'eslint.config.js');

    if (!(await fileExists(configPath))) {
      return {
        signalId: this.signalId,
        applied: false,
        description: this.description,
        skipped: 'No eslint.config.js found',
      };
    }

    const content = await readFile(configPath, 'utf-8');

    // Check if already using strict/recommended
    if (content.includes('strict') || content.includes('recommendedTypeChecked')) {
      return {
        signalId: this.signalId,
        applied: false,
        description: this.description,
        skipped: 'Linter already configured with strict/recommended rules',
      };
    }

    if (ctx.dryRun) {
      return {
        signalId: this.signalId,
        applied: false,
        description: this.description,
        skipped: 'dry-run mode',
      };
    }

    // Upgrade tseslint.configs.recommended to tseslint.configs.strict
    if (
      isTypeScriptProject(ctx) &&
      content.includes('tseslint.configs.recommended')
    ) {
      const updated = content.replace(
        'tseslint.configs.recommended',
        'tseslint.configs.strict',
      );
      await writeFile(configPath, updated, 'utf-8');

      return {
        signalId: this.signalId,
        applied: true,
        description: 'Upgraded typescript-eslint from recommended to strict',
        filesModified: ['eslint.config.js'],
      };
    }

    return {
      signalId: this.signalId,
      applied: false,
      description: this.description,
      skipped: 'Could not determine how to upgrade linter config',
    };
  },
};

const cicdScriptsFixer: FixAction = {
  signalId: 'cicd.scripts',
  type: 'config-change',
  description: 'Add missing build/start/test scripts to package.json',
  async execute(ctx: FixContext): Promise<FixResult> {
    const pkgPath = join(ctx.targetPath, 'package.json');
    const pkg = await readJsonFile(pkgPath);

    if (!pkg) {
      return {
        signalId: this.signalId,
        applied: false,
        description: this.description,
        skipped: 'No package.json found',
      };
    }

    pkg.scripts = pkg.scripts ?? {};
    const added: string[] = [];

    if (!pkg.scripts.build) {
      if (isTypeScriptProject(ctx)) {
        pkg.scripts.build = 'tsc';
      } else {
        pkg.scripts.build = 'echo "No build step configured"';
      }
      added.push('build');
    }

    if (!pkg.scripts.start) {
      pkg.scripts.start = 'node .';
      added.push('start');
    }

    if (!pkg.scripts.test) {
      if (ctx.profile.tooling.testRunners.length > 0) {
        const runner = ctx.profile.tooling.testRunners[0].toLowerCase();
        pkg.scripts.test = runner;
      } else {
        pkg.scripts.test = 'echo "Error: no test specified" && exit 1';
      }
      added.push('test');
    }

    if (added.length === 0) {
      return {
        signalId: this.signalId,
        applied: false,
        description: this.description,
        skipped: 'All standard scripts already present',
      };
    }

    if (ctx.dryRun) {
      return {
        signalId: this.signalId,
        applied: false,
        description: `Would add scripts: ${added.join(', ')}`,
        skipped: 'dry-run mode',
      };
    }

    await writeJsonFile(pkgPath, pkg);

    return {
      signalId: this.signalId,
      applied: true,
      description: `Added scripts: ${added.join(', ')}`,
      filesModified: ['package.json'],
    };
  },
};

const testScriptsFixer: FixAction = {
  signalId: 'test.scripts',
  type: 'config-change',
  description: 'Add test script to package.json',
  async execute(ctx: FixContext): Promise<FixResult> {
    const pkgPath = join(ctx.targetPath, 'package.json');
    const pkg = await readJsonFile(pkgPath);

    if (!pkg) {
      return {
        signalId: this.signalId,
        applied: false,
        description: this.description,
        skipped: 'No package.json found',
      };
    }

    pkg.scripts = pkg.scripts ?? {};

    if (pkg.scripts.test && !pkg.scripts.test.includes('no test specified')) {
      return {
        signalId: this.signalId,
        applied: false,
        description: this.description,
        skipped: 'test script already configured',
      };
    }

    if (ctx.dryRun) {
      return {
        signalId: this.signalId,
        applied: false,
        description: this.description,
        skipped: 'dry-run mode',
      };
    }

    // Detect test runner from devDependencies
    const devDeps = Object.keys(pkg.devDependencies ?? {});
    let testCmd = 'echo "Error: no test specified" && exit 1';

    if (devDeps.includes('vitest')) {
      testCmd = 'vitest';
    } else if (devDeps.includes('jest')) {
      testCmd = 'jest';
    } else if (devDeps.includes('mocha')) {
      testCmd = 'mocha';
    } else if (ctx.profile.tooling.testRunners.length > 0) {
      testCmd = ctx.profile.tooling.testRunners[0].toLowerCase();
    }

    pkg.scripts.test = testCmd;
    await writeJsonFile(pkgPath, pkg);

    return {
      signalId: this.signalId,
      applied: true,
      description: `Set test script to "${testCmd}"`,
      filesModified: ['package.json'],
    };
  },
};

const importOrderingFixer: FixAction = {
  signalId: 'conv.imports.ordering',
  type: 'config-change',
  description: 'Add import sorting plugin config',
  async execute(ctx: FixContext): Promise<FixResult> {
    // Check for existing import ordering config
    const configPath = join(ctx.targetPath, 'eslint.config.js');

    if (!(await fileExists(configPath))) {
      return {
        signalId: this.signalId,
        applied: false,
        description: this.description,
        skipped: 'No eslint.config.js found — cannot add import ordering',
      };
    }

    const content = await readFile(configPath, 'utf-8');

    if (
      content.includes('import/order') ||
      content.includes('simple-import-sort') ||
      content.includes('organize-imports')
    ) {
      return {
        signalId: this.signalId,
        applied: false,
        description: this.description,
        skipped: 'Import ordering already configured',
      };
    }

    if (ctx.dryRun) {
      return {
        signalId: this.signalId,
        applied: false,
        description: this.description,
        skipped: 'dry-run mode',
      };
    }

    // Add sort-imports rule to eslint config
    const ruleBlock = `
  {
    rules: {
      'sort-imports': ['warn', {
        ignoreCase: true,
        ignoreDeclarationSort: true,
      }],
    },
  },`;

    // Insert before the closing bracket of the config array/config call
    const updated = content.replace(
      /(\]\s*\)?\s*;?\s*)$/,
      `${ruleBlock}\n$1`,
    );

    if (updated === content) {
      return {
        signalId: this.signalId,
        applied: false,
        description: this.description,
        skipped: 'Could not determine insertion point in eslint config',
      };
    }

    await writeFile(configPath, updated, 'utf-8');

    return {
      signalId: this.signalId,
      applied: true,
      description: this.description,
      filesModified: ['eslint.config.js'],
    };
  },
};

// ---------------------------------------------------------------------------
// Full catalog
// ---------------------------------------------------------------------------

/**
 * All 15 auto-fixable actions, ordered roughly by impact.
 */
export const FIXER_CATALOG: FixAction[] = [
  changelogFixer,
  editorconfigFixer,
  formatterFixer,
  architectureFixer,
  gitignoreFixer,
  cicdPipelineFixer,
  typeStrictnessFixer,
  testCoverageConfigFixer,
  typeDefinitionsFixer,
  linterExistsFixer,
  lockfileFixer,
  linterStrictnessFixer,
  cicdScriptsFixer,
  testScriptsFixer,
  importOrderingFixer,
];
