import { ConfigLoader } from '../src/config'

jest.mock('@actions/core', () => ({
  info: jest.fn()
}))

function makeMockOctokit(fileContent: string | null) {
  return {
    rest: {
      repos: {
        getContent: jest.fn().mockImplementation(() => {
          if (fileContent === null) {
            throw new Error('Not Found')
          }
          return {
            data: {
              content: Buffer.from(fileContent).toString('base64')
            }
          }
        })
      }
    }
  } as any
}

describe('ConfigLoader', () => {
  describe('plain text format (legacy)', () => {
    it('parses newline-separated usernames', async () => {
      const octokit = makeMockOctokit('alice\nbob\ncharlie')
      const loader = new ConfigLoader(octokit, 'owner', 'repo')
      const config = await loader.load()

      expect(config.vouched).toEqual(['alice', 'bob', 'charlie'])
      expect(config.actions.auto_close.enabled).toBe(false)
    })

    it('ignores comments and blank lines', async () => {
      const octokit = makeMockOctokit('# trusted users\nalice\n\n# bots\ndependabot[bot]\n')
      const loader = new ConfigLoader(octokit, 'owner', 'repo')
      const config = await loader.load()

      expect(config.vouched).toEqual(['alice', 'dependabot[bot]'])
    })
  })

  describe('YAML format', () => {
    it('parses full YAML config', async () => {
      const yaml = `
vouched:
  - alice
  - bob

actions:
  auto_close:
    enabled: true
    threshold: 8
    comment: "Closed by Slopper"
  auto_approve:
    enabled: true
    threshold: 1
  auto_request_review:
    enabled: true
    threshold: 5
    reviewers:
      - reviewer1

thresholds:
  low: 3
  medium: 6
  high: 9

ignore_paths:
  - "*.md"
  - "docs/**"

rules:
  require_description: true
  require_linked_issue: true
  max_files_changed: 50
  block_first_time_contributors: true
`
      const octokit = makeMockOctokit(yaml)
      const loader = new ConfigLoader(octokit, 'owner', 'repo')
      const config = await loader.load()

      expect(config.vouched).toEqual(['alice', 'bob'])
      expect(config.actions.auto_close.enabled).toBe(true)
      expect(config.actions.auto_close.threshold).toBe(8)
      expect(config.actions.auto_close.comment).toBe('Closed by Slopper')
      expect(config.actions.auto_approve.enabled).toBe(true)
      expect(config.actions.auto_approve.threshold).toBe(1)
      expect(config.actions.auto_request_review.reviewers).toEqual(['reviewer1'])
      expect(config.thresholds).toEqual({ low: 3, medium: 6, high: 9 })
      expect(config.ignore_paths).toEqual(['*.md', 'docs/**'])
      expect(config.rules.require_description).toBe(true)
      expect(config.rules.max_files_changed).toBe(50)
      expect(config.rules.block_first_time_contributors).toBe(true)
    })

    it('fills missing fields with defaults', async () => {
      const yaml = `
vouched:
  - alice
actions:
  auto_close:
    enabled: true
`
      const octokit = makeMockOctokit(yaml)
      const loader = new ConfigLoader(octokit, 'owner', 'repo')
      const config = await loader.load()

      expect(config.vouched).toEqual(['alice'])
      expect(config.actions.auto_close.enabled).toBe(true)
      expect(config.actions.auto_close.threshold).toBe(9)
      expect(config.actions.auto_close.comment).toContain('critical risk score')
      expect(config.actions.auto_approve.enabled).toBe(false)
      expect(config.thresholds).toEqual({ low: 2, medium: 5, high: 8 })
      expect(config.ignore_paths).toEqual([])
      expect(config.rules.require_description).toBe(false)
    })
  })

  describe('no .slopper file', () => {
    it('returns all defaults', async () => {
      const octokit = makeMockOctokit(null)
      const loader = new ConfigLoader(octokit, 'owner', 'repo')
      const config = await loader.load()

      expect(config.vouched).toEqual([])
      expect(config.actions.auto_close.enabled).toBe(false)
      expect(config.thresholds).toEqual({ low: 2, medium: 5, high: 8 })
      expect(config.ignore_paths).toEqual([])
      expect(config.rules.block_first_time_contributors).toBe(false)
    })
  })
})
