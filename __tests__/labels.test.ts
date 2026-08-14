import { LabelComputer } from '../src/labels'
import { AnalysisResult, AuthorProfile, FileInfo, PrData } from '../src/types'

function makeResult(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    risk_score: 1,
    risk_level: 'low',
    confidence: 'high',
    summary: 'Test summary',
    author_assessment: { trust_level: 'trusted', reasoning: 'test' },
    commit_assessment: { quality: 'good', reasoning: 'test' },
    code_assessment: { categories_flagged: ['none'], reasoning: 'test', suspicious_patterns: [] },
    behavioral_signals: { flags: [], reasoning: 'test' },
    review_suggestions: [],
    ...overrides
  }
}

function makeFile(filename: string): FileInfo {
  return { filename, status: 'modified', additions: 10, deletions: 5, is_binary: false }
}

describe('LabelComputer', () => {
  const computer = new LabelComputer()

  describe('risk labels', () => {
    it('assigns slopper/risk/low for scores 0-2', () => {
      const labels = computer.compute(makeResult({ risk_score: 0 }), [], false)
      expect(labels).toContain('slopper/risk/low')
    })

    it('assigns slopper/risk/low for score 2', () => {
      const labels = computer.compute(makeResult({ risk_score: 2 }), [], false)
      expect(labels).toContain('slopper/risk/low')
    })

    it('assigns slopper/risk/medium for scores 3-5', () => {
      const labels = computer.compute(makeResult({ risk_score: 4 }), [], false)
      expect(labels).toContain('slopper/risk/medium')
    })

    it('assigns slopper/risk/high for scores 6-8', () => {
      const labels = computer.compute(makeResult({ risk_score: 7 }), [], false)
      expect(labels).toContain('slopper/risk/high')
    })

    it('assigns slopper/risk/critical for scores 9-10', () => {
      const labels = computer.compute(makeResult({ risk_score: 9 }), [], false)
      expect(labels).toContain('slopper/risk/critical')
    })
  })

  describe('confidence labels', () => {
    it('assigns slopper/confidence/high', () => {
      const labels = computer.compute(makeResult({ confidence: 'high' }), [], false)
      expect(labels).toContain('slopper/confidence/high')
    })

    it('assigns slopper/confidence/medium', () => {
      const labels = computer.compute(makeResult({ confidence: 'medium' }), [], false)
      expect(labels).toContain('slopper/confidence/medium')
    })

    it('assigns slopper/confidence/low', () => {
      const labels = computer.compute(makeResult({ confidence: 'low' }), [], false)
      expect(labels).toContain('slopper/confidence/low')
    })
  })

  describe('approved label', () => {
    it('assigns slopper/approved when score <= 2 and confidence is high', () => {
      const labels = computer.compute(makeResult({ risk_score: 1, confidence: 'high' }), [], false)
      expect(labels).toContain('slopper/approved')
    })

    it('does not assign slopper/approved when score > 2', () => {
      const labels = computer.compute(makeResult({ risk_score: 3, confidence: 'high' }), [], false)
      expect(labels).not.toContain('slopper/approved')
    })

    it('does not assign slopper/approved when confidence is not high', () => {
      const labels = computer.compute(makeResult({ risk_score: 1, confidence: 'medium' }), [], false)
      expect(labels).not.toContain('slopper/approved')
    })
  })

  describe('first-time contributor', () => {
    it('assigns slopper/first-time-contributor when true', () => {
      const labels = computer.compute(makeResult(), [], true)
      expect(labels).toContain('slopper/first-time-contributor')
    })

    it('does not assign when false', () => {
      const labels = computer.compute(makeResult(), [], false)
      expect(labels).not.toContain('slopper/first-time-contributor')
    })
  })

  describe('CI/dependency file detection', () => {
    it('detects .github/workflows/ changes', () => {
      const files = [makeFile('.github/workflows/ci.yml')]
      const labels = computer.compute(makeResult(), files, false)
      expect(labels).toContain('slopper/ci-modified')
    })

    it('detects Jenkinsfile changes', () => {
      const files = [makeFile('Jenkinsfile')]
      const labels = computer.compute(makeResult(), files, false)
      expect(labels).toContain('slopper/ci-modified')
    })

    it('does not flag non-CI files', () => {
      const files = [makeFile('src/index.ts')]
      const labels = computer.compute(makeResult(), files, false)
      expect(labels).not.toContain('slopper/ci-modified')
    })

    it('detects package.json changes', () => {
      const files = [makeFile('package.json')]
      const labels = computer.compute(makeResult(), files, false)
      expect(labels).toContain('slopper/dependencies-modified')
    })

    it('detects nested dependency files', () => {
      const files = [makeFile('services/api/requirements.txt')]
      const labels = computer.compute(makeResult(), files, false)
      expect(labels).toContain('slopper/dependencies-modified')
    })

    it('does not flag non-dependency files', () => {
      const files = [makeFile('src/utils.ts')]
      const labels = computer.compute(makeResult(), files, false)
      expect(labels).not.toContain('slopper/dependencies-modified')
    })
  })

  describe('security review thresholds', () => {
    it('assigns needs-security-review at score >= 6', () => {
      const labels = computer.compute(makeResult({ risk_score: 6 }), [], false)
      expect(labels).toContain('slopper/needs-security-review')
    })

    it('does not assign needs-security-review below 6', () => {
      const labels = computer.compute(makeResult({ risk_score: 5 }), [], false)
      expect(labels).not.toContain('slopper/needs-security-review')
    })

    it('assigns suspicious at score >= 8', () => {
      const labels = computer.compute(makeResult({ risk_score: 8 }), [], false)
      expect(labels).toContain('slopper/suspicious')
    })

    it('does not assign suspicious below 8', () => {
      const labels = computer.compute(makeResult({ risk_score: 7 }), [], false)
      expect(labels).not.toContain('slopper/suspicious')
    })
  })

  describe('failure labels', () => {
    it('returns only analysis-failed', () => {
      const labels = computer.computeFailedLabels()
      expect(labels).toEqual(['slopper/analysis-failed'])
    })
  })

  describe('combined scenarios', () => {
    it('high-risk PR with CI and deps gets all relevant labels', () => {
      const files = [
        makeFile('.github/workflows/deploy.yml'),
        makeFile('package.json'),
        makeFile('src/hack.ts')
      ]
      const result = makeResult({ risk_score: 9, confidence: 'high' })
      const labels = computer.compute(result, files, true)

      expect(labels).toContain('slopper/risk/critical')
      expect(labels).toContain('slopper/confidence/high')
      expect(labels).toContain('slopper/first-time-contributor')
      expect(labels).toContain('slopper/ci-modified')
      expect(labels).toContain('slopper/dependencies-modified')
      expect(labels).toContain('slopper/needs-security-review')
      expect(labels).toContain('slopper/suspicious')
      expect(labels).not.toContain('slopper/approved')
    })

    it('clean PR from known contributor gets minimal labels', () => {
      const files = [makeFile('src/feature.ts')]
      const result = makeResult({ risk_score: 0, confidence: 'high' })
      const labels = computer.compute(result, files, false)

      expect(labels).toEqual([
        'slopper/risk/low',
        'slopper/confidence/high',
        'slopper/approved'
      ])
    })
  })

  describe('shouldSuggestVouch', () => {
    function makeAuthor(overrides: Partial<AuthorProfile> = {}): AuthorProfile {
      return {
        login: 'trusted-dev',
        created_at: '2020-01-01T00:00:00Z',
        public_repos: 50,
        followers: 100,
        following: 20,
        bio: 'Senior dev',
        company: 'ACME',
        is_bot: false,
        is_collaborator: true,
        past_merged_prs_in_repo: 10,
        past_issues_in_repo: 5,
        first_time_contributor: false,
        ...overrides
      }
    }

    const trustedResult = makeResult({
      risk_score: 0,
      confidence: 'high',
      author_assessment: { trust_level: 'trusted', reasoning: 'Long history' }
    })

    it('suggests vouch for a perfect score + collaborator', () => {
      expect(computer.shouldSuggestVouch(trustedResult, makeAuthor())).toBe(true)
    })

    it('suggests vouch for non-collaborator with 3+ merged PRs', () => {
      const author = makeAuthor({ is_collaborator: false, past_merged_prs_in_repo: 5 })
      expect(computer.shouldSuggestVouch(trustedResult, author)).toBe(true)
    })

    it('does not suggest when risk score > 0', () => {
      const result = makeResult({
        risk_score: 1,
        confidence: 'high',
        author_assessment: { trust_level: 'trusted', reasoning: 'ok' }
      })
      expect(computer.shouldSuggestVouch(result, makeAuthor())).toBe(false)
    })

    it('does not suggest when confidence is not high', () => {
      const result = makeResult({
        risk_score: 0,
        confidence: 'medium',
        author_assessment: { trust_level: 'trusted', reasoning: 'ok' }
      })
      expect(computer.shouldSuggestVouch(result, makeAuthor())).toBe(false)
    })

    it('does not suggest when author trust level is not trusted', () => {
      const result = makeResult({
        risk_score: 0,
        confidence: 'high',
        author_assessment: { trust_level: 'neutral', reasoning: 'ok' }
      })
      expect(computer.shouldSuggestVouch(result, makeAuthor())).toBe(false)
    })

    it('does not suggest for bots', () => {
      const author = makeAuthor({ is_bot: true })
      expect(computer.shouldSuggestVouch(trustedResult, author)).toBe(false)
    })

    it('does not suggest for non-collaborator with < 3 merged PRs', () => {
      const author = makeAuthor({ is_collaborator: false, past_merged_prs_in_repo: 2 })
      expect(computer.shouldSuggestVouch(trustedResult, author)).toBe(false)
    })
  })

  describe('custom thresholds', () => {
    const custom = new LabelComputer({ low: 3, medium: 6, high: 9 })

    it('uses custom low threshold for risk label', () => {
      const labels = custom.compute(makeResult({ risk_score: 3 }), [], false)
      expect(labels).toContain('slopper/risk/low')
    })

    it('uses custom medium threshold', () => {
      const labels = custom.compute(makeResult({ risk_score: 6 }), [], false)
      expect(labels).toContain('slopper/risk/medium')
    })

    it('uses custom high threshold', () => {
      const labels = custom.compute(makeResult({ risk_score: 9 }), [], false)
      expect(labels).toContain('slopper/risk/high')
    })

    it('uses custom threshold for approved label', () => {
      const labels = custom.compute(makeResult({ risk_score: 3, confidence: 'high' }), [], false)
      expect(labels).toContain('slopper/approved')
    })
  })

  describe('rule-based labels', () => {
    function makePrData(overrides: Partial<PrData> = {}): PrData {
      return {
        repo: 'owner/repo',
        pr_number: 1,
        title: 'Test PR',
        body: 'Fixes #42',
        base_branch: 'main',
        head_branch: 'feature',
        changed_files_count: 3,
        additions: 100,
        deletions: 50,
        author: {
          login: 'dev', created_at: '2020-01-01T00:00:00Z', public_repos: 10,
          followers: 5, following: 5, bio: '', company: '', is_bot: false,
          is_collaborator: true, past_merged_prs_in_repo: 5,
          past_issues_in_repo: 2, first_time_contributor: false
        },
        commits: { count: 1, messages: ['fix bug'], unsigned_count: 0, author_committer_mismatches: 0 },
        files: [makeFile('src/index.ts')],
        diff: 'diff content',
        ...overrides
      }
    }

    const withRules = new LabelComputer(undefined, {
      require_description: true,
      require_linked_issue: true,
      max_files_changed: 10,
      block_first_time_contributors: false
    })

    it('adds missing-description label when body is empty', () => {
      const prData = makePrData({ body: '' })
      const labels = withRules.compute(makeResult(), [], false, prData)
      expect(labels).toContain('slopper/missing-description')
    })

    it('does not add missing-description when body has content', () => {
      const prData = makePrData({ body: 'This PR adds a feature' })
      const labels = withRules.compute(makeResult(), [], false, prData)
      expect(labels).not.toContain('slopper/missing-description')
    })

    it('adds no-linked-issue when body has no issue reference', () => {
      const prData = makePrData({ body: 'Just some changes with no issue ref' })
      const labels = withRules.compute(makeResult(), [], false, prData)
      expect(labels).toContain('slopper/no-linked-issue')
    })

    it('does not add no-linked-issue when body references an issue', () => {
      const prData = makePrData({ body: 'Fixes #123' })
      const labels = withRules.compute(makeResult(), [], false, prData)
      expect(labels).not.toContain('slopper/no-linked-issue')
    })

    it('adds too-many-files when changed_files_count exceeds max', () => {
      const prData = makePrData({ changed_files_count: 15 })
      const labels = withRules.compute(makeResult(), [], false, prData)
      expect(labels).toContain('slopper/too-many-files')
    })

    it('does not add too-many-files when within limit', () => {
      const prData = makePrData({ changed_files_count: 5 })
      const labels = withRules.compute(makeResult(), [], false, prData)
      expect(labels).not.toContain('slopper/too-many-files')
    })

    it('does not add rule labels when rules are disabled', () => {
      const noRules = new LabelComputer()
      const prData = makePrData({ body: '', changed_files_count: 100 })
      const labels = noRules.compute(makeResult(), [], false, prData)
      expect(labels).not.toContain('slopper/missing-description')
      expect(labels).not.toContain('slopper/too-many-files')
    })
  })
})
