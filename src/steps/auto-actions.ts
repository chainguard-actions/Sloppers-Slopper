import * as core from '@actions/core'
import * as github from '@actions/github'
import { PipelineStep, PipelineContext } from '../pipeline'

type Octokit = ReturnType<typeof github.getOctokit>

/**
 * Pipeline step that executes automated actions based on the config and analysis result.
 *
 * Runs after PostResults. Handles:
 * - auto_close: close the PR if risk score exceeds threshold
 * - auto_approve: approve the PR if risk score is below threshold
 * - auto_request_review: request reviewers if risk score exceeds threshold
 * - block_first_time_contributors: close PR if author is first-time contributor
 */
export class AutoActionsStep extends PipelineStep {
  readonly name = 'auto-actions'
  private readonly octokit: Octokit
  private readonly owner: string
  private readonly repo: string

  constructor(octokit: Octokit, owner: string, repo: string) {
    super()
    this.octokit = octokit
    this.owner = owner
    this.repo = repo
  }

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    if (!ctx.config || !ctx.analysisResult) return ctx

    const { config, analysisResult, prNumber, prData } = ctx
    const score = analysisResult.risk_score

    if (config.rules.block_first_time_contributors && prData?.author.first_time_contributor) {
      core.info(`[auto-actions] Closing PR — first-time contributor blocked by config`)
      await this.closePr(prNumber, 'This PR was automatically closed by Slopper — this repository does not accept PRs from first-time contributors. Please open an issue first.')
      return ctx
    }

    if (config.actions.auto_close.enabled && score >= config.actions.auto_close.threshold) {
      core.info(`[auto-actions] Closing PR — risk score ${score} >= threshold ${config.actions.auto_close.threshold}`)
      await this.closePr(prNumber, config.actions.auto_close.comment)
    }

    if (config.actions.auto_approve.enabled && score <= config.actions.auto_approve.threshold && analysisResult.confidence === 'high') {
      core.info(`[auto-actions] Approving PR — risk score ${score} <= threshold ${config.actions.auto_approve.threshold}`)
      await this.approvePr(prNumber)
    }

    if (config.actions.auto_request_review.enabled && score >= config.actions.auto_request_review.threshold) {
      const reviewers = config.actions.auto_request_review.reviewers
      if (reviewers.length > 0) {
        core.info(`[auto-actions] Requesting review from: ${reviewers.join(', ')}`)
        await this.requestReviewers(prNumber, reviewers)
      }
    }

    return ctx
  }

  private async closePr(prNumber: number, comment: string): Promise<void> {
    try {
      await this.octokit.rest.issues.createComment({
        owner: this.owner,
        repo: this.repo,
        issue_number: prNumber,
        body: comment
      })
      await this.octokit.rest.pulls.update({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber,
        state: 'closed'
      })
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      core.warning(`[auto-actions] Failed to close PR: ${msg}`)
    }
  }

  private async approvePr(prNumber: number): Promise<void> {
    try {
      await this.octokit.rest.pulls.createReview({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber,
        event: 'APPROVE',
        body: 'Automatically approved by Slopper — low risk score with high confidence.'
      })
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      core.warning(`[auto-actions] Failed to approve PR: ${msg}`)
    }
  }

  private async requestReviewers(prNumber: number, reviewers: string[]): Promise<void> {
    try {
      await this.octokit.rest.pulls.requestReviewers({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber,
        reviewers
      })
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      core.warning(`[auto-actions] Failed to request reviewers: ${msg}`)
    }
  }
}
