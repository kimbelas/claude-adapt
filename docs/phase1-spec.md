# claude-adapt — Phase 1: `score` — Full Technical Specification

> **Package:** `claude-adapt` (npm)  
> **License:** MIT  
> **Phase:** 1 of 4 (score → init → skills → sync)  
> **Status:** Locked — Ready for implementation

---

## 1. Overview

`claude-adapt score` is a CLI command that performs static analysis on any codebase and produces a **Claude Code Readiness Score** (0–100). Unlike generic code quality tools (ESLint, SonarQube), every signal is calibrated around one question: **"How effectively can Claude Code work in this repo?"**

The score flows through a 6-stage pipeline, supports language-agnostic analysis with pluggable language enhancers, caches results for fast re-runs, and tracks improvements over time.

---

## 2. Product Context — The 4-Phase Lifecycle

```
npx claude-adapt score      # Phase 1 — Assess readiness (this spec)
npx claude-adapt init       # Phase 2 — Scan + generate .claude/ config
npx claude-adapt skills add # Phase 3 — Install community skill packs
npx claude-adapt sync       # Phase 4 — Evolve living context over sessions
```

Phase 1 output feeds Phase 2 (score data drives config generation). Phase 3 skills can contribute scoring enhancers. Phase 4 tracks context evolution and triggers re-scoring.

---

## 3. Architecture

### 3.1 Project Structure (Full — All 4 Phases)

```
claude-adapt/
├── src/
│   ├── core/                         # The engine (zero dependencies on commands)
│   │   ├── pipeline/
│   │   │   ├── pipeline.ts           # Orchestrator — runs stages in order
│   │   │   ├── stage.ts              # Abstract stage interface
│   │   │   ├── parallel-executor.ts  # Worker thread pool for analyzers
│   │   │   └── cache.ts              # Content-hash based result cache
│   │   ├── context/
│   │   │   ├── scan-context.ts       # Immutable snapshot of repo state
│   │   │   ├── file-index.ts         # Virtual FS — glob, read, AST (lazy)
│   │   │   └── git-context.ts        # Git history abstraction
│   │   ├── plugin/
│   │   │   ├── plugin-host.ts        # Plugin lifecycle manager
│   │   │   ├── plugin-api.ts         # What plugins receive (sandboxed)
│   │   │   ├── hook-registry.ts      # Tapable-style hook system
│   │   │   └── types.ts              # Plugin interface contracts
│   │   ├── scoring/
│   │   │   ├── engine.ts             # Weighted multi-signal aggregator
│   │   │   ├── confidence.ts         # Per-signal confidence (0–1)
│   │   │   ├── normalizer.ts         # Raw → normalized score mapping
│   │   │   └── comparator.ts         # Delta scoring vs history
│   │   ├── detection/
│   │   │   ├── detector-chain.ts     # Chain of responsibility pattern
│   │   │   ├── language.ts           # tree-sitter backed language detection
│   │   │   ├── framework.ts          # Config file + dependency heuristics
│   │   │   ├── tooling.ts            # Linters, formatters, CI systems
│   │   │   └── monorepo.ts           # Nx, Turborepo, Lerna, workspaces
│   │   └── di/
│   │       ├── container.ts          # Lightweight IoC container
│   │       └── tokens.ts             # Injection tokens
│   │
│   ├── analyzers/                    # Each analyzer is a self-contained plugin
│   │   ├── _base.ts                  # Abstract analyzer with lifecycle hooks
│   │   ├── documentation/
│   │   │   ├── index.ts              # Analyzer entry
│   │   │   ├── signals/              # Individual signal detectors
│   │   │   │   ├── readme-quality.ts
│   │   │   │   ├── inline-comments.ts
│   │   │   │   ├── api-docs.ts
│   │   │   │   ├── architecture-docs.ts
│   │   │   │   └── changelog.ts
│   │   │   └── enhancers/
│   │   │       ├── jsdoc.ts
│   │   │       ├── pydoc.ts
│   │   │       └── phpdoc.ts
│   │   ├── modularity/
│   │   │   ├── index.ts
│   │   │   ├── signals/
│   │   │   │   ├── file-size.ts
│   │   │   │   ├── function-length.ts
│   │   │   │   ├── circular-deps.ts
│   │   │   │   ├── coupling.ts       # Afferent/efferent coupling
│   │   │   │   └── depth.ts
│   │   │   └── enhancers/
│   │   ├── conventions/
│   │   │   ├── index.ts
│   │   │   ├── signals/
│   │   │   │   ├── naming-consistency.ts
│   │   │   │   ├── linter-config.ts
│   │   │   │   ├── formatter-config.ts
│   │   │   │   ├── structure-pattern.ts
│   │   │   │   ├── import-ordering.ts
│   │   │   │   └── editorconfig.ts
│   │   │   └── enhancers/
│   │   ├── type-safety/
│   │   ├── test-coverage/
│   │   ├── git-hygiene/
│   │   ├── cicd/
│   │   └── dependencies/
│   │
│   ├── reporters/                    # Output renderers (pluggable)
│   │   ├── renderer.ts              # Abstract renderer interface
│   │   ├── terminal/
│   │   │   ├── index.ts
│   │   │   ├── widgets/             # Reusable CLI UI components
│   │   │   │   ├── score-bar.ts
│   │   │   │   ├── category-row.ts
│   │   │   │   ├── recommendation.ts
│   │   │   │   └── trend-spark.ts   # Mini sparkline for history
│   │   │   └── themes/
│   │   │       ├── default.ts
│   │   │       └── minimal.ts
│   │   ├── json/
│   │   │   └── index.ts
│   │   └── html/
│   │       ├── index.ts
│   │       └── template/            # Embedded SPA report
│   │           ├── index.html
│   │           └── assets/
│   │
│   ├── recommendations/             # Recommendation engine (separate concern)
│   │   ├── engine.ts                # Prioritizes by score gap × effort × impact
│   │   ├── catalog.ts               # All known recommendations
│   │   ├── effort-estimator.ts      # Low/Med/High effort classification
│   │   └── templates/               # Per-recommendation fix templates
│   │
│   ├── history/                     # Score tracking over time
│   │   ├── store.ts                 # Read/write .claude-adapt/history.json
│   │   ├── diff.ts                  # Score delta computation
│   │   └── trends.ts               # Regression detection, streaks
│   │
│   ├── commands/                    # Thin CLI layer — delegates to core
│   │   ├── score.ts
│   │   ├── init.ts
│   │   ├── skills.ts
│   │   └── sync.ts
│   │
│   └── cli.ts                      # Entry point, Commander.js setup
│
├── plugins/                         # Built-in language enhancer plugins
│   ├── typescript/
│   ├── python/
│   ├── php/
│   ├── rust/
│   └── go/
│
├── templates/                       # CLAUDE.md generation templates (Phase 2)
├── skills/                          # Built-in starter skills (Phase 3)
│
├── test/
│   ├── fixtures/                    # Fake repos for testing analyzers
│   │   ├── perfect-score/
│   │   ├── zero-score/
│   │   ├── typescript-messy/
│   │   └── python-clean/
│   ├── unit/
│   ├── integration/
│   └── snapshots/
│
├── .claude-adapt.config.ts          # Dogfooding — our own config
├── package.json
├── tsconfig.json
└── README.md
```

### 3.2 Key Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| **Language** | TypeScript | Native to npm ecosystem; target audience has Node.js (Claude Code prerequisite) |
| **CLI framework** | Commander.js | Industry standard, minimal overhead |
| **Parallelism** | Worker threads | Analyzers run in parallel; large repos don't block main thread |
| **Caching** | Content-hash per file | Skip unchanged files on re-scan |
| **Plugin system** | Tapable-style hooks | Webpack-proven pattern; skills (Phase 3) can tap any pipeline stage |
| **DI** | Lightweight IoC container | Testable, swappable components without framework lock-in |
| **Monorepo support** | Detector chain | Identifies Nx/Turborepo/Lerna/workspaces; per-package or aggregate scoring |

---

## 4. The Score Pipeline

```
npx claude-adapt score [path] [flags]
        │
        ▼
┌─ STAGE 1: DETECT ────────────────────────────────┐
│  detector-chain.ts runs all detectors in parallel │
│  Output: RepoProfile                              │
│  ├── languages: [{name, percentage, fileCount}]   │
│  ├── frameworks: [{name, version, confidence}]    │
│  ├── tooling: {linter, formatter, ci, bundler}    │
│  ├── structure: {monorepo?, depth, entryPoints}   │
│  └── packageManager: npm | yarn | pnpm | bun      │
└───────────────────────────────────────────────────┘
        │
        ▼
┌─ STAGE 2: INDEX ──────────────────────────────────┐
│  file-index.ts builds virtual FS                  │
│  - Respects .gitignore + .claude-adapt-ignore     │
│  - Content-hashes every file (for cache hits)     │
│  - Lazy AST parsing (only when analyzer requests) │
│  - Builds import graph (for coupling analysis)    │
│  Output: FileIndex (queryable, cacheable)         │
└───────────────────────────────────────────────────┘
        │
        ▼
┌─ STAGE 3: ANALYZE (parallel via worker threads) ─┐
│  parallel-executor.ts fans out to worker pool     │
│  Each analyzer:                                   │
│    1. Receives ScanContext (RepoProfile + Index)   │
│    2. Runs base signals                           │
│    3. Loads matching enhancers for detected langs │
│    4. Returns Signal[] with values + confidence   │
│  Cache: skips unchanged files via content hash    │
│  Output: AnalyzerResult[] (8 categories)          │
└───────────────────────────────────────────────────┘
        │
        ▼
┌─ STAGE 4: SCORE ──────────────────────────────────┐
│  engine.ts aggregates signals into category scores│
│  confidence.ts adjusts weights by signal certainty│
│  normalizer.ts maps raw values to 0–maxWeight     │
│  comparator.ts diffs against history if available │
│  Output: ScoreResult                              │
└───────────────────────────────────────────────────┘
        │
        ▼
┌─ STAGE 5: RECOMMEND ─────────────────────────────┐
│  engine.ts matches score gaps to catalog entries  │
│  Ranks by (gap × impact) / effort                │
│  Filters: only show if confidence > 0.6          │
│  Output: Recommendation[] (dynamic count)         │
└───────────────────────────────────────────────────┘
        │
        ▼
┌─ STAGE 6: REPORT + PERSIST ──────────────────────┐
│  Renders via selected reporter (terminal/json/html)│
│  Appends to .claude-adapt/history.json            │
│  Writes .claude-adapt/cache.json (for next run)   │
│  Output: formatted report + side effects          │
└───────────────────────────────────────────────────┘
```

---

## 5. Core Types

### 5.1 Signal — The Atomic Unit

```typescript
interface Signal {
  id: string;                    // e.g. "documentation.readme.quality"
  category: AnalyzerCategory;    // e.g. "documentation"
  name: string;                  // Human-readable: "README Quality"

  // The measurement
  value: number;                 // Raw measured value (e.g. 0.73)
  unit: string;                  // What value means: "ratio", "count", "lines"

  // Interpretation
  score: number;                 // Normalized 0–1 (mapped from value via thresholds)
  confidence: number;            // 0–1, how sure we are this signal is accurate

  // Context for recommendations
  evidence: Evidence[];          // Files/lines that contributed to this signal
  threshold: {
    poor: number;                // Below this = 0 score
    fair: number;                // Interpolation zone
    good: number;                // Above this = 1.0 score
  };

  // Claude Code specific relevance
  claudeImpact: string;         // Why this matters for Claude Code specifically
}

interface Evidence {
  file: string;
  line?: number;
  snippet?: string;              // Short excerpt showing the issue
  suggestion?: string;           // Concrete fix
}
```

### 5.2 Analyzer Hooks (Tapable-style)

```typescript
interface AnalyzerHooks {
  beforeAnalyze:  AsyncSeriesHook<[ScanContext]>;
  onSignal:       AsyncParallelHook<[Signal, ScanContext]>;
  afterAnalyze:   AsyncSeriesHook<[AnalyzerResult]>;
  onScore:        AsyncSeriesWaterfallHook<[ScoreResult]>;
  onRecommend:    AsyncSeriesWaterfallHook<[Recommendation[]]>;
}
```

### 5.3 Recommendation

```typescript
interface Recommendation {
  id: string;
  signal: string;              // Which signal triggered this
  title: string;               // "Break up large files"
  description: string;         // Why this matters for Claude Code
  gap: number;                 // Points you'd gain (0–maxWeight)
  effort: 'low' | 'medium' | 'high';
  effortScore: number;         // 1, 3, 5
  impact: number;              // 1–10, Claude Code effectiveness impact
  evidence: Evidence[];        // Specific files/lines to fix
  fixTemplate?: string;        // Actionable fix instruction
}
```

### 5.4 History

```typescript
// .claude-adapt/history.json
interface ScoreHistory {
  version: 1;
  projectId: string;                // Content-hash of repo root structure
  runs: ScoreRun[];
}

interface ScoreRun {
  timestamp: string;                // ISO 8601
  commitHash: string;               // Git HEAD at time of scan
  branch: string;
  total: number;                    // 0–100
  categories: Record<AnalyzerCategory, {
    score: number;
    max: number;
    signalCount: number;
  }>;
  recommendations: number;          // Count of recommendations generated
  duration: number;                 // Scan time in ms
}
```

---

## 6. Scoring Categories — Full Signal Specification

### 6.1 Weight Tiers

| Tier | Weight | Categories | Rationale |
|---|---|---|---|
| **Tier 1** | 20 pts each (60 total) | Documentation, Modularity, Conventions | Directly affect how well Claude Code performs |
| **Tier 2** | 12/12/8 pts (32 total) | Type Safety, Test Coverage, Git Hygiene | Help but aren't blockers |
| **Tier 3** | 4 pts each (8 total) | CI/CD, Dependencies | Nice-to-have quality signals |

**Total: 100 points**

---

### 6.2 DOCUMENTATION (Tier 1 · maxWeight: 20)

| Signal ID | Name | What It Measures | Poor | Fair | Good | Claude Impact |
|---|---|---|---|---|---|---|
| `doc.readme.exists` | README Exists | README.md present | 0 | — | 1 | Claude reads README first to understand project purpose |
| `doc.readme.quality` | README Quality | Sections count (install, usage, API, etc.) | <2 | 3–4 | 5+ | More sections = Claude understands project structure faster |
| `doc.readme.staleness` | README Staleness | Last modified vs last code commit (days) | >180 | 30–180 | <30 | Stale docs mislead Claude about current architecture |
| `doc.inline.density` | Inline Comment Density | Comment-to-code ratio | <0.02 | 0.02–0.08 | >0.08 | Inline comments explain *why*, which Claude needs for safe edits |
| `doc.api.coverage` | API Doc Coverage | Exported functions with doc comments (ratio) | <0.1 | 0.1–0.5 | >0.5 | Claude uses function docs to understand contracts before editing |
| `doc.architecture` | Architecture Docs | ADRs, ARCHITECTURE.md, or diagrams present | 0 | — | 1 | Architectural docs prevent Claude from violating design decisions |
| `doc.changelog` | Changelog | CHANGELOG.md or conventional commits | 0 | partial | 1 | Claude uses change history to understand project evolution |

---

### 6.3 MODULARITY (Tier 1 · maxWeight: 20)

| Signal ID | Name | What It Measures | Poor | Fair | Good | Claude Impact |
|---|---|---|---|---|---|---|
| `mod.file.size.p90` | File Size (P90) | 90th percentile file size (lines) | >500 | 200–500 | <200 | Claude's context window works best with focused files |
| `mod.file.size.max` | Max File Size | Largest file in repo (lines) | >1000 | 500–1000 | <500 | Single huge files exhaust context, causing truncation |
| `mod.function.length.p90` | Function Length (P90) | 90th percentile function length (lines) | >80 | 30–80 | <30 | Long functions = Claude can't hold full context of what it's editing |
| `mod.coupling.circular` | Circular Dependencies | Circular dependency count | >5 | 1–5 | 0 | Circular deps cause Claude's edits to have unexpected side effects |
| `mod.coupling.afferent` | Max Afferent Coupling | Max inbound dependencies on single file | >15 | 8–15 | <8 | High-coupling files are risky for Claude to touch |
| `mod.depth.max` | Max Folder Depth | Max folder nesting depth | >7 | 5–7 | <5 | Deep nesting confuses Claude's file navigation |
| `mod.entrypoints` | Clear Entry Points | Clear entry point detection | 0 | — | 1 | Claude needs to know where execution starts |

---

### 6.4 CONVENTIONS (Tier 1 · maxWeight: 20)

| Signal ID | Name | What It Measures | Poor | Fair | Good | Claude Impact |
|---|---|---|---|---|---|---|
| `conv.naming.consistency` | Naming Consistency | Naming pattern entropy (mixed camelCase/snake_case) | >0.5 | 0.2–0.5 | <0.2 | Inconsistent naming = Claude guesses wrong style for new code |
| `conv.linter.exists` | Linter Config | Linter config present | 0 | — | 1 | Linter config teaches Claude the project's code style rules |
| `conv.linter.strictness` | Linter Strictness | Rule count / severity levels | <10 | 10–30 | >30 | Stricter rules = Claude has clearer guardrails |
| `conv.formatter.exists` | Formatter Config | Formatter config (Prettier, Black, etc.) | 0 | — | 1 | Auto-formatting means Claude doesn't need to match style manually |
| `conv.structure.pattern` | Folder Structure | Matches known folder convention | none | partial | strong | Predictable structure helps Claude place new files correctly |
| `conv.imports.ordering` | Import Ordering | Import statement consistency | random | partial | consistent | Consistent imports = Claude follows the pattern automatically |
| `conv.editorconfig` | EditorConfig | .editorconfig present | 0 | — | 1 | Gives Claude indentation/EOL rules across editors |

---

### 6.5 TYPE SAFETY (Tier 2 · maxWeight: 12)

| Signal ID | Name | What It Measures | Poor | Fair | Good | Claude Impact |
|---|---|---|---|---|---|---|
| `type.coverage` | Type Coverage | Typed vs untyped file ratio | <0.2 | 0.2–0.7 | >0.7 | Types let Claude understand data shapes for safe mutations |
| `type.strictness` | Strict Mode | Strict mode/level in config | off | partial | full | Strict types = Claude catches its own errors pre-commit |
| `type.any.ratio` | Any/Untyped Ratio | `any`/`unknown`/`untyped` usage rate | >0.1 | 0.03–0.1 | <0.03 | Every `any` is a blind spot where Claude can introduce bugs |
| `type.definitions` | Type Definitions | Type definitions for dependencies | <0.3 | 0.3–0.8 | >0.8 | Missing @types means Claude guesses at library APIs |

---

### 6.6 TEST COVERAGE (Tier 2 · maxWeight: 12)

| Signal ID | Name | What It Measures | Poor | Fair | Good | Claude Impact |
|---|---|---|---|---|---|---|
| `test.ratio` | Test-to-Source Ratio | Test files to source files | <0.1 | 0.1–0.5 | >0.5 | Tests let Claude verify its own changes didn't break things |
| `test.runner` | Test Runner | Test runner config detected | 0 | — | 1 | Claude can run tests after making edits |
| `test.scripts` | Test Scripts | Test commands in package.json/Makefile | 0 | — | 1 | Claude needs to know how to execute tests |
| `test.coverage.config` | Coverage Config | Coverage reporting configured | 0 | — | 1 | Coverage config means Claude can measure its own impact |
| `test.naming` | Test Naming | Test file naming convention consistency | mixed | — | consistent | Consistent test naming helps Claude find related tests |

---

### 6.7 GIT HYGIENE (Tier 2 · maxWeight: 8)

| Signal ID | Name | What It Measures | Poor | Fair | Good | Claude Impact |
|---|---|---|---|---|---|---|
| `git.ignore.quality` | Gitignore Quality | .gitignore covers common patterns | <0.5 | 0.5–0.8 | >0.8 | Missing ignores = Claude sees noise files in context |
| `git.commit.convention` | Commit Convention | Conventional commit pattern adherence | <0.2 | 0.2–0.7 | >0.7 | Consistent commits help Claude write matching commit messages |
| `git.commit.size.p90` | Commit Size (P90) | 90th percentile commit size (files changed) | >20 | 8–20 | <8 | Small commits = Claude can make atomic, reviewable changes |
| `git.binaries` | Binary Files | Large binaries committed | >5 | 1–5 | 0 | Binaries in repo waste Claude's context scanning |

---

### 6.8 CI/CD (Tier 3 · maxWeight: 4)

| Signal ID | Name | What It Measures | Poor | Fair | Good | Claude Impact |
|---|---|---|---|---|---|---|
| `cicd.pipeline` | CI Pipeline | CI config detected | 0 | — | 1 | Claude can understand build/deploy constraints |
| `cicd.scripts` | Build/Deploy Scripts | Build/deploy scripts defined | 0 | partial | complete | Claude needs to know how to build the project |

---

### 6.9 DEPENDENCIES (Tier 3 · maxWeight: 4)

| Signal ID | Name | What It Measures | Poor | Fair | Good | Claude Impact |
|---|---|---|---|---|---|---|
| `deps.lockfile` | Lockfile | Lockfile present and committed | 0 | — | 1 | Reproducible installs = Claude's test runs match yours |
| `deps.count` | Dependency Count | Total dependency count reasonableness | >200 | 100–200 | <100 | Fewer deps = less surface area Claude needs to understand |

---

## 7. Scoring Math

### 7.1 Per-Signal Scoring

```typescript
function scoreSignal(signal: Signal): number {
  const { value, threshold, confidence } = signal;

  let rawScore: number;
  if (value <= threshold.poor) rawScore = 0;
  else if (value >= threshold.good) rawScore = 1.0;
  else {
    // Linear interpolation in the fair zone
    rawScore = (value - threshold.poor) / (threshold.good - threshold.poor);
  }

  // Confidence-adjusted: uncertain signals pull toward 0.5 (neutral)
  return rawScore * confidence + 0.5 * (1 - confidence);
}
```

**Why confidence adjustment matters:** The formula `rawScore * confidence + 0.5 * (1 - confidence)` ensures that low-confidence signals (e.g., heuristic pattern matching on unfamiliar project structures) don't tank or inflate the score. Only high-confidence signals have real weight. At confidence = 1.0, the formula reduces to `rawScore`. At confidence = 0.0, it returns 0.5 (neutral).

### 7.2 Per-Category Scoring

```typescript
function scoreCategory(signals: Signal[], maxWeight: number): CategoryScore {
  const signalScores = signals.map(s => ({
    score: scoreSignal(s),
    weight: s.weight ?? 1,  // some signals matter more within category
  }));

  const weightedAvg = sum(s => s.score * s.weight) / sum(s => s.weight);

  return {
    raw: weightedAvg,                                 // 0–1
    normalized: Math.round(weightedAvg * maxWeight),  // 0–maxWeight
    max: maxWeight,
    signals: signalScores,
  };
}
```

### 7.3 Total Score

```typescript
function totalScore(categories: CategoryScore[]): number {
  return categories.reduce((sum, cat) => sum + cat.normalized, 0);
  // Max possible: 20 + 20 + 20 + 12 + 12 + 8 + 4 + 4 = 100
}
```

---

## 8. Recommendation Engine

### 8.1 Dynamic Ranking Formula

```typescript
function rankRecommendations(recs: Recommendation[]): Recommendation[] {
  return recs
    .filter(r => r.gap > 0.5)              // Only meaningful gaps
    .filter(r => r.confidence > 0.6)        // Only confident findings
    .sort((a, b) => {
      const scoreA = (a.gap * a.impact) / a.effortScore;
      const scoreB = (b.gap * b.impact) / b.effortScore;
      return scoreB - scoreA;               // Highest ROI first
    });
  // No fixed count — show all that pass the threshold
}
```

### 8.2 Effort Classification

| Effort | Score | Definition |
|---|---|---|
| **Low** | 1 | Single config change or file rename |
| **Medium** | 3 | Refactor across a few files, add tooling |
| **High** | 5 | Architectural change, major restructuring |

### 8.3 Impact Scale

1–10 scale based on how much the fix improves Claude Code's ability to work in the repo. Impact 10 = "Claude literally can't function without this fix." Impact 1 = "Nice to have, marginal improvement."

---

## 9. History & Trend Detection

### 9.1 History Store Schema

```typescript
// .claude-adapt/history.json
interface ScoreHistory {
  version: 1;
  projectId: string;
  runs: ScoreRun[];
}

interface ScoreRun {
  timestamp: string;
  commitHash: string;
  branch: string;
  total: number;
  categories: Record<AnalyzerCategory, {
    score: number;
    max: number;
    signalCount: number;
  }>;
  recommendations: number;
  duration: number;
}
```

### 9.2 Trend Detection

```typescript
function detectTrends(history: ScoreRun[]): Trend[] {
  const trends: Trend[] = [];
  const recent = history.slice(-5);  // Last 5 runs

  for (const category of CATEGORIES) {
    const scores = recent.map(r => r.categories[category].score);
    const slope = linearRegression(scores).slope;

    if (slope < -0.5 && recent.length >= 3) {
      trends.push({
        category,
        type: 'regression',
        message: `${category} declining over last ${recent.length} runs`,
        severity: 'warning',
      });
    }

    if (slope > 0.3 && recent.length >= 3) {
      trends.push({
        category,
        type: 'improvement',
        message: `${category} improving — ${recent.length} run streak`,
        severity: 'positive',
      });
    }
  }

  return trends;
}
```

---

## 10. CLI Specification

```
npx claude-adapt score [path] [options]

Arguments:
  path                    Repository path (default: current directory)

Options:
  -f, --format <type>     Output format: terminal|json|html (default: terminal)
  -o, --output <path>     Write report to file (json/html modes)
  --no-history            Don't persist this run to history
  --no-cache              Force full rescan (ignore cache)
  --category <names...>   Score specific categories only
  --workspace <path>      Score a specific monorepo workspace
  --ci                    CI mode: json output, exit code = score < threshold
  --threshold <n>         Fail CI if score below n (default: 50)
  --verbose               Show individual signal details
  --quiet                 Score number only
  --compare <commit>      Compare against a specific historical run
```

---

## 11. Terminal Output Mockup

```
╭─────────────────────────────────────╮
│  claude-adapt score  •  v1.0.0      │
│  Repo: my-project                   │
│  Languages: TypeScript, Python      │
│  Framework: Next.js                 │
╰─────────────────────────────────────╯

  Claude Code Readiness Score: 67/100  ██████████████░░░░░░

  TIER 1 (Core Effectiveness)
  ● Documentation       ████████░░░░  14/20  Missing API docs
  ● Modularity          ██████████░░  17/20  3 files over 500 lines
  ● Conventions         ████████████  20/20  Excellent consistency

  TIER 2 (Enhancement)
  ○ Type Safety         ████████░░░░   8/12  strict mode disabled
  ○ Test Coverage       ████░░░░░░░░   4/12  Low test-to-source ratio
  ○ Git Hygiene         ██████░░░░░░   4/8   Inconsistent commit msgs

  TIER 3 (Quality Signals)
  ◦ CI/CD               ████████████   4/4   GitHub Actions detected
  ◦ Dependencies        ████████████   4/4   All healthy

  📈 Type Safety improving — 3 run streak
  ⚠️  Test Coverage declining over last 4 runs

  RECOMMENDATIONS (ranked by impact/effort)
  1. [LOW effort · +4 pts] Break up src/utils/helpers.ts (847 lines)
     → Claude works best with files under 300 lines
  2. [LOW effort · +3 pts] Enable strict mode in tsconfig.json
     → Gives Claude better type context for edits
  3. [MED effort · +5 pts] Add JSDoc to exported functions in src/api/
     → Claude uses these to understand intent before editing
  4. [MED effort · +3 pts] Add unit tests for src/services/
     → Claude can verify its own changes didn't break things

  Run 'claude-adapt init' to generate optimized Claude Code config →
```

---

## 12. Design Principles

1. **Every signal answers one question:** "Does this make Claude Code more effective in this repo?"
2. **Confidence over certainty:** Uncertain signals pull toward neutral, not zero.
3. **Recommendations are actionable:** Every recommendation has a concrete fix, not just a complaint.
4. **Language-agnostic base, language-specific enhancers:** Works on any repo day one; deepens over time.
5. **Pipeline not monolith:** Every stage is cacheable, parallelizable, and swappable.
6. **Phase 3 integration point:** Skills can contribute scoring enhancers via the Tapable hook system.
