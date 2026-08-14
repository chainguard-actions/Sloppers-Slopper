import { AnalysisResult } from './types'
import { ANALYSIS_TOOL_NAME, buildOpenAITool, buildAnthropicTool, buildGeminiFunctionDeclaration } from './tools'

export type AiProvider = 'openai' | 'anthropic' | 'vertex' | 'groq' | 'gemini'

const DEFAULT_MODELS: Record<AiProvider, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-6',
  vertex: 'claude-sonnet-4-6',
  groq: 'llama-3.3-70b-versatile',
  gemini: 'gemini-2.5-flash'
}

export async function callOpenAI(
  prompt: string,
  system: string,
  apiKey: string,
  model?: string
): Promise<AnalysisResult> {
  const OpenAI = (await import('openai')).default
  const client = new OpenAI({ apiKey })

  const response = await client.chat.completions.create({
    model: model ?? DEFAULT_MODELS.openai,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt }
    ],
    temperature: 0.1,
    max_tokens: 4096,
    tools: [buildOpenAITool()],
    tool_choice: { type: 'function', function: { name: ANALYSIS_TOOL_NAME } }
  })

  const toolCall = response.choices[0]?.message?.tool_calls?.[0]
  if (!toolCall || toolCall.function.name !== ANALYSIS_TOOL_NAME) {
    throw new Error('OpenAI did not call the submit_analysis tool')
  }

  return JSON.parse(toolCall.function.arguments) as AnalysisResult
}

export async function callAnthropic(
  prompt: string,
  system: string,
  apiKey: string,
  model?: string
): Promise<AnalysisResult> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey })

  const message = await client.messages.create({
    model: model ?? DEFAULT_MODELS.anthropic,
    max_tokens: 4096,
    system,
    tools: [buildAnthropicTool()],
    tool_choice: { type: 'tool' as const, name: ANALYSIS_TOOL_NAME },
    messages: [{ role: 'user', content: prompt }]
  })

  const toolBlock = message.content.find(
    (block): block is Extract<typeof block, { type: 'tool_use' }> =>
      block.type === 'tool_use' && block.name === ANALYSIS_TOOL_NAME
  )

  if (!toolBlock) {
    throw new Error('Anthropic did not call the submit_analysis tool')
  }

  return toolBlock.input as unknown as AnalysisResult
}

export async function callVertex(
  prompt: string,
  system: string,
  projectId: string,
  region: string,
  model?: string
): Promise<AnalysisResult> {
  const { AnthropicVertex } = await import('@anthropic-ai/vertex-sdk')
  const client = new AnthropicVertex({ projectId, region })

  const message = await client.messages.create({
    model: model ?? DEFAULT_MODELS.vertex,
    max_tokens: 4096,
    system,
    tools: [buildAnthropicTool()],
    tool_choice: { type: 'tool' as const, name: ANALYSIS_TOOL_NAME },
    messages: [{ role: 'user', content: prompt }]
  })

  const toolBlock = message.content.find(
    (block): block is Extract<typeof block, { type: 'tool_use' }> =>
      block.type === 'tool_use' && block.name === ANALYSIS_TOOL_NAME
  )

  if (!toolBlock) {
    throw new Error('Vertex AI did not call the submit_analysis tool')
  }

  return toolBlock.input as unknown as AnalysisResult
}

export async function callGroq(
  prompt: string,
  system: string,
  apiKey: string,
  model?: string
): Promise<AnalysisResult> {
  const Groq = (await import('groq-sdk')).default
  const client = new Groq({ apiKey })

  const response = await client.chat.completions.create({
    model: model ?? DEFAULT_MODELS.groq,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt }
    ],
    temperature: 0.1,
    max_tokens: 4096,
    tools: [buildOpenAITool()],
    tool_choice: { type: 'function', function: { name: ANALYSIS_TOOL_NAME } }
  })

  const toolCall = response.choices[0]?.message?.tool_calls?.[0]
  if (!toolCall || toolCall.function.name !== ANALYSIS_TOOL_NAME) {
    throw new Error('Groq did not call the submit_analysis tool')
  }

  return JSON.parse(toolCall.function.arguments) as AnalysisResult
}

export async function callGemini(
  prompt: string,
  system: string,
  apiKey: string,
  model?: string
): Promise<AnalysisResult> {
  const { GoogleGenAI, FunctionCallingConfigMode } = await import('@google/genai')
  const client = new GoogleGenAI({ apiKey })

  const response = await client.models.generateContent({
    model: model ?? DEFAULT_MODELS.gemini,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      systemInstruction: system,
      temperature: 0.1,
      maxOutputTokens: 4096,
      tools: [{ functionDeclarations: [buildGeminiFunctionDeclaration()] }],
      toolConfig: {
        functionCallingConfig: {
          mode: FunctionCallingConfigMode.ANY,
          allowedFunctionNames: [ANALYSIS_TOOL_NAME]
        }
      }
    }
  })

  const parts = response.candidates?.[0]?.content?.parts
  const functionCall = parts?.find(part => 'functionCall' in part && part.functionCall)

  if (!functionCall || !('functionCall' in functionCall) || functionCall.functionCall?.name !== ANALYSIS_TOOL_NAME) {
    throw new Error('Gemini did not call the submit_analysis tool')
  }

  return functionCall.functionCall.args as unknown as AnalysisResult
}

export async function callProvider(
  provider: AiProvider,
  prompt: string,
  system: string,
  config: {
    openaiApiKey?: string
    anthropicApiKey?: string
    vertexProjectId?: string
    vertexRegion?: string
    groqApiKey?: string
    geminiApiKey?: string
    model?: string
  }
): Promise<AnalysisResult> {
  switch (provider) {
    case 'openai':
      if (!config.openaiApiKey) throw new Error('openai-api-key is required for OpenAI provider')
      return callOpenAI(prompt, system, config.openaiApiKey, config.model)
    case 'anthropic':
      if (!config.anthropicApiKey) throw new Error('anthropic-api-key is required for Anthropic provider')
      return callAnthropic(prompt, system, config.anthropicApiKey, config.model)
    case 'vertex':
      if (!config.vertexProjectId) throw new Error('vertex-project-id is required for Vertex AI provider')
      return callVertex(prompt, system, config.vertexProjectId, config.vertexRegion ?? 'global', config.model)
    case 'groq':
      if (!config.groqApiKey) throw new Error('groq-api-key is required for Groq provider')
      return callGroq(prompt, system, config.groqApiKey, config.model)
    case 'gemini':
      if (!config.geminiApiKey) throw new Error('gemini-api-key is required for Gemini provider')
      return callGemini(prompt, system, config.geminiApiKey, config.model)
    default:
      throw new Error(`Unknown AI provider: ${provider}`)
  }
}
