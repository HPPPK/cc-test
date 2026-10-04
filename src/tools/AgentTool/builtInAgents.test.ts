import { afterEach, describe, expect, test } from 'bun:test'
import {
  setIsInteractive,
} from '../../bootstrap/state.js'
import {
  areExplorePlanAgentsEnabled,
  getBuiltInAgents,
} from './builtInAgents.js'

const originalDisableBuiltIns =
  process.env.CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS
const originalEntrypoint = process.env.CLAUDE_CODE_ENTRYPOINT

afterEach(() => {
  if (originalDisableBuiltIns === undefined) {
    delete process.env.CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS
  } else {
    process.env.CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS =
      originalDisableBuiltIns
  }

  if (originalEntrypoint === undefined) {
    delete process.env.CLAUDE_CODE_ENTRYPOINT
  } else {
    process.env.CLAUDE_CODE_ENTRYPOINT = originalEntrypoint
  }

  setIsInteractive(false)
})

describe('built-in agents', () => {
  test('enables public built-in agents in external builds', () => {
    setIsInteractive(true)

    expect(areExplorePlanAgentsEnabled()).toBe(true)

    const agentTypes = getBuiltInAgents().map(agent => agent.agentType)

    expect(agentTypes).toContain('Explore')
    expect(agentTypes).toContain('Plan')
    expect(agentTypes).toContain('verification')
  })

  test('preserves SDK opt-out in noninteractive sessions', () => {
    setIsInteractive(false)
    process.env.CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS = 'true'

    expect(getBuiltInAgents()).toEqual([])
  })
})


test('includes the file-first Expert evidence research role without a subagent question tool', () => {
  const agent = getBuiltInAgents().find((candidate) => candidate.agentType === 'expert-evidence-researcher')
  expect(agent?.tools).toEqual(['Playwright', 'Read', 'Write'])
  const prompt = agent?.getSystemPrompt() ?? ''
  expect(prompt).toContain('real Playwright actions with a non-empty actions array')
  expect(prompt).toContain('A search page is only for discovery')
  expect(prompt).toContain('page-level failure')
  expect(prompt).toContain('full company core catalog is collectively distributed across the three researchers')
  expect(prompt).toContain('automatic Required route: yes contract')
  expect(prompt).toContain('human-verification handoff')
  expect(prompt).toContain('do not bypass it')
  expect(prompt).toContain('or call AskUserQuestion')
  expect(prompt).toContain('full evidence ledger')
  expect(prompt).toContain('runtime derives its internal artifact type')
  expect(prompt).not.toContain('research_artifact:')
  expect(prompt).toContain('final assistant response must be exactly one short line')
  expect(prompt).toContain('Do not repeat any finding, evidence, URL, report text')
  expect(prompt).toContain('Do not write, guess, or repeat runtime-internal browser audit IDs')
  expect(prompt).not.toContain('CC_RESEARCH_AUDIT_ASSERTIONS')
})

test('includes the file-first Expert evidence review role', () => {
  const agent = getBuiltInAgents().find((candidate) => candidate.agentType === 'expert-evidence-reviewer')
  expect(agent?.tools).toEqual(['Read', 'Write'])
  const prompt = agent?.getSystemPrompt() ?? ''
  expect(prompt).toContain('runtime derives its internal artifact type')
  expect(prompt).not.toContain('research_artifact:')
  expect(prompt).toContain('final assistant response must be exactly one short line')
  expect(prompt).toContain('Do not repeat any finding, evidence, URL, report text')
  expect(prompt).toContain('N keyword snapshots')
  expect(prompt).toContain('direct-competitor price gap')
  expect(prompt).toContain('actual [engine=...]')  expect(prompt).toContain('candidate only')
  expect(prompt).toContain('fixed platform list or extra browsing')

})

test('includes the file-first report-field absorption role without browsing or user-question tools', () => {
  const agent = getBuiltInAgents().find((candidate) => candidate.agentType === 'expert-evidence-absorber')
  expect(agent?.tools).toEqual(['Read', 'Write'])
  const prompt = agent?.getSystemPrompt() ?? ''
  expect(prompt).toContain('report-evidence absorption worker')
  expect(prompt).toContain('Organize the Markdown by the report chapters or field families')
  expect(prompt).toContain('Preserve every reviewer item marked include, merge, or partially_verified')
  expect(prompt).toContain('AI推断')
  expect(prompt).toContain('final assistant response must be exactly one short line')
  expect(prompt).toContain('Do not repeat any finding, evidence, URL, report text')
  expect(prompt).toContain('do not browse')
  expect(prompt).toContain('Use only Read and Write')
})


test('includes the constrained rendered-output completeness reviewer', () => {
  const agent = getBuiltInAgents().find((candidate) => candidate.agentType === 'expert-evidence-output-reviewer')
  expect(agent?.tools).toEqual(['Read', 'Write'])
  const prompt = agent?.getSystemPrompt() ?? ''
  expect(prompt).toContain('final report completeness reviewer')
  expect(prompt).toContain('MUST_PATCH')
  expect(prompt).toContain('finalize the reviewed draft unchanged')
  expect(prompt).toContain('do not browse')
  expect(prompt).toContain('final assistant response must be exactly one short line')
  expect(prompt).toContain('Do not repeat any finding, evidence, URL, report text')  expect(prompt).toContain('REPORT_SCOPE, DATA_DECLARATION, EVIDENCE_STATUS_SUMMARY')
  expect(prompt).toContain('HTML source table')
  expect(prompt).toContain('do not demand fixed-platform browsing, source-count padding, or a user question')

})
