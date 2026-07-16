export type WorkflowParallelTask = {
  id: string
  dependsOn: string[]
  writeScopes: string[]
  resourceClaims: string[]
  executionMode?: 'read' | 'write'
}

export type WorkflowParallelPolicy = {
  maxParallel: number
}

export type WorkflowParallelTaskStatus =
  | 'pending'
  | 'ready'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'blocked'

export type WorkflowParallelTaskSnapshot = WorkflowParallelTask & {
  status: WorkflowParallelTaskStatus
  blockedReason?: string
}

export type WorkflowParallelTaskStartResult =
  | { status: 'started' }
  | { status: 'waiting' }
  | { status: 'blocked', reason: string }

export type WorkflowParallelSchedulerSnapshot = {
  maxParallel: number
  tasks: WorkflowParallelTaskSnapshot[]
}

type TaskRecord = WorkflowParallelTaskSnapshot

export function validateWorkflowParallelPlan(
  policy: WorkflowParallelPolicy,
  tasks: WorkflowParallelTask[],
): void {
  if (!Number.isInteger(policy.maxParallel) || policy.maxParallel < 1) {
    throw new Error('maxParallel must be a positive integer')
  }

  const byId = new Map<string, WorkflowParallelTask>()
  for (const task of tasks) {
    if (!task.id.trim()) {
      throw new Error('Workflow task id must not be empty')
    }
    if (byId.has(task.id)) {
      throw new Error(`Duplicate workflow task id: ${task.id}`)
    }
    byId.set(task.id, task)
  }

  for (const task of tasks) {
    for (const dependencyId of task.dependsOn) {
      if (!byId.has(dependencyId)) {
        throw new Error(`Unknown workflow task dependency: ${task.id} -> ${dependencyId}`)
      }
    }
  }

  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (taskId: string, trail: string[]): void => {
    if (visiting.has(taskId)) {
      const cycleStart = trail.indexOf(taskId)
      const cycle = [...trail.slice(cycleStart), taskId]
      throw new Error(`Workflow task dependency cycle: ${cycle.join(' -> ')}`)
    }
    if (visited.has(taskId)) return

    visiting.add(taskId)
    const task = byId.get(taskId)!
    for (const dependencyId of task.dependsOn) {
      visit(dependencyId, [...trail, taskId])
    }
    visiting.delete(taskId)
    visited.add(taskId)
  }

  for (const task of tasks) {
    visit(task.id, [])
  }
}

export class WorkflowParallelScheduler {
  private readonly tasks = new Map<string, TaskRecord>()
  private readonly taskOrder: string[]

  constructor(
    private readonly policy: WorkflowParallelPolicy,
    taskInputs: WorkflowParallelTask[],
  ) {
    validateWorkflowParallelPlan(policy, taskInputs)
    this.taskOrder = taskInputs.map((task) => task.id)

    for (const task of taskInputs) {
      this.tasks.set(task.id, {
        ...task,
        dependsOn: [...task.dependsOn],
        writeScopes: [...task.writeScopes],
        resourceClaims: [...task.resourceClaims],
        status: 'pending',
      })
    }

    this.reconcilePendingTasks()
  }

  tryStartTask(taskId: string): WorkflowParallelTaskStartResult {
    this.reconcilePendingTasks()

    const task = this.tasks.get(taskId)
    if (!task) {
      throw new Error(`Unknown workflow task: ${taskId}`)
    }
    if (task.status === 'blocked') {
      return { status: 'blocked', reason: task.blockedReason ?? 'unknown reason' }
    }
    if (task.status === 'running') {
      throw new Error(`Workflow task is already running: ${taskId}`)
    }
    if (task.status === 'succeeded' || task.status === 'failed') {
      throw new Error(`Workflow task is already terminal: ${taskId}`)
    }
    if (task.status !== 'ready' || this.runningTaskCount() >= this.policy.maxParallel || this.conflictsWithRunningTask(task)) {
      return { status: 'waiting' }
    }

    task.status = 'running'
    return { status: 'started' }
  }

  takeReadyTasks(): string[] {
    this.reconcilePendingTasks()
    const started: string[] = []

    for (const taskId of this.taskOrder) {
      if (this.runningTaskCount() >= this.policy.maxParallel) break

      const task = this.tasks.get(taskId)!
      if (task.status !== 'ready' || this.conflictsWithRunningTask(task)) continue

      task.status = 'running'
      started.push(task.id)
    }

    return started
  }

  markSucceeded(taskId: string): void {
    const task = this.requireRunningTask(taskId)
    task.status = 'succeeded'
    delete task.blockedReason
    this.reconcilePendingTasks()
  }

  markFailed(taskId: string, reason: string): void {
    const task = this.requireRunningTask(taskId)
    task.status = 'failed'
    task.blockedReason = reason
    this.reconcilePendingTasks()
  }

  snapshot(): WorkflowParallelSchedulerSnapshot {
    return {
      maxParallel: this.policy.maxParallel,
      tasks: this.taskOrder.map((taskId) => ({ ...this.tasks.get(taskId)! })),
    }
  }

  private requireRunningTask(taskId: string): TaskRecord {
    const task = this.tasks.get(taskId)
    if (!task) {
      throw new Error(`Unknown workflow task: ${taskId}`)
    }
    if (task.status !== 'running') {
      throw new Error(`Workflow task is not running: ${taskId}`)
    }
    return task
  }

  private reconcilePendingTasks(): void {
    for (const taskId of this.taskOrder) {
      const task = this.tasks.get(taskId)!
      if (task.status !== 'pending' && task.status !== 'ready') continue

      const failedDependency = task.dependsOn
        .map((dependencyId) => this.tasks.get(dependencyId)!)
        .find((dependency) => dependency.status === 'failed' || dependency.status === 'blocked')

      if (failedDependency) {
        task.status = 'blocked'
        task.blockedReason = failedDependency.status === 'failed'
          ? `Dependency ${failedDependency.id} failed: ${failedDependency.blockedReason ?? 'unknown failure'}`
          : `Dependency ${failedDependency.id} is blocked: ${failedDependency.blockedReason ?? 'unknown reason'}`
        continue
      }

      if (task.dependsOn.every((dependencyId) => this.tasks.get(dependencyId)!.status === 'succeeded')) {
        task.status = 'ready'
        delete task.blockedReason
      } else {
        task.status = 'pending'
      }
    }
  }

  private runningTaskCount(): number {
    return this.taskOrder.filter((taskId) => this.tasks.get(taskId)!.status === 'running').length
  }

  private conflictsWithRunningTask(candidate: TaskRecord): boolean {
    return this.taskOrder
      .map((taskId) => this.tasks.get(taskId)!)
      .filter((task) => task.status === 'running')
      .some((running) => tasksConflict(candidate, running))
  }
}

function tasksConflict(left: WorkflowParallelTask, right: WorkflowParallelTask): boolean {
  return left.resourceClaims.some((claim) => right.resourceClaims.includes(claim)) ||
    left.writeScopes.some((leftScope) => right.writeScopes.some((rightScope) => writeScopesOverlap(leftScope, rightScope)))
}

function writeScopesOverlap(left: string, right: string): boolean {
  const normalizedLeft = normalizeScope(left)
  const normalizedRight = normalizeScope(right)
  if (!normalizedLeft || !normalizedRight) return false
  return normalizedLeft === normalizedRight ||
    normalizedLeft.startsWith(`${normalizedRight}/`) ||
    normalizedRight.startsWith(`${normalizedLeft}/`)
}

function normalizeScope(scope: string): string {
  return scope
    .replace(/\\/g, '/')
    .replace(/\/\*.*$/, '')
    .replace(/\/+$/, '')
}
