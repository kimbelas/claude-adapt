/**
 * Pipeline orchestrator that chains stages sequentially.
 *
 * Runs each registered stage in order, threading the output of
 * one stage into the input of the next. Fires optional lifecycle
 * hooks before and after every stage, tracks wall-clock duration,
 * and wraps unexpected errors in PipelineError with the failing
 * stage name for clean error reporting.
 */

import { PipelineError } from '../../errors.js';
import { PipelineStage } from './stage.js';

// ---------------------------------------------------------------------------
// Hook signatures
// ---------------------------------------------------------------------------

export interface PipelineHooks {
  /**
   * Called immediately before a stage executes.
   * Receives the stage name and the input about to be passed in.
   */
  onBeforeStage?: (stageName: string, input: unknown) => void | Promise<void>;

  /**
   * Called immediately after a stage completes successfully.
   * Receives the stage name and the output it produced.
   */
  onAfterStage?: (stageName: string, output: unknown) => void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Pipeline result
// ---------------------------------------------------------------------------

export interface PipelineResult {
  /** Final output of the last stage (or the original input if no stages). */
  output: unknown;
  /** Wall-clock duration of the full pipeline run in milliseconds. */
  duration: number;
}

// ---------------------------------------------------------------------------
// ScorePipeline
// ---------------------------------------------------------------------------

export class ScorePipeline {
  private readonly stages: PipelineStage<unknown, unknown>[] = [];
  private readonly hooks: PipelineHooks;

  /** Total wall-clock duration of the most recent `execute` call (ms). */
  private lastDuration = 0;

  constructor(hooks: PipelineHooks = {}) {
    this.hooks = hooks;
  }

  // -----------------------------------------------------------------------
  // Configuration
  // -----------------------------------------------------------------------

  /** Append a stage to the end of the pipeline. */
  addStage(stage: PipelineStage<unknown, unknown>): void {
    this.stages.push(stage);
  }

  // -----------------------------------------------------------------------
  // Execution
  // -----------------------------------------------------------------------

  /**
   * Run every stage in insertion order, threading output -> input.
   *
   * If the pipeline has no stages the original `input` is returned
   * unchanged. Errors thrown by a stage are caught and re-thrown as
   * `PipelineError` with the stage name attached.
   */
  async execute(input: unknown): Promise<PipelineResult> {
    const start = performance.now();
    let current: unknown = input;

    for (const stage of this.stages) {
      try {
        if (this.hooks.onBeforeStage) {
          await this.hooks.onBeforeStage(stage.name, current);
        }

        current = await stage.execute(current);

        if (this.hooks.onAfterStage) {
          await this.hooks.onAfterStage(stage.name, current);
        }
      } catch (error: unknown) {
        // Already a PipelineError — let it propagate untouched.
        if (error instanceof PipelineError) {
          throw error;
        }

        const message =
          error instanceof Error ? error.message : String(error);

        throw new PipelineError(stage.name, message, {
          cause: error instanceof Error ? error : undefined,
        });
      }
    }

    this.lastDuration = performance.now() - start;

    return {
      output: current,
      duration: this.lastDuration,
    };
  }

  // -----------------------------------------------------------------------
  // Accessors
  // -----------------------------------------------------------------------

  /** Duration of the most recent pipeline run in milliseconds. */
  get duration(): number {
    return this.lastDuration;
  }

  /** Number of stages currently registered. */
  get stageCount(): number {
    return this.stages.length;
  }
}
