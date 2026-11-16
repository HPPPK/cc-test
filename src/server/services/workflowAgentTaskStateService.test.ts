import { describe, expect, test } from 'bun:test'
import {
  recordWorkflowAgentTaskProgress,
  recordWorkflowAgentTaskProgressWithLedger,
  reconcileWorkflowAgentTasks,
  type WorkflowAgentTaskProgressInput,
} from './workflowAgentTaskStateService.js'
import type { WorkflowSessionState } from './workflowTypes.js'
import { recordDevelopmentBatchAgentProgress } from './workflowDevelopmentBatchAgentProgress.js'

const now = '2026-09-17T08:00:00.000Z'

function state(templateId = 'feature-extension-workflow-v8'): WorkflowSessionState {
  return {
    schemaVersion: 1,
    sessionId: 'session-1',
    mode: 'workflow',
    template: { id: templateId, version: '1', source: 'pack', snapshotId: 'snapshot', sourceState: 'current' },
    templateIdentity: { id: templateId, version: '1', source: 'pack' },
    sourceTemplateStatus: 'current',
    status: 'running',
    workflowStatus: 'running',
    activePhaseId: templateId === 'debug-repair-workflow-v8' ? 'debug-fix' : 'feature-implement',
    phases: [],
    phaseRuns: [],
    transitionHistory: [],
    artifactIndex: [],
    finalReportRef: null,
    activeWorkflowRunId: 'run-1',
    stateVersion: 4,
    revision: 4,
    createdAt: now,
    updatedAt: now,
    activeContextCapsuleId: 'capsule-1',
    runtimeContract: {
      schemaVersion: 1,
      migrationStatus: 'current',
      phaseStates: {
        [templateId === 'debug-repair-workflow-v8' ? 'debug-fix' : 'feature-implement']: {
          phaseId: templateId === 'debug-repair-workflow-v8' ? 'debug-fix' : 'feature-implement',
          workStatus: 'in-progress',
          eligibility: 'ineligible',
          blockerReasons: [],
          issues: [],
          artifactRequirements: [],
          checks: [],
          taskSnapshots: [],
          evaluatedAt: now,
        },
      },
      audit: [],
    },
  } as WorkflowSessionState
}

const plan = [
  { id: 'B1', dependsOn: [], writeScopes: ['src/feature/**'], resourceClaims: ['db:test'], executionMode: 'write' as const },
  { id: 'B2', dependsOn: ['B1'], writeScopes: ['src/ui/**'], resourceClaims: [], executionMode: 'write' as const },
]

function input(overrides: Partial<WorkflowAgentTaskProgressInput> = {}): WorkflowAgentTaskProgressInput {
  return {
    phaseId: 'feature-implement',
    batchId: 'B1',
    role: 'coder',
    plan,
    status: 'running',
    agentRunId: 'agent-1',
    toolUseId: 'tool-1',
    recordedAt: now,
    ...overrides,
  }
}

describe('workflowAgentTaskStateService', () => {
  test.each([true, false])('does not promote a canonical Stage 4 Coder from a generic completed ledger before its typed receipt (ownerAlive=%s)', async ownerAlive => {
    const initial = state('efficient-constrained-dev-debug-workflow-v5')
    initial.activePhaseId = 'delegate-implement'
    initial.runStatus = 'active'
    initial.runtimeContract!.phaseStates['delegate-implement'] = {
      ...initial.runtimeContract!.phaseStates['feature-implement']!, phaseId: 'delegate-implement',
    }
    delete initial.runtimeContract!.phaseStates['feature-implement']
    initial.workflowRuns = [{ id: 'run-1', templateId: initial.templateIdentity.id, status: 'active', currentPhaseId: 'delegate-implement',
      history: [], createdAt: now, updatedAt: now,
      artifacts: [{ id: 'delivery-plan', filename: 'delivery-plan.md', phaseId: 'delivery-plan', kind: 'markdown', required: true,
        content: 'fixture', developmentBatchPlan: plan, createdAt: now, updatedAt: now }],
    }]
    const progress = { phaseId: 'delegate-implement', role: 'coder' as const, batchId: 'B1', plan, agentId: 'agent-1', recordedAt: now }
    const running = recordDevelopmentBatchAgentProgress(initial, { ...progress, status: 'running' })
    const ledger = { schemaVersion: 1 as const, sessionId: running.sessionId, runId: 'agent-1', status: 'completed' as const,
      startedAt: now, updatedAt: now, events: [], artifacts: [] }
    const recovered = await reconcileWorkflowAgentTasks(running, async () => ledger, '2026-09-17T08:10:00.000Z', { ownerAlive })
    const task = recovered.runtimeContract!.phaseStates['delegate-implement']!.taskSnapshots.find(item => item.workflowRole === 'coder' && item.batchId === 'B1')!
    expect(task.status).toBe(ownerAlive ? 'running' : 'interrupted')
    expect(recovered.runtimeContract!.phaseStates['delegate-implement']!.taskSnapshots.find(item => item.workflowRole === 'reviewer' && item.batchId === 'B1')!.status).toBe('waiting_dependency')
    if (ownerAlive) {
      expect(recovered).toBe(running)
      const blocked = recordDevelopmentBatchAgentProgress(recovered, { ...progress, status: 'blocked', reason: 'readyForReview=false' })
      expect(blocked.runtimeContract!.phaseStates['delegate-implement']!.taskSnapshots.find(item => item.workflowRole === 'coder' && item.batchId === 'B1')!.status).toBe('blocked')
      const accepted = recordDevelopmentBatchAgentProgress(recovered, { ...progress, status: 'succeeded' })
      expect(await reconcileWorkflowAgentTasks(accepted, async () => ledger, '2026-09-17T08:11:00.000Z')).toBe(accepted)
    } else {
      expect(recovered.runStatus).toBe('blocked')
      expect(task.reason).toContain('accepted readiness receipt')
    }
  })

  test('retains legacy generic Coder completion outside canonical Stage 4', async () => {
    const running = recordWorkflowAgentTaskProgress(state('efficient-constrained-dev-debug-workflow-v5'), input())
    const ledger = { schemaVersion: 1 as const, sessionId: running.sessionId, runId: 'agent-1', status: 'completed' as const,
      startedAt: now, updatedAt: now, events: [], artifacts: [] }
    const recovered = await reconcileWorkflowAgentTasks(running, async () => ledger, '2026-09-17T08:10:00.000Z')
    expect(recovered.runtimeContract!.phaseStates['feature-implement']!.taskSnapshots[0]!.status).toBe('succeeded')
  })

  test('persists the complete Coder/Reviewer graph with dependencies and capsule input', () => {
    const next = recordWorkflowAgentTaskProgress(state(), input())
    const snapshots = next.runtimeContract!.phaseStates['feature-implement']!.taskSnapshots

    expect(snapshots).toHaveLength(4)
    expect(snapshots.find(task => task.batchId === 'B1' && task.workflowRole === 'coder')).toMatchObject({
      status: 'running',
      agentRunId: 'agent-1',
      attempt: 1,
      dependsOn: [],
      writeScopes: ['src/feature/**'],
      resourceClaims: ['db:test'],
      inputCapsuleRef: 'capsule-1',
    })
    expect(snapshots.find(task => task.batchId === 'B1' && task.workflowRole === 'reviewer')).toMatchObject({
      status: 'waiting_dependency',
      dependsOn: ['B1::coder'],
      executionMode: 'read',
    })
    expect(snapshots.find(task => task.batchId === 'B2' && task.workflowRole === 'coder')).toMatchObject({
      status: 'waiting_dependency',
      dependsOn: ['B1::reviewer'],
    })
  })

  test('requires Coder success before Reviewer can start', () => {
    expect(() => recordWorkflowAgentTaskProgress(state(), input({ role: 'reviewer' })))
      .toThrow('WORKFLOW_AGENT_TASK_SEQUENCE_VIOLATION')
  })

  test('records needs-fix and requires a new Coder attempt before Reviewer retries', () => {
    const coderRunning = recordWorkflowAgentTaskProgress(state(), input())
    const coderDone = recordWorkflowAgentTaskProgress(coderRunning, input({ status: 'succeeded' }))
    const reviewerRunning = recordWorkflowAgentTaskProgress(coderDone, input({
      role: 'reviewer',
      status: 'running',
      agentRunId: 'reviewer-1',
      toolUseId: 'tool-2',
    }))
    const needsFix = recordWorkflowAgentTaskProgress(reviewerRunning, input({
      role: 'reviewer',
      status: 'needs_fix',
      agentRunId: 'reviewer-1',
      toolUseId: 'tool-2',
      reviewStatus: 'needs-fix',
      requiredFixes: ['wire the start action'],
    }))

    expect(needsFix.runtimeContract!.phaseStates['feature-implement']!.taskSnapshots
      .find(task => task.batchId === 'B1' && task.workflowRole === 'reviewer')).toMatchObject({
        status: 'needs_fix',
        reviewStatus: 'needs-fix',
        requiredFixes: ['wire the start action'],
      })
    expect(() => recordWorkflowAgentTaskProgress(needsFix, input({
      role: 'reviewer',
      status: 'running',
      agentRunId: 'reviewer-2',
      toolUseId: 'tool-3',
    }))).toThrow('WORKFLOW_AGENT_TASK_REPAIR_REQUIRED')

    const coderRetry = recordWorkflowAgentTaskProgress(needsFix, input({
      status: 'running',
      agentRunId: 'agent-2',
      toolUseId: 'tool-4',
    }))
    expect(coderRetry.runtimeContract!.phaseStates['feature-implement']!.taskSnapshots
      .find(task => task.batchId === 'B1' && task.workflowRole === 'coder')).toMatchObject({
        status: 'running',
        attempt: 2,
        agentRunId: 'agent-2',
      })
  })

  test('treats duplicate progress receipts as idempotent', () => {
    const first = recordWorkflowAgentTaskProgress(state(), input())
    expect(recordWorkflowAgentTaskProgress(first, input())).toBe(first)
  })

  test('rejects success after a pause while allowing a truthful failure receipt', () => {
    const running = recordWorkflowAgentTaskProgress(state(), input())
    const paused = { ...running, runStatus: 'paused' as const }
    expect(() => recordWorkflowAgentTaskProgress(paused, input({ status: 'succeeded' }))).toThrow('WORKFLOW_EXECUTION_SUSPENDED')
    const failed = recordWorkflowAgentTaskProgress(paused, input({ status: 'failed', reason: 'Owner paused the workflow' }))
    expect(failed.runtimeContract!.phaseStates['feature-implement']!.taskSnapshots[0]!.status).toBe('failed')
    expect(failed.runStatus).toBe('paused')
    const done = recordWorkflowAgentTaskProgress(running, input({ status: 'succeeded' }))
    const acceptedBeforePause = { ...done, runStatus: 'paused' as const }
    expect(recordWorkflowAgentTaskProgress(acceptedBeforePause, input({ status: 'succeeded' }))).toBe(acceptedBeforePause)
  })

  test('validates task progress before writing Agent Run Ledger status and uses status-specific idempotency keys', async () => {
    const events: Array<{ status?: string; toolUseId?: string }> = []
    const appendLedgerEvent = async (event: { status?: string; toolUseId?: string }) => {
      events.push(event)
    }

    await expect(recordWorkflowAgentTaskProgressWithLedger(
      state(),
      input({ role: 'reviewer', agentRunId: 'reviewer-invalid' }),
      appendLedgerEvent,
    )).rejects.toThrow('WORKFLOW_AGENT_TASK_SEQUENCE_VIOLATION')
    expect(events).toEqual([])

    const running = await recordWorkflowAgentTaskProgressWithLedger(state(), input(), appendLedgerEvent)
    const completed = await recordWorkflowAgentTaskProgressWithLedger(
      running,
      input({ status: 'succeeded' }),
      appendLedgerEvent,
    )

    expect(completed.runtimeContract?.phaseStates['feature-implement']?.taskSnapshots
      .find(task => task.taskId === 'B1::coder')?.status).toBe('succeeded')
    expect(events).toEqual([
      expect.objectContaining({ status: 'running', toolUseId: 'tool-1:workflow-task-running' }),
      expect.objectContaining({ status: 'completed', toolUseId: 'tool-1:workflow-task-succeeded' }),
    ])
  })

  test('reconciles orphaned running tasks against the Agent Run Ledger without advancing the phase', async () => {
    const running = recordWorkflowAgentTaskProgress(state('debug-repair-workflow-v8'), input({
      phaseId: 'debug-fix',
    }))
    const reconciled = await reconcileWorkflowAgentTasks(running, async () => null, '2026-09-17T08:10:00.000Z')
    const coder = reconciled.runtimeContract!.phaseStates['debug-fix']!.taskSnapshots
      .find(task => task.batchId === 'B1' && task.workflowRole === 'coder')

    expect(coder).toMatchObject({ status: 'interrupted', attempt: 1 })
    expect(reconciled.activePhaseId).toBe('debug-fix')
    expect(reconciled.workflowStatus).toBe('running')
  })

  test('does not apply the new task contract to unrelated workflows', () => {
    expect(() => recordWorkflowAgentTaskProgress(state('skills-development'), input()))
      .toThrow('WORKFLOW_AGENT_TASK_GUARD_INACTIVE')
  })

  test('keeps a live owner task running during a long model request without heartbeat events', async () => {
    const running = recordWorkflowAgentTaskProgress(state(), input())
    const next = await reconcileWorkflowAgentTasks(running, async () => null,
      '2026-09-17T08:10:00.000Z', { ownerAlive: true })
    expect(next).toBe(running)
    expect(next.runtimeContract!.phaseStates['feature-implement']!.taskSnapshots[0]!.status).toBe('running')
    const oldLedger = { schemaVersion: 1 as const, sessionId: running.sessionId, runId: 'agent-1',
      status: 'running' as const, startedAt: now, updatedAt: now, events: [], artifacts: [] }
    expect(await reconcileWorkflowAgentTasks(running, async () => oldLedger,
      '2026-09-17T08:10:00.000Z', { ownerAlive: true })).toBe(running)
    const lost = await reconcileWorkflowAgentTasks(running, async () => oldLedger, '2026-09-17T08:10:00.000Z')
    expect(lost.runStatus).toBe('blocked')
    expect(lost.runtimeContract!.phaseStates['feature-implement']!.taskSnapshots[0]!.reason).toContain('heartbeat expired')
  })

  test('exposes orphaned work as recoverable blocked state without advancing or clearing accepted work', async () => {
    const coderDone = recordWorkflowAgentTaskProgress(recordWorkflowAgentTaskProgress(state(), input()), input({ status: 'succeeded' }))
    const reviewing = recordWorkflowAgentTaskProgress(coderDone, input({ role: 'reviewer', agentRunId: 'reviewer-1' }))
    const next = await reconcileWorkflowAgentTasks(reviewing, async () => null, '2026-09-17T08:10:00.000Z')
    expect(next.runStatus).toBe('blocked')
    expect(next.blockedReason).toContain('B1::reviewer')
    expect(next.activePhaseId).toBe('feature-implement')
    expect(next.runtimeContract!.phaseStates['feature-implement']!.taskSnapshots[0]!.status).toBe('succeeded')
    expect(next.runtimeContract!.phaseStates['feature-implement']!.taskSnapshots[1]!.status).toBe('interrupted')
    expect(await reconcileWorkflowAgentTasks(next, async () => null, '2026-09-17T08:11:00.000Z')).toBe(next)
  })

  test('repairs an old active fixture with already interrupted tasks without changing user-wait or terminal states', async () => {
    const old = recordWorkflowAgentTaskProgress(state(), input())
    old.runtimeContract!.phaseStates['feature-implement']!.taskSnapshots[0]!.status = 'interrupted'
    old.runStatus = 'active'
    old.workflowLanguage = 'zh'
    const recovered = await reconcileWorkflowAgentTasks(old, async () => null, '2026-09-17T08:10:00.000Z')
    expect(recovered.runStatus).toBe('blocked')
    expect(recovered.blockedReason).toContain('已中断')
    for (const runStatus of ['waiting_for_user', 'completed', 'cancelled'] as const) {
      const retained = { ...old, runStatus }
      expect(await reconcileWorkflowAgentTasks(retained, async () => null, '2026-09-17T08:10:00.000Z')).toBe(retained)
    }
  })

  test('leaves a workflow without an active phase unchanged', async () => {
    const inactive = state()
    inactive.activePhaseId = null
    expect(await reconcileWorkflowAgentTasks(inactive, async () => null)).toBe(inactive)
  })

  test('does not invent a successful review from a completed ledger lacking the accepted review receipt', async () => {
    const coderDone = recordWorkflowAgentTaskProgress(recordWorkflowAgentTaskProgress(state(), input()), input({ status: 'succeeded' }))
    const reviewing = recordWorkflowAgentTaskProgress(coderDone, input({ role: 'reviewer', agentRunId: 'reviewer-1' }))
    const ledger = { schemaVersion: 1 as const, sessionId: reviewing.sessionId, runId: 'reviewer-1',
      status: 'completed' as const, startedAt: now, updatedAt: now, events: [], artifacts: [] }
    expect(await reconcileWorkflowAgentTasks(reviewing, async () => ledger,
      '2026-09-17T08:10:00.000Z', { ownerAlive: true })).toBe(reviewing)
    const recovered = await reconcileWorkflowAgentTasks(reviewing, async () => ledger, '2026-09-17T08:10:00.000Z')
    expect(recovered.runStatus).toBe('blocked')
    expect(recovered.runtimeContract!.phaseStates['feature-implement']!.taskSnapshots[1]!.status).toBe('interrupted')
    const coderRunning = recordWorkflowAgentTaskProgress(state(), input())
    const coderRecovered = await reconcileWorkflowAgentTasks(coderRunning, async () => ({ ...ledger, runId: 'agent-1' }), '2026-09-17T08:10:00.000Z')
    expect(coderRecovered.runtimeContract!.phaseStates['feature-implement']!.taskSnapshots[0]!.status).toBe('succeeded')
    expect(coderRecovered.runtimeContract!.phaseStates['feature-implement']!.taskSnapshots[0]!.outputArtifactRefs).toEqual([])
  })
})
