import type { AgentWizardData } from './types.js'

type ColorStage = AgentWizardData & Required<Pick<AgentWizardData, 'agentType' | 'whenToUse' | 'systemPrompt' | 'location'>>
export function assertAgentColorStage(data: AgentWizardData): asserts data is ColorStage {
  if (data.agentType === undefined || data.whenToUse === undefined || data.systemPrompt === undefined || data.location === undefined) {
    throw new Error('Agent creation details must be completed before selecting a color.')
  }
}
type ConfirmStage = AgentWizardData & Required<Pick<AgentWizardData, 'finalAgent' | 'location'>>
export function assertAgentConfirmStage(data: AgentWizardData): asserts data is ConfirmStage {
  if (!data.finalAgent || data.location === undefined) throw new Error('Agent creation must produce an agent and save location before confirmation.')
}
