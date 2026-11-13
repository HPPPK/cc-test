import type { CustomAgentDefinition } from '../../../tools/AgentTool/loadAgentsDir.js'
import type { SettingSource } from '../../../utils/settings/constants.js'
import type { generateAgent } from '../generateAgent.js'

/** Partial form state starts empty and is populated by the wizard steps. */
export type AgentWizardData = {
  location?: SettingSource
  agentType?: string
  systemPrompt?: string
  whenToUse?: string
  method?: 'generate' | 'manual'
  selectedMemory?: import('../../../tools/AgentTool/agentMemory.js').AgentMemoryScope
  selectedTools?: string[]
  selectedColor?: import('../../../tools/AgentTool/agentColorManager.js').AgentColorName
  selectedModel?: string
  finalAgent?: CustomAgentDefinition
  generationPrompt?: string
  generatedAgent?: Awaited<ReturnType<typeof generateAgent>>
  wasGenerated?: boolean
  isGenerating?: boolean
}
