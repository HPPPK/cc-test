import type { WorkflowSessionState } from '../../server/services/workflowTypes.js'
import { getJiangxiaEnvValue } from '../../utils/appIdentity.js'
import { logForDebugging } from '../../utils/debug.js'
import { errorMessage } from '../../utils/errors.js'

export type DesktopWorkflowContext = {
  serverUrl: string
  sessionId: string
}

export type WorkflowRuntimeStateResolution =
  | { source: 'desktop'; state: WorkflowSessionState }
  | { source: 'local'; state: WorkflowSessionState | undefined }
  | { source: 'desktop-unavailable'; reason: string }

export function getDesktopWorkflowContext(): DesktopWorkflowContext | null {
  const serverUrl = getJiangxiaEnvValue('DESKTOP_SERVER_URL')?.trim()
  const sessionId = getJiangxiaEnvValue('WORKFLOW_SESSION_ID')?.trim()
  return serverUrl && sessionId
    ? { serverUrl: serverUrl.replace(/\/+$/, ''), sessionId }
    : null
}

export function isWorkflowSessionState(value: unknown): value is WorkflowSessionState {
  // Tool tests and legacy CLI recovery can hold a partial workflow snapshot.
  // `mode: workflow` is enough to pass that local state to the established
  // policy helpers; the Desktop response still has to be a real workflow
  // record before it becomes authoritative.
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && (value as Record<string, unknown>).mode === 'workflow')
}

/**
 * The Desktop state is the authority for a live workflow. A long-lived CLI
 * deliberately keeps its conversation across phases, so its in-memory state
 * may describe the previous phase after a Desktop transition succeeds.
 */
export async function resolveWorkflowRuntimeState(
  localWorkflow: unknown,
): Promise<WorkflowRuntimeStateResolution> {
  const desktop = getDesktopWorkflowContext()
  if (!desktop) {
    return {
      source: 'local',
      state: isWorkflowSessionState(localWorkflow) ? localWorkflow : undefined,
    }
  }

  try {
    const response = await fetch(
      `${desktop.serverUrl}/api/sessions/${encodeURIComponent(desktop.sessionId)}/workflow`,
    )
    if (!response.ok) {
      return {
        source: 'desktop-unavailable',
        reason: `Desktop returned HTTP ${response.status} while loading the current workflow state.`,
      }
    }
    const payload: unknown = await response.json()
    const state = payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>).state
      : undefined
    if (!isWorkflowSessionState(state)) {
      return {
        source: 'desktop-unavailable',
        reason: 'Desktop returned no valid workflow state.',
      }
    }
    return { source: 'desktop', state }
  } catch (error) {
    const reason = `Unable to refresh the current Desktop workflow state: ${errorMessage(error)}`
    logForDebugging(reason)
    return { source: 'desktop-unavailable', reason }
  }
}
