import { feature } from 'bun:bundle'
import type { ToolPermissionContext } from '../../Tool.js'

/** Tool discovery and execution must use the same inherited permission mode. */
export function resolveAgentToolPermissionContext(parent: ToolPermissionContext, agentMode?: ToolPermissionContext['mode']): ToolPermissionContext {
  if (!agentMode || parent.mode === 'bypassPermissions' || parent.mode === 'acceptEdits'
    || (feature('TRANSCRIPT_CLASSIFIER') && parent.mode === 'auto')) return parent
  return { ...parent, mode: agentMode }
}
