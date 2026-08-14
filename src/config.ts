import * as core from '@actions/core'
import * as github from '@actions/github'
import { parse as parseYaml } from 'yaml'

type Octokit = ReturnType<typeof github.getOctokit>

export interface AutoCloseConfig {
  enabled: boolean
  threshold: number
  comment: string
}

export interface AutoApproveConfig {
  enabled: boolean
  threshold: number
}

export interface AutoRequestReviewConfig {
  enabled: boolean
  threshold: number
  reviewers: string[]
}

export interface ActionsConfig {
  auto_close: AutoCloseConfig
  auto_approve: AutoApproveConfig
  auto_request_review: AutoRequestReviewConfig
}

export interface ThresholdsConfig {
  low: number
  medium: number
  high: number
}

export interface RulesConfig {
  require_description: boolean
  require_linked_issue: boolean
  max_files_changed: number
  block_first_time_contributors: boolean
}

export interface SlopperConfig {
  vouched: string[]
  actions: ActionsConfig
  thresholds: ThresholdsConfig
  ignore_paths: string[]
  rules: RulesConfig
}

const DEFAULT_CONFIG: SlopperConfig = {
  vouched: [],
  actions: {
    auto_close: {
      enabled: false,
      threshold: 9,
      comment: 'This PR was automatically closed by Slopper due to critical risk score.'
    },
    auto_approve: {
      enabled: false,
      threshold: 2
    },
    auto_request_review: {
      enabled: false,
      threshold: 6,
      reviewers: []
    }
  },
  thresholds: {
    low: 2,
    medium: 5,
    high: 8
  },
  ignore_paths: [],
  rules: {
    require_description: false,
    require_linked_issue: false,
    max_files_changed: 0,
    block_first_time_contributors: false
  }
}

/**
 * Loads and parses the `.slopper` configuration file from a repository.
 *
 * Supports two formats:
 * - **YAML** (new): full configuration with actions, thresholds, rules
 * - **Plain text** (legacy): newline-separated list of vouched usernames
 *
 * Auto-detects the format. Missing fields get sensible defaults.
 */
export class ConfigLoader {
  private readonly octokit: Octokit
  private readonly owner: string
  private readonly repo: string

  constructor(octokit: Octokit, owner: string, repo: string) {
    this.octokit = octokit
    this.owner = owner
    this.repo = repo
  }

  async load(): Promise<SlopperConfig> {
    const content = await this.fetchFile()
    if (!content) return { ...DEFAULT_CONFIG }

    if (this.isYaml(content)) {
      return this.parseYamlConfig(content)
    }

    return this.parsePlainText(content)
  }

  private async fetchFile(): Promise<string | null> {
    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: '.slopper'
      })

      if ('content' in data && data.content) {
        return Buffer.from(data.content, 'base64').toString('utf-8')
      }
    } catch {
      core.info('No .slopper configuration file found — using defaults')
    }
    return null
  }

  private isYaml(content: string): boolean {
    return /^\s*(vouched|actions|thresholds|ignore_paths|rules)\s*:/m.test(content)
  }

  private parseYamlConfig(content: string): SlopperConfig {
    const parsed = parseYaml(content) ?? {}
    return this.mergeWithDefaults(parsed)
  }

  private parsePlainText(content: string): SlopperConfig {
    const vouched = content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))

    return { ...DEFAULT_CONFIG, vouched }
  }

  private mergeWithDefaults(parsed: Record<string, unknown>): SlopperConfig {
    const vouched = Array.isArray(parsed.vouched)
      ? (parsed.vouched as string[])
      : DEFAULT_CONFIG.vouched

    const parsedActions = (parsed.actions ?? {}) as Record<string, unknown>
    const parsedAutoClose = (parsedActions.auto_close ?? {}) as Record<string, unknown>
    const parsedAutoApprove = (parsedActions.auto_approve ?? {}) as Record<string, unknown>
    const parsedAutoRequestReview = (parsedActions.auto_request_review ?? {}) as Record<string, unknown>

    const actions: ActionsConfig = {
      auto_close: {
        enabled: Boolean(parsedAutoClose.enabled ?? DEFAULT_CONFIG.actions.auto_close.enabled),
        threshold: Number(parsedAutoClose.threshold ?? DEFAULT_CONFIG.actions.auto_close.threshold),
        comment: String(parsedAutoClose.comment ?? DEFAULT_CONFIG.actions.auto_close.comment)
      },
      auto_approve: {
        enabled: Boolean(parsedAutoApprove.enabled ?? DEFAULT_CONFIG.actions.auto_approve.enabled),
        threshold: Number(parsedAutoApprove.threshold ?? DEFAULT_CONFIG.actions.auto_approve.threshold)
      },
      auto_request_review: {
        enabled: Boolean(parsedAutoRequestReview.enabled ?? DEFAULT_CONFIG.actions.auto_request_review.enabled),
        threshold: Number(parsedAutoRequestReview.threshold ?? DEFAULT_CONFIG.actions.auto_request_review.threshold),
        reviewers: Array.isArray(parsedAutoRequestReview.reviewers)
          ? (parsedAutoRequestReview.reviewers as string[])
          : DEFAULT_CONFIG.actions.auto_request_review.reviewers
      }
    }

    const parsedThresholds = (parsed.thresholds ?? {}) as Record<string, unknown>
    const thresholds: ThresholdsConfig = {
      low: Number(parsedThresholds.low ?? DEFAULT_CONFIG.thresholds.low),
      medium: Number(parsedThresholds.medium ?? DEFAULT_CONFIG.thresholds.medium),
      high: Number(parsedThresholds.high ?? DEFAULT_CONFIG.thresholds.high)
    }

    const ignore_paths = Array.isArray(parsed.ignore_paths)
      ? (parsed.ignore_paths as string[])
      : DEFAULT_CONFIG.ignore_paths

    const parsedRules = (parsed.rules ?? {}) as Record<string, unknown>
    const rules: RulesConfig = {
      require_description: Boolean(parsedRules.require_description ?? DEFAULT_CONFIG.rules.require_description),
      require_linked_issue: Boolean(parsedRules.require_linked_issue ?? DEFAULT_CONFIG.rules.require_linked_issue),
      max_files_changed: Number(parsedRules.max_files_changed ?? DEFAULT_CONFIG.rules.max_files_changed),
      block_first_time_contributors: Boolean(parsedRules.block_first_time_contributors ?? DEFAULT_CONFIG.rules.block_first_time_contributors)
    }

    return { vouched, actions, thresholds, ignore_paths, rules }
  }
}
