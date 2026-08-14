import { PipelineStep, PipelineContext } from '../pipeline'
import { LabelComputer } from '../labels'

/**
 * Pipeline step that deterministically computes labels from the AI analysis result.
 *
 * Labels are derived from risk score, confidence, file paths, and author metadata —
 * never from AI suggestions.
 *
 * Reads `analysisResult`, `prData`, and `analysisFailed` from context.
 * Writes `labels` to context.
 */
export class ComputeLabelsStep extends PipelineStep {
  readonly name = 'compute-labels'

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    const computer = new LabelComputer(ctx.config?.thresholds, ctx.config?.rules)

    if (ctx.analysisFailed || !ctx.analysisResult || !ctx.prData) {
      ctx.labels = computer.computeFailedLabels()
    } else {
      ctx.labels = computer.compute(
        ctx.analysisResult,
        ctx.prData.files,
        ctx.prData.author.first_time_contributor,
        ctx.prData
      )
    }

    return ctx
  }
}
