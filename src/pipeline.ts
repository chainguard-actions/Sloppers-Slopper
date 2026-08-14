import * as core from '@actions/core'
import { AnalysisResult, PrData } from './types'
import { SlopperConfig } from './config'

/** Strongly-typed context passed through the analysis pipeline. */
export interface PipelineContext {
  prNumber: number
  config?: SlopperConfig
  prAuthor?: string
  prData?: PrData
  analysisResult?: AnalysisResult
  analysisFailed?: boolean
  labels?: string[]
  vouched?: boolean
  vouchedBy?: string
  addToSlopperFile?: string
}

/**
 * Abstract base class for a single step in the analysis pipeline.
 *
 * Subclass this to create discrete, testable analysis steps.
 * Each step receives the shared context, performs its work,
 * and returns the (potentially modified) context.
 */
export abstract class PipelineStep {
  abstract readonly name: string
  abstract execute(ctx: PipelineContext): Promise<PipelineContext>
}

/**
 * Orchestrates a sequence of {@link PipelineStep} instances.
 *
 * Steps execute in order. If a step throws, the pipeline halts
 * and the error propagates. Each step receives the context
 * returned by the previous step.
 */
export class AnalysisPipeline {
  private readonly steps: readonly PipelineStep[]

  constructor(steps: PipelineStep[]) {
    this.steps = steps
  }

  async run(initialContext: PipelineContext): Promise<PipelineContext> {
    let ctx = { ...initialContext }

    for (const step of this.steps) {
      core.info(`[pipeline] Running step: ${step.name}`)
      const start = Date.now()
      ctx = await step.execute(ctx)
      const elapsed = Date.now() - start
      core.info(`[pipeline] Step "${step.name}" completed in ${elapsed}ms`)
    }

    return ctx
  }
}
