import * as core from '@actions/core'
import * as github from '@actions/github'
import { minimatch } from 'minimatch'
import { PipelineStep, PipelineContext } from '../pipeline'
import { PrDataCollector } from '../collector'

type Octokit = ReturnType<typeof github.getOctokit>

export class CollectDataStep extends PipelineStep {
  readonly name = 'collect-data'
  private readonly collector: PrDataCollector

  constructor(octokit: Octokit, owner: string, repo: string) {
    super()
    this.collector = new PrDataCollector(octokit, owner, repo)
  }

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    ctx.prData = await this.collector.collect(ctx.prNumber)

    const ignorePaths = ctx.config?.ignore_paths ?? []
    if (ignorePaths.length > 0 && ctx.prData) {
      const before = ctx.prData.files.length
      ctx.prData = {
        ...ctx.prData,
        files: ctx.prData.files.filter(
          f => !ignorePaths.some(pattern => minimatch(f.filename, pattern))
        )
      }
      const filtered = before - ctx.prData.files.length
      if (filtered > 0) {
        core.info(`[collect-data] Filtered ${filtered} files matching ignore_paths`)
      }
    }

    return ctx
  }
}
