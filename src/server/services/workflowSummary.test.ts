import { describe, expect, test } from 'bun:test'
import { workflowSummaryFromState } from './workflowSummary.js'
import type { WorkflowSessionState } from './workflowTypes.js'

function makeState(overrides: Partial<WorkflowSessionState> = {}): WorkflowSessionState {
  const now = '2026-05-20T00:00:00.000Z'
  return {
    schemaVersion: 1,
    sessionId: 'workflow-summary-test',
    mode: 'workflow',
    template: {
      id: 'requirements-to-implementation',
      version: '1',
      source: 'builtin',
      snapshotId: 'requirements-to-implementation-v1',
      sourceState: 'current',
    },
    templateSnapshot: {
      schemaVersion: 1,
      id: 'requirements-to-implementation',
      source: 'builtin',
      version: '1',
      displayName: 'Requirements to Implementation',
      description: 'Workflow summary test fixture.',
      phases: [
        {
          id: 'requirements-clarification',
          label: 'Requirements Clarification',
          instructions: 'Clarify requirements.',
          requestedModel: null,
          skillDeclarations: [],
          requiredArtifacts: [],
          completionCriteria: { type: 'manual-checklist' },
          transitionAuthority: 'user-confirmation',
        },
        {
          id: 'technical-design',
          label: 'Technical Design',
          instructions: 'Design the implementation.',
          requestedModel: null,
          skillDeclarations: [],
          requiredArtifacts: [],
          completionCriteria: { type: 'manual-checklist' },
          transitionAuthority: 'user-confirmation',
        },
      ],
    },
    templateIdentity: {
      id: 'requirements-to-implementation',
      source: 'builtin',
      version: '1',
      registryKey: 'builtin:requirements-to-implementation',
    },
    sourceTemplateStatus: 'current',
    status: 'pending-confirmation',
    workflowStatus: 'pending-confirmation',
    activePhaseId: 'requirements-clarification',
    phases: [
      {
        id: 'requirements-clarification',
        index: 0,
        status: 'pending-confirmation',
        artifactPointers: [],
      },
      {
        id: 'technical-design',
        index: 1,
        status: 'created',
        artifactPointers: [],
      },
    ],
    phaseRuns: [],
    transitionHistory: [],
    artifactIndex: [],
    finalReportRef: null,
    stateVersion: 2,
    revision: 2,
    createdAt: now,
    updatedAt: now,
    pendingConfirmation: {
      confirmationId: 'confirm-1',
      phaseId: 'requirements-clarification',
      fromPhaseId: 'requirements-clarification',
      toPhaseId: 'technical-design',
      completionCheckId: 'requirements-clarification',
      artifactRefs: [],
      createdAt: now,
      status: 'pending',
    },
    ...overrides,
  }
}

describe('workflowSummaryFromState', () => {
  test('projects internal workflow state into the desktop workflow summary contract', () => {
    const summary = workflowSummaryFromState(makeState())

    expect(summary).toMatchObject({
      mode: 'workflow',
      templateId: 'requirements-to-implementation',
      templateVersion: '1',
      templateSource: 'builtin',
      status: 'pending-confirmation',
      activePhaseId: 'requirements-clarification',
      activePhaseIndex: 0,
      phaseCount: 2,
      pendingConfirmation: true,
      transitionAuthority: 'user-confirmation',
      statePointer: {
        kind: 'workflow-state',
        sessionId: 'workflow-summary-test',
        artifactId: 'state',
      },
    })
    expect(summary).not.toHaveProperty('phases')
    expect(summary).not.toHaveProperty('templateSnapshot')
  })

  test('reports the next active phase after confirmation', () => {
    const summary = workflowSummaryFromState(makeState({
      status: 'running',
      workflowStatus: 'running',
      activePhaseId: 'technical-design',
      pendingConfirmation: null,
      phases: [
        {
          id: 'requirements-clarification',
          index: 0,
          status: 'completed',
          artifactPointers: [],
        },
        {
          id: 'technical-design',
          index: 1,
          status: 'running',
          artifactPointers: [],
        },
      ],
    }))

    expect(summary).toMatchObject({
      status: 'running',
      activePhaseId: 'technical-design',
      activePhaseIndex: 1,
      pendingConfirmation: false,
    })
  })
})
