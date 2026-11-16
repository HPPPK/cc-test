import { expect, test } from 'bun:test'
import { assertAgentColorStage, assertAgentConfirmStage } from './stageContracts.js'
import type { AgentWizardData } from './types.js'

test('color stage requires completed agent details without inventing defaults', () => {
  expect(() => assertAgentColorStage({})).toThrow('details must be completed')
  const data: AgentWizardData = { agentType: 'reader', whenToUse: 'Read', systemPrompt: 'Read carefully', location: 'userSettings' }
  assertAgentColorStage(data)
  expect(data.agentType).toBe('reader')
  expect(data.systemPrompt).toBe('Read carefully')
})
test('confirmation requires an actual custom agent and save location', () => {
  expect(() => assertAgentConfirmStage({ location: 'userSettings' })).toThrow('produce an agent')
  const agent = { agentType: 'reader', whenToUse: 'Read', getSystemPrompt: () => 'Read carefully', source: 'userSettings' as const }
  const data: AgentWizardData = { finalAgent: agent, location: 'userSettings' }
  assertAgentConfirmStage(data)
  expect(data.finalAgent).toBe(agent)
  expect(data.finalAgent.getSystemPrompt()).toBe('Read carefully')
})
