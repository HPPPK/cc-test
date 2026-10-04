import type { WorkflowSessionState } from '../../server/services/workflowTypes.js'
import type { DevelopmentBatchAgentProgressInput } from '../../server/services/workflowDevelopmentBatchAgentPolicy.js'
import type { WorkflowAgentTaskProgressInput } from '../../server/services/workflowAgentTaskStateService.js'
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

export async function recordWorkflowAgentTaskProgressThroughDesktop(
  input: WorkflowAgentTaskProgressInput,
): Promise<boolean> {
  const desktop = getDesktopWorkflowContext()
  if (!desktop) return false

  let response: Response
  try {
    response = await fetch(
      `${desktop.serverUrl}/api/sessions/${encodeURIComponent(desktop.sessionId)}/workflow/agent-task-progress`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      },
    )
  } catch (error) {
    throw new Error(`WORKFLOW_AGENT_TASK_RECEIPT_UNAVAILABLE: ${errorMessage(error)}`)
  }

  if (!response.ok) {
    let message = `Desktop returned HTTP ${response.status} while recording Workflow Agent task progress.`
    try {
      const payload = await response.json() as { message?: unknown, error?: unknown }
      const detail = typeof payload.message === 'string' ? payload.message : typeof payload.error === 'string' ? payload.error : ''
      if (detail) message = detail
    } catch {}
    throw new Error(message)
  }
  return true
}

export async function recordDevelopmentBatchAgentProgressThroughDesktop(
  input: DevelopmentBatchAgentProgressInput,
): Promise<boolean> {
  const desktop = getDesktopWorkflowContext()
  if (!desktop) return false

  let response: Response
  try {
    response = await fetch(
      `${desktop.serverUrl}/api/sessions/${encodeURIComponent(desktop.sessionId)}/workflow/development-batch-agent-progress`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      },
    )
  } catch (error) {
    throw new Error(`WORKFLOW_DEVELOPMENT_BATCH_RECEIPT_UNAVAILABLE: ${errorMessage(error)}`)
  }

  if (!response.ok) {
    let message = `Desktop returned HTTP ${response.status} while recording Batch Agent progress.`
    try {
      const payload = await response.json() as { message?: unknown, error?: unknown }
      const detail = typeof payload.message === 'string' ? payload.message : typeof payload.error === 'string' ? payload.error : ''
      if (detail) message = detail
    } catch {}
    throw new Error(message)
  }
  return true
}
