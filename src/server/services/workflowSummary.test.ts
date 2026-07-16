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
        label: 'Requirements Clarification',
        transitionAuthority: 'user-confirmation',
        index: 0,
        status: 'pending-confirmation',
        artifactPointers: [],
      },
      {
        id: 'technical-design',
        label: 'Technical Design',
        transitionAuthority: 'user-confirmation',
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

  test('summarizes active phase recommended skill availability and bounded evidence', () => {
    const summary = workflowSummaryFromState(makeState({
      phaseSkillSnapshots: [
        {
          phaseId: 'requirements-clarification',
          references: [
            { name: 'requirements-review', mode: 'recommended', source: 'project' },
            { name: 'missing-audit', mode: 'recommended', source: 'user' },
            { name: 'ambiguous-helper', mode: 'recommended', source: 'plugin' },
          ],
          resolutions: [
            {
              reference: { name: 'requirements-review', mode: 'recommended', source: 'project' },
              status: 'available',
              checkedAt: '2026-05-20T00:00:00.000Z',
              resolvedSkill: {
                name: 'requirements-review',
                source: 'project',
              },
            },
            {
              reference: { name: 'missing-audit', mode: 'recommended', source: 'user' },
              status: 'missing',
              checkedAt: '2026-05-20T00:00:00.000Z',
            },
            {
              reference: { name: 'ambiguous-helper', mode: 'recommended', source: 'plugin' },
              status: 'ambiguous',
              checkedAt: '2026-05-20T00:00:00.000Z',
            },
          ],
          snapshottedAt: '2026-05-20T00:00:00.000Z',
        },
      ],
      phaseSkillEvidence: [
        {
          phaseId: 'requirements-clarification',
          name: 'requirements-review',
          outcome: 'used',
          rationale: 'Applied the ambiguity checklist.',
          recordedAt: '2026-05-20T00:01:00.000Z',
          source: 'project',
          resolutionStatus: 'available',
        },
        {
          phaseId: 'requirements-clarification',
          name: 'missing-audit',
          outcome: 'relevant-unavailable',
          rationale: 'Audit help was relevant but missing.',
          recordedAt: '2026-05-20T00:01:30.000Z',
          source: 'user',
          resolutionStatus: 'missing',
        },
      ],
    } as Partial<WorkflowSessionState>))

    expect(summary.recommendedSkillStatus).toMatchObject({
      total: 3,
      available: 1,
      unavailable: 1,
      degraded: 1,
      evidenceCount: 2,
      activePhaseItems: [
        expect.objectContaining({
          name: 'requirements-review',
          status: 'available',
          source: 'project',
        }),
        expect.objectContaining({
          name: 'missing-audit',
          status: 'missing',
          source: 'user',
        }),
        expect.objectContaining({
          name: 'ambiguous-helper',
          status: 'ambiguous',
          source: 'plugin',
        }),
      ],
    })
    expect(summary).not.toHaveProperty('recommendedSkillChecklist')
  })
})
