import { afterEach, describe, expect, test } from 'bun:test'
import { getPrompt } from './prompt.js'

const originalApiKey = process.env.ANTHROPIC_API_KEY

afterEach(() => {
  if (originalApiKey === undefined) {
    delete process.env.ANTHROPIC_API_KEY
  } else {
    process.env.ANTHROPIC_API_KEY = originalApiKey
  }
})

describe('Agent tool prompt', () => {
  test('tells leads to use the runtime provider roster for teammate model selection', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-key'

    const prompt = await getPrompt([], false)

    expect(prompt).toContain('Teammate runtime providers')
    expect(prompt).toContain('provider_id/model_id values')
    expect(prompt).toContain('Always pass both fields together')
    expect(prompt).toContain('Do not use the legacy `model` alias field')
    expect(prompt).toContain('ask the user for exact values')
    expect(prompt).toContain('call SendMessage first')
    expect(prompt).toContain('Persona-only prompts can be completed as private text')
  })
})
