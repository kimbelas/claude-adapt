# claude-adapt — Phase 2: `init` — Full Technical Specification

> **Package:** `claude-adapt` (npm)  
> **License:** MIT  
> **Phase:** 2 of 4 (score → init → skills → sync)  
> **Status:** Locked — Ready for implementation

---

## 1. Overview

`claude-adapt init` is a smart config generator that consumes the detection + analysis pipeline from Phase 1 and **compiles** it into a complete `.claude/` directory tailored to the detected project. It's not a dumb scaffolder — it's an intelligent config compiler that turns repo analysis into optimized Claude Code configuration.

Unlike template-based tools (cursor2claude, agents-mdx), `init` performs deep code analysis to generate contextually accurate instructions, safety settings, workflow commands, lifecycle hooks, and MCP server recommendations.

---

## 2. Generated Output Structure

```
.claude/
├── CLAUDE.md              # Project instructions (the intelligence core)
├── settings.json          # Permissions, allowed tools, behaviors
├── commands/              # Custom slash commands
│   ├── review.md          # /review — code review workflow
│   ├── test.md            # /test — run + analyze tests
│   └── deploy.md          # /deploy — deployment checklist
├── hooks/
│   ├── pre-commit.sh      # Lint + format before commit
│   ├── post-session.sh    # Phase 4 sync trigger
│   └── pre-tool-use.sh    # Safety guardrails
└── mcp.json               # Recommended MCP server configs
```

---

## 3. Generator Architecture

### 3.1 Generator Context (Input)

Every generator receives the full output of Phase 1's detection and analysis pipeline:

```typescript
interface GeneratorContext {
  repoProfile: RepoProfile;        // From detector chain
  scoreResult: ScoreResult;         // From Phase 1 scoring
  fileIndex: FileIndex;             // Virtual FS
  gitContext: GitContext;            // Git history
  preset: 'minimal' | 'standard' | 'strict';
  interactive: boolean;
}
```

### 3.2 Generator Interface

```typescript
interface Generator<T> {
  name: string;
  detect(ctx: GeneratorContext): Promise<GeneratorPlan>;   // What will be generated
  generate(ctx: GeneratorContext): Promise<T>;              // Produce the output
  serialize(output: T): string | Record<string, string>;   // Write to disk
}
```

---

## 4. Generator 1: CLAUDE.md — The Intelligence Core

### 4.1 Generated CLAUDE.md Structure

```markdown
# Project: {name}

## Overview
{auto-generated from README + package.json/pyproject.toml/composer.json}

## Architecture
{detected structure: monorepo layout, entry points, key directories}

## Tech Stack
{detected languages, frameworks, versions, key dependencies}

## Code Conventions
{detected from linter/formatter config, naming patterns}
- Naming: {camelCase|snake_case|PascalCase} for {files|functions|classes}
- Imports: {detected ordering pattern}
- Formatting: {Prettier|Black|etc config summary}

## File Structure
{generated tree of key directories with purpose annotations}

## Key Patterns
{detected architectural patterns: MVC, service layer, repository, etc.}

## Testing
- Runner: {Jest|Vitest|pytest|PHPUnit|etc}
- Command: {npm test|pytest|etc}
- Convention: {test file naming pattern}
- Coverage: {command if detected}

## Build & Deploy
- Build: {detected build command}
- Dev: {detected dev server command}
- Deploy: {detected deploy pipeline}

## Common Tasks
{generated from detected scripts in package.json/Makefile/etc}

## Gotchas
{generated warnings based on score signals — large files, circular deps, etc.}
```

### 4.2 Template Engine

The generator uses Handlebars partials selected and populated by detection results:

```typescript
interface ClaudeMdGenerator {
  generate(context: GeneratorContext): string;
}
```

### 4.3 Template Selection Matrix

| Detected Signal | Template Partial Activated | What It Generates |
|---|---|---|
| `framework: nextjs` | `frameworks/nextjs.hbs` | App Router vs Pages Router conventions, API routes, SSR/SSG patterns |
| `framework: laravel` | `frameworks/laravel.hbs` | Artisan commands, Eloquent patterns, blade templates, migrations |
| `framework: django` | `frameworks/django.hbs` | Management commands, model patterns, URL routing, template dirs |
| `framework: express` | `frameworks/express.hbs` | Middleware chain, route handlers, error handling patterns |
| `framework: fastapi` | `frameworks/fastapi.hbs` | Pydantic models, dependency injection, async patterns |
| `monorepo: true` | `structure/monorepo.hbs` | Package boundaries, shared deps, workspace commands |
| `linter: eslint` | `conventions/eslint.hbs` | Key rules extracted, auto-fix command |
| `linter: phpstan` | `conventions/phpstan.hbs` | Analysis level, baseline, key rules |
| `ci: github-actions` | `cicd/github-actions.hbs` | Workflow names, triggers, required checks |
| `ci: gitlab-ci` | `cicd/gitlab-ci.hbs` | Stage names, pipeline structure |
| `db: postgresql` | `services/postgresql.hbs` | Migration tool, schema location, connection patterns |
| `db: mongodb` | `services/mongodb.hbs` | ODM patterns, collection naming, index strategy |
| `docker: true` | `services/docker.hbs` | Container names, compose services, volume mounts |
| `test.runner: jest` | `testing/jest.hbs` | Config location, coverage threshold, mock patterns |
| `test.runner: pytest` | `testing/pytest.hbs` | Fixture patterns, conftest locations, marker conventions |

### 4.4 Intelligent Content Generation

The generator analyzes actual code to produce contextual instructions, not just template fill-ins:

```typescript
// Detecting and documenting architectural patterns
async function detectPatterns(ctx: GeneratorContext): Promise<PatternDoc[]> {
  const patterns: PatternDoc[] = [];

  // Detect service/repository pattern
  if (ctx.fileIndex.glob('**/services/**').length > 0 &&
      ctx.fileIndex.glob('**/repositories/**').length > 0) {
    patterns.push({
      name: 'Service-Repository Pattern',
      description: 'Business logic in services/, data access in repositories/. ' +
                   'Never access the database directly from services — always go through repos.',
      files: ctx.fileIndex.glob('**/services/**').slice(0, 5),
    });
  }

  // Detect barrel exports
  const barrels = ctx.fileIndex.glob('**/index.{ts,js}');
  if (barrels.length > 5) {
    patterns.push({
      name: 'Barrel Exports',
      description: 'This project uses barrel exports (index.ts files). ' +
                   'When adding new modules, always re-export from the nearest index.ts.',
      files: barrels.slice(0, 5),
    });
  }

  // Detect error handling pattern
  const errorFiles = ctx.fileIndex.glob('**/*error*', '**/*exception*');
  if (errorFiles.length > 0) {
    patterns.push({
      name: 'Custom Error Classes',
      description: 'Project uses custom error classes. Extend from the base error ' +
                   'class rather than throwing raw Error objects.',
      files: errorFiles,
    });
  }

  return patterns;
}
```

### 4.5 Gotchas Generator (Score-Driven Warnings)

```typescript
function generateGotchas(scoreResult: ScoreResult): string[] {
  const gotchas: string[] = [];

  // From modularity signals
  const largeFiles = scoreResult.getEvidence('mod.file.size.max');
  if (largeFiles.length > 0) {
    gotchas.push(
      `⚠️ Large files: ${largeFiles.map(e => e.file).join(', ')} — ` +
      `these may exceed context limits. Consider breaking them up.`
    );
  }

  // From coupling signals
  const circularDeps = scoreResult.getEvidence('mod.coupling.circular');
  if (circularDeps.length > 0) {
    gotchas.push(
      `⚠️ Circular dependencies detected. Editing these files may cause ` +
      `unexpected side effects: ${circularDeps.map(e => e.file).join(', ')}`
    );
  }

  // From type safety signals
  if (scoreResult.getSignalScore('type.any.ratio') < 0.5) {
    gotchas.push(
      `⚠️ High usage of 'any' types — Claude may introduce type-unsafe code. ` +
      `Review type assertions carefully.`
    );
  }

  return gotchas;
}
```

---

## 5. Generator 2: settings.json — Permissions & Behavior

### 5.1 Settings Schema

```typescript
interface ClaudeSettings {
  permissions: {
    allowedTools: string[];
    deniedTools: string[];
    allowedCommands: string[];
    deniedCommands: string[];
  };
  behavior: {
    autoFormat: boolean;
    autoLint: boolean;
    autoTest: boolean;
    commitStyle: string;
  };
}
```

### 5.2 Settings Decision Matrix

| Detection | Setting Generated | Value |
|---|---|---|
| Prettier detected | `allowedCommands` | `["npx prettier --write"]` |
| ESLint detected | `allowedCommands` | `["npx eslint --fix"]` |
| Jest detected | `allowedCommands` | `["npx jest", "npm test"]` |
| Docker detected | `deniedCommands` | `["docker rm", "docker system prune"]` |
| Database detected | `deniedCommands` | `["DROP", "TRUNCATE", "DELETE FROM"]` |
| Production env files | `deniedTools` | File edit on `.env.production` |
| CI config detected | `deniedTools` | File edit on CI config (prevent pipeline breaks) |
| Monorepo + npm | `allowedCommands` | `["npm run --workspace"]` |
| Git conventional commits | `behavior.commitStyle` | `"conventional"` |
| No formatter | `behavior.autoFormat` | `false` |

### 5.3 Safety Presets

```typescript
type Preset = 'minimal' | 'standard' | 'strict';

const presets: Record<Preset, Partial<ClaudeSettings>> = {
  minimal: {
    // Trust Claude broadly — solo devs on personal projects
    permissions: {
      deniedCommands: ['rm -rf /', 'mkfs', 'dd if='],
      deniedTools: [],
    }
  },
  standard: {
    // Balanced — team projects (DEFAULT)
    permissions: {
      deniedCommands: ['rm -rf', 'DROP DATABASE', 'TRUNCATE', 'docker system prune'],
      deniedTools: ['edit:.env.production', 'edit:*.pem', 'edit:*.key'],
    }
  },
  strict: {
    // Maximum safety — production/enterprise repos
    permissions: {
      deniedCommands: ['rm', 'mv', 'DROP', 'DELETE', 'docker', 'kubectl delete'],
      deniedTools: ['edit:.env*', 'edit:*config*', 'edit:*.lock', 'edit:Dockerfile'],
    }
  },
};
```

---

## 6. Generator 3: Custom Slash Commands

### 6.1 Command Generation Matrix

| Detection | Command Generated | What It Does |
|---|---|---|
| Test runner detected | `/test` | Run tests, analyze failures, suggest fixes |
| Linter detected | `/lint` | Run linter, auto-fix, report remaining issues |
| Git + conventional commits | `/commit` | Stage changes, generate conventional commit message |
| CI pipeline detected | `/pre-push` | Run full CI-equivalent checks locally |
| Framework: React/Next | `/component` | Scaffold new component with tests + story |
| Framework: Laravel | `/migrate` | Create migration, run it, update model |
| Database detected | `/schema` | Describe current schema, suggest optimizations |
| API routes detected | `/endpoint` | Scaffold new API endpoint with validation + tests |
| Docker detected | `/docker` | Build, run, check container health |
| Monorepo detected | `/workspace` | Run commands scoped to a specific package |

### 6.2 Example Generated Command — `/test`

```markdown
# /test

Run the test suite and analyze results.

## Steps
1. Run the full test suite: `npm test -- --coverage`
2. If tests fail, analyze the failure output
3. For each failing test:
   - Identify the root cause
   - Check if it's a test issue or code issue
   - Suggest a fix with code diff
4. Report coverage delta if coverage config exists
5. Flag any untested new files from the current branch

## Constraints
- Never modify test expectations to make tests pass
- If a test is genuinely wrong, explain why before fixing
- Always run the full suite, not just changed files
```

### 6.3 Example Generated Command — `/commit`

```markdown
# /commit

Create a well-structured commit for staged changes.

## Steps
1. Run `git diff --cached --stat` to see staged changes
2. Analyze the diff to understand the change
3. Generate a commit message following this project's convention:
   - Format: `{type}({scope}): {description}`
   - Types: feat, fix, refactor, docs, test, chore
   - Scope: detected from changed file paths
4. Present the message for confirmation
5. Run pre-commit hooks: `npm run lint:staged` (if available)
6. Commit with the approved message

## Constraints
- One logical change per commit
- If staged changes cover multiple concerns, suggest splitting
- Description must be under 72 characters
```

---

## 7. Generator 4: Hooks

### 7.1 Hook Generation Matrix

| Detection | Hook | Trigger | What It Does |
|---|---|---|---|
| Formatter detected | `pre-commit.sh` | Before commit | Run formatter on staged files |
| Linter detected | `pre-commit.sh` | Before commit | Run linter on staged files |
| Type checker detected | `pre-commit.sh` | Before commit | Run type check |
| Test runner detected | `pre-tool-use.sh` | Before file edit | Run affected tests after edit |
| Phase 4 enabled | `post-session.sh` | After Claude Code session | Trigger `claude-adapt sync` |
| CI detected | `pre-push.sh` | Before push | Run CI-equivalent checks |

### 7.2 Example Generated Hook — `pre-commit.sh`

```bash
#!/bin/bash
# Generated by claude-adapt init
# Detected: Prettier + ESLint + TypeScript

set -e

STAGED=$(git diff --cached --name-only --diff-filter=ACMR)

# Format staged files
echo "Formatting..."
echo "$STAGED" | grep -E '\.(ts|tsx|js|jsx)$' | xargs npx prettier --write 2>/dev/null || true

# Lint staged files
echo "Linting..."
echo "$STAGED" | grep -E '\.(ts|tsx|js|jsx)$' | xargs npx eslint --fix 2>/dev/null || true

# Type check
echo "Type checking..."
npx tsc --noEmit 2>/dev/null || {
  echo "⚠️  Type errors found. Review before committing."
  exit 1
}

# Re-stage formatted files
echo "$STAGED" | xargs git add
```

---

## 8. Generator 5: MCP Recommendations (`mcp.json`)

### 8.1 MCP Recommendation Matrix

| Detection | MCP Server Recommended | Purpose |
|---|---|---|
| PostgreSQL/MySQL | `@modelcontextprotocol/server-postgres` | Query database during development |
| Redis | `@modelcontextprotocol/server-redis` | Inspect cache state |
| Docker | `docker-mcp` | Manage containers |
| Git (always) | `@modelcontextprotocol/server-git` | Enhanced git operations |
| Filesystem (always) | `@modelcontextprotocol/server-filesystem` | Safe file access |
| Puppeteer/Playwright | `@anthropic-ai/mcp-puppeteer` | Browser automation |
| Slack references | `@anthropic-ai/mcp-slack` | Team communication |
| Jira/Linear references | Appropriate issue tracker MCP | Issue management |
| AWS config | `aws-mcp` | Cloud resource management |
| Kubernetes config | `k8s-mcp` | Cluster management |

### 8.2 Example Generated `mcp.json`

```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": {
        "DATABASE_URL": "${DATABASE_URL}"
      },
      "note": "Detected PostgreSQL in docker-compose.yml"
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "--root", "."],
      "note": "Always recommended for safe file access"
    }
  },
  "recommended": [
    {
      "name": "puppeteer",
      "reason": "Playwright test config detected — useful for debugging E2E tests",
      "install": "npx -y @anthropic-ai/mcp-puppeteer"
    }
  ]
}
```

---

## 9. CLI Specification

```
npx claude-adapt init [path] [options]

Arguments:
  path                       Repository path (default: current directory)

Options:
  -i, --interactive          Confirm/override each generated section
  --preset <name>            Safety preset: minimal|standard|strict (default: standard)
  --skip <generators...>     Skip specific generators: claude-md|settings|commands|hooks|mcp
  --only <generators...>     Generate only specific outputs
  --force                    Overwrite existing .claude/ directory
  --dry-run                  Preview what would be generated without writing
  --diff                     Show diff against existing .claude/ config
  --merge                    Merge with existing config (don't overwrite)
  --no-score                 Skip scoring (faster, less intelligent output)
  --template <path>          Use custom base template for CLAUDE.md
  --verbose                  Show detection details during generation
```

---

## 10. Interactive Mode Flow (`-i`)

```
$ npx claude-adapt init -i

  Detecting project...

  ✓ Languages: TypeScript (78%), Python (15%), Bash (7%)
  ✓ Framework: Next.js 14 (App Router)
  ✓ Tooling: ESLint, Prettier, Jest
  ✓ CI: GitHub Actions
  ✓ Database: PostgreSQL (via docker-compose)

  Generating CLAUDE.md...

  ? Include architecture section? (detected service-repository pattern) [Y/n]
  ? Include gotchas section? (3 warnings from score analysis) [Y/n]
  ? Include these custom patterns? [select to toggle]
    ✓ Barrel exports pattern
    ✓ Custom error classes
    ○ Redux slice pattern (low confidence — 0.4)

  Generating settings.json...

  ? Preset: [minimal / standard / strict] (recommended: standard)
  ? Allow Claude to run docker commands? [y/N]
  ? Allow Claude to edit .env files? [y/N]

  Generating custom commands...

  ? Generate these slash commands? [select to toggle]
    ✓ /test
    ✓ /lint
    ✓ /commit
    ○ /component (React scaffolding)
    ○ /migrate (database migration)

  Generating hooks...

  ? Install pre-commit hook? [Y/n]
  ? Install post-session sync hook? (requires Phase 4) [y/N]

  Writing .claude/ ...

  ✓ .claude/CLAUDE.md              (2.3 KB)
  ✓ .claude/settings.json          (0.8 KB)
  ✓ .claude/commands/test.md       (0.4 KB)
  ✓ .claude/commands/lint.md       (0.3 KB)
  ✓ .claude/commands/commit.md     (0.5 KB)
  ✓ .claude/hooks/pre-commit.sh    (0.6 KB)
  ✓ .claude/mcp.json               (0.5 KB)

  Done! Claude Code is now configured for this project.
  Run 'claude-adapt score' to see your updated readiness score.
```

---

## 11. Design Principles

1. **Config compiler, not scaffolder:** init consumes the full Phase 1 analysis and compiles it into optimized configuration.
2. **Smart defaults, interactive overrides:** Works silently with `init`, customizable with `init -i`.
3. **Score-driven intelligence:** Gotchas, safety settings, and recommendations are derived from Phase 1 score signals.
4. **Merge-friendly:** `--merge` flag allows incremental config updates without losing manual customizations.
5. **Preset-based safety:** Three opinionated safety tiers (minimal/standard/strict) instead of endless toggles.
6. **Phase 3 integration:** Skills (Phase 3) can contribute additional CLAUDE.md fragments, commands, hooks, and MCP configs that merge into the generated output.
