import type { ReactNode } from 'react'
import type { DeepImmutable } from '../../types/utils.js'
import type { MonitorMcpTaskState } from '../../tasks/MonitorMcpTask/MonitorMcpTask.js'
import { unsupportedFeature } from '../../utils/unsupportedFeature.js'

export function MonitorMcpDetailDialog(_props: {
  task: DeepImmutable<MonitorMcpTaskState>
  onKill?: () => void
  onBack(): void
}): ReactNode { return unsupportedFeature('monitor-details') }
