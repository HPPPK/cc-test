import { expect, test } from 'vitest'
import { parseRunOutput } from './parseRunOutput'

test('legacy run output excludes explicitly internal assistant prose and retains real replies', () => {
  const output = [
    { type: 'assistant', messageKind: 'internal_notification', message: { content: [{ type: 'text', text: 'private control instruction' }] } },
    { type: 'assistant', messageKind: 'assistant_response', message: { content: [{ type: 'text', text: 'User-facing result' }] } },
    { type: 'assistant', message: { content: [{ type: 'text', text: 'Legacy reply' }] } },
  ].map(entry => JSON.stringify(entry)).join('\n')
  expect(parseRunOutput(output)).toBe('User-facing result\n\nLegacy reply')
})
