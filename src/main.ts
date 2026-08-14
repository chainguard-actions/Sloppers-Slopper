import * as core from '@actions/core'
import * as github from '@actions/github'
import { AnalysisPipeline } from './pipeline'
import { AiProvider } from './providers'
import {
  LoadConfigStep,
  VouchCheckStep,
  VouchApplyStep,
  CollectDataStep,
  AiAnalysisStep,
  ComputeLabelsStep,
  PostResultsStep,
  AutoActionsStep
} from './steps'

const VALID_PROVIDERS: readonly AiProvider[] = ['openai', 'anthropic', 'vertex', 'groq', 'gemini']

function isValidProvider(value: string): value is AiProvider {
  return (VALID_PROVIDERS as readonly string[]).includes(value)
}

async function run(): Promise<void> {
  const providerInput = core.getInput('ai-provider')
  if (!isValidProvider(providerInput)) {
    core.setFailed(
      `Invalid ai-provider: ${providerInput}. Must be one of: ${VALID_PROVIDERS.join(', ')}`
    )
    return
  }

  const provider = providerInput
  const githubToken = core.getInput('github-token', { required: true })
  const openaiApiKey = core.getInput('openai-api-key')
  const anthropicApiKey = core.getInput('anthropic-api-key')
  const vertexProjectId = core.getInput('vertex-project-id')
  const vertexRegion = core.getInput('vertex-region') || 'global'
  const groqApiKey = core.getInput('groq-api-key')
  const geminiApiKey = core.getInput('gemini-api-key')
  const model = core.getInput('model') || undefined

  const prNumber = github.context.payload.pull_request?.number
  if (!prNumber) {
    core.setFailed('This action must be run on a pull_request event')
    return
  }

  const octokit = github.getOctokit(githubToken)
  const { owner, repo } = github.context.repo

  const loadConfigStep = new LoadConfigStep(octokit, owner, repo)

  const vouchPipeline = new AnalysisPipeline([
    loadConfigStep,
    new VouchCheckStep(octokit, owner, repo),
    new VouchApplyStep(octokit, owner, repo)
  ])
  const vouchResult = await vouchPipeline.run({ prNumber })

  if (vouchResult.vouched) return

  const analysisPipeline = new AnalysisPipeline([
    new CollectDataStep(octokit, owner, repo),
    new AiAnalysisStep({
      provider,
      openaiApiKey,
      anthropicApiKey,
      vertexProjectId,
      vertexRegion,
      groqApiKey,
      geminiApiKey,
      model
    }),
    new ComputeLabelsStep(),
    new PostResultsStep(octokit, owner, repo),
    new AutoActionsStep(octokit, owner, repo)
  ])
  await analysisPipeline.run({ prNumber, config: vouchResult.config })
}

run().catch((error: unknown) => {
  core.setFailed(error instanceof Error ? error.message : String(error))
})
