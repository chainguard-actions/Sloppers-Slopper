/**
 * Tool schema definitions for structured AI output via MCP tool calling.
 *
 * Instead of parsing raw JSON from the AI, we define a `submit_analysis` tool
 * with a strict JSON Schema. The AI is forced to call this tool, ensuring
 * deterministic, validated output structure across all providers.
 */

/** Name of the MCP tool the AI must call. */
export const ANALYSIS_TOOL_NAME = 'submit_analysis'

/** Description shown to the AI model for the tool. */
export const ANALYSIS_TOOL_DESCRIPTION =
  'Submit the structured quality and trust analysis results for a pull request. ' +
  'You MUST call this tool exactly once with your complete analysis.'

/** JSON Schema for the submit_analysis tool input. */
export const ANALYSIS_JSON_SCHEMA = {
  type: 'object' as const,
  additionalProperties: false,
  required: [
    'risk_score',
    'risk_level',
    'confidence',
    'summary',
    'author_assessment',
    'commit_assessment',
    'code_assessment',
    'behavioral_signals',
    'review_suggestions'
  ],
  properties: {
    risk_score: {
      type: 'integer' as const,
      minimum: 0,
      maximum: 10,
      description: 'Overall risk score from 0 (safe) to 10 (critical threat)'
    },
    risk_level: {
      type: 'string' as const,
      enum: ['low', 'medium', 'high', 'critical'],
      description: 'Risk category: low (0-2), medium (3-5), high (6-8), critical (9-10)'
    },
    confidence: {
      type: 'string' as const,
      enum: ['high', 'medium', 'low'],
      description: 'How confident the analysis is'
    },
    summary: {
      type: 'string' as const,
      description: '2-3 sentence overall assessment'
    },
    author_assessment: {
      type: 'object' as const,
      additionalProperties: false,
      required: ['trust_level', 'reasoning'],
      properties: {
        trust_level: {
          type: 'string' as const,
          enum: ['trusted', 'neutral', 'suspicious', 'unknown']
        },
        reasoning: { type: 'string' as const }
      }
    },
    commit_assessment: {
      type: 'object' as const,
      additionalProperties: false,
      required: ['quality', 'reasoning'],
      properties: {
        quality: {
          type: 'string' as const,
          enum: ['good', 'acceptable', 'poor', 'suspicious']
        },
        reasoning: { type: 'string' as const }
      }
    },
    code_assessment: {
      type: 'object' as const,
      additionalProperties: false,
      required: ['categories_flagged', 'reasoning', 'suspicious_patterns'],
      properties: {
        categories_flagged: {
          type: 'array' as const,
          items: {
            type: 'string' as const,
            enum: [
              'phantom_fix', 'well_formed_noise', 'boilerplate_inflation',
              'unnecessary_refactoring', 'cosmetic_disguise', 'duplicate_code',
              'documentation_slop', 'convention_breaking',
              'obfuscation', 'secrets', 'backdoor', 'dependency_hijack',
              'ci_tampering', 'data_exfiltration', 'crypto_mining',
              'typosquatting', 'none'
            ]
          }
        },
        reasoning: { type: 'string' as const },
        suspicious_patterns: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            additionalProperties: false,
            required: ['file', 'description', 'severity'],
            properties: {
              file: { type: 'string' as const },
              description: { type: 'string' as const },
              severity: {
                type: 'string' as const,
                enum: ['low', 'medium', 'high', 'critical']
              }
            }
          }
        }
      }
    },
    behavioral_signals: {
      type: 'object' as const,
      additionalProperties: false,
      required: ['flags', 'reasoning'],
      properties: {
        flags: {
          type: 'array' as const,
          items: {
            type: 'string' as const,
            enum: [
              'spray_and_pray', 'reputation_farming', 'new_account',
              'bot_like_timing', 'no_engagement', 'holiday_burst',
              'generic_description', 'phantom_fix_claim',
              'description_diff_mismatch', 'templated_test_plan',
              'none'
            ]
          },
          description: 'Behavioral flags detected in the PR and author patterns'
        },
        reasoning: { type: 'string' as const }
      }
    },
    review_suggestions: {
      type: 'array' as const,
      items: { type: 'string' as const },
      description: 'Specific things a human reviewer should check'
    }
  }
} as const

/**
 * Builds the tool definition for OpenAI function calling.
 * @returns OpenAI-compatible tool object with strict mode enabled.
 */
export function buildOpenAITool() {
  return {
    type: 'function' as const,
    function: {
      name: ANALYSIS_TOOL_NAME,
      description: ANALYSIS_TOOL_DESCRIPTION,
      strict: true,
      parameters: ANALYSIS_JSON_SCHEMA
    }
  }
}

/**
 * Builds the tool definition for Anthropic/Vertex AI tool use.
 * @returns Anthropic-compatible tool object.
 */
export function buildAnthropicTool() {
  return {
    name: ANALYSIS_TOOL_NAME,
    description: ANALYSIS_TOOL_DESCRIPTION,
    input_schema: ANALYSIS_JSON_SCHEMA
  }
}

/**
 * Builds the function declaration for Google Gemini function calling.
 * @returns Gemini-compatible function declaration.
 */
export function buildGeminiFunctionDeclaration() {
  return {
    name: ANALYSIS_TOOL_NAME,
    description: ANALYSIS_TOOL_DESCRIPTION,
    parametersJsonSchema: ANALYSIS_JSON_SCHEMA
  }
}
