import type { Command } from '../../types/command.js'
import { unsupportedFeature } from '../../utils/unsupportedFeature.js'

/** Workflow scripts are excluded from this build. */
export function getWorkflowCommands(_cwd: string): Promise<Command[]> {
  return unsupportedFeature('workflow-scripts')
}
