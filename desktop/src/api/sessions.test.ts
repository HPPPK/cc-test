import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkflowTransitionRequest } from './sessions'

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}))

vi.mock('./client', () => ({
  api: {
    get: getMock,
    post: postMock,
  },
}))

import { sessionsApi } from './sessions'

type AssertTrue<T extends true> = T
type AssertFalse<T extends false> = T
type IsOptionalNumberField<T, K extends keyof T> = {} extends Pick<T, K>
  ? [Exclude<T[K], undefined>] extends [number]
    ? [number] extends [Exclude<T[K], undefined>]
      ? true
      : false
    : false
  : false
type StateVersionContract = 'stateVersion' extends keyof WorkflowTransitionRequest
  ? IsOptionalNumberField<WorkflowTransitionRequest, 'stateVersion'>
  : false
type ExpectedStateVersionContract = 'expectedStateVersion' extends keyof WorkflowTransitionRequest
  ? true
  : false
type WorkflowTransitionRequestContract = {
  stateVersion: AssertTrue<StateVersionContract>
  expectedStateVersion: AssertFalse<ExpectedStateVersionContract>
}
const workflowTransitionRequestContract: WorkflowTransitionRequestContract = {
  stateVersion: true,
  expectedStateVersion: false,
}

const workflowSummary = {
  mode: 'workflow',
  templateId: 'requirements-to-implementation',
  templateVersion: '1',
  templateSource: 'builtin',
  templateSnapshotId: 'snapshot-1',
  status: 'created',
  activePhaseId: 'requirements-clarification',
  activePhaseIndex: 0,
  phaseCount: 5,
  pendingConfirmation: false,
  statePointer: {
    kind: 'workflow-state',
    sessionId: 'session-workflow-1',
    artifactId: 'state',
    schemaVersion: 1,
    createdAt: '2026-05-20T00:00:00.000Z',
  },
}

describe('sessionsApi workflow contract', () => {
  beforeEach(() => {
    getMock.mockReset()
    postMock.mockReset()
  })

  it('lists workflow templates from the workflow template endpoint', async () => {
    const response = {
      templates: [{
        id: 'requirements-to-implementation',
        source: 'builtin',
        version: '1',
        name: 'Requirements to Implementation',
        description: 'Guide a request from requirements to verification.',
        phaseCount: 5,
        firstPhaseId: 'requirements-clarification',
      }],
      invalidTemplates: [{
        source: 'user-config',
        templateId: 'broken-template',
        path: '$.templates[0].phases',
        code: 'WORKFLOW_TEMPLATE_INVALID_PHASES',
        message: 'Template phases must be a non-empty ordered array.',
        severity: 'error',
      }],
    }
    getMock.mockResolvedValue(response)

    const result = await (sessionsApi as any).listWorkflowTemplates()

    expect(getMock).toHaveBeenCalledWith('/api/workflows/templates')
    expect(result).toBe(response)
  })

  it('retrieves durable workflow state for a workflow session', async () => {
    const response = {
      workflow: workflowSummary,
      state: {
        schemaVersion: 1,
        sessionId: 'session-workflow-1',
        workflowStatus: 'created',
        activePhaseId: 'requirements-clarification',
        phases: [],
        phaseRuns: [],
      },
    }
    getMock.mockResolvedValue(response)

    const result = await (sessionsApi as any).getWorkflowState('session-workflow-1')

    expect(getMock).toHaveBeenCalledWith('/api/sessions/session-workflow-1/workflow')
    expect(result).toBe(response)
  })

  it('posts idempotent workflow transition requests', async () => {
    const transition = {
      phaseId: 'requirements-clarification',
      action: 'confirm',
      transitionId: 'transition-1',
      stateVersion: 3,
    }
    const response = {
      ok: true,
      workflow: {
        ...workflowSummary,
        status: 'running',
        activePhaseId: 'technical-design',
        activePhaseIndex: 1,
      },
    }
    postMock.mockResolvedValue(response)

    const result = await (sessionsApi as any).transitionWorkflow('session-workflow-1', transition)

    expect(postMock).toHaveBeenCalledWith(
      '/api/sessions/session-workflow-1/workflow/transition',
      transition,
    )
    expect(result).toBe(response)
  })

  it('declares stateVersion as the canonical workflow transition request version field', () => {
    expect(workflowTransitionRequestContract).toEqual({
      stateVersion: true,
      expectedStateVersion: false,
    })
  })

  it('retrieves the final workflow report when available', async () => {
    const response = {
      report: {
        schemaVersion: 1,
        sessionId: 'session-workflow-1',
        templateId: 'requirements-to-implementation',
        summary: 'Completed workflow.',
      },
      pointer: {
        kind: 'final-report',
        sessionId: 'session-workflow-1',
        artifactId: 'final-report',
        schemaVersion: 1,
        createdAt: '2026-05-20T00:00:00.000Z',
      },
    }
    getMock.mockResolvedValue(response)

    const result = await (sessionsApi as any).getWorkflowReport('session-workflow-1')

    expect(getMock).toHaveBeenCalledWith('/api/sessions/session-workflow-1/workflow/report')
    expect(result).toBe(response)
  })

  it('serializes workflow create options when supplied', async () => {
    postMock.mockResolvedValue({ sessionId: 'session-workflow-1', workflow: workflowSummary })

    await (sessionsApi as any).create({
      workDir: '/workspace/repo',
      workflow: {
        templateId: 'requirements-to-implementation',
        templateSource: 'builtin',
        initialPhaseId: 'requirements-clarification',
      },
    })

    expect(postMock).toHaveBeenCalledWith('/api/sessions', {
      workDir: '/workspace/repo',
      workflow: {
        templateId: 'requirements-to-implementation',
        templateSource: 'builtin',
        initialPhaseId: 'requirements-clarification',
      },
    })
  })

  it('keeps dialogue create serialization unchanged when workflow is omitted', async () => {
    postMock.mockResolvedValue({ sessionId: 'session-dialogue-1', workDir: '/workspace/repo' })

    await sessionsApi.create({
      workDir: '/workspace/repo',
      repository: { branch: 'feature/rail', worktree: false },
    })

    expect(postMock).toHaveBeenCalledWith('/api/sessions', {
      workDir: '/workspace/repo',
      repository: { branch: 'feature/rail', worktree: false },
    })
  })
})
