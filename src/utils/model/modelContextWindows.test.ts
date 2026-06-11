import { describe, expect, test } from 'bun:test'

import {
  getConfiguredOrBuiltInModelContextWindow,
  MODEL_CONTEXT_WINDOWS_ENV_KEY,
} from './modelContextWindows.js'
import { runWithRuntimeEnv } from '../runtimeEnv.js'

describe('modelContextWindows', () => {
  test('recognizes MiniMax-M3 as a built-in 1M context model', () => {
    expect(getConfiguredOrBuiltInModelContextWindow('MiniMax-M3')).toBe(
      1_000_000,
    )
  })

  test('runtime env model windows still override built-in defaults', () => {
    const result = runWithRuntimeEnv(
      {
        [MODEL_CONTEXT_WINDOWS_ENV_KEY]: JSON.stringify({
          'MiniMax-M3': 500_000,
        }),
      },
      () => getConfiguredOrBuiltInModelContextWindow('MiniMax-M3'),
    )

    expect(result).toBe(500_000)
  })
})
