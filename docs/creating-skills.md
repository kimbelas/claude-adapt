# Creating Skills

Skills are portable bundles of Claude Code configuration — CLAUDE.md fragments, commands, hooks, MCP configs, and scoring enhancers — packaged as npm modules.

## What is a Skill?

A skill teaches Claude Code about a specific framework, tool, or workflow. When installed, it merges its configuration into the project's `.claude/` directory, giving Claude Code domain-specific knowledge without manual setup.

Examples:
- `claude-skill-laravel` — Laravel conventions, Artisan commands, Eloquent patterns
- `claude-skill-docker` — Dockerfile best practices, compose patterns, deployment commands
- `claude-skill-react` — Component patterns, hooks conventions, testing with RTL

## Skill Structure

```
claude-skill-example/
├── claude-skill.json          # Manifest (required)
├── sections/                  # CLAUDE.md content fragments
│   ├── conventions.md
│   └── patterns.md
├── commands/                  # Slash commands
│   └── deploy.md
├── hooks/                     # Hook scripts
│   └── pre-commit.sh
└── package.json               # npm package metadata
```

## Manifest Format

The `claude-skill.json` manifest describes what the skill provides:

```json
{
  "name": "claude-skill-example",
  "version": "1.0.0",
  "description": "Example skill for demonstration",
  "author": "Your Name",
  "framework": "example",
  "provides": {
    "claudeMd": {
      "sections": [
        {
          "file": "sections/conventions.md",
          "anchor": "## Conventions",
          "priority": 50,
          "title": "Example Conventions"
        },
        {
          "file": "sections/patterns.md",
          "anchor": "## Key Patterns",
          "priority": 50,
          "title": "Example Patterns"
        }
      ]
    },
    "commands": [
      {
        "file": "commands/deploy.md",
        "name": "deploy"
      }
    ],
    "hooks": [
      {
        "file": "hooks/pre-commit.sh",
        "hook": "pre-commit",
        "priority": 50
      }
    ],
    "settings": {
      "addDenied": [
        "rm -rf /",
        "DROP TABLE"
      ]
    },
    "mcp": {
      "servers": {
        "example-db": {
          "command": "npx",
          "args": ["-y", "example-mcp-server"]
        }
      }
    }
  }
}
```

## CLAUDE.md Sections

Skills contribute content to CLAUDE.md via section files in the `sections/` directory.

### Anchor Points

Each section targets an anchor — a heading in CLAUDE.md where the content should be inserted:

```json
{
  "file": "sections/conventions.md",
  "anchor": "## Conventions",
  "priority": 50,
  "title": "React Conventions"
}
```

- **anchor**: The heading to insert under. If it doesn't exist, it's created.
- **priority**: Controls ordering when multiple skills contribute to the same anchor (lower = first). Default: 50.
- **title**: The sub-heading for this skill's content.

### Content Format

Section files are plain Markdown:

```markdown
### Component Patterns

- Use functional components with hooks
- Prefer named exports over default exports
- Co-locate styles with components

### Testing

- Use React Testing Library for component tests
- Prefer `screen.getByRole` over `getByTestId`
- Test behavior, not implementation
```

### Source Tracking

claude-adapt automatically wraps skill content with HTML comment markers:

```html
<!-- claude-adapt:source:claude-skill-react:start -->
### React Conventions
...
<!-- claude-adapt:source:claude-skill-react:end -->
```

These markers enable clean removal when a skill is uninstalled. **Do not include these markers in your section files** — they are added automatically.

## Commands

Commands become slash commands in Claude Code. Each command is a `.md` file:

```markdown
Run the deployment pipeline:

1. Run all tests: `npm test -- --run`
2. Build the project: `npm run build`
3. Deploy to staging: `npm run deploy:staging`
4. Verify the deployment is healthy
5. If staging looks good, deploy to production: `npm run deploy:prod`
```

The filename (minus `.md`) becomes the command name: `commands/deploy.md` → `/deploy`.

## Hooks

Hook scripts are composed with other skills using priority-ordered blocks:

```bash
#!/bin/bash
# Priority 50: Run framework-specific checks
npm run lint:example
```

The hook system merges multiple skills' hooks into a single script, ordered by priority. Lower priority numbers run first.

## Settings

Settings are **additive only** — skills can add to denied lists but never remove restrictions:

```json
{
  "settings": {
    "addDenied": [
      "dangerous-command --force"
    ]
  }
}
```

This is a security invariant. Any attempt to remove denied entries will be rejected by the merge engine.

## MCP Configs

MCP server configurations are merged into `.claude/mcp.json`:

```json
{
  "mcp": {
    "servers": {
      "postgres": {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost:5432/mydb"]
      }
    }
  }
}
```

## Scaffolding a New Skill

Use the built-in scaffolder to get started:

```bash
# Full template with all sections
npx claude-adapt skills init --template full --framework react

# Minimal template
npx claude-adapt skills init --template minimal
```

## Validating

Before publishing, validate your skill manifest and content:

```bash
npx claude-adapt skills validate .
```

This checks:
- Manifest format and required fields
- Referenced files exist
- Section anchors are valid
- Hook scripts are well-formed
- Settings are additive-only

## Publishing

Skills follow the `claude-skill-*` npm naming convention:

```bash
# In your skill directory
npm init  # Ensure package.json has name: "claude-skill-your-name"

# Validate first
npx claude-adapt skills validate .

# Publish to npm
npx claude-adapt skills publish
# or
npm publish
```

## Best Practices

1. **Be specific** — Focus on one framework or tool per skill. Don't bundle React + Vue + Angular.
2. **Keep sections concise** — CLAUDE.md content should be actionable, not exhaustive documentation.
3. **Use appropriate priorities** — Default to 50. Use lower numbers (10–30) only for foundational content that other skills depend on.
4. **Test locally** — Install your skill in a test project before publishing: `npx claude-adapt skills add ./path/to/skill`
5. **Version semantically** — Follow semver. Breaking changes to section structure or hook behavior = major version.
6. **Document detection** — If your skill targets a specific framework, mention which detection signals trigger auto-suggestion.
