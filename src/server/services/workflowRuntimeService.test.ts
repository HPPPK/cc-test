import { describe, expect, test } from 'bun:test'
import type {
  CompletionSubmission,
  WorkflowSessionState,
  WorkflowTemplate,
  WorkflowTransitionRequest,
} from './workflowTypes.js'

const NOW = '2026-05-20T00:00:00.000Z'
const SESSION_ID = 'workflow-runtime-service-test'

type WorkflowRuntimeServiceContract = {
  startPhase(input: {
    state: WorkflowSessionState
    requestedAt: string
    resolveDefaultModel: () => Promise<{ providerId: string | null; modelId: string | null }>
    isRequestedModelAvailable: (modelId: string) => Promise<boolean>
  }): Promise<{
    state: WorkflowSessionState
    notifications: Array<Record<string, unknown>>
  }>
  assemblePrompt(input: {
    state: WorkflowSessionState
    userMessage: string
    priorArtifactSummaries?: string[]
  }): Promise<{
    content: string
    skillProvenance: unknown[]
    scheduledToolCalls?: unknown[]
  }>
  applyTransition(input: {
    state: WorkflowSessionState
    request: WorkflowTransitionRequest
    requestedAt: string
    completion?: {
      passed: boolean
      blockedReason?: string
      artifactPointers?: unknown[]
    }
  }): Promise<{
    state: WorkflowSessionState
    notifications: Array<Record<string, unknown>>
  }>
  submitPhaseCompletion(input: {
    state: WorkflowSessionState
    submission: CompletionSubmission
    requestedAt: string
    transitionId?: string
  }): Promise<{
    status: 'pending' | 'recorded'
    state: WorkflowSessionState
    artifact: Record<string, unknown>
    notifications: Array<Record<string, unknown>>
  }>
}

async function makeService(): Promise<WorkflowRuntimeServiceContract> {
  const mod = await import('./workflowRuntimeService.js')
  return new mod.WorkflowRuntimeService() as WorkflowRuntimeServiceContract
}

function makeTemplate(overrides: Partial<WorkflowTemplate> = {}): WorkflowTemplate {
  return {
    schemaVersion: 1,
    id: 'requirements-to-implementation',
    source: 'builtin',
    version: '1',
    displayName: 'Requirements to implementation',
    description: 'Linear workflow fixture',
    phases: [
      {
        id: 'requirements',
        label: 'Requirements',
        instructions: 'Clarify the user-visible requirements and write acceptance criteria.',
        requestedModel: 'anthropic:claude-opus-4',
        skillDeclarations: [
          {
            id: 'requirements-review',
            source: 'template',
            guidance: 'Use a checklist and cite unresolved assumptions.',
          },
        ],
        requiredArtifacts: [
          {
            id: 'requirements-md',
            kind: 'markdown',
            description: 'Accepted requirements document',
            required: true,
          },
        ],
        completionCriteria: ['requirements artifact exists'],
        transitionAuthority: 'auto',
      },
      {
        id: 'implementation',
        label: 'Implementation',
        instructions: 'Implement the accepted requirements.',
        requestedModel: null,
        skillDeclarations: [],
        requiredArtifacts: [],
        completionCriteria: ['implementation evidence exists'],
        transitionAuthority: 'user-confirmation',
      },
    ],
    ...overrides,
  }
}

function pointer(artifactId: string) {
  return {
    kind: 'phase-artifact' as const,
    sessionId: SESSION_ID,
    artifactId,
    schemaVersion: 1,
    createdAt: NOW,
  }
}

function completionSubmission(
  overrides: Partial<CompletionSubmission> = {},
): CompletionSubmission {
  return {
    phaseId: 'requirements',
    stateVersion: 1,
    status: 'ready',
    handoff: {
      summary: 'Requirements phase is ready for confirmation.',
      artifacts: ['requirements-md'],
      next: 'Confirm or reject the pending completion.',
    },
    rationale: 'All required requirements artifacts were produced.',
    evidence: [
      {
        kind: 'artifact',
        label: 'Requirements',
        ref: '.specify/features/004-workflow-session-mode/spec.md',
      },
    ],
    ...overrides,
  }
}

function makeState(overrides: Partial<WorkflowSessionState> = {}): WorkflowSessionState {
  const template = makeTemplate()
  return {
    schemaVersion: 1,
    sessionId: SESSION_ID,
    mode: 'workflow',
    template: {
      id: template.id,
      version: String(template.version),
      source: template.source,
      snapshotId: 'snapshot-1',
      sourceState: 'current',
    },
    templateSnapshot: template,
    templateIdentity: {
      id: template.id,
      source: template.source,
      version: template.version,
      registryKey: 'builtin:requirements-to-implementation',
      contentHash: 'fixture-hash',
    },
    sourceTemplateStatus: 'current',
    status: 'created',
    workflowStatus: 'created',
    activePhaseId: 'requirements',
    phases: [
      {
        id: 'requirements',
        index: 0,
        status: 'created',
        artifactPointers: [],
      },
      {
        id: 'implementation',
        index: 1,
        status: 'created',
        artifactPointers: [],
      },
    ],
    phaseRuns: [],
    transitionHistory: [],
    artifactIndex: [],
    finalReportRef: null,
    stateVersion: 1,
    revision: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

function recommendedSkillRuntimeState(): WorkflowSessionState {
  const template = makeTemplate({
    phases: [
      {
        id: 'requirements',
        label: 'Requirements',
        instructions: 'Clarify the user-visible requirements and write acceptance criteria.',
        requestedModel: null,
        skills: [
          {
            name: 'requirements-review',
            mode: 'recommended',
            source: 'project',
            reason: 'Use for requirements ambiguity checks.',
          },
          {
            name: 'missing-audit',
            mode: 'recommended',
            source: 'user',
            reason: 'Use if the phase needs unavailable audit help.',
          },
        ],
        skillDeclarations: [],
        requiredArtifacts: [],
        completionCriteria: ['requirements artifact exists'],
        transitionAuthority: 'user-confirmation',
      },
      {
        id: 'implementation',
        label: 'Implementation',
        instructions: 'Implement the accepted requirements.',
        requestedModel: null,
        skillDeclarations: [],
        requiredArtifacts: [],
        completionCriteria: ['implementation evidence exists'],
        transitionAuthority: 'user-confirmation',
      },
    ],
  })

  return makeState({
    workflowStatus: 'running',
    templateSnapshot: template,
    phases: [
      {
        id: 'requirements',
        index: 0,
        status: 'running',
        artifactPointers: [],
      },
      {
        id: 'implementation',
        index: 1,
        status: 'created',
        artifactPointers: [],
      },
    ],
    phaseSkillSnapshots: [
      {
        phaseId: 'requirements',
        references: template.phases[0].skills,
        resolutions: [
          {
            reference: template.phases[0].skills?.[0],
            status: 'available',
            checkedAt: NOW,
            resolvedSkill: {
              name: 'requirements-review',
              displayName: 'Requirements Review',
              source: 'project',
            },
          },
          {
            reference: template.phases[0].skills?.[1],
            status: 'missing',
            checkedAt: NOW,
            diagnostic: {
              code: 'skill-not-found',
              severity: 'warning',
              message: 'missing-audit is not installed.',
            },
          },
        ],
        snapshottedAt: NOW,
        templateContentHash: 'fixture-hash',
        resolverVersion: 'test-resolver-v1',
      },
    ],
  } as Partial<WorkflowSessionState>)
}

function recommendedSkillTemplateState(): WorkflowSessionState {
  const state = recommendedSkillRuntimeState()
  delete (state as Record<string, unknown>).phaseSkillSnapshots
  return state
}

describe('WorkflowRuntimeService', () => {
  test('falls back visibly from an unavailable requested phase model to the main session default', async () => {
    const service = await makeService()

    const result = await service.startPhase({
      state: makeState(),
      requestedAt: '2026-05-20T00:01:00.000Z',
      isRequestedModelAvailable: async () => false,
      resolveDefaultModel: async () => ({ providerId: 'anthropic', modelId: 'claude-sonnet-4' }),
    })

    expect(result.state.workflowStatus).toBe('running')
    expect(result.state.activePhaseId).toBe('requirements')
    expect(result.state.phases[0]).toMatchObject({
      status: 'running',
      requestedModel: 'anthropic:claude-opus-4',
      actualModel: 'claude-sonnet-4',
      fallbackReason: expect.stringContaining('anthropic:claude-opus-4'),
    })
    expect(result.notifications).toContainEqual(expect.objectContaining({
      type: 'system_notification',
      subtype: 'workflow_state',
      data: expect.objectContaining({
        sessionId: SESSION_ID,
        stateVersion: 2,
      }),
    }))
  })

  test('blocks without advancing when neither requested nor fallback model can be resolved', async () => {
    const service = await makeService()

    const result = await service.startPhase({
      state: makeState(),
      requestedAt: '2026-05-20T00:01:00.000Z',
      isRequestedModelAvailable: async () => false,
      resolveDefaultModel: async () => ({ providerId: null, modelId: null }),
    })

    expect(result.state.workflowStatus).toBe('failed')
    expect(result.state.activePhaseId).toBe('requirements')
    expect(result.state.phases[0]).toMatchObject({
      status: 'failed',
      requestedModel: 'anthropic:claude-opus-4',
      actualModel: undefined,
      blockedReason: expect.stringContaining('model'),
    })
    expect(result.notifications).toContainEqual(expect.objectContaining({
      type: 'system_notification',
      subtype: 'workflow_blocked',
      data: expect.objectContaining({
        sessionId: SESSION_ID,
        phaseId: 'requirements',
        retryable: true,
      }),
    }))
  })

  test('assembles workflow phase prompt guidance with artifacts, skills, and model fallback context', async () => {
    const service = await makeService()
    const state = makeState({
      workflowStatus: 'running',
      phases: [
        {
          id: 'requirements',
          index: 0,
          status: 'running',
          requestedModel: 'anthropic:claude-opus-4',
          actualModel: 'claude-sonnet-4',
          fallbackReason: 'Requested model unavailable; using main session default.',
          skillProvenance: [
            {
              id: 'requirements-review',
              source: 'template',
              guidance: 'Use a checklist and cite unresolved assumptions.',
            },
          ],
          artifactPointers: [],
        },
        {
          id: 'implementation',
          index: 1,
          status: 'created',
          artifactPointers: [],
        },
      ],
    })

    const prompt = await service.assemblePrompt({
      state,
      userMessage: 'Please continue.',
      priorArtifactSummaries: ['Discovery notes are stored in artifact discovery-summary.'],
    })

    expect(prompt.content).toContain('Workflow mode')
    expect(prompt.content).toContain('requirements')
    expect(prompt.content).toContain('Clarify the user-visible requirements')
    expect(prompt.content).toContain('Accepted requirements document')
    expect(prompt.content).toContain('Discovery notes are stored in artifact discovery-summary.')
    expect(prompt.content).toContain('Use a checklist and cite unresolved assumptions.')
    expect(prompt.content).toContain('anthropic:claude-opus-4')
    expect(prompt.content).toContain('claude-sonnet-4')
    expect(prompt.content).toContain('Requested model unavailable')
    expect(prompt.content).toContain('Please continue.')
  })

  test('startPhase snapshots active phase recommended skill resolutions for resume-stable prompts', async () => {
    const service = await makeService()

    const result = await service.startPhase({
      state: recommendedSkillTemplateState(),
      requestedAt: '2026-05-20T00:01:00.000Z',
      isRequestedModelAvailable: async () => true,
      resolveDefaultModel: async () => ({ providerId: 'anthropic', modelId: 'claude-sonnet-4' }),
    })

    expect(result.state.phaseSkillSnapshots).toContainEqual(expect.objectContaining({
      phaseId: 'requirements',
      references: expect.arrayContaining([
        expect.objectContaining({ name: 'requirements-review', mode: 'recommended' }),
        expect.objectContaining({ name: 'missing-audit', mode: 'recommended' }),
      ]),
      resolutions: expect.arrayContaining([
        expect.objectContaining({
          reference: expect.objectContaining({ name: 'requirements-review' }),
          status: 'available',
        }),
        expect.objectContaining({
          reference: expect.objectContaining({ name: 'missing-audit' }),
          status: 'missing',
        }),
      ]),
      snapshottedAt: '2026-05-20T00:01:00.000Z',
      templateContentHash: 'fixture-hash',
    }))
  })

  test('assembles distinct active-phase recommended skills prompt block from persisted snapshot without scheduling SkillTool calls', async () => {
    const service = await makeService()

    const prompt = await service.assemblePrompt({
      state: recommendedSkillRuntimeState(),
      userMessage: 'Continue the requirements phase.',
    })

    expect(prompt.content).toContain('Active phase recommended skills')
    expect(prompt.content).toContain('Available recommendations')
    expect(prompt.content).toContain('Requirements Review')
    expect(prompt.content).toContain('Unavailable recommendations')
    expect(prompt.content).toContain('missing-audit')
    expect(prompt.content).toContain('Invoke recommended skills only when the current task matches')
    expect(prompt.content).not.toContain('unused recommended skill checklist')
    expect(prompt.scheduledToolCalls ?? []).toEqual([])
  })

  test('describes recommended-skill priority as attention-only runtime guidance', async () => {
    const service = await makeService()
    const state = recommendedSkillRuntimeState()
    const snapshot = state.phaseSkillSnapshots?.[0] as Record<string, unknown>
    const resolutions = snapshot.resolutions as Array<Record<string, unknown>>
    resolutions[0].reference = {
      name: 'requirements-review',
      mode: 'recommended',
      source: 'project',
      priority: 'high',
      reason: 'Treat this skill as especially relevant to ambiguity checks.',
    }

    const prompt = await service.assemblePrompt({
      state,
      userMessage: 'Continue the requirements phase.',
    })

    expect(prompt.content).toContain('higher priority')
    expect(prompt.content).toContain('attention')
    expect(prompt.content).toContain('not a safety override')
  })

  test('instructs the agent to record material used, skipped, and unavailable skill audit outcomes', async () => {
    const service = await makeService()

    const prompt = await service.assemblePrompt({
      state: recommendedSkillRuntimeState(),
      userMessage: 'Continue the requirements phase.',
    })

    expect(prompt.content).toContain('used')
    expect(prompt.content).toContain('relevant-skipped')
    expect(prompt.content).toContain('relevant-unavailable')
  })

  test('states recursion and auto-run guardrails for recommended skill invocation', async () => {
    const service = await makeService()

    const prompt = await service.assemblePrompt({
      state: recommendedSkillRuntimeState(),
      userMessage: 'Continue the requirements phase.',
    })

    expect(prompt.content).toContain('Do not invoke SkillTool automatically')
    expect(prompt.content).toContain('nested skill invocation')
    expect(prompt.content).toContain('depth')
    expect(prompt.scheduledToolCalls ?? []).toEqual([])
  })

  test('injects phase action guardrails into the active workflow prompt', async () => {
    const service = await makeService()
    const prompt = await service.assemblePrompt({
      state: makeState({
        workflowStatus: 'running',
        phases: [
          {
            id: 'requirements',
            index: 0,
            status: 'running',
            artifactPointers: [],
          },
          {
            id: 'implementation',
            index: 1,
            status: 'created',
            artifactPointers: [],
          },
        ],
        templateSnapshot: makeTemplate({
          phases: [
            {
              id: 'requirements',
              label: 'Requirements',
              instructions: 'Clarify the user-visible requirements and write acceptance criteria.',
              requestedModel: null,
              skillDeclarations: [],
              requiredArtifacts: [],
              completionCriteria: ['requirements accepted'],
              transitionAuthority: 'user-confirmation',
              actionPolicy: {
                allowedActions: [
                  'Ask clarifying questions',
                  'Summarize confirmed requirements',
                ],
                forbiddenActions: [
                  'Create, edit, or delete implementation files',
                  'Start implementation coding',
                ],
              },
            },
            {
              id: 'implementation',
              label: 'Implementation',
              instructions: 'Implement the accepted requirements.',
              requestedModel: null,
              skillDeclarations: [],
              requiredArtifacts: [],
              completionCriteria: ['implementation evidence exists'],
              transitionAuthority: 'user-confirmation',
              actionPolicy: {
                allowedActions: ['Create and edit scoped production, test, and documentation files'],
                forbiddenActions: ['Change requirements without returning to an earlier phase'],
              },
            },
          ],
        }),
      }),
      userMessage: 'The requirements are clear, build it now.',
    })

    expect(prompt.content).toContain('Phase action policy')
    expect(prompt.content).toContain('Allowed actions:')
    expect(prompt.content).toContain('- Ask clarifying questions')
    expect(prompt.content).toContain('Forbidden actions:')
    expect(prompt.content).toContain('- Create, edit, or delete implementation files')
    expect(prompt.content).toContain('Do not perform forbidden actions in this phase even if the user asks.')
  })

  test('injects phase handoff intake, output artifact, and stop rules into the active workflow prompt', async () => {
    const service = await makeService()
    const prompt = await service.assemblePrompt({
      state: makeState({
        workflowStatus: 'running',
        activePhaseId: 'requirements',
        phases: [
          {
            id: 'requirements',
            index: 0,
            status: 'running',
            artifactPointers: [],
          },
          {
            id: 'implementation',
            index: 1,
            status: 'created',
            artifactPointers: [],
          },
        ],
        templateSnapshot: makeTemplate({
          phases: [
            {
              id: 'requirements',
              label: 'Requirements',
              instructions: 'Clarify the user-visible requirements and write acceptance criteria.',
              requestedModel: null,
              skillDeclarations: [],
              requiredArtifacts: [],
              completionCriteria: ['requirements accepted'],
              transitionAuthority: 'user-confirmation',
              phasePrompt: {
                objective: 'Clarify and freeze the requested outcome before design.',
                handoffInput: [
                  'Use the user request and conversation context as the initial input.',
                  'If open questions remain, ask them before producing the handoff.',
                ],
                executionRules: [
                  'Discuss requirements only.',
                  'Do not design, plan, or implement.',
                ],
                outputArtifact: {
                  name: 'Requirements Brief',
                  sections: [
                    'User Goal',
                    'Confirmed Requirements',
                    'Acceptance Criteria',
                  ],
                },
                completionRules: [
                  'Output the Requirements Brief and stop.',
                  'Do not enter Phase 2 until the workflow transition is explicitly confirmed.',
                ],
              },
            },
            {
              id: 'implementation',
              label: 'Implementation',
              instructions: 'Implement the accepted requirements.',
              requestedModel: null,
              skillDeclarations: [],
              requiredArtifacts: [],
              completionCriteria: ['implementation evidence exists'],
              transitionAuthority: 'user-confirmation',
            },
          ],
        }),
      }),
      userMessage: 'The requirements are clear, build it now.',
    })

    expect(prompt.content).toContain('Phase handoff protocol')
    expect(prompt.content).toContain('Objective:')
    expect(prompt.content).toContain('Clarify and freeze the requested outcome before design.')
    expect(prompt.content).toContain('Handoff intake:')
    expect(prompt.content).toContain('- Use the user request and conversation context as the initial input.')
    expect(prompt.content).toContain('Execution rules:')
    expect(prompt.content).toContain('- Discuss requirements only.')
    expect(prompt.content).toContain('Required output artifact: Requirements Brief')
    expect(prompt.content).toContain('- User Goal')
    expect(prompt.content).toContain('- Acceptance Criteria')
    expect(prompt.content).toContain('Completion and stop rules:')
    expect(prompt.content).toContain('- Output the Requirements Brief and stop.')
    expect(prompt.content).toContain('- Do not enter Phase 2 until the workflow transition is explicitly confirmed.')
  })

  test('does not mutate dialogue sessions or assemble workflow prompt effects for non-workflow state', async () => {
    const service = await makeService()
    const dialogueState = {
      sessionId: 'dialogue-session',
      mode: 'dialogue',
    } as unknown as WorkflowSessionState

    await expect(service.assemblePrompt({
      state: dialogueState,
      userMessage: 'Normal chat',
    })).resolves.toEqual({
      content: 'Normal chat',
      skillProvenance: [],
    })
  })

  test('gates phase completion, enters pending confirmation, and advances only after confirmation', async () => {
    const service = await makeService()
    const runningState = makeState({
      workflowStatus: 'running',
      phases: [
        {
          id: 'requirements',
          index: 0,
          status: 'running',
          artifactPointers: [],
        },
        {
          id: 'implementation',
          index: 1,
          status: 'created',
          artifactPointers: [],
        },
      ],
    })

    const blocked = await service.applyTransition({
      state: runningState,
      requestedAt: '2026-05-20T00:02:00.000Z',
      request: { phaseId: 'requirements', action: 'retry', transitionId: 'retry-missing-artifact' },
      completion: {
        passed: false,
        blockedReason: 'Required artifact requirements-md is missing.',
      },
    })
    expect(blocked.state.activePhaseId).toBe('requirements')
    expect(blocked.state.phases[0]).toMatchObject({
      status: 'running',
      blockedReason: 'Required artifact requirements-md is missing.',
    })

    const pending = await service.applyTransition({
      state: blocked.state,
      requestedAt: '2026-05-20T00:03:00.000Z',
      request: { phaseId: 'requirements', action: 'retry', transitionId: 'retry-with-artifact' },
      completion: {
        passed: true,
        artifactPointers: [pointer('requirements-md')],
      },
    })
    expect(pending.state.workflowStatus).toBe('pending-confirmation')
    expect(pending.state.activePhaseId).toBe('requirements')
    expect(pending.state.pendingConfirmation).toMatchObject({
      phaseId: 'requirements',
      toPhaseId: 'implementation',
      status: 'pending',
    })

    const confirmed = await service.applyTransition({
      state: pending.state,
      requestedAt: '2026-05-20T00:04:00.000Z',
      request: { phaseId: 'requirements', action: 'confirm', transitionId: 'confirm-requirements' },
    })
    expect(confirmed.state.workflowStatus).toBe('running')
    expect(confirmed.state.activePhaseId).toBe('implementation')
    expect(confirmed.state.phases[0].status).toBe('completed')
    expect(confirmed.state.phases[1].status).toBe('running')
  })

  test('keeps retry transitions idempotent without duplicating artifacts or skipping phases', async () => {
    const service = await makeService()
    const state = makeState({
      workflowStatus: 'running',
      phases: [
        {
          id: 'requirements',
          index: 0,
          status: 'running',
          artifactPointers: [],
        },
        {
          id: 'implementation',
          index: 1,
          status: 'created',
          artifactPointers: [],
        },
      ],
    })

    const first = await service.applyTransition({
      state,
      requestedAt: '2026-05-20T00:03:00.000Z',
      request: { phaseId: 'requirements', action: 'retry', transitionId: 'retry-1' },
      completion: {
        passed: true,
        artifactPointers: [pointer('requirements-md')],
      },
    })
    const second = await service.applyTransition({
      state: first.state,
      requestedAt: '2026-05-20T00:04:00.000Z',
      request: { phaseId: 'requirements', action: 'retry', transitionId: 'retry-1' },
      completion: {
        passed: true,
        artifactPointers: [pointer('requirements-md')],
      },
    })

    expect(second.state.activePhaseId).toBe(first.state.activePhaseId)
    expect(second.state.phases[0].artifactPointers).toEqual([pointer('requirements-md')])
    expect(second.state.transitionHistory.filter((transition) =>
      transition.requestId === 'retry-1' || transition.transitionId === 'retry-1'
    )).toHaveLength(1)
  })

  describe('shared completion transition contract', () => {
    function runningState(overrides: Partial<WorkflowSessionState> = {}): WorkflowSessionState {
      return makeState({
        workflowStatus: 'running',
        status: 'running',
        phases: [
          {
            id: 'requirements',
            index: 0,
            status: 'running',
            artifactPointers: [],
          },
          {
            id: 'implementation',
            index: 1,
            status: 'created',
            artifactPointers: [],
          },
        ],
        ...overrides,
      })
    }

    function pendingArtifact(status: 'pending' | 'accepted' | 'rejected' | 'superseded' = 'pending') {
      return {
        ...pointer('requirements-ready-1'),
        lifecycleStatus: status,
        phaseId: 'requirements',
        title: 'Requirements phase completion',
      }
    }

    function pendingReadyState(overrides: Partial<WorkflowSessionState> = {}): WorkflowSessionState {
      const artifact = pendingArtifact()
      return runningState({
        workflowStatus: 'pending-confirmation',
        status: 'pending-confirmation',
        activePhaseId: 'requirements',
        phases: [
          {
            id: 'requirements',
            index: 0,
            status: 'pending-confirmation',
            artifactPointers: [artifact],
          },
          {
            id: 'implementation',
            index: 1,
            status: 'created',
            artifactPointers: [],
          },
        ],
        pendingConfirmation: {
          confirmationId: 'confirm-ready-1',
          phaseId: 'requirements',
          fromPhaseId: 'requirements',
          toPhaseId: 'implementation',
          completionCheckId: 'check-ready-1',
          artifactRefs: [artifact],
          createdAt: '2026-05-20T00:05:00.000Z',
          status: 'pending',
          submission: completionSubmission(),
        },
        stateVersion: 2,
        revision: 2,
        ...overrides,
      })
    }

    test('records ready completion as a pending artifact without advancing the active phase', async () => {
      const service = await makeService()

      const result = await service.submitPhaseCompletion({
        state: runningState(),
        requestedAt: '2026-05-20T00:05:00.000Z',
        transitionId: 'submit-ready-1',
        submission: completionSubmission(),
      })

      expect(result.status).toBe('pending')
      expect(result.state.workflowStatus).toBe('pending-confirmation')
      expect(result.state.activePhaseId).toBe('requirements')
      expect(result.state.phases[0]).toMatchObject({
        id: 'requirements',
        status: 'pending-confirmation',
      })
      expect(result.state.phases[1]).toMatchObject({
        id: 'implementation',
        status: 'created',
      })
      expect(result.state.pendingConfirmation).toMatchObject({
        phaseId: 'requirements',
        toPhaseId: 'implementation',
        status: 'pending',
        submission: completionSubmission(),
      })
      expect(result.artifact).toMatchObject({
        sessionId: SESSION_ID,
        phaseId: 'requirements',
        lifecycleStatus: 'pending',
        submission: completionSubmission(),
      })
      expect(result.state.transitionHistory).toContainEqual(expect.objectContaining({
        transitionId: 'submit-ready-1',
        action: 'confirmation-requested',
        result: 'accepted',
      }))
    })

    test.each([
      ['blocked', 'recorded'],
      ['unable', 'recorded'],
    ] as const)('records %s completion without creating pending confirmation or advancing', async (status, expectedStatus) => {
      const service = await makeService()

      const result = await service.submitPhaseCompletion({
        state: runningState(),
        requestedAt: '2026-05-20T00:06:00.000Z',
        transitionId: `submit-${status}-1`,
        submission: completionSubmission({
          status,
          rationale: status === 'blocked'
            ? 'External answer is required before this phase can complete.'
            : 'The phase cannot complete with available context.',
        }),
      })

      expect(result.status).toBe(expectedStatus)
      expect(result.state.workflowStatus).toBe('running')
      expect(result.state.activePhaseId).toBe('requirements')
      expect(result.state.pendingConfirmation).toBeNull()
      expect(result.artifact).toMatchObject({
        phaseId: 'requirements',
        lifecycleStatus: status,
      })
      expect(result.state.transitionHistory).toContainEqual(expect.objectContaining({
        transitionId: `submit-${status}-1`,
        result: status,
      }))
    })

    test.each([
      [
        'blocked',
        'missing rationale',
        { ...completionSubmission({ status: 'blocked' }), rationale: '' } as CompletionSubmission,
        'WORKFLOW_COMPLETION_INVALID',
      ],
      [
        'blocked',
        'missing handoff',
        { ...completionSubmission({ status: 'blocked' }), handoff: undefined } as unknown as CompletionSubmission,
        'WORKFLOW_COMPLETION_INVALID',
      ],
      [
        'unable',
        'missing evidence',
        { ...completionSubmission({ status: 'unable' }), evidence: undefined } as unknown as CompletionSubmission,
        'WORKFLOW_COMPLETION_INVALID',
      ],
      [
        'unable',
        'unsupported status alias',
        { ...completionSubmission(), status: 'blocked-until-user-replies' } as unknown as CompletionSubmission,
        'WORKFLOW_STATUS_UNSUPPORTED',
      ],
    ] as const)('rejects invalid %s completion payload: %s', async (_status, _name, submission, code) => {
      const service = await makeService()

      await expect(service.submitPhaseCompletion({
        state: runningState(),
        requestedAt: '2026-05-20T00:06:30.000Z',
        transitionId: `invalid-${_status}-${code}`,
        submission,
      })).rejects.toMatchObject({
        code,
      })
    })

    test.each([
      [
        'blocked',
        'The user must choose which OAuth account should own the workflow artifacts.',
        'OAuth account selection is missing.',
      ],
      [
        'unable',
        'The phase cannot continue because the referenced implementation notes are unavailable.',
        'Implementation notes could not be read.',
      ],
    ] as const)('persists %s reason and evidence while keeping the active phase unchanged', async (
      status,
      rationale,
      evidenceRef,
    ) => {
      const service = await makeService()
      const submission = completionSubmission({
        status,
        rationale,
        evidence: [
          {
            kind: 'runtime-status',
            label: `${status} evidence`,
            ref: evidenceRef,
          },
        ],
      })

      const result = await service.submitPhaseCompletion({
        state: runningState(),
        requestedAt: '2026-05-20T00:06:45.000Z',
        transitionId: `submit-${status}-evidence`,
        submission,
      })

      expect(result.status).toBe('recorded')
      expect(result.state.activePhaseId).toBe('requirements')
      expect(result.state.workflowStatus).toBe('running')
      expect(result.state.pendingConfirmation).toBeNull()
      expect(result.artifact).toMatchObject({
        phaseId: 'requirements',
        lifecycleStatus: status,
        submission: expect.objectContaining({
          status,
          rationale,
          evidence: submission.evidence,
        }),
      })
      const phaseArtifact = result.state.phases[0].artifactPointers.find((artifact) =>
        artifact.lifecycleStatus === status
      )
      expect(phaseArtifact).toBeDefined()
      expect(phaseArtifact?.submission?.status).toBe(status)
      expect(phaseArtifact?.submission?.rationale).toBe(rationale)
      expect(phaseArtifact?.submission?.evidence).toEqual(submission.evidence)
      const indexedArtifact = result.state.artifactIndex.find((artifact) =>
        artifact.lifecycleStatus === status
      )
      expect(indexedArtifact).toBeDefined()
      expect(indexedArtifact?.submission?.status).toBe(status)
      expect(indexedArtifact?.submission?.evidence).toEqual(submission.evidence)
      expect(result.state.transitionHistory).toContainEqual(expect.objectContaining({
        transitionId: `submit-${status}-evidence`,
        fromPhaseId: 'requirements',
        toPhaseId: 'requirements',
        result: status,
      }))
      expect(result.notifications).toContainEqual(expect.objectContaining({
        type: 'system_notification',
        subtype: 'workflow_blocked',
        data: expect.objectContaining({
          sessionId: SESSION_ID,
          phaseId: 'requirements',
          status,
          reason: rationale,
          evidence: submission.evidence,
        }),
      }))
    })

    test.each([
      [
        'missing phaseId',
        { ...completionSubmission(), phaseId: undefined } as unknown as CompletionSubmission,
        'WORKFLOW_COMPLETION_INVALID',
      ],
      [
        'missing status',
        { ...completionSubmission(), status: undefined } as unknown as CompletionSubmission,
        'WORKFLOW_STATUS_UNSUPPORTED',
      ],
      [
        'stale stateVersion',
        completionSubmission({ stateVersion: 0 }),
        'WORKFLOW_STATE_STALE',
      ],
      [
        'phase mismatch',
        completionSubmission({ phaseId: 'implementation' }),
        'WORKFLOW_PHASE_MISMATCH',
      ],
      [
        'missing handoff',
        { ...completionSubmission(), handoff: undefined } as unknown as CompletionSubmission,
        'WORKFLOW_COMPLETION_INVALID',
      ],
      [
        'missing evidence',
        { ...completionSubmission(), evidence: undefined } as unknown as CompletionSubmission,
        'WORKFLOW_COMPLETION_INVALID',
      ],
      [
        'unsupported status',
        { ...completionSubmission(), status: 'done' } as unknown as CompletionSubmission,
        'WORKFLOW_STATUS_UNSUPPORTED',
      ],
    ])('rejects invalid submit_phase_completion payload: %s', async (_name, submission, code) => {
      const service = await makeService()

      await expect(service.submitPhaseCompletion({
        state: runningState(),
        requestedAt: '2026-05-20T00:07:00.000Z',
        transitionId: `invalid-${code}`,
        submission,
      })).rejects.toMatchObject({
        code,
      })
    })

    test.each([
      'ready',
      'blocked',
      'unable',
    ] as const)('requires stateVersion for %s completion submissions', async (status) => {
      const service = await makeService()

      await expect(service.submitPhaseCompletion({
        state: runningState(),
        requestedAt: '2026-05-20T00:07:30.000Z',
        transitionId: `missing-state-version-${status}`,
        submission: {
          ...completionSubmission({ status }),
          stateVersion: undefined,
        } as unknown as CompletionSubmission,
      })).rejects.toMatchObject({
        code: 'WORKFLOW_COMPLETION_INVALID',
      })
    })

    test('rejects a ready completion when an unresolved pending confirmation already exists', async () => {
      const service = await makeService()
      const pending = pendingReadyState()

      await expect(service.submitPhaseCompletion({
        state: pending,
        requestedAt: '2026-05-20T00:08:00.000Z',
        transitionId: 'submit-ready-conflict',
        submission: completionSubmission({ stateVersion: pending.stateVersion }),
      })).rejects.toMatchObject({
        code: 'WORKFLOW_PENDING_CONFLICT',
      })
    })

    test('replays duplicate completion submission transitionId without duplicating pending artifacts', async () => {
      const service = await makeService()
      const first = await service.submitPhaseCompletion({
        state: runningState(),
        requestedAt: '2026-05-20T00:08:30.000Z',
        transitionId: 'submit-ready-idempotent-1',
        submission: completionSubmission(),
      })

      const second = await service.submitPhaseCompletion({
        state: first.state,
        requestedAt: '2026-05-20T00:08:45.000Z',
        transitionId: 'submit-ready-idempotent-1',
        submission: completionSubmission({ stateVersion: first.state.stateVersion }),
      })

      expect(second.state).toEqual(first.state)
      expect(second.status).toBe('pending')
      expect(second.state.phases[0].artifactPointers).toHaveLength(1)
      expect(second.state.artifactIndex).toHaveLength(1)
      expect(second.state.transitionHistory.filter((transition) =>
        transition.transitionId === 'submit-ready-idempotent-1'
      )).toHaveLength(1)
    })

    test('confirm accepts the pending artifact and advances exactly one phase with fresh stateVersion', async () => {
      const service = await makeService()
      const pending = pendingReadyState()

      const result = await service.applyTransition({
        state: pending,
        requestedAt: '2026-05-20T00:09:00.000Z',
        request: {
          phaseId: 'requirements',
          action: 'confirm',
          stateVersion: pending.stateVersion,
          transitionId: 'confirm-ready-1',
        } as unknown as WorkflowTransitionRequest,
      })

      expect(result.state.workflowStatus).toBe('running')
      expect(result.state.activePhaseId).toBe('implementation')
      expect(result.state.pendingConfirmation).toBeNull()
      expect(result.state.phases[0]).toMatchObject({
        status: 'completed',
        artifactPointers: [expect.objectContaining({
          artifactId: expect.stringContaining('requirements'),
          lifecycleStatus: 'accepted',
        })],
      })
      expect(result.state.phases[1]).toMatchObject({
        status: 'running',
      })
      expect(result.state.transitionHistory).toContainEqual(expect.objectContaining({
        transitionId: 'confirm-ready-1',
        action: 'confirmed',
        result: 'accepted',
      }))
    })

    test('confirm can mark the next phase for clear context while preserving accepted handoff artifacts', async () => {
      const service = await makeService()
      const pending = pendingReadyState()

      const result = await service.applyTransition({
        state: pending,
        requestedAt: '2026-05-20T00:09:30.000Z',
        request: {
          phaseId: 'requirements',
          action: 'confirm',
          stateVersion: pending.stateVersion,
          transitionId: 'confirm-clear-context-1',
          nextPhaseContextStrategy: 'clear',
        } as unknown as WorkflowTransitionRequest,
      })

      expect(result.state.workflowStatus).toBe('running')
      expect(result.state.activePhaseId).toBe('implementation')
      expect(result.state.nextPhaseContextStrategy).toBe('clear')
      expect(result.state.pendingConfirmation).toBeNull()
      expect(result.state.phases[0].artifactPointers).toEqual([
        expect.objectContaining({
          artifactId: 'requirements-ready-1',
          lifecycleStatus: 'accepted',
        }),
      ])
      expect(result.state.transitionHistory).toContainEqual(expect.objectContaining({
        transitionId: 'confirm-clear-context-1',
        result: 'accepted',
        nextPhaseContextStrategy: 'clear',
        artifactRefs: [expect.objectContaining({
          artifactId: 'requirements-ready-1',
          lifecycleStatus: 'accepted',
        })],
      }))
    })

    test('confirm defaults to inherited next phase context when no strategy is requested', async () => {
      const service = await makeService()
      const pending = pendingReadyState()

      const result = await service.applyTransition({
        state: pending,
        requestedAt: '2026-05-20T00:09:45.000Z',
        request: {
          phaseId: 'requirements',
          action: 'confirm',
          stateVersion: pending.stateVersion,
          transitionId: 'confirm-inherit-context-1',
        } as unknown as WorkflowTransitionRequest,
      })

      expect(result.state.nextPhaseContextStrategy).toBeUndefined()
      expect(result.state.transitionHistory).toContainEqual(expect.objectContaining({
        transitionId: 'confirm-inherit-context-1',
        result: 'accepted',
      }))
      expect(result.state.transitionHistory.find((transition) =>
        transition.transitionId === 'confirm-inherit-context-1'
      )?.nextPhaseContextStrategy).toBeUndefined()
    })

    test('reject marks the pending artifact rejected and keeps the current phase running', async () => {
      const service = await makeService()
      const pending = pendingReadyState()

      const result = await service.applyTransition({
        state: pending,
        requestedAt: '2026-05-20T00:10:00.000Z',
        request: {
          phaseId: 'requirements',
          action: 'reject',
          stateVersion: pending.stateVersion,
          transitionId: 'reject-ready-1',
        } as unknown as WorkflowTransitionRequest,
      })

      expect(result.state.workflowStatus).toBe('running')
      expect(result.state.activePhaseId).toBe('requirements')
      expect(result.state.pendingConfirmation).toBeNull()
      expect(result.state.phases[0]).toMatchObject({
        status: 'running',
        artifactPointers: [expect.objectContaining({
          lifecycleStatus: 'rejected',
        })],
      })
      expect(result.state.transitionHistory).toContainEqual(expect.objectContaining({
        transitionId: 'reject-ready-1',
        action: 'rejected',
        result: 'rejected',
      }))
    })

    test('retry supersedes the pending artifact and returns the current phase to running', async () => {
      const service = await makeService()
      const pending = pendingReadyState()

      const result = await service.applyTransition({
        state: pending,
        requestedAt: '2026-05-20T00:11:00.000Z',
        request: {
          phaseId: 'requirements',
          action: 'retry',
          stateVersion: pending.stateVersion,
          transitionId: 'retry-ready-1',
        } as unknown as WorkflowTransitionRequest,
      })

      expect(result.state.workflowStatus).toBe('running')
      expect(result.state.activePhaseId).toBe('requirements')
      expect(result.state.pendingConfirmation).toBeNull()
      expect(result.state.phases[0]).toMatchObject({
        status: 'running',
        artifactPointers: [expect.objectContaining({
          lifecycleStatus: 'superseded',
        })],
      })
      expect(result.state.transitionHistory).toContainEqual(expect.objectContaining({
        transitionId: 'retry-ready-1',
        action: 'retry',
        result: 'superseded',
      }))
    })

    test('manual_complete creates an accepted artifact and advances without requiring pending confirmation', async () => {
      const service = await makeService()
      const state = runningState()

      const result = await service.applyTransition({
        state,
        requestedAt: '2026-05-20T00:12:00.000Z',
        request: {
          phaseId: 'requirements',
          action: 'manual_complete',
          stateVersion: state.stateVersion,
          transitionId: 'manual-complete-1',
        } as unknown as WorkflowTransitionRequest,
        completion: {
          passed: true,
          artifactPointers: [pointer('requirements-manual-complete')],
        },
      })

      expect(result.state.workflowStatus).toBe('running')
      expect(result.state.activePhaseId).toBe('implementation')
      expect(result.state.pendingConfirmation).toBeNull()
      expect(result.state.phases[0]).toMatchObject({
        status: 'completed',
        artifactPointers: [expect.objectContaining({
          artifactId: 'requirements-manual-complete',
          lifecycleStatus: 'accepted',
        })],
      })
      expect(result.state.transitionHistory).toContainEqual(expect.objectContaining({
        transitionId: 'manual-complete-1',
        result: 'accepted',
      }))
    })

    test('manual completion can mark the next phase for clear context without dropping handoff artifacts', async () => {
      const service = await makeService()
      const state = runningState()

      const result = await service.applyTransition({
        state,
        requestedAt: '2026-05-20T00:12:30.000Z',
        request: {
          phaseId: 'requirements',
          action: 'manual_complete',
          stateVersion: state.stateVersion,
          transitionId: 'manual-complete-clear-context-1',
          nextPhaseContextStrategy: 'clear',
        } as unknown as WorkflowTransitionRequest,
        completion: {
          passed: true,
          artifactPointers: [pointer('requirements-manual-clear-context')],
        },
      })

      expect(result.state.workflowStatus).toBe('running')
      expect(result.state.activePhaseId).toBe('implementation')
      expect(result.state.nextPhaseContextStrategy).toBe('clear')
      expect(result.state.phases[0].artifactPointers).toEqual([
        expect.objectContaining({
          artifactId: 'requirements-manual-clear-context',
          lifecycleStatus: 'accepted',
        }),
      ])
      expect(result.state.transitionHistory).toContainEqual(expect.objectContaining({
        transitionId: 'manual-complete-clear-context-1',
        result: 'accepted',
        nextPhaseContextStrategy: 'clear',
        artifactRefs: [expect.objectContaining({
          artifactId: 'requirements-manual-clear-context',
          lifecycleStatus: 'accepted',
        })],
      }))
    })

    test.each([
      ['confirm', 'stale-confirm-1'],
      ['reject', 'stale-reject-1'],
      ['retry', 'stale-retry-1'],
      ['manual_complete', 'stale-manual-complete-1'],
    ] as const)('rejects stale stateVersion for %s transition without mutating state', async (action, transitionId) => {
      const service = await makeService()
      const state = action === 'manual_complete'
        ? runningState()
        : pendingReadyState()

      await expect(service.applyTransition({
        state,
        requestedAt: '2026-05-20T00:13:00.000Z',
        request: {
          phaseId: 'requirements',
          action,
          stateVersion: state.stateVersion - 1,
          transitionId,
        } as unknown as WorkflowTransitionRequest,
      })).rejects.toMatchObject({
        code: 'WORKFLOW_STATE_STALE',
      })
    })

    test('replays duplicate transitionId without advancing or duplicating artifacts', async () => {
      const service = await makeService()
      const pending = pendingReadyState()

      const first = await service.applyTransition({
        state: pending,
        requestedAt: '2026-05-20T00:14:00.000Z',
        request: {
          phaseId: 'requirements',
          action: 'confirm',
          stateVersion: pending.stateVersion,
          transitionId: 'confirm-idempotent-1',
        } as unknown as WorkflowTransitionRequest,
      })
      const second = await service.applyTransition({
        state: first.state,
        requestedAt: '2026-05-20T00:15:00.000Z',
        request: {
          phaseId: 'requirements',
          action: 'confirm',
          stateVersion: first.state.stateVersion,
          transitionId: 'confirm-idempotent-1',
        } as unknown as WorkflowTransitionRequest,
      })

      expect(second.state).toEqual(first.state)
      expect(second.state.activePhaseId).toBe('implementation')
      expect(second.state.phases[0].artifactPointers).toHaveLength(1)
      expect(second.state.transitionHistory.filter((transition) =>
        transition.transitionId === 'confirm-idempotent-1'
      )).toHaveLength(1)
    })

    test('final phase confirmation creates a final report pointer and workflow_report_ready notification', async () => {
      const service = await makeService()
      const finalReadyState = runningState({
        activePhaseId: 'implementation',
        phases: [
          {
            id: 'requirements',
            index: 0,
            status: 'completed',
            artifactPointers: [pointer('requirements-md')],
          },
          {
            id: 'implementation',
            index: 1,
            status: 'running',
            artifactPointers: [],
          },
        ],
      })
      const finalArtifact = {
        ...pointer('implementation-ready-1'),
        lifecycleStatus: 'pending',
        phaseId: 'implementation',
        title: 'Implementation phase completion',
      }
      const pending = {
        ...finalReadyState,
        workflowStatus: 'pending-confirmation' as const,
        status: 'pending-confirmation' as const,
        phases: [
          finalReadyState.phases[0],
          {
            id: 'implementation',
            index: 1,
            status: 'pending-confirmation' as const,
            artifactPointers: [finalArtifact],
          },
        ],
        pendingConfirmation: {
          confirmationId: 'confirm-final-1',
          phaseId: 'implementation',
          fromPhaseId: 'implementation',
          toPhaseId: null,
          completionCheckId: 'check-final-1',
          artifactRefs: [finalArtifact],
          createdAt: '2026-05-20T00:16:00.000Z',
          status: 'pending' as const,
          submission: completionSubmission({
            phaseId: 'implementation',
            handoff: {
              summary: 'Implementation phase is ready.',
              artifacts: ['implementation-summary'],
              next: 'Confirm final completion.',
            },
          }),
        },
        stateVersion: 2,
        revision: 2,
      }

      const result = await service.applyTransition({
        state: pending,
        requestedAt: '2026-05-20T00:17:00.000Z',
        request: {
          phaseId: 'implementation',
          action: 'confirm',
          stateVersion: pending.stateVersion,
          transitionId: 'confirm-final-ready-1',
        } as unknown as WorkflowTransitionRequest,
      })

      expect(result.state.workflowStatus).toBe('completed')
      expect(result.state.activePhaseId).toBeNull()
      expect(result.state.finalReportRef).toMatchObject({
        kind: 'final-report',
        sessionId: SESSION_ID,
        artifactId: 'final',
      })
      expect(result.notifications).toContainEqual(expect.objectContaining({
        type: 'system_notification',
        subtype: 'workflow_report_ready',
        data: expect.objectContaining({
          sessionId: SESSION_ID,
          reportPointer: expect.objectContaining({
            artifactId: 'final',
          }),
        }),
      }))
    })
  })
})
