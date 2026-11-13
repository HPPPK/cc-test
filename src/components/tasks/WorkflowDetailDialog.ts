import type { ReactNode } from 'react'
import type { DeepImmutable } from '../../types/utils.js'
import type { LocalWorkflowTaskState } from '../../tasks/LocalWorkflowTask/LocalWorkflowTask.js'
import { unsupportedFeature } from '../../utils/unsupportedFeature.js'

export function WorkflowDetailDialog(_props: {
  workflow: DeepImmutable<LocalWorkflowTaskState>
  onDone(): void
  onKill?: () => void
  onSkipAgent?: (agentId: string) => void
  onRetryAgent?: (agentId: string) => void
  onBack(): void
}): ReactNode { return unsupportedFeature('workflow-details') }
