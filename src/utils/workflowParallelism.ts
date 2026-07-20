export type WorkflowParallelism = {
  key: string
  maxParallel: number
}

type ParallelismRequest = WorkflowParallelism

export type WorkflowParallelismQueueEvent = {
  key: string
  maxParallel: number
  position: number
}

export type WorkflowParallelismAcquireOptions = {
  signal?: AbortSignal
  onQueued?: (event: WorkflowParallelismQueueEvent) => void
}

type QueueEntry = {
  resolve: (release: () => void) => void
  reject: (error: Error) => void
  removeAbortListener?: () => void
}

type LimiterLane = {
  active: number
  maxParallel: number
  queue: QueueEntry[]
}

export function resolveWorkflowParallelism(workflow: unknown, template?: unknown): WorkflowParallelism | null {
  if (!isRecord(workflow)) return null

  const sessionId = stringValue(workflow.sessionId)
  const activePhaseId = stringValue(workflow.activePhaseId)
  const explicitTemplate = isRecord(template) ? template : null
  const inlineTemplate = isRecord(workflow.template) && Array.isArray(workflow.template.phases)
    ? workflow.template
    : null
  const currentTemplate = explicitTemplate ?? inlineTemplate
  const phases = Array.isArray(currentTemplate?.phases) ? currentTemplate.phases : null
  if (!sessionId || !activePhaseId || !phases) return null

  const phase = phases.find((candidate) => isRecord(candidate) && candidate.id === activePhaseId)
  if (!isRecord(phase)) return null

  const maxParallel = phaseMaxParallel(phase)
  if (maxParallel === null) return null

  return {
    key: `${sessionId}:${activePhaseId}`,
    maxParallel,
  }
}

export class WorkflowParallelismLimiter {
  private readonly lanes = new Map<string, LimiterLane>()

  async acquire(
    request: ParallelismRequest,
    options: WorkflowParallelismAcquireOptions = {},
  ): Promise<() => void> {
    if (options.signal?.aborted) {
      throw createQueueCancellationError()
    }

    const lane = this.getOrCreateLane(request)

    if (lane.active < lane.maxParallel) {
      lane.active += 1
      return this.createRelease(request.key, lane)
    }

    return new Promise((resolve, reject) => {
      const entry: QueueEntry = { resolve, reject }
      lane.queue.push(entry)
      options.onQueued?.({
        key: request.key,
        maxParallel: lane.maxParallel,
        position: lane.queue.length,
      })

      if (!options.signal) return

      const cancel = () => {
        const index = lane.queue.indexOf(entry)
        if (index === -1) return

        lane.queue.splice(index, 1)
        entry.removeAbortListener?.()
        reject(createQueueCancellationError())
      }
      options.signal.addEventListener('abort', cancel, { once: true })
      entry.removeAbortListener = () => {
        options.signal?.removeEventListener('abort', cancel)
      }

      if (options.signal.aborted) {
        cancel()
      }
    })
  }

  snapshot(key: string): { active: number, queued: number, maxParallel: number } | null {
    const lane = this.lanes.get(key)
    if (!lane) return null

    return {
      active: lane.active,
      queued: lane.queue.length,
      maxParallel: lane.maxParallel,
    }
  }

  private getOrCreateLane(request: ParallelismRequest): LimiterLane {
    const existing = this.lanes.get(request.key)
    if (existing) {
      existing.maxParallel = Math.min(existing.maxParallel, request.maxParallel)
      return existing
    }

    const lane = {
      active: 0,
      maxParallel: request.maxParallel,
      queue: [],
    }
    this.lanes.set(request.key, lane)
    return lane
  }

  private createRelease(key: string, lane: LimiterLane): () => void {
    let released = false

    return () => {
      if (released) return
      released = true

      const next = lane.queue.shift()
      if (next) {
        next.removeAbortListener?.()
        next.resolve(this.createRelease(key, lane))
        return
      }

      lane.active -= 1
      if (lane.active === 0) {
        this.lanes.delete(key)
      }
    }
  }
}

export const workflowParallelismLimiter = new WorkflowParallelismLimiter()

function createQueueCancellationError(): Error {
  return new Error('Workflow parallelism queue entry was cancelled')
}

const HOST_MANAGED_DEFAULT_MAX_PARALLEL = 2

function phaseMaxParallel(phase: Record<string, unknown>): number | null {
  const contract = isRecord(phase.contract) ? phase.contract : null
  const policies = [phase.subagentPolicy, contract?.subagentPolicy]
  let usesHostManagedParallelism = false

  for (const policy of policies) {
    if (!isRecord(policy)) continue
    const maxParallel = policy.maxParallel
    if (typeof maxParallel === 'number' && Number.isInteger(maxParallel) && maxParallel > 0) {
      return maxParallel
    }

    if (
      maxParallel === null &&
      policy.parallelSubagentsAllowed === true &&
      policy.controlledBy === 'host-runtime'
    ) {
      usesHostManagedParallelism = true
    }
  }

  return usesHostManagedParallelism ? HOST_MANAGED_DEFAULT_MAX_PARALLEL : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}
