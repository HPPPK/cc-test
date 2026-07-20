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
  type WebSocketData,
} from '../ws/handler.js'
import { conversationService } from '../services/conversationService.js'
import { computerUseApprovalService } from '../services/computerUseApprovalService.js'
import { sessionService } from '../services/sessionService.js'
import { WorkflowSessionStateService } from '../services/workflowSessionStateService.js'
import type { WorkflowSessionState, WorkflowTemplate } from '../services/workflowTypes.js'
import { setWorkflowRuntimeTemplateLoaderForTests } from '../services/workflowRuntimeTemplateService.js'

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

function makeClientSocket(sessionId: string) {
  const sent: string[] = []
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
      sent.push(payload)
    }),
    close: mock(() => {}),
    sent,
  } as unknown as ServerWebSocket<WebSocketData> & { sent: string[] }
}

async function flushAsyncHandlers() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

async function waitForCondition(
  predicate: () => boolean,
  timeoutMs = 2000,
): Promise<void> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) break
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

function makeWorkflowState(sessionId: string): WorkflowSessionState {
  const now = '2026-05-20T00:00:00.000Z'
  return {
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
  return {
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
  }
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

  it('does not consume terminal recovery twice when the recovery turn ends with a tool-registration error', async () => {
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
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
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

      await waitForCondition(() => parseSentMessages(ws).some((message) =>
        message.type === 'error' && message.code === 'CLI_ERROR'
      ))

      expect(sendMessage).toHaveBeenCalledTimes(1)
      expect(parseSentMessages(ws)).not.toContainEqual(expect.objectContaining({
        type: 'error',
        code: 'WORKFLOW_TERMINAL_PROTOCOL_REQUIRED',
      }))
    } finally {
      conversationService.stopSession(sessionId)
    }
  })

  it('rebinds and retries when a submit tool-result error is followed by a successful CLI result', async () => {
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
      callback({ type: 'result', is_error: false, usage: { input_tokens: 1, output_tokens: 1 } })

      await waitForCondition(() => startSession.mock.calls.length === 1 && sendMessage.mock.calls.length === 1)

      expect(stopSessionAndWait).toHaveBeenCalledWith(sessionId)
      expect(sendMessage).toHaveBeenCalledWith(
        sessionId,
        expect.stringContaining('<workflow-protocol-binding-recovery>'),
      )
      expect(sendMessage.mock.calls[0]?.[1]).toContain('submit_phase_completion')
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
    const startSession = spyOn(conversationService, 'startSession').mockResolvedValue()
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
      callback(protocolError)

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

  it('fails visibly instead of looping when the recovery turn again asks a prose decision question', async () => {
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

      await waitForCondition(() => parseSentMessages(ws).some((message) =>
        message.type === 'error'
        && message.code === 'WORKFLOW_TERMINAL_PROTOCOL_REQUIRED'
      ))

      expect(sendMessage).toHaveBeenCalledTimes(1)
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

  it('injects the active Expert Runtime into an ordinary chat turn on the server', async () => {
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

    const expertTurn = sendMessage.mock.calls[0]?.[1] ?? ''
    expect(expertTurn).toContain('<expert-runtime>')
    expect(expertTurn).toContain('Repository health (repo-health-check)')
    expect(expertTurn).toContain('Repository health review')
    expect(expertTurn).toContain('- Read')
    expect(expertTurn).toContain('read-only: Do not mutate repository files.')
    expect(expertTurn).toContain('<expert-user-request>')
    expect(expertTurn).toContain('Please inspect the project health.')
    expect(expertTurn).toContain('</expert-user-request>')
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

  it('starts requirements-phase workflow sessions with write tools hard-denied at CLI launch', async () => {
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
    expect(disallowedTools).toEqual(expect.arrayContaining([
      'Write',
      'Edit',
      'MultiEdit',
      'NotebookEdit',
    ]))
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
    it(`rebinds an existing CLI to ${workflow.name} follow-up Stage 1 tools and hard permissions`, async () => {
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
      expect(disallowedTools).toEqual(expect.arrayContaining([
        'Write',
        'Edit',
        'MultiEdit',
        'NotebookEdit',
        'Bash',
        'PowerShell',
        'Agent',
      ]))
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

  it('starts custom phase tool-policy workflow sessions with a matching CLI allow-list', async () => {
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
    const disallowedTools = startSession.mock.calls[0]?.[3]?.disallowedTools ?? []
    expect(disallowedTools).not.toContain('Bash')
    for (const toolName of ['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Agent', 'workflow_template_authoring']) {
      expect(disallowedTools).toContain(toolName)
    }
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

  it('advances and resumes from an AskUserQuestion advance_phase choice without typed continue', async () => {
    const sessionId = `workflow-choice-advance-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
    const respondToPermission = spyOn(conversationService, 'respondToPermission').mockReturnValue(true)
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
      type: 'permission_response',
      requestId: 'ask-user-workflow-gate',
      allowed: true,
      updatedInput: {
        questions: [{ id: 'confirm_next_action' }],
        answers: { confirm_next_action: '进入下一阶段' },
        workflowChoiceActions: [{
          questionId: 'confirm_next_action',
          choiceId: 'enter_next_stage',
          action: 'advance_phase',
          targetPhaseId: 'technical-design',
        }],
      },
    }))

    await waitForCondition(() => sendMessage.mock.calls.some(([calledSessionId, content]) =>
      calledSessionId === sessionId
      && typeof content === 'string'
      && content.includes('Active phase: technical-design')
    ))
    const persisted = await stateService.readState(sessionId)
    expect(persisted.state?.activePhaseId).toBe('technical-design')
    expect(respondToPermission).not.toHaveBeenCalled()
  })

  it('routes and resumes from an AskUserQuestion jump_to_phase choice without typed continue', async () => {
    const sessionId = `workflow-choice-route-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
    spyOn(conversationService, 'respondToPermission').mockReturnValue(true)
    spyOn(conversationService, 'startSession').mockResolvedValue()
    spyOn(conversationService, 'stopSessionAndWait').mockResolvedValue()
    spyOn(conversationService, 'hasSession').mockReturnValue(true)
    spyOn(conversationService, 'getSessionWorkDir').mockReturnValue(process.cwd())
    spyOn(conversationService, 'onOutput').mockImplementation(() => {})
    spyOn(conversationService, 'clearOutputCallbacks').mockImplementation(() => {})
    spyOn(sessionService, 'getSessionWorkDir').mockResolvedValue(process.cwd())
    spyOn(sessionService, 'appendSessionMetadata').mockResolvedValue()

    const state = makePendingWorkflowState(sessionId)
    state.templateSnapshot.phases.push({
      ...state.templateSnapshot.phases[0]!,
      id: 'delegate-implement',
      label: '分批实现与审查',
      instructions: 'Implement the approved changes.',
    })
    state.phases.push({ id: 'delegate-implement', index: 2, status: 'created', artifactPointers: [] })
    await stateService.writeState(sessionId, state)

    handleWebSocket.open(ws)
    handleWebSocket.message(ws, JSON.stringify({
      type: 'permission_response',
      requestId: 'ask-user-route-gate',
      allowed: true,
      updatedInput: {
        questions: [{ id: 'route_after_validation' }],
        answers: { route_after_validation: '返回 Stage 4 修复该问题' },
        workflowChoiceActions: [{
          questionId: 'route_after_validation',
          choiceId: 'return-to-stage-4',
          action: {
            kind: 'workflow-route',
            intent: 'jump_to_phase',
            targetPhaseId: 'delegate-implement',
          },
        }],
      },
    }))

    await waitForCondition(() => sendMessage.mock.calls.some(([calledSessionId, content]) =>
      calledSessionId === sessionId
      && typeof content === 'string'
      && content.includes('Active phase: delegate-implement')
    ))
    const persisted = await stateService.readState(sessionId)
    expect(persisted.state?.activePhaseId).toBe('delegate-implement')
    expect(persisted.state?.pendingRoute).toBeNull()
    expect(parseSentMessages(ws).filter((message) => message.type === 'error')).toEqual([])
  })

  it('auto-resumes the next phase after a completed auto-transition submission without typed continue', async () => {
    const sessionId = `workflow-completed-auto-${crypto.randomUUID()}`
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

    await waitForCondition(() => sendMessage.mock.calls.some(([calledSessionId, content]) =>
      calledSessionId === sessionId
      && typeof content === 'string'
      && content.includes('Active phase: technical-design')
    ))
    const persisted = await stateService.readState(sessionId)
    expect(persisted.state?.activePhaseId).toBe('technical-design')
    expect(sendMessage).toHaveBeenCalledWith(
      sessionId,
      expect.stringContaining('Active phase: technical-design'),
    )
  })

  it('automatically starts the next workflow phase after user-confirmed advancement', async () => {
    const sessionId = `workflow-auto-confirm-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
    const startSession = spyOn(conversationService, 'startSession').mockResolvedValue()
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
      stateVersion: 3,
      transitionId: 'confirm-auto-continue',
    }))
    await waitForCondition(() => sendMessage.mock.calls.some(([calledSessionId, content]) =>
      calledSessionId === sessionId
      && typeof content === 'string'
      && content.includes('Active phase: technical-design')
    ))

    expect(startSession).toHaveBeenCalled()
    const autoContinuePrompts = sendMessage.mock.calls.filter(([calledSessionId, content]) =>
      calledSessionId === sessionId
      && typeof content === 'string'
      && content.includes('Continue automatically with the newly confirmed workflow phase: technical-design.')
    )
    expect(autoContinuePrompts).toHaveLength(1)
    expect(autoContinuePrompts[0]?.[1]).toContain('Workflow mode')
    expect(autoContinuePrompts[0]?.[1]).toContain('Active phase: technical-design')
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
      stateVersion: 3,
      transitionId: 'reject-and-adjust',
    }))

    await waitForCondition(() => sendMessage.mock.calls.some(([calledSessionId, content]) =>
      calledSessionId === sessionId
      && typeof content === 'string'
      && content.includes('The user rejected the completion result for the current workflow phase: requirements-clarification.')
    ))

    expect(stopSessionAndWait).toHaveBeenCalledTimes(2)
    expect(startSession).toHaveBeenCalledTimes(2)
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
      stateVersion: 2,
      transitionId: 'stale-requirements-ready',
    }))
    await waitForCondition(() => parseSentMessages(ws).some((message) => message.type === 'error'))

    const messages = parseSentMessages(ws)
    expect(messages).toContainEqual(expect.objectContaining({
      type: 'error',
      code: 'WORKFLOW_STATE_STALE',
    }))
    const persisted = await stateService.readState(sessionId)
    expect(persisted.state?.activePhaseId).toBe('requirements-clarification')
    expect(persisted.state?.pendingConfirmation).toMatchObject({ status: 'pending' })
  })

  it('replays duplicate websocket transitionId without duplicate advancement or notifications', async () => {
    const sessionId = `workflow-duplicate-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    spyOn(sessionService, 'getSessionWorkDir').mockResolvedValue(process.cwd())
    spyOn(sessionService, 'appendSessionMetadata').mockResolvedValue()
    await stateService.writeState(sessionId, makePendingWorkflowState(sessionId))

    handleWebSocket.open(ws)
    handleWebSocket.message(ws, JSON.stringify({
      type: 'workflow_transition',
      phaseId: 'requirements-clarification',
      action: 'confirm',
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
      stateVersion: 4,
      transitionId: 'confirm-requirements-idempotent',
    }))
    await flushAsyncHandlers()

    const transitions = parseSentMessages(ws).filter((message) =>
      message.type === 'system_notification'
      && message.subtype === 'workflow_transition'
    )
    const persisted = await stateService.readState(sessionId)
    expect(transitions.filter((message) =>
      (message.data as { transitionId?: string }).transitionId === 'confirm-requirements-idempotent'
    )).toHaveLength(1)
    expect(persisted.state?.activePhaseId).toBe('technical-design')
    expect(persisted.state?.phases[0]?.artifactPointers).toHaveLength(1)
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
    handleWebSocket.message(ws, JSON.stringify({
      type: 'workflow_transition',
      phaseId: 'requirements-clarification',
      action: 'confirm',
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
