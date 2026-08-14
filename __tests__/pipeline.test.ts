import { AnalysisPipeline, PipelineStep, PipelineContext } from '../src/pipeline'

jest.mock('@actions/core', () => ({
  info: jest.fn()
}))

class SetVouchedStep extends PipelineStep {
  readonly name = 'set-vouched'

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    ctx.vouched = true
    ctx.vouchedBy = 'test-user'
    return ctx
  }
}

class SetAuthorStep extends PipelineStep {
  readonly name = 'set-author'

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    ctx.prAuthor = 'contributor'
    return ctx
  }
}

class FailingStep extends PipelineStep {
  readonly name = 'failing'

  async execute(_ctx: PipelineContext): Promise<PipelineContext> {
    throw new Error('Step failed')
  }
}

describe('AnalysisPipeline', () => {
  it('runs steps in order and passes context through', async () => {
    const pipeline = new AnalysisPipeline([
      new SetAuthorStep(),
      new SetVouchedStep()
    ])

    const result = await pipeline.run({ prNumber: 1 })
    expect(result.prAuthor).toBe('contributor')
    expect(result.vouched).toBe(true)
    expect(result.vouchedBy).toBe('test-user')
  })

  it('preserves initial context', async () => {
    const pipeline = new AnalysisPipeline([
      new SetAuthorStep()
    ])

    const result = await pipeline.run({ prNumber: 42 })
    expect(result.prNumber).toBe(42)
    expect(result.prAuthor).toBe('contributor')
  })

  it('propagates errors from failing steps', async () => {
    const pipeline = new AnalysisPipeline([
      new SetAuthorStep(),
      new FailingStep(),
      new SetVouchedStep()
    ])

    await expect(pipeline.run({ prNumber: 1 })).rejects.toThrow('Step failed')
  })

  it('handles empty pipeline', async () => {
    const pipeline = new AnalysisPipeline([])
    const result = await pipeline.run({ prNumber: 42 })
    expect(result.prNumber).toBe(42)
  })
})
