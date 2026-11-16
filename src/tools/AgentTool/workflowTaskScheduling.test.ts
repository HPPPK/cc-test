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
  test('rejects a managed batch whose prerequisite has no dispatched worker instead of waiting forever', async () => {
    const batchPlan: WorkflowTaskSchedulePlan = { taskId: 'B3', tasks: [
      { id: 'B1', dependsOn: [], writeScopes: ['base.js'], resourceClaims: [] },
      { id: 'B3', dependsOn: ['B1'], writeScopes: ['rules.js'], resourceClaims: [] },
    ] }
    await expect(validateWorkflowTaskSchedule(workflow, batchPlan, 'coder')).rejects.toThrow('WORKFLOW_DEPENDENCY_NOT_DISPATCHED')
  })

  test('tells a repeatedly rejected Reviewer the exact Coder dispatch to perform instead', async () => {
    const batchPlan: WorkflowTaskSchedulePlan = { taskId: 'B2', tasks: [
      { id: 'B2', dependsOn: [], writeScopes: ['auth.js'], resourceClaims: [] },
    ] }
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(validateWorkflowTaskSchedule(workflow, batchPlan, 'reviewer'))
        .rejects.toThrow('workflow_role="coder", workflow_parallel_plan.task_id="B2"')
      await expect(validateWorkflowTaskSchedule(workflow, batchPlan, 'reviewer'))
        .rejects.toThrow('Do not retry this same dispatch')
    }
    const success = async () => ({ status: 'succeeded' as const })
    await runWithinWorkflowTaskSchedule(workflow, batchPlan, success, { role: 'coder' })
    await expect(validateWorkflowTaskSchedule(workflow, batchPlan, 'reviewer')).resolves.toBeUndefined()
  })

  test('still queues a managed batch behind an actually running prerequisite reviewer', async () => {
    const batchTasks: WorkflowTaskSchedulePlan['tasks'] = [
      { id: 'B1', dependsOn: [], writeScopes: ['base.js'], resourceClaims: [] },
      { id: 'B2', dependsOn: ['B1'], writeScopes: ['rules.js'], resourceClaims: [] },
    ]
    const success = async () => ({ status: 'succeeded' as const })
    await runWithinWorkflowTaskSchedule(workflow, { taskId: 'B1', tasks: batchTasks }, success, { role: 'coder' })
    let releaseReview: (() => void) | undefined
    const reviewStarted = new Promise<void>(resolve => {
      releaseReview = resolve
    })
    let markStarted: (() => void) | undefined
    const started = new Promise<void>(resolve => { markStarted = resolve })
    const review = runWithinWorkflowTaskSchedule(workflow, { taskId: 'B1', tasks: batchTasks }, async () => {
      markStarted!()
      await reviewStarted
      return success()
    }, { role: 'reviewer' })
    await started
    await expect(validateWorkflowTaskSchedule(workflow, { taskId: 'B2', tasks: batchTasks }, 'coder')).resolves.toBeUndefined()
    let ran = false
    const dependent = runWithinWorkflowTaskSchedule(workflow, { taskId: 'B2', tasks: batchTasks }, async () => {
      ran = true
      return success()
    }, { role: 'coder' })
    await Bun.sleep(1)
    expect(ran).toBe(false)
    releaseReview!()
    await Promise.all([review, dependent])
    expect(ran).toBe(true)
  })

  test('recognizes an already dispatched prerequisite queued behind the parallelism limit', async () => {
    const limitedWorkflow = { ...workflow, sessionId: 'queued-prerequisite', template: {
      phases: [{ id: 'delegate-implement', subagentPolicy: { maxParallel: 1 } }],
    } }
    const batchTasks: WorkflowTaskSchedulePlan['tasks'] = [
      { id: 'B1', dependsOn: [], writeScopes: ['base.js'], resourceClaims: [] },
      { id: 'B2', dependsOn: ['B1'], writeScopes: ['next.js'], resourceClaims: [] },
    ]
    const success = async () => ({ status: 'succeeded' as const })
    let releaseSlot: (() => void) | undefined
    const slot = new Promise<void>(resolve => { releaseSlot = resolve })
    let signalStarted: (() => void) | undefined
    const started = new Promise<void>(resolve => { signalStarted = resolve })
    const occupying = runWithinWorkflowTaskSchedule(limitedWorkflow, { taskId: 'B1', tasks: batchTasks }, async () => {
      signalStarted!()
      await slot
      return success()
    }, { role: 'coder' })
    await started
    const review = runWithinWorkflowTaskSchedule(limitedWorkflow, { taskId: 'B1', tasks: batchTasks }, success, { role: 'reviewer' })
    await Bun.sleep(1)
    try {
      await expect(validateWorkflowTaskSchedule(limitedWorkflow, { taskId: 'B2', tasks: batchTasks }, 'coder')).resolves.toBeUndefined()
      const dependent = runWithinWorkflowTaskSchedule(limitedWorkflow, { taskId: 'B2', tasks: batchTasks }, success, { role: 'coder' })
      releaseSlot!()
      await expect(dependent).resolves.toEqual({ status: 'succeeded' })
    } finally {
      releaseSlot!()
      await Promise.all([occupying, review])
    }
  })

  test('rejects a ready prerequisite with no dispatched worker even when a scheduler lane exists', async () => {
    const batchTasks: WorkflowTaskSchedulePlan['tasks'] = [
      { id: 'X', dependsOn: [], writeScopes: ['x.js'], resourceClaims: [] },
      { id: 'B1', dependsOn: [], writeScopes: ['base.js'], resourceClaims: [] },
    ]
    await runWithinWorkflowTaskSchedule(workflow, { taskId: 'X', tasks: batchTasks }, async () => ({ status: 'succeeded' as const }), { role: 'coder' })
    await expect(validateWorkflowTaskSchedule(workflow, { taskId: 'B1', tasks: batchTasks }, 'reviewer'))
      .rejects.toThrow('WORKFLOW_DEPENDENCY_NOT_DISPATCHED')
  })

  test('removes cancelled prerequisite waiters instead of treating old dispatch as active ownership', async () => {
    const batchTasks: WorkflowTaskSchedulePlan['tasks'] = [
      { id: 'B1', dependsOn: [], writeScopes: ['base.js'], resourceClaims: [] },
      { id: 'B2', dependsOn: ['B1'], writeScopes: ['next.js'], resourceClaims: [] },
    ]
    let releaseCoder: (() => void) | undefined
    const hold = new Promise<void>(resolve => { releaseCoder = resolve })
    let signalStarted: (() => void) | undefined
    const started = new Promise<void>(resolve => { signalStarted = resolve })
    const coder = runWithinWorkflowTaskSchedule(workflow, { taskId: 'B1', tasks: batchTasks }, async () => {
      signalStarted!()
      await hold
      return { status: 'succeeded' as const }
    }, { role: 'coder' })
    await started
    const controller = new AbortController()
    const reviewer = runWithinWorkflowTaskSchedule(workflow, { taskId: 'B1', tasks: batchTasks },
      async () => ({ status: 'succeeded' as const }), { role: 'reviewer', signal: controller.signal })
    await Bun.sleep(1)
    try {
      await expect(validateWorkflowTaskSchedule(workflow, { taskId: 'B2', tasks: batchTasks }, 'coder')).resolves.toBeUndefined()
      controller.abort()
      await reviewer
      await expect(validateWorkflowTaskSchedule(workflow, { taskId: 'B2', tasks: batchTasks }, 'coder'))
        .rejects.toThrow('WORKFLOW_DEPENDENCY_NOT_DISPATCHED')
    } finally {
      controller.abort()
      releaseCoder!()
      await Promise.all([coder, reviewer])
    }
  })

  test('rejects duplicate successful review before registering or waiting and preserves downstream readiness', async () => {
    const batchTasks: WorkflowTaskSchedulePlan['tasks'] = [
      { id: 'B1', dependsOn: [], writeScopes: ['src/base.js'], resourceClaims: [] },
      { id: 'B2', dependsOn: ['B1'], writeScopes: ['src/next.js'], resourceClaims: [] },
    ]
    const batchPlan = { taskId: 'B1', tasks: batchTasks }
    const success = async () => ({ status: 'succeeded' as const })
    await runWithinWorkflowTaskSchedule(workflow, batchPlan, success, { role: 'coder' })
    await runWithinWorkflowTaskSchedule(workflow, batchPlan, success, { role: 'reviewer' })
    await expect(validateWorkflowTaskSchedule(workflow, batchPlan, 'reviewer')).rejects.toThrow('already succeeded')
    let duplicateRan = false
    await expect(runWithinWorkflowTaskSchedule(workflow, batchPlan, async () => {
      duplicateRan = true
      return success()
    }, { role: 'reviewer' })).rejects.toThrow('already succeeded')
    expect(duplicateRan).toBe(false)
    await expect(runWithinWorkflowTaskSchedule(workflow, { taskId: 'B2', tasks: batchTasks }, success, { role: 'coder' }))
      .resolves.toEqual({ status: 'succeeded' })
  })

  test('normalizes declared write tasks and preserves read tasks', async () => {
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
  test('rejects already accepted Coder and Reviewer submissions from persisted receipts after restart', async () => {
    const batchPlan: WorkflowTaskSchedulePlan = {
      taskId: 'B1', tasks: [{ id: 'B1', dependsOn: [], writeScopes: ['src/a.js'], resourceClaims: [] }],
    }
    const persistedWorkflow = { ...workflow, runtimeContract: { phaseStates: {
      'delegate-implement': { taskSnapshots: [
        { taskId: 'development-batch:B1:coder', batchId: 'B1', workflowRole: 'coder', status: 'succeeded' },
        { taskId: 'development-batch:B1:reviewer', batchId: 'B1', workflowRole: 'reviewer', status: 'succeeded' },
      ] },
    } } }
    for (const role of ['coder', 'reviewer'] as const) {
      await expect(validateWorkflowTaskSchedule(persistedWorkflow, batchPlan, role)).rejects.toThrow('already succeeded')
      await expect(runWithinWorkflowTaskSchedule(persistedWorkflow, batchPlan,
        async () => ({ status: 'succeeded' as const }), { role })).rejects.toThrow('already succeeded')
    }
  })

  test.each(['needs_fix', 'review-status', 'protocol-failed'] as const)('Reviewer admission requires code repair only for an actual needs-fix receipt: %s', async scenario => {
    const batchPlan: WorkflowTaskSchedulePlan = { taskId: 'B2', tasks: [
      { id: 'B2', dependsOn: [], writeScopes: ['auth.js'], resourceClaims: [] },
    ] }
    const snapshots = [
      { taskId: 'development-batch:B2:coder', batchId: 'B2', workflowRole: 'coder', status: 'succeeded' },
      { taskId: 'development-batch:B2:reviewer', batchId: 'B2', workflowRole: 'reviewer',
        status: scenario === 'needs_fix' ? 'needs_fix' : 'failed',
        ...(scenario === 'review-status' ? { reviewStatus: 'needs-fix' } : {}) },
    ]
    const persistedWorkflow = { ...workflow, runtimeContract: { phaseStates: {
      'delegate-implement': { taskSnapshots: snapshots },
    } } }
    const success = async () => ({ status: 'succeeded' as const })
    if (scenario === 'protocol-failed') {
      await expect(validateWorkflowTaskSchedule(persistedWorkflow, batchPlan, 'reviewer')).resolves.toBeUndefined()
      await expect(runWithinWorkflowTaskSchedule(persistedWorkflow, batchPlan, success, { role: 'reviewer' })).resolves.toEqual({ status: 'succeeded' })
      return
    }
    await expect(validateWorkflowTaskSchedule(persistedWorkflow, batchPlan, 'reviewer')).rejects.toThrow('WORKFLOW_AGENT_TASK_REPAIR_REQUIRED')
    let reviewed = false
    await expect(runWithinWorkflowTaskSchedule(persistedWorkflow, batchPlan, async () => {
      reviewed = true
      return success()
    }, { role: 'reviewer' })).rejects.toThrow('WORKFLOW_AGENT_TASK_REPAIR_REQUIRED')
    expect(reviewed).toBe(false)
    await runWithinWorkflowTaskSchedule(persistedWorkflow, batchPlan, success, { role: 'coder', onStarted: () => {
      // The real task-progress bridge invalidates the old review on a new Coder attempt.
      snapshots[1] = { ...snapshots[1]!, status: 'waiting_dependency', reviewStatus: undefined }
    } })
    await expect(validateWorkflowTaskSchedule(persistedWorkflow, batchPlan, 'reviewer')).resolves.toBeUndefined()
    await expect(runWithinWorkflowTaskSchedule(persistedWorkflow, batchPlan, success, { role: 'reviewer' })).resolves.toEqual({ status: 'succeeded' })
  })

  test('reports a review blocked by persisted failed Coder without starting or waiting', async () => {
    const batchPlan: WorkflowTaskSchedulePlan = {
      taskId: 'B1', tasks: [{ id: 'B1', dependsOn: [], writeScopes: ['src/a.js'], resourceClaims: [] }],
    }
    const persistedWorkflow = { ...workflow, runtimeContract: { phaseStates: {
      'delegate-implement': { taskSnapshots: [
        { taskId: 'B1::coder', batchId: 'B1', workflowRole: 'coder', status: 'failed', reason: 'cancelled' },
        { taskId: 'B1::reviewer', batchId: 'B1', workflowRole: 'reviewer', status: 'waiting_dependency' },
      ] },
    } } }
    let started = false
    let reason = ''
    await expect(runWithinWorkflowTaskSchedule(persistedWorkflow, batchPlan, async () => {
      started = true
      return { status: 'succeeded' as const }
    }, { role: 'reviewer', onBlocked: value => { reason = value } })).resolves.toBeUndefined()
    expect(started).toBe(false)
    expect(reason).toContain('B1::coder failed: cancelled')
  })

  afterEach(() => {
    resetWorkflowTaskSchedulers()
  })

  test('awaits cancellation persistence before settling a queued task', async () => {
    const controller = new AbortController()
    controller.abort()
    let release: (() => void) | undefined
    let cancellationStarted: (() => void) | undefined
    const started = new Promise<void>(resolve => { cancellationStarted = resolve })
    let settled = false
    const pending = runWithinWorkflowTaskSchedule(workflow, plan('verification'),
      async () => ({ status: 'succeeded' as const }), {
        signal: controller.signal,
        onCancelled: async () => {
          cancellationStarted!()
          await new Promise<void>(resolve => { release = resolve })
        },
      }).then(() => { settled = true })
    await started
    expect(settled).toBe(false)
    release!()
    await pending
    expect(settled).toBe(true)
  })

  test('holds a dependent lifecycle until its declared dependency succeeds', async () => {
    let releaseImplementation: (() => void) | undefined
    let verificationStarted = false

    const implementation = runWithinWorkflowTaskSchedule(
      workflow,
      plan('implementation'),
      () => new Promise<NonNullable<Awaited<ReturnType<typeof runWithinWorkflowTaskSchedule>>>>(resolve => {
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
      () => new Promise<NonNullable<Awaited<ReturnType<typeof runWithinWorkflowTaskSchedule>>>>(resolve => {
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
      () => new Promise<NonNullable<Awaited<ReturnType<typeof runWithinWorkflowTaskSchedule>>>>(resolve => {
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

  test('accepts a revised plan after the workflow re-enters the same phase', async () => {
    const firstExecution = {
      ...workflow,
      phases: [{
        id: 'delegate-implement',
        index: 3,
        status: 'running',
        startedAt: '2026-11-13T07:10:00.000Z',
        artifactPointers: [],
      }],
    }
    await runWithinWorkflowTaskSchedule(
      firstExecution,
      plan('implementation'),
      async () => ({ status: 'succeeded' as const }),
    )

    const revisedTasks = [
      {
        id: 'implementation',
        dependsOn: [],
        writeScopes: ['Sources/VideoWorkbench/**'],
        resourceClaims: ['swiftpm-probe'],
      },
      {
        id: 'verification',
        dependsOn: ['implementation'],
        writeScopes: [],
        resourceClaims: [],
      },
    ]
    const secondExecution = {
      ...firstExecution,
      phases: [{
        ...firstExecution.phases[0],
        startedAt: '2026-11-13T07:24:30.000Z',
      }],
    }

    await expect(runWithinWorkflowTaskSchedule(
      secondExecution,
      { taskId: 'implementation', tasks: revisedTasks },
      async () => ({ status: 'succeeded' as const }),
    )).resolves.toEqual({ status: 'succeeded' })
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
      () => new Promise<NonNullable<Awaited<ReturnType<typeof runWithinWorkflowTaskSchedule>>>>(resolve => {
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
  test('releases the scheduler and blocks dependent work when setup fails before an agent starts', async () => {
    let rejectSetup: ((error: Error) => void) | undefined
    let blockedReason: string | undefined

    const implementation = runWithinWorkflowTaskSchedule(
      workflow,
      plan('implementation'),
      () => new Promise<NonNullable<Awaited<ReturnType<typeof runWithinWorkflowTaskSchedule>>>>((_, reject) => {
        rejectSetup = reject
      }),
    )
    await Promise.resolve()

    const verification = runWithinWorkflowTaskSchedule(
      workflow,
      plan('verification'),
      async () => ({ status: 'succeeded' as const }),
      { onBlocked: reason => { blockedReason = reason } },
    )

    rejectSetup!(new Error('worktree initialization failed'))
    await expect(implementation).rejects.toThrow('worktree initialization failed')
    await expect(verification).resolves.toBeUndefined()

    expect(blockedReason).toBe('Dependency implementation failed: worktree initialization failed')
  })

  test('reruns Coder before Reviewer after a Reviewer failure', async () => {
    const batchPlan: WorkflowTaskSchedulePlan = {
      taskId: 'B1',
      tasks: [{
        id: 'B1',
        dependsOn: [],
        writeScopes: ['src/**'],
        resourceClaims: [],
        executionMode: 'write',
      }],
    }
    const order: string[] = []

    await runWithinWorkflowTaskSchedule(
      workflow,
      batchPlan,
      async () => {
        order.push('coder-1')
        return { status: 'succeeded' as const }
      },
      { role: 'coder' },
    )
    await runWithinWorkflowTaskSchedule(
      workflow,
      batchPlan,
      async () => {
        order.push('reviewer-needs-fix')
        return { status: 'failed' as const, reason: 'needs fix' }
      },
      { role: 'reviewer' },
    )
    await runWithinWorkflowTaskSchedule(
      workflow,
      batchPlan,
      async () => {
        order.push('coder-2')
        return { status: 'succeeded' as const }
      },
      { role: 'coder' },
    )
    await runWithinWorkflowTaskSchedule(
      workflow,
      batchPlan,
      async () => {
        order.push('reviewer-pass')
        return { status: 'succeeded' as const }
      },
      { role: 'reviewer' },
    )

    expect(order).toEqual(['coder-1', 'reviewer-needs-fix', 'coder-2', 'reviewer-pass'])
  })

  test('hydrates a fresh scheduler lane from persisted Coder success after restart', async () => {
    const persistedWorkflow = {
      sessionId: 'feature-session',
      activePhaseId: 'feature-implement',
      templateIdentity: { id: 'feature-extension-workflow-v8', version: '20', source: 'pack' },
      template: {
        id: 'feature-extension-workflow-v8',
        phases: [{ id: 'feature-implement', subagentPolicy: { maxParallel: 2 } }],
      },
      runtimeContract: {
        phaseStates: {
          'feature-implement': {
            taskSnapshots: [
              { taskId: 'B1::coder', batchId: 'B1', workflowRole: 'coder', status: 'succeeded' },
              { taskId: 'B1::reviewer', batchId: 'B1', workflowRole: 'reviewer', status: 'pending' },
            ],
          },
        },
      },
    }
    const batchPlan: WorkflowTaskSchedulePlan = {
      taskId: 'B1',
      tasks: [{ id: 'B1', dependsOn: [], writeScopes: ['src/**'], resourceClaims: [], executionMode: 'write' }],
    }
    let reviewerStarted = false

    await runWithinWorkflowTaskSchedule(
      persistedWorkflow,
      batchPlan,
      async () => {
        reviewerStarted = true
        return { status: 'succeeded' as const }
      },
      { role: 'reviewer' },
    )

    expect(reviewerStarted).toBe(true)
  })

  test('requires a workflow phase with an explicit concurrency policy', async () => {
    await expect(runWithinWorkflowTaskSchedule(
      undefined,
      plan('implementation'),
      async () => ({ status: 'succeeded' as const }),
    )).rejects.toThrow('requires an active workflow phase with subagentPolicy.maxParallel')
  })
})
