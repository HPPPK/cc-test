import type { AgentWizardData } from './types.js'
const initial: AgentWizardData = {}
const partial: AgentWizardData = { selectedTools: ['Read'], agentType: 'reader', location: 'userSettings', wasGenerated: false }
// @ts-expect-error tools are tool names, not a truthy enabled flag
const invalid: AgentWizardData = { selectedTools: true }
void [initial, partial, invalid]
