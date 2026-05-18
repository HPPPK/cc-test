import { describe, expect, test } from 'bun:test'
import { TEAMMATE_SYSTEM_PROMPT_ADDENDUM } from './teammatePromptAddendum.js'

describe('teammate prompt addendum', () => {
  test('forces teammate communication instructions through SendMessage', () => {
    expect(TEAMMATE_SYSTEM_PROMPT_ADDENDUM).toContain(
      'call SendMessage as your first visible action',
    )
    expect(TEAMMATE_SYSTEM_PROMPT_ADDENDUM).toContain(
      'Do not stop after a private textual reply',
    )
    expect(TEAMMATE_SYSTEM_PROMPT_ADDENDUM).toContain(
      'reply with SendMessage to that teammate',
    )
  })
})
