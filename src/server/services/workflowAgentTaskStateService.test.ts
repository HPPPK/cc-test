import { describe, expect, test } from 'bun:test'
import {
  recordWorkflowAgentTaskProgress,
  recordWorkflowAgentTaskProgressWithLedger,
  reconcileWorkflowAgentTasks,
  type WorkflowAgentTaskProgressInput,
} from './workflowAgentTaskStateService.js'
import type { WorkflowSessionState } from './workflowTypes.js'

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
          eligibility: 'blocked',
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
})
