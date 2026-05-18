import { describe, expect, test } from 'bun:test'
import { runWithRuntimeEnv } from '../runtimeEnv.js'
import { getAgentModel } from './agent.js'
import { parseUserSpecifiedModel } from './model.js'

describe('getAgentModel', () => {
  test('honors runtime env masking of inherited subagent model overrides', () => {
    const originalSubagentModel = process.env.CLAUDE_CODE_SUBAGENT_MODEL
    process.env.CLAUDE_CODE_SUBAGENT_MODEL = 'haiku'

    try {
      runWithRuntimeEnv({ CLAUDE_CODE_SUBAGENT_MODEL: undefined }, () => {
        expect(
          getAgentModel(undefined, 'leader-model', 'sonnet', 'default'),
        ).toBe(parseUserSpecifiedModel('sonnet'))
      })
    } finally {
      if (originalSubagentModel === undefined) {
        delete process.env.CLAUDE_CODE_SUBAGENT_MODEL
      } else {
        process.env.CLAUDE_CODE_SUBAGENT_MODEL = originalSubagentModel
      }
    }
  })
})
