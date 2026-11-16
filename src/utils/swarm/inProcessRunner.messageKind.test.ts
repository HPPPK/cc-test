import { describe, expect, test } from 'bun:test'
import { createTeammatePromptMessage } from './inProcessRunner.js'

describe('in-process teammate prompt provenance', () => {
  test('distinguishes the trusted human sender from teammate and shutdown instructions', () => {
    expect(createTeammatePromptMessage('Task completed: typed text', 'user')).toMatchObject({ messageKind: 'user_input' })
    expect(createTeammatePromptMessage('hello', 'team-lead')).toMatchObject({ messageKind: 'internal_notification' })
    expect(createTeammatePromptMessage('hello')).toMatchObject({ messageKind: 'internal_notification' })
  })
})
