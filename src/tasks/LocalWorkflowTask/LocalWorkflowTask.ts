import type { TaskStateBase, SetAppState } from '../../Task.js'
import { unsupportedFeature } from '../../utils/unsupportedFeature.js'

/** Only persisted/displayed fields observed by the task list are described here. */
export type LocalWorkflowTaskState = TaskStateBase & {
  type: 'local_workflow'
  workflowName?: string
  summary?: string
  agentCount: number
}
export function killWorkflowTask(_taskId: string, _setState: SetAppState): Promise<void> { return unsupportedFeature('workflow-scripts') }
export function skipWorkflowAgent(_taskId: string, _agentId: string, _setState: SetAppState): void { unsupportedFeature('workflow-scripts') }
export function retryWorkflowAgent(_taskId: string, _agentId: string, _setState: SetAppState): void { unsupportedFeature('workflow-scripts') }
export const LocalWorkflowTask = { name: 'Workflow', type: 'local_workflow' as const, kill: killWorkflowTask }
