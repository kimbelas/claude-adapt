import type { Reporter, ReportData } from '../renderer.js';

export class JsonReporter implements Reporter {
  render(data: ReportData): string {
    const output = {
      version: data.version,
      repo: data.repoName,
      timestamp: data.scoreResult.timestamp,
      duration: data.scoreResult.duration,
      score: {
        total: data.scoreResult.total,
        categories: Object.fromEntries(
          Object.entries(data.scoreResult.categories).map(([key, cat]) => [
            key,
            {
              score: cat.normalized,
              max: cat.max,
              raw: cat.raw,
              summary: cat.summary,
              signals: cat.signals.map(s => ({
                id: s.id,
                name: s.name,
                value: s.value,
                unit: s.unit,
                score: s.score,
                confidence: s.confidence,
                claudeImpact: s.claudeImpact,
              })),
            },
          ]),
        ),
      },
      recommendations: data.recommendations.map(r => ({
        id: r.id,
        title: r.title,
        description: r.description,
        effort: r.effort,
        impact: r.impact,
        gap: r.gap,
        signal: r.signal,
        fixTemplate: r.fixTemplate,
      })),
      trends: data.trends.map(t => ({
        category: t.category,
        type: t.type,
        message: t.message,
        severity: t.severity,
      })),
    };

    return JSON.stringify(output, null, 2);
  }
}
