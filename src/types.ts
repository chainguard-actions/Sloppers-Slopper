/** GitHub user profile information relevant to trust analysis. */
export interface AuthorProfile {
  /** GitHub username. */
  login: string
  /** ISO 8601 account creation date. */
  created_at: string
  /** Number of public repositories owned. */
  public_repos: number
  /** Number of followers. */
  followers: number
  /** Number of users followed. */
  following: number
  /** User bio text. */
  bio: string
  /** Company affiliation. */
  company: string
  /** Whether the account is a bot. */
  is_bot: boolean
  /** Whether the user is a collaborator on the target repo. */
  is_collaborator: boolean
  /** Count of previously merged PRs in this repo. */
  past_merged_prs_in_repo: number
  /** Count of previously opened issues in this repo. */
  past_issues_in_repo: number
  /** True if the author has no prior PRs or issues in this repo. */
  first_time_contributor: boolean
}

/** Aggregated commit metadata for a pull request. */
export interface CommitSummary {
  /** Total number of commits in the PR. */
  count: number
  /** First 200 chars of each commit message. */
  messages: string[]
  /** Number of commits without a verified signature. */
  unsigned_count: number
  /** Number of commits where author and committer emails differ. */
  author_committer_mismatches: number
}

/** Metadata for a single changed file in a PR. */
export interface FileInfo {
  /** Path relative to repo root. */
  filename: string
  /** Change status: added, removed, modified, renamed, etc. */
  status: string
  /** Lines added. */
  additions: number
  /** Lines removed. */
  deletions: number
  /** True if the file is binary (no patch available). */
  is_binary: boolean
}

/** All collected data about a pull request, ready for AI analysis. */
export interface PrData {
  /** Repository in owner/repo format. */
  repo: string
  /** PR number. */
  pr_number: number
  /** PR title. */
  title: string
  /** PR description (truncated to 3000 chars). */
  body: string
  /** Target branch. */
  base_branch: string
  /** Source branch. */
  head_branch: string
  /** Total number of changed files. */
  changed_files_count: number
  /** Total lines added. */
  additions: number
  /** Total lines removed. */
  deletions: number
  /** Author profile data. */
  author: AuthorProfile
  /** Commit analysis summary. */
  commits: CommitSummary
  /** List of changed files with metadata. */
  files: FileInfo[]
  /** Unified diff content (truncated to 80k chars). */
  diff: string
}

/** A single suspicious code pattern identified by the AI. */
export interface SuspiciousPattern {
  /** File path where the pattern was found. */
  file: string
  /** Description of what was detected. */
  description: string
  /** Severity level. */
  severity: 'low' | 'medium' | 'high' | 'critical'
}

/** Structured trust analysis result returned by the AI via tool calling. */
export interface AnalysisResult {
  /** Numeric risk score from 0 (safe) to 10 (critical). */
  risk_score: number
  /** Categorical risk level derived from the score. */
  risk_level: 'low' | 'medium' | 'high' | 'critical' | 'unknown'
  /** AI's confidence in its own assessment. */
  confidence: 'low' | 'medium' | 'high'
  /** 2-3 sentence overall assessment. */
  summary: string
  /** Assessment of the PR author's trustworthiness. */
  author_assessment: {
    trust_level: string
    reasoning: string
  }
  /** Assessment of commit quality and patterns. */
  commit_assessment: {
    quality: string
    reasoning: string
  }
  /** Assessment of the code changes for quality and security concerns. */
  code_assessment: {
    categories_flagged: string[]
    reasoning: string
    suspicious_patterns: SuspiciousPattern[]
  }
  /** Behavioral signals detected in the PR. */
  behavioral_signals: {
    flags: string[]
    reasoning: string
  }
  /** Specific things a human reviewer should check. */
  review_suggestions: string[]
  /** AI provider used (set after analysis). */
  provider?: string
  /** PR number (set after analysis). */
  pr_number?: number
  /** Repository (set after analysis). */
  repo?: string
  /** Error message if analysis failed. */
  error?: string
}
