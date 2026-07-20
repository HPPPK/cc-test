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
  test('defines required Delegation Brief fields for leader prompts', () => {
    for (const field of [
      'task_id',
      'mission',
      'scope_included',
      'scope_excluded / must_not_do',
      'allowed_actions',
      'forbidden_actions',
      'expected_deliverables',
      'success_criteria',
      'verification_required',
      'stop_and_ask_if',
      'do_not_claim_done_until',
    ]) {
      expect(SUBAGENT_DELEGATION_PROTOCOL).toContain(field)
    }
  })

  test('defines required Result Report fields for subagent returns', () => {
    for (const field of [
      'status: completed | blocked | partial | failed',
      'changes_made',
      'verification',
      'evidence',
      'risks_or_followups',
      'leader_next_action',
      'completion_confidence',
      'did_not_do',
      'blockers',
    ]) {
      expect(SUBAGENT_DELEGATION_PROTOCOL).toContain(field)
    }
  })

  test('constrains subagent behavior around scope, verification, and unsafe actions', () => {
    for (const rule of [
      'Research-only tasks must not modify files',
      'must not claim done/completed',
      'Unverified work must not be reported as completed',
      'blocked, partial, and failed reports must include blockers',
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

    expect(prompt).toContain('## Subagent delegation protocol')
    expect(prompt.match(/## Subagent delegation protocol/g)).toHaveLength(1)
    expect(prompt).toContain('### Delegation Brief (leader → subagent)')
    expect(prompt).toContain('### Result Report (subagent → leader)')
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
