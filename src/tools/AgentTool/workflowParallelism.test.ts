import { describe, expect, test } from 'bun:test'
import { runWithinWorkflowParallelism } from './workflowParallelism.js'

const workflow = {
  sessionId: 'workflow-session',
  activePhaseId: 'delegate-implement',
  template: {
    phases: [
      { id: 'delegate-implement', subagentPolicy: { maxParallel: 1 } },
    ],
  },
}

describe('Agent workflow parallelism bridge', () => {
  test('waits for the workflow permit before starting a queued background agent lifecycle', async () => {
    let releaseFirst: (() => void) | undefined
    let secondStarted = false

    const first = runWithinWorkflowParallelism(workflow, () => new Promise<void>((resolve) => {
      releaseFirst = resolve
    }))
    await Promise.resolve()

    const second = runWithinWorkflowParallelism(workflow, async () => {
      secondStarted = true
    })
    await Promise.resolve()
    expect(secondStarted).toBe(false)

    releaseFirst!()
    await Promise.all([first, second])
    expect(secondStarted).toBe(true)
  })

  test('keeps a queued lifecycle from starting when its task is cancelled', async () => {
    let releaseFirst: (() => void) | undefined
    let secondStarted = false
    let queuedPosition: number | undefined
    let cancelled = false
    const abortController = new AbortController()

    const first = runWithinWorkflowParallelism(workflow, () => new Promise<void>((resolve) => {
      releaseFirst = resolve
    }))
    await Promise.resolve()

    const second = runWithinWorkflowParallelism(
      workflow,
      async () => {
        secondStarted = true
      },
      {
        signal: abortController.signal,
        onQueued: ({ position }) => {
          queuedPosition = position
        },
        onCancelled: () => {
          cancelled = true
        },
      },
    )

    expect(queuedPosition).toBe(1)
    abortController.abort()
    await second
    expect(cancelled).toBe(true)

    releaseFirst!()
    await first
    expect(secondStarted).toBe(false)
  })

  test('does not queue normal non-workflow agent lifecycles', async () => {
    let started = false

    await runWithinWorkflowParallelism(undefined, async () => {
      started = true
    })

    expect(started).toBe(true)
  })
})
