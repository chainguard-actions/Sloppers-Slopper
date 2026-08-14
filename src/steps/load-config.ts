import * as core from '@actions/core'
import * as github from '@actions/github'
import { PipelineStep, PipelineContext } from '../pipeline'
import { ConfigLoader } from '../config'

type Octokit = ReturnType<typeof github.getOctokit>

/**
 * Pipeline step that loads the .slopper configuration file.
 *
 * Must run before all other steps. Writes `config` to context.
 * If no .slopper file exists, defaults are used.
 */
export class LoadConfigStep extends PipelineStep {
  readonly name = 'load-config'
  private readonly loader: ConfigLoader

  constructor(octokit: Octokit, owner: string, repo: string) {
    super()
    this.loader = new ConfigLoader(octokit, owner, repo)
  }

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    ctx.config = await this.loader.load()
    core.info(`[config] Loaded: ${ctx.config.vouched.length} vouched users, ignore_paths=${ctx.config.ignore_paths.length}`)
    return ctx
  }
}
