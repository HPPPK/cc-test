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
    createdAt: '2026-05-20T00:00:00.000Z',
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
    const summary = workflowSummaryFromState(makeState({
      stateVersion: 7,
      revision: 2,
    }))

    expect(summary).toMatchObject({
      mode: 'workflow',
      templateId: 'requirements-to-implementation',
      templateVersion: '1',
      templateSource: 'builtin',
      status: 'pending-confirmation',
      activePhaseId: 'requirements-clarification',
      activePhaseIndex: 0,
      phaseCount: 2,
      stateVersion: 7,
      pendingConfirmation: true,
      pendingConfirmationId: 'confirm-1',
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


  test('normalizes stale running state with pending confirmation into a waiting confirmation summary', () => {
    const summary = workflowSummaryFromState(makeState({
      status: 'running',
      workflowStatus: 'running',
      runStatus: 'active',
      activePhaseId: 'delegate-implement',
      phases: [
        { id: 'requirements-clarification', index: 0, status: 'completed', artifactPointers: [] },
        { id: 'delegate-implement', index: 1, status: 'running', artifactPointers: [] },
      ],
      pendingConfirmation: {
        confirmationId: 'confirm-stale-running',
        phaseId: 'delegate-implement',
        fromPhaseId: 'delegate-implement',
        toPhaseId: 'review',
        completionCheckId: 'delegate-implement',
        artifactRefs: [],
        createdAt: '2026-05-20T00:00:00.000Z',
        status: 'pending',
      },
    }))

    expect(summary).toMatchObject({
      status: 'pending-confirmation',
      runStatus: 'waiting_for_user',
      activePhaseId: 'delegate-implement',
      pendingConfirmation: true,
    })
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

  test('projects a pending non-linear route target for Desktop confirmation cards', () => {
    const state = makeState({
      workflowStatus: 'pending-confirmation',
      status: 'pending-confirmation',
      activePhaseId: 'technical-design',
      pendingRoute: {
        routeId: 'route-stage-4',
        phaseId: 'technical-design',
        fromPhaseId: 'technical-design',
        targetPhaseId: 'delegate-implement',
        approvedTargetPhaseId: 'delegate-implement',
        intent: 'jump_to_phase',
        rationale: 'Return to implementation for a repair.',
        evidence: [],
        createdAt: '2026-05-20T00:00:00.000Z',
        requiresConfirmation: true,
        status: 'pending',
      },
      phases: [
        { id: 'requirements-clarification', index: 0, status: 'completed', artifactPointers: [] },
        { id: 'technical-design', index: 1, status: 'pending-confirmation', artifactPointers: [] },
        { id: 'delegate-implement', label: '分批实现与审查', index: 3, status: 'created', artifactPointers: [] },
      ],
    })

    expect(workflowSummaryFromState(state)).toMatchObject({
      pendingTargetPhaseId: 'delegate-implement',
      pendingTargetPhaseIndex: 3,
      pendingTargetPhaseLabel: '分批实现与审查',
      pendingConfirmationId: 'route-stage-4',
      routeReason: 'Return to implementation for a repair.',
      requiresConfirmation: true,
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
