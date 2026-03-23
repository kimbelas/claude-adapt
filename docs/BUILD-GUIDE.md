# claude-adapt — Build Guide

Step-by-step instructions for building claude-adapt in Claude Code. This document is your starting point.

---

## 1. Project Setup

```bash
mkdir claude-adapt && cd claude-adapt
git init

# Copy these files from the spec outputs:
# - package.json (from claude-adapt-package.json)
# - tsconfig.json (from claude-adapt-tsconfig.json)
# - CLAUDE.md (from claude-adapt-CLAUDE.md)
# - README.md (from claude-adapt-README.md)

# Place phase specs in docs/
mkdir -p docs
# - docs/phase1-spec.md
# - docs/phase2-spec.md
# - docs/phase3-spec.md
# - docs/phase4-spec.md

npm install
```

## 2. Build Order

### Phase 1: `score` — The Foundation

Build these in order. Each step depends on the previous one.

**Step 1: Core scaffolding**
Create the directory structure from CLAUDE.md. Start with empty files + exports for:
- `src/cli.ts` — Commander.js entry point with `score` subcommand
- `src/core/pipeline/pipeline.ts` — Pipeline orchestrator (just the interface/skeleton)
- `src/core/di/container.ts` — Simple IoC container

**Step 2: Detection chain**
Build the detectors that identify what's in a repo:
- `src/core/detection/language.ts` — Detect languages by file extension + content
- `src/core/detection/framework.ts` — Detect frameworks by config files + deps
- `src/core/detection/tooling.ts` — Detect linters, formatters, CI, bundlers
- `src/core/detection/monorepo.ts` — Detect workspace configs
- `src/core/detection/detector-chain.ts` — Orchestrate all detectors

Test with: run against a real repo and verify detection output.

**Step 3: File indexing**
- `src/core/context/file-index.ts` — Virtual FS with glob, read, content hashing
- `src/core/context/git-context.ts` — Git history abstraction
- `src/core/context/scan-context.ts` — Immutable snapshot combining RepoProfile + FileIndex

**Step 4: Base analyzers (one at a time)**
Start with the simplest, build confidence:

1. `dependencies/` — Lockfile check, dep count (2 signals, easy)
2. `cicd/` — Pipeline config, build scripts (2 signals, easy)
3. `git-hygiene/` — .gitignore, commit patterns (4 signals, medium)
4. `documentation/` — README, comments, API docs (7 signals, medium)
5. `conventions/` — Naming, linter, formatter (7 signals, medium)
6. `test-coverage/` — Test ratio, runner, scripts (5 signals, medium)
7. `type-safety/` — Coverage, strictness, any ratio (4 signals, medium)
8. `modularity/` — File size, coupling, depth (7 signals, hardest)

For each analyzer:
- Implement signals in `signals/` subdirectory
- Each signal returns: `{ id, value, confidence, evidence, threshold }`
- Write tests using fixture repos in `test/fixtures/`

**Step 5: Scoring engine**
- `src/core/scoring/engine.ts` — Aggregate signals into category scores
- `src/core/scoring/confidence.ts` — Confidence adjustment formula
- `src/core/scoring/normalizer.ts` — Raw → 0-maxWeight mapping

**Step 6: Recommendation engine**
- `src/recommendations/engine.ts` — Rank by (gap × impact) / effort
- `src/recommendations/catalog.ts` — All recommendation templates

**Step 7: Terminal reporter**
- `src/reporters/terminal/` — Colored output with score bars, category rows, recommendations
- Use `chalk` for colors, keep it clean and readable

**Step 8: History tracking**
- `src/history/store.ts` — Read/write `.claude-adapt/history.json`
- `src/history/trends.ts` — Regression detection, streaks

**Step 9: JSON + HTML reporters**
- `src/reporters/json/` — Structured JSON output
- `src/reporters/html/` — Embedded SPA report

**Step 10: Pipeline integration**
Wire everything together:
- Pipeline orchestrator runs stages in order
- Content-hash caching (skip unchanged files)
- CLI flags fully implemented

**Milestone: `npx claude-adapt score` works on any repo.**

### Phase 2: `init` — Config Generation

After Phase 1 is solid:
- Template engine with Handlebars partials
- 5 generators: CLAUDE.md, settings, commands, hooks, MCP
- Interactive mode with prompts
- Safety presets (minimal/standard/strict)

### Phase 3: `skills` — Plugin Ecosystem

After Phase 2 is solid:
- Skill manifest schema + validator
- 5 sub-mergers (CLAUDE.md, hooks, settings, commands, MCP)
- npm registry integration
- Transaction logging + rollback
- Built-in starter skills

### Phase 4: `sync` — Living Context

After Phase 3 is solid:
- Session collector (git diff analysis)
- Decision detector heuristics
- Hotspot tracker
- Convention drift detector
- CLAUDE.md updater with safety guardrails
- Context store pruning

---

## 3. Testing Strategy

**Fixture repos** — Create minimal fake repos in `test/fixtures/`:
- `perfect-score/` — All signals maxed (README, tests, types, linter, etc.)
- `zero-score/` — Empty repo, no config, no docs
- `typescript-messy/` — TS project with issues (big files, any types, no tests)
- `python-clean/` — Well-structured Python project
- `monorepo/` — Nx/workspace structure
- `laravel/` — PHP/Laravel project

**Test each analyzer** against these fixtures and snapshot the output.

**Integration tests** — Run full `score` pipeline against fixture repos, snapshot the terminal output.

---

## 4. Key Dependencies Reference

| Package | Purpose | Phase |
|---|---|---|
| `commander` | CLI framework | All |
| `chalk` | Terminal colors | 1 |
| `ora` | Spinners | 1 |
| `fast-glob` | File matching | 1 |
| `handlebars` | Template engine | 2 |
| `semver` | Version comparison | 3 |
| `tsup` | Build/bundle | All |
| `vitest` | Testing | All |
| `tsx` | Dev mode (run TS directly) | Dev |

---

## 5. npm Publishing Checklist

Before first publish:
- [ ] `npm login`
- [ ] Verify `claude-adapt` is still available: `npm view claude-adapt` (should 404)
- [ ] `npm run build` succeeds
- [ ] `npm test` passes
- [ ] README.md is polished
- [ ] `npx claude-adapt score .` works on a clean clone
- [ ] `npm publish --dry-run` looks correct
- [ ] `npm publish`

Claim the name early with a minimal v0.0.1 if needed.

---

## 6. Quick Reference — File Locations

| What you need | Where to find it |
|---|---|
| Full Phase 1 spec (38 signals) | `docs/phase1-spec.md` |
| Full Phase 2 spec (5 generators) | `docs/phase2-spec.md` |
| Full Phase 3 spec (merge engine) | `docs/phase3-spec.md` |
| Full Phase 4 spec (sync engine) | `docs/phase4-spec.md` |
| Project instructions for Claude Code | `CLAUDE.md` |
| Public README | `README.md` |
| Architecture overview | `CLAUDE.md` → Architecture section |
| Scoring categories + weights | `docs/phase1-spec.md` → Section 6 |
| Signal thresholds (all 38) | `docs/phase1-spec.md` → Sections 6.2–6.9 |
| Scoring math formulas | `docs/phase1-spec.md` → Section 7 |
| Merge engine algorithms | `docs/phase3-spec.md` → Section 5 |
| CLAUDE.md updater rules | `docs/phase4-spec.md` → Section 10 |
