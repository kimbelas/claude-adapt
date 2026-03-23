/**
 * Recommendation catalog — one template per signal.
 *
 * Each template provides a title, description, effort classification,
 * impact score, and optional fix template for all 38 signals in the
 * claude-adapt scoring system.
 */

/** Shape of a recommendation template in the catalog. */
export interface RecommendationTemplate {
  signalId: string;
  title: string;
  description: string;
  effort: 'low' | 'medium' | 'high';
  impact: number;
  fixTemplate: string;
}

/**
 * Complete catalog of 38 recommendation templates, one per signal ID.
 *
 * Templates are static — the recommendation engine pairs them with
 * live signal data at runtime to produce ranked recommendations.
 */
export const RECOMMENDATION_CATALOG: RecommendationTemplate[] = [
  // =========================================================================
  // DOCUMENTATION (7 signals)
  // =========================================================================
  {
    signalId: 'doc.readme.exists',
    title: 'Create a README.md',
    description:
      'Claude reads the README first to understand project purpose and structure. Without one, Claude starts every session blind.',
    effort: 'low',
    impact: 9,
    fixTemplate:
      'Create a README.md at the project root with at least: project name, description, installation steps, and usage examples.',
  },
  {
    signalId: 'doc.readme.quality',
    title: 'Improve README quality',
    description:
      'A comprehensive README with install, usage, API, and contributing sections helps Claude understand the project faster and produce better code.',
    effort: 'medium',
    impact: 8,
    fixTemplate:
      'Add missing sections to README.md: ## Installation, ## Usage, ## API Reference, ## Contributing, ## License.',
  },
  {
    signalId: 'doc.readme.staleness',
    title: 'Update stale README',
    description:
      'Your README has not been updated recently relative to code changes. Stale documentation misleads Claude about the current architecture.',
    effort: 'low',
    impact: 6,
    fixTemplate:
      'Review README.md and update any sections that no longer reflect the current codebase. Pay special attention to installation steps and API examples.',
  },
  {
    signalId: 'doc.inline.density',
    title: 'Add inline comments to complex code',
    description:
      'Inline comments explain intent ("why"), which Claude needs to make safe edits. Low comment density forces Claude to guess at purpose.',
    effort: 'medium',
    impact: 7,
    fixTemplate:
      'Add explanatory comments to complex logic, non-obvious algorithms, and business rules. Focus on "why" rather than "what".',
  },
  {
    signalId: 'doc.api.coverage',
    title: 'Document exported APIs',
    description:
      'Claude uses function-level documentation to understand contracts before editing. Undocumented exports are blind spots.',
    effort: 'medium',
    impact: 8,
    fixTemplate:
      'Add JSDoc/TSDoc comments to all exported functions and classes. Include @param, @returns, and usage examples where applicable.',
  },
  {
    signalId: 'doc.architecture',
    title: 'Add architecture documentation',
    description:
      'Architecture docs (ADRs, ARCHITECTURE.md) prevent Claude from violating design decisions. Without them, Claude may introduce patterns that conflict with project intent.',
    effort: 'medium',
    impact: 7,
    fixTemplate:
      'Create an ARCHITECTURE.md describing the high-level system design, key patterns, and architectural decision records (ADRs).',
  },
  {
    signalId: 'doc.changelog',
    title: 'Maintain a changelog',
    description:
      'A changelog or conventional commits help Claude understand project evolution and make version-appropriate changes.',
    effort: 'low',
    impact: 5,
    fixTemplate:
      'Create a CHANGELOG.md following Keep a Changelog format, or adopt conventional commits (feat:, fix:, chore:) in your commit messages.',
  },

  // =========================================================================
  // MODULARITY (7 signals)
  // =========================================================================
  {
    signalId: 'mod.file.size.p90',
    title: 'Break up large files',
    description:
      'Claude works best with focused files under 300 lines. Large files exhaust context and make it harder for Claude to reason about changes.',
    effort: 'high',
    impact: 9,
    fixTemplate:
      'Split files over 300 lines into smaller, single-responsibility modules. Extract related functions into separate files grouped by feature.',
  },
  {
    signalId: 'mod.file.size.max',
    title: 'Refactor oversized files',
    description:
      'Very large files (500+ lines) cause context truncation in Claude, leading to incomplete understanding and riskier edits.',
    effort: 'high',
    impact: 8,
    fixTemplate:
      'Identify the largest files in the codebase and decompose them into smaller modules. Target a maximum of 300-500 lines per file.',
  },
  {
    signalId: 'mod.function.length.p90',
    title: 'Shorten long functions',
    description:
      'Long functions prevent Claude from holding the full context of what it is editing, increasing the risk of subtle bugs.',
    effort: 'high',
    impact: 8,
    fixTemplate:
      'Extract helper functions from methods longer than 30 lines. Apply the Single Responsibility Principle at the function level.',
  },
  {
    signalId: 'mod.coupling.circular',
    title: 'Eliminate circular dependencies',
    description:
      'Circular dependencies cause Claude edits to have unexpected side effects across modules, making changes unpredictable.',
    effort: 'high',
    impact: 9,
    fixTemplate:
      'Break circular dependencies by extracting shared types into a common module, using dependency injection, or inverting the dependency direction.',
  },
  {
    signalId: 'mod.coupling.afferent',
    title: 'Reduce high-coupling files',
    description:
      'Files with many inbound dependencies are risky for Claude to edit — a single mistake cascades across the codebase.',
    effort: 'high',
    impact: 7,
    fixTemplate:
      'Identify files with the most dependents and stabilize their interfaces. Consider splitting them or introducing abstraction layers.',
  },
  {
    signalId: 'mod.depth.max',
    title: 'Flatten deep folder nesting',
    description:
      'Deeply nested folder structures confuse Claude file navigation and make it harder to locate related code.',
    effort: 'medium',
    impact: 5,
    fixTemplate:
      'Restructure deeply nested directories (7+ levels) to reduce depth. Group by feature rather than by layer where possible.',
  },
  {
    signalId: 'mod.entrypoints',
    title: 'Define clear entry points',
    description:
      'Claude needs to know where execution starts to understand the code flow. Missing entry points leave Claude guessing.',
    effort: 'low',
    impact: 6,
    fixTemplate:
      'Ensure your project has clear entry points (index.ts, main.ts, app.ts) and document them in the README or package.json "main" field.',
  },

  // =========================================================================
  // CONVENTIONS (7 signals)
  // =========================================================================
  {
    signalId: 'conv.naming.consistency',
    title: 'Standardize naming conventions',
    description:
      'Inconsistent naming (mixed camelCase/snake_case) causes Claude to guess the wrong style when writing new code.',
    effort: 'medium',
    impact: 7,
    fixTemplate:
      'Choose one naming convention per entity type (camelCase for variables, PascalCase for classes) and apply it consistently. Add an ESLint naming rule.',
  },
  {
    signalId: 'conv.linter.exists',
    title: 'Add a linter configuration',
    description:
      'Linter configuration teaches Claude the project code style rules, reducing style violations in generated code.',
    effort: 'low',
    impact: 8,
    fixTemplate:
      'Add ESLint (JS/TS), Pylint/Ruff (Python), or the appropriate linter for your language. Include the config file in the project root.',
  },
  {
    signalId: 'conv.linter.strictness',
    title: 'Increase linter strictness',
    description:
      'Stricter linter rules give Claude clearer guardrails, reducing the chance it generates code that passes but violates conventions.',
    effort: 'low',
    impact: 6,
    fixTemplate:
      'Enable additional recommended rules in your linter config. Consider extending "recommended" or "strict" presets.',
  },
  {
    signalId: 'conv.formatter.exists',
    title: 'Add a code formatter',
    description:
      'Automatic formatting means Claude does not need to manually match code style, eliminating a class of review friction.',
    effort: 'low',
    impact: 7,
    fixTemplate:
      'Add Prettier (JS/TS), Black (Python), or the appropriate formatter. Include a config file and add a format script to package.json.',
  },
  {
    signalId: 'conv.structure.pattern',
    title: 'Adopt a consistent folder structure',
    description:
      'A predictable folder structure helps Claude place new files correctly and find related code faster.',
    effort: 'medium',
    impact: 6,
    fixTemplate:
      'Adopt a recognized folder pattern (feature-based, layer-based) and document it in ARCHITECTURE.md or the README.',
  },
  {
    signalId: 'conv.imports.ordering',
    title: 'Standardize import ordering',
    description:
      'Consistent import ordering helps Claude follow the established pattern automatically when adding new imports.',
    effort: 'low',
    impact: 4,
    fixTemplate:
      'Configure import ordering in your linter (e.g., eslint-plugin-import) or use a tool like organize-imports-cli.',
  },
  {
    signalId: 'conv.editorconfig',
    title: 'Add an EditorConfig file',
    description:
      'EditorConfig provides Claude with indentation and line-ending rules that work across all editors.',
    effort: 'low',
    impact: 4,
    fixTemplate:
      'Create a .editorconfig file at the project root specifying indent_style, indent_size, end_of_line, and charset.',
  },

  // =========================================================================
  // TYPE SAFETY (4 signals)
  // =========================================================================
  {
    signalId: 'type.coverage',
    title: 'Increase type coverage',
    description:
      'Types let Claude understand data shapes for safe mutations. Low type coverage means Claude is working blind on data structures.',
    effort: 'high',
    impact: 8,
    fixTemplate:
      'Convert JavaScript files to TypeScript or add type annotations to untyped code. Start with the most-imported modules.',
  },
  {
    signalId: 'type.strictness',
    title: 'Enable strict type checking',
    description:
      'Strict type mode lets Claude catch its own errors before commit, preventing type-related bugs from reaching code review.',
    effort: 'low',
    impact: 7,
    fixTemplate:
      'Set "strict": true in tsconfig.json (TypeScript) or enable equivalent strict mode in your language tooling.',
  },
  {
    signalId: 'type.any.ratio',
    title: 'Reduce any/untyped usage',
    description:
      'Every `any` or untyped value is a blind spot where Claude can introduce runtime bugs without compiler warnings.',
    effort: 'medium',
    impact: 7,
    fixTemplate:
      'Replace `any` with specific types. Use `unknown` where the type is truly dynamic, then narrow with type guards.',
  },
  {
    signalId: 'type.definitions',
    title: 'Add type definitions for dependencies',
    description:
      'Missing @types packages mean Claude guesses at library APIs, increasing the risk of incorrect usage.',
    effort: 'low',
    impact: 6,
    fixTemplate:
      'Install @types/* packages for all untyped dependencies. Run `npx typesync` to auto-detect missing type packages.',
  },

  // =========================================================================
  // TEST COVERAGE (5 signals)
  // =========================================================================
  {
    signalId: 'test.ratio',
    title: 'Improve test-to-source ratio',
    description:
      'Tests let Claude verify its own changes. A low test ratio means Claude changes cannot be validated automatically.',
    effort: 'high',
    impact: 9,
    fixTemplate:
      'Add unit tests for critical modules. Target at least one test file per source file, focusing on business logic and edge cases.',
  },
  {
    signalId: 'test.runner',
    title: 'Configure a test runner',
    description:
      'Claude needs a test runner to execute tests after making edits. Without one, Claude cannot self-verify.',
    effort: 'low',
    impact: 8,
    fixTemplate:
      'Set up Vitest, Jest (JS/TS), Pytest (Python), or the appropriate test framework. Add config files to the project root.',
  },
  {
    signalId: 'test.scripts',
    title: 'Add test scripts',
    description:
      'Claude needs to know the exact command to run tests. Missing scripts force manual intervention after every edit.',
    effort: 'low',
    impact: 7,
    fixTemplate:
      'Add a "test" script to package.json (or equivalent) that runs your test suite. Example: "test": "vitest".',
  },
  {
    signalId: 'test.coverage.config',
    title: 'Configure test coverage reporting',
    description:
      'Coverage configuration lets Claude measure the impact of its changes and identify untested paths.',
    effort: 'low',
    impact: 5,
    fixTemplate:
      'Add coverage configuration to your test runner (e.g., --coverage flag, vitest coverage config, jest --collectCoverage).',
  },
  {
    signalId: 'test.naming',
    title: 'Standardize test file naming',
    description:
      'Consistent test naming helps Claude find related tests and follow the established pattern when creating new test files.',
    effort: 'low',
    impact: 4,
    fixTemplate:
      'Adopt a consistent test naming pattern (e.g., *.test.ts, *.spec.ts) and document it. Rename outliers to match.',
  },

  // =========================================================================
  // GIT HYGIENE (4 signals)
  // =========================================================================
  {
    signalId: 'git.ignore.quality',
    title: 'Improve .gitignore coverage',
    description:
      'A comprehensive .gitignore prevents noise files from appearing in Claude context, keeping signal-to-noise ratio high.',
    effort: 'low',
    impact: 6,
    fixTemplate:
      'Review .gitignore against gitignore.io templates for your stack. Ensure node_modules, dist, .env, and OS files are covered.',
  },
  {
    signalId: 'git.commit.convention',
    title: 'Adopt conventional commits',
    description:
      'Consistent commit message patterns help Claude write matching commit messages when making changes.',
    effort: 'low',
    impact: 5,
    fixTemplate:
      'Adopt conventional commits (feat:, fix:, chore:, docs:). Consider adding commitlint with a husky pre-commit hook.',
  },
  {
    signalId: 'git.commit.size.p90',
    title: 'Make smaller commits',
    description:
      'Small, atomic commits help Claude make focused, reviewable changes rather than large sweeping modifications.',
    effort: 'medium',
    impact: 5,
    fixTemplate:
      'Break large changes into smaller, logical commits. Each commit should represent one complete thought or feature unit.',
  },
  {
    signalId: 'git.binaries',
    title: 'Remove committed binary files',
    description:
      'Binary files in the repo waste Claude context window during file scanning, reducing available space for actual code.',
    effort: 'medium',
    impact: 4,
    fixTemplate:
      'Move large binaries to Git LFS or external storage. Add binary extensions to .gitignore. Use BFG Repo-Cleaner to remove from history if needed.',
  },

  // =========================================================================
  // CI/CD (2 signals)
  // =========================================================================
  {
    signalId: 'cicd.pipeline',
    title: 'Set up a CI pipeline',
    description:
      'A CI pipeline lets Claude understand build and deploy constraints, ensuring its changes pass automated checks.',
    effort: 'medium',
    impact: 6,
    fixTemplate:
      'Add a CI configuration file (.github/workflows/ci.yml, .gitlab-ci.yml, or equivalent) that runs linting, type checking, and tests.',
  },
  {
    signalId: 'cicd.scripts',
    title: 'Define build and deploy scripts',
    description:
      'Claude needs to know how to build the project. Missing build scripts mean Claude cannot verify compilation or bundling.',
    effort: 'low',
    impact: 5,
    fixTemplate:
      'Add "build", "start", and "deploy" scripts to package.json (or equivalent). Document the build process in the README.',
  },

  // =========================================================================
  // DEPENDENCIES (2 signals)
  // =========================================================================
  {
    signalId: 'deps.lockfile',
    title: 'Commit a lockfile',
    description:
      'A committed lockfile ensures reproducible installs, so Claude test runs produce the same results as yours.',
    effort: 'low',
    impact: 7,
    fixTemplate:
      'Run your package manager to generate a lockfile (package-lock.json, yarn.lock, pnpm-lock.yaml) and commit it to the repo.',
  },
  {
    signalId: 'deps.count',
    title: 'Reduce dependency count',
    description:
      'A large dependency tree increases the surface area Claude needs to understand and the chance of version conflicts.',
    effort: 'high',
    impact: 4,
    fixTemplate:
      'Audit dependencies with `npm ls --depth=0`. Remove unused packages, consolidate overlapping ones, and consider native alternatives.',
  },
];

/** Lookup map for O(1) template retrieval by signal ID. */
const CATALOG_MAP = new Map<string, RecommendationTemplate>(
  RECOMMENDATION_CATALOG.map((t) => [t.signalId, t]),
);

/**
 * Retrieves a recommendation template by signal ID.
 *
 * @param signalId - The signal ID to look up.
 * @returns The matching template, or undefined if not found.
 */
export function getTemplate(
  signalId: string,
): RecommendationTemplate | undefined {
  return CATALOG_MAP.get(signalId);
}
