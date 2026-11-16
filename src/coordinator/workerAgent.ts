import type { AgentDefinition } from '../tools/AgentTool/loadAgentsDir.js'
import { unsupportedFeature } from '../utils/unsupportedFeature.js'
export function getCoordinatorAgents(): AgentDefinition[] { return unsupportedFeature('coordinator') }
