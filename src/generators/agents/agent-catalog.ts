/**
 * Agent template catalog.
 *
 * Each template defines a Claude Code slash command that orchestrates
 * a workflow around detected capabilities. Templates use placeholder
 * syntax to reference concrete commands discovered by the scanner.
 *
 * Placeholder syntax:
 *   {db.prisma.migrate}   — exact: capability "db.prisma", command "migrate"
 *   {db.*.migrate}        — wildcard: highest-confidence db.* capability, command "migrate"
 *   {test.**.run}          — iterate: one line per matching test.* capability
 *
 * To add a new agent, add an entry to this array. No code changes needed.
 */

import type { AgentTemplate } from './types.js';

export const AGENT_CATALOG: AgentTemplate[] = [
  // =========================================================================
  // /setup — Project bootstrap
  // =========================================================================
  {
    id: 'setup',
    commandName: 'setup',
    description: 'Bootstrap the project for local development.',
    requiredAny: [
      'pkg',
      'build',
    ],
    requiredCapabilities: [],
    steps: [
      { instruction: 'Install dependencies: `{pkg.*.install}`' },
      { instruction: 'Generate database client: `{db.*.generate}`', ifCapability: 'db' },
      { instruction: 'Run database migrations: `{db.*.migrate}`', ifCapability: 'db' },
      { instruction: 'Run type check: `{build.typescript.check}`', ifCapability: 'build.typescript' },
      { instruction: 'Build the project: `{build.*.build}`', ifCapability: 'build' },
      { instruction: 'Start dev server: `{scripts.*.run}`', ifCapability: 'scripts.dev' },
      { instruction: 'Verify the project runs without errors' },
      { instruction: 'Report any missing environment variables from .env.example', ifCapability: 'pkg' },
    ],
    constraints: [
      'Do not modify existing configuration files',
      'If .env is missing but .env.example exists, copy it and inform the user',
      'Never install global packages without confirmation',
    ],
    priority: 100,
  },

  // =========================================================================
  // /test — Run tests
  // =========================================================================
  {
    id: 'test',
    commandName: 'test',
    description: 'Run the test suite and analyze results.',
    requiredCapabilities: [],
    requiredAny: ['test'],
    steps: [
      { instruction: 'Run the full test suite: `{test.*.run}`' },
      { instruction: 'If tests fail, analyze the failure output' },
      {
        instruction:
          'For each failing test:\n' +
          '   - Identify the root cause\n' +
          '   - Check if it\'s a test issue or code issue\n' +
          '   - Suggest a fix with code diff',
      },
      { instruction: 'Report coverage: `{test.*.coverage}`' },
      { instruction: 'Flag any untested new files from the current branch' },
    ],
    constraints: [
      'Never modify test expectations to make tests pass',
      'If a test is genuinely wrong, explain why before fixing',
      'Always run the full suite, not just changed files',
    ],
    priority: 90,
  },

  // =========================================================================
  // /lint — Linting and formatting
  // =========================================================================
  {
    id: 'lint',
    commandName: 'lint',
    description: 'Run linters and formatters, then report results.',
    requiredCapabilities: [],
    requiredAny: ['lint', 'fmt'],
    steps: [
      { instruction: 'Run formatter: `{fmt.**.run}`', ifCapability: 'fmt' },
      { instruction: 'Run linter with auto-fix: `{lint.**.fix}`', ifCapability: 'lint' },
      { instruction: 'Run type check: `{build.typescript.check}`', ifCapability: 'build.typescript' },
      { instruction: 'Summarize all findings and group by severity' },
    ],
    constraints: [
      'Fix auto-fixable issues automatically',
      'For non-auto-fixable issues, explain the problem and suggest a manual fix',
      'Do not disable lint rules to suppress warnings',
    ],
    priority: 85,
  },

  // =========================================================================
  // /commit — Create a well-structured commit
  // =========================================================================
  {
    id: 'commit',
    commandName: 'commit',
    description: 'Create a well-structured commit for staged changes.',
    requiredCapabilities: [],
    steps: [
      { instruction: 'Run `git diff --cached --stat` to see staged changes' },
      { instruction: 'If nothing is staged, run `git add -p` to interactively stage changes' },
      { instruction: 'Analyze the diff to understand the change' },
      {
        instruction:
          'Generate a commit message following this project\'s convention:\n' +
          '   - Format: `{type}({scope}): {description}` (conventional commits)',
        ifCapability: 'vcs.conventional',
      },
      {
        instruction:
          'Generate a descriptive commit message:\n' +
          '   - Use imperative mood ("Add feature" not "Added feature")\n' +
          '   - First line under 72 characters\n' +
          '   - Add body for complex changes',
      },
      { instruction: 'Present the message for confirmation' },
      { instruction: 'Commit with the approved message' },
    ],
    constraints: [
      'One logical change per commit',
      'If staged changes cover multiple concerns, suggest splitting',
      'Never use generic messages like "update" or "fix stuff"',
    ],
    priority: 80,
  },

  // =========================================================================
  // /db — Database management
  // =========================================================================
  {
    id: 'db',
    commandName: 'db',
    description: 'Database management workflows.',
    requiredCapabilities: [],
    requiredAny: ['db'],
    hasArguments: true,
    argumentDescription: 'Subcommand: migrate, seed, reset, studio, or a migration description',
    steps: [
      {
        instruction:
          'Based on $ARGUMENTS, perform the appropriate database operation:\n' +
          '   - **migrate**: Run migrations: `{db.*.migrate}`\n' +
          '   - **seed**: Seed the database: `{db.*.seed}`\n' +
          '   - **reset**: Reset the database (with confirmation): `{db.*.reset}`\n' +
          '   - **studio**: Open database UI: `{db.*.studio}`\n' +
          '   - **<description>**: Create a new migration for the described change',
      },
      { instruction: 'If no argument given, show migration status and recent migrations' },
      { instruction: 'After any migration, verify the database state is consistent' },
    ],
    constraints: [
      'Never drop tables or reset the database without explicit user confirmation',
      'Always include a rollback/down method when creating migrations',
      'Warn if running migrations against a production database',
    ],
    priority: 70,
  },

  // =========================================================================
  // /deploy — Deployment workflows
  // =========================================================================
  {
    id: 'deploy',
    commandName: 'deploy',
    description: 'Build and deploy the project.',
    requiredCapabilities: [],
    requiredAny: ['deploy'],
    steps: [
      { instruction: 'Run the build step to ensure the project compiles cleanly', ifCapability: 'build' },
      { instruction: 'Run tests to ensure nothing is broken', ifCapability: 'test' },
      { instruction: 'Check container status: `{deploy.docker.ps}`', ifCapability: 'deploy.docker' },
      { instruction: 'Deploy: `{deploy.*.deploy}`' },
      { instruction: 'Check deployment logs: `{deploy.*.logs}`' },
      { instruction: 'Verify the deployment is healthy' },
    ],
    constraints: [
      'Always run tests before deploying',
      'Never force-push or skip CI checks',
      'For Docker: always use `-d` flag for `up` to avoid blocking the terminal',
      'Never run destructive operations (prune, volume removal) without confirmation',
    ],
    priority: 60,
  },

  // =========================================================================
  // /debug — Project-specific debugging
  // =========================================================================
  {
    id: 'debug',
    commandName: 'debug',
    description: 'Debug common issues in this project.',
    requiredCapabilities: [],
    requiredAny: ['monitor', 'cli'],
    hasArguments: true,
    argumentDescription: 'Description of the issue or area to debug',
    steps: [
      { instruction: 'Check recent log output: `{monitor.*.tail_log}`', ifCapability: 'monitor' },
      { instruction: 'List installed plugins/extensions: `{cli.wp.plugin_list}`', ifCapability: 'cli.wp' },
      { instruction: 'Check route list: `{cli.artisan.route_list}`', ifCapability: 'cli.artisan' },
      { instruction: 'Check route list: `{cli.rails.routes}`', ifCapability: 'cli.rails' },
      { instruction: 'Check container status: `{deploy.docker.ps}`', ifCapability: 'deploy.docker' },
      { instruction: 'Check container logs: `{deploy.docker.logs}`', ifCapability: 'deploy.docker' },
      {
        instruction:
          'Based on $ARGUMENTS and findings:\n' +
          '   - Identify the root cause\n' +
          '   - Suggest targeted fixes\n' +
          '   - Verify the fix resolves the issue',
      },
    ],
    constraints: [
      'Do not clear logs without asking the user first',
      'Do not restart services without confirmation',
      'Present findings before applying fixes',
    ],
    priority: 50,
  },

  // =========================================================================
  // /scaffold — Generate project-specific boilerplate
  // =========================================================================
  {
    id: 'scaffold',
    commandName: 'scaffold',
    description: 'Generate boilerplate using project CLI tools.',
    requiredCapabilities: [],
    requiredAny: ['cli'],
    hasArguments: true,
    argumentDescription: 'What to generate (e.g., "model User", "controller Auth", "component Button")',
    steps: [
      {
        instruction:
          'Parse $ARGUMENTS to determine what to generate.\n' +
          'Use the project\'s own scaffolding tools:',
      },
      { instruction: '- Laravel: `{cli.artisan.make_model}`, `{cli.artisan.make_controller}`', ifCapability: 'cli.artisan' },
      { instruction: '- Django: `{cli.manage.startapp}`', ifCapability: 'cli.manage' },
      { instruction: '- Rails: `{cli.rails.generate}`', ifCapability: 'cli.rails' },
      { instruction: 'Follow existing project patterns for file placement and naming' },
      { instruction: 'Add tests for the generated code' },
    ],
    constraints: [
      'Follow existing naming conventions in the codebase',
      'Place files in the directory structure the project uses',
      'Always include proper TypeScript types if the project uses TypeScript',
    ],
    priority: 40,
  },
];
