/**
 * Sync pipeline — 7-stage orchestrator for the sync command.
 *
 * Stages:
 *   1. Session Detection    — collect git changes since last sync
 *   2. Decision Detection   — analyze diff for architectural decisions
 *   3. Context Update       — update persistent knowledge store
 *   4. Insight Generation   — cross-session pattern analysis
 *   5. CLAUDE.md Update     — incrementally update CLAUDE.md
 *   6. Quick Score           — run Phase 1 score (optional)
 *   7. Report               — generate terminal report
 */

import type {
  ArchitecturalDecision,
  ClaudeMdChange,
  ConventionDrift,
  ContextStore,
  Insight,
  SessionData,
  SessionSummary,
  SyncOptions,
  SyncReport,
} from './types.js';

import { ContextStoreManager } from './context-store.js';
import { SessionCollector } from './session-collector.js';
import { DecisionDetector } from './decision-detector.js';
import { HotspotTracker } from './hotspot-tracker.js';
import { ConventionDriftDetector } from './convention-drift-detector.js';
import { InsightEngine } from './insight-engine.js';
import { ClaudeMdUpdater } from './claude-md-updater.js';
import { ContextPruner } from './context-pruner.js';
import { SyncReporter } from './sync-reporter.js';

import { ScoringEngine } from '../core/scoring/engine.js';
import { ScorePipeline } from '../core/pipeline/pipeline.js';
import { DetectStage } from '../core/pipeline/stages/detect-stage.js';
import { IndexStage } from '../core/pipeline/stages/index-stage.js';
import { AnalyzeStage } from '../core/pipeline/stages/analyze-stage.js';
import { ScoreStage } from '../core/pipeline/stages/score-stage.js';
import { DocumentationAnalyzer } from '../analyzers/documentation/index.js';
import { ModularityAnalyzer } from '../analyzers/modularity/index.js';
import { ConventionsAnalyzer } from '../analyzers/conventions/index.js';
import { TypeSafetyAnalyzer } from '../analyzers/type-safety/index.js';
import { TestCoverageAnalyzer } from '../analyzers/test-coverage/index.js';
import { GitHygieneAnalyzer } from '../analyzers/git-hygiene/index.js';
import { CiCdAnalyzer } from '../analyzers/cicd/index.js';
import { DependenciesAnalyzer } from '../analyzers/dependencies/index.js';
import type { ScoreResult } from '../types.js';

export interface SyncPipelineResult {
  report: SyncReport;
  formattedOutput: string;
  store: ContextStore;
}

/**
 * Orchestrates the full sync pipeline.
 */
export class SyncPipeline {
  private readonly rootPath: string;
  private readonly options: SyncOptions;

  private readonly storeManager: ContextStoreManager;
  private readonly sessionCollector: SessionCollector;
  private readonly decisionDetector: DecisionDetector;
  private readonly hotspotTracker: HotspotTracker;
  private readonly driftDetector: ConventionDriftDetector;
  private readonly insightEngine: InsightEngine;
  private readonly claudeMdUpdater: ClaudeMdUpdater;
  private readonly pruner: ContextPruner;
  private readonly reporter: SyncReporter;

  constructor(rootPath: string, options: SyncOptions) {
    this.rootPath = rootPath;
    this.options = options;

    this.storeManager = new ContextStoreManager();
    this.sessionCollector = new SessionCollector(rootPath);
    this.decisionDetector = new DecisionDetector(rootPath);
    this.hotspotTracker = new HotspotTracker();
    this.driftDetector = new ConventionDriftDetector();
    this.insightEngine = new InsightEngine();
    this.claudeMdUpdater = new ClaudeMdUpdater();
    this.pruner = new ContextPruner();
    this.reporter = new SyncReporter();
  }

  /**
   * Executes the full 7-stage sync pipeline.
   */
  async execute(): Promise<SyncPipelineResult> {
    // Handle --reset
    if (this.options.reset) {
      const store = await this.storeManager.reset(this.rootPath);
      const report = this.emptyReport();
      return {
        report,
        formattedOutput: this.reporter.format(report, this.options),
        store,
      };
    }

    // Load existing context store
    let store = await this.storeManager.read(this.rootPath);

    // -----------------------------------------------------------------------
    // STAGE 1: Session Detection
    // -----------------------------------------------------------------------
    const session = await this.sessionCollector.collect(
      store,
      this.options.since,
    );

    if (!session) {
      const report = this.emptyReport();
      return {
        report,
        formattedOutput: 'No changes since last sync.',
        store,
      };
    }

    // -----------------------------------------------------------------------
    // STAGE 2: Decision Detection
    // -----------------------------------------------------------------------
    const decisions = await this.decisionDetector.detect(session, store);

    // -----------------------------------------------------------------------
    // STAGE 3: Context Update
    // -----------------------------------------------------------------------
    store = this.updateContext(store, session, decisions);

    // -----------------------------------------------------------------------
    // STAGE 4: Insight Generation
    // -----------------------------------------------------------------------
    let insights: Insight[] = [];
    if (!this.options.quick) {
      insights = this.insightEngine.generate(store);
      store.insights = insights;
    }

    // -----------------------------------------------------------------------
    // STAGE 5: CLAUDE.md Update
    // -----------------------------------------------------------------------
    let claudeMdChanges: ClaudeMdChange[] = [];
    if (!this.options.noClaudeMd) {
      const drifts = this.detectDrifts(store);
      const updateResult = await this.claudeMdUpdater.update(
        this.rootPath,
        decisions,
        store.hotspots,
        drifts,
        insights,
        this.options.dryRun,
      );
      claudeMdChanges = updateResult.changes;
    }

    // -----------------------------------------------------------------------
    // STAGE 6: Quick Score (optional)
    // -----------------------------------------------------------------------
    let quickScore: SyncReport['quickScore'] | undefined;
    if (!this.options.noScore && !this.options.quick) {
      quickScore = await this.runQuickScore(store);

      // Persist the quick score on the current session summary for future delta comparisons
      if (quickScore && store.sessions.length > 0) {
        store.sessions[store.sessions.length - 1].quickScore = quickScore.current;
      }
    }

    // -----------------------------------------------------------------------
    // Prune and persist
    // -----------------------------------------------------------------------
    store = await this.pruner.prune(store, this.rootPath);

    if (!this.options.dryRun) {
      store.lastSync = new Date().toISOString();
      store.lastSessionHash = session.endCommit;
      await this.storeManager.write(this.rootPath, store);
    }

    // -----------------------------------------------------------------------
    // STAGE 7: Report
    // -----------------------------------------------------------------------
    const report = this.buildReport(
      session,
      decisions,
      store,
      insights,
      claudeMdChanges,
      quickScore,
    );

    return {
      report,
      formattedOutput: this.reporter.format(report, this.options),
      store,
    };
  }

  // ---------------------------------------------------------------------------
  // Stage helpers
  // ---------------------------------------------------------------------------

  /**
   * Updates the context store with session data, decisions, and hotspots.
   */
  private updateContext(
    store: ContextStore,
    session: SessionData,
    decisions: ArchitecturalDecision[],
  ): ContextStore {
    // Add session summary
    const summary: SessionSummary = {
      id: session.sessionId,
      timestamp: new Date().toISOString(),
      commitCount: session.commits.length,
      filesModified:
        session.gitDiff.modifiedFiles.length +
        session.gitDiff.addedFiles.length,
      dominantActivity: session.dominantActivity,
    };
    store.sessions.push(summary);

    // Accumulate decisions
    store.decisions.push(...decisions);

    // Update hotspots
    store.hotspots = this.hotspotTracker.update(store.hotspots, session);

    // Accumulate new patterns from decisions
    for (const decision of decisions) {
      if (decision.category === 'pattern' && decision.confidence >= 0.5) {
        const existingPattern = store.patterns.find(
          (p) => p.name === decision.title,
        );
        if (!existingPattern) {
          store.patterns.push({
            name: decision.title,
            description: decision.description,
            confidence: decision.confidence,
            files: decision.filesAffected,
            lastSeen: decision.timestamp,
            sessionCount: 1,
            sessionIds: [session.sessionId],
          });
        }
      }
    }

    return store;
  }

  /**
   * Detects convention drifts if the store has previous convention data.
   *
   * Full drift detection requires a fresh ConventionSnapshot from a Phase 1
   * score run. When that data is available, we compare the previous snapshot
   * against the current one. If there is no previous snapshot, we have no
   * baseline, so return empty.
   */
  private detectDrifts(store: ContextStore): ConventionDrift[] {
    if (!store.previousConventions || !store.previousConventions.timestamp) {
      return [];
    }

    if (!store.conventions || !store.conventions.timestamp) {
      return [];
    }

    return this.driftDetector.detect(store.previousConventions, store.conventions);
  }

  /**
   * Runs a quick score via Phase 1 pipeline and compares against
   * the last stored score to produce a delta.
   */
  private async runQuickScore(
    store: ContextStore,
  ): Promise<SyncReport['quickScore'] | undefined> {
    try {
      const scoringEngine = new ScoringEngine();
      const analyzers = [
        new DocumentationAnalyzer(),
        new ModularityAnalyzer(),
        new ConventionsAnalyzer(),
        new TypeSafetyAnalyzer(),
        new TestCoverageAnalyzer(),
        new GitHygieneAnalyzer(),
        new CiCdAnalyzer(),
        new DependenciesAnalyzer(),
      ];

      const pipeline = new ScorePipeline();
      pipeline.addStage(new DetectStage() as any);
      pipeline.addStage(new IndexStage() as any);
      pipeline.addStage(new AnalyzeStage(analyzers) as any);
      pipeline.addStage(new ScoreStage(scoringEngine) as any);

      const { output: pipelineOutput } = await pipeline.execute({
        rootPath: this.rootPath,
      });
      const result = pipelineOutput as { scoreResult: ScoreResult };
      const scoreResult = result.scoreResult;

      // Determine previous score from the most recent session that has one
      const previousScore = this.findPreviousScore(store);

      // Build per-category deltas
      const categoryChanges: { category: string; delta: number }[] = [];
      for (const [category, catScore] of Object.entries(scoreResult.categories)) {
        categoryChanges.push({
          category,
          delta: catScore.normalized,
        });
      }

      return {
        current: scoreResult.total,
        delta: previousScore !== undefined ? scoreResult.total - previousScore : 0,
        categoryChanges,
      };
    } catch {
      // If scoring fails, silently skip — it's optional
      return undefined;
    }
  }

  /**
   * Finds the most recent quick score from previous sessions.
   */
  private findPreviousScore(store: ContextStore): number | undefined {
    // Walk sessions in reverse to find the last one with a quickScore
    for (let i = store.sessions.length - 1; i >= 0; i--) {
      const session = store.sessions[i];
      if (session.quickScore !== undefined) {
        return session.quickScore;
      }
    }
    return undefined;
  }

  // ---------------------------------------------------------------------------
  // Report building
  // ---------------------------------------------------------------------------

  private buildReport(
    session: SessionData,
    decisions: ArchitecturalDecision[],
    store: ContextStore,
    insights: Insight[],
    claudeMdChanges: ClaudeMdChange[],
    quickScore: SyncReport['quickScore'] | undefined,
  ): SyncReport {
    const applied = decisions.filter((d) => d.applied);
    const skipped = decisions.filter((d) => !d.applied);

    return {
      sessionSummary: {
        sessionId: session.sessionId,
        commitCount: session.commits.length,
        filesModified: session.gitDiff.modifiedFiles.length,
        filesCreated: session.gitDiff.addedFiles.length,
        filesDeleted: session.gitDiff.deletedFiles.length,
        estimatedDuration: session.estimatedDuration,
        dominantActivity: session.dominantActivity,
        commitMessages: session.commits.map((c) => c.message),
      },
      decisions: { applied, skipped },
      contextUpdates: {
        hotspotsChanged: session.gitDiff.modifiedFiles.length +
          session.gitDiff.addedFiles.length,
        conventionDrifts: [],
        patternsDetected: store.patterns.length,
      },
      insights,
      claudeMdChanges,
      quickScore,
    };
  }

  private emptyReport(): SyncReport {
    return {
      sessionSummary: {
        sessionId: '',
        commitCount: 0,
        filesModified: 0,
        filesCreated: 0,
        filesDeleted: 0,
        estimatedDuration: 0,
        dominantActivity: 'mixed',
        commitMessages: [],
      },
      decisions: { applied: [], skipped: [] },
      contextUpdates: {
        hotspotsChanged: 0,
        conventionDrifts: [],
        patternsDetected: 0,
      },
      insights: [],
      claudeMdChanges: [],
    };
  }
}
