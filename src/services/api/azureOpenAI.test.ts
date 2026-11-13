import * as toolApi from '../../utils/api.js'
import { getEmptyToolPermissionContext } from '../../Tool.js'
import { toolNameFixture } from '../../tools/toolFixtures.test.js'
import { expect, spyOn, test } from 'bun:test'
import type { AttachmentMessage } from '../../types/message.js'
import { createAssistantMessage, createSystemMessage, createUserMessage } from '../../utils/messages.js'
import { buildAzureOpenAIInput, buildAzureOpenAITools, parseAzureOpenAIResponse } from './azureOpenAI.js'

test('Azure input accepts actual conversation messages and skips non-conversation envelopes', () => {
  const attachment: AttachmentMessage = { type: 'attachment', uuid: crypto.randomUUID(), timestamp: new Date().toISOString(), attachment: { type: 'hook_stopped_continuation', message: 'stopped', hookName: 'fixture', toolUseID: 'tool-fixture', hookEvent: 'Stop' } }
  expect(buildAzureOpenAIInput([
    createSystemMessage('internal metadata', 'info'),
    attachment,
    createUserMessage({ content: 'Question' }),
    createAssistantMessage({ content: 'Answer' }),
  ])).toEqual([{ role: 'user', content: 'Question' }, { role: 'assistant', content: 'Answer' }])
})

test('Azure text and function responses retain complete Anthropic block contracts', () => {
  expect(parseAzureOpenAIResponse({ output_text: 'Answer' }).content).toEqual([{ type: 'text', text: 'Answer', citations: null }])
  const result = parseAzureOpenAIResponse({ output: [{ type: 'function_call', call_id: 'call-fixture', name: 'Read', arguments: '{"file":"report.md"}' }] })
  expect(result.content).toEqual([{ type: 'tool_use', caller: { type: 'direct' }, id: 'call-fixture', name: 'Read', input: { file: 'report.md' } }])
  expect(result.stopReason).toBe('tool_use')
  expect(result.usage.server_tool_use).toEqual({ web_search_requests: 0, web_fetch_requests: 0 })
})


test('Azure rejects native Anthropic tool schemas instead of sending an undefined function name', async () => {
  const schema = spyOn(toolApi, 'toolToAPISchema').mockResolvedValue({ type: 'bash_20250124', name: 'bash' })
  try {
    await expect(buildAzureOpenAITools({ tools: [toolNameFixture('Fixture')], getToolPermissionContext: async () => getEmptyToolPermissionContext(), agents: [] })).rejects.toThrow('Azure OpenAI supports custom function tool schemas only.')
  } finally { schema.mockRestore() }
})
