import type { Signal, AnalyzerCategory, AnalyzerResult, Evidence } from '../types.js';
import type { ScanContext } from '../core/context/scan-context.js';

export interface SignalDefinition {
  id: string;
  name: string;
  unit: string;
  threshold: { poor: number; fair: number; good: number };
  claudeImpact: string;
  inverted?: boolean; // true if lower values are better (e.g., circular deps)
}

export abstract class BaseAnalyzer {
  abstract readonly category: AnalyzerCategory;
  abstract readonly signals: SignalDefinition[];

  async analyze(context: ScanContext): Promise<AnalyzerResult> {
    const start = performance.now();
    const signals: Signal[] = [];

    for (const signalDef of this.signals) {
      const result = await this.evaluateSignal(signalDef, context);
      signals.push(result);
    }

    return {
      category: this.category,
      signals,
      duration: performance.now() - start,
    };
  }

  protected abstract evaluateSignal(
    signal: SignalDefinition,
    context: ScanContext,
  ): Promise<Signal>;

  protected createSignal(
    definition: SignalDefinition,
    value: number,
    confidence: number,
    evidence: Evidence[] = [],
  ): Signal {
    const score = this.interpolateScore(value, definition.threshold, definition.inverted);

    return {
      id: definition.id,
      category: this.category,
      name: definition.name,
      value,
      unit: definition.unit,
      score,
      confidence: Math.max(0, Math.min(1, confidence)),
      evidence,
      threshold: definition.threshold,
      claudeImpact: definition.claudeImpact,
    };
  }

  protected interpolateScore(
    value: number,
    threshold: { poor: number; fair: number; good: number },
    inverted = false,
  ): number {
    const { poor, good } = threshold;

    if (inverted) {
      // For inverted thresholds (lower is better), poor > good
      if (value >= poor) return 0;
      if (value <= good) return 1;
      return (poor - value) / (poor - good);
    }

    // Normal thresholds (higher is better), poor < good
    if (value <= poor) return 0;
    if (value >= good) return 1;
    return (value - poor) / (good - poor);
  }
}
