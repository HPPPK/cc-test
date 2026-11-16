import promptText from '../utils/ultraplan/prompt.txt'
import { expect, test } from 'bun:test'
import command, { buildUltraplanPrompt } from './ultraplan.js'

test('external ultraplan remains disabled and preserves bundled prompt composition', () => {
  expect(command.isEnabled()).toBe(false)
  const prompt = buildUltraplanPrompt('Fixture planning request', 'Fixture draft')
  expect(prompt).toContain('Fixture planning request')
  expect(prompt).toContain('Fixture draft')
  expect(prompt).toContain(promptText.trimEnd())
})
