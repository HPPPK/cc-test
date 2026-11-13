import type { TaskStateBase } from '../../Task.js'
import type { ToolUseContext } from '../../Tool.js'
import { unsupportedFeature } from '../../utils/unsupportedFeature.js'

/** Shape consumed by the existing task list; no monitor implementation is bundled. */
export type MonitorMcpTaskState = TaskStateBase & { type: 'monitor_mcp' }
export function killMonitorMcp(_taskId: string, _setState: ToolUseContext['setAppState']): void { unsupportedFeature('mcp-monitor') }
export function killMonitorMcpTasksForAgent(_agentId: string, _getState: ToolUseContext['getAppState'], _setState: ToolUseContext['setAppState']): void { unsupportedFeature('mcp-monitor') }
