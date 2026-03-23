/**
 * Abstract pipeline stage interface.
 *
 * Every stage in the scoring pipeline implements this contract:
 * receive typed input, produce typed output. The pipeline
 * orchestrator chains stages sequentially, passing each stage's
 * output as the next stage's input.
 */

export interface PipelineStage<TInput, TOutput> {
  /** Human-readable stage name used in logging and error reporting. */
  name: string;

  /** Execute the stage logic, transforming input into output. */
  execute(input: TInput): Promise<TOutput>;
}
