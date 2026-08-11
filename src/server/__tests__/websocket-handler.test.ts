import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'
import type { ServerWebSocket } from 'bun'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  __resetWebSocketHandlerStateForTests,
  closeSessionConnection,
  getActiveSessionIds,
  handleWebSocket,
  refreshWorkflowRuntimeBinding,
  sendToSession,
  workflowNotificationForDesktop,
  assistantTextRequestsStrictVisualBoundedDecision,
  hasStrictVisualReviewReceipt,
  containsStrictVisualUnsafeAbsolutePlanBadge,
  containsStrictVisualGeneratedSemanticPseudoText,
  containsStrictVisualMisleadingPaymentCode,
  containsStrictVisualProcessDisclaimer,
  userRequestsStrictVisualFinalDelivery,
  strictVisualPublicReferenceUrls,
  userRequestsStrictVisualPublicResearch,
  type WebSocketData,
} from '../ws/handler.js'
import { conversationService } from '../services/conversationService.js'
import { computerUseApprovalService } from '../services/computerUseApprovalService.js'
import { diagnosticsService } from '../services/diagnosticsService.js'
import { sessionService } from '../services/sessionService.js'
import { WorkflowSessionStateService } from '../services/workflowSessionStateService.js'
import type { WorkflowSessionState, WorkflowTemplate } from '../services/workflowTypes.js'
import { setWorkflowRuntimeTemplateLoaderForTests } from '../services/workflowRuntimeTemplateService.js'
import { recalculateWorkflowCompletionEligibility } from '../services/workflowCompletionGate.js'

describe('strict visual plan badge detection', () => {
  it('rejects an absolutely positioned plan ribbon that can cover tier copy', () => {
    expect(containsStrictVisualUnsafeAbsolutePlanBadge('.plan-badge { position: absolute; top: 0; right: 0 }')).toBe(true)
  })

  it('allows a plan ribbon in normal layout flow', () => {
    expect(containsStrictVisualUnsafeAbsolutePlanBadge('.plan-badge { position: static; margin-inline-start: auto }')).toBe(false)
  })
})

describe('strict visual semantic-label guard', () => {
  it('rejects CSS-generated words in a tab or other semantic control', () => {
    expect(containsStrictVisualGeneratedSemanticPseudoText('.tab.on:after { content: "企业" }')).toBe(true)
    expect(containsStrictVisualGeneratedSemanticPseudoText('.login::before { content: "登录" }')).toBe(true)
  })

  it('allows decorative punctuation and empty pseudo-elements', () => {
    expect(containsStrictVisualGeneratedSemanticPseudoText('.brand-mark:after { content: "" }')).toBe(false)
    expect(containsStrictVisualGeneratedSemanticPseudoText('.tab:after { content: "→" }')).toBe(false)
  })
})
describe('strict visual payment honesty guard', () => {
  it('rejects a stripe-based fake payment code but allows an ordinary payment CTA', () => {
    expect(containsStrictVisualMisleadingPaymentCode('.payment-code { background: repeating-linear-gradient(90deg, #000 0 4px, #fff 4px 8px); }')).toBe(true)
    expect(containsStrictVisualMisleadingPaymentCode('.pay-action { background: linear-gradient(90deg, #ff8c4d, #ff654e); }')).toBe(false)
  })

  it('keeps prototype-process disclaimers out of customer-facing HTML', () => {
    expect(containsStrictVisualProcessDisclaimer('<p>这是交互/视觉假设，不是已完成的用户验证。</p>')).toBe(true)
    expect(containsStrictVisualProcessDisclaimer('<button>登录后扫码支付</button>')).toBe(false)
  })
})
describe('strict visual final-delivery request detection', () => {
  it('recognizes a screenshot-driven redesign request that expects a rendered artifact', () => {
    expect(userRequestsStrictVisualFinalDelivery('请把这张截图重构成最终 PNG 视觉稿。', [{ mimeType: 'image/png', path: 'C:/tmp/source.png' }])).toBe(true)
    expect(userRequestsStrictVisualFinalDelivery('Build an HTML prototype and render it to PNG.')).toBe(true)
  })

  it('does not mistake a read-only screenshot diagnosis for a final visual delivery request', () => {
    expect(userRequestsStrictVisualFinalDelivery('先看这张截图，告诉我有什么 UX 问题。', [{ mimeType: 'image/png', path: 'C:/tmp/source.png' }])).toBe(false)
  })
})
describe('strict visual locked-reference parsing', () => {
  it('normalizes a user-supplied closed URL pair without retaining duplicate tracking variants', () => {
    expect(strictVisualPublicReferenceUrls('Use https://www.bandicam.com/buy/#plans、and https://www.raycast.com/pricing?utm_source=test，not a third site.')).toEqual([
      'https://www.bandicam.com/buy/',
      'https://www.raycast.com/pricing?utm_source=test',
    ])
    expect(strictVisualPublicReferenceUrls('https://www.bandicam.com/buy/ https://www.bandicam.com/buy/')).toEqual([
      'https://www.bandicam.com/buy/',
    ])
  })
})
describe('strict visual public-reference request detection', () => {
  it('recognizes a user-supplied public URL or explicit reference-site research request', () => {
    expect(userRequestsStrictVisualPublicResearch('Please inspect https://www.zcool.com.cn/ for visual references.')).toBe(true)
    expect(userRequestsStrictVisualPublicResearch('请找两个灵感参考网站再开始。')).toBe(true)
  })

  it('does not treat ordinary screenshot intake as an already-approved research decision', () => {
    expect(userRequestsStrictVisualPublicResearch('我上传了支付页截图，先看图后给我诊断。')).toBe(false)
  })
})
describe('strict visual review receipt', () => {
  const evidence = 'taste-redesign; impeccable-visual-refinement; ui-craft-critique; ui-craft-finalize; source-fidelity-final-pass. visual-register: practical recorder purchase window, using the source orange rail and dense transaction rhythm. removed: generic dark summary card. source-fidelity: tabs, plan labels, prices, and payment relationship match the source ledger; duplicate scan: none. collision: no badge covers a tier label or price at 390 mobile. 1440 desktop, 1024 tablet, 390 mobile reviewed.'

  it('rejects a receipt that omits the Impeccable refinement evidence', () => {
    expect(hasStrictVisualReviewReceipt(evidence.replace('impeccable-visual-refinement; ', ''))).toBe(false)
  })

  it('accepts the full source-specific receipt', () => {
    expect(hasStrictVisualReviewReceipt(evidence)).toBe(true)
  })
})

describe('strict visual choice detection', () => {
  it('does not mistake a completed direction for a new choice request', () => {
    expect(assistantTextRequestsStrictVisualBoundedDecision(
      '设计方向已选方向 A「决策路径型」。默认选项仍需由真实产品逻辑确认。',
    )).toBe(false)
  })

  it('continues to detect a direct bounded choice request', () => {
    expect(assistantTextRequestsStrictVisualBoundedDecision(
      '请选方向 A、B 或 C。',
    )).toBe(true)
  })
})

beforeEach(() => {
  setWorkflowRuntimeTemplateLoaderForTests(async (state): Promise<WorkflowTemplate | null> => {
    if (state.templateSnapshot) return state.templateSnapshot
    const templateId = state.templateIdentity?.id ?? 'ephemeral-workflow'
    return {
      schemaVersion: 1,
      id: templateId,
      source: state.templateIdentity?.source ?? 'builtin',
      version: state.templateIdentity?.version ?? '1',
      displayName: templateId,
      description: 'Test-only current workflow template.',
      phases: state.phases.map((phase) => ({
        id: phase.id,
        label: phase.label ?? phase.id,
        instructions: `Continue workflow phase ${phase.id}.`,
        requestedModel: null,
        skillDeclarations: [],
        requiredArtifacts: [],
        completionCriteria: { type: 'agent-reported' },
        transitionAuthority: phase.transitionAuthority ?? 'auto',
      })),
    }
  })
})

afterEach(() => {
  setWorkflowRuntimeTemplateLoaderForTests(null)
})

type TestClientSocket = ServerWebSocket<WebSocketData> & {
  sent: string[]
  setSendResult: (result: number) => void
  setSendError: (error: Error | null) => void
}

function makeClientSocket(sessionId: string): TestClientSocket {
  const sent: string[] = []
  let sendResult = 1
  let sendError: Error | null = null
  return {
    data: {
      sessionId,
      connectedAt: Date.now(),
      channel: 'client',
      sdkToken: null,
      serverPort: 0,
      serverHost: '127.0.0.1',
    },
    send: mock((payload: string) => {
      if (sendError) throw sendError
      sent.push(payload)
      return sendResult
    }),
    close: mock(() => {}),
    sent,
    setSendResult: (result: number) => {
      sendResult = result
    },
    setSendError: (error: Error | null) => {
      sendError = error
    },
  } as unknown as TestClientSocket
}

async function flushAsyncHandlers() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

async function waitForCondition(
  predicate: () => boolean,
  timeoutMs = 15000,
): Promise<void> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) break
    await flushAsyncHandlers()
  }
}

async function waitForAsyncCondition(
  predicate: () => Promise<boolean>,
  timeoutMs = 2000,
): Promise<void> {
  const start = Date.now()
  while (!(await predicate())) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out waiting for asynchronous condition')
    }
    await flushAsyncHandlers()
  }
}

function parseSentMessages(ws: { sent: string[] }) {
  return ws.sent.map((payload) => JSON.parse(payload) as Record<string, unknown>)
}

function makeExpertRuntimeMetadata(status: 'active' | 'exited') {
  return {
    mode: 'expert' as const,
    expertId: 'repo-health-check',
    expertName: 'Repository health',
    packId: 'repo-health-check',
    packVersion: '1.0.0',
    status,
    materialRefs: [],
    startedAt: '2026-05-20T00:00:00.000Z',
    updatedAt: '2026-05-20T00:00:00.000Z',
    ...(status === 'active'
      ? {
          runtimeBinding: {
            schemaVersion: 1 as const,
            active: true as const,
            expertId: 'repo-health-check',
            expertName: 'Repository health',
            packId: 'repo-health-check',
            packVersion: '1.0.0',
            promptSnapshot: 'Inspect the repository carefully before offering conclusions.',
            skills: [{
              skillId: 'repository-health',
              title: 'Repository health review',
              path: 'skills/repository-health/SKILL.md',
              sha256: 'a'.repeat(64),
              content: 'Report concrete repository health findings with evidence.',
            }],
            hostTools: [],
            tools: [{
              id: 'read-project',
              name: 'Read project',
              type: 'hostBuiltinRef' as const,
              purpose: 'Inspect repository files',
              entrypoint: 'Read',
              hostToolId: 'Read',
              permissions: [],
            }],
            permissions: [{
              id: 'read-only',
              description: 'Do not mutate repository files.',
            }],
            activatedAt: '2026-05-20T00:00:00.000Z',
          },
        }
      : {
          exitedAt: '2026-05-20T00:10:00.000Z',
        }),
  }
}

function withCompletionEligibleRuntimeContract(state: WorkflowSessionState): WorkflowSessionState {
  const now = state.updatedAt
  // Test fixtures use this only for paths that model a phase after an explicit
  // user review. Legacy persistence tests deliberately use raw states instead.
  return recalculateWorkflowCompletionEligibility({
    ...state,
    runtimeContract: {
      schemaVersion: 1,
      migrationStatus: 'current',
      phaseStates: Object.fromEntries(state.phases.map((phase) => [phase.id, {
        phaseId: phase.id,
        workStatus: phase.id === state.activePhaseId ? 'ready-for-review' : 'not-started',
        eligibility: 'ineligible',
        blockerReasons: [],
        issues: [],
        artifactRequirements: [],
        checks: [{
          id: 'completion-criteria',
          description: 'Fixture completion review.',
          required: true,
          status: phase.id === state.activePhaseId ? 'passed' : 'pending',
          evidenceArtifactIds: [],
          updatedAt: now,
        }],
        taskSnapshots: [],
        evaluatedAt: now,
      }])),
      audit: [{
        at: now,
        type: 'runtime-contract-created',
        summary: 'Fixture workflow completion contract.',
      }],
    },
  }, state.templateSnapshot, now)
}

function makeWorkflowState(sessionId: string): WorkflowSessionState {
  const now = '2026-05-20T00:00:00.000Z'
  const state: WorkflowSessionState = {
    schemaVersion: 1,
    sessionId,
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
      description: 'Workflow transition fixture.',
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
          instructions: 'Design the solution.',
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
    status: 'running',
    workflowStatus: 'running',
    activePhaseId: 'requirements-clarification',
    phases: [
      {
        id: 'requirements-clarification',
        label: 'Requirements Clarification',
        transitionAuthority: 'user-confirmation',
        index: 0,
        status: 'running',
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
    stateVersion: 1,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    pendingConfirmation: null,
  }

  return withCompletionEligibleRuntimeContract(state)
}

function makeFollowUpWorkflowStageOneState(
  sessionId: string,
  input: {
    templateId: string
    phaseId: string
    toolPolicy?: { allowedTools: string[]; disallowedTools?: string[] }
    runtimeContract?: {
      allowedActions?: string[]
      forbiddenActions?: string[]
      allowedTools?: string[]
      disallowedTools?: string[]
      toolAccess?: {
        allowed?: string[]
        forbidden?: string[]
      }
    }
  },
): WorkflowSessionState {
  const state = makeWorkflowState(sessionId)
  const phase = {
    id: input.phaseId,
    label: `${input.templateId} Stage 1`,
    instructions: 'Start the follow-up workflow safely.',
    requestedModel: null,
    skillDeclarations: [],
    requiredArtifacts: [],
    completionCriteria: { type: 'agent-reported' as const },
    transitionAuthority: 'user-confirmation' as const,
    ...(input.toolPolicy ? { toolPolicy: input.toolPolicy } : {}),
    ...(input.runtimeContract ? { runtimeContract: input.runtimeContract } : {}),
  }
  return withCompletionEligibleRuntimeContract({
    ...state,
    template: {
      ...state.template,
      id: input.templateId,
      snapshotId: `${input.templateId}-snapshot`,
    },
    templateIdentity: {
      ...state.templateIdentity,
      id: input.templateId,
      registryKey: `user:${input.templateId}`,
    },
    templateSnapshot: {
      ...state.templateSnapshot,
      id: input.templateId,
      source: 'user',
      displayName: input.templateId,
      phases: [phase],
    },
    activePhaseId: input.phaseId,
    phases: [{
      id: input.phaseId,
      label: phase.label,
      transitionAuthority: phase.transitionAuthority,
      index: 0,
      status: 'running',
      artifactPointers: [],
    }],
  })
}

function makeCreatedWorkflowState(sessionId: string): WorkflowSessionState {
  const state = makeWorkflowState(sessionId)
  return {
    ...state,
    status: 'created',
    workflowStatus: 'created',
    runStatus: 'draft',
    phases: state.phases.map((phase) => ({
      ...phase,
      status: 'created',
    })),
    workflowRuns: [
      {
        id: `${sessionId}-run-1`,
        templateId: state.template.id,
        status: 'draft',
        workspaceRoot: process.cwd(),
        currentPhaseId: state.activePhaseId ?? undefined,
        artifacts: [],
        history: [
          {
            type: 'created',
            at: state.createdAt,
            summary: 'Workflow run created.',
          },
        ],
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
      },
    ],
  }
}

function makePendingWorkflowState(sessionId: string): WorkflowSessionState {
  const state = makeWorkflowState(sessionId)
  const artifact = {
    kind: 'phase-artifact' as const,
    sessionId,
    artifactId: 'requirements-ready-1',
    schemaVersion: 1,
    createdAt: '2026-05-20T00:01:00.000Z',
    updatedAt: '2026-05-20T00:01:00.000Z',
    label: 'Requirements completion',
    phaseId: 'requirements-clarification',
    title: 'Requirements completion',
    lifecycleStatus: 'pending' as const,
  }

  return {
    ...state,
    status: 'pending-confirmation',
    workflowStatus: 'pending-confirmation',
    stateVersion: 3,
    revision: 3,
    phases: [
      {
        ...state.phases[0],
        status: 'pending-confirmation',
        artifactPointers: [artifact],
      },
      state.phases[1],
    ],
    artifactIndex: [artifact],
    transitionHistory: [
      {
        transitionId: 'submit-requirements-ready',
        requestId: 'submit-requirements-ready',
        fromPhaseId: 'requirements-clarification',
        toPhaseId: 'technical-design',
        authority: 'completion-check',
        action: 'confirmation-requested',
        result: 'accepted',
        completionCheckId: 'submit-requirements-ready',
        artifactRefs: [artifact],
        createdAt: '2026-05-20T00:01:00.000Z',
        stateVersion: 3,
      },
    ],
    pendingConfirmation: {
      confirmationId: 'submit-requirements-ready',
      phaseId: 'requirements-clarification',
      fromPhaseId: 'requirements-clarification',
      toPhaseId: 'technical-design',
      completionCheckId: 'submit-requirements-ready',
      artifactRefs: [artifact],
      createdAt: '2026-05-20T00:01:00.000Z',
      status: 'pending',
      submission: {
        phaseId: 'requirements-clarification',
        stateVersion: 2,
        status: 'ready',
        handoff: {
          summary: 'Requirements are ready.',
          artifacts: [],
          next: 'Confirm or retry.',
        },
        rationale: 'Requirements clarification is done.',
        evidence: [],
      },
    },
  }
}

function makeFinalPendingWorkflowState(sessionId: string): WorkflowSessionState {
  const state = makePendingWorkflowState(sessionId)
  const artifact = {
    kind: 'phase-artifact' as const,
    sessionId,
    artifactId: 'requirements-final-ready-1',
    schemaVersion: 1,
    createdAt: '2026-05-20T00:01:00.000Z',
    updatedAt: '2026-05-20T00:01:00.000Z',
    label: 'Final requirements completion',
    phaseId: 'requirements-clarification',
    title: 'Final requirements completion',
    lifecycleStatus: 'pending' as const,
  }

  return {
    ...state,
    templateSnapshot: {
      ...state.templateSnapshot,
      phases: [state.templateSnapshot.phases[0]],
    },
    phases: [
      {
        ...state.phases[0],
        artifactPointers: [artifact],
      },
    ],
    artifactIndex: [artifact],
    pendingConfirmation: {
      confirmationId: 'submit-final-ready',
      phaseId: 'requirements-clarification',
      fromPhaseId: 'requirements-clarification',
      toPhaseId: null,
      completionCheckId: 'submit-final-ready',
      artifactRefs: [artifact],
      createdAt: '2026-05-20T00:01:00.000Z',
      status: 'pending',
      submission: {
        phaseId: 'requirements-clarification',
        stateVersion: 2,
        status: 'ready',
        handoff: {
          summary: 'Final phase is ready.',
          artifacts: [],
          next: 'Confirm final report.',
        },
        rationale: 'Final workflow phase is done.',
        evidence: [],
      },
    },
  }
}

function bindAskUserQuestionFixture(
  state: WorkflowSessionState,
  requestId: string,
  questionId: string,
) {
  const phaseId = state.activePhaseId
  if (!phaseId || !state.runtimeContract) throw new Error('Workflow fixture must have an active runtime phase.')
  const phaseState = state.runtimeContract.phaseStates[phaseId]
  if (!phaseState) throw new Error('Workflow fixture must have a runtime phase state.')
  const issueId = 'ask:' + requestId + ':0'
  state.runtimeContract.phaseStates[phaseId] = {
    ...phaseState,
    issues: [...phaseState.issues, {
      id: issueId,
      phaseId,
      sessionId: state.sessionId,
      createdAt: state.updatedAt,
      updatedAt: state.updatedAt,
      source: 'ask-user-question',
      status: 'open',
      blocksCompletion: false,
      question: questionId,
      blockingReason: 'Fixture workflow question.',
      questionRequestId: requestId,
      questionId,
      createdStateVersion: state.stateVersion,
    }],
  }
  return {
    sessionId: state.sessionId,
    phaseId,
    stateVersion: state.stateVersion,
    requestId,
    issues: [{ issueId, questionId }],
  }
}

function makeWorkflowPromptState(sessionId: string): WorkflowSessionState {
  const state = makeWorkflowState(sessionId)
  state.templateSnapshot.phases[0] = {
    ...state.templateSnapshot.phases[0],
    instructions: 'Clarify the user-visible requirements before implementation.',
    requestedModel: 'phase-opus',
    skillDeclarations: [
      {
        id: 'requirements-review',
        source: 'template',
        guidance: 'Use requirements-review skill guidance from the workflow template.',
        provenance: {
          templateId: 'requirements-to-implementation',
          templateVersion: '1',
          phaseId: 'requirements-clarification',
        },
      },
    ],
    requiredArtifacts: [
      {
        id: 'requirements-brief',
        kind: 'markdown',
        description: 'Requirements brief with acceptance criteria',
        required: true,
      },
    ],
    completionCriteria: ['Requirements brief is accepted'],
    phasePrompt: {
      objective: 'Freeze requirements before design.',
      handoffInput: ['Use the user message as intake.'],
      executionRules: ['Do not implement during requirements clarification.'],
      outputArtifact: {
        name: 'Requirements Brief',
        sections: ['User Goal', 'Acceptance Criteria'],
      },
      completionRules: ['Submit ready only after the Requirements Brief exists.'],
    },
  }
  return state
}

describe('WebSocket handler session isolation', () => {
  afterEach(() => {
    __resetWebSocketHandlerStateForTests()
    mock.restore()
  })

  it('ignores stale disconnects from an older socket for the same session', () => {
    const sessionId = `duplicate-${crypto.randomUUID()}`
    const first = makeClientSocket(sessionId)
    const second = makeClientSocket(sessionId)
    const clearCallbacks = spyOn(conversationService, 'clearOutputCallbacks')
    const cancelComputerUse = spyOn(computerUseApprovalService, 'cancelSession')

    handleWebSocket.open(first)
    handleWebSocket.open(second)
    clearCallbacks.mockClear()
    cancelComputerUse.mockClear()

    handleWebSocket.close(first, 1000, 'stale tab closed')

    expect(getActiveSessionIds()).toContain(sessionId)
    expect(clearCallbacks).not.toHaveBeenCalled()
    expect(cancelComputerUse).not.toHaveBeenCalled()
  })

  it('records structured client WebSocket lifecycle diagnostics and cleans output callbacks on close', () => {
    const sessionId = `lifecycle-75f257d8-fa64-4cd4-a696-ed6dfe58ea59`
    const ws = makeClientSocket(sessionId)
    const recordEvent = spyOn(diagnosticsService, 'recordEvent').mockResolvedValue()
    const removeOutputCallback = spyOn(conversationService, 'removeOutputCallback').mockImplementation(() => {})
    spyOn(conversationService, 'hasSession').mockReturnValue(true)
    spyOn(conversationService, 'onOutput').mockImplementation(() => {})

    handleWebSocket.open(ws)
    handleWebSocket.close(ws, 1006, 'abnormal closure')

    expect(recordEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'ws_client_open',
      severity: 'info',
      sessionId,
      details: expect.objectContaining({ channel: 'client' }),
    }))
    expect(recordEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'ws_client_close',
      severity: 'warn',
      sessionId,
      details: expect.objectContaining({
        channel: 'client',
        code: 1006,
        reason: 'abnormal closure',
      }),
    }))
    expect(removeOutputCallback).toHaveBeenCalledWith(sessionId, expect.any(Function))
    expect(getActiveSessionIds()).not.toContain(sessionId)
  })

  it('drops a stale client when a session broadcast send returns zero', () => {
    const sessionId = `send-dropped-11f24348-37a3-4647-aa89-bd050edae407`
    const ws = makeClientSocket(sessionId)
    const recordEvent = spyOn(diagnosticsService, 'recordEvent').mockResolvedValue()

    handleWebSocket.open(ws)
    recordEvent.mockClear()
    ws.setSendResult(0)

    expect(sendToSession(sessionId, {
      type: 'system_notification',
      subtype: 'test_broadcast',
      data: { ok: true },
    })).toBe(false)

    expect(getActiveSessionIds()).not.toContain(sessionId)
    expect(ws.close).toHaveBeenCalledWith(1011, 'WebSocket send failed')
    expect(recordEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'ws_client_send_failed',
      severity: 'warn',
      sessionId,
      details: expect.objectContaining({
        channel: 'client',
        reason: 'send_dropped',
        sendResult: 0,
      }),
    }))
  })

  it('keeps a backpressured client active when a session broadcast send returns minus one', () => {
    const sessionId = `send-backpressure-7495941a-4193-4b43-8dab-8f8cc4d1afbd`
    const ws = makeClientSocket(sessionId)

    handleWebSocket.open(ws)
    ws.setSendResult(-1)

    expect(sendToSession(sessionId, {
      type: 'system_notification',
      subtype: 'test_broadcast',
      data: { ok: true },
    })).toBe(true)

    expect(getActiveSessionIds()).toContain(sessionId)
    expect(ws.close).not.toHaveBeenCalled()
  })

  it('removes only dropped clients while preserving delivery to healthy clients', () => {
    const sessionId = `send-multi-3cc11bfd-7d59-4a6e-a50f-f3880ca1b395`
    const dropped = makeClientSocket(sessionId)
    const healthy = makeClientSocket(sessionId)

    handleWebSocket.open(dropped)
    handleWebSocket.open(healthy)
    dropped.setSendResult(0)

    expect(sendToSession(sessionId, {
      type: 'system_notification',
      subtype: 'test_broadcast',
      data: { ok: true },
    })).toBe(true)

    expect(dropped.close).toHaveBeenCalledWith(1011, 'WebSocket send failed')
    expect(healthy.close).not.toHaveBeenCalled()
    expect(parseSentMessages(healthy)).toContainEqual(expect.objectContaining({
      type: 'system_notification',
      subtype: 'test_broadcast',
    }))
  })

  it('drops a stale client when a session broadcast send throws', () => {
    const sessionId = `send-threw-568f2b9c-cd20-4594-9a35-265e1c2089d8`
    const ws = makeClientSocket(sessionId)
    const recordEvent = spyOn(diagnosticsService, 'recordEvent').mockResolvedValue()

    handleWebSocket.open(ws)
    recordEvent.mockClear()
    ws.setSendError(new Error('broken pipe'))

    expect(sendToSession(sessionId, {
      type: 'system_notification',
      subtype: 'test_broadcast',
      data: { ok: true },
    })).toBe(false)

    expect(getActiveSessionIds()).not.toContain(sessionId)
    expect(ws.close).toHaveBeenCalledWith(1011, 'WebSocket send failed')
    expect(recordEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'ws_client_send_failed',
      severity: 'warn',
      sessionId,
      details: expect.objectContaining({
        channel: 'client',
        reason: 'broken pipe',
      }),
    }))
  })

  it('closes and removes an active client socket when a session is deleted', () => {
    const sessionId = `delete-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const clearCallbacks = spyOn(conversationService, 'clearOutputCallbacks')
    const cancelComputerUse = spyOn(computerUseApprovalService, 'cancelSession')

    handleWebSocket.open(ws)

    expect(closeSessionConnection(sessionId, 'session deleted')).toBe(true)

    expect(getActiveSessionIds()).not.toContain(sessionId)
    expect(ws.close).toHaveBeenCalledWith(1000, 'session deleted')
    expect(clearCallbacks).toHaveBeenCalledWith(sessionId)
    expect(cancelComputerUse).toHaveBeenCalledWith(sessionId)
  })

  it('broadcasts session messages to all connected clients for the same session', () => {
    const sessionId = `broadcast-${crypto.randomUUID()}`
    const first = makeClientSocket(sessionId)
    const second = makeClientSocket(sessionId)

    handleWebSocket.open(first)
    handleWebSocket.open(second)

    expect(sendToSession(sessionId, {
      type: 'system_notification',
      subtype: 'test_broadcast',
      data: { ok: true },
    })).toBe(true)

    expect(parseSentMessages(first)).toContainEqual(expect.objectContaining({
      type: 'system_notification',
      subtype: 'test_broadcast',
      data: { ok: true },
    }))
    expect(parseSentMessages(second)).toContainEqual(expect.objectContaining({
      type: 'system_notification',
      subtype: 'test_broadcast',
      data: { ok: true },
    }))
  })

  it('translates streaming SDK messages once before broadcasting to multiple clients', () => {
    const sessionId = `stream-broadcast-${crypto.randomUUID()}`
    const first = makeClientSocket(sessionId)
    const second = makeClientSocket(sessionId)
    const session = {
      proc: { kill() {}, exited: Promise.resolve(0) },
      outputCallbacks: [] as Array<(msg: any) => void>,
      workDir: process.cwd(),
      permissionMode: 'default',
      sdkToken: 'sdk-token',
      sdkSocket: null,
      pendingOutbound: [],
      startupPending: false,
      startupExitCode: null,
      stdoutLines: [],
      stderrLines: [],
      outputDrain: Promise.resolve(),
      sdkMessages: [],
      initMessage: null,
      pendingPermissionRequests: new Map(),
    }
    ;(conversationService as any).sessions.set(sessionId, session)

    try {
      handleWebSocket.open(first)
      handleWebSocket.open(second)

      expect(session.outputCallbacks).toHaveLength(1)
      const callback = session.outputCallbacks[0]!
      callback({
        type: 'stream_event',
        event: {
          type: 'content_block_start',
          index: 0,
          content_block: {
            type: 'tool_use',
            id: 'tool-1',
            name: 'Read',
          },
        },
      })
      callback({
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 0,
          delta: {
            type: 'input_json_delta',
            partial_json: '{"path":"README.md"}',
          },
        },
      })
      callback({
        type: 'stream_event',
        event: {
          type: 'content_block_stop',
          index: 0,
        },
      })

      const expectedToolComplete = expect.objectContaining({
        type: 'tool_use_complete',
        toolName: 'Read',
        toolUseId: 'tool-1',
        input: { path: 'README.md' },
      })
      expect(parseSentMessages(first)).toContainEqual(expectedToolComplete)
      expect(parseSentMessages(second)).toContainEqual(expectedToolComplete)
    } finally {
      conversationService.stopSession(sessionId)
    }
  })

  it('retries an active workflow turn that asks for a user decision in prose instead of ending at the free-form composer', async () => {
    const sessionId = `workflow-prose-question-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    const session = {
      proc: { kill() {}, exited: Promise.resolve(0) },
      outputCallbacks: [] as Array<(msg: any) => void>,
      workDir: process.cwd(),
      permissionMode: 'default',
      sdkToken: 'sdk-token',
      sdkSocket: null,
      pendingOutbound: [],
      startupPending: false,
      startupExitCode: null,
      stdoutLines: [],
      stderrLines: [],
      outputDrain: Promise.resolve(),
      sdkMessages: [],
      initMessage: null,
      pendingPermissionRequests: new Map(),
    }
    ;(conversationService as any).sessions.set(sessionId, session)
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
    const state = makeWorkflowState(sessionId)
    state.workflowLanguage = 'zh'
    await stateService.writeState(sessionId, state)

    try {
      handleWebSocket.open(ws)
      const callback = session.outputCallbacks[0]!
      callback({
        type: 'assistant',
        message: {
          content: [{
            type: 'text',
            text: '我已经说明了本地启动方式。要我重新提交当前阶段，还是你先测试后再回来？',
          }],
        },
      })
      callback({
        type: 'result',
        is_error: false,
        usage: { input_tokens: 1, output_tokens: 1 },
      })

      await waitForCondition(() => sendMessage.mock.calls.some(([calledSessionId, content]) =>
        calledSessionId === sessionId
        && typeof content === 'string'
        && content.includes('AskUserQuestion'),
      ))

      expect(parseSentMessages(ws)).not.toContainEqual(expect.objectContaining({
        type: 'message_complete',
      }))
      expect(sendMessage).toHaveBeenCalledWith(
        sessionId,
        expect.stringContaining('AskUserQuestion'),
      )
    } finally {
      conversationService.stopSession(sessionId)
    }
  })

  it('forces the strict UIUX Expert to issue design_direction through AskUserQuestion after prose directions', async () => {
    const sessionId = `strict-uiux-direction-card-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const session = {
      proc: { kill() {}, exited: Promise.resolve(0) },
      outputCallbacks: [] as Array<(msg: any) => void>,
      workDir: process.cwd(),
      permissionMode: 'default',
      sdkToken: 'sdk-token',
      sdkSocket: null,
      pendingOutbound: [],
      startupPending: false,
      startupExitCode: null,
      stdoutLines: [],
      stderrLines: [],
      outputDrain: Promise.resolve(),
      sdkMessages: [],
      initMessage: null,
      pendingPermissionRequests: new Map(),
    }
    ;(conversationService as any).sessions.set(sessionId, session)
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
    const strictVisualExpert: any = makeExpertRuntimeMetadata('active')
    strictVisualExpert.expertId = 'uiux-design-system-expert'
    strictVisualExpert.runtimeBinding.expertId = 'uiux-design-system-expert'
    strictVisualExpert.runtimeBinding.runtimePolicy = {
      mode: 'strict-visual-workflow',
      allowedToolNames: ['AskUserQuestion'],
      requiredSkillIds: [],
    }
    spyOn(sessionService, 'getSession').mockResolvedValue({
      id: sessionId,
      workDir: process.cwd(),
      expert: strictVisualExpert,
    } as Awaited<ReturnType<typeof sessionService.getSession>>)

    try {
      handleWebSocket.open(ws)
      const callback = session.outputCallbacks[0]!
      callback({
        type: 'assistant',
        message: {
          content: [{
            type: 'text',
            text: '方向一：保留原有布局。\n方向二：强化套餐比较。\n方向三：先展示会员权益。',
          }],
        },
      })
      callback({ type: 'result', is_error: false, usage: { input_tokens: 1, output_tokens: 1 } })

      await waitForCondition(() => sendMessage.mock.calls.some(([calledSessionId, content]) =>
        calledSessionId === sessionId
        && typeof content === 'string'
        && content.includes('<strict-visual-ask-user-question-recovery>')
      ))

      expect(sendMessage).toHaveBeenCalledWith(
        sessionId,
        expect.stringContaining('id is design_direction'),
      )
      expect(parseSentMessages(ws)).not.toContainEqual(expect.objectContaining({ type: 'message_complete' }))
      expect(parseSentMessages(ws)).toContainEqual(expect.objectContaining({
        type: 'status',
        state: 'thinking',
        verb: 'Generating required design-direction choices',
      }))
    } finally {
      conversationService.stopSession(sessionId)
    }
  })

  it('allows the first strict UIUX capability introduction to end without AskUserQuestion', async () => {
    const sessionId = `strict-uiux-welcome-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const session = {
      proc: { kill() {}, exited: Promise.resolve(0) },
      outputCallbacks: [] as Array<(msg: any) => void>,
      workDir: process.cwd(),
      permissionMode: 'default',
      sdkToken: 'sdk-token',
      sdkSocket: null,
      pendingOutbound: [],
      startupPending: false,
      startupExitCode: null,
      stdoutLines: [],
      stderrLines: [],
      outputDrain: Promise.resolve(),
      sdkMessages: [],
      initMessage: null,
      pendingPermissionRequests: new Map(),
    }
    ;(conversationService as any).sessions.set(sessionId, session)
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
    const strictVisualExpert: any = makeExpertRuntimeMetadata('active')
    strictVisualExpert.expertId = 'uiux-design-system-expert'
    strictVisualExpert.runtimeBinding.expertId = 'uiux-design-system-expert'
    strictVisualExpert.runtimeBinding.runtimePolicy = {
      mode: 'strict-visual-workflow',
      allowedToolNames: ['AskUserQuestion'],
      requiredSkillIds: [],
    }
    spyOn(sessionService, 'getCustomTitle').mockResolvedValue(null)
    spyOn(sessionService, 'getSession').mockResolvedValue({
      id: sessionId,
      workDir: process.cwd(),
      expert: strictVisualExpert,
    } as Awaited<ReturnType<typeof sessionService.getSession>>)

    try {
      handleWebSocket.open(ws)
      handleWebSocket.message(ws, JSON.stringify({
        type: 'user_message',
        content: '\u4ecb\u7ecd\u4e00\u4e0b\u300cUIUX\u8bbe\u8ba1\u7cfb\u7edf\u4e13\u5bb6\u300d\uff0c\u4f60\u53ef\u4ee5\u5e2e\u6211\u505a\u4ec0\u4e48\uff1f',
      }))
      await waitForCondition(() => sendMessage.mock.calls.some(([calledSessionId, content]) =>
        calledSessionId === sessionId
        && typeof content === 'string'
        && content.includes('UIUX'),
      ))

      const callback = session.outputCallbacks[0]!
      callback({
        type: 'assistant',
        message: { content: [{
          type: 'text',
          text: '\u6211\u53ef\u4ee5\u5e2e\u4f60\u505a\u622a\u56fe\u91cd\u6784\u3001\u8bbe\u8ba1\u7cfb\u7edf\u3001UX \u8bca\u65ad\u4e0e\u89c6\u89c9 QA\u3002\u4f60\u60f3\u4ece\u54ea\u4e2a\u5f00\u59cb\uff1f',
        }] },
      })
      callback({ type: 'result', is_error: false, usage: { input_tokens: 1, output_tokens: 1 } })

      await waitForCondition(() => parseSentMessages(ws).some((message) => message.type === 'message_complete'))

      expect(sendMessage.mock.calls.some(([, content]) =>
        typeof content === 'string' && content.includes('<strict-visual-ask-user-question-recovery>'),
      )).toBe(false)

      handleWebSocket.message(ws, JSON.stringify({
        type: 'user_message',
        content: '\u8bf7\u91cd\u6784\u8fd9\u4e2a\u652f\u4ed8\u9875\u9762\u3002',
      }))
      await waitForCondition(() => sendMessage.mock.calls.filter(([calledSessionId]) => calledSessionId === sessionId).length >= 2)

      const secondTurnCallback = session.outputCallbacks[0]!
      secondTurnCallback({
        type: 'assistant',
        message: { content: [{
          type: 'text',
          text: '\u4f60\u662f\u5426\u5e0c\u671b\u6211\u4f7f\u7528\u5916\u90e8\u53c2\u8003\u7f51\u7ad9\uff1f',
        }] },
      })
      secondTurnCallback({ type: 'result', is_error: false, usage: { input_tokens: 1, output_tokens: 1 } })

      await waitForCondition(() => sendMessage.mock.calls.some(([, content]) =>
        typeof content === 'string' && content.includes('<strict-visual-ask-user-question-recovery>'),
      ))

      expect(sendMessage.mock.calls.some(([, content]) =>
        typeof content === 'string' && content.includes('<strict-visual-ask-user-question-recovery>'),
      )).toBe(true)
      expect(parseSentMessages(ws)).toContainEqual(expect.objectContaining({ type: 'message_complete' }))
      expect(parseSentMessages(ws)).not.toContainEqual(expect.objectContaining({
        type: 'error',
        code: 'STRICT_VISUAL_ASK_USER_QUESTION_REQUIRED',
      }))
    } finally {
      conversationService.stopSession(sessionId)
    }
  })

  it('does not force AskUserQuestion for strict UIUX screenshot and reference intake', async () => {
    const sessionId = `strict-uiux-basic-open-intake-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const session = {
      proc: { kill() {}, exited: Promise.resolve(0) },
      outputCallbacks: [] as Array<(msg: any) => void>,
      workDir: process.cwd(),
      permissionMode: 'default',
      sdkToken: 'sdk-token',
      sdkSocket: null,
      pendingOutbound: [],
      startupPending: false,
      startupExitCode: null,
      stdoutLines: [],
      stderrLines: [],
      outputDrain: Promise.resolve(),
      sdkMessages: [],
      initMessage: null,
      pendingPermissionRequests: new Map(),
    }
    ;(conversationService as any).sessions.set(sessionId, session)
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
    const strictVisualExpert: any = makeExpertRuntimeMetadata('active')
    strictVisualExpert.expertId = 'uiux-design-system-expert'
    strictVisualExpert.runtimeBinding.expertId = 'uiux-design-system-expert'
    strictVisualExpert.runtimeBinding.runtimePolicy = {
      mode: 'strict-visual-workflow',
      allowedToolNames: ['AskUserQuestion'],
      requiredSkillIds: [],
    }
    spyOn(sessionService, 'getSession').mockResolvedValue({
      id: sessionId,
      workDir: process.cwd(),
      expert: strictVisualExpert,
    } as Awaited<ReturnType<typeof sessionService.getSession>>)

    try {
      handleWebSocket.open(ws)
      const callback = session.outputCallbacks[0]!
      callback({
        type: 'assistant',
        message: {
          content: [{
            type: 'text',
            text: '\u8bf7\u4e0a\u4f20\u622a\u56fe\uff0c\u8bf4\u660e\u60f3\u6539\u5584\u7684\u76ee\u6807\uff1b\u5982\u679c\u6709\u53c2\u8003\u7f51\u7ad9\uff0c\u4e5f\u53ef\u4ee5\u76f4\u63a5\u7c98\u8d34\u94fe\u63a5\u3002',
          }],
        },
      })
      callback({ type: 'result', is_error: false, usage: { input_tokens: 1, output_tokens: 1 } })

      await waitForCondition(() => parseSentMessages(ws).some((message) => message.type === 'message_complete'))

      expect(sendMessage).not.toHaveBeenCalled()
      expect(parseSentMessages(ws)).toContainEqual(expect.objectContaining({ type: 'message_complete' }))
      expect(parseSentMessages(ws)).not.toContainEqual(expect.objectContaining({
        type: 'error',
        code: 'STRICT_VISUAL_ASK_USER_QUESTION_REQUIRED',
      }))
    } finally {
      conversationService.stopSession(sessionId)
    }
  })

  it('does not force AskUserQuestion for strict UIUX narrative wording about external references', async () => {
    const sessionId = `strict-uiux-open-intake-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const session = {
      proc: { kill() {}, exited: Promise.resolve(0) },
      outputCallbacks: [] as Array<(msg: any) => void>,
      workDir: process.cwd(),
      permissionMode: 'default',
      sdkToken: 'sdk-token',
      sdkSocket: null,
      pendingOutbound: [],
      startupPending: false,
      startupExitCode: null,
      stdoutLines: [],
      stderrLines: [],
      outputDrain: Promise.resolve(),
      sdkMessages: [],
      initMessage: null,
      pendingPermissionRequests: new Map(),
    }
    ;(conversationService as any).sessions.set(sessionId, session)
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
    const strictVisualExpert: any = makeExpertRuntimeMetadata('active')
    strictVisualExpert.expertId = 'uiux-design-system-expert'
    strictVisualExpert.runtimeBinding.expertId = 'uiux-design-system-expert'
    strictVisualExpert.runtimeBinding.runtimePolicy = {
      mode: 'strict-visual-workflow',
      allowedToolNames: ['AskUserQuestion'],
      requiredSkillIds: [],
    }
    spyOn(sessionService, 'getSession').mockResolvedValue({
      id: sessionId,
      workDir: process.cwd(),
      expert: strictVisualExpert,
    } as Awaited<ReturnType<typeof sessionService.getSession>>)

    try {
      handleWebSocket.open(ws)
      const callback = session.outputCallbacks[0]!
      callback({
        type: 'assistant',
        message: {
          content: [{
            type: 'text',
            text: '\u8bf7\u76f4\u63a5\u4e0a\u4f20\u9875\u9762\u622a\u56fe\uff0c\u5e76\u8865\u5145\u4f60\u5e0c\u671b\u6539\u5584\u7684\u76ee\u6807\u3002\u6536\u5230\u540e\u6211\u4f1a\u5148\u5217\u51fa\u53ef\u89c2\u5bdf\u4e8b\u5b9e\u3001\u672a\u77e5\u9879\u4e0e\u8bbe\u8ba1\u5047\u8bbe\uff0c\u518d\u786e\u8ba4\u662f\u5426\u9700\u8981\u53c2\u8003\u5916\u90e8\u7f51\u7ad9\u3002',
          }],
        },
      })
      callback({ type: 'result', is_error: false, usage: { input_tokens: 1, output_tokens: 1 } })

      await waitForCondition(() => parseSentMessages(ws).some((message) => message.type === 'message_complete'))

      expect(sendMessage).not.toHaveBeenCalled()
      expect(parseSentMessages(ws)).toContainEqual(expect.objectContaining({ type: 'message_complete' }))
      expect(parseSentMessages(ws)).not.toContainEqual(expect.objectContaining({
        type: 'error',
        code: 'STRICT_VISUAL_ASK_USER_QUESTION_REQUIRED',
      }))
    } finally {
      conversationService.stopSession(sessionId)
    }
  })

  it('requires a strict UIUX HTML turn to run local visual QA before completion', async () => {
    const sessionId = `strict-uiux-render-qa-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const session = {
      proc: { kill() {}, exited: Promise.resolve(0) },
      outputCallbacks: [] as Array<(msg: any) => void>,
      workDir: process.cwd(),
      permissionMode: 'default',
      sdkToken: 'sdk-token',
      sdkSocket: null,
      pendingOutbound: [],
      startupPending: false,
      startupExitCode: null,
      stdoutLines: [],
      stderrLines: [],
      outputDrain: Promise.resolve(),
      sdkMessages: [],
      initMessage: null,
      pendingPermissionRequests: new Map(),
    }
    ;(conversationService as any).sessions.set(sessionId, session)
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
    const strictVisualExpert: any = makeExpertRuntimeMetadata('active')
    strictVisualExpert.expertId = 'uiux-design-system-expert'
    strictVisualExpert.runtimeBinding.expertId = 'uiux-design-system-expert'
    strictVisualExpert.runtimeBinding.runtimePolicy = {
      mode: 'strict-visual-workflow',
      allowedToolNames: ['AskUserQuestion', 'Write', 'Bash'],
      requiredSkillIds: ['playwright-visual-qc'],
    }
    spyOn(sessionService, 'getSession').mockResolvedValue({
      id: sessionId,
      workDir: process.cwd(),
      expert: strictVisualExpert,
    } as Awaited<ReturnType<typeof sessionService.getSession>>)

    try {
      handleWebSocket.open(ws)
      const callback = session.outputCallbacks[0]!
      callback({
        type: 'assistant',
        message: { content: [{
          type: 'tool_use',
          id: 'write-html',
          name: 'Write',
          input: { file_path: 'C:/tmp/payment-redesign.html', content: '<main>prototype</main>' },
        }] },
      })
      callback({ type: 'result', is_error: false, usage: { input_tokens: 1, output_tokens: 1 } })

      await waitForCondition(() => sendMessage.mock.calls.some(([calledSessionId, content]) =>
        calledSessionId === sessionId
        && typeof content === 'string'
        && content.includes('<strict-visual-render-qa-recovery>')
      ))

      expect(sendMessage).toHaveBeenCalledWith(
        sessionId,
        expect.stringContaining('CC_JIANGXIA_VISUAL_QA_BROWSER_EXECUTABLE'),
      )
      expect(parseSentMessages(ws)).not.toContainEqual(expect.objectContaining({ type: 'message_complete' }))
      expect(parseSentMessages(ws)).toContainEqual(expect.objectContaining({
        type: 'status',
        state: 'thinking',
        verb: 'Running required local visual QA',
      }))
    } finally {
      conversationService.stopSession(sessionId)
    }
  })

  it('requires Playwright when a strict UIUX user directly supplies a public reference URL', async () => {
    const sessionId = `strict-uiux-direct-public-reference-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const session = {
      proc: { kill() {}, exited: Promise.resolve(0) },
      outputCallbacks: [] as Array<(msg: any) => void>,
      workDir: process.cwd(),
      permissionMode: 'default',
      sdkToken: 'sdk-token',
      sdkSocket: null,
      pendingOutbound: [],
      startupPending: false,
      startupExitCode: null,
      stdoutLines: [],
      stderrLines: [],
      outputDrain: Promise.resolve(),
      sdkMessages: [],
      initMessage: null,
      pendingPermissionRequests: new Map(),
    }
    ;(conversationService as any).sessions.set(sessionId, session)
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
    const strictVisualExpert: any = makeExpertRuntimeMetadata('active')
    strictVisualExpert.expertId = 'uiux-design-system-expert'
    strictVisualExpert.runtimeBinding.expertId = 'uiux-design-system-expert'
    strictVisualExpert.runtimeBinding.runtimePolicy = {
      mode: 'strict-visual-workflow',
      allowedToolNames: ['Playwright', 'Read'],
      requiredSkillIds: ['visual-reference-lock'],
    }
    spyOn(sessionService, 'getCustomTitle').mockResolvedValue(null)
    spyOn(sessionService, 'getSession').mockResolvedValue({
      id: sessionId,
      workDir: process.cwd(),
      expert: strictVisualExpert,
    } as Awaited<ReturnType<typeof sessionService.getSession>>)

    try {
      handleWebSocket.open(ws)
      handleWebSocket.message(ws, JSON.stringify({
        type: 'user_message',
        content: 'Use https://www.zcool.com.cn/ and https://www.raycast.com/pricing as the only public visual references. Do not use a third site; then redesign my payment page.',
      }))
      await waitForCondition(() => session.outputCallbacks.length === 1)

      const callback = session.outputCallbacks[0]!
      callback({ type: 'assistant', message: { content: [{ type: 'text', text: 'I have finished the redesign.' }] } })
      callback({ type: 'result', is_error: false, usage: { input_tokens: 1, output_tokens: 1 } })

      await waitForCondition(() => sendMessage.mock.calls.some(([calledSessionId, content]) =>
        calledSessionId === sessionId
        && typeof content === 'string'
        && content.includes('<strict-visual-reference-research-recovery>')
      ))
      expect(sendMessage).toHaveBeenCalledWith(
        sessionId,
        expect.stringContaining('do not WebSearch or substitute another URL'),
      )
      expect(parseSentMessages(ws)).not.toContainEqual(expect.objectContaining({ type: 'message_complete' }))
    } finally {
      conversationService.stopSession(sessionId)
    }
  })
  it('requires two Playwright screenshots to be read after public visual research is selected', async () => {
    const sessionId = `strict-uiux-visual-reference-research-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const session = {
      proc: { kill() {}, exited: Promise.resolve(0) },
      outputCallbacks: [] as Array<(msg: any) => void>,
      workDir: process.cwd(),
      permissionMode: 'default',
      sdkToken: 'sdk-token',
      sdkSocket: null,
      pendingOutbound: [],
      startupPending: false,
      startupExitCode: null,
      stdoutLines: [],
      stderrLines: [],
      outputDrain: Promise.resolve(),
      sdkMessages: [],
      initMessage: null,
      pendingPermissionRequests: new Map(),
    }
    ;(conversationService as any).sessions.set(sessionId, session)
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
    const strictVisualExpert: any = makeExpertRuntimeMetadata('active')
    strictVisualExpert.expertId = 'uiux-design-system-expert'
    strictVisualExpert.runtimeBinding.expertId = 'uiux-design-system-expert'
    strictVisualExpert.runtimeBinding.runtimePolicy = {
      mode: 'strict-visual-workflow',
      allowedToolNames: ['AskUserQuestion', 'Read', 'Playwright'],
      requiredSkillIds: ['visual-reference-lock'],
    }
    spyOn(sessionService, 'getSession').mockResolvedValue({
      id: sessionId,
      workDir: process.cwd(),
      expert: strictVisualExpert,
    } as Awaited<ReturnType<typeof sessionService.getSession>>)

    try {
      handleWebSocket.open(ws)
      const callback = session.outputCallbacks[0]!
      callback({ type: 'assistant', message: { content: [{
        type: 'tool_use',
        id: 'inspiration-choice',
        name: 'AskUserQuestion',
        input: { questions: [{ id: 'inspiration_sources', prompt: '参考来源？', options: [] }] },
      }] } })
      callback({ type: 'user', message: { content: [{
        type: 'tool_result',
        tool_use_id: 'inspiration-choice',
        is_error: false,
        content: `User has answered your questions: "inspiration_sources"="允许扩展公开网页研究". You can now continue with the user's answers in mind.`,
      }] } })
      callback({ type: 'assistant', message: { content: [{
        type: 'tool_use',
        id: 'text-only-reference',
        name: 'Playwright',
        input: { actions: [{ type: 'navigate', url: 'https://example.com/pricing' }, { type: 'extract' }], include_screenshot: false },
      }] } })
      callback({ type: 'user', message: { content: [{
        type: 'tool_result',
        tool_use_id: 'text-only-reference',
        is_error: false,
        content: 'Attempts:\n1. success: https://example.com/pricing\nLocal screenshot path: C:/tmp/not-counted.png',
      }] } })
      callback({ type: 'assistant', message: { content: [{ type: 'text', text: '已查看公开参考。' }] } })
      callback({ type: 'result', is_error: false, usage: { input_tokens: 1, output_tokens: 1 } })

      await waitForCondition(() => sendMessage.mock.calls.some(([calledSessionId, content]) =>
        calledSessionId === sessionId
        && typeof content === 'string'
        && content.includes('<strict-visual-reference-research-recovery>')
      ))
      expect(sendMessage).toHaveBeenCalledWith(
        sessionId,
        expect.stringContaining('include_screenshot: true'),
      )
      expect(parseSentMessages(ws)).not.toContainEqual(expect.objectContaining({ type: 'message_complete' }))
      expect(parseSentMessages(ws)).toContainEqual(expect.objectContaining({
        type: 'status',
        state: 'thinking',
        verb: 'Reading locked visual reference websites',
      }))
    } finally {
      conversationService.stopSession(sessionId)
    }
  })

  it('accepts two successful safely resized website screenshots without requiring a prose receipt', async () => {
    const sessionId = `strict-uiux-visual-reference-success-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const session = {
      proc: { kill() {}, exited: Promise.resolve(0) },
      outputCallbacks: [] as Array<(msg: any) => void>,
      workDir: process.cwd(),
      permissionMode: 'default',
      sdkToken: 'sdk-token',
      sdkSocket: null,
      pendingOutbound: [],
      startupPending: false,
      startupExitCode: null,
      stdoutLines: [],
      stderrLines: [],
      outputDrain: Promise.resolve(),
      sdkMessages: [],
      initMessage: null,
      pendingPermissionRequests: new Map(),
    }
    ;(conversationService as any).sessions.set(sessionId, session)
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
    const strictVisualExpert: any = makeExpertRuntimeMetadata('active')
    strictVisualExpert.expertId = 'uiux-design-system-expert'
    strictVisualExpert.runtimeBinding.expertId = 'uiux-design-system-expert'
    strictVisualExpert.runtimeBinding.runtimePolicy = {
      mode: 'strict-visual-workflow',
      allowedToolNames: ['AskUserQuestion', 'Read', 'Playwright'],
      requiredSkillIds: ['visual-reference-lock'],
    }
    spyOn(sessionService, 'getSession').mockResolvedValue({
      id: sessionId,
      workDir: process.cwd(),
      expert: strictVisualExpert,
    } as Awaited<ReturnType<typeof sessionService.getSession>>)

    try {
      handleWebSocket.open(ws)
      const callback = session.outputCallbacks[0]!
      callback({ type: 'assistant', message: { content: [{
        type: 'tool_use',
        id: 'inspiration-choice-success',
        name: 'AskUserQuestion',
        input: { questions: [{ id: 'inspiration_sources', prompt: '参考来源？', options: [] }] },
      }] } })
      callback({ type: 'user', message: { content: [{
        type: 'tool_result',
        tool_use_id: 'inspiration-choice-success',
        is_error: false,
        content: `User has answered your questions: "inspiration_sources"="使用内置公开参考来源". You can now continue with the user's answers in mind.`,
      }] } })
      for (const [index, source] of ['https://example.com/pricing', 'https://example.org/editorial'].entries()) {
        const screenshotPath = `C:/tmp/reference-${index}.png`
        callback({ type: 'assistant', message: { content: [{
          type: 'tool_use',
          id: `research-${index}`,
          name: 'Playwright',
          input: { actions: [{ type: 'navigate', url: source }, { type: 'extract' }, { type: 'screenshot' }], include_screenshot: true },
        }] } })
        callback({ type: 'user', message: { content: [{
          type: 'tool_result',
          tool_use_id: `research-${index}`,
          is_error: false,
          content: `Attempts:\n1. success: ${source}\nLocal screenshot path: ${screenshotPath}`,
        }] } })
        callback({ type: 'assistant', message: { content: [{
          type: 'tool_use',
          id: `read-reference-${index}`,
          name: 'Read',
          input: { file_path: screenshotPath.replace('.png', '-scaled.jpg') },
        }] } })
        callback({ type: 'user', message: { content: [{
          type: 'tool_result',
          tool_use_id: `read-reference-${index}`,
          is_error: false,
          content: [{ type: 'image', source: { type: 'base64', data: 'AA==' } }],
        }] } })
      }
      callback({ type: 'result', is_error: false, usage: { input_tokens: 1, output_tokens: 1 } })

      await waitForCondition(() => parseSentMessages(ws).some((message) => message.type === 'message_complete'))
      expect(sendMessage).not.toHaveBeenCalled()
    } finally {
      conversationService.stopSession(sessionId)
    }
  })

  it('rejects an unsupported lifestyle price analogy after completed render and image review', async () => {
    const sessionId = `strict-uiux-price-analogy-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const session = {
      proc: { kill() {}, exited: Promise.resolve(0) },
      outputCallbacks: [] as Array<(msg: any) => void>,
      workDir: process.cwd(),
      permissionMode: 'default',
      sdkToken: 'sdk-token',
      sdkSocket: null,
      pendingOutbound: [],
      startupPending: false,
      startupExitCode: null,
      stdoutLines: [],
      stderrLines: [],
      outputDrain: Promise.resolve(),
      sdkMessages: [],
      initMessage: null,
      pendingPermissionRequests: new Map(),
    }
    ;(conversationService as any).sessions.set(sessionId, session)
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
    const strictVisualExpert: any = makeExpertRuntimeMetadata('active')
    strictVisualExpert.expertId = 'uiux-design-system-expert'
    strictVisualExpert.runtimeBinding.expertId = 'uiux-design-system-expert'
    strictVisualExpert.runtimeBinding.runtimePolicy = {
      mode: 'strict-visual-workflow',
      allowedToolNames: ['Read', 'Write', 'Bash'],
      requiredSkillIds: ['taste-redesign', 'ui-craft-critique', 'ui-craft-finalize', 'playwright-visual-qc'],
    }
    spyOn(sessionService, 'getSession').mockResolvedValue({
      id: sessionId,
      workDir: process.cwd(),
      expert: strictVisualExpert,
    } as Awaited<ReturnType<typeof sessionService.getSession>>)

    try {
      handleWebSocket.open(ws)
      const callback = session.outputCallbacks[0]!
      for (const revision of ['first', 'revised']) {
        callback({ type: 'assistant', message: { content: [{
          type: 'tool_use',
          id: `write-${revision}`,
          name: 'Write',
          input: { file_path: 'C:/tmp/payment-redesign.html', content: `<main>一年 ¥78 ≈ 1份水煮鱼 ${revision}</main>` },
        }] } })
        callback({ type: 'assistant', message: { content: [{
          type: 'tool_use',
          id: `render-${revision}`,
          name: 'Bash',
          input: { command: `& $env:CC_JIANGXIA_VISUAL_QA_BROWSER_EXECUTABLE --headless --screenshot=C:/tmp/${revision}.png file:///C:/tmp/payment-redesign.html` },
        }] } })
        callback({ type: 'user', message: { content: [{
          type: 'tool_result',
          tool_use_id: `render-${revision}`,
          is_error: false,
          content: `Screenshot written: C:/tmp/${revision}.png`,
        }] } })
        callback({ type: 'assistant', message: { content: [{
          type: 'tool_use',
          id: `read-${revision}`,
          name: 'Read',
          input: { file_path: `C:/tmp/${revision}.png` },
        }] } })
        callback({ type: 'user', message: { content: [{
          type: 'tool_result',
          tool_use_id: `read-${revision}`,
          is_error: false,
          content: [{ type: 'image', source: { type: 'base64', data: 'AA==' } }],
        }] } })
      }
      callback({ type: 'assistant', message: { content: [{
        type: 'text',
        text: '<visual-review-receipt>taste-redesign; ui-craft-critique; ui-craft-finalize. 1440 desktop, 1024 tablet, 390 mobile reviewed.</visual-review-receipt>',
      }] } })
      callback({ type: 'result', is_error: false, usage: { input_tokens: 1, output_tokens: 1 } })

      await waitForCondition(() => sendMessage.mock.calls.some(([, content]) =>
        typeof content === 'string' && content.includes('<strict-visual-review-recovery>'),
      ))
      const recovery = sendMessage.mock.calls.find(([, content]) =>
        typeof content === 'string' && content.includes('<strict-visual-review-recovery>'),
      )?.[1] as string
      expect(recovery).toContain('unsupported lifestyle price analogy')
      expect(recovery).toContain('use Write to replace the complete HTML source')
      expect(parseSentMessages(ws)).not.toContainEqual(expect.objectContaining({ type: 'message_complete' }))
    } finally {
      conversationService.stopSession(sessionId)
    }
  })

  it('recovers a final PNG delivery claim even when streamed HTML-write evidence was lost', async () => {
    const sessionId = `strict-uiux-final-delivery-receipt-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const session = {
      proc: { kill() {}, exited: Promise.resolve(0) },
      outputCallbacks: [] as Array<(msg: any) => void>,
      workDir: process.cwd(),
      permissionMode: 'default',
      sdkToken: 'sdk-token',
      sdkSocket: null,
      pendingOutbound: [],
      startupPending: false,
      startupExitCode: null,
      stdoutLines: [],
      stderrLines: [],
      outputDrain: Promise.resolve(),
      sdkMessages: [],
      initMessage: null,
      pendingPermissionRequests: new Map(),
    }
    ;(conversationService as any).sessions.set(sessionId, session)
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
    const strictVisualExpert: any = makeExpertRuntimeMetadata('active')
    strictVisualExpert.expertId = 'uiux-design-system-expert'
    strictVisualExpert.runtimeBinding.expertId = 'uiux-design-system-expert'
    strictVisualExpert.runtimeBinding.runtimePolicy = {
      mode: 'strict-visual-workflow',
      allowedToolNames: ['AskUserQuestion', 'Read', 'Write', 'Bash'],
      requiredSkillIds: ['taste-redesign', 'ui-craft-critique', 'ui-craft-finalize', 'playwright-visual-qc'],
    }
    spyOn(sessionService, 'getSession').mockResolvedValue({
      id: sessionId,
      workDir: process.cwd(),
      expert: strictVisualExpert,
    } as Awaited<ReturnType<typeof sessionService.getSession>>)

    try {
      handleWebSocket.open(ws)
      handleWebSocket.message(ws, JSON.stringify({
        type: 'user_message',
        content: 'Build an HTML prototype and render it to final PNG images.',
      }))
      await waitForCondition(() => session.outputCallbacks.length === 1)

      const callback = session.outputCallbacks[0]!
      // Reproduce the observed provider edge case: the model claims final
      // delivery but this streamed turn contains no detectable Write event.
      callback({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Final visual delivered.' }] },
      })
      callback({ type: 'result', is_error: false, usage: { input_tokens: 1, output_tokens: 1 } })

      await waitForCondition(() => sendMessage.mock.calls.some(([calledSessionId, content]) =>
        calledSessionId === sessionId
        && typeof content === 'string'
        && content.includes('<strict-visual-review-recovery>')
      ))
      expect(parseSentMessages(ws)).not.toContainEqual(expect.objectContaining({ type: 'message_complete' }))
      expect(parseSentMessages(ws)).toContainEqual(expect.objectContaining({
        type: 'status',
        state: 'thinking',
        verb: 'Critiquing and finalizing rendered UI',
      }))
    } finally {
      conversationService.stopSession(sessionId)
    }
  })

  it('requires rendered-image critique and a revised render before accepting a strict UIUX HTML turn', async () => {
    const sessionId = `strict-uiux-render-review-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const session = {
      proc: { kill() {}, exited: Promise.resolve(0) },
      outputCallbacks: [] as Array<(msg: any) => void>,
      workDir: process.cwd(),
      permissionMode: 'default',
      sdkToken: 'sdk-token',
      sdkSocket: null,
      pendingOutbound: [],
      startupPending: false,
      startupExitCode: null,
      stdoutLines: [],
      stderrLines: [],
      outputDrain: Promise.resolve(),
      sdkMessages: [],
      initMessage: null,
      pendingPermissionRequests: new Map(),
    }
    ;(conversationService as any).sessions.set(sessionId, session)
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
    const strictVisualExpert: any = makeExpertRuntimeMetadata('active')
    strictVisualExpert.expertId = 'uiux-design-system-expert'
    strictVisualExpert.runtimeBinding.expertId = 'uiux-design-system-expert'
    strictVisualExpert.runtimeBinding.runtimePolicy = {
      mode: 'strict-visual-workflow',
      allowedToolNames: ['AskUserQuestion', 'Read', 'Write', 'Bash'],
      requiredSkillIds: ['taste-redesign', 'ui-craft-critique', 'ui-craft-finalize', 'playwright-visual-qc'],
    }
    spyOn(sessionService, 'getSession').mockResolvedValue({
      id: sessionId,
      workDir: process.cwd(),
      expert: strictVisualExpert,
    } as Awaited<ReturnType<typeof sessionService.getSession>>)

    try {
      handleWebSocket.open(ws)
      const callback = session.outputCallbacks[0]!
      callback({
        type: 'assistant',
        message: { content: [
          { type: 'tool_use', id: 'write-first', name: 'Write', input: { file_path: 'C:/tmp/payment-redesign.html', content: '<main>first</main>' } },
          { type: 'tool_use', id: 'render-first', name: 'Bash', input: { command: '& $env:CC_JIANGXIA_VISUAL_QA_BROWSER_EXECUTABLE --headless --screenshot=C:/tmp/desktop-first.png file:///C:/tmp/payment-redesign.html' } },
        ] },
      })
      callback({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'render-first', is_error: false, content: 'Screenshot written: C:/tmp/desktop-first.png' }] } })
      callback({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'read-first', name: 'Read', input: { file_path: 'C:/tmp/desktop-first.png' } }] } })
      callback({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'read-first', is_error: false, content: [{ type: 'image', source: { type: 'base64', data: 'AA==' } }] }] } })
      callback({
        type: 'assistant',
        message: { content: [
          { type: 'tool_use', id: 'rewrite-revised', name: 'Bash', input: { command: "python -c \"p='C:/tmp/payment-redesign.html'; s=open(p, encoding='utf-8').read(); open(p, 'w', encoding='utf-8').write(s.replace('first', 'revised'))\"" } },
          { type: 'tool_use', id: 'render-revised', name: 'Bash', input: { command: '& $env:CC_JIANGXIA_VISUAL_QA_BROWSER_EXECUTABLE --headless --screenshot=C:/tmp/desktop-revised.png file:///C:/tmp/payment-redesign.html' } },
        ] },
      })
      callback({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'render-revised', is_error: false, content: 'Screenshot written: C:/tmp/desktop-revised.png' }] } })
      callback({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'read-revised', name: 'Read', input: { file_path: 'C:/tmp/desktop-revised.png' } }] } })
      callback({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'read-revised', is_error: false, content: [{ type: 'image', source: { type: 'base64', data: 'AA==' } }] }] } })
      callback({ type: 'assistant', message: { content: [{ type: 'text', text: '<visual-review-receipt>taste-redesign: reduced generic gradient. impeccable-visual-refinement: visual-register: product-internal recorder purchase window, anchored in the source orange rail and compact transaction rhythm; removed: generic dark summary card. collision: 390 mobile badges reflow without covering tier labels or prices. ui-craft-critique: desktop 1440 CTA hierarchy fixed; tablet 1024 comparison spacing fixed; mobile 390 button remains visible. ui-craft-finalize: verified revised responsive hierarchy. source-fidelity-final-pass: source-fidelity tab/plan/price diff passed; duplicate scan: none.</visual-review-receipt>' }] } })
      callback({ type: 'result', is_error: false, usage: { input_tokens: 1, output_tokens: 1 } })

      await waitForCondition(() => parseSentMessages(ws).some((message) => message.type === 'message_complete'))
      expect(sendMessage).not.toHaveBeenCalled()
      expect(parseSentMessages(ws)).toContainEqual(expect.objectContaining({ type: 'message_complete' }))
    } finally {
      conversationService.stopSession(sessionId)
    }
  })

  it('recovers a strict UIUX turn that renders PNGs but skips image-based critique and finalization', async () => {
    const sessionId = `strict-uiux-render-review-recovery-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const session = {
      proc: { kill() {}, exited: Promise.resolve(0) },
      outputCallbacks: [] as Array<(msg: any) => void>,
      workDir: process.cwd(),
      permissionMode: 'default',
      sdkToken: 'sdk-token',
      sdkSocket: null,
      pendingOutbound: [],
      startupPending: false,
      startupExitCode: null,
      stdoutLines: [],
      stderrLines: [],
      outputDrain: Promise.resolve(),
      sdkMessages: [],
      initMessage: null,
      pendingPermissionRequests: new Map(),
    }
    ;(conversationService as any).sessions.set(sessionId, session)
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
    const strictVisualExpert: any = makeExpertRuntimeMetadata('active')
    strictVisualExpert.expertId = 'uiux-design-system-expert'
    strictVisualExpert.runtimeBinding.expertId = 'uiux-design-system-expert'
    strictVisualExpert.runtimeBinding.runtimePolicy = { mode: 'strict-visual-workflow', allowedToolNames: ['Read', 'Write', 'Bash'], requiredSkillIds: [] }
    spyOn(sessionService, 'getSession').mockResolvedValue({ id: sessionId, workDir: process.cwd(), expert: strictVisualExpert } as Awaited<ReturnType<typeof sessionService.getSession>>)

    try {
      handleWebSocket.open(ws)
      const callback = session.outputCallbacks[0]!
      callback({ type: 'assistant', message: { content: [
        { type: 'tool_use', id: 'write-html', name: 'Write', input: { file_path: 'C:/tmp/payment-redesign.html', content: '<main>prototype</main>' } },
        { type: 'tool_use', id: 'render', name: 'Bash', input: { command: '& $env:CC_JIANGXIA_VISUAL_QA_BROWSER_EXECUTABLE --headless --screenshot=C:/tmp/desktop.png file:///C:/tmp/payment-redesign.html' } },
      ] } })
      callback({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'render', is_error: false, content: 'Screenshot written: C:/tmp/desktop.png' }] } })
      callback({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'read', name: 'Read', input: { file_path: 'C:/tmp/desktop.png' } }] } })
      callback({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'read', is_error: false, content: [{ type: 'image', source: { type: 'base64', data: 'AA==' } }] }] } })
      // A second screenshot alone is not an HTML revision. This guards against
      // accepting a render-only Bash command as proof of critique/revision.
      callback({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'render-again', name: 'Bash', input: { command: '& $env:CC_JIANGXIA_VISUAL_QA_BROWSER_EXECUTABLE --headless --screenshot=C:/tmp/desktop-again.png file:///C:/tmp/payment-redesign.html' } }] } })
      callback({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'render-again', is_error: false, content: 'Screenshot written: C:/tmp/desktop-again.png' }] } })
      callback({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'read-again', name: 'Read', input: { file_path: 'C:/tmp/desktop-again.png' } }] } })
      callback({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'read-again', is_error: false, content: [{ type: 'image', source: { type: 'base64', data: 'AA==' } }] }] } })
      callback({ type: 'assistant', message: { content: [{ type: 'text', text: '<visual-review-receipt>taste-redesign: checked. ui-craft-critique: desktop 1440, tablet 1024, mobile 390 checked. ui-craft-finalize: claimed.</visual-review-receipt>' }] } })
      callback({ type: 'result', is_error: false, usage: { input_tokens: 1, output_tokens: 1 } })

      await waitForCondition(() => sendMessage.mock.calls.some(([calledSessionId, content]) => calledSessionId === sessionId && typeof content === 'string' && content.includes('<strict-visual-review-recovery>')))
      expect(parseSentMessages(ws)).not.toContainEqual(expect.objectContaining({ type: 'message_complete' }))
      expect(parseSentMessages(ws)).toContainEqual(expect.objectContaining({ type: 'status', state: 'thinking', verb: 'Critiquing and finalizing rendered UI' }))
    } finally {
      conversationService.stopSession(sessionId)
    }
  })
  it('recovers an English streamed prose decision with structured AskUserQuestion guidance', async () => {
    const sessionId = `workflow-streamed-english-question-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    const session = {
      proc: { kill() {}, exited: Promise.resolve(0) },
      outputCallbacks: [] as Array<(msg: any) => void>,
      workDir: process.cwd(),
      permissionMode: 'default',
      sdkToken: 'sdk-token',
      sdkSocket: null,
      pendingOutbound: [],
      startupPending: false,
      startupExitCode: null,
      stdoutLines: [],
      stderrLines: [],
      outputDrain: Promise.resolve(),
      sdkMessages: [],
      initMessage: null,
      pendingPermissionRequests: new Map(),
    }
    ;(conversationService as any).sessions.set(sessionId, session)
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
    await stateService.writeState(sessionId, makeWorkflowState(sessionId))

    try {
      handleWebSocket.open(ws)
      const callback = session.outputCallbacks[0]!
      callback({ type: 'stream_event', event: { type: 'message_start' } })
      callback({
        type: 'stream_event',
        event: { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
      })
      callback({
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'Would you like me to continue or pause?' },
        },
      })
      callback({ type: 'result', is_error: false, usage: { input_tokens: 1, output_tokens: 1 } })

      await waitForCondition(() => sendMessage.mock.calls.length === 1)

      expect(sendMessage).toHaveBeenCalledWith(
        sessionId,
        expect.stringContaining('Your previous response asked the user for a decision in prose'),
      )
      expect(parseSentMessages(ws)).toContainEqual(expect.objectContaining({
        type: 'status',
        state: 'thinking',
        verb: 'Generating choices',
      }))
    } finally {
      conversationService.stopSession(sessionId)
    }
  })

  it('continues an active workflow that ends without a question, completion, or route instead of leaving the user at the composer', async () => {
    const sessionId = `workflow-unstructured-terminal-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    const session = {
      proc: { kill() {}, exited: Promise.resolve(0) },
      outputCallbacks: [] as Array<(msg: any) => void>,
      workDir: process.cwd(),
      permissionMode: 'default',
      sdkToken: 'sdk-token',
      sdkSocket: null,
      pendingOutbound: [],
      startupPending: false,
      startupExitCode: null,
      stdoutLines: [],
      stderrLines: [],
      outputDrain: Promise.resolve(),
      sdkMessages: [],
      initMessage: null,
      pendingPermissionRequests: new Map(),
    }
    ;(conversationService as any).sessions.set(sessionId, session)
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
    await stateService.writeState(sessionId, makeWorkflowState(sessionId))

    try {
      handleWebSocket.open(ws)
      const callback = session.outputCallbacks[0]!
      callback({
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: '已记录本阶段的验证证据。' }],
        },
      })
      callback({ type: 'result', is_error: false, usage: { input_tokens: 1, output_tokens: 1 } })

      await waitForCondition(() => sendMessage.mock.calls.some(([calledSessionId, content]) =>
        calledSessionId === sessionId
        && typeof content === 'string'
        && content.includes('submit_phase_completion'),
      ))

      expect(parseSentMessages(ws)).not.toContainEqual(expect.objectContaining({
        type: 'message_complete',
      }))
      expect(sendMessage).toHaveBeenCalledWith(
        sessionId,
        expect.stringContaining('Continue the active phase now'),
      )
    } finally {
      conversationService.stopSession(sessionId)
    }
  })

  it('continues a workflow when the SDK emits assistant end_turn without a final result event', async () => {
    const sessionId = `workflow-end-turn-without-result-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    const session = {
      proc: { kill() {}, exited: Promise.resolve(0) },
      outputCallbacks: [] as Array<(msg: any) => void>,
      workDir: process.cwd(),
      permissionMode: 'default',
      sdkToken: 'sdk-token',
      sdkSocket: null,
      pendingOutbound: [],
      startupPending: false,
      startupExitCode: null,
      stdoutLines: [],
      stderrLines: [],
      outputDrain: Promise.resolve(),
      sdkMessages: [],
      initMessage: null,
      pendingPermissionRequests: new Map(),
    }
    ;(conversationService as any).sessions.set(sessionId, session)
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
    await stateService.writeState(sessionId, makeWorkflowState(sessionId))

    try {
      handleWebSocket.open(ws)
      const callback = session.outputCallbacks[0]!
      callback({
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'B01 is complete. B02 requires a user-approved download.' }],
          stop_reason: 'end_turn',
        },
      })

      await waitForCondition(() => sendMessage.mock.calls.some(([calledSessionId, content]) =>
        calledSessionId === sessionId
        && typeof content === 'string'
        && content.includes('Continue the active phase now'),
      ), 2000)

      expect(sendMessage).toHaveBeenCalledWith(
        sessionId,
        expect.stringContaining('Continue the active phase now'),
      )
    } finally {
      conversationService.stopSession(sessionId)
    }
  })

  it('continues a Chinese workflow turn that ends without a structured interaction', async () => {
    const sessionId = `workflow-chinese-unstructured-terminal-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    const session = {
      proc: { kill() {}, exited: Promise.resolve(0) },
      outputCallbacks: [] as Array<(msg: any) => void>,
      workDir: process.cwd(),
      permissionMode: 'default',
      sdkToken: 'sdk-token',
      sdkSocket: null,
      pendingOutbound: [],
      startupPending: false,
      startupExitCode: null,
      stdoutLines: [],
      stderrLines: [],
      outputDrain: Promise.resolve(),
      sdkMessages: [],
      initMessage: null,
      pendingPermissionRequests: new Map(),
    }
    ;(conversationService as any).sessions.set(sessionId, session)
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
    const state = makeWorkflowState(sessionId)
    state.workflowLanguage = 'zh'
    await stateService.writeState(sessionId, state)

    try {
      handleWebSocket.open(ws)
      const callback = session.outputCallbacks[0]!
      callback({
        type: 'assistant',
        message: { content: [{ type: 'text', text: '已记录当前阶段的验证证据。' }] },
      })
      callback({ type: 'result', is_error: false, usage: { input_tokens: 1, output_tokens: 1 } })

      await waitForCondition(() => sendMessage.mock.calls.length === 1)

      expect(sendMessage).toHaveBeenCalledWith(
        sessionId,
        expect.stringContaining('不得静默停止'),
      )
      expect(parseSentMessages(ws)).toContainEqual(expect.objectContaining({
        type: 'status',
        state: 'thinking',
        verb: '正在继续工作流',
      }))
    } finally {
      conversationService.stopSession(sessionId)
    }
  })

  it('does not issue terminal recovery when AskUserQuestion is already pending', async () => {
    const sessionId = `workflow-pending-ask-user-question-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    const session = {
      proc: { kill() {}, exited: Promise.resolve(0) },
      outputCallbacks: [] as Array<(msg: any) => void>,
      workDir: process.cwd(),
      permissionMode: 'default',
      sdkToken: 'sdk-token',
      sdkSocket: null,
      pendingOutbound: [],
      startupPending: false,
      startupExitCode: null,
      stdoutLines: [],
      stderrLines: [],
      outputDrain: Promise.resolve(),
      sdkMessages: [],
      initMessage: null,
      pendingPermissionRequests: new Map(),
    }
    ;(conversationService as any).sessions.set(sessionId, session)
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
    const pendingRequests = spyOn(conversationService, 'getPendingPermissionRequests').mockReturnValue([])
    await stateService.writeState(sessionId, makeWorkflowState(sessionId))

    try {
      handleWebSocket.open(ws)
      pendingRequests.mockReturnValue([{
        requestId: 'pending-question',
        toolName: 'AskUserQuestion',
        toolUseId: 'ask-tool',
        input: { questions: [] },
        description: 'Pending workflow question',
      }])
      const callback = session.outputCallbacks[0]!
      callback({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'What would you like to do next?' }] },
      })
      callback({ type: 'result', is_error: false, usage: { input_tokens: 1, output_tokens: 1 } })

      await waitForCondition(() => parseSentMessages(ws).some((message) => message.type === 'message_complete'))

      expect(sendMessage).not.toHaveBeenCalled()
      expect(parseSentMessages(ws)).toContainEqual(expect.objectContaining({ type: 'message_complete' }))
    } finally {
      conversationService.stopSession(sessionId)
    }
  })

  it('does not issue a recovery turn when the active workflow already emitted AskUserQuestion', async () => {
    const sessionId = `workflow-structured-question-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const session = {
      proc: { kill() {}, exited: Promise.resolve(0) },
      outputCallbacks: [] as Array<(msg: any) => void>,
      workDir: process.cwd(),
      permissionMode: 'default',
      sdkToken: 'sdk-token',
      sdkSocket: null,
      pendingOutbound: [],
      startupPending: false,
      startupExitCode: null,
      stdoutLines: [],
      stderrLines: [],
      outputDrain: Promise.resolve(),
      sdkMessages: [],
      initMessage: null,
      pendingPermissionRequests: new Map(),
    }
    ;(conversationService as any).sessions.set(sessionId, session)
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)

    try {
      handleWebSocket.open(ws)
      const callback = session.outputCallbacks[0]!
      callback({
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: '我需要你选择下一步。' },
            {
              type: 'tool_use',
              id: 'ask-structured-question',
              name: 'AskUserQuestion',
              input: {
                questions: [{
                  id: 'next-step',
                  prompt: '下一步怎么做？',
                  choices: [
                    { id: 'continue', label: '继续' },
                    { id: 'pause', label: '暂停' },
                  ],
                }],
              },
            },
          ],
        },
      })
      callback({ type: 'result', is_error: false, usage: { input_tokens: 1, output_tokens: 1 } })

      await waitForCondition(() => parseSentMessages(ws).some((message) => message.type === 'message_complete'))

      expect(sendMessage).not.toHaveBeenCalled()
      expect(parseSentMessages(ws)).toContainEqual(expect.objectContaining({
        type: 'tool_use_complete',
        toolName: 'AskUserQuestion',
      }))
    } finally {
      conversationService.stopSession(sessionId)
    }
  })

  it('persists AskUserQuestion as a blocking phase issue before delivery and keeps its answer pending explicit processing', async () => {
    const sessionId = `workflow-persisted-ask-question-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    const session = {
      proc: { kill() {}, exited: Promise.resolve(0) },
      outputCallbacks: [] as Array<(msg: any) => void>,
      workDir: process.cwd(),
      permissionMode: 'default',
      sdkToken: 'sdk-token',
      sdkSocket: null,
      pendingOutbound: [],
      startupPending: false,
      startupExitCode: null,
      stdoutLines: [],
      stderrLines: [],
      outputDrain: Promise.resolve(),
      sdkMessages: [],
      initMessage: null,
      pendingPermissionRequests: new Map(),
    }
    ;(conversationService as any).sessions.set(sessionId, session)
    const respondToPermission = spyOn(conversationService, 'respondToPermission').mockReturnValue(true)
    spyOn(sessionService, 'appendSessionMetadata').mockResolvedValue()
    await stateService.writeState(sessionId, makeWorkflowState(sessionId))

    try {
      handleWebSocket.open(ws)
      const callback = session.outputCallbacks[0]!
      callback({
        type: 'control_request',
        request_id: 'ask-contract-question',
        request: {
          subtype: 'can_use_tool',
          tool_name: 'AskUserQuestion',
          tool_use_id: 'ask-contract-tool',
          input: {
            questions: [{ header: 'Decision', prompt: 'Which option should the phase use?' }],
          },
        },
      })

      await waitForCondition(() => parseSentMessages(ws).some((message) =>
        message.type === 'permission_request' && message.requestId === 'ask-contract-question',
      ))
      await flushAsyncHandlers()

      const recorded = await stateService.readState(sessionId)
      const issue = recorded.state?.runtimeContract?.phaseStates['requirements-clarification']?.issues.find(
        (candidate) => candidate.questionRequestId === 'ask-contract-question',
      )
      expect(issue).toMatchObject({
        status: 'open',
        blocksCompletion: true,
        question: 'Which option should the phase use?',
      })
      expect(parseSentMessages(ws)).toContainEqual(expect.objectContaining({
        type: 'permission_request',
        requestId: 'ask-contract-question',
        toolName: 'AskUserQuestion',
      }))

      handleWebSocket.message(ws, JSON.stringify({
        type: 'permission_response',
        requestId: 'ask-contract-question',
        allowed: true,
        updatedInput: {
          questions: [{ header: 'Decision', prompt: 'Which option should the phase use?' }],
          answers: { 'Which option should the phase use?': 'Use option B.' },
        },
      }))
      await waitForCondition(() => respondToPermission.mock.calls.length === 1)

      const answered = await stateService.readState(sessionId)
      expect(answered.state?.runtimeContract?.phaseStates['requirements-clarification']?.issues.find(
        (candidate) => candidate.questionRequestId === 'ask-contract-question',
      )).toMatchObject({
        status: 'answered-pending-processing',
        blocksCompletion: true,
        answer: { 'Which option should the phase use?': 'Use option B.' },
      })


      callback({
        type: 'control_request',
        request_id: 'ask-retry-acknowledgement',
        request: {
          subtype: 'can_use_tool',
          tool_name: 'AskUserQuestion',
          tool_use_id: 'ask-retry-tool',
          input: {
            questions: [{
              id: 'retry-stage-completion',
              header: 'Retry',
              question: 'Retry the current stage completion?',
              blocksCompletion: false,
              choices: [{ id: 'retry', label: 'Retry' }, { id: 'pause', label: 'Pause' }],
            }],
          },
        },
      })
      await waitForCondition(() => parseSentMessages(ws).some((message) =>
        message.type === 'permission_request' && message.requestId === 'ask-retry-acknowledgement',
      ))
      await flushAsyncHandlers()

      const nonBlocking = await stateService.readState(sessionId)
      expect(nonBlocking.state?.runtimeContract?.phaseStates['requirements-clarification']?.issues.find(
        (candidate) => candidate.questionRequestId === 'ask-retry-acknowledgement',
      )).toMatchObject({
        status: 'open',
        blocksCompletion: false,
        question: 'Retry the current stage completion?',
      })
    } finally {
      conversationService.stopSession(sessionId)
    }
  })


  it('rejects an invalid skills-development decision card from persisted workflow state before desktop delivery', async () => {
    const sessionId = `workflow-invalid-question-card-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    const session = {
      proc: { kill() {}, exited: Promise.resolve(0) },
      outputCallbacks: [] as Array<(msg: any) => void>,
      workDir: process.cwd(),
      permissionMode: 'default',
      sdkToken: 'sdk-token',
      sdkSocket: null,
      pendingOutbound: [],
      startupPending: false,
      startupExitCode: null,
      stdoutLines: [],
      stderrLines: [],
      outputDrain: Promise.resolve(),
      sdkMessages: [],
      initMessage: null,
      pendingPermissionRequests: new Map(),
    }
    ;(conversationService as any).sessions.set(sessionId, session)
    const respondToPermission = spyOn(conversationService, 'respondToPermission').mockReturnValue(true)
    const state = makeWorkflowState(sessionId)
    state.activePhaseId = 'scope-plan'
    state.templateIdentity = { id: 'skills-development', source: 'user', version: '15' }
    state.templateSnapshot = {
      schemaVersion: 1,
      id: 'skills-development',
      source: 'user',
      version: '15',
      displayName: 'Skills development',
      description: 'Persisted decision-card enforcement fixture',
      phases: [{
        id: 'scope-plan',
        label: 'Scope plan',
        instructions: 'Ask one compliant decision card.',
        requestedModel: null,
        skillDeclarations: [],
        requiredArtifacts: [],
        completionCriteria: [],
        transitionAuthority: 'user-confirmation',
        runtimeContract: {
          questionPolicy: {
            exactQuestionCount: 1,
            minChoices: 2,
            maxChoices: 3,
            firstChoiceLabelIncludes: '(Recommended)',
            requireChoiceDescriptions: true,
            disallowComputerUse: true,
          },
        },
      }],
    }
    await stateService.writeState(sessionId, state)

    try {
      handleWebSocket.open(ws)
      const callback = session.outputCallbacks[0]!
      callback({
        type: 'control_request',
        request_id: 'invalid-skills-question',
        request: {
          subtype: 'can_use_tool',
          tool_name: 'AskUserQuestion',
          tool_use_id: 'invalid-skills-tool',
          input: {
            questions: [{
              prompt: 'Which scope should we build?',
              choices: [
                { label: 'A', description: 'First.' },
                { label: 'B', description: 'Second.' },
                { label: 'C', description: 'Third.' },
                { label: 'D', description: 'Fourth.' },
              ],
            }],
          },
        },
      })

      await waitForCondition(() => respondToPermission.mock.calls.length === 1)
      expect(respondToPermission).toHaveBeenCalledWith(
        sessionId,
        'invalid-skills-question',
        false,
        undefined,
        undefined,
        expect.stringContaining('WORKFLOW_QUESTION_CONTRACT_VIOLATION'),
      )
      expect(parseSentMessages(ws)).not.toContainEqual(expect.objectContaining({
        type: 'permission_request',
        requestId: 'invalid-skills-question',
      }))
      expect(parseSentMessages(ws)).toContainEqual(expect.objectContaining({
        type: 'error',
        code: 'WORKFLOW_QUESTION_CONTRACT_VIOLATION',
      }))
    } finally {
      conversationService.stopSession(sessionId)
    }
  })

  it('marks an AskUserQuestion AbortError stale instead of forcing a second packet or terminal protocol failure', async () => {
    const sessionId = `workflow-aborted-ask-question-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    const session = {
      proc: { kill() {}, exited: Promise.resolve(0) },
      outputCallbacks: [] as Array<(msg: any) => void>,
      workDir: process.cwd(),
      permissionMode: 'default',
      sdkToken: 'sdk-token',
      sdkSocket: null,
      pendingOutbound: [],
      startupPending: false,
      startupExitCode: null,
      stdoutLines: [],
      stderrLines: [],
      outputDrain: Promise.resolve(),
      sdkMessages: [],
      initMessage: null,
      pendingPermissionRequests: new Map(),
    }
    ;(conversationService as any).sessions.set(sessionId, session)
    spyOn(sessionService, 'appendSessionMetadata').mockResolvedValue()
    await stateService.writeState(sessionId, makeWorkflowState(sessionId))

    try {
      handleWebSocket.open(ws)
      const callback = session.outputCallbacks[0]!
      callback({
        type: 'control_request',
        request_id: 'aborted-ask-request',
        request: {
          subtype: 'can_use_tool',
          tool_name: 'AskUserQuestion',
          tool_use_id: 'aborted-ask-tool-use',
          input: {
            questions: [{ id: 'decision', prompt: 'Which decision should apply?' }],
          },
        },
      })
      await waitForCondition(() => parseSentMessages(ws).some((message) =>
        message.type === 'permission_request' && message.requestId === 'aborted-ask-request',
      ))

      callback({
        type: 'user',
        message: {
          content: [{
            type: 'tool_result',
            tool_use_id: 'aborted-ask-tool-use',
            is_error: true,
            content: 'Tool permission request failed: AbortError',
          }],
        },
      })
      callback({ type: 'result', is_error: false, usage: { input_tokens: 1, output_tokens: 1 } })

      await waitForCondition(() => parseSentMessages(ws).some((message) =>
        message.type === 'system_notification'
        && message.subtype === 'workflow_state'
        && (message.data as any)?.completion?.issues?.some((issue: any) =>
          issue.id === 'ask:aborted-ask-request:0' && issue.status === 'stale' && issue.blocksCompletion === false,
        ) === true,
      ))

      expect(parseSentMessages(ws)).not.toContainEqual(expect.objectContaining({
        type: 'error',
        code: 'WORKFLOW_TERMINAL_PROTOCOL_REQUIRED',
      }))
      expect(parseSentMessages(ws)).not.toContainEqual(expect.objectContaining({
        type: 'error',
        code: 'WORKFLOW_QUESTION_CONTRACT_VIOLATION',
      }))
    } finally {
      conversationService.stopSession(sessionId)
    }
  })

  it('marks a dismissed AskUserQuestion card stale before denying it to the CLI', async () => {
    const sessionId = `workflow-dismissed-ask-question-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    const session = {
      proc: { kill() {}, exited: Promise.resolve(0) },
      outputCallbacks: [] as Array<(msg: any) => void>,
      workDir: process.cwd(),
      permissionMode: 'default',
      sdkToken: 'sdk-token',
      sdkSocket: null,
      pendingOutbound: [],
      startupPending: false,
      startupExitCode: null,
      stdoutLines: [],
      stderrLines: [],
      outputDrain: Promise.resolve(),
      sdkMessages: [],
      initMessage: null,
      pendingPermissionRequests: new Map(),
    }
    ;(conversationService as any).sessions.set(sessionId, session)
    const respondToPermission = spyOn(conversationService, 'respondToPermission').mockReturnValue(true)
    spyOn(sessionService, 'appendSessionMetadata').mockResolvedValue()
    await stateService.writeState(sessionId, makeWorkflowState(sessionId))

    try {
      handleWebSocket.open(ws)
      const callback = session.outputCallbacks[0]!
      callback({
        type: 'control_request',
        request_id: 'dismissed-ask-request',
        request: {
          subtype: 'can_use_tool',
          tool_name: 'AskUserQuestion',
          tool_use_id: 'dismissed-ask-tool-use',
          input: {
            questions: [{ id: 'decision', prompt: 'Which decision should apply?' }],
          },
        },
      })
      await waitForCondition(() => parseSentMessages(ws).some((message) =>
        message.type === 'permission_request' && message.requestId === 'dismissed-ask-request',
      ))
      session.pendingPermissionRequests.set('dismissed-ask-request', {
        toolName: 'AskUserQuestion',
        toolUseId: 'dismissed-ask-tool-use',
        input: { questions: [{ id: 'decision', prompt: 'Which decision should apply?' }] },
      })

      handleWebSocket.message(ws, JSON.stringify({
        type: 'permission_response',
        requestId: 'dismissed-ask-request',
        allowed: false,
      }))
      await waitForCondition(() => respondToPermission.mock.calls.length === 1)

      const persisted = await stateService.readState(sessionId)
      expect(persisted.state?.runtimeContract?.phaseStates['requirements-clarification']?.issues.find(
        (issue) => issue.questionRequestId === 'dismissed-ask-request',
      )).toMatchObject({
        status: 'stale',
        blocksCompletion: false,
      })
      expect(respondToPermission).toHaveBeenCalledWith(
        sessionId,
        'dismissed-ask-request',
        false,
        undefined,
        undefined,
      )
    } finally {
      conversationService.stopSession(sessionId)
    }
  })

  it('marks a persisted AskUserQuestion error stale when the workflow session reconnects', async () => {
    const sessionId = `workflow-errored-ask-reconnect-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    const state = makeWorkflowState(sessionId)
    const phaseId = state.activePhaseId!
    const phaseState = state.runtimeContract!.phaseStates[phaseId]!
    state.runtimeContract!.phaseStates[phaseId] = {
      ...phaseState,
      issues: [{
        id: 'ask:errored-question:0',
        phaseId,
        sessionId,
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
        source: 'ask-user-question',
        status: 'open',
        blocksCompletion: true,
        question: 'Decision',
        blockingReason: 'A workflow question requires an answer and explicit processing.',
        questionRequestId: 'errored-question',
        questionId: 'Decision',
        toolUseId: 'errored-ask-tool',
        createdStateVersion: state.stateVersion,
      }],
    }
    await stateService.writeState(sessionId, state)
    spyOn(sessionService, 'appendSessionMetadata').mockResolvedValue()
    spyOn(sessionService, 'getSessionMessages').mockResolvedValue([
      {
        id: 'errored-tool-use',
        type: 'tool_use',
        timestamp: state.createdAt,
        content: [{
          type: 'tool_use',
          id: 'errored-ask-tool',
          name: 'AskUserQuestion',
          input: { questions: [{ header: 'Decision', prompt: 'Which option should apply?' }] },
        }],
      },
      {
        id: 'errored-tool-result',
        type: 'tool_result',
        timestamp: state.updatedAt,
        content: [{
          type: 'tool_result',
          tool_use_id: 'errored-ask-tool',
          is_error: true,
          content: 'Tool permission request failed: AbortError',
        }],
      },
    ])

    handleWebSocket.open(ws)
    await waitForCondition(() => parseSentMessages(ws).some((message) =>
      message.type === 'system_notification'
      && message.subtype === 'workflow_state'
      && (message.data as any)?.completion?.issues?.some((issue: any) =>
        issue.id === 'ask:errored-question:0' && issue.status === 'stale' && issue.blocksCompletion === false,
      ) === true,
    ))

    const persisted = await stateService.readState(sessionId)
    expect(persisted.state?.runtimeContract?.phaseStates[phaseId]?.issues[0]).toMatchObject({
      status: 'stale',
      blocksCompletion: false,
      processing: { status: 'stale' },
    })
  })

  it('reconciles a legacy header-keyed workflow question from its persisted AskUserQuestion result', async () => {
    const sessionId = `workflow-legacy-ask-answer-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    const state = makeWorkflowState(sessionId)
    const phaseId = state.activePhaseId!
    const phaseState = state.runtimeContract!.phaseStates[phaseId]!
    state.runtimeContract!.phaseStates[phaseId] = {
      ...phaseState,
      issues: [{
        id: 'ask:legacy-question:0',
        phaseId,
        sessionId,
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
        source: 'ask-user-question',
        status: 'open',
        blocksCompletion: true,
        question: 'Decision',
        blockingReason: 'A workflow question requires an answer and explicit processing.',
        questionRequestId: 'legacy-question',
        questionId: 'Decision',
        toolUseId: 'legacy-ask-tool',
        createdStateVersion: state.stateVersion,
      }],
    }
    await stateService.writeState(sessionId, state)
    spyOn(sessionService, 'appendSessionMetadata').mockResolvedValue()
    spyOn(sessionService, 'getSessionMessages').mockResolvedValue([
      {
        id: 'legacy-tool-use',
        type: 'tool_use',
        timestamp: state.createdAt,
        content: [{
          type: 'tool_use',
          id: 'legacy-ask-tool',
          name: 'AskUserQuestion',
          input: {
            questions: [{
              header: 'Decision',
              prompt: 'Which option should the phase use?',
            }],
          },
        }],
      },
      {
        id: 'legacy-tool-result',
        type: 'tool_result',
        timestamp: state.updatedAt,
        content: [{
          type: 'tool_result',
          tool_use_id: 'legacy-ask-tool',
          content: "User has answered your questions: \"Which option should the phase use?\"=\"Use option B.\". You can now continue with the user's answers in mind.",
        }],
      },
    ])

    handleWebSocket.open(ws)
    await waitForAsyncCondition(async () => {
      const persisted = await stateService.readState(sessionId)
      return persisted.state?.runtimeContract?.phaseStates[phaseId]?.issues[0]?.status === 'answered-pending-processing'
    })

    const persisted = await stateService.readState(sessionId)
    expect(persisted.state?.runtimeContract?.phaseStates[phaseId]?.issues[0]).toMatchObject({
      status: 'answered-pending-processing',
      answer: {
        Decision: 'Use option B.',
        'Which option should the phase use?': 'Use option B.',
      },
    })
  })

  it('returns submit completion validation errors to the model for one corrected retry without restarting the CLI', async () => {
    const sessionId = `workflow-submit-input-recovery-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    const session = {
      proc: { kill() {}, exited: Promise.resolve(0) },
      outputCallbacks: [] as Array<(msg: any) => void>,
      workDir: process.cwd(),
      permissionMode: 'default',
      sdkToken: 'sdk-token',
      sdkSocket: null,
      pendingOutbound: [],
      startupPending: false,
      startupExitCode: null,
      stdoutLines: [],
      stderrLines: [],
      outputDrain: Promise.resolve(),
      sdkMessages: [],
      initMessage: null,
      pendingPermissionRequests: new Map(),
    }
    ;(conversationService as any).sessions.set(sessionId, session)
    const stopSessionAndWait = spyOn(conversationService, 'stopSessionAndWait').mockResolvedValue()
    const startSession = spyOn(conversationService, 'startSession').mockResolvedValue()
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
    await stateService.writeState(sessionId, makeWorkflowState(sessionId))

    const invalidResult = {
      type: 'user',
      message: {
        content: [{
          type: 'tool_result',
          tool_use_id: 'workflow-completion-tool',
          is_error: true,
          content: 'InputValidationError: submit_phase_completion failed due to:\n- handoff missing\n- rationale missing\n- evidence missing',
        }],
      },
    }

    try {
      handleWebSocket.open(ws)
      const callback = session.outputCallbacks[0]!
      callback(invalidResult)
      callback({ type: 'result', is_error: true, result: invalidResult.message.content[0].content })

      await waitForCondition(() => sendMessage.mock.calls.length === 1)

      expect(sendMessage).toHaveBeenCalledWith(
        sessionId,
        expect.stringContaining('<workflow-protocol-input-recovery>'),
      )
      expect(sendMessage.mock.calls[0]?.[1]).toContain('handoff (an object)')
      expect(sendMessage.mock.calls[0]?.[1]).toContain('evidence (an array)')
      expect(stopSessionAndWait).not.toHaveBeenCalled()
      expect(startSession).not.toHaveBeenCalled()
      expect(parseSentMessages(ws)).not.toContainEqual(expect.objectContaining({
        type: 'error',
        code: 'WORKFLOW_PROTOCOL_INPUT_INVALID',
      }))

      // The model receives the feedback and makes one corrected tool attempt.
      // It is still invalid, so the runtime must fail visibly instead of looping.
      callback({
        type: 'assistant',
        message: {
          content: [{
            type: 'tool_use',
            id: 'workflow-completion-tool-retry',
            name: 'submit_phase_completion',
            input: {},
          }],
        },
      })
      callback(invalidResult)
      callback({ type: 'result', is_error: true, result: invalidResult.message.content[0].content })

      await waitForCondition(() => parseSentMessages(ws).some((message) =>
        message.type === 'error' && message.code === 'WORKFLOW_PROTOCOL_INPUT_INVALID'
      ))

      expect(sendMessage).toHaveBeenCalledTimes(1)
      expect(stopSessionAndWait).not.toHaveBeenCalled()
      expect(startSession).not.toHaveBeenCalled()
      expect(parseSentMessages(ws)).toContainEqual(expect.objectContaining({
        type: 'error',
        code: 'WORKFLOW_PROTOCOL_INPUT_INVALID',
        retryable: true,
      }))
    } finally {
      conversationService.stopSession(sessionId)
    }
  })

  it('returns missing Agent launch fields to the active workflow for one corrected retry without restarting the CLI', async () => {
    const sessionId = `workflow-agent-input-recovery-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    const session = {
      proc: { kill() {}, exited: Promise.resolve(0) },
      outputCallbacks: [] as Array<(msg: any) => void>,
      workDir: process.cwd(),
      permissionMode: 'default',
      sdkToken: 'sdk-token',
      sdkSocket: null,
      pendingOutbound: [],
      startupPending: false,
      startupExitCode: null,
      stdoutLines: [],
      stderrLines: [],
      outputDrain: Promise.resolve(),
      sdkMessages: [],
      initMessage: null,
      pendingPermissionRequests: new Map(),
    }
    ;(conversationService as any).sessions.set(sessionId, session)
    const stopSessionAndWait = spyOn(conversationService, 'stopSessionAndWait').mockResolvedValue()
    const startSession = spyOn(conversationService, 'startSession').mockResolvedValue()
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
    await stateService.writeState(sessionId, makeFollowUpWorkflowStageOneState(sessionId, {
      templateId: 'workflow-agent-input-recovery',
      phaseId: 'delegate-implement',
      runtimeContract: {
        toolAccess: { allowed: ['Read', 'Glob', 'Grep', 'LS', 'Agent'] },
      },
    }))

    const invalidResult = {
      type: 'user',
      message: {
        content: [{
          type: 'tool_result',
          tool_use_id: 'workflow-agent-tool',
          is_error: true,
          content: 'InputValidationError: Agent failed due to:\nThe required parameter `description` is missing\nThe required parameter `prompt` is missing',
        }],
      },
    }

    try {
      handleWebSocket.open(ws)
      const callback = session.outputCallbacks[0]!
      callback(invalidResult)
      callback({ type: 'result', is_error: true, result: invalidResult.message.content[0].content })

      await waitForCondition(() => sendMessage.mock.calls.length === 1)

      expect(sendMessage).toHaveBeenCalledWith(
        sessionId,
        expect.stringContaining('<workflow-protocol-input-recovery>'),
      )
      expect(sendMessage.mock.calls[0]?.[1]).toContain('non-empty description')
      expect(sendMessage.mock.calls[0]?.[1]).toContain('non-empty prompt')
      expect(sendMessage.mock.calls[0]?.[1]).toContain('workflow_role')
      expect(stopSessionAndWait).not.toHaveBeenCalled()
      expect(startSession).not.toHaveBeenCalled()

      callback({
        type: 'assistant',
        message: {
          content: [{
            type: 'tool_use',
            id: 'workflow-agent-tool-retry',
            name: 'Agent',
            input: {},
          }],
        },
      })
      callback(invalidResult)
      callback({ type: 'result', is_error: true, result: invalidResult.message.content[0].content })

      await waitForCondition(() => parseSentMessages(ws).some((message) =>
        message.type === 'error' && message.code === 'WORKFLOW_PROTOCOL_INPUT_INVALID'
      ))

      expect(sendMessage).toHaveBeenCalledTimes(1)
      expect(stopSessionAndWait).not.toHaveBeenCalled()
      expect(startSession).not.toHaveBeenCalled()
    } finally {
      conversationService.stopSession(sessionId)
    }
  })

  it('returns route validation errors to the model with the target-phase contract in Chinese', async () => {
    const sessionId = `workflow-route-input-recovery-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    const session = {
      proc: { kill() {}, exited: Promise.resolve(0) },
      outputCallbacks: [] as Array<(msg: any) => void>,
      workDir: process.cwd(),
      permissionMode: 'default',
      sdkToken: 'sdk-token',
      sdkSocket: null,
      pendingOutbound: [],
      startupPending: false,
      startupExitCode: null,
      stdoutLines: [],
      stderrLines: [],
      outputDrain: Promise.resolve(),
      sdkMessages: [],
      initMessage: null,
      pendingPermissionRequests: new Map(),
    }
    ;(conversationService as any).sessions.set(sessionId, session)
    const stopSessionAndWait = spyOn(conversationService, 'stopSessionAndWait').mockResolvedValue()
    const startSession = spyOn(conversationService, 'startSession').mockResolvedValue()
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
    const state = makeWorkflowState(sessionId)
    state.workflowLanguage = 'zh'
    await stateService.writeState(sessionId, state)

    try {
      handleWebSocket.open(ws)
      const callback = session.outputCallbacks[0]!
      callback({
        type: 'user',
        message: {
          content: [{
            type: 'tool_result',
            tool_use_id: 'workflow-route-tool',
            is_error: true,
            content: 'InputValidationError: request_workflow_route failed due to:\n- targetPhaseId missing',
          }],
        },
      })
      callback({
        type: 'result', is_error: true, result: 'InputValidationError: request_workflow_route failed due to targetPhaseId missing' })

      await waitForCondition(() => sendMessage.mock.calls.length === 1)

      expect(sendMessage).toHaveBeenCalledWith(
        sessionId,
        expect.stringContaining('<workflow-protocol-input-recovery>'),
      )
      expect(sendMessage.mock.calls[0]?.[1]).toContain('立即重新调用 request_workflow_route')
      expect(sendMessage.mock.calls[0]?.[1]).toContain('targetPhaseId')
      expect(stopSessionAndWait).not.toHaveBeenCalled()
      expect(startSession).not.toHaveBeenCalled()
      expect(parseSentMessages(ws)).toContainEqual(expect.objectContaining({
        type: 'status',
        state: 'thinking',
        verb: '正在修正工作流工具参数',
      }))
    } finally {
      conversationService.stopSession(sessionId)
    }
  })

  it('rebinds a stale recovery turn without scheduling a second terminal recovery', async () => {
    const sessionId = `workflow-tool-registration-recovery-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    const session = {
      proc: { kill() {}, exited: Promise.resolve(0) },
      outputCallbacks: [] as Array<(msg: any) => void>,
      workDir: process.cwd(),
      permissionMode: 'default',
      sdkToken: 'sdk-token',
      sdkSocket: null,
      pendingOutbound: [],
      startupPending: false,
      startupExitCode: null,
      stdoutLines: [],
      stderrLines: [],
      outputDrain: Promise.resolve(),
      sdkMessages: [],
      initMessage: null,
      pendingPermissionRequests: new Map(),
    }
    ;(conversationService as any).sessions.set(sessionId, session)
    const stopSessionAndWait = spyOn(conversationService, 'stopSessionAndWait').mockResolvedValue()
    const startSession = spyOn(conversationService, 'startSession').mockResolvedValue()
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
    spyOn(conversationService, 'getSessionWorkDir').mockReturnValue(process.cwd())
    await stateService.writeState(sessionId, makeWorkflowState(sessionId))

    try {
      handleWebSocket.open(ws)
      const callback = session.outputCallbacks[0]!
      callback({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Would you like to continue or pause?' }] },
      })
      callback({ type: 'result', is_error: false, usage: { input_tokens: 1, output_tokens: 1 } })
      await waitForCondition(() => sendMessage.mock.calls.length === 1)

      callback({
        type: 'user',
        message: {
          content: [{
            type: 'tool_result',
            tool_use_id: 'workflow-completion-tool',
            is_error: true,
            content: 'No such tool available: submit_phase_completion',
          }],
        },
      })
      callback({
        type: 'result',
        is_error: true,
        result: 'No such tool available: submit_phase_completion',
        usage: { input_tokens: 1, output_tokens: 1 },
      })

      // A stale CLI must be rebound, but the registration error must not be
      // mistaken for a second prose-only terminal turn.
      await waitForCondition(() =>
        stopSessionAndWait.mock.calls.length === 1
        && startSession.mock.calls.length === 1
        && sendMessage.mock.calls.length === 2
      )

      expect(stopSessionAndWait).toHaveBeenCalledWith(sessionId)
      expect(sendMessage.mock.calls[0]?.[1]).toContain('<workflow-terminal-recovery>')
      expect(sendMessage.mock.calls[1]?.[1]).toContain('<workflow-protocol-binding-recovery>')
      expect(sendMessage.mock.calls[1]?.[1]).toContain('submit_phase_completion')
      expect(parseSentMessages(ws)).not.toContainEqual(expect.objectContaining({
        type: 'error',
        code: 'WORKFLOW_TERMINAL_PROTOCOL_REQUIRED',
      }))
    } finally {
      conversationService.stopSession(sessionId)
    }
  })

  it('immediately rebinds and retries a submit tool-result error before the old CLI can emit prose or AskUserQuestion', async () => {
    const sessionId = `workflow-protocol-tool-result-retry-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    const session = {
      proc: { kill() {}, exited: Promise.resolve(0) },
      outputCallbacks: [] as Array<(msg: any) => void>,
      workDir: process.cwd(),
      permissionMode: 'default',
      sdkToken: 'sdk-token',
      sdkSocket: null,
      pendingOutbound: [],
      startupPending: false,
      startupExitCode: null,
      stdoutLines: [],
      stderrLines: [],
      outputDrain: Promise.resolve(),
      sdkMessages: [],
      initMessage: null,
      pendingPermissionRequests: new Map(),
    }
    ;(conversationService as any).sessions.set(sessionId, session)
    const stopSessionAndWait = spyOn(conversationService, 'stopSessionAndWait').mockResolvedValue()
    const startSession = spyOn(conversationService, 'startSession').mockResolvedValue()
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
    spyOn(conversationService, 'getSessionWorkDir').mockReturnValue(process.cwd())
    await stateService.writeState(sessionId, makeWorkflowState(sessionId))

    try {
      handleWebSocket.open(ws)
      const callback = session.outputCallbacks[0]!
      callback({
        type: 'assistant',
        message: {
          content: [{
            type: 'tool_use_error',
            tool_use_id: 'workflow-completion-tool',
            error: 'No such tool available: submit_phase_completion',
          }],
        },
      })
      callback({
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'This stale CLI must not ask the user a replacement question.' }],
        },
      })

      await waitForCondition(() => startSession.mock.calls.length === 1 && sendMessage.mock.calls.length === 1)

      expect(stopSessionAndWait).toHaveBeenCalledWith(sessionId)
      expect(sendMessage).toHaveBeenCalledWith(
        sessionId,
        expect.stringContaining('<workflow-protocol-binding-recovery>'),
      )
      expect(sendMessage.mock.calls[0]?.[1]).toContain('submit_phase_completion')
      expect(parseSentMessages(ws)).not.toContainEqual(expect.objectContaining({
        type: 'content_delta',
        text: 'This stale CLI must not ask the user a replacement question.',
      }))
      expect(parseSentMessages(ws)).not.toContainEqual(expect.objectContaining({
        type: 'error',
        code: 'WORKFLOW_TERMINAL_PROTOCOL_REQUIRED',
      }))
    } finally {
      conversationService.stopSession(sessionId)
    }
  })

  it('rebinds protocol tools and retries a Chinese route request without user-entered continue', async () => {
    const sessionId = `workflow-protocol-route-retry-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    const session = {
      proc: { kill() {}, exited: Promise.resolve(0) },
      outputCallbacks: [] as Array<(msg: any) => void>,
      workDir: process.cwd(),
      permissionMode: 'default',
      sdkToken: 'sdk-token',
      sdkSocket: null,
      pendingOutbound: [],
      startupPending: false,
      startupExitCode: null,
      stdoutLines: [],
      stderrLines: [],
      outputDrain: Promise.resolve(),
      sdkMessages: [],
      initMessage: null,
      pendingPermissionRequests: new Map(),
    }
    ;(conversationService as any).sessions.set(sessionId, session)
    const stopSessionAndWait = spyOn(conversationService, 'stopSessionAndWait').mockResolvedValue()
    const startSession = spyOn(conversationService, 'startSession').mockResolvedValue()
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
    spyOn(conversationService, 'getSessionWorkDir').mockReturnValue(process.cwd())
    const state = makeWorkflowState(sessionId)
    state.workflowLanguage = 'zh'
    await stateService.writeState(sessionId, state)

    try {
      handleWebSocket.open(ws)
      const callback = session.outputCallbacks[0]!
      callback({
        type: 'result',
        is_error: true,
        result: 'No such tool available: request_workflow_route',
        usage: { input_tokens: 1, output_tokens: 1 },
      })

      await waitForCondition(() => startSession.mock.calls.length === 1 && sendMessage.mock.calls.length === 1)

      expect(stopSessionAndWait).toHaveBeenCalledWith(sessionId)
      expect(startSession.mock.calls[0]?.[3]).toMatchObject({ workflowSessionId: sessionId })
      expect(sendMessage).toHaveBeenCalledWith(
        sessionId,
        expect.stringContaining('<workflow-protocol-binding-recovery>'),
      )
      expect(sendMessage.mock.calls[0]?.[1]).toContain('request_workflow_route')
      expect(sendMessage.mock.calls[0]?.[1]).toContain('所有用户可见文字使用中文')
      expect(parseSentMessages(ws)).toContainEqual(expect.objectContaining({
        type: 'status',
        state: 'thinking',
        verb: '正在恢复工作流工具',
      }))
      expect(parseSentMessages(ws)).not.toContainEqual(expect.objectContaining({
        type: 'error',
        code: 'WORKFLOW_PROTOCOL_TOOLS_UNAVAILABLE',
      }))
    } finally {
      conversationService.stopSession(sessionId)
    }
  })

  it('fails visibly after the one permitted protocol-tool rebind retry', async () => {
    const sessionId = `workflow-protocol-retry-exhausted-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    const session = {
      proc: { kill() {}, exited: Promise.resolve(0) },
      outputCallbacks: [] as Array<(msg: any) => void>,
      workDir: process.cwd(),
      permissionMode: 'default',
      sdkToken: 'sdk-token',
      sdkSocket: null,
      pendingOutbound: [],
      startupPending: false,
      startupExitCode: null,
      stdoutLines: [],
      stderrLines: [],
      outputDrain: Promise.resolve(),
      sdkMessages: [],
      initMessage: null,
      pendingPermissionRequests: new Map(),
    }
    ;(conversationService as any).sessions.set(sessionId, session)
    const startSession = spyOn(conversationService, 'startSession').mockImplementation(async () => {
      ;(conversationService as any).sessions.set(sessionId, { ...session, outputCallbacks: [] })
    })
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
    spyOn(conversationService, 'stopSessionAndWait').mockResolvedValue()
    spyOn(conversationService, 'getSessionWorkDir').mockReturnValue(process.cwd())
    await stateService.writeState(sessionId, makeWorkflowState(sessionId))

    try {
      handleWebSocket.open(ws)
      const callback = session.outputCallbacks[0]!
      const protocolError = {
        type: 'result',
        is_error: true,
        result: 'No such tool available: submit_phase_completion',
        usage: { input_tokens: 1, output_tokens: 1 },
      }
      callback(protocolError)
      await waitForCondition(() => startSession.mock.calls.length === 1)
      const recoveredSession = (conversationService as any).sessions.get(sessionId)
      const recoveredCallback = recoveredSession.outputCallbacks[0] as (msg: any) => void
      recoveredCallback(protocolError)

      await waitForCondition(() => parseSentMessages(ws).some((message) =>
        message.type === 'error' && message.code === 'WORKFLOW_PROTOCOL_TOOLS_UNAVAILABLE'
      ))

      expect(startSession).toHaveBeenCalledTimes(1)
      expect(sendMessage).toHaveBeenCalledTimes(1)
      expect(parseSentMessages(ws)).toContainEqual(expect.objectContaining({
        type: 'error',
        code: 'WORKFLOW_PROTOCOL_TOOLS_UNAVAILABLE',
        retryable: true,
      }))
    } finally {
      conversationService.stopSession(sessionId)
    }
  })

  it('reports a retryable protocol error when the recovered CLI cannot accept the retry instruction', async () => {
    const sessionId = `workflow-protocol-send-failed-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    const session = {
      proc: { kill() {}, exited: Promise.resolve(0) },
      outputCallbacks: [] as Array<(msg: any) => void>,
      workDir: process.cwd(),
      permissionMode: 'default',
      sdkToken: 'sdk-token',
      sdkSocket: null,
      pendingOutbound: [],
      startupPending: false,
      startupExitCode: null,
      stdoutLines: [],
      stderrLines: [],
      outputDrain: Promise.resolve(),
      sdkMessages: [],
      initMessage: null,
      pendingPermissionRequests: new Map(),
    }
    ;(conversationService as any).sessions.set(sessionId, session)
    const startSession = spyOn(conversationService, 'startSession').mockResolvedValue()
    spyOn(conversationService, 'stopSessionAndWait').mockResolvedValue()
    spyOn(conversationService, 'getSessionWorkDir').mockReturnValue(process.cwd())
    spyOn(conversationService, 'sendMessage').mockReturnValue(false)
    await stateService.writeState(sessionId, makeWorkflowState(sessionId))

    try {
      handleWebSocket.open(ws)
      session.outputCallbacks[0]!({
        type: 'result',
        is_error: true,
        result: 'No such tool available: submit_phase_completion',
        usage: { input_tokens: 1, output_tokens: 1 },
      })

      await waitForCondition(() => parseSentMessages(ws).some((message) =>
        message.type === 'error' && message.code === 'WORKFLOW_PROTOCOL_TOOLS_UNAVAILABLE'
      ))

      expect(startSession).toHaveBeenCalledTimes(1)
      expect(parseSentMessages(ws)).toContainEqual(expect.objectContaining({
        type: 'error',
        code: 'WORKFLOW_PROTOCOL_TOOLS_UNAVAILABLE',
        retryable: true,
      }))
    } finally {
      conversationService.stopSession(sessionId)
    }
  })

  it('allows one additional bounded recovery before reporting a repeated prose-only workflow end', async () => {
    const sessionId = `workflow-prose-question-repeat-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    const session = {
      proc: { kill() {}, exited: Promise.resolve(0) },
      outputCallbacks: [] as Array<(msg: any) => void>,
      workDir: process.cwd(),
      permissionMode: 'default',
      sdkToken: 'sdk-token',
      sdkSocket: null,
      pendingOutbound: [],
      startupPending: false,
      startupExitCode: null,
      stdoutLines: [],
      stderrLines: [],
      outputDrain: Promise.resolve(),
      sdkMessages: [],
      initMessage: null,
      pendingPermissionRequests: new Map(),
    }
    ;(conversationService as any).sessions.set(sessionId, session)
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
    const state = makeWorkflowState(sessionId)
    state.workflowLanguage = 'zh'
    await stateService.writeState(sessionId, state)

    try {
      handleWebSocket.open(ws)
      const callback = session.outputCallbacks[0]!
      callback({
        type: 'assistant',
        message: { content: [{ type: 'text', text: '你希望我现在继续还是暂停？' }] },
      })
      callback({ type: 'result', is_error: false, usage: { input_tokens: 1, output_tokens: 1 } })
      await waitForCondition(() => sendMessage.mock.calls.length === 1)

      callback({
        type: 'assistant',
        message: { content: [{ type: 'text', text: '那么你要我怎么做？' }] },
      })
      callback({ type: 'result', is_error: false, usage: { input_tokens: 1, output_tokens: 1 } })
      await waitForCondition(() => sendMessage.mock.calls.length === 2)

      callback({
        type: 'assistant',
        message: { content: [{ type: 'text', text: '我还需要你的决定。' }] },
      })
      callback({ type: 'result', is_error: false, usage: { input_tokens: 1, output_tokens: 1 } })

      await waitForCondition(() => parseSentMessages(ws).some((message) =>
        message.type === 'error'
        && message.code === 'WORKFLOW_TERMINAL_PROTOCOL_REQUIRED'
      ))

      expect(sendMessage).toHaveBeenCalledTimes(2)
      expect(parseSentMessages(ws)).not.toContainEqual(expect.objectContaining({ type: 'message_complete' }))
      expect(parseSentMessages(ws)).toContainEqual(expect.objectContaining({
        type: 'error',
        code: 'WORKFLOW_TERMINAL_PROTOCOL_REQUIRED',
      }))
    } finally {
      conversationService.stopSession(sessionId)
    }
  })

  it('fails visibly without message_complete when a workflow terminal recovery instruction cannot be delivered', async () => {
    const sessionId = `workflow-terminal-recovery-unavailable-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    const session = {
      proc: { kill() {}, exited: Promise.resolve(0) },
      outputCallbacks: [] as Array<(msg: any) => void>,
      workDir: process.cwd(),
      permissionMode: 'default',
      sdkToken: 'sdk-token',
      sdkSocket: null,
      pendingOutbound: [],
      startupPending: false,
      startupExitCode: null,
      stdoutLines: [],
      stderrLines: [],
      outputDrain: Promise.resolve(),
      sdkMessages: [],
      initMessage: null,
      pendingPermissionRequests: new Map(),
    }
    ;(conversationService as any).sessions.set(sessionId, session)
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(false)
    const state = makeWorkflowState(sessionId)
    state.workflowLanguage = 'zh'
    await stateService.writeState(sessionId, state)

    try {
      handleWebSocket.open(ws)
      const callback = session.outputCallbacks[0]!
      callback({
        type: 'assistant',
        message: { content: [{ type: 'text', text: '你希望我继续当前阶段还是暂停？' }] },
      })
      callback({ type: 'result', is_error: false, usage: { input_tokens: 1, output_tokens: 1 } })

      await waitForCondition(() => parseSentMessages(ws).some((message) =>
        message.type === 'error' && message.code === 'WORKFLOW_TERMINAL_RECOVERY_UNAVAILABLE'
      ))

      expect(sendMessage).toHaveBeenCalledTimes(1)
      expect(parseSentMessages(ws)).not.toContainEqual(expect.objectContaining({ type: 'message_complete' }))
      expect(parseSentMessages(ws)).toContainEqual(expect.objectContaining({
        type: 'error',
        code: 'WORKFLOW_TERMINAL_RECOVERY_UNAVAILABLE',
        retryable: true,
      }))
    } finally {
      conversationService.stopSession(sessionId)
    }
  })

  it('fails visibly when an active workflow recovery finds its CLI session gone', async () => {
    const sessionId = `workflow-terminal-recovery-no-session-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    const session = {
      proc: { kill() {}, exited: Promise.resolve(0) },
      outputCallbacks: [] as Array<(msg: any) => void>,
      workDir: process.cwd(),
      permissionMode: 'default',
      sdkToken: 'sdk-token',
      sdkSocket: null,
      pendingOutbound: [],
      startupPending: false,
      startupExitCode: null,
      stdoutLines: [],
      stderrLines: [],
      outputDrain: Promise.resolve(),
      sdkMessages: [],
      initMessage: null,
      pendingPermissionRequests: new Map(),
    }
    ;(conversationService as any).sessions.set(sessionId, session)
    await stateService.writeState(sessionId, makeWorkflowState(sessionId))

    try {
      handleWebSocket.open(ws)
      const callback = session.outputCallbacks[0]!
      conversationService.stopSession(sessionId)

      callback({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Would you like to continue or pause?' }] },
      })
      callback({ type: 'result', is_error: false, usage: { input_tokens: 1, output_tokens: 1 } })

      await waitForCondition(() => parseSentMessages(ws).some((message) =>
        message.type === 'error' && message.code === 'WORKFLOW_TERMINAL_RECOVERY_UNAVAILABLE'
      ))

      expect(parseSentMessages(ws)).toContainEqual(expect.objectContaining({
        type: 'error',
        code: 'WORKFLOW_TERMINAL_RECOVERY_UNAVAILABLE',
        retryable: true,
      }))
    } finally {
      conversationService.stopSession(sessionId)
    }
  })

  it('replays a persisted open workflow AskUserQuestion card after runtime memory is gone', async () => {
    const sessionId = `persisted-workflow-question-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    const state = makeWorkflowState(sessionId)
    const phase = state.runtimeContract!.phaseStates[state.activePhaseId!]!
    phase.issues = [{
      id: 'ask:restore-question:0',
      phaseId: phase.phaseId,
      sessionId,
      createdAt: '2026-08-06T00:00:00.000Z',
      updatedAt: '2026-08-06T00:00:00.000Z',
      source: 'ask-user-question',
      status: 'open',
      blocksCompletion: true,
      question: 'Allow B01 to create the local project skeleton?',
      blockingReason: 'B01 needs the user authorization before it can write the project skeleton.',
      questionRequestId: 'restore-question',
      questionId: 'authorize-b01',
      toolUseId: 'restore-tool-use',
      createdStateVersion: state.stateVersion,
      questionInput: {
        questions: [{
          id: 'authorize-b01',
          header: 'B01 authorization',
          question: 'Allow B01 to create the local project skeleton?',
          blocksCompletion: true,
          choices: [
            { id: 'allow', label: 'Allow (Recommended)', description: 'Create the approved local project skeleton.' },
            { id: 'pause', label: 'Pause', description: 'Keep the workflow waiting.' },
          ],
        }],
      },
    }]
    state.runStatus = 'waiting_for_user'
    await stateService.writeState(sessionId, state)

    try {
      handleWebSocket.open(ws)
      await waitForCondition(() => parseSentMessages(ws).some((message) =>
        message.type === 'permission_request' && message.requestId === 'restore-question'
      ))

      const restoredCard = parseSentMessages(ws).find((message) =>
        message.type === 'permission_request' && message.requestId === 'restore-question'
      ) as { input?: { questions?: Array<Record<string, unknown>> } } | undefined
      expect(restoredCard).toMatchObject({
        type: 'permission_request',
        requestId: 'restore-question',
        toolName: 'AskUserQuestion',
        toolUseId: 'restore-tool-use',
      })
      expect(restoredCard?.input?.questions?.[0]).toMatchObject({
        id: 'authorize-b01',
        header: 'B01 authorization',
        question: 'Allow B01 to create the local project skeleton?',
      })
    } finally {
      conversationService.stopSession(sessionId)
    }
  })

  it('keeps the live in-memory workflow question and stales a separate persisted duplicate', async () => {
    const sessionId = `live-workflow-question-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    const state = makeWorkflowState(sessionId)
    const phase = state.runtimeContract!.phaseStates[state.activePhaseId!]!
    const questionInput = {
      questions: [{
        id: 'authorize-b01',
        header: 'B01 authorization',
        question: 'Allow B01 to create the local project skeleton?',
        blocksCompletion: true,
        choices: [
          { id: 'allow', label: 'Allow (Recommended)', description: 'Create the approved project skeleton.' },
          { id: 'pause', label: 'Pause', description: 'Keep the workflow waiting.' },
        ],
      }],
    }
    phase.issues = [
      {
        id: 'ask:live-question:0',
        phaseId: phase.phaseId,
        sessionId,
        createdAt: '2026-08-06T00:00:00.000Z',
        updatedAt: '2026-08-06T00:00:00.000Z',
        source: 'ask-user-question',
        status: 'open',
        blocksCompletion: true,
        question: 'Allow B01 to create the local project skeleton?',
        blockingReason: 'B01 needs a single user authorization.',
        questionRequestId: 'live-question',
        questionId: 'authorize-b01',
        toolUseId: 'live-tool-use',
        createdStateVersion: state.stateVersion,
        questionInput,
      },
      {
        id: 'ask:duplicate-question:0',
        phaseId: phase.phaseId,
        sessionId,
        createdAt: '2026-08-06T00:00:01.000Z',
        updatedAt: '2026-08-06T00:00:01.000Z',
        source: 'ask-user-question',
        status: 'open',
        blocksCompletion: true,
        question: 'Allow B01 to create the local project skeleton?',
        blockingReason: 'This duplicate must not be replayed.',
        questionRequestId: 'duplicate-question',
        questionId: 'authorize-b01',
        toolUseId: 'duplicate-tool-use',
        createdStateVersion: state.stateVersion,
        questionInput,
      },
    ]
    await stateService.writeState(sessionId, state)
    spyOn(conversationService, 'getPendingPermissionRequests').mockReturnValue([{
      requestId: 'live-question',
      toolName: 'AskUserQuestion',
      toolUseId: 'live-tool-use',
      input: questionInput,
    }])

    try {
      handleWebSocket.open(ws)
      await waitForAsyncCondition(async () => {
        const read = await stateService.readState(sessionId)
        return read.state?.runtimeContract?.phaseStates[state.activePhaseId!]?.issues.find(
          (issue) => issue.questionRequestId === 'duplicate-question',
        )?.status === 'stale'
      })

      const restored = await stateService.readState(sessionId)
      const issues = restored.state?.runtimeContract?.phaseStates[state.activePhaseId!]?.issues ?? []
      expect(issues.find((issue) => issue.questionRequestId === 'live-question')).toMatchObject({
        status: 'open',
        blocksCompletion: true,
      })
      expect(issues.find((issue) => issue.questionRequestId === 'duplicate-question')).toMatchObject({
        status: 'stale',
        blocksCompletion: false,
      })
      expect(parseSentMessages(ws)).not.toContainEqual(expect.objectContaining({
        type: 'permission_request',
        requestId: 'duplicate-question',
      }))
    } finally {
      conversationService.stopSession(sessionId)
    }
  })

  it('persists a restored workflow answer before restarting the CLI and continuing the phase', async () => {
    const sessionId = `restored-workflow-answer-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    const state = makeWorkflowState(sessionId)
    const phase = state.runtimeContract!.phaseStates[state.activePhaseId!]!
    phase.issues = [{
      id: 'ask:restore-answer:0',
      phaseId: phase.phaseId,
      sessionId,
      createdAt: '2026-08-06T00:00:00.000Z',
      updatedAt: '2026-08-06T00:00:00.000Z',
      source: 'ask-user-question',
      status: 'open',
      blocksCompletion: true,
      question: 'Allow B01 to create the local project skeleton?',
      blockingReason: 'B01 needs the user authorization before it can write the project skeleton.',
      questionRequestId: 'restore-answer',
      questionId: 'authorize-b01',
      toolUseId: 'restore-answer-tool-use',
      createdStateVersion: state.stateVersion,
      questionInput: {
        questions: [{
          id: 'authorize-b01',
          header: 'B01 authorization',
          question: 'Allow B01 to create the local project skeleton?',
          blocksCompletion: true,
          choices: [
            { id: 'allow', label: 'Allow (Recommended)', description: 'Create the approved local project skeleton.' },
            { id: 'pause', label: 'Pause', description: 'Keep the workflow waiting.' },
          ],
        }],
      },
    }]
    state.runStatus = 'waiting_for_user'
    await stateService.writeState(sessionId, state)

    let cliStarted = false
    const hasSession = spyOn(conversationService, 'hasSession').mockImplementation(() => cliStarted)
    const startSession = spyOn(conversationService, 'startSession').mockImplementation(async () => {
      cliStarted = true
    })
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
    const respondToPermission = spyOn(conversationService, 'respondToPermission').mockReturnValue(false)
    spyOn(sessionService, 'getSessionWorkDir').mockResolvedValue(process.cwd())

    try {
      handleWebSocket.open(ws)
      await waitForCondition(() => parseSentMessages(ws).some((message) => (
        message.type === 'permission_request' && message.requestId === 'restore-answer'
      )))

      handleWebSocket.message(ws, JSON.stringify({
        type: 'permission_response',
        requestId: 'restore-answer',
        allowed: true,
        updatedInput: {
          questions: [{ id: 'authorize-b01', question: 'Allow B01 to create the local project skeleton?' }],
          answers: { 'authorize-b01': 'allow' },
        },
      }))

      await waitForCondition(() => startSession.mock.calls.length === 1 && sendMessage.mock.calls.length === 1)
      const restored = await stateService.readState(sessionId)
      expect(restored.state?.runtimeContract?.phaseStates[state.activePhaseId!]?.issues[0]).toMatchObject({
        status: 'answered-pending-processing',
        blocksCompletion: true,
        answer: expect.objectContaining({ 'authorize-b01': 'allow' }),
      })
      expect(startSession.mock.calls[0]?.[3]).toMatchObject({ workflowSessionId: sessionId })
      expect(sendMessage).toHaveBeenCalledWith(
        sessionId,
        expect.stringContaining('<workflow-persisted-question-recovery>'),
      )
      expect(respondToPermission).not.toHaveBeenCalled()
      expect(parseSentMessages(ws)).toContainEqual(expect.objectContaining({
        type: 'permission_response_ack',
        requestId: 'restore-answer',
        status: 'accepted',
      }))
      expect(hasSession).toHaveBeenCalled()
    } finally {
      conversationService.stopSession(sessionId)
    }
  })

  it('stales a legacy open workflow question with no persisted card payload instead of blocking forever', async () => {
    const sessionId = `legacy-workflow-question-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    const state = makeWorkflowState(sessionId)
    const phase = state.runtimeContract!.phaseStates[state.activePhaseId!]!
    phase.issues = [{
      id: 'ask:legacy-question:0',
      phaseId: phase.phaseId,
      sessionId,
      createdAt: '2026-08-05T16:41:23.419Z',
      updatedAt: '2026-08-05T16:41:23.419Z',
      source: 'ask-user-question',
      status: 'open',
      blocksCompletion: true,
      question: 'Allow B01 to create the local project skeleton?',
      blockingReason: 'The original question card was never answered.',
      questionRequestId: 'legacy-question',
      questionId: 'authorize-b01',
      toolUseId: 'legacy-tool-use',
      createdStateVersion: state.stateVersion,
    }]
    await stateService.writeState(sessionId, state)

    try {
      handleWebSocket.open(ws)
      await waitForAsyncCondition(async () => {
        const read = await stateService.readState(sessionId)
        return read.state?.runtimeContract?.phaseStates[state.activePhaseId!]?.issues[0]?.status === 'stale'
      })

      const restored = await stateService.readState(sessionId)
      expect(restored.state?.runtimeContract?.phaseStates[state.activePhaseId!]?.issues[0]).toMatchObject({
        status: 'stale',
        blocksCompletion: false,
      })
      expect(parseSentMessages(ws)).not.toContainEqual(expect.objectContaining({
        type: 'permission_request',
        requestId: 'legacy-question',
      }))
    } finally {
      conversationService.stopSession(sessionId)
    }
  })

  it('replays pending permission requests when a client reconnects', () => {
    const sessionId = `permission-replay-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    spyOn(conversationService, 'getPendingPermissionRequests').mockReturnValue([{
      requestId: 'perm-1',
      toolName: 'AskUserQuestion',
      toolUseId: 'tool-1',
      input: { question: 'Proceed?' },
      description: 'Workflow confirmation',
    }])

    handleWebSocket.open(ws)

    expect(parseSentMessages(ws)).toContainEqual({
      type: 'permission_request',
      requestId: 'perm-1',
      toolName: 'AskUserQuestion',
      toolUseId: 'tool-1',
      input: { question: 'Proceed?' },
      description: 'Workflow confirmation',
    })
  })

  it('does not prewarm an existing transcript session by resuming the last turn', async () => {
    const sessionId = `prewarm-existing-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const startSession = spyOn(conversationService, 'startSession').mockResolvedValue()

    spyOn(conversationService, 'hasSession').mockReturnValue(false)
    spyOn(sessionService, 'getSessionLaunchInfo').mockResolvedValue({
      filePath: path.join(os.tmpdir(), `${sessionId}.jsonl`),
      projectDir: process.cwd(),
      workDir: process.cwd(),
      transcriptMessageCount: 2,
      customTitle: null,
    })

    handleWebSocket.open(ws)
    handleWebSocket.message(ws, JSON.stringify({ type: 'prewarm_session' }))
    await flushAsyncHandlers()

    expect(startSession).not.toHaveBeenCalled()
  })
})

describe('WebSocket handler Expert research-delivery terminal recovery', () => {
  afterEach(() => {
    __resetWebSocketHandlerStateForTests()
    mock.restore()
  })

  it('displays an Expert research-delivery card even when browser audits are incomplete so the user can accept gaps', async () => {
    const sessionId = `expert-research-delivery-card-gate-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const session = {
      proc: { kill() {}, exited: Promise.resolve(0) },
      outputCallbacks: [] as Array<(msg: any) => void>,
      workDir: process.cwd(),
      permissionMode: 'default',
      sdkToken: 'sdk-token',
      sdkSocket: null,
      pendingOutbound: [],
      startupPending: false,
      startupExitCode: null,
      stdoutLines: [],
      stderrLines: [],
      outputDrain: Promise.resolve(),
      sdkMessages: [],
      initMessage: null,
      pendingPermissionRequests: new Map(),
    }
    ;(conversationService as any).sessions.set(sessionId, session)
    const respondToPermission = spyOn(conversationService, 'respondToPermission').mockReturnValue(true)
    const researchExpert: any = makeExpertRuntimeMetadata('active')
    researchExpert.expertId = 'commercialization-research-report'
    researchExpert.runtimeBinding.expertId = 'commercialization-research-report'
    researchExpert.runtimeBinding.researchDeliveryPolicy = {
      questionId: 'research-delivery:commercialization-report',
      acceptedChoiceId: 'accept_current_scope',
      continueChoiceIds: ['provide_material_and_continue'],
      pauseChoiceIds: ['pause_research'],
    }
    researchExpert.runtimeBinding.researchCompletionPolicy = {
      finalOutputBehavior: 'allow-with-evidence-gaps',
      trackedAgentTypes: ['expert-evidence-researcher', 'expert-evidence-reviewer'],
      minimumCompletedAgents: 4,
      requiredSearchEngines: ['Google', '百度', 'Bing', '360'],
      minimumDistinctSearchQueries: 2,
      minimumOpenedSpecificPublicPages: 6,
      requireConcreteSourcePerAgent: true,
    }
    researchExpert.researchCompletion = {
      updatedAt: '2026-08-07T04:03:43.000Z',
      audits: [{
        agentId: 'competitor-research',
        agentType: 'expert-evidence-researcher',
        recordedAt: '2026-08-07T04:03:43.000Z',
        entries: [{
          kind: 'search',
          searchEngine: 'Bing',
          query: 'Quicker alternatives',
          target: 'https://www.bing.com/search?q=Quicker+alternatives',
          status: 'opened',
        }],
      }],
    }
    spyOn(sessionService, 'getSession').mockResolvedValue({
      id: sessionId,
      workDir: process.cwd(),
      expert: researchExpert,
    } as Awaited<ReturnType<typeof sessionService.getSession>>)

    try {
      handleWebSocket.open(ws)
      const callback = session.outputCallbacks[0]!
      callback({
        type: 'control_request',
        request_id: 'research-delivery-user-choice-card',
        request: {
          subtype: 'can_use_tool',
          tool_name: 'AskUserQuestion',
          tool_use_id: 'research-delivery-tool',
          input: {
            questions: [{
              id: 'research-delivery:commercialization-report',
              prompt: '调研与独立复核已完成。接受当前证据范围并生成最终报告吗？',
              choices: [
                { id: 'accept_current_scope', label: '接受当前证据范围，生成报告' },
                { id: 'provide_material_and_continue', label: '补充材料后继续' },
                { id: 'pause_research', label: '暂停' },
              ],
              metadata: { question_id: 'research-delivery:commercialization-report' },
            }],
            metadata: {
              expert_research_delivery: {
                question_id: 'research-delivery:commercialization-report',
                unresolved_evidence: ['Google search not recorded'],
              },
            },
          },
        },
      })

      await waitForCondition(() => parseSentMessages(ws).some((msg) =>
        msg.type === 'permission_request' && msg.requestId === 'research-delivery-user-choice-card',
      ))

      expect(respondToPermission).not.toHaveBeenCalled()
      expect(parseSentMessages(ws)).toContainEqual(expect.objectContaining({
        type: 'permission_request',
        requestId: 'research-delivery-user-choice-card',
        toolName: 'AskUserQuestion',
      }))
      expect(parseSentMessages(ws)).not.toContainEqual(expect.objectContaining({
        type: 'error',
        code: 'EXPERT_RESEARCH_DELIVERY_PREMATURE',
      }))
    } finally {
      conversationService.stopSession(sessionId)
    }
  })

  it('continues an audited Expert research turn that ends before a delivery card or report', async () => {
    const sessionId = `expert-research-delivery-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const session = {
      proc: { kill() {}, exited: Promise.resolve(0) },
      outputCallbacks: [] as Array<(msg: any) => void>,
      workDir: process.cwd(),
      permissionMode: 'default',
      sdkToken: 'sdk-token',
      sdkSocket: null,
      pendingOutbound: [],
      startupPending: false,
      startupExitCode: null,
      stdoutLines: [],
      stderrLines: [],
      outputDrain: Promise.resolve(),
      sdkMessages: [],
      initMessage: null,
      pendingPermissionRequests: new Map(),
    }
    ;(conversationService as any).sessions.set(sessionId, session)
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
    const researchExpert: any = makeExpertRuntimeMetadata('active')
    researchExpert.expertId = 'commercialization-research-report'
    researchExpert.runtimeBinding.expertId = 'commercialization-research-report'
    researchExpert.runtimeBinding.researchDeliveryPolicy = {
      questionId: 'research-delivery:commercialization-report',
      acceptedChoiceId: 'accept_current_scope',
      continueChoiceIds: ['provide_material_and_continue'],
      pauseChoiceIds: ['pause_research'],
    }
    researchExpert.runtimeBinding.researchCompletionPolicy = {
      finalOutputBehavior: 'allow-with-evidence-gaps',
      trackedAgentTypes: ['expert-evidence-researcher', 'expert-evidence-reviewer'],
      minimumCompletedAgents: 4,
      requiredSearchEngines: ['Google', '百度', 'Bing', '360'],
      minimumDistinctSearchQueries: 2,
      minimumOpenedSpecificPublicPages: 6,
      requireConcreteSourcePerAgent: true,
    }
    researchExpert.researchCompletion = {
      updatedAt: '2026-08-06T00:01:00.000Z',
      audits: [{
        agentId: 'competitor-research',
        agentType: 'expert-evidence-researcher',
        recordedAt: '2026-08-06T00:01:00.000Z',
        entries: [{
          kind: 'search',
          searchEngine: 'Bing',
          query: 'Quicker alternatives',
          target: 'https://www.bing.com/search?q=Quicker+alternatives',
          status: 'opened',
        }],
      }],
    }
    spyOn(sessionService, 'getSession').mockResolvedValue({
      id: sessionId,
      workDir: process.cwd(),
      expert: researchExpert,
    } as Awaited<ReturnType<typeof sessionService.getSession>>)

    try {
      handleWebSocket.open(ws)
      const callback = session.outputCallbacks[0]!
      callback({
        type: 'assistant',
        message: {
          content: [{
            type: 'text',
            text: '第一轮公开取证和独立复核已完成，但仍有市场和渠道证据缺口。',
          }],
        },
      })
      callback({ type: 'result', is_error: false, usage: { input_tokens: 1, output_tokens: 1 } })

      await waitForCondition(() => sendMessage.mock.calls.some(([calledSessionId, content]) =>
        calledSessionId === sessionId
        && typeof content === 'string'
        && content.includes('<expert-research-delivery-terminal-recovery>'),
      ))

      expect(sendMessage).toHaveBeenCalledWith(
        sessionId,
        expect.stringContaining('用户的最终选择优先'),
      )
      expect(sendMessage).toHaveBeenCalledWith(
        sessionId,
        expect.stringContaining('research-delivery:commercialization-report'),
      )
      expect(parseSentMessages(ws)).not.toContainEqual(expect.objectContaining({ type: 'message_complete' }))
      expect(parseSentMessages(ws)).toContainEqual(expect.objectContaining({
        type: 'status',
        state: 'thinking',
        verb: '正在继续补证或准备交付确认',
      }))
    } finally {
      conversationService.stopSession(sessionId)
    }
  })

  it('fails visibly instead of looping after one Expert research-delivery recovery turn', async () => {
    const sessionId = `expert-research-delivery-repeat-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const session = {
      proc: { kill() {}, exited: Promise.resolve(0) },
      outputCallbacks: [] as Array<(msg: any) => void>,
      workDir: process.cwd(),
      permissionMode: 'default',
      sdkToken: 'sdk-token',
      sdkSocket: null,
      pendingOutbound: [],
      startupPending: false,
      startupExitCode: null,
      stdoutLines: [],
      stderrLines: [],
      outputDrain: Promise.resolve(),
      sdkMessages: [],
      initMessage: null,
      pendingPermissionRequests: new Map(),
    }
    ;(conversationService as any).sessions.set(sessionId, session)
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
    const researchExpert: any = makeExpertRuntimeMetadata('active')
    researchExpert.expertId = 'commercialization-research-report'
    researchExpert.runtimeBinding.expertId = 'commercialization-research-report'
    researchExpert.runtimeBinding.researchDeliveryPolicy = {
      questionId: 'research-delivery:commercialization-report',
      acceptedChoiceId: 'accept_current_scope',
      continueChoiceIds: ['provide_material_and_continue'],
      pauseChoiceIds: ['pause_research'],
    }
    researchExpert.runtimeBinding.researchCompletionPolicy = {
      finalOutputBehavior: 'allow-with-evidence-gaps',
      trackedAgentTypes: ['expert-evidence-researcher', 'expert-evidence-reviewer'],
      minimumCompletedAgents: 4,
      requiredSearchEngines: ['Google', '百度', 'Bing', '360'],
      minimumDistinctSearchQueries: 2,
      minimumOpenedSpecificPublicPages: 6,
      requireConcreteSourcePerAgent: true,
    }
    researchExpert.researchCompletion = {
      updatedAt: '2026-08-06T00:01:00.000Z',
      audits: [{
        agentId: 'competitor-research',
        agentType: 'expert-evidence-researcher',
        recordedAt: '2026-08-06T00:01:00.000Z',
        entries: [{
          kind: 'search',
          searchEngine: 'Bing',
          query: 'Quicker alternatives',
          target: 'https://www.bing.com/search?q=Quicker+alternatives',
          status: 'opened',
        }],
      }],
    }
    spyOn(sessionService, 'getSession').mockResolvedValue({
      id: sessionId,
      workDir: process.cwd(),
      expert: researchExpert,
    } as Awaited<ReturnType<typeof sessionService.getSession>>)

    try {
      handleWebSocket.open(ws)
      const callback = session.outputCallbacks[0]!
      callback({ type: 'assistant', message: { content: [{ type: 'text', text: '第一轮取证结束。' }] } })
      callback({ type: 'result', is_error: false, usage: { input_tokens: 1, output_tokens: 1 } })
      await waitForCondition(() => sendMessage.mock.calls.length === 1)

      callback({ type: 'assistant', message: { content: [{ type: 'text', text: '第二轮仍然只做阶段总结。' }] } })
      callback({ type: 'result', is_error: false, usage: { input_tokens: 1, output_tokens: 1 } })
      await waitForCondition(() => parseSentMessages(ws).some((message) =>
        message.type === 'error'
        && message.code === 'EXPERT_RESEARCH_DELIVERY_PROTOCOL_REQUIRED',
      ))

      expect(sendMessage).toHaveBeenCalledTimes(1)
      expect(parseSentMessages(ws)).not.toContainEqual(expect.objectContaining({ type: 'message_complete' }))
    } finally {
      conversationService.stopSession(sessionId)
    }
  })
})
describe('WebSocket handler workflow runtime gating', () => {
  afterEach(() => {
    __resetWebSocketHandlerStateForTests()
    mock.restore()
  })

  it('sends a friendly workflow welcome before the first user turn without starting the phase', async () => {
    const sessionId = `workflow-welcome-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
    spyOn(conversationService, 'startSession').mockResolvedValue()
    spyOn(conversationService, 'hasSession').mockReturnValue(false)
    spyOn(conversationService, 'onOutput').mockImplementation(() => {})
    spyOn(conversationService, 'clearOutputCallbacks').mockImplementation(() => {})
    spyOn(sessionService, 'getSession').mockResolvedValue({
      id: sessionId,
      workDir: process.cwd(),
      workflow: {
        mode: 'workflow',
        templateId: 'requirements-to-implementation',
        templateSource: 'builtin',
        templateVersion: '1',
        templateName: 'Requirements to Implementation',
        status: 'created',
        activePhaseId: 'requirements-clarification',
        activePhaseName: 'Requirements Clarification',
        phaseCount: 2,
        completedPhaseCount: 0,
        updatedAt: '2026-05-20T00:00:00.000Z',
      },
    } as Awaited<ReturnType<typeof sessionService.getSession>>)
    await stateService.writeState(sessionId, makeCreatedWorkflowState(sessionId))

    handleWebSocket.open(ws)
    await waitForCondition(() => parseSentMessages(ws).some((message) =>
      message.type === 'system_notification' && message.subtype === 'workflow_welcome'
    ))

    const welcome = parseSentMessages(ws).find((message) =>
      message.type === 'system_notification' && message.subtype === 'workflow_welcome'
    )
    expect(welcome?.message).toContain('Requirements to Implementation')
    expect(welcome?.message).toContain('你一发消息')
    expect(welcome?.message).toContain('第一阶段')
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('does not send the pre-start workflow welcome after the workflow is already running', async () => {
    const sessionId = `workflow-running-no-welcome-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    spyOn(sessionService, 'getSession').mockResolvedValue({
      id: sessionId,
      workDir: process.cwd(),
      workflow: {
        mode: 'workflow',
        templateId: 'requirements-to-implementation',
        templateSource: 'builtin',
        templateVersion: '1',
        templateName: 'Requirements to Implementation',
        status: 'running',
        activePhaseId: 'requirements-clarification',
        activePhaseName: 'Requirements Clarification',
        phaseCount: 2,
        completedPhaseCount: 0,
        updatedAt: '2026-05-20T00:00:00.000Z',
      },
    } as Awaited<ReturnType<typeof sessionService.getSession>>)
    await stateService.writeState(sessionId, makeWorkflowState(sessionId))

    handleWebSocket.open(ws)
    await flushAsyncHandlers()

    expect(parseSentMessages(ws).some((message) =>
      message.type === 'system_notification' && message.subtype === 'workflow_welcome'
    )).toBe(false)
  })

  it('preserves normal dialogue user turns without workflow prompt text or workflow notifications', async () => {
    const sessionId = `dialogue-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
    spyOn(conversationService, 'hasSession').mockReturnValue(true)
    spyOn(conversationService, 'onOutput').mockImplementation(() => {})
    spyOn(conversationService, 'clearOutputCallbacks').mockImplementation(() => {})
    spyOn(sessionService, 'getCustomTitle').mockResolvedValue(null)

    handleWebSocket.open(ws)
    handleWebSocket.message(ws, JSON.stringify({
      type: 'user_message',
      content: 'Keep this as a normal chat turn.',
    }))
    await flushAsyncHandlers()

    expect(sendMessage).toHaveBeenCalledWith(
      sessionId,
      'Keep this as a normal chat turn.',
      undefined,
    )
    expect(sendMessage.mock.calls[0]?.[1]).not.toContain('Workflow mode')
    expect(sendMessage.mock.calls[0]?.[1]).not.toContain('Active phase')
    expect(parseSentMessages(ws).some((message) =>
      message.type === 'system_notification'
      && typeof message.subtype === 'string'
      && message.subtype.startsWith('workflow_')
    )).toBe(false)
  })

  it('keeps active Expert Runtime hidden from the visible user turn', async () => {
    const sessionId = `expert-runtime-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
    spyOn(conversationService, 'hasSession').mockReturnValue(true)
    spyOn(conversationService, 'onOutput').mockImplementation(() => {})
    spyOn(conversationService, 'clearOutputCallbacks').mockImplementation(() => {})
    spyOn(sessionService, 'getCustomTitle').mockResolvedValue(null)
    spyOn(sessionService, 'getSession').mockResolvedValue({
      id: sessionId,
      workDir: process.cwd(),
      expert: makeExpertRuntimeMetadata('active'),
    } as Awaited<ReturnType<typeof sessionService.getSession>>)

    handleWebSocket.open(ws)
    handleWebSocket.message(ws, JSON.stringify({
      type: 'user_message',
      content: 'Please inspect the project health.',
    }))
    await waitForCondition(() => sendMessage.mock.calls.length > 0)

    expect(sendMessage.mock.calls[0]?.[1]).toBe('Please inspect the project health.')
  })

  it('rejects an active Expert Mode turn when the runtime binding is missing', async () => {
    const sessionId = `expert-runtime-missing-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
    spyOn(conversationService, 'hasSession').mockReturnValue(true)
    spyOn(conversationService, 'onOutput').mockImplementation(() => {})
    spyOn(conversationService, 'clearOutputCallbacks').mockImplementation(() => {})
    spyOn(sessionService, 'getCustomTitle').mockResolvedValue(null)
    spyOn(sessionService, 'getSession').mockResolvedValue({
      id: sessionId,
      workDir: process.cwd(),
      expert: {
        ...makeExpertRuntimeMetadata('active'),
        runtimeBinding: undefined,
      },
    } as Awaited<ReturnType<typeof sessionService.getSession>>)

    handleWebSocket.open(ws)
    handleWebSocket.message(ws, JSON.stringify({
      type: 'user_message',
      content: 'Please inspect the project health.',
    }))
    await flushAsyncHandlers()

    expect(sendMessage).not.toHaveBeenCalled()
    expect(parseSentMessages(ws)).toContainEqual(expect.objectContaining({
      type: 'error',
      code: 'EXPERT_RUNTIME_BINDING_MISSING',
    }))
  })

  it('injects an ordinary-chat reset after Expert Mode has exited', async () => {
    const sessionId = `expert-runtime-exited-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
    spyOn(conversationService, 'hasSession').mockReturnValue(true)
    spyOn(conversationService, 'onOutput').mockImplementation(() => {})
    spyOn(conversationService, 'clearOutputCallbacks').mockImplementation(() => {})
    spyOn(sessionService, 'getCustomTitle').mockResolvedValue(null)
    spyOn(sessionService, 'getSession').mockResolvedValue({
      id: sessionId,
      workDir: process.cwd(),
      expert: makeExpertRuntimeMetadata('exited'),
    } as Awaited<ReturnType<typeof sessionService.getSession>>)

    handleWebSocket.open(ws)
    handleWebSocket.message(ws, JSON.stringify({
      type: 'user_message',
      content: 'Continue as normal chat.',
    }))
    await waitForCondition(() => sendMessage.mock.calls.length > 0)

    const resetTurn = sendMessage.mock.calls[0]?.[1] ?? ''
    expect(resetTurn).toContain('<runtime-mode-reset>')
    expect(resetTurn).toContain('Expert Mode is exited')
    expect(resetTurn).toContain('Continue as normal chat.')
    expect(resetTurn).not.toContain('<expert-runtime>')
  })

  it('sends an authoritative workflow state snapshot when a running workflow client reconnects', async () => {
    const sessionId = `workflow-reconnect-${crypto.randomUUID()}`
    const first = makeClientSocket(sessionId)
    const reconnected = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    const state = makeWorkflowState(sessionId)
    state.status = 'pending-confirmation'
    state.workflowStatus = 'pending-confirmation'
    state.runStatus = 'waiting_for_user'
    state.pendingConfirmation = {
      status: 'pending',
      phaseId: 'requirements-clarification',
      nextPhaseId: 'technical-design',
      stateVersion: state.stateVersion,
      createdAt: '2026-05-20T00:00:00.000Z',
    }
    await stateService.writeState(sessionId, state)

    handleWebSocket.open(first)
    handleWebSocket.close(first, 1006, 'network interrupted')
    handleWebSocket.open(reconnected)
    await waitForCondition(() => parseSentMessages(reconnected).some((message) =>
      message.type === 'system_notification' && message.subtype === 'workflow_state'
    ))

    const snapshots = parseSentMessages(reconnected).filter((message) =>
      message.type === 'system_notification' && message.subtype === 'workflow_state'
    )
    expect(snapshots).toContainEqual(expect.objectContaining({
      data: expect.objectContaining({
        mode: 'workflow',
        status: 'pending-confirmation',
        runStatus: 'waiting_for_user',
        activePhaseId: 'requirements-clarification',
        stateVersion: state.stateVersion,
        pendingConfirmation: true,
      }),
    }))
    expect(parseSentMessages(reconnected)).not.toContainEqual(expect.objectContaining({
      type: 'system_notification',
      subtype: 'workflow_welcome',
    }))
  })

  it('assembles workflow-only phase guidance before sending a workflow session user turn', async () => {
    const sessionId = `workflow-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
    spyOn(conversationService, 'startSession').mockResolvedValue()
    spyOn(conversationService, 'stopSession').mockImplementation(() => {})
    spyOn(conversationService, 'hasSession').mockReturnValue(true)
    spyOn(conversationService, 'onOutput').mockImplementation(() => {})
    spyOn(conversationService, 'clearOutputCallbacks').mockImplementation(() => {})
    spyOn(conversationService, 'getSessionWorkDir').mockReturnValue(process.cwd())
    spyOn(sessionService, 'getSessionWorkDir').mockResolvedValue(process.cwd())
    spyOn(sessionService, 'getCustomTitle').mockResolvedValue(null)
    spyOn(sessionService, 'getSession').mockResolvedValue({
      id: sessionId,
      title: 'Workflow session',
      createdAt: '2026-05-20T00:00:00.000Z',
      modifiedAt: '2026-05-20T00:00:00.000Z',
      messageCount: 1,
      projectPath: process.cwd(),
      projectRoot: null,
      workDir: process.cwd(),
      workDirExists: true,
      messages: [],
      expert: makeExpertRuntimeMetadata('active'),
      workflow: {
        mode: 'workflow',
        schemaVersion: 1,
        templateId: 'requirements-to-implementation',
        templateSource: 'builtin',
        templateVersion: '1',
        templateSnapshotId: 'snapshot-1',
        workflowStatus: 'running',
        status: 'running',
        activePhaseId: 'requirements-clarification',
        statePointer: {
          kind: 'workflow-state',
          sessionId,
          artifactId: 'state',
          schemaVersion: 1,
          createdAt: '2026-05-20T00:00:00.000Z',
        },
        updatedAt: '2026-05-20T00:00:00.000Z',
      },
    })

    await stateService.writeState(sessionId, makeWorkflowState(sessionId))

    handleWebSocket.open(ws)
    handleWebSocket.message(ws, JSON.stringify({
      type: 'set_runtime_config',
      providerId: null,
      modelId: 'main-session-sonnet',
    }))
    handleWebSocket.message(ws, JSON.stringify({
      type: 'user_message',
      content: 'Start the next workflow step.',
    }))
    await waitForCondition(() => {
      const prompt = sendMessage.mock.calls[0]?.[1] ?? ''
      return typeof prompt === 'string' && prompt.includes('Workflow mode')
    })

    const workflowPrompt = sendMessage.mock.calls[0]?.[1] ?? ''
    expect(workflowPrompt).toContain('Workflow mode')
    expect(workflowPrompt).toContain('requirements-clarification')
    expect(workflowPrompt).toContain('completion criteria')
    expect(workflowPrompt).toContain('Start the next workflow step.')
    expect(workflowPrompt).not.toContain('<expert-runtime>')
    expect(workflowPrompt).not.toContain('Repository health review')
    expect(parseSentMessages(ws)).toContainEqual(expect.objectContaining({
      type: 'system_notification',
      subtype: 'workflow_state',
    }))
  })

  it('persists fallback model provenance and includes phase prompt and skill guidance in workflow prompts', async () => {
    const sessionId = `workflow-fallback-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
    spyOn(conversationService, 'startSession').mockResolvedValue()
    spyOn(conversationService, 'stopSession').mockImplementation(() => {})
    const appendSessionMetadata = spyOn(sessionService, 'appendSessionMetadata').mockResolvedValue()
    spyOn(conversationService, 'hasSession').mockReturnValue(true)
    spyOn(conversationService, 'onOutput').mockImplementation(() => {})
    spyOn(conversationService, 'clearOutputCallbacks').mockImplementation(() => {})
    spyOn(conversationService, 'getSessionWorkDir').mockReturnValue(process.cwd())
    spyOn(sessionService, 'getSessionWorkDir').mockResolvedValue(process.cwd())
    spyOn(sessionService, 'getCustomTitle').mockResolvedValue(null)
    spyOn(sessionService, 'getSession').mockResolvedValue({
      id: sessionId,
      title: 'Workflow session',
      createdAt: '2026-05-20T00:00:00.000Z',
      modifiedAt: '2026-05-20T00:00:00.000Z',
      messageCount: 1,
      projectPath: process.cwd(),
      projectRoot: null,
      workDir: process.cwd(),
      workDirExists: true,
      messages: [],
      workflow: {
        mode: 'workflow',
        schemaVersion: 1,
        templateId: 'requirements-to-implementation',
        templateSource: 'builtin',
        templateVersion: '1',
        templateSnapshotId: 'snapshot-1',
        workflowStatus: 'running',
        status: 'running',
        activePhaseId: 'requirements-clarification',
        statePointer: {
          kind: 'workflow-state',
          sessionId,
          artifactId: 'state',
          schemaVersion: 1,
          createdAt: '2026-05-20T00:00:00.000Z',
        },
        updatedAt: '2026-05-20T00:00:00.000Z',
      },
    })
    await stateService.writeState(sessionId, makeWorkflowPromptState(sessionId))

    handleWebSocket.open(ws)
    handleWebSocket.message(ws, JSON.stringify({
      type: 'set_runtime_config',
      providerId: null,
      modelId: 'main-session-sonnet',
    }))
    handleWebSocket.message(ws, JSON.stringify({
      type: 'user_message',
      content: 'Continue the workflow.',
    }))
    await waitForCondition(() => {
      const prompt = sendMessage.mock.calls[0]?.[1] ?? ''
      return typeof prompt === 'string' && prompt.includes('Phase instructions:')
    })

    const workflowPrompt = sendMessage.mock.calls[0]?.[1] ?? ''
    expect(workflowPrompt).toContain('Phase instructions: Clarify the user-visible requirements before implementation.')
    expect(workflowPrompt).toContain('Phase handoff protocol')
    expect(workflowPrompt).toContain('Completion and stop rules:')
    expect(workflowPrompt).toContain('Skill guidance:')
    expect(workflowPrompt).toContain('Use requirements-review skill guidance from the workflow template.')
    expect(workflowPrompt).toContain('Requested model: phase-opus')
    expect(workflowPrompt).toContain('Actual model: main-session-sonnet')
    expect(workflowPrompt).toContain('Model fallback:')

    const workflowStates = parseSentMessages(ws).filter((message) =>
      message.type === 'system_notification'
      && message.subtype === 'workflow_state'
    )
    expect(workflowStates[0]).toMatchObject({
      data: {
        model: {
          requestedModel: 'phase-opus',
          actualModel: 'main-session-sonnet',
          providerId: null,
          source: 'main-session-default',
          fallbackApplied: true,
          fallbackReason: expect.stringContaining('phase-opus'),
        },
      },
    })
    expect(appendSessionMetadata).toHaveBeenCalledWith(sessionId, expect.objectContaining({
      workflow: expect.objectContaining({
        model: expect.objectContaining({
          providerId: null,
          source: 'main-session-default',
          fallbackApplied: true,
        }),
      }),
    }))

    const persisted = await stateService.readState(sessionId)
    expect(persisted.state?.activeModelResolution).toMatchObject({
      requestedModel: 'phase-opus',
      actualModel: 'main-session-sonnet',
      providerId: null,
      source: 'main-session-default',
      fallbackApplied: true,
    })
  })

  it('blocks workflow prompt dispatch without phase advancement when no fallback model resolves', async () => {
    const sessionId = `workflow-no-model-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    const originalConfigDir = process.env.CLAUDE_CONFIG_DIR
    const tempConfigDir = path.join(os.tmpdir(), `cc-jiangxia-websocket-no-model-${crypto.randomUUID()}`)
    process.env.CLAUDE_CONFIG_DIR = tempConfigDir
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
    spyOn(conversationService, 'hasSession').mockReturnValue(true)
    spyOn(conversationService, 'onOutput').mockImplementation(() => {})
    spyOn(conversationService, 'clearOutputCallbacks').mockImplementation(() => {})
    spyOn(sessionService, 'getCustomTitle').mockResolvedValue(null)
    spyOn(sessionService, 'getSession').mockResolvedValue({
      id: sessionId,
      title: 'Workflow session',
      createdAt: '2026-05-20T00:00:00.000Z',
      modifiedAt: '2026-05-20T00:00:00.000Z',
      messageCount: 1,
      projectPath: process.cwd(),
      projectRoot: null,
      workDir: process.cwd(),
      workDirExists: true,
      messages: [],
      workflow: {
        mode: 'workflow',
        schemaVersion: 1,
        templateId: 'requirements-to-implementation',
        templateSource: 'builtin',
        templateVersion: '1',
        templateSnapshotId: 'snapshot-1',
        workflowStatus: 'running',
        status: 'running',
        activePhaseId: 'requirements-clarification',
        statePointer: {
          kind: 'workflow-state',
          sessionId,
          artifactId: 'state',
          schemaVersion: 1,
          createdAt: '2026-05-20T00:00:00.000Z',
        },
        updatedAt: '2026-05-20T00:00:00.000Z',
      },
    })
    try {
      await stateService.writeState(sessionId, makeWorkflowPromptState(sessionId))

      handleWebSocket.open(ws)
      handleWebSocket.message(ws, JSON.stringify({
        type: 'user_message',
        content: 'Continue the workflow.',
      }))
      await waitForCondition(() => parseSentMessages(ws).some((message) =>
        message.type === 'system_notification'
        && message.subtype === 'workflow_blocked'
      ))

      expect(sendMessage).not.toHaveBeenCalled()
      const workflowStates = parseSentMessages(ws).filter((message) =>
        message.type === 'system_notification'
        && message.subtype === 'workflow_state'
      )
      expect(workflowStates[0]).toMatchObject({
        data: {
          status: 'failed',
          activePhaseId: 'requirements-clarification',
          activePhaseIndex: 0,
          blockedReason: expect.stringContaining('phase-opus'),
          model: {
            requestedModel: 'phase-opus',
            actualModel: null,
            source: 'none',
            fallbackApplied: false,
          },
        },
      })
    } finally {
      if (originalConfigDir === undefined) {
        delete process.env.CLAUDE_CONFIG_DIR
      } else {
        process.env.CLAUDE_CONFIG_DIR = originalConfigDir
      }
      await fs.rm(tempConfigDir, { recursive: true, force: true })
    }
  })

  it('starts workflow leaders with a stable tool pool and phase-neutral binding', async () => {
    const sessionId = `workflow-launch-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const startSession = spyOn(conversationService, 'startSession').mockResolvedValue()
    spyOn(conversationService, 'hasSession').mockReturnValue(false)
    spyOn(conversationService, 'onOutput').mockImplementation(() => {})
    spyOn(conversationService, 'clearOutputCallbacks').mockImplementation(() => {})
    spyOn(sessionService, 'getSessionLaunchInfo').mockResolvedValue(null)
    spyOn(sessionService, 'getSessionWorkDir').mockResolvedValue(process.cwd())
    spyOn(sessionService, 'getCustomTitle').mockResolvedValue(null)
    spyOn(sessionService, 'getSession').mockResolvedValue({
      id: sessionId,
      title: 'Workflow session',
      createdAt: '2026-05-20T00:00:00.000Z',
      modifiedAt: '2026-05-20T00:00:00.000Z',
      messageCount: 1,
      projectPath: process.cwd(),
      projectRoot: null,
      workDir: process.cwd(),
      workDirExists: true,
      messages: [],
      workflow: {
        mode: 'workflow',
        schemaVersion: 1,
        templateId: 'requirements-to-implementation',
        templateSource: 'builtin',
        templateVersion: '1',
        templateSnapshotId: 'snapshot-1',
        workflowStatus: 'running',
        status: 'running',
        activePhaseId: 'requirements-clarification',
        statePointer: {
          kind: 'workflow-state',
          sessionId,
          artifactId: 'state',
          schemaVersion: 1,
          createdAt: '2026-05-20T00:00:00.000Z',
        },
        updatedAt: '2026-05-20T00:00:00.000Z',
      },
    })

    handleWebSocket.open(ws)
    handleWebSocket.message(ws, JSON.stringify({
      type: 'set_runtime_config',
      providerId: null,
      modelId: 'main-session-sonnet',
    }))
    handleWebSocket.message(ws, JSON.stringify({
      type: 'user_message',
      content: 'Clarify requirements first.',
    }))
    await waitForCondition(() => startSession.mock.calls.length > 0)

    expect(startSession).toHaveBeenCalled()
    const disallowedTools = startSession.mock.calls[0]?.[3]?.disallowedTools ?? []
    expect(disallowedTools).not.toEqual(expect.arrayContaining([
      'Write',
      'Edit',
      'MultiEdit',
      'NotebookEdit',
    ]))
    const workflowSystemPrompt = startSession.mock.calls[0]?.[3]?.workflowSystemPrompt ?? ''
    expect(workflowSystemPrompt).toContain('Phase-specific instructions are supplied only by the latest Desktop workflow control turn.')
    expect(workflowSystemPrompt).not.toContain('active phase requirements-clarification')
  })

  for (const workflow of [
    {
      name: 'development',
      templateId: 'efficient-constrained-dev-debug-workflow-v5',
      phaseId: 'route-context',
      toolPolicy: {
        allowedTools: ['Read', 'Glob', 'Grep', 'LS', 'AskUserQuestion', 'workflow_template_authoring', 'submit_phase_completion', 'request_workflow_route'],
        disallowedTools: ['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'PowerShell', 'Agent'],
      },
    },
    {
      // Match the shipped Debug ZIP: Stage 1 is read/artifact/question-only.
      name: 'debug repair',
      templateId: 'debug-repair-workflow-v8',
      phaseId: 'debug-memory-intake',
      runtimeContract: {
        allowedActions: ['read', 'artifact', 'question'],
        forbiddenActions: ['production edits', 'dependency installs', 'migrations', 'deletes', 'deploy'],
      },
    },
    {
      // Match the shipped Feature Extension ZIP: Stage 1 also permits search.
      name: 'feature extension',
      templateId: 'feature-extension-workflow-v8',
      phaseId: 'feature-memory-plan',
      runtimeContract: {
        allowedActions: ['read', 'search', 'artifact', 'question'],
        forbiddenActions: ['production edits', 'dependency installs', 'migrations', 'deletes', 'deploy'],
      },
    },
  ]) {
    it(`rebinds an existing CLI to ${workflow.name} follow-up workflow protocol tools`, async () => {
      const sessionId = `workflow-follow-up-rebind-${workflow.name.replaceAll(' ', '-')}-${crypto.randomUUID()}`
      const ws = makeClientSocket(sessionId)
      const stopSessionAndWait = spyOn(conversationService, 'stopSessionAndWait').mockResolvedValue()
      const startSession = spyOn(conversationService, 'startSession').mockResolvedValue()
      const onOutput = spyOn(conversationService, 'onOutput').mockImplementation(() => {})
      spyOn(conversationService, 'removeOutputCallback').mockImplementation(() => {})
      spyOn(conversationService, 'hasSession').mockReturnValue(true)
      spyOn(conversationService, 'getSessionWorkDir').mockReturnValue(process.cwd())

      handleWebSocket.open(ws)
      onOutput.mockClear()

      const result = await refreshWorkflowRuntimeBinding(
        sessionId,
        makeFollowUpWorkflowStageOneState(sessionId, workflow),
      )

      expect(result).toEqual({ status: 'restarted' })
      expect(stopSessionAndWait).toHaveBeenCalledWith(sessionId)
      expect(startSession).toHaveBeenCalledTimes(1)
      expect(startSession.mock.calls[0]?.[3]).toMatchObject({
        workflowSessionId: sessionId,
      })
      const disallowedTools = startSession.mock.calls[0]?.[3]?.disallowedTools ?? []
      for (const toolName of ['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'PowerShell', 'Agent']) {
        expect(disallowedTools).not.toContain(toolName)
      }
      expect(disallowedTools).not.toEqual(expect.arrayContaining([
        'submit_phase_completion',
        'request_workflow_route',
      ]))
      expect(onOutput).toHaveBeenCalledWith(sessionId, expect.any(Function))
    })
  }

  it('waits for an in-flight prewarm before rebinding its CLI to workflow protocol tools', async () => {
    const sessionId = `workflow-prewarm-rebind-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    let hasSession = false
    let releaseStartup: (() => void) | undefined
    const startupGate = new Promise<void>((resolve) => {
      releaseStartup = resolve
    })
    const startSession = spyOn(conversationService, 'startSession').mockImplementation(async () => {
      await startupGate
      hasSession = true
    })
    const stopSessionAndWait = spyOn(conversationService, 'stopSessionAndWait').mockImplementation(async () => {
      hasSession = false
    })
    spyOn(conversationService, 'hasSession').mockImplementation(() => hasSession)
    spyOn(conversationService, 'getSessionWorkDir').mockReturnValue(process.cwd())
    spyOn(conversationService, 'onOutput').mockImplementation(() => {})
    spyOn(sessionService, 'getSessionWorkDir').mockResolvedValue(process.cwd())
    spyOn(sessionService, 'getSessionLaunchInfo').mockResolvedValue(null)

    handleWebSocket.open(ws)
    handleWebSocket.message(ws, JSON.stringify({ type: 'prewarm_session' }))
    await waitForCondition(() => startSession.mock.calls.length === 1)

    const rebind = refreshWorkflowRuntimeBinding(
      sessionId,
      makeFollowUpWorkflowStageOneState(sessionId, {
        templateId: 'feature-extension-workflow-v8',
        phaseId: 'feature-memory-plan',
        runtimeContract: {
          allowedActions: ['read', 'search', 'artifact', 'question'],
          forbiddenActions: ['production edits'],
        },
      }),
    )

    await flushAsyncHandlers()
    releaseStartup?.()
    await expect(rebind).resolves.toEqual({ status: 'restarted' })
    expect(stopSessionAndWait).toHaveBeenCalledWith(sessionId)
    expect(startSession).toHaveBeenCalledTimes(2)
    expect(startSession.mock.calls[1]?.[3]).toMatchObject({
      workflowSessionId: sessionId,
    })
  })

  it('fails closed when an existing CLI cannot be rebound to a follow-up workflow', async () => {
    const sessionId = `workflow-follow-up-rebind-failure-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stopSessionAndWait = spyOn(conversationService, 'stopSessionAndWait').mockResolvedValue()
    const startSession = spyOn(conversationService, 'startSession').mockRejectedValue(new Error('replacement CLI failed'))
    spyOn(conversationService, 'hasSession').mockReturnValue(true)
    spyOn(conversationService, 'getSessionWorkDir').mockReturnValue(process.cwd())

    handleWebSocket.open(ws)
    const result = await refreshWorkflowRuntimeBinding(
      sessionId,
      makeFollowUpWorkflowStageOneState(sessionId, {
        templateId: 'debug-repair-workflow-v8',
        phaseId: 'debug-memory-intake',
        toolPolicy: { allowedTools: ['request_workflow_route'] },
      }),
    )

    expect(result).toEqual({ status: 'restart-failed' })
    expect(stopSessionAndWait).toHaveBeenCalledWith(sessionId)
    expect(startSession).toHaveBeenCalledTimes(1)
    expect(parseSentMessages(ws)).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'error', code: 'CLI_RESTART_FAILED' }),
    ]))
  })

  it('starts SuperSpec implementation workflow sessions without mutating tools denied at CLI launch', async () => {
    const sessionId = `workflow-implement-launch-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const startSession = spyOn(conversationService, 'startSession').mockResolvedValue()
    spyOn(conversationService, 'hasSession').mockReturnValue(false)
    spyOn(conversationService, 'onOutput').mockImplementation(() => {})
    spyOn(conversationService, 'clearOutputCallbacks').mockImplementation(() => {})
    spyOn(sessionService, 'getSessionLaunchInfo').mockResolvedValue(null)
    spyOn(sessionService, 'getSessionWorkDir').mockResolvedValue(process.cwd())
    spyOn(sessionService, 'getCustomTitle').mockResolvedValue(null)
    spyOn(sessionService, 'getSession').mockResolvedValue({
      id: sessionId,
      title: 'SuperSpec implementation session',
      createdAt: '2026-05-20T00:00:00.000Z',
      modifiedAt: '2026-05-20T00:00:00.000Z',
      messageCount: 1,
      projectPath: process.cwd(),
      projectRoot: null,
      workDir: process.cwd(),
      workDirExists: true,
      messages: [],
      workflow: {
        mode: 'workflow',
        schemaVersion: 1,
        templateId: 'superspec-development-workflow',
        templateSource: 'user',
        templateVersion: '3',
        templateSnapshotId: 'snapshot-superspec-3',
        workflowStatus: 'running',
        status: 'running',
        activePhaseId: 'sp-implement',
        statePointer: {
          kind: 'workflow-state',
          sessionId,
          artifactId: 'state',
          schemaVersion: 1,
          createdAt: '2026-05-20T00:00:00.000Z',
        },
        updatedAt: '2026-05-20T00:00:00.000Z',
      },
    })

    handleWebSocket.open(ws)
    handleWebSocket.message(ws, JSON.stringify({
      type: 'set_runtime_config',
      providerId: null,
      modelId: 'main-session-sonnet',
    }))
    handleWebSocket.message(ws, JSON.stringify({
      type: 'user_message',
      content: 'Implement the approved tasks.',
    }))
    await waitForCondition(() => startSession.mock.calls.length > 0)

    expect(startSession).toHaveBeenCalled()
    expect(startSession.mock.calls[0]?.[3]).toMatchObject({
      workflowSessionId: sessionId,
    })
    const disallowedTools = startSession.mock.calls[0]?.[3]?.disallowedTools ?? []
    expect(disallowedTools).not.toEqual(expect.arrayContaining([
      'Write',
      'Edit',
      'MultiEdit',
      'NotebookEdit',
    ]))
  })

  it('starts custom phase tool-policy workflow sessions with a stable CLI tool pool', async () => {
    const sessionId = `workflow-tool-policy-launch-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const startSession = spyOn(conversationService, 'startSession').mockResolvedValue()
    spyOn(conversationService, 'hasSession').mockReturnValue(false)
    spyOn(conversationService, 'onOutput').mockImplementation(() => {})
    spyOn(conversationService, 'clearOutputCallbacks').mockImplementation(() => {})
    spyOn(sessionService, 'getSessionLaunchInfo').mockResolvedValue(null)
    spyOn(sessionService, 'getSessionWorkDir').mockResolvedValue(process.cwd())
    spyOn(sessionService, 'getCustomTitle').mockResolvedValue(null)
    spyOn(sessionService, 'getSession').mockResolvedValue({
      id: sessionId,
      title: 'Workflow tool policy session',
      createdAt: '2026-05-20T00:00:00.000Z',
      modifiedAt: '2026-05-20T00:00:00.000Z',
      messageCount: 1,
      projectPath: process.cwd(),
      projectRoot: null,
      workDir: process.cwd(),
      workDirExists: true,
      messages: [],
      expert: makeExpertRuntimeMetadata('active'),
      workflow: {
        mode: 'workflow',
        schemaVersion: 1,
        templateId: 'custom-tools',
        templateSource: 'user',
        templateVersion: '1',
        templateSnapshotId: 'snapshot-custom-tools',
        workflowStatus: 'running',
        status: 'running',
        activePhaseId: 'requirements-clarification',
        statePointer: {
          kind: 'workflow-state',
          sessionId,
          artifactId: 'state',
          schemaVersion: 1,
          createdAt: '2026-05-20T00:00:00.000Z',
        },
        updatedAt: '2026-05-20T00:00:00.000Z',
      },
    })
    const workflowState = makeWorkflowState(sessionId)
    workflowState.templateSnapshot.phases[0] = {
      ...workflowState.templateSnapshot.phases[0]!,
      toolPolicy: {
        allowedTools: ['Bash', 'submit_phase_completion'],
      },
    }
    workflowState.startupPrompt = [
      '<workflow-context-carryover>',
      'strategy: inherit',
      'Latest user decision: preserve the selected workspace.',
      '</workflow-context-carryover>',
    ].join('\n')
    await new WorkflowSessionStateService().writeState(sessionId, workflowState)

    handleWebSocket.open(ws)
    handleWebSocket.message(ws, JSON.stringify({
      type: 'set_runtime_config',
      providerId: null,
      modelId: 'main-session-sonnet',
    }))
    handleWebSocket.message(ws, JSON.stringify({
      type: 'user_message',
      content: 'Run only the selected tools.',
    }))
    await waitForCondition(() => startSession.mock.calls.length > 0)

    expect(startSession).toHaveBeenCalled()
    expect(startSession.mock.calls[0]?.[3]).toMatchObject({
      workflowSessionId: sessionId,
    })
    expect(startSession.mock.calls[0]?.[3]?.workflowSystemPrompt).toContain(
      'Historical transcript messages, including any earlier “No such tool available” result, are not a current tool-availability check and must not be reused as a reason to skip a required workflow tool call.',
    )
    expect(startSession.mock.calls[0]?.[3]?.workflowSystemPrompt).toContain(
      'Never call it merely to enter the immediate linear next phase already represented by the pending completion',
    )
    expect(startSession.mock.calls[0]?.[3]?.workflowSystemPrompt).toContain(
      'Phase-specific instructions are supplied only by the latest Desktop workflow control turn.',
    )
    expect(startSession.mock.calls[0]?.[3]?.workflowSystemPrompt).toContain(
      'This persisted handoff is project context only. It does not define the current phase',
    )
    expect(startSession.mock.calls[0]?.[3]?.workflowSystemPrompt).toContain(
      'Latest user decision: preserve the selected workspace.',
    )
    expect(startSession.mock.calls[0]?.[3]?.workflowSystemPrompt).not.toContain(
      'active phase requirements-clarification',
    )
    const sessionSettings = startSession.mock.calls[0]?.[3]
    expect(sessionSettings?.expertSystemPrompt).toBeUndefined()
    expect(sessionSettings?.expertSessionId).toBeUndefined()
    const disallowedTools = sessionSettings?.disallowedTools ?? []
    for (const toolName of ['Bash', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Agent', 'workflow_template_authoring']) {
      expect(disallowedTools).not.toContain(toolName)
    }
  })

  it('rejects a scoped workflow artifact write outside .workflow before it reaches the CLI', async () => {
    const sessionId = `workflow-scoped-artifact-write-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const state = makeFollowUpWorkflowStageOneState(sessionId, {
      templateId: 'artifact-write-fixture',
      phaseId: 'scope-plan',
      toolPolicy: { allowedTools: ['workflow_artifact_write'] },
    })
    await new WorkflowSessionStateService().writeState(sessionId, state)
    const respondToPermission = spyOn(conversationService, 'respondToPermission').mockReturnValue(true)
    spyOn(conversationService, 'getPendingPermissionRequests').mockReturnValue([{
      requestId: 'artifact-write-request',
      toolName: 'Write',
      input: { file_path: '.workflow/project-context.md' },
    }])
    spyOn(conversationService, 'getSessionWorkDir').mockReturnValue(process.cwd())

    handleWebSocket.open(ws)
    handleWebSocket.message(ws, JSON.stringify({
      type: 'permission_response',
      requestId: 'artifact-write-request',
      allowed: true,
      updatedInput: { file_path: 'src/app.ts' },
    }))
    await waitForCondition(() => parseSentMessages(ws).some((message) => (
      message.type === 'permission_response_ack'
      && message.requestId === 'artifact-write-request'
      && message.status === 'rejected'
    )))

    expect(respondToPermission).toHaveBeenCalledWith(sessionId, 'artifact-write-request', false)
    expect(parseSentMessages(ws)).toContainEqual(expect.objectContaining({
      type: 'error',
      code: 'WORKFLOW_ARTIFACT_WRITE_FORBIDDEN',
    }))
  })

  it('accepts idempotent workflow retry transition commands for workflow sessions', async () => {
    const sessionId = `workflow-retry-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)

    handleWebSocket.open(ws)
    handleWebSocket.message(ws, JSON.stringify({
      type: 'workflow_transition',
      phaseId: 'implementation',
      action: 'retry',
      transitionId: 'retry-once',
      stateVersion: 1,
    }))
    handleWebSocket.message(ws, JSON.stringify({
      type: 'workflow_transition',
      phaseId: 'implementation',
      action: 'retry',
      transitionId: 'retry-once',
      stateVersion: 1,
    }))
    await waitForCondition(() => parseSentMessages(ws).some((message) =>
      message.type === 'system_notification'
      && message.subtype === 'workflow_transition'
    ))

    const workflowTransitions = parseSentMessages(ws).filter((message) =>
      message.type === 'system_notification'
      && message.subtype === 'workflow_transition'
    )
    const errors = parseSentMessages(ws).filter((message) => message.type === 'error')

    expect(errors).toEqual([])
    expect(workflowTransitions).toHaveLength(1)
    expect(workflowTransitions[0]).toMatchObject({
      data: {
        action: 'retry',
        result: 'accepted',
        transitionId: 'retry-once',
      },
    })
  })

  it.each([
    ['confirm', 'accepted', 'technical-design', false, 'accepted'],
    ['reject', 'rejected', 'requirements-clarification', false, 'rejected'],
    ['retry', 'superseded', 'requirements-clarification', false, 'superseded'],
  ] as const)('handles websocket %s ready confirmation with canonical stateVersion and workflow notifications', async (
    action,
    expectedResult,
    expectedActivePhaseId,
    expectedPending,
    expectedArtifactStatus,
  ) => {
    const sessionId = `workflow-${action}-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    spyOn(sessionService, 'getSessionWorkDir').mockResolvedValue(process.cwd())
    spyOn(sessionService, 'appendSessionMetadata').mockResolvedValue()
    await stateService.writeState(sessionId, makePendingWorkflowState(sessionId))

    handleWebSocket.open(ws)
    handleWebSocket.message(ws, JSON.stringify({
      type: 'workflow_transition',
      phaseId: 'requirements-clarification',
      action,
      ...(action === 'confirm' || action === 'reject' ? { confirmationId: 'submit-requirements-ready' } : {}),
      stateVersion: 3,
      transitionId: `${action}-requirements-ready`,
    }))
    await waitForCondition(() => parseSentMessages(ws).some((message) =>
      message.type === 'system_notification'
      && message.subtype === 'workflow_transition'
    ))

    const messages = parseSentMessages(ws)
    const transition = messages.find((message) =>
      message.type === 'system_notification'
      && message.subtype === 'workflow_transition'
    )
    const state = messages.find((message) =>
      message.type === 'system_notification'
      && message.subtype === 'workflow_state'
    )
    const errors = messages.filter((message) => message.type === 'error')

    expect(errors).toEqual([])
    expect(transition).toMatchObject({
      data: {
        transitionId: `${action}-requirements-ready`,
        result: expectedResult,
        stateVersion: expect.any(Number),
      },
    })
    expect(state).toMatchObject({
      data: {
        mode: 'workflow',
        activePhaseId: expectedActivePhaseId,
        pendingConfirmation: expectedPending,
      },
    })

    const persisted = await stateService.readState(sessionId)
    expect(persisted.state?.phases[0]?.artifactPointers).toContainEqual(
      expect.objectContaining({ lifecycleStatus: expectedArtifactStatus }),
    )
  })

  it('always delivers a legacy action-shaped Ask answer to the current phase without routing', async () => {
    const sessionId = `workflow-ask-action-is-answer-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    const respondToPermission = spyOn(conversationService, 'respondToPermission').mockReturnValue(true)
    spyOn(sessionService, 'getSessionWorkDir').mockResolvedValue(process.cwd())
    spyOn(sessionService, 'appendSessionMetadata').mockResolvedValue()
    const state = makeWorkflowState(sessionId)
    const workflowQuestionContext = bindAskUserQuestionFixture(state, 'ask-action-is-answer', 'adjustment')
    await stateService.writeState(sessionId, state)

    handleWebSocket.open(ws)
    handleWebSocket.message(ws, JSON.stringify({
      type: 'permission_response',
      requestId: 'ask-action-is-answer',
      allowed: true,
      updatedInput: {
        workflowQuestionContext,
        questions: [{ id: 'adjustment' }],
        answers: { adjustment: 'Return to the current requirements and revise the role rules.' },
        workflowChoiceActions: [{
          questionId: 'adjustment',
          choiceId: 'legacy-route',
          action: { kind: 'workflow-route', intent: 'jump_to_phase', targetPhaseId: 'delegate-implement' },
        }],
      },
    }))

    await waitForCondition(() => respondToPermission.mock.calls.length === 1)
    const persisted = await stateService.readState(sessionId)
    expect(respondToPermission).toHaveBeenCalledWith(
      sessionId,
      'ask-action-is-answer',
      true,
      undefined,
      expect.objectContaining({ answers: { adjustment: 'Return to the current requirements and revise the role rules.' } }),
    )
    expect(persisted.state?.activePhaseId).toBe('requirements-clarification')
    expect(persisted.state?.pendingRoute).toBeFalsy()
    expect(persisted.state?.runtimeContract?.phaseStates['requirements-clarification']?.issues).toContainEqual(expect.objectContaining({
      questionId: 'adjustment',
      status: 'answered-pending-processing',
    }))
  })

  it('does not treat stale legacy action metadata as a workflow transition command', async () => {
    const sessionId = `workflow-ask-stale-action-is-answer-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    const respondToPermission = spyOn(conversationService, 'respondToPermission').mockReturnValue(true)
    spyOn(sessionService, 'getSessionWorkDir').mockResolvedValue(process.cwd())
    spyOn(sessionService, 'appendSessionMetadata').mockResolvedValue()
    const state = makeWorkflowState(sessionId)
    const workflowQuestionContext = {
      ...bindAskUserQuestionFixture(state, 'ask-stale-action-is-answer', 'clarify'),
      stateVersion: state.stateVersion - 1,
    }
    await stateService.writeState(sessionId, state)

    handleWebSocket.open(ws)
    handleWebSocket.message(ws, JSON.stringify({
      type: 'permission_response',
      requestId: 'ask-stale-action-is-answer',
      allowed: true,
      updatedInput: {
        workflowQuestionContext,
        questions: [{ id: 'clarify' }],
        answers: { clarify: 'Use the teacher role for this requirement.' },
        workflowChoiceActions: [{ questionId: 'clarify', choiceId: 'legacy-advance', action: 'advance_phase' }],
      },
    }))

    await waitForCondition(() => respondToPermission.mock.calls.length === 1)
    const persisted = await stateService.readState(sessionId)
    expect(persisted.state?.activePhaseId).toBe('requirements-clarification')
    expect(persisted.state?.pendingRoute).toBeFalsy()
  })

  it('keeps a completed auto-authority submission pending until the user confirms', async () => {
    const sessionId = `workflow-completed-auto-${Date.now()}-${Math.random()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
    spyOn(conversationService, 'hasSession').mockReturnValue(true)
    spyOn(conversationService, 'getSessionWorkDir').mockReturnValue(process.cwd())
    spyOn(sessionService, 'getSessionWorkDir').mockResolvedValue(process.cwd())
    spyOn(sessionService, 'appendSessionMetadata').mockResolvedValue()

    const state = makeWorkflowState(sessionId)
    state.templateSnapshot.phases[0]!.transitionAuthority = 'auto'
    await stateService.writeState(sessionId, state)

    handleWebSocket.open(ws)
    handleWebSocket.message(ws, JSON.stringify({
      type: 'workflow_transition',
      phaseId: 'requirements-clarification',
      action: 'completed',
      stateVersion: state.stateVersion,
      handoff: { summary: 'Requirements complete.' },
      rationale: 'All requirements evidence is recorded.',
      evidence: [],
    }))

    await waitForAsyncCondition(async () => (await stateService.readState(sessionId)).state?.pendingConfirmation?.status === 'pending')
    const persisted = await stateService.readState(sessionId)
    expect(persisted.state?.activePhaseId).toBe('requirements-clarification')
    expect(persisted.state?.workflowStatus).toBe('pending-confirmation')
    expect(persisted.state?.pendingConfirmation?.toPhaseId).toBe('technical-design')
    expect(sendMessage).not.toHaveBeenCalledWith(sessionId, expect.stringContaining('Active phase: technical-design'))
  })

  it('automatically starts the next workflow phase after user-confirmed advancement', async () => {
    const sessionId = `workflow-auto-confirm-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
    const startSession = spyOn(conversationService, 'startSession').mockResolvedValue()
    const stopSessionAndWait = spyOn(conversationService, 'stopSessionAndWait').mockResolvedValue()
    spyOn(conversationService, 'hasSession').mockReturnValue(true)
    spyOn(conversationService, 'getSessionWorkDir').mockReturnValue(process.cwd())
    spyOn(conversationService, 'onOutput').mockImplementation(() => {})
    spyOn(conversationService, 'clearOutputCallbacks').mockImplementation(() => {})
    spyOn(sessionService, 'getSessionWorkDir').mockResolvedValue(process.cwd())
    spyOn(sessionService, 'appendSessionMetadata').mockResolvedValue()
    const pendingState = makePendingWorkflowState(sessionId)
    pendingState.templateSnapshot.phases.push({
      id: 'future-release-secret',
      label: 'Future Release Secret',
      instructions: 'FUTURE_STAGE_INSTRUCTIONS_MUST_NOT_BE_INJECTED',
      requestedModel: null,
      skillDeclarations: [],
      requiredArtifacts: [],
      completionCriteria: { type: 'manual-checklist' },
      transitionAuthority: 'user-confirmation',
    })
    pendingState.phases.push({
      id: 'future-release-secret',
      label: 'Future Release Secret',
      transitionAuthority: 'user-confirmation',
      index: 2,
      status: 'created',
      artifactPointers: [],
    })
    await stateService.writeState(sessionId, pendingState)

    handleWebSocket.open(ws)
    handleWebSocket.message(ws, JSON.stringify({
      type: 'set_runtime_config',
      providerId: null,
      modelId: 'main-session-sonnet',
    }))
    await waitForCondition(() => startSession.mock.calls.length === 1)
    startSession.mockClear()
    stopSessionAndWait.mockClear()
    handleWebSocket.message(ws, JSON.stringify({
      type: 'workflow_transition',
      phaseId: 'requirements-clarification',
      action: 'confirm',
      confirmationId: 'submit-requirements-ready',
      stateVersion: 3,
      transitionId: 'confirm-auto-continue',
    }))
    await waitForCondition(() => sendMessage.mock.calls.some(([calledSessionId, content]) =>
      calledSessionId === sessionId
      && typeof content === 'string'
      && content.includes('Active phase: technical-design')
    ))

    expect(startSession).not.toHaveBeenCalled()
    expect(stopSessionAndWait).not.toHaveBeenCalled()
    const autoContinuePrompts = sendMessage.mock.calls.filter(([calledSessionId, content]) =>
      calledSessionId === sessionId
      && typeof content === 'string'
      && content.includes('Continue automatically with the newly confirmed workflow phase: technical-design.')
    )
    expect(autoContinuePrompts).toHaveLength(1)
    expect(autoContinuePrompts[0]?.[1]).toContain('Workflow mode')
    expect(autoContinuePrompts[0]?.[1]).toContain('Active phase: technical-design')
    expect(autoContinuePrompts[0]?.[1]).not.toContain('Clarify requirements.')
    expect(autoContinuePrompts[0]?.[1]).not.toContain('FUTURE_STAGE_INSTRUCTIONS_MUST_NOT_BE_INJECTED')
  })

  it('resumes the current phase with an adjustment question after the user rejects its completion', async () => {
    const sessionId = `workflow-adjust-reject-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    let cliSessionRunning = true
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
    const startSession = spyOn(conversationService, 'startSession').mockImplementation(async () => {
      cliSessionRunning = true
    })
    const stopSessionAndWait = spyOn(conversationService, 'stopSessionAndWait').mockImplementation(async () => {
      cliSessionRunning = false
    })
    spyOn(conversationService, 'hasSession').mockImplementation(() => cliSessionRunning)
    spyOn(conversationService, 'getSessionWorkDir').mockReturnValue(process.cwd())
    spyOn(conversationService, 'onOutput').mockImplementation(() => {})
    spyOn(conversationService, 'clearOutputCallbacks').mockImplementation(() => {})
    spyOn(sessionService, 'getSessionWorkDir').mockResolvedValue(process.cwd())
    spyOn(sessionService, 'appendSessionMetadata').mockResolvedValue()
    await stateService.writeState(sessionId, makePendingWorkflowState(sessionId))

    handleWebSocket.open(ws)
    handleWebSocket.message(ws, JSON.stringify({
      type: 'set_runtime_config',
      providerId: null,
      modelId: 'main-session-sonnet',
    }))
    await waitForCondition(() => startSession.mock.calls.length === 1)

    handleWebSocket.message(ws, JSON.stringify({
      type: 'workflow_transition',
      phaseId: 'requirements-clarification',
      action: 'reject',
      confirmationId: 'submit-requirements-ready',
      stateVersion: 3,
      transitionId: 'reject-and-adjust',
    }))

    await waitForCondition(() => sendMessage.mock.calls.some(([calledSessionId, content]) =>
      calledSessionId === sessionId
      && typeof content === 'string'
      && content.includes('The user rejected the completion result for the current workflow phase: requirements-clarification.')
    ))

    expect(stopSessionAndWait).toHaveBeenCalledTimes(1)
    expect(startSession).toHaveBeenCalledTimes(1)
    expect(sendMessage).toHaveBeenCalledWith(
      sessionId,
      expect.stringContaining('Immediately use AskUserQuestion'),
    )
    expect(sendMessage).toHaveBeenCalledWith(
      sessionId,
      expect.stringContaining('Active phase: requirements-clarification'),
    )
  })

  it('starts a missing CLI session before automatically continuing the next confirmed workflow phase', async () => {
    const sessionId = `workflow-auto-confirm-recover-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    let cliSessionRunning = false
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
    const startSession = spyOn(conversationService, 'startSession').mockImplementation(async () => {
      cliSessionRunning = true
    })
    spyOn(conversationService, 'hasSession').mockImplementation(() => cliSessionRunning)
    spyOn(conversationService, 'getSessionWorkDir').mockReturnValue(process.cwd())
    spyOn(conversationService, 'onOutput').mockImplementation(() => {})
    spyOn(conversationService, 'clearOutputCallbacks').mockImplementation(() => {})
    spyOn(sessionService, 'getSessionWorkDir').mockResolvedValue(process.cwd())
    spyOn(sessionService, 'appendSessionMetadata').mockResolvedValue()
    await stateService.writeState(sessionId, makePendingWorkflowState(sessionId))

    handleWebSocket.open(ws)
    handleWebSocket.message(ws, JSON.stringify({
      type: 'workflow_transition',
      phaseId: 'requirements-clarification',
      action: 'confirm',
      confirmationId: 'submit-requirements-ready',
      stateVersion: 3,
      transitionId: 'confirm-auto-continue-recover',
    }))

    await waitForCondition(() => sendMessage.mock.calls.some(([calledSessionId, content]) =>
      calledSessionId === sessionId
      && typeof content === 'string'
      && content.includes('Continue automatically with the newly confirmed workflow phase: technical-design.')
    ))

    expect(startSession).toHaveBeenCalledTimes(1)
    expect(sendMessage).toHaveBeenCalledWith(
      sessionId,
      expect.stringContaining('Active phase: technical-design'),
    )
  })

  it('reports when a structured question answer cannot be delivered to the CLI session', async () => {
    const sessionId = `workflow-question-undeliverable-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const respondToPermission = spyOn(conversationService, 'respondToPermission').mockReturnValue(false)

    handleWebSocket.open(ws)
    handleWebSocket.message(ws, JSON.stringify({
      type: 'permission_response',
      requestId: 'question-permission-1',
      allowed: true,
      updatedInput: {
        questions: [{ question: 'Continue?', options: [{ label: 'Yes' }] }],
        answers: { 'Continue?': 'Yes' },
      },
    }))

    await waitForCondition(() => parseSentMessages(ws).some((message) =>
      message.type === 'error' && message.code === 'CLI_NOT_RUNNING'
    ))
    expect(parseSentMessages(ws)).toContainEqual(expect.objectContaining({
      type: 'error',
      code: 'CLI_NOT_RUNNING',
    }))

    expect(respondToPermission).toHaveBeenCalledWith(
      sessionId,
      'question-permission-1',
      true,
      undefined,
      expect.objectContaining({ answers: { 'Continue?': 'Yes' } }),
    )
  })
  it('adds a clear-context boundary to the auto-continue prompt when requested', async () => {
    const sessionId = `workflow-auto-confirm-clear-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
    spyOn(conversationService, 'startSession').mockResolvedValue()
    spyOn(conversationService, 'stopSessionAndWait').mockResolvedValue()
    spyOn(conversationService, 'hasSession').mockReturnValue(true)
    spyOn(conversationService, 'getSessionWorkDir').mockReturnValue(process.cwd())
    spyOn(conversationService, 'onOutput').mockImplementation(() => {})
    spyOn(conversationService, 'clearOutputCallbacks').mockImplementation(() => {})
    spyOn(sessionService, 'getSessionWorkDir').mockResolvedValue(process.cwd())
    spyOn(sessionService, 'appendSessionMetadata').mockResolvedValue()
    await stateService.writeState(sessionId, makePendingWorkflowState(sessionId))

    handleWebSocket.open(ws)
    handleWebSocket.message(ws, JSON.stringify({
      type: 'set_runtime_config',
      providerId: null,
      modelId: 'main-session-sonnet',
    }))
    handleWebSocket.message(ws, JSON.stringify({
      type: 'workflow_transition',
      phaseId: 'requirements-clarification',
      action: 'confirm',
      confirmationId: 'submit-requirements-ready',
      stateVersion: 3,
      transitionId: 'confirm-auto-clear-context',
      nextPhaseContextStrategy: 'clear',
    }))
    await waitForCondition(() => sendMessage.mock.calls.some(([calledSessionId, content]) =>
      calledSessionId === sessionId
      && typeof content === 'string'
      && content.includes('Context boundary: use only accepted handoff materials')
    ))

    const autoContinuePrompt = sendMessage.mock.calls.find(([calledSessionId, content]) =>
      calledSessionId === sessionId
      && typeof content === 'string'
      && content.includes('Active phase: technical-design')
    )?.[1]
    expect(autoContinuePrompt).toContain('Context boundary: use only accepted handoff materials')
    expect(autoContinuePrompt).toContain('Do not rely on inherited transcript history')
  })

  it('restarts an active CLI when the same runtime selection is force-reapplied', async () => {
    const sessionId = `runtime-force-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const startSession = spyOn(conversationService, 'startSession').mockResolvedValue()
    spyOn(conversationService, 'stopSessionAndWait').mockResolvedValue()
    spyOn(conversationService, 'hasSession').mockReturnValue(true)
    spyOn(conversationService, 'getSessionWorkDir').mockReturnValue(process.cwd())
    spyOn(sessionService, 'getSessionWorkDir').mockResolvedValue(process.cwd())

    handleWebSocket.open(ws)
    handleWebSocket.message(ws, JSON.stringify({
      type: 'set_runtime_config',
      providerId: null,
      modelId: 'mimo-v2.5-pro[1m]',
    }))
    await waitForCondition(() => startSession.mock.calls.length === 1)

    startSession.mockClear()
    handleWebSocket.message(ws, JSON.stringify({
      type: 'set_runtime_config',
      providerId: null,
      modelId: 'mimo-v2.5-pro[1m]',
      force: true,
    }))
    await waitForCondition(() => startSession.mock.calls.length === 1)

    expect(startSession).toHaveBeenCalledWith(
      sessionId,
      process.cwd(),
      expect.stringContaining(`/sdk/${sessionId}`),
      expect.objectContaining({
        providerId: null,
        model: 'mimo-v2.5-pro[1m]',
      }),
    )
  })

  it('rolls back a failed runtime override before the next startup', async () => {
    const sessionId = `runtime-rollback-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const startCalls: Array<{ model?: string; providerId?: string | null }> = []
    let hasActiveSession = true

    spyOn(conversationService, 'hasSession').mockImplementation(() => hasActiveSession)
    spyOn(conversationService, 'stopSessionAndWait').mockImplementation(async () => {
      hasActiveSession = false
    })
    spyOn(conversationService, 'startSession').mockImplementation(async (
      _sid,
      _workDir,
      _sdkUrl,
      options,
    ) => {
      startCalls.push({
        model: options?.model,
        providerId: options?.providerId,
      })
      if (options?.model === 'bad-model') {
        throw new Error('CLI exited during startup with code 143')
      }
      hasActiveSession = true
    })
    spyOn(conversationService, 'getSessionWorkDir').mockReturnValue(process.cwd())
    spyOn(conversationService, 'onOutput').mockImplementation(() => {})
    spyOn(conversationService, 'clearOutputCallbacks').mockImplementation(() => {})
    spyOn(sessionService, 'getSessionWorkDir').mockResolvedValue(process.cwd())
    spyOn(sessionService, 'getSessionLaunchInfo').mockResolvedValue(null)

    handleWebSocket.open(ws)
    handleWebSocket.message(ws, JSON.stringify({
      type: 'set_runtime_config',
      providerId: null,
      modelId: 'stable-model',
    }))
    await waitForCondition(() => startCalls.length === 1)

    handleWebSocket.message(ws, JSON.stringify({
      type: 'set_runtime_config',
      providerId: null,
      modelId: 'bad-model',
    }))
    await waitForCondition(() =>
      parseSentMessages(ws).some((message) =>
        message.type === 'error' &&
        message.code === 'CLI_RESTART_FAILED' &&
        String(message.message).includes('bad-model')
      ),
    )

    handleWebSocket.message(ws, JSON.stringify({ type: 'prewarm_session' }))
    await waitForCondition(() => startCalls.length === 3)

    expect(startCalls.map((call) => call.model)).toEqual([
      'stable-model',
      'bad-model',
      'stable-model',
    ])
  })

  it('does not let a delayed stop force-kill terminate a newer runtime switch process', async () => {
    const sessionId = `runtime-stop-race-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    let delayedStopForceKill: (() => void) | null = null
    const sessions = (conversationService as any).sessions as Map<string, any>
    const makeSession = (proc: { kill: ReturnType<typeof mock>; exited: Promise<number> }) => ({
      proc,
      outputCallbacks: [] as Array<(msg: any) => void>,
      workDir: process.cwd(),
      permissionMode: 'default',
      sdkToken: 'sdk-token',
      sdkSocket: null,
      pendingOutbound: [],
      startupPending: false,
      startupExitCode: null,
      stdoutLines: [],
      stderrLines: [],
      outputDrain: Promise.resolve(),
      sdkMessages: [],
      initMessage: null,
      pendingPermissionRequests: new Map(),
    })
    const oldProc = { kill: mock(() => {}), exited: Promise.resolve(143) }
    const newProc = { kill: mock(() => {}), exited: Promise.resolve(0) }

    sessions.set(sessionId, makeSession(oldProc))

    const stopSessionAndWait = spyOn(conversationService, 'stopSessionAndWait').mockImplementation(async (sid) => {
      const session = sessions.get(sid)
      if (session) {
        session.proc.kill()
        sessions.delete(sid)
      }
    })
    const stopSessionIfCurrent = spyOn(conversationService, 'stopSessionIfCurrent')
    const sendInterrupt = spyOn(conversationService, 'sendInterrupt').mockReturnValue(true)
    const startSession = spyOn(conversationService, 'startSession').mockImplementation(async () => {
      sessions.set(sessionId, makeSession(newProc))
    })

    try {
      handleWebSocket.open(ws)

      const originalSetTimeout = globalThis.setTimeout
      globalThis.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
        if (timeout === 3_000 && typeof handler === 'function') {
          delayedStopForceKill = () => {
            handler(...args)
          }
          return 0 as unknown as ReturnType<typeof setTimeout>
        }
        return originalSetTimeout(handler, timeout, ...args)
      }) as typeof setTimeout
      try {
        handleWebSocket.message(ws, JSON.stringify({ type: 'stop_generation' }))
      } finally {
        globalThis.setTimeout = originalSetTimeout
      }

      expect(sendInterrupt).toHaveBeenCalledWith(sessionId)
      expect(delayedStopForceKill).not.toBeNull()

      handleWebSocket.message(ws, JSON.stringify({
        type: 'set_runtime_config',
        providerId: null,
        modelId: 'deepseek-v4-flash',
      }))
      await waitForCondition(() => startSession.mock.calls.length === 1)

      expect(stopSessionAndWait).toHaveBeenCalledTimes(1)
      expect(oldProc.kill).toHaveBeenCalledTimes(1)
      expect(newProc.kill).not.toHaveBeenCalled()

      delayedStopForceKill?.()

      expect(stopSessionAndWait).toHaveBeenCalledTimes(1)
      expect(stopSessionIfCurrent).toHaveBeenCalledTimes(1)
      expect(newProc.kill).not.toHaveBeenCalled()
      expect(conversationService.hasSession(sessionId)).toBe(true)
    } finally {
      sessions.delete(sessionId)
    }
  })

  it('pauses a workflow without restarting the agent or sending a follow-up turn', async () => {
    const sessionId = `workflow-pause-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
    const startSession = spyOn(conversationService, 'startSession').mockResolvedValue()
    const stopSessionAndWait = spyOn(conversationService, 'stopSessionAndWait').mockResolvedValue()
    spyOn(conversationService, 'hasSession').mockReturnValue(true)
    spyOn(conversationService, 'getSessionWorkDir').mockReturnValue(process.cwd())
    spyOn(conversationService, 'onOutput').mockImplementation(() => {})
    spyOn(conversationService, 'clearOutputCallbacks').mockImplementation(() => {})
    spyOn(sessionService, 'getSessionWorkDir').mockResolvedValue(process.cwd())
    spyOn(sessionService, 'appendSessionMetadata').mockResolvedValue()
    await stateService.writeState(sessionId, makePendingWorkflowState(sessionId))

    handleWebSocket.open(ws)
    handleWebSocket.message(ws, JSON.stringify({
      type: 'workflow_transition',
      phaseId: 'requirements-clarification',
      action: 'pause',
      stateVersion: 3,
      transitionId: 'pause-without-restart',
    }))
    await waitForCondition(() => parseSentMessages(ws).some((message) =>
      message.type === 'system_notification'
      && message.subtype === 'workflow_transition'
    ))
    await flushAsyncHandlers()

    const paused = await stateService.readState(sessionId)
    expect(paused.state).toMatchObject({
      activePhaseId: 'requirements-clarification',
      runStatus: 'paused',
    })
    expect(stopSessionAndWait).not.toHaveBeenCalled()
    expect(startSession).not.toHaveBeenCalled()
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it.each(['reject', 'retry'] as const)(
    'does not auto-start a next workflow phase after %s transition decisions',
    async (action) => {
      const sessionId = `workflow-no-auto-${action}-${crypto.randomUUID()}`
      const ws = makeClientSocket(sessionId)
      const stateService = new WorkflowSessionStateService()
      const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
      spyOn(conversationService, 'startSession').mockResolvedValue()
      spyOn(conversationService, 'stopSessionAndWait').mockResolvedValue()
      spyOn(conversationService, 'hasSession').mockReturnValue(true)
      spyOn(conversationService, 'getSessionWorkDir').mockReturnValue(process.cwd())
      spyOn(conversationService, 'onOutput').mockImplementation(() => {})
      spyOn(conversationService, 'clearOutputCallbacks').mockImplementation(() => {})
      spyOn(sessionService, 'getSessionWorkDir').mockResolvedValue(process.cwd())
      spyOn(sessionService, 'appendSessionMetadata').mockResolvedValue()
      await stateService.writeState(sessionId, makePendingWorkflowState(sessionId))

      handleWebSocket.open(ws)
      handleWebSocket.message(ws, JSON.stringify({
        type: 'workflow_transition',
        phaseId: 'requirements-clarification',
        action,
        confirmationId: 'submit-requirements-ready',
        stateVersion: 3,
        transitionId: `${action}-no-auto-continue`,
      }))
      await waitForCondition(() => parseSentMessages(ws).some((message) =>
        message.type === 'system_notification'
        && message.subtype === 'workflow_transition'
      ))
      await flushAsyncHandlers()

      expect(sendMessage).not.toHaveBeenCalled()
    },
  )

  it('rejects stale websocket workflow transitions without advancing ready state', async () => {
    const sessionId = `workflow-stale-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    await stateService.writeState(sessionId, makePendingWorkflowState(sessionId))

    handleWebSocket.open(ws)
    handleWebSocket.message(ws, JSON.stringify({
      type: 'workflow_transition',
      phaseId: 'requirements-clarification',
      action: 'confirm',
      confirmationId: 'submit-requirements-ready',
      stateVersion: 2,
      transitionId: 'stale-requirements-ready',
    }))
    await waitForCondition(() => parseSentMessages(ws).some((message) => message.type === 'error'))

    const messages = parseSentMessages(ws)
    const authoritativeStateIndex = messages.findIndex((message) =>
      message.type === 'system_notification' && message.subtype === 'workflow_state'
    )
    const staleErrorIndex = messages.findIndex((message) =>
      message.type === 'error' && message.code === 'WORKFLOW_STATE_STALE'
    )
    expect(authoritativeStateIndex).toBeGreaterThanOrEqual(0)
    expect(staleErrorIndex).toBeGreaterThan(authoritativeStateIndex)
    expect(messages[authoritativeStateIndex]).toMatchObject({
      type: 'system_notification',
      subtype: 'workflow_state',
      data: {
        activePhaseId: 'requirements-clarification',
        stateVersion: 3,
        pendingConfirmation: true,
        pendingConfirmationId: 'submit-requirements-ready',
      },
    })
    const persisted = await stateService.readState(sessionId)
    expect(persisted.state?.activePhaseId).toBe('requirements-clarification')
    expect(persisted.state?.pendingConfirmation).toMatchObject({ status: 'pending' })
  })

  it('replays duplicate websocket transitionId without duplicate advancement and returns the authoritative state', async () => {
    const sessionId = `workflow-duplicate-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    spyOn(conversationService, 'sendMessage').mockReturnValue(true)
    spyOn(conversationService, 'startSession').mockResolvedValue()
    spyOn(conversationService, 'stopSessionAndWait').mockResolvedValue()
    spyOn(conversationService, 'hasSession').mockReturnValue(true)
    spyOn(conversationService, 'getSessionWorkDir').mockReturnValue(process.cwd())
    spyOn(conversationService, 'onOutput').mockImplementation(() => {})
    spyOn(conversationService, 'clearOutputCallbacks').mockImplementation(() => {})
    spyOn(sessionService, 'getSessionWorkDir').mockResolvedValue(process.cwd())
    spyOn(sessionService, 'appendSessionMetadata').mockResolvedValue()
    await stateService.writeState(sessionId, makePendingWorkflowState(sessionId))

    handleWebSocket.open(ws)
    handleWebSocket.message(ws, JSON.stringify({
      type: 'workflow_transition',
      phaseId: 'requirements-clarification',
      action: 'confirm',
      confirmationId: 'submit-requirements-ready',
      stateVersion: 3,
      transitionId: 'confirm-requirements-idempotent',
    }))
    await waitForCondition(() => parseSentMessages(ws).some((message) =>
      message.type === 'system_notification'
      && message.subtype === 'workflow_state'
    ))
    handleWebSocket.message(ws, JSON.stringify({
      type: 'workflow_transition',
      phaseId: 'requirements-clarification',
      action: 'confirm',
      confirmationId: 'submit-requirements-ready',
      stateVersion: 4,
      transitionId: 'confirm-requirements-idempotent',
    }))
    await waitForCondition(() => parseSentMessages(ws).filter((message) =>
      message.type === 'system_notification' && message.subtype === 'workflow_state'
    ).length >= 2)

    const messages = parseSentMessages(ws)
    const transitions = messages.filter((message) =>
      message.type === 'system_notification'
      && message.subtype === 'workflow_transition'
    )
    const workflowStates = messages.filter((message) =>
      message.type === 'system_notification'
      && message.subtype === 'workflow_state'
    )
    const persisted = await stateService.readState(sessionId)
    expect(transitions.filter((message) =>
      (message.data as { transitionId?: string }).transitionId === 'confirm-requirements-idempotent'
    )).toHaveLength(1)
    expect(workflowStates).toHaveLength(2)
    expect(workflowStates.at(-1)).toMatchObject({
      data: {
        activePhaseId: 'technical-design',
        pendingConfirmation: false,
      },
    })
    expect(persisted.state?.activePhaseId).toBe('technical-design')
    expect(persisted.state?.phases[0]?.artifactPointers).toHaveLength(1)
  })

  it('rejects a superseded websocket confirmation after sending the current authoritative card', async () => {
    const sessionId = `workflow-superseded-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    await stateService.writeState(sessionId, makePendingWorkflowState(sessionId))

    handleWebSocket.open(ws)
    handleWebSocket.message(ws, JSON.stringify({
      type: 'workflow_transition',
      phaseId: 'requirements-clarification',
      action: 'confirm',
      confirmationId: 'superseded-requirements-ready',
      stateVersion: 3,
      transitionId: 'superseded-requirements-confirm',
    }))
    await waitForCondition(() => parseSentMessages(ws).some((message) =>
      message.type === 'error' && message.code === 'WORKFLOW_CONFIRMATION_SUPERSEDED'
    ))

    const messages = parseSentMessages(ws)
    const authoritativeStateIndex = messages.findIndex((message) =>
      message.type === 'system_notification' && message.subtype === 'workflow_state'
    )
    const supersededErrorIndex = messages.findIndex((message) =>
      message.type === 'error' && message.code === 'WORKFLOW_CONFIRMATION_SUPERSEDED'
    )
    expect(authoritativeStateIndex).toBeGreaterThanOrEqual(0)
    expect(supersededErrorIndex).toBeGreaterThan(authoritativeStateIndex)
    expect(messages[authoritativeStateIndex]).toMatchObject({
      type: 'system_notification',
      subtype: 'workflow_state',
      data: {
        activePhaseId: 'requirements-clarification',
        stateVersion: 3,
        pendingConfirmation: true,
        pendingConfirmationId: 'submit-requirements-ready',
      },
    })
    const persisted = await stateService.readState(sessionId)
    expect(persisted.state?.activePhaseId).toBe('requirements-clarification')
    expect(persisted.state?.pendingConfirmation).toMatchObject({
      confirmationId: 'submit-requirements-ready',
      status: 'pending',
    })
  })

  it('rejects websocket ready submissions when a pending confirmation already exists', async () => {
    const sessionId = `workflow-pending-conflict-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    await stateService.writeState(sessionId, makePendingWorkflowState(sessionId))

    handleWebSocket.open(ws)
    handleWebSocket.message(ws, JSON.stringify({
      type: 'workflow_transition',
      phaseId: 'requirements-clarification',
      action: 'ready',
      stateVersion: 3,
      transitionId: 'submit-second-ready',
      handoff: {
        summary: 'Second ready attempt.',
        artifacts: [],
        next: 'Confirm.',
      },
      rationale: 'Trying to submit ready again.',
      evidence: [],
    }))
    await waitForCondition(() => parseSentMessages(ws).some((message) => message.type === 'error'))

    expect(parseSentMessages(ws)).toContainEqual(expect.objectContaining({
      type: 'error',
      code: 'WORKFLOW_PENDING_CONFLICT',
    }))
  })

  it.each([
    [
      'blocked',
      'Waiting for the user to provide an OAuth account.',
      'Missing OAuth account selection.',
    ],
    [
      'unable',
      'The referenced implementation notes are unavailable.',
      'Implementation notes could not be read.',
    ],
  ] as const)('records websocket %s submissions with evidence and emits additive workflow_blocked notification', async (
    action,
    rationale,
    evidenceRef,
  ) => {
    const sessionId = `workflow-${action}-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    spyOn(sessionService, 'getSessionWorkDir').mockResolvedValue(process.cwd())
    spyOn(sessionService, 'appendSessionMetadata').mockResolvedValue()
    await stateService.writeState(sessionId, makeWorkflowState(sessionId))

    handleWebSocket.open(ws)
    handleWebSocket.message(ws, JSON.stringify({
      type: 'workflow_transition',
      phaseId: 'requirements-clarification',
      action,
      stateVersion: 1,
      transitionId: `${action}-requirements-evidence`,
      handoff: {
        summary: `${action} handoff summary`,
        artifacts: [],
        next: 'Continue the discussion or resolve manually.',
      },
      rationale,
      evidence: [
        {
          kind: 'runtime-status',
          label: `${action} evidence`,
          ref: evidenceRef,
        },
      ],
    }))
    await waitForCondition(() => parseSentMessages(ws).some((message) =>
      message.type === 'system_notification'
      && message.subtype === 'workflow_blocked'
    ))

    const messages = parseSentMessages(ws)
    expect(messages).toContainEqual(expect.objectContaining({
      type: 'system_notification',
      subtype: 'workflow_blocked',
      data: expect.objectContaining({
        sessionId,
        phaseId: 'requirements-clarification',
        status: action,
        reason: rationale,
        evidence: [expect.objectContaining({ ref: evidenceRef })],
      }),
    }))
    expect(messages).toContainEqual(expect.objectContaining({
      type: 'system_notification',
      subtype: 'workflow_state',
      data: expect.objectContaining({
        mode: 'workflow',
        activePhaseId: 'requirements-clarification',
        pendingConfirmation: false,
        blockedReason: rationale,
        blockedStatus: action,
        blockedEvidence: [expect.objectContaining({ ref: evidenceRef })],
      }),
    }))

    const persisted = await stateService.readState(sessionId)
    expect(persisted.state?.activePhaseId).toBe('requirements-clarification')
    expect(persisted.state?.workflowStatus).toBe('running')
    expect(persisted.state?.pendingConfirmation).toBeNull()
    expect(persisted.state?.phases[0]?.artifactPointers).toContainEqual(expect.objectContaining({
      lifecycleStatus: action,
      submission: expect.objectContaining({
        status: action,
        rationale,
        evidence: [expect.objectContaining({ ref: evidenceRef })],
      }),
    }))
  })

  it('does not project stale blocked recovery fields when pending confirmation is active', () => {
    const sessionId = `workflow-stale-blocked-${crypto.randomUUID()}`
    const pendingState = makePendingWorkflowState(sessionId)
    const staleBlockedArtifact = {
      kind: 'phase-artifact' as const,
      sessionId,
      artifactId: 'requirements-blocked-before-ready',
      schemaVersion: 1,
      createdAt: '2026-05-20T00:00:30.000Z',
      updatedAt: '2026-05-20T00:00:30.000Z',
      label: 'Requirements blocked before ready',
      phaseId: 'requirements-clarification',
      title: 'Requirements blocked before ready',
      lifecycleStatus: 'blocked' as const,
      submission: {
        phaseId: 'requirements-clarification',
        stateVersion: 1,
        status: 'blocked' as const,
        handoff: {
          summary: 'Old blocked handoff.',
          artifacts: [],
          next: 'Resolve the blocker before continuing.',
        },
        rationale: 'Old blocked recovery reason.',
        evidence: [
          {
            kind: 'runtime-status',
            label: 'Old blocked evidence',
            ref: '.planning/debug/old-blocker.md',
          },
        ],
      },
    }
    const activePhase = pendingState.phases[0]!
    const state = {
      ...pendingState,
      phases: [
        {
          ...activePhase,
          artifactPointers: [
            staleBlockedArtifact,
            ...(activePhase?.artifactPointers ?? []),
          ],
        },
        ...pendingState.phases.slice(1),
      ],
      artifactIndex: [
        staleBlockedArtifact,
        ...pendingState.artifactIndex,
      ],
    } satisfies WorkflowSessionState

    const notification = workflowNotificationForDesktop({
      type: 'system_notification',
      subtype: 'workflow_state',
      data: state,
    })
    const data = notification.data as Record<string, unknown>

    expect(data).toMatchObject({
      mode: 'workflow',
      status: 'pending-confirmation',
      pendingConfirmation: true,
    })
    expect(data).not.toHaveProperty('blockedReason')
    expect(data).not.toHaveProperty('blockedStatus')
    expect(data).not.toHaveProperty('blockedEvidence')
    expect(data).not.toHaveProperty('blockedArtifact')
  })

  it('emits workflow_report_ready after websocket confirmation of final ready phase', async () => {
    const sessionId = `workflow-final-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    const originalConfigDir = process.env.CLAUDE_CONFIG_DIR
    const tempConfigDir = path.join(os.tmpdir(), `cc-jiangxia-websocket-final-report-${crypto.randomUUID()}`)
    process.env.CLAUDE_CONFIG_DIR = tempConfigDir
    spyOn(sessionService, 'getSessionWorkDir').mockResolvedValue(process.cwd())
    spyOn(sessionService, 'appendSessionMetadata').mockResolvedValue()

    try {
      await stateService.writeState(sessionId, makeFinalPendingWorkflowState(sessionId))

      handleWebSocket.open(ws)
      handleWebSocket.message(ws, JSON.stringify({
        type: 'workflow_transition',
        phaseId: 'requirements-clarification',
        action: 'confirm',
        confirmationId: 'submit-final-ready',
        stateVersion: 3,
        transitionId: 'confirm-final-ready',
      }))
      await waitForCondition(() => parseSentMessages(ws).some((message) =>
        message.type === 'system_notification'
        && message.subtype === 'workflow_report_ready'
      ))

      expect(parseSentMessages(ws)).toContainEqual(expect.objectContaining({
        type: 'system_notification',
        subtype: 'workflow_report_ready',
        data: expect.objectContaining({
          sessionId,
          reportPointer: expect.objectContaining({
            kind: 'final-report',
            artifactId: 'final',
          }),
        }),
      }))

      const reportPath = path.join(tempConfigDir, 'cc-jiangxia', 'workflow-sessions', sessionId, 'reports', 'final.json')
      const report = JSON.parse(await fs.readFile(reportPath, 'utf-8')) as Record<string, unknown>
      expect(report).toMatchObject({
        sessionId,
        status: 'completed',
        conversationSummary: 'Workflow completed.',
      })
    } finally {
      if (originalConfigDir === undefined) {
        delete process.env.CLAUDE_CONFIG_DIR
      } else {
        process.env.CLAUDE_CONFIG_DIR = originalConfigDir
      }
      await fs.rm(tempConfigDir, { recursive: true, force: true })
    }
  })

  it('rejects dialogue websocket workflow transitions without leaking workflow metadata', async () => {
    const sessionId = `dialogue-transition-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)

    handleWebSocket.open(ws)
    handleWebSocket.message(ws, JSON.stringify({
      type: 'workflow_transition',
      phaseId: 'requirements-clarification',
      action: 'confirm',
      stateVersion: 1,
      transitionId: 'dialogue-confirm',
    }))
    await waitForCondition(() => parseSentMessages(ws).some((message) => message.type === 'error'))

    const messages = parseSentMessages(ws)
    expect(messages).toContainEqual(expect.objectContaining({
      type: 'error',
      code: 'WORKFLOW_NOT_ENABLED',
    }))
    const serialized = JSON.stringify(messages)
    expect(serialized).not.toContain('workflow_state')
    expect(serialized).not.toContain('workflow_transition')
    expect(serialized).not.toContain('pendingConfirmation')
    expect(serialized).not.toContain('activePhaseId')
  })

  it('retries a blocked current phase without reviving a stale next-phase confirmation', async () => {
    const sessionId = `workflow-retry-blocked-current-phase-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    const blockedReason = 'Finish the required B4 verification before advancing.'
    const state = makePendingWorkflowState(sessionId)
    state.status = 'failed'
    state.workflowStatus = 'failed'
    state.runStatus = 'blocked'
    state.blockedReason = blockedReason
    state.phases[0] = {
      ...state.phases[0],
      status: 'failed',
      blockedReason,
    }

    spyOn(sessionService, 'getSessionWorkDir').mockResolvedValue(process.cwd())
    spyOn(sessionService, 'appendSessionMetadata').mockResolvedValue()
    spyOn(conversationService, 'hasSession').mockReturnValue(true)
    spyOn(conversationService, 'getSessionWorkDir').mockReturnValue(process.cwd())
    spyOn(conversationService, 'stopSessionAndWait').mockResolvedValue()
    spyOn(conversationService, 'startSession').mockResolvedValue()
    spyOn(conversationService, 'onOutput').mockImplementation(() => {})
    spyOn(conversationService, 'clearOutputCallbacks').mockImplementation(() => {})
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
    await stateService.writeState(sessionId, state)

    handleWebSocket.open(ws)
    handleWebSocket.message(ws, JSON.stringify({
      type: 'workflow_transition',
      phaseId: 'requirements-clarification',
      action: 'retry',
      stateVersion: state.stateVersion,
      transitionId: 'retry-blocked-current-phase',
    }))

    await waitForCondition(() => sendMessage.mock.calls.some(([receivedSessionId, prompt]) => (
      receivedSessionId === sessionId
      && typeof prompt === 'string'
      && prompt.includes('retried current workflow phase: requirements-clarification')
    )))

    const persisted = await stateService.readState(sessionId)
    expect(persisted.state).toMatchObject({
      workflowStatus: 'running',
      runStatus: 'active',
      activePhaseId: 'requirements-clarification',
      pendingConfirmation: null,
    })
    expect(persisted.state?.phases[0]).toMatchObject({
      id: 'requirements-clarification',
      status: 'running',
    })
    expect(persisted.state?.phases[0]?.blockedReason).toBeUndefined()
    expect(persisted.state?.blockedReason).toBeUndefined()
    expect(persisted.state?.transitionHistory.at(-1)).toMatchObject({
      action: 'retry',
      result: 'accepted',
      fromPhaseId: 'requirements-clarification',
      toPhaseId: 'requirements-clarification',
    })
    expect(sendMessage).toHaveBeenCalledWith(
      sessionId,
      expect.stringContaining('Repair the recorded blocker before attempting any next-phase completion.'),
    )
  })

  it('sends desktop-consumable workflow summaries after websocket phase transitions', async () => {
    const sessionId = `workflow-confirm-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    const appendSessionMetadata = spyOn(sessionService, 'appendSessionMetadata').mockResolvedValue()
    spyOn(sessionService, 'getSessionWorkDir').mockResolvedValue(process.cwd())
    // Confirming this transition schedules workflow_auto_continue; keep this state-summary test isolated from the real CLI.
    spyOn(conversationService, 'sendMessage').mockReturnValue(true)
    spyOn(conversationService, 'startSession').mockResolvedValue()
    spyOn(conversationService, 'stopSessionAndWait').mockResolvedValue()
    spyOn(conversationService, 'hasSession').mockReturnValue(true)
    spyOn(conversationService, 'getSessionWorkDir').mockReturnValue(process.cwd())
    spyOn(conversationService, 'onOutput').mockImplementation(() => {})
    spyOn(conversationService, 'clearOutputCallbacks').mockImplementation(() => {})
    await stateService.writeState(sessionId, makeWorkflowState(sessionId))

    handleWebSocket.open(ws)
    handleWebSocket.message(ws, JSON.stringify({
      type: 'workflow_transition',
      phaseId: 'requirements-clarification',
      action: 'retry',
      transitionId: 'retry-ready',
    }))
    await waitForCondition(() => parseSentMessages(ws).some((message) =>
      message.type === 'system_notification'
      && message.subtype === 'workflow_state'
    ))
    const pendingWorkflowState = parseSentMessages(ws).find((message) =>
      message.type === 'system_notification'
      && message.subtype === 'workflow_state'
    )
    const pendingWorkflow = pendingWorkflowState?.data as {
      pendingConfirmationId?: string
      stateVersion?: number
    } | undefined
    expect(pendingWorkflow?.pendingConfirmationId).toBeTruthy()
    expect(pendingWorkflow?.stateVersion).toBeTypeOf('number')

    handleWebSocket.message(ws, JSON.stringify({
      type: 'workflow_transition',
      phaseId: 'requirements-clarification',
      action: 'confirm',
      confirmationId: pendingWorkflow?.pendingConfirmationId,
      stateVersion: pendingWorkflow?.stateVersion,
      transitionId: 'confirm-ready',
    }))
    await waitForCondition(() => parseSentMessages(ws).filter((message) =>
      message.type === 'system_notification'
      && message.subtype === 'workflow_state'
    ).length >= 2)

    const workflowStates = parseSentMessages(ws).filter((message) =>
      message.type === 'system_notification'
      && message.subtype === 'workflow_state'
    )

    expect(workflowStates).toHaveLength(2)
    expect(workflowStates[0]).toMatchObject({
      data: {
        mode: 'workflow',
        templateId: 'requirements-to-implementation',
        status: 'pending-confirmation',
        activePhaseId: 'requirements-clarification',
        activePhaseIndex: 0,
        pendingConfirmation: true,
        statePointer: {
          kind: 'workflow-state',
          sessionId,
        },
      },
    })
    expect(workflowStates[0]?.data).not.toHaveProperty('phases')
    expect(workflowStates[1]).toMatchObject({
      data: {
        mode: 'workflow',
        status: 'running',
        activePhaseId: 'technical-design',
        activePhaseIndex: 1,
        pendingConfirmation: false,
        transitionAuthority: 'user-confirmation',
      },
    })
    expect(appendSessionMetadata).toHaveBeenLastCalledWith(sessionId, expect.objectContaining({
      workDir: process.cwd(),
      workflow: expect.objectContaining({
        mode: 'workflow',
        status: 'running',
        activePhaseId: 'technical-design',
        transitionAuthority: 'user-confirmation',
      }),
    }))
  })
})
