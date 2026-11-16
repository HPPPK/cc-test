import { describe, expect, test } from 'bun:test'
import type { UserMessage } from './message.js'
import type { MCPProgress } from './tools.js'
import { attachMessageKind, resolveMessageKind } from '../utils/messageKind.js'

const legacyUser = {
  type: 'user', uuid: '00000000-0000-0000-0000-000000000000', timestamp: '2026-01-01T00:00:00Z',
  message: { role: 'user', content: 'A persisted legacy prompt' },
} satisfies UserMessage

describe('message envelope contract', () => {
  test('legacy metadata remains optional and upgrades additively', () => {
    const upgraded = attachMessageKind(legacyUser)
    expect(upgraded.messageKind).toBe('user_input')
    expect(upgraded.message).toBe(legacyUser.message)
    expect('messageKind' in legacyUser).toBe(false)
  })

  test('user transport does not imply human authorship', () => {
    const generated: UserMessage = { ...legacyUser, origin: { kind: 'channel', server: 'fixture' } }
    expect(resolveMessageKind(generated)).toBe('internal_notification')
    expect(resolveMessageKind({ ...generated, messageKind: 'user_input' })).toBe('user_input')
  })

  test('opaque tool result data survives without provider payload pollution', () => {
    const opaque = { custom: ['result'] }
    const result: UserMessage = { ...legacyUser, toolUseResult: opaque }
    const upgraded = attachMessageKind(result)
    expect(upgraded.messageKind).toBe('tool_exchange')
    expect(upgraded.toolUseResult).toBe(opaque)
    expect('messageKind' in upgraded.message).toBe(false)
  })

  test('progress payload narrows by concrete status', () => {
    const progress: MCPProgress = { type: 'mcp_progress', serverName: 'fixture', toolName: 'read', status: 'progress', progress: 2, total: 5 }
    expect(progress.progress / progress.total!).toBe(0.4)
  })
})
