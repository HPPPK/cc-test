import { afterEach, describe, expect, test } from 'bun:test'
import { getPrompt, SUBAGENT_DELEGATION_PROTOCOL } from './prompt.js'

const originalApiKey = process.env.ANTHROPIC_API_KEY

afterEach(() => {
  if (originalApiKey === undefined) {
    delete process.env.ANTHROPIC_API_KEY
  } else {
    process.env.ANTHROPIC_API_KEY = originalApiKey
  }
})

describe('Agent tool prompt', () => {
  test('provides delegation context without imposing a rigid brief schema', () => {
    for (const field of [
      'goal',
      'useful known facts',
      'scope',
      'boundaries',
      'expected deliverable',
      'required verification',
      'instead of forcing a fixed schema',
    ]) {
      expect(SUBAGENT_DELEGATION_PROTOCOL).toContain(field)
    }
  })

  test('keeps ordinary handoffs flexible while making file-first Expert handoffs Markdown-only', () => {
    expect(SUBAGENT_DELEGATION_PROTOCOL).toContain('For ordinary subagents')
    expect(SUBAGENT_DELEGATION_PROTOCOL).toContain('natural language')
    expect(SUBAGENT_DELEGATION_PROTOCOL).toContain('Do not require exact labels')
    expect(SUBAGENT_DELEGATION_PROTOCOL).toContain('### File-first Expert handoff exception')
    expect(SUBAGENT_DELEGATION_PROTOCOL).toContain('complete research, review, evidence, limitation, and next-step detail belongs only in that declared Markdown')
    expect(SUBAGENT_DELEGATION_PROTOCOL).toContain('must not repeat findings, URLs, reasoning, limitations, or review prose')
    expect(SUBAGENT_DELEGATION_PROTOCOL).toContain('actual tool receipts')
    expect(SUBAGENT_DELEGATION_PROTOCOL).not.toContain('### Result Report')
    expect(SUBAGENT_DELEGATION_PROTOCOL).not.toContain('completion_confidence')
  })

  test('keeps only safety and evidence behavior boundaries for subagents', () => {
    for (const rule of [
      'Research-only tasks must not modify files',
      'Do not claim verified facts without evidence',
      'git commit/push/reset/rebase',
      'delete user data',
      'destructive commands',
      'protected files',
      'AGENTS.md instructions',
    ]) {
      expect(SUBAGENT_DELEGATION_PROTOCOL).toContain(rule)
    }
  })

  test('injects the delegation protocol once into agent prompts', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-key'

    const prompt = await getPrompt([], false)

    expect(prompt).toContain('## Subagent delegation guidance')
    expect(prompt.match(/## Subagent delegation guidance/g)).toHaveLength(1)
    expect(prompt).toContain('### Handoff guidance')
    expect(prompt).not.toContain('### Result Report')
  })

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
