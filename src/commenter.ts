import * as github from '@actions/github'
import { AnalysisResult } from './types'

type Octokit = ReturnType<typeof github.getOctokit>

/** Hidden HTML marker for comment upsert detection. */
const COMMENT_MARKER = '<!-- pr-trust-analysis -->'

/** Color codes for slopper labels in the GitHub UI. */
const LABEL_COLORS: Record<string, string> = {
  'slopper/approved': '0e8a16',
  'slopper/vouched': '0e8a16',
  'slopper/confidence/high': '0e8a16',
  'slopper/confidence/medium': 'fbca04',
  'slopper/confidence/low': 'e4e669',
  'slopper/risk/low': '0e8a16',
  'slopper/risk/medium': 'fbca04',
  'slopper/risk/high': 'e99695',
  'slopper/risk/critical': 'b60205',
  'slopper/first-time-contributor': 'c5def5',
  'slopper/ci-modified': 'd4c5f9',
  'slopper/dependencies-modified': 'f9d0c4',
  'slopper/needs-security-review': 'b60205',
  'slopper/suspicious': 'b60205',
  'slopper/analysis-failed': 'cccccc'
}

/**
 * Manages PR comments and labels for slopper analysis results.
 *
 * Comment format is modeled after CodeRabbit — a top-level summary
 * with collapsible detail sections for each analysis dimension.
 */
export class PrCommentManager {
  private octokit: Octokit
  private owner: string
  private repo: string

  /**
   * @param octokit - Authenticated Octokit instance.
   * @param owner - Repository owner.
   * @param repo - Repository name.
   */
  constructor(octokit: Octokit, owner: string, repo: string) {
    this.octokit = octokit
    this.owner = owner
    this.repo = repo
  }

  /**
   * Builds the markdown comment body from analysis results and labels.
   *
   * Structure (inspired by CodeRabbit):
   * - Top-level summary with risk badge and metrics table
   * - Collapsible walkthrough with detailed assessments
   * - Labels section
   * - Actionable review suggestions
   *
   * @param result - AI analysis result.
   * @param labels - Deterministically computed labels.
   * @returns Formatted markdown string.
   */
  buildCommentBody(
    result: AnalysisResult,
    labels: string[],
    suggestVouch?: { author: string }
  ): string {
    const riskEmoji: Record<string, string> = {
      low: '🟢', medium: '🟡', high: '🟠', critical: '🔴', unknown: '⚪'
    }
    const badge = riskEmoji[result.risk_level] ?? '⚪'

    const confidenceEmoji: Record<string, string> = {
      high: '🟢', medium: '🟡', low: '🔴'
    }
    const confBadge = confidenceEmoji[result.confidence] ?? '⚪'

    let md = `${COMMENT_MARKER}\n`
    md += `## ${badge} Slopper — PR Trust Analysis\n\n`
    md += `${result.summary}\n\n`

    md += `> **Risk:** ${badge} **${result.risk_score}**/10 (${result.risk_level})`
    md += ` · **Confidence:** ${confBadge} ${result.confidence}`
    md += ` · **Provider:** ${result.provider ?? 'unknown'}\n\n`

    md += `<details>\n<summary>Walkthrough</summary>\n\n`

    if (result.author_assessment) {
      md += `#### 👤 Author\n`
      md += `**Trust level:** ${result.author_assessment.trust_level}\n\n`
      md += `${result.author_assessment.reasoning}\n\n`
    }

    if (result.commit_assessment) {
      md += `#### 📝 Commits\n`
      md += `**Quality:** ${result.commit_assessment.quality}\n\n`
      md += `${result.commit_assessment.reasoning}\n\n`
    }

    if (result.code_assessment) {
      const cats = result.code_assessment.categories_flagged?.join(', ') || 'none'
      md += `#### 🔍 Code\n`
      md += `**Categories flagged:** ${cats}\n\n`
      md += `${result.code_assessment.reasoning}\n\n`

      if (result.code_assessment.suspicious_patterns?.length > 0) {
        md += `**Suspicious patterns:**\n\n`
        for (const p of result.code_assessment.suspicious_patterns) {
          const sevEmoji: Record<string, string> = { critical: '🔴', high: '🟠', medium: '🟡', low: '⚪' }
          md += `- ${sevEmoji[p.severity] ?? '⚪'} \`${p.file}\` — ${p.description}\n`
        }
        md += '\n'
      }
    }

    if (result.behavioral_signals) {
      const flags = result.behavioral_signals.flags?.join(', ') || 'none'
      md += `#### 🚩 Behavioral Signals\n`
      md += `**Flags:** ${flags}\n\n`
      md += `${result.behavioral_signals.reasoning}\n\n`
    }

    md += `</details>\n\n`

    if (result.review_suggestions?.length > 0) {
      md += `<details>\n<summary>📋 Review Suggestions</summary>\n\n`
      for (const s of result.review_suggestions) {
        md += `- [ ] ${s}\n`
      }
      md += `\n</details>\n\n`
    }

    if (labels.length > 0) {
      md += `**Labels:** ${labels.map(l => `\`${l}\``).join(' ')}\n\n`
    }

    if (suggestVouch) {
      md += `> 💡 **Vouch suggestion** — @${suggestVouch.author} has a strong trust record. `
      md += `A code owner can comment \`/slopper vouch\` to permanently approve this contributor `
      md += `and skip future AI analysis.\n\n`
    }

    md += `---\n`
    md += `<sub>Powered by [slopper](https://github.com/malvads/slopper) · `
    md += `${result.provider ?? 'AI'} · `
    md += `Never blocks merging</sub>\n`

    return md
  }

  /**
   * Creates or updates the slopper analysis comment on a PR.
   * Uses the hidden marker to find and update existing comments.
   * @param issueNumber - PR/issue number.
   * @param body - Comment body markdown.
   */
  async upsertComment(issueNumber: number, body: string): Promise<void> {
    const { data: comments } = await this.octokit.rest.issues.listComments({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber
    })

    const existing = comments.find(c => c.body?.includes(COMMENT_MARKER))

    if (existing) {
      await this.octokit.rest.issues.updateComment({
        owner: this.owner,
        repo: this.repo,
        comment_id: existing.id,
        body
      })
    } else {
      await this.octokit.rest.issues.createComment({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        body
      })
    }
  }

  /**
   * Removes existing slopper/* labels and applies the new set.
   * Creates labels in the repo if they don't exist yet.
   * @param issueNumber - PR/issue number.
   * @param labels - Label names to apply.
   */
  async applyLabels(issueNumber: number, labels: string[]): Promise<void> {
    const { data: currentLabels } = await this.octokit.rest.issues.listLabelsOnIssue({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber
    })

    for (const label of currentLabels) {
      if (label.name.startsWith('slopper/')) {
        try {
          await this.octokit.rest.issues.removeLabel({
            owner: this.owner,
            repo: this.repo,
            issue_number: issueNumber,
            name: label.name
          })
        } catch {
          // Label removal failed, continue.
        }
      }
    }

    for (const labelName of labels) {
      await this.ensureLabelExists(labelName)
      await this.octokit.rest.issues.addLabels({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        labels: [labelName]
      })
    }
  }

  /**
   * Creates a label in the repo if it doesn't already exist.
   * @param name - Label name.
   */
  private async ensureLabelExists(name: string): Promise<void> {
    try {
      await this.octokit.rest.issues.getLabel({
        owner: this.owner,
        repo: this.repo,
        name
      })
    } catch (e: unknown) {
      const status = e && typeof e === 'object' && 'status' in e ? (e as { status: number }).status : undefined
      if (status === 404) {
        await this.octokit.rest.issues.createLabel({
          owner: this.owner,
          repo: this.repo,
          name,
          color: LABEL_COLORS[name] ?? 'ededed',
          description: 'Slopper PR trust analysis label'
        })
      }
    }
  }
}
