/**
 * Insight engine — generates cross-session intelligence.
 *
 * Analyzes the accumulated context store to surface:
 *   1. Recurring error patterns (3+ sessions)
 *   2. Productivity bottlenecks (high-risk hotspots)
 *   3. Score regression (linear trend slope < -1.5)
 */

import { createHash } from 'node:crypto';

import type { ContextStore, Insight } from './types.js';

/**
 * Generates insights from the accumulated context store.
 */
export class InsightEngine {
  /**
   * Analyzes the store and returns new or confirmed insights.
   *
   * Existing active insights are confirmed and updated.
   * New insights are created with fresh timestamps.
   */
  generate(store: ContextStore): Insight[] {
    const now = new Date().toISOString();
    const insights: Insight[] = [];

    insights.push(
      ...this.detectRecurringErrors(store, now),
      ...this.detectProductivityBottlenecks(store, now),
      ...this.detectScoreRegression(store, now),
    );

    // Merge with existing insights: confirm or add new
    return this.mergeInsights(store.insights, insights);
  }

  // ---------------------------------------------------------------------------
  // 1. Recurring error patterns
  // ---------------------------------------------------------------------------

  /**
   * Detects gotchas that appear across 3 or more sessions.
   */
  private detectRecurringErrors(
    store: ContextStore,
    now: string,
  ): Insight[] {
    const insights: Insight[] = [];

    // Cluster gotchas by description similarity
    const clusters = this.clusterGotchas(store.gotchas);

    for (const cluster of clusters) {
      if (cluster.count >= 3) {
        insights.push({
          id: this.makeId('recurring-error', cluster.description),
          type: 'quality',
          title: `Recurring error: ${cluster.description}`,
          description: `Encountered in ${cluster.count} sessions. May indicate a systemic issue.`,
          evidence: cluster.sessionIds,
          actionable: true,
          suggestion: `Add a pre-commit check or CLAUDE.md gotcha for: ${cluster.description}`,
          firstDetected: now,
          lastConfirmed: now,
        });
      }
    }

    return insights;
  }

  // ---------------------------------------------------------------------------
  // 2. Productivity bottlenecks
  // ---------------------------------------------------------------------------

  /**
   * Detects files that are edited so frequently they become bottlenecks.
   */
  private detectProductivityBottlenecks(
    store: ContextStore,
    now: string,
  ): Insight[] {
    const insights: Insight[] = [];

    const troubleFiles = store.hotspots
      .filter((h) => h.risk === 'high')
      .sort((a, b) => b.editCount - a.editCount);

    if (troubleFiles.length > 0) {
      const topFiles = troubleFiles.slice(0, 5).map((f) => f.file);
      insights.push({
        id: this.makeId('bottleneck', topFiles.join(',')),
        type: 'productivity',
        title: `${troubleFiles.length} file${troubleFiles.length === 1 ? '' : 's'} are Claude Code bottleneck${troubleFiles.length === 1 ? '' : 's'}`,
        description: `Repeatedly edited: ${topFiles.join(', ')}`,
        evidence: topFiles,
        actionable: true,
        suggestion:
          'Break into smaller modules, add inline docs, or add CLAUDE.md guidance.',
        firstDetected: now,
        lastConfirmed: now,
      });
    }

    // Individual file insights for files edited in many recent sessions
    const recentSessions = store.sessions.slice(-5).map((s) => s.id);
    for (const hotspot of store.hotspots) {
      const recentCount = hotspot.sessions.filter((s) =>
        recentSessions.includes(s),
      ).length;

      if (recentCount >= 4) {
        insights.push({
          id: this.makeId('frequent-edit', hotspot.file),
          type: 'productivity',
          title: `${hotspot.file} edited in ${recentCount} of last 5 sessions`,
          description: `Consider splitting this file or adding targeted CLAUDE.md guidance.`,
          evidence: [hotspot.file],
          actionable: true,
          suggestion: `${hotspot.file} — consider splitting into smaller focused modules`,
          firstDetected: now,
          lastConfirmed: now,
        });
      }
    }

    return insights;
  }

  // ---------------------------------------------------------------------------
  // 3. Score regression
  // ---------------------------------------------------------------------------

  /**
   * Detects declining quick scores over recent sessions.
   *
   * Uses a simple linear regression. A slope below -1.5 triggers
   * a risk insight.
   */
  private detectScoreRegression(
    store: ContextStore,
    now: string,
  ): Insight[] {
    const insights: Insight[] = [];

    const recentScores = store.sessions
      .slice(-5)
      .map((s) => s.quickScore)
      .filter((s): s is number => s !== undefined && s !== null);

    if (recentScores.length >= 3) {
      const slope = this.linearTrend(recentScores);

      if (slope < -1.5) {
        insights.push({
          id: this.makeId('score-regression', String(recentScores.length)),
          type: 'risk',
          title: 'Claude Code readiness declining',
          description: `Score dropping over last ${recentScores.length} sessions (slope: ${slope.toFixed(1)}).`,
          evidence: recentScores.map((s) => `Score: ${s}`),
          actionable: true,
          suggestion: `Run 'claude-adapt score --compare' for details.`,
          firstDetected: now,
          lastConfirmed: now,
        });
      }
    }

    return insights;
  }

  // ---------------------------------------------------------------------------
  // Merging
  // ---------------------------------------------------------------------------

  /**
   * Merges new insights with existing ones.
   *
   * If an insight with the same ID already exists, confirm it
   * by updating lastConfirmed. Otherwise add it as new.
   */
  private mergeInsights(
    existing: Insight[],
    generated: Insight[],
  ): Insight[] {
    const merged = [...existing];

    for (const insight of generated) {
      const idx = merged.findIndex((e) => e.id === insight.id);

      if (idx >= 0) {
        // Confirm existing insight
        merged[idx] = {
          ...merged[idx]!,
          lastConfirmed: insight.lastConfirmed,
          description: insight.description,
          evidence: insight.evidence,
        };
      } else {
        merged.push(insight);
      }
    }

    return merged;
  }

  // ---------------------------------------------------------------------------
  // Gotcha clustering
  // ---------------------------------------------------------------------------

  /**
   * Groups gotchas by description similarity.
   */
  private clusterGotchas(
    gotchas: ContextStore['gotchas'],
  ): { description: string; count: number; sessionIds: string[] }[] {
    const clusters = new Map<
      string,
      { description: string; count: number; sessionIds: string[] }
    >();

    for (const gotcha of gotchas) {
      // Simple clustering by normalized description
      const key = gotcha.description.toLowerCase().trim();
      const existing = clusters.get(key);

      if (existing) {
        existing.count++;
        if (!existing.sessionIds.includes(gotcha.sessionId)) {
          existing.sessionIds.push(gotcha.sessionId);
        }
      } else {
        clusters.set(key, {
          description: gotcha.description,
          count: 1,
          sessionIds: [gotcha.sessionId],
        });
      }
    }

    return Array.from(clusters.values());
  }

  // ---------------------------------------------------------------------------
  // Math helpers
  // ---------------------------------------------------------------------------

  /**
   * Computes the slope of a simple linear regression.
   *
   * Returns the rate of change per data point.
   */
  private linearTrend(values: number[]): number {
    const n = values.length;
    if (n < 2) return 0;

    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i]!;
      sumXY += i * values[i]!;
      sumXX += i * i;
    }

    const denominator = n * sumXX - sumX * sumX;
    if (denominator === 0) return 0;

    return (n * sumXY - sumX * sumY) / denominator;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private makeId(prefix: string, key: string): string {
    const hash = createHash('sha256').update(key).digest('hex').slice(0, 8);
    return `insight-${prefix}-${hash}`;
  }
}
