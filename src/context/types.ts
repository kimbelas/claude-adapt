/**
 * Type definitions for the sync pipeline (Phase 4).
 *
 * All interfaces consumed by the context store, session collector,
 * decision detector, hotspot tracker, convention drift detector,
 * insight engine, CLAUDE.md updater, and sync reporter live here.
 */

// ---------------------------------------------------------------------------
// Context Store — .claude-adapt/context.json
// ---------------------------------------------------------------------------

export interface ContextStore {
  version: 1;
  projectId: string;
  lastSync: string;
  lastSessionHash: string;
  decisions: ArchitecturalDecision[];
  patterns: DetectedPattern[];
  hotspots: Hotspot[];
  gotchas: Gotcha[];
  conventions: ConventionSnapshot;
  previousConventions?: ConventionSnapshot;
  sessions: SessionSummary[];
  insights: Insight[];
}

// ---------------------------------------------------------------------------
// Architectural Decisions
// ---------------------------------------------------------------------------

export interface ArchitecturalDecision {
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
  confidence: number;
  claudeMdSection?: string;
  suggestedContent?: string;
  applied: boolean;
}

// ---------------------------------------------------------------------------
// Detected Patterns
// ---------------------------------------------------------------------------

export interface DetectedPattern {
  name: string;
  description: string;
  confidence: number;
  files: string[];
  lastSeen: string;
  sessionCount: number;
  sessionIds: string[];
}

// ---------------------------------------------------------------------------
// Hotspots
// ---------------------------------------------------------------------------

export interface Hotspot {
  file: string;
  editCount: number;
  lastEdited: string;
  sessions: string[];
  risk: 'low' | 'medium' | 'high';
  note?: string;
}

// ---------------------------------------------------------------------------
// Gotchas
// ---------------------------------------------------------------------------

export interface Gotcha {
  id: string;
  description: string;
  resolved: boolean;
  firstSeen: string;
  sessionId: string;
}

// ---------------------------------------------------------------------------
// Convention Snapshot
// ---------------------------------------------------------------------------

export interface ConventionSnapshot {
  timestamp: string;
  naming: {
    files: Record<string, number>;
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

// ---------------------------------------------------------------------------
// Convention Drift
// ---------------------------------------------------------------------------

export interface ConventionDrift {
  type: 'naming' | 'naming-entropy' | 'modularity' | 'imports';
  scope?: string;
  from?: string;
  to?: string;
  severity: 'info' | 'warning';
  message: string;
}

// ---------------------------------------------------------------------------
// Session Data
// ---------------------------------------------------------------------------

export interface SessionData {
  sessionId: string;
  startCommit: string;
  endCommit: string;
  gitDiff: {
    modifiedFiles: string[];
    addedFiles: string[];
    deletedFiles: string[];
    renamedFiles: { from: string; to: string }[];
    totalLinesAdded: number;
    totalLinesRemoved: number;
  };
  commits: {
    hash: string;
    message: string;
    timestamp: string;
    filesChanged: number;
  }[];
  estimatedDuration: number;
  dominantActivity: 'feature' | 'fix' | 'refactor' | 'test' | 'docs' | 'mixed';
}

// ---------------------------------------------------------------------------
// Session Summary (compact, stored in context store)
// ---------------------------------------------------------------------------

export interface SessionSummary {
  id: string;
  timestamp: string;
  commitCount: number;
  filesModified: number;
  dominantActivity: string;
  quickScore?: number;
}

// ---------------------------------------------------------------------------
// Insights (cross-session patterns)
// ---------------------------------------------------------------------------

export interface Insight {
  id: string;
  type: 'productivity' | 'quality' | 'pattern' | 'risk';
  title: string;
  description: string;
  evidence: string[];
  actionable: boolean;
  suggestion?: string;
  firstDetected: string;
  lastConfirmed: string;
  archived?: boolean;
}

// ---------------------------------------------------------------------------
// CLAUDE.md Update Types
// ---------------------------------------------------------------------------

export interface ClaudeMdChange {
  section: string;
  type: 'updated' | 'appended' | 'deleted' | 'drift-noted';
  content?: string;
  reason?: string;
  confidence?: number;
  source?: 'manual' | 'sync';
}

export interface UpdateResult {
  content: string;
  changes: ClaudeMdChange[];
  unchanged: boolean;
  validation: ValidationResult;
}

export interface ValidationResult {
  valid: boolean;
  issues: string[];
}

// ---------------------------------------------------------------------------
// Sync Pipeline Report
// ---------------------------------------------------------------------------

export interface SyncReport {
  sessionSummary: {
    sessionId: string;
    commitCount: number;
    filesModified: number;
    filesCreated: number;
    filesDeleted: number;
    estimatedDuration: number;
    dominantActivity: string;
    commitMessages: string[];
  };
  decisions: {
    applied: ArchitecturalDecision[];
    skipped: ArchitecturalDecision[];
  };
  contextUpdates: {
    hotspotsChanged: number;
    conventionDrifts: ConventionDrift[];
    patternsDetected: number;
  };
  insights: Insight[];
  claudeMdChanges: ClaudeMdChange[];
  quickScore?: {
    current: number;
    delta: number;
    categoryChanges: { category: string; delta: number }[];
  };
}

// ---------------------------------------------------------------------------
// Sync Options
// ---------------------------------------------------------------------------

export interface SyncOptions {
  quiet: boolean;
  quick: boolean;
  dryRun: boolean;
  noClaudeMd: boolean;
  noScore: boolean;
  reset: boolean;
  since?: string;
  export?: string;
  verbose: boolean;
  interactive: boolean;
  autoApply: boolean;
}
