import { describe, expect, test } from 'bun:test'

import {
  getConfiguredOrBuiltInModelContextWindow,
  MODEL_CONTEXT_WINDOWS_ENV_KEY,
} from './modelContextWindows.js'
import { runWithRuntimeEnv } from '../runtimeEnv.js'

describe('modelContextWindows', () => {
  test.each(['MiniMax-M3', 'MiniMax-M2.7', 'claude-sonnet-4-6', 'anthropic/claude-haiku-4.5:thinking', 'glm-4.5-air', 'kimi-k2.6', 'custom/unknown-model'])('uses the application 1M default for %s without an explicit override', model => {
    expect(runWithRuntimeEnv({ [MODEL_CONTEXT_WINDOWS_ENV_KEY]: '' }, () => getConfiguredOrBuiltInModelContextWindow(model))).toBe(1_000_000)
  })

  test.each([204_800, 500_000])('explicit runtime window %i still overrides the application default', window => {
    const result = runWithRuntimeEnv(
      {
        [MODEL_CONTEXT_WINDOWS_ENV_KEY]: JSON.stringify({
          'MiniMax-M3': window,
        }),
      },
      () => getConfiguredOrBuiltInModelContextWindow('MiniMax-M3'),
    )

    expect(result).toBe(window)
  })
})
