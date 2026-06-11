import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test'
import type { ServerWebSocket } from 'bun'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  __resetWebSocketHandlerStateForTests,
  closeSessionConnection,
  getActiveSessionIds,
  handleWebSocket,
  sendToSession,
  type WebSocketData,
} from '../ws/handler.js'
import { conversationService } from '../services/conversationService.js'
import { computerUseApprovalService } from '../services/computerUseApprovalService.js'
import { sessionService } from '../services/sessionService.js'
import { WorkflowSessionStateService } from '../services/workflowSessionStateService.js'
import type { WorkflowSessionState } from '../services/workflowTypes.js'

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
  timeoutMs = 250,
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
        index: 0,
        status: 'running',
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
    stateVersion: 1,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    pendingConfirmation: null,
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
})

describe('WebSocket handler workflow runtime gating', () => {
  afterEach(() => {
    __resetWebSocketHandlerStateForTests()
    mock.restore()
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

  it('assembles workflow-only phase guidance before sending a workflow session user turn', async () => {
    const sessionId = `workflow-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
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

    handleWebSocket.open(ws)
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

  it('starts requirements-phase workflow sessions with mutating tools denied at CLI launch', async () => {
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
      type: 'user_message',
      content: 'Clarify requirements first.',
    }))
    await waitForCondition(() => startSession.mock.calls.length > 0)

    expect(startSession).toHaveBeenCalled()
    expect(startSession.mock.calls[0]?.[3]).toMatchObject({
      disallowedTools: ['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'PowerShell', 'Agent'],
    })
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

  it('automatically starts the next workflow phase after user-confirmed advancement', async () => {
    const sessionId = `workflow-auto-confirm-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const stateService = new WorkflowSessionStateService()
    const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
    const startSession = spyOn(conversationService, 'startSession').mockResolvedValue()
    spyOn(conversationService, 'stopSession').mockImplementation(() => {})
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

  it('restarts an active CLI when the same runtime selection is force-reapplied', async () => {
    const sessionId = `runtime-force-${crypto.randomUUID()}`
    const ws = makeClientSocket(sessionId)
    const startSession = spyOn(conversationService, 'startSession').mockResolvedValue()
    spyOn(conversationService, 'stopSession').mockImplementation(() => {})
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

  it.each(['reject', 'retry'] as const)(
    'does not auto-start a next workflow phase after %s transition decisions',
    async (action) => {
      const sessionId = `workflow-no-auto-${action}-${crypto.randomUUID()}`
      const ws = makeClientSocket(sessionId)
      const stateService = new WorkflowSessionStateService()
      const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
      spyOn(conversationService, 'startSession').mockResolvedValue()
      spyOn(conversationService, 'stopSession').mockImplementation(() => {})
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
