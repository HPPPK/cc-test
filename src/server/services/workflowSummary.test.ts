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


  test('projects an active automatic recovery window for the Desktop silent period', () => {
    const summary = workflowSummaryFromState(makeState({
      status: 'running',
      workflowStatus: 'running',
      runStatus: 'blocked',
      pendingConfirmation: null,
      autoRecovery: {
        phaseId: 'requirements-clarification',
        startedAt: '2026-05-20T00:00:00.000Z',
        expiresAt: '2026-05-20T00:00:10.000Z',
        attempt: 1,
        source: 'phase-completion-blocked',
      },
    }))

    expect(summary).toMatchObject({
      status: 'failed',
      runStatus: 'blocked',
      autoRecovery: {
        phaseId: 'requirements-clarification',
        attempt: 1,
        source: 'phase-completion-blocked',
      },
    })
  })

  test('fails closed for a legacy state that contains both a blocker and a next-phase confirmation', () => {
    const summary = workflowSummaryFromState(makeState({
      status: 'pending-confirmation',
      workflowStatus: 'pending-confirmation',
      runStatus: 'blocked',
      blockedReason: 'B4 verification is blocked and must be retried.',
    }))

    expect(summary).toMatchObject({
      status: 'failed',
      runStatus: 'blocked',
      pendingConfirmation: false,
      blockedReason: 'B4 verification is blocked and must be retried.',
    })
    expect(summary).not.toHaveProperty('pendingConfirmationId')
  })

})

describe('workflow summary runtime provenance and blocked evidence', () => {
  test.each(['phase-request', 'main-session-default', 'none'] as const)('preserves authoritative active model source %s over historical phase models', (source) => {
    const resolution = {
      requestedModel: 'phase-opus',
      actualModel: source === 'none' ? null : 'main-session-sonnet',
      providerId: null,
      source,
      fallbackApplied: source === 'main-session-default',
      fallbackReason: source === 'main-session-default' ? 'Requested model unavailable.' : null,
      resolvedAt: '2026-10-23T03:00:00.000Z',
    }
    const state = makeState({ activeModelResolution: resolution })
    state.phases[0]!.requestedModel = 'old-phase-model'
    state.phases[0]!.actualModel = 'old-actual-model'
    expect(workflowSummaryFromState(state).model).toEqual(resolution)
  })

  test('reports no model source when resolution failed before an active model was recorded', () => {
    const state = makeState({ pendingConfirmation: null, runStatus: 'blocked' })
    state.phases[0]!.requestedModel = 'unavailable-model'
    state.phases[0]!.actualModel = null
    state.phases[0]!.blockedReason = 'No workflow phase model can be resolved.'
    expect(workflowSummaryFromState(state).model).toMatchObject({
      requestedModel: 'unavailable-model',
      actualModel: null,
      source: 'none',
      fallbackApplied: false,
    })
  })

  function blockedArtifact(status: 'blocked' | 'unable', artifactId = 'blocked-evidence') {
    return {
      kind: 'phase-artifact' as const,
      sessionId: 'workflow-summary-test',
      artifactId,
      schemaVersion: 1,
      createdAt: '2026-10-23T03:00:00.000Z',
      updatedAt: '2026-10-23T03:00:00.000Z',
      label: 'Blocked evidence',
      phaseId: 'requirements-clarification',
      title: 'Requirements blocker',
      submission: {
        phaseId: 'requirements-clarification',
        stateVersion: 2,
        status,
        rationale: 'An OAuth account must be selected.',
        handoff: { summary: 'Account selection missing.', artifacts: [], next: 'Select an account.' },
        evidence: [{ kind: 'runtime-status', label: 'Missing account', ref: 'OAuth account selection' }],
      },
    }
  }

  test.each(['blocked', 'unable'] as const)('includes %s evidence and a compact artifact in the public summary', (status) => {
    const state = makeState({ pendingConfirmation: null, runStatus: 'blocked', blockedReason: 'Older reason.' })
    state.phases[0]!.artifactPointers = [blockedArtifact(status)]
    const summary = workflowSummaryFromState(state)
    expect(summary).toMatchObject({
      blockedReason: 'An OAuth account must be selected.',
      blockedStatus: status,
      blockedEvidence: [{ kind: 'runtime-status', label: 'Missing account', ref: 'OAuth account selection' }],
      blockedArtifact: {
        artifactId: 'blocked-evidence',
        phaseId: 'requirements-clarification',
        status,
        label: 'Requirements blocker',
        handoffSummary: 'Account selection missing.',
        evidenceSummary: 'OAuth account selection',
        createdAt: '2026-10-23T03:00:00.000Z',
        transitionId: 'blocked-evidence',
        completionId: 'blocked-evidence',
        provenance: status === 'blocked' ? 'agent-blocked' : 'agent-unable',
      },
    })
    expect(summary).not.toHaveProperty('phases')
    expect(Reflect.get(summary, 'blockedArtifact')).not.toHaveProperty('submission')
  })

  test('uses only the latest blocked artifact from the active phase', () => {
    const state = makeState({ pendingConfirmation: null, runStatus: 'blocked' })
    state.phases[0]!.artifactPointers = [blockedArtifact('blocked', 'old'), blockedArtifact('unable', 'latest')]
    state.phases[1]!.artifactPointers = [blockedArtifact('blocked', 'other-phase')]
    expect(workflowSummaryFromState(state)).toMatchObject({
      blockedStatus: 'unable',
      blockedArtifact: { artifactId: 'latest' },
    })
  })

  test('ignores malformed and ready submissions instead of projecting them as blockers', () => {
    const state = makeState({ pendingConfirmation: null })
    const artifact = blockedArtifact('blocked')
    state.phases[0]!.artifactPointers = [
      { ...artifact, submission: null },
      { ...artifact, submission: [] },
      { ...artifact, submission: { ...artifact.submission, status: 'ready' } },
      { ...artifact, submission: { ...artifact.submission, evidence: null } },
    ] as unknown as WorkflowSessionState['phases'][number]['artifactPointers']
    const summary = workflowSummaryFromState(state)
    expect(summary).not.toHaveProperty('blockedStatus')
    expect(summary).not.toHaveProperty('blockedEvidence')
  })

  test.each([
    { handoff: undefined },
    { handoff: null },
    { handoff: [] },
    { evidence: [null] },
    { evidence: ['untrusted evidence'] },
    { phaseId: undefined },
    { phaseId: 'technical-design' },
  ])('skips malformed persisted blocker submissions and preserves a previous valid blocker: %j', (override) => {
    const state = makeState({ pendingConfirmation: null, runStatus: 'blocked' })
    const valid = blockedArtifact('blocked', 'previous-valid')
    state.phases[0]!.artifactPointers = [valid, {
      ...blockedArtifact('unable', 'malformed-latest'),
      submission: { ...valid.submission, ...override },
    }] as unknown as WorkflowSessionState['phases'][number]['artifactPointers']
    expect(() => workflowSummaryFromState(state)).not.toThrow()
    expect(workflowSummaryFromState(state)).toMatchObject({
      blockedStatus: 'blocked',
      blockedArtifact: { artifactId: 'previous-valid' },
    })
  })

  test('skips null and array persisted pointers before examining their submissions', () => {
    const state = makeState({ pendingConfirmation: null, runStatus: 'blocked' })
    state.phases[0]!.artifactPointers = [blockedArtifact('blocked', 'valid'), null, []] as unknown as WorkflowSessionState['phases'][number]['artifactPointers']
    expect(() => workflowSummaryFromState(state)).not.toThrow()
    expect(workflowSummaryFromState(state)).toMatchObject({
      blockedArtifact: { artifactId: 'valid' },
    })
  })

  test('suppresses old blocked evidence while a valid confirmation is pending', () => {
    const state = makeState()
    state.phases[0]!.artifactPointers = [blockedArtifact('blocked')]
    const summary = workflowSummaryFromState(state)
    expect(summary.pendingConfirmation).toBe(true)
    expect(summary).not.toHaveProperty('blockedReason')
    expect(summary).not.toHaveProperty('blockedStatus')
    expect(summary).not.toHaveProperty('blockedEvidence')
    expect(summary).not.toHaveProperty('blockedArtifact')
  })
})
