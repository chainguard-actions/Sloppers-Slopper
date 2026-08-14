import { buildOpenAITool, buildAnthropicTool, ANALYSIS_TOOL_NAME } from '../src/tools'

describe('Tool Schema', () => {
  describe('buildOpenAITool', () => {
    it('returns correct structure for OpenAI function calling', () => {
      const tool = buildOpenAITool()
      expect(tool.type).toBe('function')
      expect(tool.function.name).toBe(ANALYSIS_TOOL_NAME)
      expect(tool.function.strict).toBe(true)
      expect(tool.function.parameters.type).toBe('object')
      expect(tool.function.parameters.required).toContain('risk_score')
      expect(tool.function.parameters.required).toContain('summary')
    })

    it('includes all required fields', () => {
      const tool = buildOpenAITool()
      const required = tool.function.parameters.required
      expect(required).toEqual([
        'risk_score', 'risk_level', 'confidence', 'summary',
        'author_assessment', 'commit_assessment', 'code_assessment',
        'behavioral_signals', 'review_suggestions'
      ])
    })

    it('constrains risk_score to 0-10', () => {
      const tool = buildOpenAITool()
      const riskScore = tool.function.parameters.properties.risk_score
      expect(riskScore.minimum).toBe(0)
      expect(riskScore.maximum).toBe(10)
    })

    it('constrains risk_level to valid enums', () => {
      const tool = buildOpenAITool()
      const riskLevel = tool.function.parameters.properties.risk_level
      expect(riskLevel.enum).toEqual(['low', 'medium', 'high', 'critical'])
    })
  })

  describe('buildAnthropicTool', () => {
    it('returns correct structure for Anthropic tool use', () => {
      const tool = buildAnthropicTool()
      expect(tool.name).toBe(ANALYSIS_TOOL_NAME)
      expect(tool.input_schema.type).toBe('object')
      expect(tool.input_schema.required).toContain('risk_score')
    })

    it('uses input_schema instead of parameters', () => {
      const tool = buildAnthropicTool()
      expect(tool).toHaveProperty('input_schema')
      expect(tool).not.toHaveProperty('parameters')
    })

    it('has same schema content as OpenAI tool', () => {
      const openai = buildOpenAITool()
      const anthropic = buildAnthropicTool()
      expect(anthropic.input_schema).toEqual(openai.function.parameters)
    })
  })
})
