import { describe, expect, it } from 'bun:test'
import {
  attachWorkflowContextCapsule,
  contextCapsulePrompt,
  createWorkflowContextCapsule,
} from './workflowContextCapsuleService.js'
import type { WorkflowSessionState } from './workflowTypes.js'

function state(): WorkflowSessionState {
  return {
    schemaVersion: 1,
    sessionId: 'session-1',
    mode: 'workflow',
    template: { id: 'feature-extension-workflow-v8', version: '20', source: 'pack', snapshotId: 'v20', sourceState: 'current' },
    templateIdentity: { id: 'feature-extension-workflow-v8', version: '20', source: 'pack' },
    sourceTemplateStatus: 'current',
    status: 'running',
    workflowStatus: 'running',
    activeWorkflowRunId: 'session-1-run-1',
    activePhaseId: 'feature-scope',
    phases: [
      { id: 'feature-scope', index: 0, status: 'running', artifactPointers: [{ kind: 'phase-artifact', sessionId: 'session-1', artifactId: 'feature-delta', schemaVersion: 1, createdAt: '2026-09-17T00:00:00.000Z' }] },
      { id: 'feature-implement', index: 1, status: 'created', artifactPointers: [] },
    ],
    phaseRuns: [],
    transitionHistory: [],
    artifactIndex: [],
    finalReportRef: null,
    stateVersion: 7,
    revision: 7,
    createdAt: '2026-09-17T00:00:00.000Z',
    updatedAt: '2026-09-17T00:00:00.000Z',
    runtimeContract: {
      schemaVersion: 1,
      migrationStatus: 'current',
      phaseStates: {
        'feature-scope': {
          phaseId: 'feature-scope',
          workStatus: 'ready-for-review',
          eligibility: 'eligible',
          blockerReasons: [],
          issues: [{
            id: 'issue-1', phaseId: 'feature-scope', sessionId: 'session-1', createdAt: '2026-09-17T00:00:00.000Z', updatedAt: '2026-09-17T00:00:00.000Z', source: 'runtime', status: 'resolved', blocksCompletion: false, blockingReason: 'old hypothesis excluded', createdStateVersion: 4,
          }],
          artifactRequirements: [], checks: [],
          taskSnapshots: [
            { taskId: 'task-1', sessionId: 'session-1', phaseId: 'feature-scope', stateVersion: 7, status: 'succeeded', updatedAt: '2026-09-17T00:00:00.000Z', batchId: 'B1', workflowRole: 'coder' },
            { taskId: 'task-2', sessionId: 'session-1', phaseId: 'feature-scope', stateVersion: 7, status: 'pending', updatedAt: '2026-09-17T00:00:00.000Z', batchId: 'B2', workflowRole: 'coder' },
          ],
          evaluatedAt: '2026-09-17T00:00:00.000Z',
        },
      },
      audit: [],
    },
  }
}

describe('workflow context capsule', () => {
  it('creates a stable structured handoff from accepted state and completion handoff', () => {
    const capsule = createWorkflowContextCapsule(state(), {
      fromPhaseId: 'feature-scope',
      toPhaseId: 'feature-implement',
      createdAt: '2026-09-17T01:00:00.000Z',
      handoff: {
        userRequirements: ['translate multiple subtitle files'],
        userDecisions: ['keep the current export format'],
        modifiedFiles: ['src/queue.ts'],
        verificationEvidence: ['fixture passes'],
        unresolvedRisks: ['provider quota'],
        nextActions: ['implement B2'],
      },
    })

    expect(capsule).toMatchObject({
      schemaVersion: 1,
      sessionId: 'session-1',
      runId: 'session-1-run-1',
      fromPhaseId: 'feature-scope',
      toPhaseId: 'feature-implement',
      sourceStateVersion: 7,
      userRequirements: ['translate multiple subtitle files'],
      userDecisions: ['keep the current export format'],
      completedTaskIds: ['task-1'],
      incompleteTaskIds: ['task-2'],
      modifiedFiles: ['src/queue.ts'],
      excludedIssues: ['old hypothesis excluded'],
      unresolvedRisks: ['provider quota'],
      nextActions: ['implement B2'],
    })
    expect(capsule.sourceHash).toMatch(/^sha256-[a-f0-9]{64}$/)
    expect(capsule.artifactRefs).toEqual([expect.objectContaining({ artifactId: 'feature-delta' })])
  })

  it('attaches one capsule idempotently and exposes only the active capsule to the next phase', () => {
    const session = state()
    const capsule = createWorkflowContextCapsule(session, {
      fromPhaseId: 'feature-scope',
      toPhaseId: 'feature-implement',
      createdAt: '2026-09-17T01:00:00.000Z',
      handoff: { summary: 'scope confirmed' },
    })

    attachWorkflowContextCapsule(session, capsule)
    attachWorkflowContextCapsule(session, capsule)

    expect(session.contextCapsules).toHaveLength(1)
    expect(session.activeContextCapsuleId).toBe(capsule.id)
    expect(session.nextPhaseContextStrategy).toBe('capsule')
    expect(contextCapsulePrompt(session)).toContain('scope confirmed')
    expect(contextCapsulePrompt(session)).not.toContain('future phase')
  })
})
