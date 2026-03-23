# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 0.x     | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability in claude-adapt, please report it responsibly.

**Do not open a public issue for security vulnerabilities.**

Instead:

1. **Preferred**: Use [GitHub Security Advisories](https://github.com/kimbelas/claude-adapt/security/advisories/new) to report the vulnerability privately.
2. **Alternative**: Contact the maintainers directly via the email listed in the npm package.

We will acknowledge receipt within 48 hours and provide a timeline for a fix. We aim to release patches for confirmed vulnerabilities within 7 days.

## Security Model

claude-adapt is a development tool that analyzes codebases and generates configuration files. Its security model is built on these principles:

### Additive-Only Configuration

Skills (community plugins) can **add** restrictions to your Claude Code configuration but can **never remove** existing restrictions. This is enforced at the merge engine level — any skill that attempts to remove entries from denied command lists or relax permissions will be rejected.

### No Code Execution During Analysis

The `score` and `enhance` commands perform static analysis only. They read files and compute metrics but never execute project code, run scripts, or spawn subprocesses from the analyzed repository.

### No Network Calls During Scoring

Scoring and analysis are entirely offline operations. No data is sent to external services. The only network operations are:

- `skills search` / `skills add` — queries the npm registry (same as `npm install`)
- `skills publish` — publishes to npm (same as `npm publish`)

### Auditable Changes

All configuration changes made by claude-adapt are:

- **Transparent**: Changes are shown before being applied (use `--dry-run` to preview)
- **Source-tracked**: Skill-contributed content is marked with HTML comment source tags
- **Reversible**: Skill installations use transaction-based merging with full rollback support
- **Logged**: The skill lockfile tracks all installed skills and their versions

### File System Access

claude-adapt reads files within the target project directory for analysis. It writes files only to:

- `.claude/` directory (configuration output)
- `.claude-adapt/` directory (history and context data)
- Project root (only `CLAUDE.md` if it exists at root level)

It never modifies source code files.

## Scope

claude-adapt generates configuration files that influence how Claude Code interacts with your project. The generated configuration itself follows Claude Code's security model — permissions, allowed/denied commands, and safety guardrails are all standard Claude Code features.

If you find that claude-adapt generates configuration that could lead to unintended behavior in Claude Code, please report it as a security issue.
