import { describe, expect, it, vi } from 'vitest';

import { PipelineError } from '../../../errors.js';
import { ScorePipeline } from '../pipeline.js';
import { PipelineStage } from '../stage.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a simple stage that applies `fn` to its input. */
function makeStage<TIn, TOut>(
  name: string,
  fn: (input: TIn) => TOut | Promise<TOut>,
): PipelineStage<TIn, TOut> {
  return { name, execute: async (input: TIn) => fn(input) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ScorePipeline', () => {
  it('runs stages in order', async () => {
    const order: string[] = [];

    const pipeline = new ScorePipeline();
    pipeline.addStage(
      makeStage('first', (input: number) => {
        order.push('first');
        return input + 1;
      }),
    );
    pipeline.addStage(
      makeStage('second', (input: number) => {
        order.push('second');
        return input + 10;
      }),
    );

    await pipeline.execute(0);

    expect(order).toEqual(['first', 'second']);
  });

  it('passes the output of each stage to the next', async () => {
    const pipeline = new ScorePipeline();
    pipeline.addStage(makeStage('double', (n: number) => n * 2));
    pipeline.addStage(makeStage('add-three', (n: number) => n + 3));

    const result = await pipeline.execute(5);

    // 5 * 2 = 10, then 10 + 3 = 13
    expect(result.output).toBe(13);
  });

  it('wraps stage errors in PipelineError', async () => {
    const pipeline = new ScorePipeline();
    pipeline.addStage(
      makeStage('boom', () => {
        throw new Error('something broke');
      }),
    );

    await expect(pipeline.execute(null)).rejects.toThrow(PipelineError);
    await expect(pipeline.execute(null)).rejects.toThrow(
      /Pipeline failed at "boom": something broke/,
    );
  });

  it('returns input unchanged when the pipeline has no stages', async () => {
    const pipeline = new ScorePipeline();
    const input = { foo: 'bar' };

    const result = await pipeline.execute(input);

    expect(result.output).toBe(input);
  });

  it('tracks total duration', async () => {
    const pipeline = new ScorePipeline();
    pipeline.addStage(
      makeStage('slow', async () => {
        await new Promise((r) => setTimeout(r, 20));
        return 'done';
      }),
    );

    const result = await pipeline.execute(null);

    expect(result.duration).toBeGreaterThanOrEqual(15);
    expect(pipeline.duration).toBeGreaterThanOrEqual(15);
  });

  it('fires onBeforeStage and onAfterStage hooks', async () => {
    const beforeSpy = vi.fn();
    const afterSpy = vi.fn();

    const pipeline = new ScorePipeline({
      onBeforeStage: beforeSpy,
      onAfterStage: afterSpy,
    });

    pipeline.addStage(makeStage('step', (n: number) => n + 1));

    await pipeline.execute(0);

    expect(beforeSpy).toHaveBeenCalledOnce();
    expect(beforeSpy).toHaveBeenCalledWith('step', 0);

    expect(afterSpy).toHaveBeenCalledOnce();
    expect(afterSpy).toHaveBeenCalledWith('step', 1);
  });

  it('does not double-wrap PipelineError', async () => {
    const pipeline = new ScorePipeline();
    pipeline.addStage(
      makeStage('inner', () => {
        throw new PipelineError('inner', 'already wrapped');
      }),
    );

    await expect(pipeline.execute(null)).rejects.toThrow(PipelineError);
    await expect(pipeline.execute(null)).rejects.toThrow(
      /Pipeline failed at "inner": already wrapped/,
    );
  });

  it('exposes stageCount', () => {
    const pipeline = new ScorePipeline();
    expect(pipeline.stageCount).toBe(0);

    pipeline.addStage(makeStage('a', () => null));
    pipeline.addStage(makeStage('b', () => null));
    expect(pipeline.stageCount).toBe(2);
  });
});
