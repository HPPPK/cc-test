import { expect, test } from 'bun:test'
import { processProgressMessages } from './UI.js'
import { createAssistantMessage, createUserMessage, createProgressMessage } from '../../utils/messages.js'
import type { AgentId } from '../../types/ids.js'
import type { AgentToolProgress } from '../../types/tools.js'

// UI must ignore nested tool-result/user envelopes while retaining the worker's reply.
test('external progress display keeps agent responses and excludes user/tool results', () => {
  const progress = (message: AgentToolProgress['message']) => createProgressMessage<AgentToolProgress>({
    toolUseID: 'worker', parentToolUseID: 'parent',
    data: { type: 'agent_progress', agentId: 'worker' as AgentId, prompt: 'inspect', message },
  })
  const response = progress(createAssistantMessage({ content: [{ type: 'text', text: 'completed', citations: null }] }))
  const input = progress({ ...createUserMessage({ content: 'input' }), message: { role: 'user', content: [{ type: 'text', text: 'input' }] } })
  expect(processProgressMessages([input, response], [], false)).toEqual([{ type: 'original', message: response }])
})
