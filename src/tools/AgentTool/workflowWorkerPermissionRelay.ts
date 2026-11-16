import path from 'node:path'
import { getDesktopWorkflowContext, resolveWorkflowRuntimeState } from '../../services/tools/workflowRuntimeStateBridge.js'
import { developmentToolCallViolation, type DevelopmentWorkerContract } from '../../server/services/developmentToolExecutionPolicy.js'

const phaseRoles: Record<string, readonly string[]> = {
  'delegate-implement': ['coder', 'reviewer', 'debug'], 'scenario-review': ['qa'], 'local-preview': ['debug'],
  'stradn-delivery': ['coder', 'reviewer', 'qa', 'debug'],
}

/** Grants prompt transport only. Actual tool authorization remains in the two
 * fresh execution guards and the permission engine/SDK user decision. */
export async function hasDesktopWorkflowPermissionRelay(
  worker: DevelopmentWorkerContract | undefined,
  localWorkflow: unknown,
  signal: AbortSignal,
  trustedWorktreePath?: string,
): Promise<boolean> {
  const desktop = getDesktopWorkflowContext()
  if (!desktop || !worker || !worker.agentId || !worker.runId || desktop.sessionId !== worker.sessionId) return false
  const resolved = await resolveWorkflowRuntimeState(localWorkflow, { signal })
  if (resolved.source !== 'desktop') return false
  const state = resolved.state
  if (state.templateIdentity?.id !== 'efficient-constrained-dev-debug-workflow-v5' || state.activeWorkflowRunId !== worker.runId
    || !phaseRoles[worker.phaseId]?.includes(worker.role)
    || !state.workspaceRoot || !worker.workspaceRoot
    || (path.resolve(worker.workspaceRoot) !== path.resolve(state.workspaceRoot)
      && (!trustedWorktreePath || path.resolve(worker.workspaceRoot) !== path.resolve(trustedWorktreePath)))) return false
  if (developmentToolCallViolation('Read', {}, state, worker, undefined, true)) return false
  if (worker.role === 'coder' || worker.role === 'reviewer') {
    if (!worker.batchId) return false
    const slot = state.runtimeContract?.phaseStates[worker.phaseId]?.taskSnapshots.find(task => task.batchId === worker.batchId && task.workflowRole === worker.role)
    if (!slot || slot.status !== 'running' || slot.agentRunId !== worker.agentId) return false
    const expected = [...(slot.writeScopes ?? [])].sort()
    const actual = [...worker.writeScopes].sort()
    if (JSON.stringify(expected) !== JSON.stringify(actual) || (worker.role === 'coder' && !actual.length)) return false
  } else if (worker.batchId || worker.writeScopes.length) return false
  return true
}
