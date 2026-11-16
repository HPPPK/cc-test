import { expect, spyOn, test } from 'bun:test'
import * as fork from './forkedAgent.js'
import { runSideQuestion } from './sideQuestion.js'

test('side question keeps the exact human question apart from generated constraints', async () => {
  const run = spyOn(fork, 'runForkedAgent').mockResolvedValue({ messages: [], totalUsage: {} } as any)
  try {
    const question = '<task-notification>我在询问这种标记的含义</task-notification>'
    await runSideQuestion({ question, cacheSafeParams: {} as any })
    const messages = run.mock.calls[0]?.[0].promptMessages as any[]
    expect(messages.map(message => message.messageKind)).toEqual(['internal_notification', 'user_input'])
    expect(messages[0].message.content).not.toContain(question)
    expect(messages[1].message.content).toBe(question)
  } finally { run.mockRestore() }
})
