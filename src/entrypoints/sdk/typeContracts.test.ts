import { describe, expect, test } from 'bun:test'
import { SDKControlRequestSchema } from './controlSchemas.js'
import { SDKUserMessageSchema, SDKTaskNotificationMessageSchema } from './coreSchemas.js'
import { generateSdkTypes } from '../../../scripts/generate-sdk-types.js'

describe('SDK type contract source', () => {
  test('schema regeneration is current', async () => {
    expect(await generateSdkTypes(true)).toBe(true)
  })
  test('control request discriminants validate the compile-time fixture', () => {
    expect(SDKControlRequestSchema().safeParse({ type: 'control_request', request_id: 'r', request: { subtype: 'set_model', model: 'local' } }).success).toBe(true)
    expect(SDKControlRequestSchema().safeParse({ type: 'control_request', request_id: 'r', request: { subtype: 'invented' } }).success).toBe(false)
    expect(SDKControlRequestSchema().safeParse({ type: 'control_request', request_id: 'r', request: { subtype: 'set_model', model: 42 } }).success).toBe(false)
  })
  test('external API payload placeholders preserve the schema envelope metadata', () => {
    const input = { type: 'user', message: { role: 'user', content: 'hello' }, parent_tool_use_id: null, messageKind: 'user_input', isSynthetic: false } as const
    expect(SDKUserMessageSchema().parse(input)).toEqual(input)
  })
})

describe('current CLI control handlers', () => {
  const requests = [
    { subtype: 'end_session', reason: 'user' },
    { subtype: 'channel_enable', serverName: 'example' },
    { subtype: 'mcp_authenticate', serverName: 'example' },
    { subtype: 'mcp_oauth_callback_url', serverName: 'example', callbackUrl: 'http://localhost/?code=example' },
    { subtype: 'claude_authenticate', loginWithClaudeAi: true },
    { subtype: 'claude_oauth_callback', authorizationCode: 'code', state: 'state' },
    { subtype: 'claude_oauth_wait_for_completion' },
    { subtype: 'mcp_clear_auth', serverName: 'example' },
    { subtype: 'generate_session_title', description: 'example', persist: true },
    { subtype: 'side_question', question: 'example' },
    { subtype: 'remote_control', enabled: true },
    { subtype: 'set_proactive', enabled: true },
  ]
  test.each(requests)('accepts implemented $subtype handler payload', request => {
    expect(SDKControlRequestSchema().safeParse({ type: 'control_request', request_id: 'r', request }).success).toBe(true)
  })
  test('rejects invalid fields on recovered controls', () => {
    for (const request of [
      { subtype: 'mcp_authenticate', serverName: 123 },
      { subtype: 'claude_oauth_callback', authorizationCode: 123, state: 'state' },
      { subtype: 'remote_control', enabled: 'yes' },
    ]) expect(SDKControlRequestSchema().safeParse({ type: 'control_request', request_id: 'r', request }).success).toBe(false)
  })
})

test('task notifications retain worktree output and accept older wire messages', () => {
  const task = { type: 'system', subtype: 'task_notification', task_id: 't', status: 'completed', output_file: 'out', summary: 'done', uuid: 'u', session_id: 's' }
  expect(SDKTaskNotificationMessageSchema().parse({ ...task, worktree_path: '/worktree', worktree_branch: 'feature' })).toMatchObject({ worktree_path: '/worktree', worktree_branch: 'feature' })
  expect(SDKTaskNotificationMessageSchema().safeParse(task).success).toBe(true)
})
