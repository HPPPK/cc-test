import { describe, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import type {
  CompletionSubmission,
  WorkflowSessionState,
  WorkflowTemplate,
  WorkflowTransitionRequest,
} from './workflowTypes.js'
import type { WorkflowPhaseSkillCatalogEntry } from './workflowPhaseSkillResolver.js'

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
  exitWorkflow(input: {
    state: WorkflowSessionState
    requestedAt: string
    transitionId?: string
  }): Promise<{
    state: WorkflowSessionState
    notifications: Array<Record<string, unknown>>
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
  requestWorkflowRoute(input: {
    state: WorkflowSessionState
    request: {
      phaseId?: string
      stateVersion?: number
      intent: 'advance' | 'rework_current_phase' | 'jump_to_phase' | 'pause' | 'resume' | 'finish'
      targetPhaseId?: string
      rationale: string
      evidence: Array<Record<string, unknown>>
      requireUserConfirmation?: boolean
    }
    requestedAt: string
    transitionId?: string
  }): Promise<{
    state: WorkflowSessionState
    notifications: Array<Record<string, unknown>>
    approvedTargetPhaseId: string | null
    routeReason: string
    requiresConfirmation: boolean
  }>
}

async function makeService(input: {
  skillCatalog?: () => Promise<WorkflowPhaseSkillCatalogEntry[]>
  templateLoader?: (state: WorkflowSessionState) => Promise<WorkflowTemplate | null>
} = {}): Promise<WorkflowRuntimeServiceContract> {
  const mod = await import('./workflowRuntimeService.js')
  return new mod.WorkflowRuntimeService(
    input.skillCatalog,
    input.templateLoader ?? (async (state: WorkflowSessionState) => state.templateSnapshot ?? null),
  ) as WorkflowRuntimeServiceContract
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

  test('reuses the active session model when a resumed workflow phase has no configured default', async () => {
    const service = await makeService()
    const state = makeState()
    state.activeModelResolution = {
      requestedModel: null,
      actualModel: 'claude-sonnet-4',
      providerId: 'anthropic',
      source: 'main-session-default',
      fallbackApplied: false,
      fallbackReason: null,
      resolvedAt: '2026-05-20T00:00:00.000Z',
    }

    const result = await service.startPhase({
      state,
      requestedAt: '2026-05-20T00:01:00.000Z',
      isRequestedModelAvailable: async () => false,
      resolveDefaultModel: async () => ({
        providerId: 'anthropic',
        modelId: 'claude-sonnet-4',
        source: 'active-session',
      }),
    })

    expect(result.state.workflowStatus).toBe('running')
    expect(result.state.phases[0]).toMatchObject({
      status: 'running',
      actualModel: 'claude-sonnet-4',
      fallbackReason: expect.stringContaining('reusing the active session model'),
    })
    expect(result.state.activeModelResolution).toMatchObject({
      actualModel: 'claude-sonnet-4',
      providerId: 'anthropic',
      source: 'active-session',
      fallbackApplied: true,
    })
  }, 10_000)

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

  test('reloads the current ZIP template for an existing session instead of using its legacy snapshot', async () => {
    const staleTemplate = makeTemplate({
      phases: [
        {
          ...makeTemplate().phases[0],
          instructions: 'STALE instructions from the old session snapshot.',
        },
      ],
    })
    const currentTemplate = makeTemplate({
      phases: [
        {
          ...makeTemplate().phases[0],
          instructions: 'CURRENT instructions loaded from the canonical workflow ZIP.',
        },
      ],
    })
    const service = await makeService({
      templateLoader: async () => currentTemplate,
    })

    const prompt = await service.assemblePrompt({
      state: makeState({
        templateSnapshot: staleTemplate,
        activePhaseId: 'requirements',
        phases: [{ id: 'requirements', index: 0, status: 'running', artifactPointers: [] }],
      }),
      userMessage: 'Continue the current phase.',
    })

    expect(prompt.content).toContain('CURRENT instructions loaded from the canonical workflow ZIP.')
    expect(prompt.content).not.toContain('STALE instructions from the old session snapshot.')
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
    expect(prompt.content).toContain('Every workflow-generated question must use AskUserQuestion')
    expect(prompt.content).toContain('Ask one question at a time')
    expect(prompt.content).toContain('(Recommended)')
    expect(prompt.content).toContain('When confirming a recommended tech stack')
    expect(prompt.content).toContain('everyday words')
    expect(prompt.content).toContain('Avoid specialist wording')
    expect(prompt.content).toContain('Plain assistant text is not an approval gate')
    expect(prompt.content).toContain('Do not put user-input requests')
    expect(prompt.content).toContain('Allowed workflow question intents')
    expect(prompt.content).toContain('confirm-workspace')
    expect(prompt.content).toContain('record-user-note')
    expect(prompt.content).toContain('鎯宠瘯璇曞悧')
    expect(prompt.content).toContain('For optional visual brainstorming')
    expect(prompt.content).toContain('鐢熸垚绠€鐗堢晫闈㈣崏鍥?(Recommended)')
    expect(prompt.content).toContain('provide a text or Mermaid sketch')
    expect(prompt.content).toContain('No such tool available')
    expect(prompt.content).toContain('submit_phase_completion or request_workflow_route')
    expect(prompt.content).toContain('Do not turn the failure into prose or AskUserQuestion')
    expect(prompt.content).toContain('do not use screen/computer-control tools to operate Terminal')
    expect(prompt.content).toContain('File has not been read yet')
    expect(prompt.content).toContain('Read the exact target file first')
    expect(prompt.content).toContain('write the artifact content in the phase handoff/answer')
    expect(prompt.content).toContain('inspect directories only with an available directory-listing or search tool')
    expect(prompt.content).toContain('inspect files only when the exact file path is known')
    expect(prompt.content).toContain('Allowed workflow capabilities')
    expect(prompt.content).toContain('not a callable tool catalog')
    expect(prompt.content).toContain('Only call a concrete tool when that tool is explicitly present')
    expect(prompt.content).toContain('workspace inspection capability')
    expect(prompt.content).not.toContain('Do not call Bash')
    expect(prompt.content).not.toContain('If Bash, Glob, Grep, or LS is unavailable')
    expect(prompt.content).toContain('do not guess paths')
    expect(prompt.content).toContain('Do not offer fake permission choices')
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

  test('pause, resume, and stop preserve artifacts and transition history', async () => {
    const service = await makeService()
    const artifact = pointer('requirements-output')
    const state = makeState({
      workflowStatus: 'running',
      status: 'running',
      runStatus: 'active',
      phases: [
        {
          id: 'requirements',
          index: 0,
          status: 'running',
          artifactPointers: [artifact],
        },
        {
          id: 'implementation',
          index: 1,
          status: 'created',
          artifactPointers: [],
        },
      ],
      artifactIndex: [artifact],
      transitionHistory: [
        {
          transitionId: 'existing-transition',
          fromPhaseId: 'requirements',
          toPhaseId: 'requirements',
          authority: 'auto',
          action: 'retry',
          result: 'accepted',
          completionCheckId: null,
          createdAt: NOW,
          stateVersion: 1,
        },
      ],
    })

    const paused = await service.applyTransition({
      state,
      requestedAt: '2026-05-20T00:01:00.000Z',
      request: {
        phaseId: 'requirements',
        action: 'pause',
        transitionId: 'pause-1',
      },
    })
    expect(paused.state.runStatus).toBe('paused')
    expect(paused.state.artifactIndex).toEqual([artifact])
    expect(paused.state.transitionHistory.map((transition) => transition.transitionId)).toEqual([
      'existing-transition',
      'pause-1',
    ])

    const resumed = await service.applyTransition({
      state: paused.state,
      requestedAt: '2026-05-20T00:02:00.000Z',
      request: {
        phaseId: 'requirements',
        action: 'resume',
        transitionId: 'resume-1',
      },
    })
    expect(resumed.state.runStatus).toBe('active')
    expect(resumed.state.artifactIndex).toEqual([artifact])

    const stopped = await service.applyTransition({
      state: resumed.state,
      requestedAt: '2026-05-20T00:03:00.000Z',
      request: {
        phaseId: 'requirements',
        action: 'stop',
        transitionId: 'stop-1',
      },
    })
    expect(stopped.state.runStatus).toBe('stopped')
    expect(stopped.state.activePhaseId).toBe('requirements')
    expect(stopped.state.artifactIndex).toEqual([artifact])
    expect(stopped.state.transitionHistory.map((transition) => transition.transitionId)).toEqual([
      'existing-transition',
      'pause-1',
      'resume-1',
      'stop-1',
    ])
  })

  test('exits an active workflow without deleting its phase or artifacts', async () => {
    const service = await makeService()
    const artifact = pointer('requirements-artifact')
    const result = await service.exitWorkflow({
      state: makeState({
        status: 'running',
        workflowStatus: 'running',
        runStatus: 'active',
        phases: [{
          id: 'requirements',
          index: 0,
          status: 'running',
          artifactPointers: [artifact],
        }, {
          id: 'implementation',
          index: 1,
          status: 'created',
          artifactPointers: [],
        }],
        artifactIndex: [artifact],
      }),
      requestedAt: '2026-05-20T00:03:00.000Z',
      transitionId: 'exit-1',
    })

    expect(result.state.workflowStatus).toBe('cancelled')
    expect(result.state.status).toBe('cancelled')
    expect(result.state.runStatus).toBe('cancelled')
    expect(result.state.activePhaseId).toBe('requirements')
    expect(result.state.artifactIndex).toEqual([artifact])
    expect(result.state.transitionHistory).toContainEqual(expect.objectContaining({
      transitionId: 'exit-1',
      authority: 'cancel',
      decision: 'cancelled',
    }))
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

  test('exposes native SkillTool execution guidance for installed provider skills', async () => {
    const service = await makeService()
    const state = recommendedSkillRuntimeState()
    const snapshot = state.phaseSkillSnapshots?.[0]
    if (!snapshot) throw new Error('missing skill snapshot')
    snapshot.references = [
      {
        name: 'superpowers:verification-before-completion',
        mode: 'recommended',
        source: 'superpowers',
        reason: 'Use installed Superpowers verification before final completion.',
      },
    ]
    snapshot.resolutions = [
      {
        reference: snapshot.references[0],
        status: 'available',
        checkedAt: NOW,
        resolvedSkill: {
          name: 'superpowers:verification-before-completion',
          displayName: 'Superpowers: Verification Before Completion',
          source: 'superpowers',
        },
        provenance: {
          referenceId: 'superpowers:verification-before-completion',
          sourcePath: '/tmp/.claude/skills/superpowers:verification-before-completion/SKILL.md',
        },
      },
    ]
    state.skillBindingStatus = [
      {
        id: 'superpowers:verification-before-completion',
        mode: 'native-if-installed-else-fallback-contract',
        availability: 'native',
      },
    ]

    const prompt = await service.assemblePrompt({
      state,
      userMessage: 'Verify before completion.',
    })

    expect(prompt.content).toContain('Native skill execution')
    expect(prompt.content).toContain('Use SkillTool')
    expect(prompt.content).toContain('superpowers:verification-before-completion')
    expect(prompt.content).toContain('If SkillTool is unavailable or denied')
    expect(prompt.scheduledToolCalls ?? []).toEqual([])
  })



  test('does not use fallback contracts for missing skill bindings from pack templates', async () => {
    const service = await makeService()
    const template = makeTemplate({
      source: 'pack',
      phases: [
        {
          id: 'pack-phase',
          label: 'Pack Phase',
          instructions: 'Run the imported pack phase.',
          requestedModel: null,
          skillBindings: ['missing-provider:missing-skill'],
          skillDeclarations: [],
          requiredArtifacts: [],
          completionCriteria: ['pack phase completed'],
          transitionAuthority: 'user-confirmation',
        },
      ],
    })
    const state = makeState({
      workflowStatus: 'running',
      activePhaseId: 'pack-phase',
      templateSnapshot: template,
      template: {
        id: template.id,
        version: String(template.version),
        source: 'pack',
        snapshotId: 'pack-snapshot-1',
        sourceState: 'current',
      },
      templateIdentity: {
        id: template.id,
        source: 'pack',
        version: template.version,
        registryKey: `pack:${template.id}`,
      },
      phases: [
        {
          id: 'pack-phase',
          index: 0,
          status: 'running',
          artifactPointers: [],
        },
      ],
    })

    const prompt = await service.assemblePrompt({
      state,
      userMessage: 'Continue the imported pack workflow.',
    })

    expect(prompt.content).toContain('- missing-provider:missing-skill: disabled')
    expect(prompt.content).not.toContain('fallback contract:')
    expect(prompt.content).not.toContain('Use the workflow phase contract as the local fallback')
  })

  test('uses installed Superpowers brainstorming when brainstorming is forced on', async () => {
    const service = await makeService()
    const originalConfigDir = process.env.CLAUDE_CONFIG_DIR
    const tempConfigDir = await fs.mkdtemp(path.join(os.tmpdir(), 'workflow-runtime-superpowers-'))
    const skillDir = path.join(
      tempConfigDir,
      'plugins',
      'cache',
      'openai-curated-remote',
      'superpowers',
      '5.1.4',
      'skills',
      'brainstorming',
    )
    try {
      process.env.CLAUDE_CONFIG_DIR = tempConfigDir
      await fs.mkdir(skillDir, { recursive: true })
      await fs.writeFile(
        path.join(skillDir, 'SKILL.md'),
        [
          '---',
          'name: brainstorming',
          'description: Superpowers brainstorming',
          '---',
          'Use brainstorming before creative work.',
          '',
        ].join('\n'),
        'utf-8',
      )
      const template = makeTemplate({
        phases: [
          {
            id: 'scope-plan',
            label: 'Scope Plan',
            instructions: 'Explore and lock scope.',
            requestedModel: null,
            skillBindings: ['superpowers:brainstorming'],
            skillDeclarations: [],
            requiredArtifacts: [],
            completionCriteria: ['scope is confirmed'],
            transitionAuthority: 'user-confirmation',
          },
        ],
      })
      const state = makeState({
        brainstormingMode: 'on',
        labels: ['new-product'],
        effort: 'standard',
        activePhaseId: 'scope-plan',
        templateSnapshot: template,
        phases: [{ id: 'scope-plan', index: 0, status: 'running', artifactPointers: [] }],
      })

      const prompt = await service.assemblePrompt({
        state,
        userMessage: 'Continue scope discovery.',
      })

      expect(prompt.content).toContain('Native Superpowers brainstorming is available and active')
      expect(prompt.content).toContain('superpowers:brainstorming: native')
      expect(prompt.content).toContain('follow the installed superpowers:brainstorming process')
    } finally {
      if (originalConfigDir === undefined) {
        delete process.env.CLAUDE_CONFIG_DIR
      } else {
        process.env.CLAUDE_CONFIG_DIR = originalConfigDir
      }
      await fs.rm(tempConfigDir, { recursive: true, force: true })
    }
  }, 20_000)

  test('does not bind Superpowers brainstorming when brainstorming is off', async () => {
    const service = await makeService()
    const template = makeTemplate({
      phases: [
        {
          id: 'scope-plan',
          label: 'Scope Plan',
          instructions: 'Explore and lock scope.',
          requestedModel: null,
          skillBindings: ['superpowers:brainstorming'],
          skillDeclarations: [],
          requiredArtifacts: [],
          completionCriteria: ['scope is confirmed'],
          transitionAuthority: 'user-confirmation',
        },
      ],
    })
    const state = makeState({
      brainstormingMode: 'off',
      labels: ['new-product'],
      effort: 'standard',
      activePhaseId: 'scope-plan',
      templateSnapshot: template,
      phases: [{ id: 'scope-plan', index: 0, status: 'running', artifactPointers: [] }],
    })

    const prompt = await service.assemblePrompt({
      state,
      userMessage: 'Continue from supplied requirements.',
    })

    expect(prompt.content).toContain('Brainstorming: off')
    expect(prompt.content).not.toContain('superpowers:brainstorming')
    expect(prompt.content).not.toContain('Native Superpowers brainstorming is available and active')
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

  test('injects Chinese language policy into active workflow prompts for Chinese users', async () => {
    const service = await makeService()
    const prompt = await service.assemblePrompt({
      state: makeState({ workflowStatus: 'running', status: 'running' }),
      userMessage: '请继续当前阶段，并在需要我确认时给出中文选项。',
    })

    expect(prompt.content).toContain('当前用户主要使用中文')
    expect(prompt.content).toContain('AskUserQuestion 的 prompt、choice label、阶段摘要')
  })

  test('keeps Chinese workflow language for an English continue message when the UI locale is Chinese', async () => {
    const service = await makeService()
    const prompt = await service.assemblePrompt({
      state: makeState({ workflowStatus: 'running', status: 'running', workflowLanguage: 'zh' }),
      userMessage: 'continue',
    })

    expect(prompt.content).toContain('当前 UI 使用中文')
    expect(prompt.content).not.toContain('current UI language is English')
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

  test('injects checkpoint rollback context into the next workflow prompt', async () => {
    const service = await makeService()
    const prompt = await service.assemblePrompt({
      state: makeState({
        workflowStatus: 'running',
        lastCheckpointRestore: {
          checkpointId: 'v2',
          checkpointVersion: 2,
          checkpointLabel: 'before verify prompt experiment',
          restoredAt: '2026-07-04T13:20:00.000Z',
          restoredActivePhaseId: 'requirements',
          restoredPhaseIndex: 0,
          removedFiles: ['generated-after-save.txt'],
          instruction: 'Treat later generated context as superseded and re-evaluate the next stage prompt.',
        },
      }),
      userMessage: 'Continue after rollback.',
    })

    expect(prompt.content).toContain('Workflow checkpoint rollback context')
    expect(prompt.content).toContain('Restored checkpoint: v2')
    expect(prompt.content).toContain('Files removed by rollback')
    expect(prompt.content).toContain('generated-after-save.txt')
    expect(prompt.content).toContain('Treat later generated context as superseded')
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
      request: {
        phaseId: 'requirements',
        action: 'confirm',
        transitionId: 'confirm-requirements',
        confirmationId: pending.state.pendingConfirmation!.confirmationId,
      },
    })
    expect(confirmed.state.workflowStatus).toBe('running')
    expect(confirmed.state.activePhaseId).toBe('implementation')
    expect(confirmed.state.phases[0].status).toBe('completed')
    expect(confirmed.state.phases[1].status).toBe('running')
  })

  test('routes a confirmed Stage 6 completion back to Stage 4 instead of advancing linearly to Stage 7', async () => {
    const service = await makeService()
    const phases = [
      ['discover', 'Stage 1'],
      ['shape', 'Stage 2'],
      ['specify', 'Stage 3'],
      ['delegate-implement', 'Stage 4: 分批实现与审查'],
      ['build', 'Stage 5'],
      ['validate', 'Stage 6'],
      ['release', 'Stage 7'],
    ] as const
    const template = makeTemplate({
      phases: phases.map(([id, label]) => ({
        ...makeTemplate().phases[0],
        id,
        label,
        transitionAuthority: 'user-confirmation',
      })),
    })
    const state = makeState({
      templateSnapshot: template,
      template: {
        id: template.id,
        version: String(template.version),
        source: template.source,
        snapshotId: 'snapshot-1',
        sourceState: 'current',
      },
      activePhaseId: 'validate',
      workflowStatus: 'pending-confirmation',
      status: 'pending-confirmation',
      runStatus: 'waiting_for_user',
      phases: phases.map(([id], index) => ({
        id,
        index,
        status: id === 'validate' ? 'pending-confirmation' : index < 5 ? 'completed' : 'created',
        artifactPointers: [],
      })),
      pendingConfirmation: {
        confirmationId: 'validate-completion',
        phaseId: 'validate',
        fromPhaseId: 'validate',
        toPhaseId: 'release',
        completionCheckId: 'validate-completion',
        artifactRefs: [],
        createdAt: NOW,
        status: 'pending',
      },
    })

    const routed = await service.requestWorkflowRoute({
      state,
      requestedAt: '2026-05-20T00:04:00.000Z',
      transitionId: 'route-back-to-stage-4',
      request: {
        phaseId: 'validate',
        stateVersion: state.stateVersion,
        intent: 'jump_to_phase',
        targetPhaseId: 'delegate-implement',
        rationale: 'Validation found a defect that must be fixed in implementation.',
        evidence: [{ kind: 'validation-failure', test: 'route regression' }],
        requireUserConfirmation: true,
      },
    })
    expect(routed.state.pendingRoute).toMatchObject({
      intent: 'jump_to_phase',
      targetPhaseId: 'delegate-implement',
      approvedTargetPhaseId: 'delegate-implement',
    })

    const confirmed = await service.applyTransition({
      state: routed.state,
      requestedAt: '2026-05-20T00:05:00.000Z',
      request: {
        phaseId: 'validate',
        action: 'confirm',
        transitionId: 'confirm-route-back-to-stage-4',
        confirmationId: routed.state.pendingRoute!.routeId,
        expectedStateVersion: routed.state.stateVersion,
      },
    })

    expect(confirmed.state.activePhaseId).toBe('delegate-implement')
    expect(confirmed.state.phases[3].status).toBe('running')
    expect(confirmed.state.phases[6].status).not.toBe('running')
  })

  test('does not create a duplicate pending route when repaired Stage 4 already advances to Stage 5', async () => {
    const service = await makeService()
    const basePhase = makeTemplate().phases[0]
    const template = makeTemplate({
      phases: [
        { ...basePhase, id: 'delegate-implement', label: 'Stage 4', transitionAuthority: 'user-confirmation' },
        { ...basePhase, id: 'scenario-review', label: 'Stage 5', transitionAuthority: 'user-confirmation' },
      ],
    })
    const state = makeState({
      templateSnapshot: template,
      activePhaseId: 'delegate-implement',
      workflowStatus: 'pending-confirmation',
      status: 'pending-confirmation',
      runStatus: 'waiting_for_user',
      phases: [
        { id: 'delegate-implement', index: 0, status: 'pending-confirmation', artifactPointers: [] },
        { id: 'scenario-review', index: 1, status: 'created', artifactPointers: [] },
      ],
      pendingConfirmation: {
        confirmationId: 'repair-ready',
        phaseId: 'delegate-implement',
        fromPhaseId: 'delegate-implement',
        toPhaseId: 'scenario-review',
        completionCheckId: 'repair-ready',
        artifactRefs: [],
        createdAt: NOW,
        status: 'pending',
      },
    })

    const routed = await service.requestWorkflowRoute({
      state,
      requestedAt: NOW,
      transitionId: 'redundant-return-to-stage-5',
      request: {
        phaseId: 'delegate-implement',
        stateVersion: state.stateVersion,
        intent: 'jump_to_phase',
        targetPhaseId: 'scenario-review',
        rationale: 'The scoped repair is complete; resume validation.',
        evidence: [{ kind: 'repair-verified' }],
        requireUserConfirmation: true,
      },
    })

    expect(routed.state.pendingRoute).toBeUndefined()
    expect(routed.state.pendingConfirmation).toMatchObject({
      phaseId: 'delegate-implement',
      toPhaseId: 'scenario-review',
      status: 'pending',
    })
    expect(routed.approvedTargetPhaseId).toBe('scenario-review')
    expect(routed.requiresConfirmation).toBe(true)

    const confirmed = await service.applyTransition({
      state: routed.state,
      requestedAt: '2026-05-20T00:05:00.000Z',
      request: {
        phaseId: 'delegate-implement',
        action: 'confirm',
        confirmationId: routed.state.pendingConfirmation!.confirmationId,
        transitionId: 'confirm-repaired-stage-4',
        expectedStateVersion: routed.state.stateVersion,
      },
    })
    expect(confirmed.state.activePhaseId).toBe('scenario-review')
    expect(confirmed.state.pendingRoute).toBeNull()
    expect(confirmed.state.transitionHistory.at(-1)).toMatchObject({ action: 'confirmed' })

    const autoRouted = await service.requestWorkflowRoute({
      state,
      requestedAt: NOW,
      transitionId: 'auto-confirm-repaired-stage-4',
      request: {
        phaseId: 'delegate-implement',
        stateVersion: state.stateVersion,
        intent: 'advance',
        rationale: 'The user chose to continue to validation.',
        evidence: [{ kind: 'user-choice' }],
        requireUserConfirmation: false,
      },
    })
    expect(autoRouted.state.activePhaseId).toBe('scenario-review')
    expect(autoRouted.state.pendingConfirmation).toBeNull()
    expect(autoRouted.state.pendingRoute).toBeNull()
    expect(autoRouted.requiresConfirmation).toBe(false)
    expect(autoRouted.state.transitionHistory.at(-1)).toMatchObject({ action: 'confirmed' })
  })

  test('allows Stage 5 and Stage 6 jump routes when forbidden action prose only mentions non-workflow routes', async () => {
    const service = await makeService()
    const basePhase = makeTemplate().phases[0]
    const cases = [
      {
        id: 'scenario-review',
        label: 'Stage 5: Scenario review',
        forbiddenAction: 'Route failed or unclear validation through validation problem routing instead of ad-hoc repair.',
      },
      {
        id: 'local-preview',
        label: 'Stage 6: Local preview',
        forbiddenAction: 'Record preview URL, route, command, process ID, port, log path, and user feedback.',
      },
    ] as const

    for (const scenario of cases) {
      const template = makeTemplate({
        phases: [
          {
            ...basePhase,
            id: 'delegate-implement',
            label: 'Stage 4: Delegate implementation',
            transitionAuthority: 'user-confirmation',
          },
          {
            ...basePhase,
            id: scenario.id,
            label: scenario.label,
            transitionAuthority: 'user-confirmation',
            actionPolicy: {
              allowedActions: ['read', 'route-request'],
              forbiddenActions: [scenario.forbiddenAction],
            },
          },
          {
            ...basePhase,
            id: 'finish-memory',
            label: 'Finish',
            transitionAuthority: 'user-confirmation',
          },
        ],
      })
      const state = makeState({
        templateSnapshot: template,
        activePhaseId: scenario.id,
        workflowStatus: 'pending-confirmation',
        status: 'pending-confirmation',
        runStatus: 'waiting_for_user',
        phases: template.phases.map((phase, index) => ({
          id: phase.id,
          index,
          status: phase.id === scenario.id ? 'pending-confirmation' : index === 0 ? 'completed' : 'created',
          artifactPointers: [],
        })),
        pendingConfirmation: {
          confirmationId: `${scenario.id}-completion`,
          phaseId: scenario.id,
          fromPhaseId: scenario.id,
          toPhaseId: 'finish-memory',
          completionCheckId: `${scenario.id}-completion`,
          artifactRefs: [],
          createdAt: NOW,
          status: 'pending',
        },
      })

      const routed = await service.requestWorkflowRoute({
        state,
        requestedAt: NOW,
        request: {
          phaseId: scenario.id,
          stateVersion: state.stateVersion,
          intent: 'jump_to_phase',
          targetPhaseId: 'delegate-implement',
          rationale: 'A verified defect requires a scoped implementation repair.',
          evidence: [{ kind: 'validation-failure' }],
          requireUserConfirmation: true,
        },
      })

      expect(routed.state.pendingRoute).toMatchObject({
        phaseId: scenario.id,
        intent: 'jump_to_phase',
        targetPhaseId: 'delegate-implement',
        approvedTargetPhaseId: 'delegate-implement',
        status: 'pending',
      })
    }
  })

  test('rejects jump_to_phase only when the active phase explicitly forbids that route intent', async () => {
    const service = await makeService()
    const basePhase = makeTemplate().phases[0]
    const template = makeTemplate({
      phases: [
        {
          ...basePhase,
          id: 'delegate-implement',
          label: 'Stage 4: Delegate implementation',
          transitionAuthority: 'user-confirmation',
        },
        {
          ...basePhase,
          id: 'scenario-review',
          label: 'Stage 5: Scenario review',
          transitionAuthority: 'user-confirmation',
          actionPolicy: {
            allowedActions: ['read', 'route-request'],
            forbiddenActions: ['jump_to_phase'],
          },
        },
      ],
    })
    const state = makeState({
      templateSnapshot: template,
      activePhaseId: 'scenario-review',
      workflowStatus: 'pending-confirmation',
      status: 'pending-confirmation',
      runStatus: 'waiting_for_user',
      phases: [
        { id: 'delegate-implement', index: 0, status: 'completed', artifactPointers: [] },
        { id: 'scenario-review', index: 1, status: 'pending-confirmation', artifactPointers: [] },
      ],
      pendingConfirmation: {
        confirmationId: 'scenario-review-completion',
        phaseId: 'scenario-review',
        fromPhaseId: 'scenario-review',
        toPhaseId: null,
        completionCheckId: 'scenario-review-completion',
        artifactRefs: [],
        createdAt: NOW,
        status: 'pending',
      },
    })

    await expect(service.requestWorkflowRoute({
      state,
      requestedAt: NOW,
      request: {
        phaseId: 'scenario-review',
        stateVersion: state.stateVersion,
        intent: 'jump_to_phase',
        targetPhaseId: 'delegate-implement',
        rationale: 'The review found an implementation defect.',
        evidence: [{ kind: 'validation-failure' }],
      },
    })).rejects.toMatchObject({ code: 'WORKFLOW_ROUTE_FORBIDDEN' })
  })

  test('supports advance and rework_current_phase route intents after a pending completion', async () => {
    const service = await makeService()
    const pendingState = () => makeState({
      workflowStatus: 'pending-confirmation',
      status: 'pending-confirmation',
      runStatus: 'waiting_for_user',
      phases: [
        { id: 'requirements', index: 0, status: 'pending-confirmation', artifactPointers: [] },
        { id: 'implementation', index: 1, status: 'created', artifactPointers: [] },
      ],
      pendingConfirmation: {
        confirmationId: 'requirements-ready',
        phaseId: 'requirements',
        fromPhaseId: 'requirements',
        toPhaseId: 'implementation',
        completionCheckId: 'requirements-ready',
        artifactRefs: [],
        createdAt: NOW,
        status: 'pending',
      },
    })

    const advanceState = pendingState()
    const advanceRoute = await service.requestWorkflowRoute({
      state: advanceState,
      requestedAt: NOW,
      request: {
        phaseId: 'requirements', stateVersion: advanceState.stateVersion,
        intent: 'advance', rationale: 'Proceed to implementation.', evidence: [],
      },
    })
    const advanced = await service.applyTransition({
      state: advanceRoute.state,
      requestedAt: NOW,
      request: {
        phaseId: 'requirements',
        action: 'confirm',
        confirmationId: advanceRoute.state.pendingConfirmation!.confirmationId,
        stateVersion: advanceRoute.state.stateVersion,
      },
    })
    expect(advanced.state.activePhaseId).toBe('implementation')

    const reworkState = pendingState()
    const reworkRoute = await service.requestWorkflowRoute({
      state: reworkState,
      requestedAt: NOW,
      request: {
        phaseId: 'requirements', stateVersion: reworkState.stateVersion,
        intent: 'rework_current_phase', rationale: 'Revise the current phase.', evidence: [],
      },
    })
    const reworked = await service.applyTransition({
      state: reworkRoute.state,
      requestedAt: NOW,
      request: {
        phaseId: 'requirements',
        action: 'confirm',
        confirmationId: reworkRoute.state.pendingRoute!.routeId,
        stateVersion: reworkRoute.state.stateVersion,
      },
    })
    expect(reworked.state.activePhaseId).toBe('requirements')
    expect(reworked.state.phases[0]?.status).toBe('running')
    expect(reworked.state.pendingConfirmation).toBeNull()
  })

  test('allows a blocked phase to request and confirm a jump_to_phase recovery without a pending completion', async () => {
    const service = await makeService()
    const template = makeTemplate({
      phases: [
        {
          id: 'requirements', label: 'Requirements', instructions: 'Gather requirements.', requestedModel: null,
          skillDeclarations: [], requiredArtifacts: [], completionCriteria: [], transitionAuthority: 'user-confirmation',
        },
        {
          id: 'implementation', label: 'Implementation', instructions: 'Repair the implementation.', requestedModel: null,
          skillDeclarations: [], requiredArtifacts: [], completionCriteria: [], transitionAuthority: 'user-confirmation',
        },
        {
          id: 'verification', label: 'Verification', instructions: 'Verify the result.', requestedModel: null,
          skillDeclarations: [], requiredArtifacts: [], completionCriteria: [], transitionAuthority: 'user-confirmation',
        },
      ],
    })
    const state = makeState({
      templateSnapshot: template,
      activePhaseId: 'verification',
      workflowStatus: 'running',
      status: 'running',
      runStatus: 'blocked',
      phases: [
        { id: 'requirements', index: 0, status: 'completed', artifactPointers: [] },
        {
          id: 'implementation', index: 1, status: 'completed', completedAt: '2026-05-19T00:00:00.000Z',
          completion: { passed: true }, blockedReason: 'Old implementation state must not leak into repair.',
          artifactPointers: [pointer('stale-implementation-artifact')],
        },
        {
          id: 'verification', index: 2, status: 'running', artifactPointers: [],
          blockedReason: 'Verification found an implementation defect that requires a repair loop.',
        },
      ],
      pendingConfirmation: null,
    })

    const requested = await service.requestWorkflowRoute({
      state,
      requestedAt: NOW,
      request: {
        phaseId: 'verification',
        stateVersion: state.stateVersion,
        intent: 'jump_to_phase',
        targetPhaseId: 'implementation',
        rationale: 'Return to implementation to repair the verified defect.',
        evidence: [{ kind: 'verification-failure', ref: 'test:verification:defect' }],
        requireUserConfirmation: true,
      },
    })

    expect(requested.state.pendingConfirmation).toBeNull()
    expect(requested.state.pendingRoute).toMatchObject({
      phaseId: 'verification',
      intent: 'jump_to_phase',
      targetPhaseId: 'implementation',
      status: 'pending',
    })
    expect(requested.state.runStatus).toBe('waiting_for_user')

    const confirmed = await service.applyTransition({
      state: requested.state,
      requestedAt: NOW,
      request: {
        phaseId: 'verification',
        action: 'confirm',
        confirmationId: requested.state.pendingRoute!.routeId,
        stateVersion: requested.state.stateVersion,
      },
    })

    expect(confirmed.state.activePhaseId).toBe('implementation')
    expect(confirmed.state.phases.find((phase) => phase.id === 'implementation')).toMatchObject({ status: 'running', startedAt: NOW, artifactPointers: [] })
    expect(confirmed.state.phases.find((phase) => phase.id === 'implementation')?.completedAt).toBeUndefined()
    expect(confirmed.state.phases.find((phase) => phase.id === 'implementation')?.completion).toBeUndefined()
    expect(confirmed.state.phases.find((phase) => phase.id === 'implementation')?.blockedReason).toBeUndefined()
    expect(confirmed.state.phases.find((phase) => phase.id === 'verification')?.blockedReason).toBeUndefined()
    expect(confirmed.state.pendingConfirmation).toBeNull()
    expect(confirmed.state.pendingRoute).toBeNull()
    expect(confirmed.state.runStatus).toBe('active')
    expect(confirmed.state.transitionHistory.at(-1)).toMatchObject({ action: 'route-recovery-confirmed' })

    const repaired = await service.submitPhaseCompletion({
      state: confirmed.state,
      requestedAt: '2026-05-20T00:01:00.000Z',
      transitionId: 'implementation-repair-complete',
      submission: completionSubmission({
        phaseId: 'implementation',
        stateVersion: confirmed.state.stateVersion,
        handoff: { summary: 'Implementation repair is ready.', artifacts: [], next: 'Verify the repaired implementation.' },
        rationale: 'The routed repair is complete.',
        evidence: [{ kind: 'repair', label: 'Implementation repair', ref: 'test:implementation:repair' }],
      }),
    })
    expect(repaired.state.pendingRoute).toBeNull()
    expect(repaired.state.pendingConfirmation).toMatchObject({ phaseId: 'implementation', toPhaseId: 'verification', status: 'pending' })

    const advanced = await service.applyTransition({
      state: repaired.state,
      requestedAt: '2026-05-20T00:02:00.000Z',
      request: {
        phaseId: 'implementation',
        action: 'confirm',
        confirmationId: repaired.state.pendingConfirmation!.confirmationId,
        stateVersion: repaired.state.stateVersion,
      },
    })
    expect(advanced.state.activePhaseId).toBe('verification')
    expect(advanced.state.pendingRoute).toBeNull()
    expect(advanced.state.pendingConfirmation).toBeNull()
    expect(advanced.state.phases.find((phase) => phase.id === 'verification')).toMatchObject({ status: 'running', artifactPointers: [] })
    expect(advanced.state.phases.find((phase) => phase.id === 'verification')?.completedAt).toBeUndefined()
    expect(advanced.state.phases.find((phase) => phase.id === 'verification')?.completion).toBeUndefined()
  })

  test('allows a blocked phase to confirm rework_current_phase without fabricating a completion', async () => {
    const service = await makeService()
    const state = makeState({
      workflowStatus: 'running',
      status: 'running',
      runStatus: 'blocked',
      phases: [
        {
          id: 'requirements', index: 0, status: 'running', artifactPointers: [],
          blockedReason: 'The requirements need a focused correction before completion.',
        },
        { id: 'implementation', index: 1, status: 'created', artifactPointers: [] },
      ],
      pendingConfirmation: null,
    })

    const requested = await service.requestWorkflowRoute({
      state,
      requestedAt: NOW,
      request: {
        phaseId: 'requirements',
        stateVersion: state.stateVersion,
        intent: 'rework_current_phase',
        rationale: 'Rework the active phase using the recorded blocker.',
        evidence: [{ kind: 'rework', ref: 'test:requirements:blocker' }],
        requireUserConfirmation: true,
      },
    })
    expect(requested.state.pendingRoute).toMatchObject({
      intent: 'rework_current_phase',
      targetPhaseId: 'requirements',
      origin: 'blocked-recovery',
    })
    expect(requested.state.pendingConfirmation).toBeNull()

    const confirmed = await service.applyTransition({
      state: requested.state,
      requestedAt: NOW,
      request: {
        phaseId: 'requirements',
        action: 'confirm',
        confirmationId: requested.state.pendingRoute!.routeId,
        stateVersion: requested.state.stateVersion,
      },
    })

    expect(confirmed.state.activePhaseId).toBe('requirements')
    expect(confirmed.state.phases[0]).toMatchObject({ status: 'running' })
    expect(confirmed.state.phases[0]?.completedAt).toBeUndefined()
    expect(confirmed.state.phases[0]?.blockedReason).toBeUndefined()
    expect(confirmed.state.pendingConfirmation).toBeNull()
    expect(confirmed.state.pendingRoute).toBeNull()
    expect(confirmed.state.runStatus).toBe('active')
    expect(confirmed.state.transitionHistory.at(-1)).toMatchObject({ action: 'route-recovery-confirmed' })
  })

  test('keeps blocked recovery constrained to rework_current_phase or jump_to_phase', async () => {
    const service = await makeService()
    const state = makeState({
      workflowStatus: 'running',
      status: 'running',
      runStatus: 'blocked',
      phases: [
        {
          id: 'requirements', index: 0, status: 'running', artifactPointers: [],
          blockedReason: 'The current phase needs a controlled recovery.',
        },
        { id: 'implementation', index: 1, status: 'created', artifactPointers: [] },
      ],
      pendingConfirmation: null,
    })

    await expect(service.requestWorkflowRoute({
      state,
      requestedAt: NOW,
      request: {
        phaseId: 'requirements',
        stateVersion: state.stateVersion,
        intent: 'advance',
        rationale: 'Advance must not bypass a blocked completion gate.',
        evidence: [],
      },
    })).rejects.toMatchObject({ code: 'WORKFLOW_ROUTE_RECOVERY_INTENT_INVALID' })
  })

  test('retains stale-version and target validation for blocked recovery routes', async () => {
    const service = await makeService()
    const state = makeState({
      workflowStatus: 'running',
      status: 'running',
      runStatus: 'blocked',
      phases: [
        {
          id: 'requirements', index: 0, status: 'running', artifactPointers: [],
          blockedReason: 'A controlled recovery route is required.',
        },
        { id: 'implementation', index: 1, status: 'created', artifactPointers: [] },
      ],
      pendingConfirmation: null,
    })

    await expect(service.requestWorkflowRoute({
      state,
      requestedAt: NOW,
      request: {
        phaseId: 'requirements',
        stateVersion: state.stateVersion - 1,
        intent: 'jump_to_phase',
        targetPhaseId: 'implementation',
        rationale: 'A stale state must not create a blocked recovery route.',
        evidence: [],
      },
    })).rejects.toMatchObject({ code: 'WORKFLOW_STATE_STALE' })

    await expect(service.requestWorkflowRoute({
      state,
      requestedAt: NOW,
      request: {
        phaseId: 'requirements',
        stateVersion: state.stateVersion,
        intent: 'jump_to_phase',
        targetPhaseId: 'does-not-exist',
        rationale: 'An unknown phase must not create a blocked recovery route.',
        evidence: [],
      },
    })).rejects.toMatchObject({ code: 'WORKFLOW_ROUTE_TARGET_INVALID' })
    expect(state.pendingRoute).toBeUndefined()
    expect(state.runStatus).toBe('blocked')
  })

  test('defensively rejects a legacy cross-workflow route received outside the typed contract', async () => {
    const service = await makeService()
    const state = makeState({
      workflowStatus: 'pending-confirmation', status: 'pending-confirmation', runStatus: 'waiting_for_user',
      phases: [
        { id: 'requirements', index: 0, status: 'pending-confirmation', artifactPointers: [] },
        { id: 'implementation', index: 1, status: 'created', artifactPointers: [] },
      ],
      pendingConfirmation: {
        confirmationId: 'requirements-ready', phaseId: 'requirements', fromPhaseId: 'requirements',
        toPhaseId: 'implementation', completionCheckId: 'requirements-ready', artifactRefs: [], createdAt: NOW, status: 'pending',
      },
    })
    await expect(service.requestWorkflowRoute({
      state, requestedAt: NOW,
      request: {
        phaseId: 'requirements', stateVersion: state.stateVersion, intent: 'route_to_workflow',
        targetWorkflowId: 'debug-repair-workflow-v8', rationale: 'This needs a dedicated debug workflow.', evidence: [],
      } as never,
    })).rejects.toMatchObject({ code: 'WORKFLOW_ROUTE_UNSUPPORTED' })
    expect(state.activePhaseId).toBe('requirements')
  })

  test('rejects a stale workflow route request without mutating the pending completion', async () => {
    const service = await makeService()
    const state = makeState({
      workflowStatus: 'pending-confirmation',
      status: 'pending-confirmation',
      runStatus: 'waiting_for_user',
      phases: [
        { id: 'requirements', index: 0, status: 'pending-confirmation', artifactPointers: [] },
        { id: 'implementation', index: 1, status: 'created', artifactPointers: [] },
      ],
      pendingConfirmation: {
        confirmationId: 'pending-requirements',
        phaseId: 'requirements',
        fromPhaseId: 'requirements',
        toPhaseId: 'implementation',
        completionCheckId: 'pending-requirements',
        artifactRefs: [],
        createdAt: NOW,
        status: 'pending',
      },
    })

    await expect(service.requestWorkflowRoute({
      state,
      requestedAt: NOW,
      request: {
        phaseId: 'requirements',
        stateVersion: state.stateVersion - 1,
        intent: 'advance',
        rationale: 'Advance after confirmation.',
        evidence: [],
      },
    })).rejects.toMatchObject({ code: 'WORKFLOW_STATE_STALE' })
    expect(state.pendingRoute).toBeUndefined()
    expect(state.pendingConfirmation?.status).toBe('pending')
  })

  test('rejects a route target that is not in the workflow template', async () => {
    const service = await makeService()
    const state = makeState({
      workflowStatus: 'pending-confirmation',
      status: 'pending-confirmation',
      runStatus: 'waiting_for_user',
      phases: [
        { id: 'requirements', index: 0, status: 'pending-confirmation', artifactPointers: [] },
        { id: 'implementation', index: 1, status: 'created', artifactPointers: [] },
      ],
      pendingConfirmation: {
        confirmationId: 'pending-requirements',
        phaseId: 'requirements',
        fromPhaseId: 'requirements',
        toPhaseId: 'implementation',
        completionCheckId: 'pending-requirements',
        artifactRefs: [],
        createdAt: NOW,
        status: 'pending',
      },
    })

    await expect(service.requestWorkflowRoute({
      state,
      requestedAt: NOW,
      request: {
        phaseId: 'requirements',
        stateVersion: state.stateVersion,
        intent: 'jump_to_phase',
        targetPhaseId: 'does-not-exist',
        rationale: 'Need a valid target.',
        evidence: [],
      },
    })).rejects.toMatchObject({ code: 'WORKFLOW_ROUTE_TARGET_INVALID' })
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

    test('keeps needs_user completion at the structured stage gate even when the phase allows auto transition', async () => {
      const service = await makeService()
      const result = await service.submitPhaseCompletion({
        state: runningState(),
        requestedAt: '2026-05-20T00:05:30.000Z',
        transitionId: 'submit-needs-user-1',
        submission: completionSubmission({ status: 'needs_user' }),
      })

      expect(result.status).toBe('pending')
      expect(result.state.activePhaseId).toBe('requirements')
      expect(result.state.pendingConfirmation?.submission?.status).toBe('needs_user')
    })

    test('auto-advances a completed submission only when the current phase transition authority is auto', async () => {
      const service = await makeService()
      const result = await service.submitPhaseCompletion({
        state: runningState(),
        requestedAt: '2026-05-20T00:05:45.000Z',
        transitionId: 'submit-completed-auto-1',
        submission: completionSubmission({ status: 'completed' }),
      })

      expect(result.status).toBe('recorded')
      expect(result.state.activePhaseId).toBe('implementation')
      expect(result.state.pendingConfirmation).toBeNull()
      expect(result.state.transitionHistory).toContainEqual(expect.objectContaining({
        transitionId: 'submit-completed-auto-1',
        action: 'auto-advance',
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
        'workflow route hidden in handoff',
        completionSubmission({
          handoff: {
            summary: 'Validation found a defect that requires implementation repair.',
            routeRequest: {
              intent: 'jump_to_phase',
              targetPhaseId: 'implementation',
            },
          },
        }),
        'WORKFLOW_ROUTE_REQUEST_REQUIRED',
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
          confirmationId: pending.pendingConfirmation!.confirmationId,
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
          confirmationId: pending.pendingConfirmation!.confirmationId,
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
          confirmationId: pending.pendingConfirmation!.confirmationId,
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
          confirmationId: pending.pendingConfirmation!.confirmationId,
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
          ...(action === 'confirm' || action === 'reject'
            ? { confirmationId: state.pendingConfirmation!.confirmationId }
            : {}),
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
          confirmationId: pending.pendingConfirmation!.confirmationId,
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
          confirmationId: pending.pendingConfirmation!.confirmationId,
          stateVersion: first.state.stateVersion - 1,
          transitionId: 'confirm-idempotent-1',
        } as unknown as WorkflowTransitionRequest,
      })

      expect(second.state).toEqual(first.state)
      expect(second.state.activePhaseId).toBe('implementation')
      expect(second.state.phases[0].artifactPointers).toHaveLength(1)
      expect(second.state.transitionHistory.filter((transition) =>
        transition.transitionId === 'confirm-idempotent-1'
      )).toHaveLength(1)
      expect(second.notifications).toEqual([
        expect.objectContaining({ subtype: 'workflow_state', data: first.state }),
      ])
    })

    test.each(['confirm', 'reject'] as const)('requires the current confirmation token for pending %s actions', async (action) => {
      const service = await makeService()
      const pending = pendingReadyState()

      await expect(service.applyTransition({
        state: pending,
        requestedAt: '2026-05-20T00:15:15.000Z',
        request: {
          phaseId: 'requirements',
          action,
          stateVersion: pending.stateVersion,
          transitionId: `missing-confirmation-token-${action}`,
        } as WorkflowTransitionRequest,
      })).rejects.toMatchObject({
        code: 'WORKFLOW_CONFIRMATION_SUPERSEDED',
        statusCode: 409,
      })

      expect(pending.pendingConfirmation?.confirmationId).toBe('confirm-ready-1')
      expect(pending.activePhaseId).toBe('requirements')
      expect(pending.transitionHistory).toHaveLength(0)
    })

    test('rejects a superseded confirmation token without mutating the newer pending confirmation', async () => {
      const service = await makeService()
      const pending = pendingReadyState({
        pendingConfirmation: {
          confirmationId: 'current-confirmation',
          phaseId: 'requirements',
          fromPhaseId: 'requirements',
          toPhaseId: 'implementation',
          completionCheckId: 'current-confirmation',
          artifactRefs: [],
          createdAt: NOW,
          status: 'pending',
        },
      })

      await expect(service.applyTransition({
        state: pending,
        requestedAt: '2026-05-20T00:15:30.000Z',
        request: {
          phaseId: 'requirements',
          action: 'confirm',
          confirmationId: 'superseded-confirmation',
          stateVersion: pending.stateVersion,
          transitionId: 'superseded-confirmation-attempt',
        } as WorkflowTransitionRequest,
      })).rejects.toMatchObject({
        code: 'WORKFLOW_CONFIRMATION_SUPERSEDED',
        statusCode: 409,
      })

      expect(pending.pendingConfirmation?.confirmationId).toBe('current-confirmation')
      expect(pending.activePhaseId).toBe('requirements')
      expect(pending.transitionHistory).toHaveLength(0)
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
          confirmationId: pending.pendingConfirmation!.confirmationId,
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
  test('injects the bundled complete brainstorming contract when this workflow has no native brainstorming Skill and mode is on or eligible auto', async () => {
    const bundledSkillsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'workflow-runtime-fallback-bundled-'))
    const bundledSkillDir = path.join(bundledSkillsDir, 'brainstorming')

    try {
      await fs.mkdir(bundledSkillDir, { recursive: true })
      await fs.writeFile(
        path.join(bundledSkillDir, 'SKILL.md'),
        [
          '---',
          'name: brainstorming',
          'referenceId: superpowers:brainstorming',
          '---',
          '# Brainstorming Ideas Into Designs',
          '',
          '<HARD-GATE>',
          'Wait for user approval before implementation.',
          '</HARD-GATE>',
          '',
        ].join('\n'),
        'utf-8',
      )

      const service = await makeService({
        skillCatalog: async () => [{
          name: 'brainstorming',
          displayName: 'Brainstorming',
          source: 'bundled',
          sourcePath: path.join(bundledSkillDir, 'SKILL.md'),
        }, {
          name: 'superpowers:brainstorming',
          displayName: 'Brainstorming in another workflow ZIP',
          source: 'managed',
          packId: 'another-workflow-pack',
          referenceId: 'superpowers:brainstorming',
          sourcePath: 'pack://another-workflow-pack/skills/brainstorming/SKILL.md',
        }],
      })


      const template = makeTemplate({
        source: 'pack',
        phases: [
          {
            id: 'scope-plan',
            label: 'Scope Plan',
            instructions: 'Explore and lock scope.',
            requestedModel: null,
            skillDeclarations: [],
            requiredArtifacts: [],
            completionCriteria: ['scope is confirmed'],
            transitionAuthority: 'user-confirmation',
          },
        ],
      })
      for (const brainstormingMode of ['on', 'auto'] as const) {
        const state = makeState({
          brainstormingMode,
          labels: ['new-product'],
          activePhaseId: 'scope-plan',
          templateSnapshot: template,
          phases: [{ id: 'scope-plan', index: 0, status: 'running', artifactPointers: [] }],
        })

        const prompt = await service.assemblePrompt({
          state,
          userMessage: 'Continue scope discovery.',
        })

        expect(prompt.content).toContain('Bundled brainstorming fallback is active')
        expect(prompt.content).toContain('# Brainstorming Ideas Into Designs')
        expect(prompt.content).toContain('<HARD-GATE>')
        expect(prompt.content).toContain('superpowers:brainstorming: fallback')
        expect(prompt.content).not.toContain('Native Superpowers brainstorming is available and active')
      }
    } finally {
      await fs.rm(bundledSkillsDir, { recursive: true, force: true })
    }
  }, 20_000)
})
