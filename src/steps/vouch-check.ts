import * as core from '@actions/core'
import * as github from '@actions/github'
import { PipelineStep, PipelineContext } from '../pipeline'

type Octokit = ReturnType<typeof github.getOctokit>

/**
 * Pipeline step that checks for vouching — both pre-existing (.slopper file)
 * and active (/slopper vouch commands from code owners).
 *
 * Reads `prNumber` from context.
 * Writes `vouched`, `vouchedBy`, `prAuthor`, and `addToSlopperFile` to context.
 */
export class VouchCheckStep extends PipelineStep {
  readonly name = 'vouch-check'
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
    ctx.vouched = false

    const prAuthor = await this.getPrAuthor(ctx.prNumber)
    ctx.prAuthor = prAuthor

    const vouchedUsers = ctx.config?.vouched ?? []

    if (vouchedUsers.includes(prAuthor)) {
      core.info(`Author "${prAuthor}" is in .slopper vouched users — skipping analysis`)
      ctx.vouched = true
      ctx.vouchedBy = '.slopper'
      return ctx
    }

    const vouchComment = await this.findVouchCommand(ctx.prNumber)
    if (vouchComment) {
      const isCodeOwner = await this.isCodeOwner(vouchComment.author)
      if (isCodeOwner) {
        core.info(`Code owner "${vouchComment.author}" vouched for "${prAuthor}"`)
        ctx.vouched = true
        ctx.vouchedBy = vouchComment.author
        ctx.addToSlopperFile = prAuthor
      } else {
        core.info(`"${vouchComment.author}" used /slopper vouch but is not a code owner — ignoring`)
      }
    }

    return ctx
  }

  private async getPrAuthor(prNumber: number): Promise<string> {
    const { data: pr } = await this.octokit.rest.pulls.get({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber
    })
    return pr.user?.login ?? 'unknown'
  }

  private async findVouchCommand(
    prNumber: number
  ): Promise<{ author: string; commentId: number } | null> {
    const { data: comments } = await this.octokit.rest.issues.listComments({
      owner: this.owner,
      repo: this.repo,
      issue_number: prNumber,
      per_page: 100
    })

    for (const comment of comments) {
      const body = comment.body?.trim() ?? ''
      if (body.match(/^\/slopper\s+vouch\s*$/im)) {
        return {
          author: comment.user?.login ?? 'unknown',
          commentId: comment.id
        }
      }
    }
    return null
  }

  private async isCodeOwner(username: string): Promise<boolean> {
    const codeownersPaths = ['.github/CODEOWNERS', 'CODEOWNERS', 'docs/CODEOWNERS']

    for (const path of codeownersPaths) {
      try {
        const { data } = await this.octokit.rest.repos.getContent({
          owner: this.owner,
          repo: this.repo,
          path
        })

        if ('content' in data && data.content) {
          const content = Buffer.from(data.content, 'base64').toString('utf-8')
          return content.includes(`@${username}`)
        }
      } catch {
        // File doesn't exist at this path, try next.
      }
    }

    try {
      const { data: permission } = await this.octokit.rest.repos.getCollaboratorPermissionLevel({
        owner: this.owner,
        repo: this.repo,
        username
      })
      return ['admin', 'maintain'].includes(permission.permission)
    } catch {
      return false
    }
  }
}
