# claude-adapt — Phase 4: `sync` — Full Technical Specification

> **Package:** `claude-adapt` (npm)  
> **License:** MIT  
> **Phase:** 4 of 4 (score → init → skills → sync)  
> **Status:** Locked — Ready for implementation

---

## 1. Overview

`claude-adapt sync` is the living context engine that keeps Claude Code configuration evolving as the project evolves. After every Claude Code session, `sync` analyzes what happened and incrementally updates `.claude/` configuration — tracking architectural decisions, detecting convention drift, maintaining hotspot awareness, and refreshing CLAUDE.md.

**The problem:** A CLAUDE.md written today becomes stale in a week. `sync` solves this by making configuration a living document that learns from every session.

---

## 2. What Sync Does

1. **Tracks architectural decisions** made during Claude Code sessions
2. **Detects convention drift** (new patterns emerging, consistency changes)
3. **Updates file structure documentation** as the project grows
4. **Records gotchas discovered** during sessions (errors, edge cases)
5. **Refreshes score signals** and flags regressions
6. **Generates cross-session insights** (recurring errors, productivity bottlenecks)
7. **Maintains a persistent knowledge store** that survives across sessions

---

## 3. The Sync Pipeline

```
npx claude-adapt sync
        │
        ▼
┌─ STAGE 1: SESSION DETECTION ─────────────────────┐
│  Git diff since last sync commit hash             │
│  New/modified/deleted files, commit messages       │
│  Output: SessionData                              │
└───────────────────────────────────────────────────┘
        │
        ▼
┌─ STAGE 2: DECISION DETECTION ─────────────────────┐
│  Analyze diff for architectural decisions         │
│  Dependencies, directories, configs, patterns      │
│  Output: ArchitecturalDecision[]                  │
└───────────────────────────────────────────────────┘
        │
        ▼
┌─ STAGE 3: CONTEXT UPDATE ─────────────────────────┐
│  Update persistent knowledge store                │
│  Decisions, hotspots, conventions, session summary │
│  Output: Updated ContextStore                     │
└───────────────────────────────────────────────────┘
        │
        ▼
┌─ STAGE 4: INSIGHT GENERATION ─────────────────────┐
│  Cross-session pattern analysis                   │
│  Recurring errors, bottlenecks, drift, regressions│
│  Output: Insight[]                                │
└───────────────────────────────────────────────────┘
        │
        ▼
┌─ STAGE 5: CLAUDE.MD UPDATE ──────────────────────┐
│  Incrementally update CLAUDE.md                   │
│  Apply decisions, refresh sync sections, add gotchas│
│  NEVER delete manual content                      │
│  Output: Updated CLAUDE.md                        │
└───────────────────────────────────────────────────┘
        │
        ▼
┌─ STAGE 6: QUICK SCORE ───────────────────────────┐
│  Run Phase 1 score (cached, fast)                 │
│  Compare against last score, flag regressions     │
│  Output: ScoreRun (appended to history)           │
└───────────────────────────────────────────────────┘
        │
        ▼
┌─ STAGE 7: REPORT ────────────────────────────────┐
│  Terminal summary of what changed                 │
│  Output: Sync report                              │
└───────────────────────────────────────────────────┘
```

---

## 4. The Context Store — `.claude-adapt/context.json`

```typescript
interface ContextStore {
  version: 1;
  projectId: string;
  lastSync: string;
  lastSessionHash: string;

  // Accumulated knowledge
  decisions: ArchitecturalDecision[];
  patterns: DetectedPattern[];
  hotspots: Hotspot[];
  gotchas: Gotcha[];
  conventions: ConventionSnapshot;

  // Session metadata
  sessions: SessionSummary[];          // Rolling window: last 50

  // Derived insights
  insights: Insight[];
}
```

---

## 5. Session Data Collection

```typescript
interface SessionData {
  sessionId: string;
  startCommit: string;                 // Last sync point
  endCommit: string;                   // Current HEAD

  gitDiff: {
    modifiedFiles: string[];
    addedFiles: string[];
    deletedFiles: string[];
    renamedFiles: Array<{ from: string; to: string }>;
    totalLinesAdded: number;
    totalLinesRemoved: number;
  };

  commits: Array<{
    hash: string;
    message: string;
    timestamp: string;
    filesChanged: number;
  }>;

  estimatedDuration: number;
  dominantActivity: 'feature' | 'fix' | 'refactor' | 'test' | 'docs' | 'mixed';
}

class SessionCollector {
  async collect(): Promise<SessionData> {
    const lastSync = await this.getLastSyncCommit();
    const head = await this.getHead();

    if (lastSync === head) {
      throw new NoChangesError('No changes since last sync');
    }

    const diff = await this.gitDiff(lastSync, head);
    const commits = await this.gitLog(lastSync, head);

    return {
      sessionId: this.hashRange(lastSync, head),
      startCommit: lastSync,
      endCommit: head,
      gitDiff: diff,
      commits,
      estimatedDuration: this.estimateDuration(commits),
      dominantActivity: this.classifyActivity(commits),
    };
  }

  private classifyActivity(commits: Commit[]): string {
    const types = commits.map(c => this.extractCommitType(c.message));
    const counts = this.countOccurrences(types);
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'mixed';
  }
}
```

---

## 6. Decision Detection

### 6.1 Architectural Decision Schema

```typescript
interface ArchitecturalDecision {
  id: string;
  timestamp: string;
  sessionId: string;

  title: string;
  description: string;
  rationale: string;

  filesAffected: string[];
  diffSummary: string;

  category: 'architecture' | 'convention' | 'dependency' | 'tooling' | 'pattern';
  impact: 'low' | 'medium' | 'high';
  confidence: number;                  // 0–1

  claudeMdSection?: string;
  suggestedContent?: string;
  applied: boolean;
}
```

### 6.2 Decision Detection Heuristics

```typescript
class DecisionDetector {
  async detect(session: SessionData): Promise<ArchitecturalDecision[]> {
    const decisions: ArchitecturalDecision[] = [];
    const diff = session.gitDiff;

    // 1. New dependency added
    const depChanges = this.detectDependencyChanges(diff);
    for (const dep of depChanges) {
      if (dep.type === 'added' && dep.isSignificant) {
        decisions.push({
          title: `Added ${dep.name} (${dep.purpose})`,
          category: 'dependency',
          impact: dep.isDev ? 'low' : 'medium',
          confidence: 0.9,
          suggestedContent: `- **${dep.name}**: ${dep.purpose}`,
          claudeMdSection: 'tech-stack',
        });
      }
    }

    // 2. New directory structure created
    const newDirs = this.detectNewDirectories(diff);
    for (const dir of newDirs) {
      if (dir.fileCount >= 2) {
        decisions.push({
          title: `Created ${dir.path}/ directory (${dir.fileCount} files)`,
          category: 'architecture',
          impact: 'medium',
          confidence: 0.7,
          suggestedContent: `- \`${dir.path}/\` — ${dir.inferredPurpose}`,
          claudeMdSection: 'file-structure',
        });
      }
    }

    // 3. Configuration file changes
    const configChanges = this.detectConfigChanges(diff);
    for (const config of configChanges) {
      decisions.push({
        title: `Modified ${config.file} (${config.summary})`,
        category: 'tooling',
        impact: 'low',
        confidence: 0.8,
        suggestedContent: config.claudeMdUpdate,
        claudeMdSection: config.targetSection,
      });
    }

    // 4. Pattern establishment (repeated similar structures)
    const patterns = this.detectPatternEstablishment(diff, session.context);
    for (const pattern of patterns) {
      decisions.push({
        title: `Established pattern: ${pattern.name}`,
        category: 'pattern',
        impact: 'medium',
        confidence: pattern.confidence,
        suggestedContent: pattern.documentation,
        claudeMdSection: 'key-patterns',
      });
    }

    // 5. API/route changes
    const apiChanges = this.detectApiChanges(diff);
    for (const api of apiChanges) {
      decisions.push({
        title: `${api.type} API endpoint: ${api.method} ${api.path}`,
        category: 'architecture',
        impact: 'medium',
        confidence: 0.85,
        suggestedContent: `- \`${api.method} ${api.path}\` — ${api.description}`,
        claudeMdSection: 'common-tasks',
      });
    }

    // 6. Error handling / edge case discovery
    const errorPatterns = this.detectErrorHandling(diff);
    for (const err of errorPatterns) {
      decisions.push({
        title: `Added error handling: ${err.summary}`,
        category: 'pattern',
        impact: 'low',
        confidence: 0.6,
        suggestedContent: `⚠️ ${err.gotcha}`,
        claudeMdSection: 'gotchas',
      });
    }

    return decisions;
  }

  // Detect when 3+ new files follow the same structural pattern
  private detectPatternEstablishment(diff: GitDiff, context: ContextStore): PatternCandidate[] {
    const newFiles = diff.addedFiles;
    const structures = newFiles.map(f => this.extractFileStructure(f));
    const groups = this.clusterBySimilarity(structures, 0.8);

    const patterns: PatternCandidate[] = [];
    for (const group of groups) {
      if (group.length >= 3) {
        patterns.push({
          name: `${group[0].inferredType} pattern`,
          documentation: this.describePattern(group),
          confidence: Math.min(0.9, 0.5 + group.length * 0.1),
          files: group.map(g => g.filePath),
        });
      }
    }

    // Reinforce existing low-confidence patterns seen again
    for (const existing of context.patterns) {
      if (existing.confidence < 0.8) {
        const reinforced = this.isPatternReinforced(existing, diff);
        if (reinforced) {
          existing.confidence = Math.min(1.0, existing.confidence + 0.15);
          existing.lastSeen = new Date().toISOString();
          existing.sessionCount++;
        }
      }
    }

    return patterns;
  }
}
```

---

## 7. Hotspot Tracking

```typescript
interface Hotspot {
  file: string;
  editCount: number;
  lastEdited: string;
  sessions: string[];
  risk: 'low' | 'medium' | 'high';
  note?: string;
}

class HotspotTracker {
  update(existing: Hotspot[], sessionDiff: GitDiff): Hotspot[] {
    const touchedFiles = new Set([
      ...sessionDiff.modifiedFiles,
      ...sessionDiff.addedFiles,
    ]);

    for (const file of touchedFiles) {
      const hotspot = existing.find(h => h.file === file);
      if (hotspot) {
        hotspot.editCount++;
        hotspot.lastEdited = new Date().toISOString();
        hotspot.sessions.push(sessionDiff.sessionId);
      } else {
        existing.push({
          file,
          editCount: 1,
          lastEdited: new Date().toISOString(),
          sessions: [sessionDiff.sessionId],
          risk: 'low',
        });
      }
    }

    // Risk classification
    for (const hotspot of existing) {
      if (hotspot.editCount >= 10) {
        hotspot.risk = 'high';
        hotspot.note = `Edited ${hotspot.editCount} times — consider refactoring`;
      } else if (hotspot.editCount >= 5) {
        hotspot.risk = 'medium';
        hotspot.note = `Frequently modified — Claude should be cautious`;
      }
    }

    // Decay: reduce risk for files not touched in last 10 sessions
    const recentSessions = new Set(existing.flatMap(h => h.sessions).slice(-10));
    for (const hotspot of existing) {
      const recentEdits = hotspot.sessions.filter(s => recentSessions.has(s)).length;
      if (recentEdits === 0 && hotspot.risk !== 'low') {
        hotspot.risk = 'low';
        hotspot.note = undefined;
      }
    }

    return existing;
  }
}
```

---

## 8. Convention Drift Detection

```typescript
interface ConventionSnapshot {
  timestamp: string;
  naming: {
    files: Record<string, number>;     // e.g. { "camelCase": 45, "kebab-case": 3 }
    functions: Record<string, number>;
    classes: Record<string, number>;
  };
  imports: {
    style: Record<string, number>;
    ordering: string;
  };
  fileSize: {
    p50: number;
    p90: number;
    max: number;
  };
}

interface ConventionDrift {
  type: 'naming' | 'naming-entropy' | 'modularity' | 'imports';
  scope?: string;
  from?: string;
  to?: string;
  severity: 'info' | 'warning';
  message: string;
}

class ConventionDriftDetector {
  detect(previous: ConventionSnapshot, current: ConventionSnapshot): ConventionDrift[] {
    const drifts: ConventionDrift[] = [];

    // Check naming consistency per scope
    for (const scope of ['files', 'functions', 'classes'] as const) {
      const prevDominant = this.getDominantPattern(previous.naming[scope]);
      const currDominant = this.getDominantPattern(current.naming[scope]);

      if (prevDominant.pattern !== currDominant.pattern) {
        drifts.push({
          type: 'naming',
          scope,
          from: prevDominant.pattern,
          to: currDominant.pattern,
          severity: currDominant.ratio < 0.7 ? 'warning' : 'info',
          message: `${scope} naming shifting from ${prevDominant.pattern} to ${currDominant.pattern}`,
        });
      }

      // Flag increasing entropy (mixed patterns)
      const prevEntropy = this.shannonEntropy(previous.naming[scope]);
      const currEntropy = this.shannonEntropy(current.naming[scope]);

      if (currEntropy > prevEntropy + 0.3) {
        drifts.push({
          type: 'naming-entropy',
          scope,
          severity: 'warning',
          message: `${scope} naming becoming less consistent (entropy: ${prevEntropy.toFixed(2)} → ${currEntropy.toFixed(2)})`,
        });
      }
    }

    // File size drift
    if (current.fileSize.p90 > previous.fileSize.p90 * 1.2) {
      drifts.push({
        type: 'modularity',
        severity: 'warning',
        message: `90th percentile file size growing (${previous.fileSize.p90} → ${current.fileSize.p90} lines)`,
      });
    }

    return drifts;
  }

  private shannonEntropy(distribution: Record<string, number>): number {
    const total = Object.values(distribution).reduce((a, b) => a + b, 0);
    if (total === 0) return 0;
    return -Object.values(distribution).reduce((entropy, count) => {
      const p = count / total;
      return p > 0 ? entropy + p * Math.log2(p) : entropy;
    }, 0);
  }
}
```

---

## 9. Insight Generation (Cross-Session Patterns)

```typescript
interface Insight {
  id: string;
  type: 'productivity' | 'quality' | 'pattern' | 'risk';
  title: string;
  description: string;
  evidence: string[];
  actionable: boolean;
  suggestion?: string;
  firstDetected: string;
  lastConfirmed: string;
}

class InsightEngine {
  generate(store: ContextStore): Insight[] {
    const insights: Insight[] = [];

    // 1. Recurring error patterns (same error type across 3+ sessions)
    const errorClusters = this.clusterErrors(store.gotchas);
    for (const cluster of errorClusters) {
      if (cluster.count >= 3) {
        insights.push({
          type: 'quality',
          title: `Recurring error: ${cluster.errorType}`,
          description: `Encountered in ${cluster.count} sessions. May indicate systemic issue.`,
          actionable: true,
          suggestion: `Add a pre-commit check or CLAUDE.md gotcha for: ${cluster.description}`,
        });
      }
    }

    // 2. Productivity bottlenecks (high-risk hotspot files)
    const troubleFiles = store.hotspots
      .filter(h => h.risk === 'high')
      .sort((a, b) => b.editCount - a.editCount);

    if (troubleFiles.length > 0) {
      insights.push({
        type: 'productivity',
        title: `${troubleFiles.length} files are Claude Code bottlenecks`,
        description: `Repeatedly edited: ${troubleFiles.slice(0, 5).map(f => f.file).join(', ')}`,
        actionable: true,
        suggestion: 'Break into smaller modules, add inline docs, or add CLAUDE.md guidance.',
      });
    }

    // 3. Convention drift warning
    // (detected via ConventionDriftDetector)

    // 4. Score regression alert
    const recentScores = store.sessions.slice(-5).map(s => s.quickScore).filter(Boolean);
    if (recentScores.length >= 3) {
      const trend = this.linearTrend(recentScores);
      if (trend < -1.5) {
        insights.push({
          type: 'risk',
          title: 'Claude Code readiness declining',
          description: `Score dropping over last ${recentScores.length} sessions.`,
          actionable: true,
          suggestion: `Run 'claude-adapt score --compare' for details.`,
        });
      }
    }

    return insights;
  }
}
```

---

## 10. CLAUDE.md Updater

### 10.1 Update Rules

1. **NEVER delete manual content** — only append or update sync-owned sections.
2. **Sync-owned sections** are marked with `<!-- claude-adapt:sync:* -->` markers.
3. **High-confidence decisions only** — confidence >= 0.7 threshold for auto-apply.
4. **Rate limited** — max 5 changes per sync to prevent noise.
5. **Size bounded** — max 10KB of sync-owned content total.

### 10.2 Update Algorithm

```typescript
class ClaudeMdUpdater {
  async update(
    existingContent: string,
    decisions: ArchitecturalDecision[],
    hotspots: Hotspot[],
    drifts: ConventionDrift[],
    insights: Insight[],
  ): Promise<UpdateResult> {
    const tree = this.parser.parse(existingContent);
    const changes: ClaudeMdChange[] = [];

    // 1. Update sync-owned file structure section
    const structureSection = this.findSyncSection(tree, 'sync:file-structure');
    if (structureSection) {
      const newStructure = await this.generateFileStructure();
      if (newStructure !== structureSection.content) {
        structureSection.content = newStructure;
        changes.push({ section: 'file-structure', type: 'updated' });
      }
    }

    // 2. Apply high-confidence decisions
    for (const decision of decisions.filter(d => d.confidence >= 0.7 && !d.applied)) {
      const targetSection = this.findSection(tree, decision.claudeMdSection);
      if (targetSection && decision.suggestedContent) {
        targetSection.content += '\n' + decision.suggestedContent;
        decision.applied = true;
        changes.push({
          section: decision.claudeMdSection,
          type: 'appended',
          content: decision.suggestedContent,
          reason: decision.title,
        });
      }
    }

    // 3. Update gotchas with hotspot warnings
    const gotchasSection = this.findSyncSection(tree, 'sync:gotchas');
    if (gotchasSection) {
      const highRiskHotspots = hotspots.filter(h => h.risk === 'high');
      const gotchaContent = highRiskHotspots
        .map(h => `- ⚠️ \`${h.file}\` — ${h.note}`)
        .join('\n');

      if (gotchaContent !== gotchasSection.content) {
        gotchasSection.content = gotchaContent;
        changes.push({ section: 'gotchas', type: 'updated' });
      }
    }

    // 4. Note convention drift
    if (drifts.length > 0) {
      const convSection = this.findSection(tree, 'code-conventions');
      if (convSection) {
        const driftNotes = drifts.map(d => `> ℹ️ ${d.message}`).join('\n');
        if (!convSection.content.includes(driftNotes)) {
          convSection.content += '\n\n' + driftNotes;
          changes.push({ section: 'conventions', type: 'drift-noted' });
        }
      }
    }

    // Safety validation
    const validation = this.safetyGuard.validate(changes);

    const newContent = this.serializer.serialize(tree);
    return { content: newContent, changes, unchanged: changes.length === 0, validation };
  }
}
```

---

## 11. Safety Guardrails

```typescript
class SyncSafetyGuard {
  validate(changes: ClaudeMdChange[]): ValidationResult {
    const issues: string[] = [];

    // 1. Never delete manual content
    for (const change of changes) {
      if (change.type === 'deleted' && change.source === 'manual') {
        issues.push(`Blocked: attempted to delete manual section '${change.section}'`);
      }
    }

    // 2. Rate limit: max 5 changes per sync
    if (changes.length > 5) {
      issues.push(`Too many changes (${changes.length}). Applying top 5 by confidence.`);
    }

    // 3. Size guard: max 10KB sync-owned content
    const syncContentSize = changes
      .filter(c => c.type === 'appended' || c.type === 'updated')
      .reduce((total, c) => total + (c.content?.length || 0), 0);

    if (syncContentSize > 10240) {
      issues.push('Sync content exceeding 10KB limit. Pruning oldest entries.');
    }

    // 4. Confidence floor: >= 0.7
    const lowConfidence = changes.filter(c => (c.confidence || 1) < 0.7);
    if (lowConfidence.length > 0) {
      issues.push(`Skipped ${lowConfidence.length} low-confidence changes`);
    }

    return {
      valid: issues.filter(i => i.startsWith('Blocked')).length === 0,
      issues,
    };
  }
}
```

---

## 12. Context Store Pruning

```typescript
class ContextPruner {
  prune(store: ContextStore): ContextStore {
    // Sessions: keep last 50
    store.sessions = store.sessions.slice(-50);

    // Decisions: keep last 100, or all high-impact/applied
    store.decisions = store.decisions
      .filter(d => d.impact === 'high' || d.applied)
      .concat(
        store.decisions
          .filter(d => d.impact !== 'high' && !d.applied)
          .slice(-50)
      )
      .slice(-100);

    // Hotspots: remove files that no longer exist
    store.hotspots = store.hotspots.filter(h => fs.existsSync(h.file));

    // Gotchas: keep last 30, remove resolved
    store.gotchas = store.gotchas.filter(g => !g.resolved).slice(-30);

    // Insights: keep active, archive confirmed
    store.insights = store.insights.filter(i => !i.archived).slice(-20);

    // Patterns: decay low-confidence patterns not seen in 10 sessions
    const recentSessionIds = new Set(store.sessions.slice(-10).map(s => s.id));
    store.patterns = store.patterns.filter(p =>
      p.confidence >= 0.5 ||
      p.sessionIds?.some(id => recentSessionIds.has(id))
    );

    return store;
  }
}
```

---

## 13. Sync Triggers

Three modes of execution:

```bash
# 1. Manual
npx claude-adapt sync

# 2. Claude Code post-session hook (.claude/hooks/post-session.sh)
#!/bin/bash
npx claude-adapt sync --quiet

# 3. Git post-commit hook (.git/hooks/post-commit)
npx claude-adapt sync --quick
```

---

## 14. CLI Specification

```
npx claude-adapt sync [options]

Options:
  --quiet                    Minimal output (for hook usage)
  --quick                    Fast mode: skip insight generation + quick score only
  --dry-run                  Show what would change without writing
  --no-claude-md             Update context store but don't touch CLAUDE.md
  --no-score                 Skip quick score
  --reset                    Clear context store and start fresh
  --since <commit>           Analyze changes since specific commit
  --export <path>            Export context store as markdown report
  --verbose                  Show all detected decisions (including low confidence)
  --auto-apply               Apply all decisions without confirmation (default in hook mode)
  --interactive              Confirm each CLAUDE.md change before applying
```

---

## 15. Terminal Output

```
$ npx claude-adapt sync

  ⟳ claude-adapt sync  •  analyzing session...

  SESSION SUMMARY
  Commits: 3 (feat: add user auth, fix: token refresh, test: auth tests)
  Files: 12 modified, 5 created, 1 deleted
  Duration: ~45 min

  DECISIONS DETECTED
  ✓ Added jsonwebtoken dependency (→ Tech Stack)
  ✓ Created src/auth/ directory with 5 files (→ File Structure)
  ✓ Established middleware pattern in src/auth/ (→ Key Patterns)
  ○ Modified eslint config (low confidence, skipped)

  CONTEXT UPDATED
  📊 Hotspots: src/api/routes.ts now at 8 edits (medium risk)
  📐 Conventions: file naming 97% kebab-case (stable)
  ⚠️  Convention drift: import ordering becoming inconsistent

  INSIGHTS
  💡 src/utils/helpers.ts edited in 4 of last 5 sessions — consider splitting

  CLAUDE.MD CHANGES
  + Tech Stack: Added jsonwebtoken
  + File Structure: Added src/auth/ directory
  + Key Patterns: Added middleware pattern documentation
  ~ Gotchas: Updated hotspot warnings

  QUICK SCORE: 71/100 (+4 since last sync)
  ↑ Documentation: +3 (new auth docs)
  ↑ Modularity: +1 (auth split into focused files)
```

---

## 16. Design Principles

1. **Living, not static:** Configuration evolves automatically with the project.
2. **Additive only:** Sync never deletes manual content — only appends to or updates its own sections.
3. **Confidence-gated:** Only high-confidence decisions (>= 0.7) are auto-applied to CLAUDE.md.
4. **Bounded growth:** Context store is pruned to prevent unbounded growth (sessions: 50, decisions: 100, gotchas: 30).
5. **Cross-session intelligence:** Insights emerge from patterns across multiple sessions, not just one.
6. **Safe by default:** Rate limits, size caps, and confidence floors prevent sync from degrading config quality.
7. **Phase 1 integration:** Every sync triggers a quick score refresh, maintaining the feedback loop.
