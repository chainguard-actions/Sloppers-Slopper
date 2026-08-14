import * as github from '@actions/github'
import { PrData, AuthorProfile, CommitSummary, FileInfo } from './types'

type Octokit = ReturnType<typeof github.getOctokit>

/**
 * Collects all PR-related data from the GitHub API for trust analysis.
 *
 * Uses Octokit to fetch PR metadata, author profile, contribution history,
 * commit details, changed files, and the unified diff.
 */
export class PrDataCollector {
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
   * Collects all data for a given PR number.
   * @param prNumber - The pull request number.
   * @returns Complete PR data ready for AI analysis.
   */
  async collect(prNumber: number): Promise<PrData> {
    const { data: pr } = await this.octokit.rest.pulls.get({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber
    })

    const authorLogin = pr.user?.login ?? 'unknown'
    const authorType = pr.user?.type ?? 'User'

    const [author, commits, files, diff] = await Promise.all([
      this.collectAuthorProfile(authorLogin, authorType),
      this.collectCommits(prNumber),
      this.collectFiles(prNumber),
      this.collectDiff(prNumber)
    ])

    return {
      repo: `${this.owner}/${this.repo}`,
      pr_number: prNumber,
      title: pr.title,
      body: (pr.body ?? '').slice(0, 3000),
      base_branch: pr.base.ref,
      head_branch: pr.head.ref,
      changed_files_count: pr.changed_files,
      additions: pr.additions,
      deletions: pr.deletions,
      author,
      commits,
      files,
      diff
    }
  }

  /**
   * Fetches author profile, collaboration status, and contribution history.
   * @param login - GitHub username.
   * @param type - Account type (User or Bot).
   */
  private async collectAuthorProfile(login: string, type: string): Promise<AuthorProfile> {
    const profile: AuthorProfile = {
      login,
      created_at: '',
      public_repos: 0,
      followers: 0,
      following: 0,
      bio: '',
      company: '',
      is_bot: type === 'Bot',
      is_collaborator: false,
      past_merged_prs_in_repo: 0,
      past_issues_in_repo: 0,
      first_time_contributor: false
    }

    if (type === 'Bot') return profile

    try {
      const { data: user } = await this.octokit.rest.users.getByUsername({ username: login })
      profile.created_at = user.created_at ?? ''
      profile.public_repos = user.public_repos ?? 0
      profile.followers = user.followers ?? 0
      profile.following = user.following ?? 0
      profile.bio = user.bio ?? ''
      profile.company = user.company ?? ''
    } catch {
      // User lookup failed, continue with defaults.
    }

    try {
      await this.octokit.rest.repos.checkCollaborator({
        owner: this.owner,
        repo: this.repo,
        username: login
      })
      profile.is_collaborator = true
    } catch {
      profile.is_collaborator = false
    }

    try {
      const { data: prSearch } = await this.octokit.rest.search.issuesAndPullRequests({
        q: `repo:${this.owner}/${this.repo} author:${login} type:pr is:merged`,
        per_page: 1
      })
      profile.past_merged_prs_in_repo = prSearch.total_count
    } catch {
      // Search failed.
    }

    try {
      const { data: issueSearch } = await this.octokit.rest.search.issuesAndPullRequests({
        q: `repo:${this.owner}/${this.repo} author:${login} type:issue`,
        per_page: 1
      })
      profile.past_issues_in_repo = issueSearch.total_count
    } catch {
      // Search failed.
    }

    profile.first_time_contributor =
      profile.past_merged_prs_in_repo === 0 && profile.past_issues_in_repo === 0

    return profile
  }

  /**
   * Fetches and summarizes commit metadata for the PR.
   * @param prNumber - The pull request number.
   */
  private async collectCommits(prNumber: number): Promise<CommitSummary> {
    const { data: commits } = await this.octokit.rest.pulls.listCommits({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
      per_page: 100
    })

    const summary: CommitSummary = {
      count: commits.length,
      messages: [],
      unsigned_count: 0,
      author_committer_mismatches: 0
    }

    for (const c of commits) {
      summary.messages.push((c.commit.message ?? '').slice(0, 200))

      if (!c.commit.verification?.verified) {
        summary.unsigned_count++
      }

      const authorEmail = c.commit.author?.email ?? ''
      const committerEmail = c.commit.committer?.email ?? ''
      const committerName = c.commit.committer?.name ?? ''
      if (
        authorEmail &&
        committerEmail &&
        authorEmail !== committerEmail &&
        committerName !== 'GitHub'
      ) {
        summary.author_committer_mismatches++
      }
    }

    return summary
  }

  /**
   * Fetches the list of changed files with metadata.
   * @param prNumber - The pull request number.
   */
  private async collectFiles(prNumber: number): Promise<FileInfo[]> {
    const { data: files } = await this.octokit.rest.pulls.listFiles({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
      per_page: 100
    })

    return files.map(f => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      is_binary: f.patch === undefined && f.status !== 'removed'
    }))
  }

  /**
   * Fetches the unified diff, truncated to 80k characters.
   * @param prNumber - The pull request number.
   */
  private async collectDiff(prNumber: number): Promise<string> {
    const { data: diff } = await this.octokit.rest.pulls.get({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
      mediaType: { format: 'diff' }
    })

    // Octokit returns a string when mediaType.format is 'diff', but types say otherwise
    let diffText = String(diff)
    const maxChars = 80_000
    if (diffText.length > maxChars) {
      diffText = diffText.slice(0, maxChars) + '\n\n[... diff truncated for analysis ...]'
    }
    return diffText
  }
}
