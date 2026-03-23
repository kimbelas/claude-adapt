/**
 * settings.json generator.
 *
 * Starts from the selected safety preset and layers on
 * project-specific detected tools, commands, and restrictions
 * following the Settings Decision Matrix from the Phase 2 spec.
 */

import type { GeneratorContext, Generator, ClaudeSettings } from './types.js';
import { getPresetSettings } from './presets.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Add a command to allowedCommands if not already present. */
function allowCommand(settings: ClaudeSettings, cmd: string): void {
  if (!settings.permissions.allowedCommands.includes(cmd)) {
    settings.permissions.allowedCommands.push(cmd);
  }
}

/** Add a command to deniedCommands if not already present. */
function denyCommand(settings: ClaudeSettings, cmd: string): void {
  if (!settings.permissions.deniedCommands.includes(cmd)) {
    settings.permissions.deniedCommands.push(cmd);
  }
}

/** Add a tool to deniedTools if not already present. */
function denyTool(settings: ClaudeSettings, tool: string): void {
  if (!settings.permissions.deniedTools.includes(tool)) {
    settings.permissions.deniedTools.push(tool);
  }
}

// ---------------------------------------------------------------------------
// Detection-driven enrichment
// ---------------------------------------------------------------------------

function applyDetectedTooling(ctx: GeneratorContext, settings: ClaudeSettings): void {
  const { tooling, packageManager } = ctx.repoProfile;

  // --- Formatters --------------------------------------------------------
  if (tooling.formatters.includes('prettier')) {
    allowCommand(settings, 'npx prettier --write *');
  }
  if (tooling.formatters.includes('black')) {
    allowCommand(settings, 'black *');
  }

  // If no formatter detected, disable auto-format
  if (tooling.formatters.length === 0) {
    settings.behavior.autoFormat = false;
  }

  // --- Linters -----------------------------------------------------------
  if (tooling.linters.includes('eslint')) {
    allowCommand(settings, 'npx eslint --fix *');
    allowCommand(settings, 'npx eslint *');
  }
  if (tooling.linters.includes('phpstan')) {
    allowCommand(settings, 'vendor/bin/phpstan analyse *');
  }
  if (tooling.linters.includes('pylint')) {
    allowCommand(settings, 'pylint *');
  }
  if (tooling.linters.includes('ruff')) {
    allowCommand(settings, 'ruff check *');
    allowCommand(settings, 'ruff format *');
  }

  // If no linter detected, disable auto-lint
  if (tooling.linters.length === 0) {
    settings.behavior.autoLint = false;
  }

  // --- Test runners ------------------------------------------------------
  if (tooling.testRunners.includes('jest')) {
    allowCommand(settings, 'npx jest *');
    allowCommand(settings, 'npm test');
  }
  if (tooling.testRunners.includes('vitest')) {
    allowCommand(settings, 'npx vitest *');
    allowCommand(settings, 'npm test');
  }
  if (tooling.testRunners.includes('pytest')) {
    allowCommand(settings, 'pytest *');
    allowCommand(settings, 'python -m pytest *');
  }
  if (tooling.testRunners.includes('phpunit')) {
    allowCommand(settings, 'vendor/bin/phpunit *');
  }
  if (tooling.testRunners.includes('mocha')) {
    allowCommand(settings, 'npx mocha *');
  }

  // --- Package manager specifics -----------------------------------------
  if (packageManager === 'pnpm') {
    allowCommand(settings, 'pnpm run *');
    allowCommand(settings, 'pnpm test');
    allowCommand(settings, 'pnpm add *');
  } else if (packageManager === 'yarn') {
    allowCommand(settings, 'yarn run *');
    allowCommand(settings, 'yarn test');
    allowCommand(settings, 'yarn add *');
  } else if (packageManager === 'bun') {
    allowCommand(settings, 'bun run *');
    allowCommand(settings, 'bun test');
    allowCommand(settings, 'bun add *');
  }

  // --- Monorepo ----------------------------------------------------------
  if (ctx.repoProfile.structure.monorepo) {
    if (packageManager === 'npm') {
      allowCommand(settings, 'npm run --workspace *');
    } else if (packageManager === 'pnpm') {
      allowCommand(settings, 'pnpm --filter *');
    } else if (packageManager === 'yarn') {
      allowCommand(settings, 'yarn workspace *');
    }
  }

  // --- CI ----------------------------------------------------------------
  if (tooling.ci.includes('github-actions')) {
    allowCommand(settings, 'gh *');
  }
}

function applyDetectedFrameworks(ctx: GeneratorContext, settings: ClaudeSettings): void {
  const frameworkNames = ctx.repoProfile.frameworks.map((f) => f.name.toLowerCase());

  // Next.js
  if (frameworkNames.includes('next.js') || frameworkNames.includes('nextjs')) {
    allowCommand(settings, 'npx next *');
  }

  // Laravel
  if (frameworkNames.includes('laravel')) {
    allowCommand(settings, 'php artisan *');
    allowCommand(settings, 'composer *');
  }

  // Django
  if (frameworkNames.includes('django')) {
    allowCommand(settings, 'python manage.py *');
  }

  // Rails
  if (frameworkNames.includes('rails') || frameworkNames.includes('ruby on rails')) {
    allowCommand(settings, 'rails *');
    allowCommand(settings, 'bundle exec *');
  }
}

function applyConventionalCommits(ctx: GeneratorContext, settings: ClaudeSettings): void {
  const packageJson = ctx.fileIndex.read('package.json');
  if (!packageJson) return;

  try {
    const parsed = JSON.parse(packageJson) as {
      devDependencies?: Record<string, string>;
      dependencies?: Record<string, string>;
    };
    const allDeps = {
      ...(parsed.dependencies ?? {}),
      ...(parsed.devDependencies ?? {}),
    };

    // Check for conventional commit tooling
    if (
      allDeps['@commitlint/cli'] ||
      allDeps['commitlint'] ||
      allDeps['cz-conventional-changelog'] ||
      allDeps['commitizen']
    ) {
      settings.behavior.commitStyle = 'conventional';
    }
  } catch { /* malformed json */ }

  // Check for commitlint config files
  const commitlintConfigs = [
    'commitlint.config.js',
    'commitlint.config.cjs',
    'commitlint.config.mjs',
    'commitlint.config.ts',
    '.commitlintrc.json',
    '.commitlintrc.yml',
    '.commitlintrc.yaml',
  ];

  for (const config of commitlintConfigs) {
    if (ctx.fileIndex.exists(config)) {
      settings.behavior.commitStyle = 'conventional';
      break;
    }
  }
}

function applySafetyRestrictions(ctx: GeneratorContext, settings: ClaudeSettings): void {
  // Docker: deny dangerous container operations
  if (
    ctx.fileIndex.exists('docker-compose.yml') ||
    ctx.fileIndex.exists('docker-compose.yaml') ||
    ctx.fileIndex.exists('Dockerfile')
  ) {
    denyCommand(settings, 'docker rm -f *');
    denyCommand(settings, 'docker system prune -a');
  }

  // Database: deny destructive SQL
  const hasDatabase = detectDatabase(ctx);
  if (hasDatabase) {
    denyCommand(settings, 'DROP DATABASE *');
    denyCommand(settings, 'DROP TABLE *');
    denyCommand(settings, 'TRUNCATE *');
    denyCommand(settings, 'DELETE FROM *');
  }

  // Production env files: deny editing
  if (ctx.fileIndex.exists('.env.production')) {
    denyTool(settings, 'Edit:.env.production');
  }

  // CI config protection (prevent pipeline breaks)
  if (ctx.fileIndex.exists('.github/workflows')) {
    // In strict mode, protect CI configs
    if (ctx.preset === 'strict') {
      denyTool(settings, 'Edit:.github/workflows/*');
    }
  }

  // Sensitive files
  const sensitivePatterns = ['.pem', '.key', '.cert', '.p12', '.pfx'];
  for (const ext of sensitivePatterns) {
    const files = ctx.fileIndex.glob(`**/*${ext}`);
    if (files.length > 0) {
      denyTool(settings, `Edit:*${ext}`);
    }
  }
}

function detectDatabase(ctx: GeneratorContext): boolean {
  // Check docker-compose for database services
  const compose = ctx.fileIndex.read('docker-compose.yml') ?? ctx.fileIndex.read('docker-compose.yaml');
  if (compose) {
    const lower = compose.toLowerCase();
    if (lower.includes('postgres') || lower.includes('mysql') || lower.includes('mongo') || lower.includes('redis')) {
      return true;
    }
  }

  // Check package.json dependencies
  const packageJson = ctx.fileIndex.read('package.json');
  if (packageJson) {
    try {
      const parsed = JSON.parse(packageJson) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const allDeps = Object.keys({
        ...(parsed.dependencies ?? {}),
        ...(parsed.devDependencies ?? {}),
      });

      const dbPackages = ['pg', 'mysql', 'mysql2', 'mongodb', 'mongoose', 'prisma', '@prisma/client', 'typeorm', 'knex', 'sequelize', 'drizzle-orm'];
      if (allDeps.some((d) => dbPackages.includes(d))) {
        return true;
      }
    } catch { /* malformed json */ }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export const settingsGenerator: Generator<ClaudeSettings> = {
  name: 'settings',

  async generate(ctx: GeneratorContext): Promise<ClaudeSettings> {
    // Start with the preset base (deep cloned)
    const settings = getPresetSettings(ctx.preset);

    // Layer on detected tooling
    applyDetectedTooling(ctx, settings);
    applyDetectedFrameworks(ctx, settings);
    applyConventionalCommits(ctx, settings);
    applySafetyRestrictions(ctx, settings);

    // Deduplicate arrays
    settings.permissions.allowedTools = [...new Set(settings.permissions.allowedTools)];
    settings.permissions.deniedTools = [...new Set(settings.permissions.deniedTools)];
    settings.permissions.allowedCommands = [...new Set(settings.permissions.allowedCommands)];
    settings.permissions.deniedCommands = [...new Set(settings.permissions.deniedCommands)];

    return settings;
  },
};
