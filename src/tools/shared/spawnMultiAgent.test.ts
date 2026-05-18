import { describe, expect, test } from 'bun:test'
import {
  resolveTeammateModel,
  resolveTeammateSpawnRuntime,
} from './spawnMultiAgent.js'

describe('resolveTeammateSpawnRuntime', () => {
  test('uses exact official provider/model pair instead of parsing legacy aliases', async () => {
    const runtime = await resolveTeammateSpawnRuntime(
      {
        model: 'sonnet',
        providerId: null,
        modelId: 'openai/gpt-5.4',
      },
      'leader-model',
    )

    expect(runtime.model).toBe('openai/gpt-5.4')
    expect(runtime.runtime).toEqual({
      providerId: null,
      modelId: 'openai/gpt-5.4',
    })
  })

  test('accepts string null from tool calls for the official provider', async () => {
    const runtime = await resolveTeammateSpawnRuntime(
      {
        model: 'sonnet',
        providerId: 'null',
        modelId: 'claude-sonnet-official',
      },
      'leader-model',
    )

    expect(runtime.model).toBe('claude-sonnet-official')
    expect(runtime.runtime).toEqual({
      providerId: null,
      modelId: 'claude-sonnet-official',
    })
  })

  test('rejects exact model IDs without an explicit provider', async () => {
    await expect(
      resolveTeammateSpawnRuntime(
        {
          model: 'sonnet',
          modelId: 'openai/gpt-5.4',
        },
        'leader-model',
      ),
    ).rejects.toThrow('provider_id is required when model_id is provided')
  })

  test('keeps legacy model behavior when no runtime fields are present', async () => {
    const runtime = await resolveTeammateSpawnRuntime(
      { model: 'inherit' },
      'leader-model',
    )

    expect(runtime.model).toBe('leader-model')
    expect(runtime.runtime).toBeUndefined()
  })
})

describe('resolveTeammateModel', () => {
  test('resolves inherit to the leader model', () => {
    expect(resolveTeammateModel('inherit', 'leader-model')).toBe('leader-model')
  })
})
