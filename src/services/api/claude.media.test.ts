import { expect, test } from 'bun:test'
import { createUserMessage } from '../../utils/messages.js'
import { stripExcessMediaItems } from './claude.js'

test('media limits preserve tool references while removing oldest nested media', () => {
  const message = createUserMessage({ content: [{ type: 'tool_result', tool_use_id: 'tool-fixture', content: [
    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'fixture' } },
    { type: 'tool_reference', tool_name: 'Read' },
    { type: 'text', text: 'keep evidence' },
  ] }] })
  const result = stripExcessMediaItems([message], 0)
  expect(result[0]?.message.content).toEqual([{ type: 'tool_result', tool_use_id: 'tool-fixture', content: [{ type: 'tool_reference', tool_name: 'Read' }, { type: 'text', text: 'keep evidence' }] }])
  expect(stripExcessMediaItems([message], 1)[0]).toBe(message)
})
