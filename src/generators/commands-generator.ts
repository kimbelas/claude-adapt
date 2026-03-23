/**
 * Custom slash commands generator.
 *
 * Produces .claude/commands/*.md files based on detected frameworks,
 * tooling, and project structure. Each command is a markdown file
 * that Claude Code interprets as a slash command workflow.
 */

import type { GeneratorContext, Generator } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CommandFile {
  /** Relative path under .claude/commands/, e.g. "test.md". */
  filename: string;
  /** Full markdown content of the command. */
  content: string;
}

// ---------------------------------------------------------------------------
// Command templates
// ---------------------------------------------------------------------------

function testCommand(ctx: GeneratorContext): CommandFile | null {
  const { testRunners } = ctx.repoProfile.tooling;
  if (testRunners.length === 0) return null;

  const runner = testRunners[0];
  let runCmd = 'npm test';
  let coverageCmd = 'npm test -- --coverage';

  if (runner === 'vitest') {
    runCmd = 'npx vitest';
    coverageCmd = 'npx vitest --coverage';
  } else if (runner === 'jest') {
    runCmd = 'npx jest';
    coverageCmd = 'npx jest --coverage';
  } else if (runner === 'pytest') {
    runCmd = 'pytest';
    coverageCmd = 'pytest --cov';
  } else if (runner === 'phpunit') {
    runCmd = 'vendor/bin/phpunit';
    coverageCmd = 'vendor/bin/phpunit --coverage-text';
  } else if (runner === 'mocha') {
    runCmd = 'npx mocha';
    coverageCmd = 'npx nyc mocha';
  }

  return {
    filename: 'test.md',
    content: `# /test

Run the test suite and analyze results.

## Steps
1. Run the full test suite: \`${runCmd}\`
2. If tests fail, analyze the failure output
3. For each failing test:
   - Identify the root cause
   - Check if it's a test issue or code issue
   - Suggest a fix with code diff
4. Report coverage delta if coverage config exists: \`${coverageCmd}\`
5. Flag any untested new files from the current branch

## Constraints
- Never modify test expectations to make tests pass
- If a test is genuinely wrong, explain why before fixing
- Always run the full suite, not just changed files
`,
  };
}

function lintCommand(ctx: GeneratorContext): CommandFile | null {
  const { linters, formatters } = ctx.repoProfile.tooling;
  if (linters.length === 0 && formatters.length === 0) return null;

  const steps: string[] = [];
  let stepNum = 1;

  if (formatters.includes('prettier')) {
    steps.push(`${stepNum}. Run formatter: \`npx prettier --write .\``);
    stepNum++;
  }
  if (formatters.includes('black')) {
    steps.push(`${stepNum}. Run formatter: \`black .\``);
    stepNum++;
  }
  if (linters.includes('eslint')) {
    steps.push(`${stepNum}. Run linter with auto-fix: \`npx eslint --fix .\``);
    stepNum++;
    steps.push(`${stepNum}. Report any remaining issues that cannot be auto-fixed`);
    stepNum++;
  }
  if (linters.includes('pylint')) {
    steps.push(`${stepNum}. Run linter: \`pylint **/*.py\``);
    stepNum++;
  }
  if (linters.includes('ruff')) {
    steps.push(`${stepNum}. Run linter: \`ruff check --fix .\``);
    stepNum++;
  }

  // Type checking
  const hasTypeScript = ctx.repoProfile.languages.some((l) => l.name.toLowerCase() === 'typescript');
  if (hasTypeScript) {
    steps.push(`${stepNum}. Run type check: \`npx tsc --noEmit\``);
    stepNum++;
  }

  steps.push(`${stepNum}. Summarize all findings and group by severity`);

  return {
    filename: 'lint.md',
    content: `# /lint

Run linters and formatters, then report results.

## Steps
${steps.join('\n')}

## Constraints
- Fix auto-fixable issues automatically
- For non-auto-fixable issues, explain the problem and suggest a manual fix
- Do not disable lint rules to suppress warnings
`,
  };
}

function commitCommand(ctx: GeneratorContext): CommandFile | null {
  // We always generate this — most projects use git.

  // Detect commit style
  let commitFormat = 'descriptive message';
  let commitNote = '';

  const packageJson = ctx.fileIndex.read('package.json');
  if (packageJson) {
    try {
      const parsed = JSON.parse(packageJson) as {
        devDependencies?: Record<string, string>;
      };
      const devDeps = parsed.devDependencies ?? {};
      if (devDeps['@commitlint/cli'] || devDeps['commitizen'] || devDeps['cz-conventional-changelog']) {
        commitFormat = '{type}({scope}): {description}';
        commitNote = `\n   - Types: feat, fix, refactor, docs, test, chore, style, perf, ci, build
   - Scope: detected from changed file paths
   - Description must be under 72 characters`;
      }
    } catch { /* malformed json */ }
  }

  return {
    filename: 'commit.md',
    content: `# /commit

Create a well-structured commit for staged changes.

## Steps
1. Run \`git diff --cached --stat\` to see staged changes
2. If nothing is staged, run \`git add -p\` to interactively stage changes
3. Analyze the diff to understand the change
4. Generate a commit message following this project's convention:
   - Format: \`${commitFormat}\`${commitNote}
5. Present the message for confirmation
6. Commit with the approved message

## Constraints
- One logical change per commit
- If staged changes cover multiple concerns, suggest splitting
- Never use generic messages like "update" or "fix stuff"
`,
  };
}

function componentCommand(ctx: GeneratorContext): CommandFile | null {
  const frameworks = ctx.repoProfile.frameworks.map((f) => f.name.toLowerCase());
  const isReact = frameworks.some((f) => f.includes('react') || f.includes('next'));

  if (!isReact) return null;

  const isNextJs = frameworks.some((f) => f.includes('next'));
  const hasTypeScript = ctx.repoProfile.languages.some((l) => l.name.toLowerCase() === 'typescript');
  const ext = hasTypeScript ? 'tsx' : 'jsx';

  return {
    filename: 'component.md',
    content: `# /component

Scaffold a new React component with tests.

## Arguments
- \`$ARGUMENTS\` — Component name (PascalCase)

## Steps
1. Create the component file: \`src/components/$ARGUMENTS/$ARGUMENTS.${ext}\`
2. Create the test file: \`src/components/$ARGUMENTS/$ARGUMENTS.test.${ext}\`
3. ${isNextJs ? 'Determine if this should be a Server Component or Client Component' : 'Create the component as a functional component'}
4. Add basic props interface with TypeScript types
5. Export the component from the nearest barrel file (index.ts) if one exists
6. Include a basic render test

## Constraints
- Follow existing component patterns in the codebase
- Use the project's existing styling approach (CSS modules, Tailwind, styled-components, etc.)
- Include proper TypeScript types for all props
`,
  };
}

function migrateCommand(ctx: GeneratorContext): CommandFile | null {
  const frameworks = ctx.repoProfile.frameworks.map((f) => f.name.toLowerCase());
  if (!frameworks.includes('laravel')) return null;

  return {
    filename: 'migrate.md',
    content: `# /migrate

Create and run a database migration.

## Arguments
- \`$ARGUMENTS\` — Migration description (e.g., "add_status_to_orders")

## Steps
1. Create migration: \`php artisan make:migration $ARGUMENTS\`
2. Open the generated migration file
3. Define the schema changes based on the description
4. Run the migration: \`php artisan migrate\`
5. If migration fails, analyze the error and suggest fixes
6. Update the relevant Eloquent model if columns were added

## Constraints
- Always include a \`down()\` method for rollback
- Use appropriate column types and indexes
- Follow existing migration patterns in the project
`,
  };
}

function dockerCommand(ctx: GeneratorContext): CommandFile | null {
  const hasDocker =
    ctx.fileIndex.exists('docker-compose.yml') ||
    ctx.fileIndex.exists('docker-compose.yaml') ||
    ctx.fileIndex.exists('Dockerfile');

  if (!hasDocker) return null;

  const composeFile = ctx.fileIndex.exists('docker-compose.yml')
    ? 'docker-compose.yml'
    : ctx.fileIndex.exists('docker-compose.yaml')
      ? 'docker-compose.yaml'
      : null;

  const composeCmd = composeFile ? 'docker compose' : 'docker';

  return {
    filename: 'docker.md',
    content: `# /docker

Manage Docker containers for this project.

## Steps
1. Check container status: \`${composeCmd} ps\`
2. If containers are not running: \`${composeCmd} up -d\`
3. Check container health: \`${composeCmd} logs --tail=20\`
4. Report any unhealthy containers or errors
5. Verify services are accessible on their configured ports

## Constraints
- Never run \`docker system prune\` or remove volumes without explicit confirmation
- Do not modify Dockerfile or docker-compose files without explaining the changes first
- Always use \`-d\` flag for \`up\` to avoid blocking the terminal
`,
  };
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export const commandsGenerator: Generator<Record<string, string>> = {
  name: 'commands',

  async generate(ctx: GeneratorContext): Promise<Record<string, string>> {
    const commands: Record<string, string> = {};

    const generators: ((ctx: GeneratorContext) => CommandFile | null)[] = [
      testCommand,
      lintCommand,
      commitCommand,
      componentCommand,
      migrateCommand,
      dockerCommand,
    ];

    for (const gen of generators) {
      const result = gen(ctx);
      if (result) {
        commands[result.filename] = result.content;
      }
    }

    return commands;
  },
};
