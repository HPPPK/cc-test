import { expect, test } from 'bun:test'
import { normalizeQuestionForDisplay } from './normalizeQuestion.js'

test('canonical prompt and choices feed the legacy display keys without mutating input', () => {
  const source = { prompt: 'Canonical prompt', choices: [{ label: 'A' }, { label: 'B' }] }
  expect(normalizeQuestionForDisplay(source)).toMatchObject({ question: 'Canonical prompt', options: source.choices })
  expect(source).not.toHaveProperty('question')
  expect(normalizeQuestionForDisplay({ question: 'Old prompt', options: source.choices }).question).toBe('Old prompt')
})

test('missing display payload fails explicitly instead of addressing undefined state keys', () => {
  expect(() => normalizeQuestionForDisplay({})).toThrow('Question requires')
})
