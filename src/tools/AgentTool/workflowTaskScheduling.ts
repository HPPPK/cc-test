import {
  WorkflowParallelScheduler,
  validateWorkflowParallelPlan,
  type WorkflowParallelSchedulerSnapshot,
  type WorkflowParallelTask,
} from '../../server/services/workflowParallelScheduler.js'
import { resolveWorkflowParallelism } from '../../utils/workflowParallelism.js'
import { loadCurrentWorkflowTemplate } from '../../server/services/workflowRuntimeTemplateService.js'
import type { WorkflowSessionState, WorkflowTaskSnapshot } from '../../server/services/workflowTypes.js'

export type WorkflowTaskScheduleInput = {
  task_id: string
  tasks: Array<{
    id: string
    depends_on?: string[]
    write_scopes?: string[]
    resource_claims?: string[]
    execution_mode?: 'read' | 'write'
  }>
}

export type WorkflowTaskSchedulePlan = {
  taskId: string
  tasks: WorkflowParallelTask[]
}

export type WorkflowTaskSchedulingRole = 'coder' | 'reviewer'

export type WorkflowTaskSchedulingLifecycleOptions = {
  signal?: AbortSignal
  role?: WorkflowTaskSchedulingRole
  onStarted?: () => void
  onCancelled?: () => void
  onBlocked?: (reason: string) => void
}

export type WorkflowTaskLifecycleOutcome =
  | { status: 'succeeded' }
  | { status: 'failed', reason?: string }

type SchedulerLane = {
  scheduler: WorkflowParallelScheduler
  planSignature: string
  listeners: Set<() => void>
}

const schedulerLanes = new Map<string, SchedulerLane>()

class WorkflowTaskBlockedError extends Error {}
class WorkflowTaskSchedulingCancellationError extends Error {}

export function normalizeWorkflowTaskSchedulePlan(
  input: WorkflowTaskScheduleInput,
): WorkflowTaskSchedulePlan {
  return {
    taskId: input.task_id,
    tasks: input.tasks.map((task) => {
      const writeScopes = task.write_scopes ?? []
      return {
        id: task.id,
        dependsOn: task.depends_on ?? [],
        writeScopes,
        resourceClaims: task.resource_claims ?? [],
        executionMode: task.execution_mode ?? (writeScopes.length > 0 ? 'write' : 'read'),
      }
    }),
  }
}

export function getWorkflowTaskExecutionMode(
  plan: WorkflowTaskSchedulePlan,
): 'read' | 'write' {
  const task = plan.tasks.find((candidate) => candidate.id === plan.taskId)
  if (!task) {
    throw new Error(`Workflow task plan does not include task: ${plan.taskId}`)
  }
  return task.executionMode ?? (task.writeScopes.length > 0 ? 'write' : 'read')
}

function scheduledTaskId(batchId: string, role: WorkflowTaskSchedulingRole): string {
  return `${batchId}::${role}`
}

export function expandWorkflowBatchPlanForRole(
  plan: WorkflowTaskSchedulePlan,
  role: WorkflowTaskSchedulingRole | undefined,
): WorkflowTaskSchedulePlan {
  if (!role) return plan

  const tasks: WorkflowParallelTask[] = []
  for (const batch of plan.tasks) {
    tasks.push({
      id: scheduledTaskId(batch.id, 'coder'),
      dependsOn: batch.dependsOn.map((dependencyId) => scheduledTaskId(dependencyId, 'reviewer')),
      writeScopes: [...batch.writeScopes],
      resourceClaims: [...batch.resourceClaims],
      executionMode: batch.executionMode ?? (batch.writeScopes.length > 0 ? 'write' : 'read'),
    })
    tasks.push({
      id: scheduledTaskId(batch.id, 'reviewer'),
      dependsOn: [scheduledTaskId(batch.id, 'coder')],
      writeScopes: [],
      resourceClaims: [],
      executionMode: 'read',
    })
  }
  return {
    taskId: scheduledTaskId(plan.taskId, role),
    tasks,
  }
}

function inlineSchedulingTemplate(workflow: unknown): unknown {
  if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow)) return null
  const record = workflow as Record<string, unknown>
  if (record.template && typeof record.template === 'object' && !Array.isArray(record.template)
    && Array.isArray((record.template as Record<string, unknown>).phases)) {
    return record.template
  }
  return null
}

function hasStoredTemplateReference(workflow: unknown): boolean {
  if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow)) return false
  const record = workflow as Record<string, unknown>
  const identity = record.templateIdentity
  if (identity && typeof identity === 'object' && !Array.isArray(identity)
    && typeof (identity as Record<string, unknown>).id === 'string'
    && ((identity as Record<string, unknown>).id as string).trim()) {
    return true
  }
  const template = record.template
  return !!(template && typeof template === 'object' && !Array.isArray(template)
    && typeof (template as Record<string, unknown>).id === 'string'
    && ((template as Record<string, unknown>).id as string).trim())
}

async function loadSchedulingTemplate(workflow: unknown) {
  return inlineSchedulingTemplate(workflow) ?? (
    hasStoredTemplateReference(workflow)
      ? loadCurrentWorkflowTemplate(workflow as WorkflowSessionState)
      : null
  )
}

export async function validateWorkflowTaskSchedule(
  workflow: unknown,
  plan: WorkflowTaskSchedulePlan,
  role?: WorkflowTaskSchedulingRole,
): Promise<void> {
  const inlineTemplate = inlineSchedulingTemplate(workflow)
  const template = inlineTemplate ?? await loadSchedulingTemplate(workflow)
  const parallelism = resolveWorkflowParallelism(workflow, template)
  if (!parallelism) {
    throw new Error('Workflow task scheduling requires an active workflow phase with subagentPolicy.maxParallel')
  }
  validateWorkflowParallelPlan({ maxParallel: parallelism.maxParallel }, plan.tasks)
  const task = plan.tasks.find((candidate) => candidate.id === plan.taskId)
  if (!task) {
    throw new Error(`Workflow task plan does not include task: ${plan.taskId}`)
  }
  if (getWorkflowTaskExecutionMode(plan) === 'read' && task.writeScopes.length > 0) {
    throw new Error(`Workflow task ${plan.taskId} is a read task and cannot declare write scopes`)
  }

  const scheduledPlan = expandWorkflowBatchPlanForRole(plan, role)
  validateWorkflowParallelPlan({ maxParallel: parallelism.maxParallel }, scheduledPlan.tasks)
  const existing = schedulerLanes.get(parallelism.key)
  if (existing && existing.planSignature !== createPlanSignature(scheduledPlan.tasks)) {
    throw new Error('Workflow task plan does not match the existing workflow task plan for this phase')
  }
}

export async function hasActiveWorkflowTaskSchedule(workflow: unknown): Promise<boolean> {
  const inlineTemplate = inlineSchedulingTemplate(workflow)
  const template = inlineTemplate ?? await loadSchedulingTemplate(workflow)
  const parallelism = resolveWorkflowParallelism(workflow, template)
  return !!parallelism && schedulerLanes.has(parallelism.key)
}

export async function runWithinWorkflowTaskSchedule<T extends WorkflowTaskLifecycleOutcome>(
  workflow: unknown,
  plan: WorkflowTaskSchedulePlan,
  lifecycle: () => Promise<T>,
  options: WorkflowTaskSchedulingLifecycleOptions = {},
): Promise<T | undefined> {
  let permit: { key: string, lane: SchedulerLane }
  try {
    permit = await acquireWorkflowTaskPermit(workflow, plan, options.signal, options.role)
  } catch (error) {
    if (error instanceof WorkflowTaskBlockedError) {
      options.onBlocked?.(error.message)
      return undefined
    }
    if (error instanceof WorkflowTaskSchedulingCancellationError) {
      options.onCancelled?.()
      return undefined
    }
    throw error
  }

  options.onStarted?.()
  const { key, lane } = permit
  try {
    const outcome = await lifecycle()
    completeWorkflowTask(key, lane, expandWorkflowBatchPlanForRole(plan, options.role).taskId, outcome)
    return outcome
  } catch (error) {
    completeWorkflowTask(key, lane, expandWorkflowBatchPlanForRole(plan, options.role).taskId, {
      status: 'failed',
      reason: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

export async function getWorkflowTaskScheduleSnapshot(
  workflow: unknown,
): Promise<WorkflowParallelSchedulerSnapshot | null> {
  const inlineTemplate = inlineSchedulingTemplate(workflow)
  const template = inlineTemplate ?? await loadSchedulingTemplate(workflow)
  const parallelism = resolveWorkflowParallelism(workflow, template)
  if (!parallelism) return null
  return schedulerLanes.get(parallelism.key)?.scheduler.snapshot() ?? null
}

export function resetWorkflowTaskSchedulers(): void {
  schedulerLanes.clear()
}

async function acquireWorkflowTaskPermit(
  workflow: unknown,
  plan: WorkflowTaskSchedulePlan,
  signal?: AbortSignal,
  role?: WorkflowTaskSchedulingRole,
): Promise<{ key: string, lane: SchedulerLane }> {
  const inlineTemplate = inlineSchedulingTemplate(workflow)
  const template = inlineTemplate ?? await loadSchedulingTemplate(workflow)
  const parallelism = resolveWorkflowParallelism(workflow, template)
  if (!parallelism) {
    throw new Error('Workflow task scheduling requires an active workflow phase with subagentPolicy.maxParallel')
  }
  if (signal?.aborted) {
    throw createCancellationError()
  }

  const scheduledPlan = expandWorkflowBatchPlanForRole(plan, role)
  const lane = getOrCreateLane(
    parallelism.key,
    parallelism.maxParallel,
    scheduledPlan.tasks,
    persistedTaskSnapshots(workflow, scheduledPlan.tasks),
  )
  if (role) {
    const current = lane.scheduler.snapshot().tasks.find((task) => task.id === scheduledPlan.taskId)
    if (current && (current.status === 'succeeded' || current.status === 'failed' || current.status === 'blocked')) {
      lane.scheduler.resetTaskAndDependents(scheduledPlan.taskId)
      notifyLane(lane)
    }
  }
  while (true) {
    if (signal?.aborted) {
      throw createCancellationError()
    }

    const result = lane.scheduler.tryStartTask(scheduledPlan.taskId)
    if (result.status === 'started') {
      return { key: parallelism.key, lane }
    }
    if (result.status === 'blocked') {
      throw new WorkflowTaskBlockedError(result.reason)
    }

    await waitForSchedulerChange(lane, signal)
  }
}

function getOrCreateLane(
  key: string,
  maxParallel: number,
  tasks: WorkflowParallelTask[],
  persistedSnapshots: WorkflowTaskSnapshot[] = [],
): SchedulerLane {
  const planSignature = createPlanSignature(tasks)
  const existing = schedulerLanes.get(key)
  if (existing) {
    if (existing.planSignature !== planSignature) {
      throw new Error('Workflow task plan does not match the existing workflow task plan for this phase')
    }
    return existing
  }

  const lane: SchedulerLane = {
    scheduler: new WorkflowParallelScheduler({ maxParallel }, tasks),
    planSignature,
    listeners: new Set(),
  }
  for (const snapshot of persistedSnapshots) {
    const status = persistedSchedulerStatus(snapshot)
    if (!status) continue
    lane.scheduler.hydrateTask(snapshot.taskId, status, snapshot.reason)
  }
  schedulerLanes.set(key, lane)
  return lane
}

function persistedTaskSnapshots(
  workflow: unknown,
  tasks: WorkflowParallelTask[],
): WorkflowTaskSnapshot[] {
  if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow)) return []
  const record = workflow as WorkflowSessionState
  const phaseId = record.activePhaseId
  if (!phaseId) return []
  const snapshots = record.runtimeContract?.phaseStates[phaseId]?.taskSnapshots ?? []
  return tasks.flatMap(task => {
    const exact = snapshots.find(snapshot => snapshot.taskId === task.id)
    if (exact) return [{ ...exact, taskId: task.id }]
    const separator = task.id.lastIndexOf('::')
    if (separator < 0) return []
    const batchId = task.id.slice(0, separator)
    const role = task.id.slice(separator + 2)
    const matched = snapshots.find(snapshot => snapshot.batchId === batchId && snapshot.workflowRole === role)
    return matched ? [{ ...matched, taskId: task.id }] : []
  })
}

function persistedSchedulerStatus(
  snapshot: WorkflowTaskSnapshot,
): 'pending' | 'running' | 'succeeded' | 'failed' | 'blocked' | null {
  if (snapshot.status === 'succeeded') return 'succeeded'
  if (snapshot.status === 'running' || snapshot.status === 'waiting_user') return 'running'
  if (snapshot.status === 'blocked') return 'blocked'
  if (snapshot.status === 'failed' || snapshot.status === 'needs_fix') return 'failed'
  if (
    snapshot.status === 'pending'
    || snapshot.status === 'waiting_dependency'
    || snapshot.status === 'interrupted'
    || snapshot.status === 'cancelled'
    || snapshot.status === 'stale'
  ) return 'pending'
  return null
}

function completeWorkflowTask(
  key: string,
  lane: SchedulerLane,
  taskId: string,
  outcome: WorkflowTaskLifecycleOutcome,
): void {
  if (outcome.status === 'succeeded') {
    lane.scheduler.markSucceeded(taskId)
  } else {
    lane.scheduler.markFailed(taskId, outcome.reason ?? 'Agent lifecycle failed')
  }
  notifyLane(lane)

  if (lane.scheduler.snapshot().tasks.every((task) =>
    task.status === 'succeeded' || task.status === 'failed' || task.status === 'blocked',
  )) {
    schedulerLanes.delete(key)
  }
}

function waitForSchedulerChange(lane: SchedulerLane, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const wake = () => {
      cleanup()
      resolve()
    }
    const cancel = () => {
      cleanup()
      reject(createCancellationError())
    }
    const cleanup = () => {
      lane.listeners.delete(wake)
      signal?.removeEventListener('abort', cancel)
    }

    lane.listeners.add(wake)
    signal?.addEventListener('abort', cancel, { once: true })
    if (signal?.aborted) cancel()
  })
}

function notifyLane(lane: SchedulerLane): void {
  for (const listener of [...lane.listeners]) {
    listener()
  }
}

function createPlanSignature(tasks: WorkflowParallelTask[]): string {
  return JSON.stringify(tasks
    .map((task) => ({
      id: task.id,
      dependsOn: [...task.dependsOn].sort(),
      writeScopes: [...task.writeScopes].sort(),
      resourceClaims: [...task.resourceClaims].sort(),
      executionMode: task.executionMode ?? (task.writeScopes.length > 0 ? 'write' : 'read'),
    }))
    .sort((left, right) => left.id.localeCompare(right.id)))
}

function createCancellationError(): WorkflowTaskSchedulingCancellationError {
  return new WorkflowTaskSchedulingCancellationError('Workflow task scheduling wait was cancelled')
}
