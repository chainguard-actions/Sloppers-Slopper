import * as core from '@actions/core'
import * as github from '@actions/github'
import { PipelineStep, PipelineContext } from '../pipeline'
import { PrCommentManager } from '../commenter'
import { LabelComputer } from '../labels'

type Octokit = ReturnType<typeof github.getOctokit>

/**
 * Pipeline step that posts the analysis comment and applies labels to the PR.
 *
 * Reads `analysisResult`, `labels`, `prNumber`, and `prData` from context.
 * Writes action outputs: `risk-score`, `risk-level`, `confidence`, `labels`.
 */
export class PostResultsStep extends PipelineStep {
  readonly name = 'post-results'
  private readonly commentManager: PrCommentManager

  constructor(octokit: Octokit, owner: string, repo: string) {
    super()
    this.commentManager = new PrCommentManager(octokit, owner, repo)
  }

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    if (!ctx.analysisResult || !ctx.labels || !ctx.prData) {
      throw new Error('analysisResult, labels, and prData are required but missing from context')
    }

    const { analysisResult, labels, prNumber, prData } = ctx

    core.setOutput('risk-score', String(analysisResult.risk_score))
    core.setOutput('risk-level', analysisResult.risk_level)
    core.setOutput('confidence', analysisResult.confidence)
    core.setOutput('labels', labels.join(','))

    const labelComputer = new LabelComputer()
    const suggestVouch = labelComputer.shouldSuggestVouch(analysisResult, prData.author)
      ? { author: prData.author.login }
      : undefined

    const commentBody = this.commentManager.buildCommentBody(analysisResult, labels, suggestVouch)
    await this.commentManager.upsertComment(prNumber, commentBody)

    if (labels.length > 0) {
      core.info(`Applying labels: ${labels.join(', ')}`)
      await this.commentManager.applyLabels(prNumber, labels)
    }

    return ctx
  }
}
