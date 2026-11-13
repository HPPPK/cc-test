import { describe, expect, test } from 'bun:test'
import { createQueuedCommandPreview } from './PromptInputQueuedCommands.js'

describe('queued command preview provenance', () => {
  test('preserves channel and runtime provenance independently of visibility', () => {
    expect(createQueuedCommandPreview({ mode: 'prompt', value: 'channel payload', messageKind: 'internal_notification', isMeta: true } as any)).toMatchObject({ messageKind: 'internal_notification', isMeta: true })
  })

  test('keeps genuine human bash input and its formatted display', () => {
    expect(createQueuedCommandPreview({ mode: 'bash', value: 'echo fixture', messageKind: 'user_input' } as any)).toMatchObject({ messageKind: 'user_input', message: { content: '<bash-input>echo fixture</bash-input>' } })
  })

  test('classifies strong legacy task notification mode without text inference', () => {
    expect(createQueuedCommandPreview({ mode: 'task-notification', value: 'hello' } as any)).toMatchObject({ messageKind: 'internal_notification' })
    expect(createQueuedCommandPreview({ mode: 'prompt', value: 'Task completed: human quotation' } as any)).toMatchObject({ messageKind: 'user_input' })
  })
})
