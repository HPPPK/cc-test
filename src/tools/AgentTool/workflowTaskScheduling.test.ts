import { afterEach, describe, expect, test } from 'bun:test'
import {
  getWorkflowTaskExecutionMode,
  normalizeWorkflowTaskSchedulePlan,
  resetWorkflowTaskSchedulers,
  runWithinWorkflowTaskSchedule,
  validateWorkflowTaskSchedule,
  type WorkflowTaskSchedulePlan,
} from './workflowTaskScheduling.js'

const workflow = {
  sessionId: 'workflow-run',
  activePhaseId: 'delegate-implement',
  template: {
    phases: [
      { id: 'delegate-implement', subagentPolicy: { maxParallel: 2 } },
    ],
  },
}

const tasks = [
  {
    id: 'implementation',
    dependsOn: [],
    writeScopes: ['src/server/services/**'],
    resourceClaims: [],
  },
  {
    id: 'verification',
    dependsOn: ['implementation'],
    writeScopes: [],
    resourceClaims: [],
  },
]

function plan(taskId: string): WorkflowTaskSchedulePlan {
  return { taskId, tasks }
}

describe('workflow task scheduling bridge', () => {
  test('normalizes declared write tasks as worktree-isolated and preserves read tasks', async () => {
    const writePlan = normalizeWorkflowTaskSchedulePlan({
      task_id: 'implementation',
      tasks: [
        {
          id: 'implementation',
          write_scopes: ['src/server/**'],
          execution_mode: 'write',
        },
        {
          id: 'research',
          execution_mode: 'read',
        },
      ],
    })

    expect(getWorkflowTaskExecutionMode(writePlan)).toBe('write')
    expect(writePlan.tasks[0]?.executionMode).toBe('write')
    expect(writePlan.tasks[1]?.executionMode).toBe('read')

    await expect(validateWorkflowTaskSchedule(workflow, {
      taskId: 'research',
      tasks: [{
        id: 'research',
        dependsOn: [],
        writeScopes: ['src/**'],
        resourceClaims: [],
        executionMode: 'read',
      }],
    })).rejects.toThrow('is a read task and cannot declare write scopes')
  })
  afterEach(() => {
    resetWorkflowTaskSchedulers()
  })

  test('holds a dependent lifecycle until its declared dependency succeeds', async () => {
    let releaseImplementation: (() => void) | undefined
    let verificationStarted = false

    const implementation = runWithinWorkflowTaskSchedule(
      workflow,
      plan('implementation'),
      () => new Promise(resolve => {
        releaseImplementation = () => resolve({ status: 'succeeded' })
      }),
    )
    await Promise.resolve()

    const verification = runWithinWorkflowTaskSchedule(
      workflow,
      plan('verification'),
      async () => {
        verificationStarted = true
        return { status: 'succeeded' as const }
      },
    )
    await Promise.resolve()
    expect(verificationStarted).toBe(false)

    releaseImplementation!()
    await Promise.all([implementation, verification])
    expect(verificationStarted).toBe(true)
  })

  test('reports a queued dependent as blocked when its dependency fails', async () => {
    let releaseImplementation: (() => void) | undefined
    let blockedReason: string | undefined

    const implementation = runWithinWorkflowTaskSchedule(
      workflow,
      plan('implementation'),
      () => new Promise(resolve => {
        releaseImplementation = () => resolve({ status: 'failed', reason: 'unit test failed' })
      }),
    )
    await Promise.resolve()

    const verification = runWithinWorkflowTaskSchedule(
      workflow,
      plan('verification'),
      async () => ({ status: 'succeeded' as const }),
      {
        onBlocked: reason => {
          blockedReason = reason
        },
      },
    )

    releaseImplementation!()
    await implementation
    await expect(verification).resolves.toBeUndefined()
    expect(blockedReason).toBe('Dependency implementation failed: unit test failed')
  })

  test('serializes declared resource conflicts while allowing distinct scopes to proceed', async () => {
    const resourceTasks = [
      { id: 'preview-a', dependsOn: [], writeScopes: [], resourceClaims: ['port:3456'] },
      { id: 'preview-b', dependsOn: [], writeScopes: [], resourceClaims: ['port:3456'] },
      { id: 'docs', dependsOn: [], writeScopes: ['docs/**'], resourceClaims: [] },
    ]
    let releasePreview: (() => void) | undefined
    let secondPreviewStarted = false
    let docsStarted = false

    const previewA = runWithinWorkflowTaskSchedule(
      workflow,
      { taskId: 'preview-a', tasks: resourceTasks },
      () => new Promise(resolve => {
        releasePreview = () => resolve({ status: 'succeeded' })
      }),
    )
    await Promise.resolve()
    const previewB = runWithinWorkflowTaskSchedule(
      workflow,
      { taskId: 'preview-b', tasks: resourceTasks },
      async () => {
        secondPreviewStarted = true
        return { status: 'succeeded' as const }
      },
    )
    const docs = runWithinWorkflowTaskSchedule(
      workflow,
      { taskId: 'docs', tasks: resourceTasks },
      async () => {
        docsStarted = true
        return { status: 'succeeded' as const }
      },
    )

    await Promise.resolve()
    expect(secondPreviewStarted).toBe(false)
    expect(docsStarted).toBe(true)

    releasePreview!()
    await Promise.all([previewA, previewB, docs])
    expect(secondPreviewStarted).toBe(true)
  })

  test('rejects a plan that changes after its workflow lane has started', async () => {
    const first = runWithinWorkflowTaskSchedule(
      workflow,
      plan('implementation'),
      async () => ({ status: 'succeeded' as const }),
    )
    await first

    await expect(runWithinWorkflowTaskSchedule(
      workflow,
      {
        taskId: 'implementation',
        tasks: [{ id: 'implementation', dependsOn: [], writeScopes: ['src/**'], resourceClaims: [] }],
      },
      async () => ({ status: 'succeeded' as const }),
    )).rejects.toThrow('does not match the existing workflow task plan')
  })

  test('treats a changed execution mode as a different task plan', async () => {
    let release: (() => void) | undefined
    const originalPlan: WorkflowTaskSchedulePlan = {
      taskId: 'analysis',
      tasks: [{
        id: 'analysis',
        dependsOn: [],
        writeScopes: [],
        resourceClaims: [],
        executionMode: 'read',
      }],
    }

    const running = runWithinWorkflowTaskSchedule(
      workflow,
      originalPlan,
      () => new Promise(resolve => {
        release = () => resolve({ status: 'succeeded' })
      }),
    )
    await Promise.resolve()

    await expect(runWithinWorkflowTaskSchedule(
      workflow,
      {
        taskId: 'analysis',
        tasks: [{
          id: 'analysis',
          dependsOn: [],
          writeScopes: [],
          resourceClaims: [],
          executionMode: 'write',
        }],
      },
      async () => ({ status: 'succeeded' as const }),
    )).rejects.toThrow('does not match the existing workflow task plan')

    release!()
    await running
  })
  test('requires a workflow phase with an explicit concurrency policy', async () => {
    await expect(runWithinWorkflowTaskSchedule(
      undefined,
      plan('implementation'),
      async () => ({ status: 'succeeded' as const }),
    )).rejects.toThrow('requires an active workflow phase with subagentPolicy.maxParallel')
  })
})
