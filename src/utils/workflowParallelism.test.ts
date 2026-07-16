import { describe, expect, test } from 'bun:test'
import {
  WorkflowParallelismLimiter,
  resolveWorkflowParallelism,
} from './workflowParallelism.js'

describe('workflow parallelism', () => {
  test('reads the active phase concurrency limit from a workflow session snapshot', () => {
    expect(resolveWorkflowParallelism({
      sessionId: 'session-1',
      activePhaseId: 'delegate-implement',
      template: {
        phases: [
          {
            id: 'delegate-implement',
            subagentPolicy: { maxParallel: 2 },
          },
        ],
      },
    })).toEqual({
      key: 'session-1:delegate-implement',
      maxParallel: 2,
    })
  })

  test('supports policy copied into a phase contract and ignores invalid workflow values', () => {
    expect(resolveWorkflowParallelism({
      sessionId: 'session-1',
      activePhaseId: 'delegate-implement',
      template: {
        phases: [
          {
            id: 'delegate-implement',
            contract: { subagentPolicy: { maxParallel: 3 } },
          },
        ],
      },
    })).toEqual({
      key: 'session-1:delegate-implement',
      maxParallel: 3,
    })

    expect(resolveWorkflowParallelism({
      sessionId: 'session-1',
      activePhaseId: 'delegate-implement',
      template: {
        phases: [{ id: 'delegate-implement', subagentPolicy: { maxParallel: 0 } }],
      },
    })).toBeNull()
  })

  test('uses the host-managed default for an explicitly host-controlled workflow phase', () => {
    expect(resolveWorkflowParallelism({
      sessionId: 'session-1',
      activePhaseId: 'delegate-implement',
      template: {
        phases: [
          {
            id: 'delegate-implement',
            subagentPolicy: {
              parallelSubagentsAllowed: true,
              maxParallel: null,
              controlledBy: 'host-runtime',
            },
          },
        ],
      },
    })).toEqual({
      key: 'session-1:delegate-implement',
      maxParallel: 2,
    })
  })

  test('queues work beyond a workflow cap and releases the next task when a slot is freed', async () => {
    const limiter = new WorkflowParallelismLimiter()
    const first = await limiter.acquire({ key: 'run:phase', maxParallel: 2 })
    const second = await limiter.acquire({ key: 'run:phase', maxParallel: 2 })
    let thirdStarted = false
    const thirdPromise = limiter.acquire({ key: 'run:phase', maxParallel: 2 }).then((release) => {
      thirdStarted = true
      return release
    })

    await Promise.resolve()
    expect(thirdStarted).toBe(false)
    expect(limiter.snapshot('run:phase')).toEqual({ active: 2, queued: 1, maxParallel: 2 })

    first()
    const third = await thirdPromise
    expect(thirdStarted).toBe(true)
    expect(limiter.snapshot('run:phase')).toEqual({ active: 2, queued: 0, maxParallel: 2 })

    second()
    third()
    expect(limiter.snapshot('run:phase')).toBeNull()
  })

  test('reports a queue position and removes an aborted task before it can receive a permit', async () => {
    const limiter = new WorkflowParallelismLimiter()
    const first = await limiter.acquire({ key: 'run:phase', maxParallel: 1 })
    const abortController = new AbortController()
    let queuePosition: number | undefined
    let secondStarted = false

    const second = limiter.acquire(
      { key: 'run:phase', maxParallel: 1 },
      {
        signal: abortController.signal,
        onQueued: ({ position }) => {
          queuePosition = position
        },
      },
    ).then(() => {
      secondStarted = true
    })

    expect(queuePosition).toBe(1)
    expect(limiter.snapshot('run:phase')).toEqual({ active: 1, queued: 1, maxParallel: 1 })

    abortController.abort()
    await expect(second).rejects.toThrow('Workflow parallelism queue entry was cancelled')
    expect(limiter.snapshot('run:phase')).toEqual({ active: 1, queued: 0, maxParallel: 1 })

    first()
    await Promise.resolve()
    expect(secondStarted).toBe(false)
    expect(limiter.snapshot('run:phase')).toBeNull()
  })

  test('does not let one workflow run consume another workflow run capacity', async () => {
    const limiter = new WorkflowParallelismLimiter()
    const first = await limiter.acquire({ key: 'run-a:implement', maxParallel: 1 })
    const second = await limiter.acquire({ key: 'run-b:implement', maxParallel: 1 })

    expect(limiter.snapshot('run-a:implement')).toEqual({ active: 1, queued: 0, maxParallel: 1 })
    expect(limiter.snapshot('run-b:implement')).toEqual({ active: 1, queued: 0, maxParallel: 1 })

    first()
    second()
  })
})
