import { describe, expect, test } from 'bun:test'
import {
  buildProviderRuntimeEnvPrefix,
  buildRuntimeEnvOverlay,
  buildTeammateRuntimeSelection,
  normalizeProviderId,
} from './teammateRuntime.js'
import { getRuntimeEnvValue, runWithRuntimeEnv } from '../runtimeEnv.js'

describe('teammate runtime selection', () => {
  test('normalizes string null provider IDs to official provider selection', () => {
    expect(normalizeProviderId('null')).toBeNull()
    expect(normalizeProviderId(' NULL ')).toBeNull()
  })

  test('builds no runtime selection for legacy model-only spawns', () => {
    expect(
      buildTeammateRuntimeSelection({
        model: 'sonnet',
      }),
    ).toBeUndefined()
  })

  test('preserves exact provider and model IDs for teammate runtime selection', () => {
    expect(
      buildTeammateRuntimeSelection({
        providerId: 'openrouter',
        modelId: 'openai/gpt-5.4',
        model: 'sonnet',
      }),
    ).toEqual({
      providerId: 'openrouter',
      modelId: 'openai/gpt-5.4',
    })
  })

  test('supports explicit official provider selection', () => {
    expect(
      buildTeammateRuntimeSelection({
        providerId: null,
        modelId: 'claude-sonnet-4-6-20260401',
        model: 'sonnet',
      }),
    ).toEqual({
      providerId: null,
      modelId: 'claude-sonnet-4-6-20260401',
    })
  })

  test('preserves model ID without provider for caller-side validation', () => {
    expect(
      buildTeammateRuntimeSelection({
        modelId: 'provider/model',
        model: 'sonnet',
      }),
    ).toEqual({
      modelId: 'provider/model',
    })
  })

  test('quotes runtime env values for process-based teammates', () => {
    const originalBaseUrl = process.env.ANTHROPIC_BASE_URL
    process.env.ANTHROPIC_BASE_URL = 'http://parent.example'

    try {
      const prefix = buildProviderRuntimeEnvPrefix({
        clearInheritedProviderEnv: true,
        env: {
          ANTHROPIC_BASE_URL: 'http://runtime.example/v1',
          ANTHROPIC_MODEL: 'provider/model with space',
        },
      })

      expect(prefix).toContain('-u ANTHROPIC_BASE_URL')
      expect(prefix).toContain('ANTHROPIC_BASE_URL=')
      expect(prefix).toContain(
        'runtime.example/v1',
      )
      expect(prefix).toContain("ANTHROPIC_MODEL='provider/model with space'")
    } finally {
      if (originalBaseUrl === undefined) delete process.env.ANTHROPIC_BASE_URL
      else process.env.ANTHROPIC_BASE_URL = originalBaseUrl
    }
  })

  test('can mask inherited provider env for in-process teammates', () => {
    const originalBedrock = process.env.CLAUDE_CODE_USE_BEDROCK
    const originalSubagentModel = process.env.CLAUDE_CODE_SUBAGENT_MODEL
    process.env.CLAUDE_CODE_USE_BEDROCK = '1'
    process.env.CLAUDE_CODE_SUBAGENT_MODEL = 'haiku'

    try {
      const overlay = buildRuntimeEnvOverlay({
        clearInheritedProviderEnv: true,
        env: {
          ANTHROPIC_MODEL: 'provider/model-id',
        },
      })

      runWithRuntimeEnv(overlay, () => {
        expect(getRuntimeEnvValue('CLAUDE_CODE_USE_BEDROCK')).toBeUndefined()
        expect(getRuntimeEnvValue('CLAUDE_CODE_SUBAGENT_MODEL')).toBeUndefined()
        expect(getRuntimeEnvValue('ANTHROPIC_MODEL')).toBe('provider/model-id')
      })
    } finally {
      if (originalBedrock === undefined) delete process.env.CLAUDE_CODE_USE_BEDROCK
      else process.env.CLAUDE_CODE_USE_BEDROCK = originalBedrock
      if (originalSubagentModel === undefined) {
        delete process.env.CLAUDE_CODE_SUBAGENT_MODEL
      } else {
        process.env.CLAUDE_CODE_SUBAGENT_MODEL = originalSubagentModel
      }
    }
  })
})
