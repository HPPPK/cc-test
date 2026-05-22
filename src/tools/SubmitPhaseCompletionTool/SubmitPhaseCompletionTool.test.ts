import { afterEach, describe, expect, test } from 'bun:test'
import type { Tool, ToolUseContext } from '../../Tool.js'
import { findToolByName, getEmptyToolPermissionContext } from '../../Tool.js'
import { assembleWorkflowToolPool, getAllBaseTools } from '../../tools.js'

const TOOL_NAME = 'submit_phase_completion'
const originalDesktopServerUrl = process.env.CC_HAHA_DESKTOP_SERVER_URL
const originalWorkflowSessionId = process.env.CC_HAHA_WORKFLOW_SESSION_ID
const originalAnthropicApiKey = process.env.ANTHROPIC_API_KEY

afterEach(() => {
  if (originalDesktopServerUrl === undefined) delete process.env.CC_HAHA_DESKTOP_SERVER_URL
  else process.env.CC_HAHA_DESKTOP_SERVER_URL = originalDesktopServerUrl

  if (originalWorkflowSessionId === undefined) delete process.env.CC_HAHA_WORKFLOW_SESSION_ID
  else process.env.CC_HAHA_WORKFLOW_SESSION_ID = originalWorkflowSessionId

  if (originalAnthropicApiKey === undefined) delete process.env.ANTHROPIC_API_KEY
  else process.env.ANTHROPIC_API_KEY = originalAnthropicApiKey
})

async function loadTool(): Promise<Tool> {
  const mod = await import('./SubmitPhaseCompletionTool.js') as {
    SubmitPhaseCompletionTool?: Tool
  }

  expect(mod.SubmitPhaseCompletionTool).toBeDefined()
  if (!mod.SubmitPhaseCompletionTool) {
    throw new Error('SubmitPhaseCompletionTool export is required')
  }
  return mod.SubmitPhaseCompletionTool
}

function contextFor(mode: 'workflow' | 'dialogue'): ToolUseContext {
  return {
    options: {
      commands: [],
      debug: false,
      mainLoopModel: 'claude-sonnet-4',
      tools: [],
      verbose: false,
      thinkingConfig: {},
      mcpClients: [],
      mcpResources: {},
      isNonInteractiveSession: false,
      agentDefinitions: { activeAgents: [], inactiveAgents: [] },
    },
    abortController: new AbortController(),
    readFileState: {} as ToolUseContext['readFileState'],
    getAppState: () => ({
      workflow: mode === 'workflow'
        ? {
            mode: 'workflow',
            activePhaseId: 'requirements',
            workflowStatus: 'running',
            status: 'running',
            stateVersion: 3,
          }
        : undefined,
      toolPermissionContext: getEmptyToolPermissionContext(),
    } as unknown as ReturnType<ToolUseContext['getAppState']>),
    setAppState: () => {},
    setInProgressToolUseIDs: () => {},
    setResponseLength: () => {},
    updateFileHistoryState: () => {},
    updateAttributionState: () => {},
    messages: [],
  }
}

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    phaseId: 'requirements',
    stateVersion: 3,
    status: 'ready',
    handoff: {
      summary: 'Requirements are ready for user confirmation.',
      artifacts: [],
      next: 'Confirm or reject this phase completion.',
    },
    rationale: 'The required requirements artifact was produced.',
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

describe('SubmitPhaseCompletionTool', () => {
  test('uses the exact workflow completion tool name and is absent from the base dialogue registry', async () => {
    const SubmitPhaseCompletionTool = await loadTool()

    expect(SubmitPhaseCompletionTool.name).toBe(TOOL_NAME)
    expect(findToolByName(getAllBaseTools(), TOOL_NAME)).toBeUndefined()
  })

  test('is added to the assembled tool pool for active workflow sessions', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'

    const tools = assembleWorkflowToolPool(
      getEmptyToolPermissionContext(),
      [],
      {
        mode: 'workflow',
        activePhaseId: 'discussion',
        workflowStatus: 'running',
        status: 'running',
      } as any,
    )

    expect(findToolByName(tools, TOOL_NAME)?.name).toBe(TOOL_NAME)
  })

  test('requires phaseId, stateVersion, status, handoff, rationale, and evidence', async () => {
    const SubmitPhaseCompletionTool = await loadTool()

    for (const field of ['phaseId', 'stateVersion', 'status', 'handoff', 'rationale', 'evidence']) {
      const input = validInput({ [field]: undefined })

      expect(SubmitPhaseCompletionTool.inputSchema.safeParse(input).success, field).toBe(false)
    }
  })

  test.each(['ready', 'blocked', 'unable'] as const)('accepts %s completion status', async (status) => {
    const SubmitPhaseCompletionTool = await loadTool()

    expect(SubmitPhaseCompletionTool.inputSchema.safeParse(validInput({ status })).success).toBe(true)
  })

  test('rejects unsupported completion statuses', async () => {
    const SubmitPhaseCompletionTool = await loadTool()
    const result = SubmitPhaseCompletionTool.inputSchema.safeParse(validInput({ status: 'done' }))

    expect(result.success).toBe(false)
  })

  test('fails closed when used outside a workflow session', async () => {
    const SubmitPhaseCompletionTool = await loadTool()
    const result = await SubmitPhaseCompletionTool.validateInput?.(
      validInput(),
      contextFor('dialogue'),
    )

    expect(result).toMatchObject({
      result: false,
      message: expect.stringContaining('workflow'),
    })
  })

  test('allows validation to continue for active workflow sessions', async () => {
    const SubmitPhaseCompletionTool = await loadTool()
    const result = await SubmitPhaseCompletionTool.validateInput?.(
      validInput(),
      contextFor('workflow'),
    )

    expect(result).toEqual({ result: true })
  })

  test('submits through the desktop workflow transition API when launched by Desktop', async () => {
    const requests: Array<{ method: string; url: string; body: unknown }> = []
    const server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      async fetch(req) {
        const url = new URL(req.url)
        if (req.method === 'GET' && url.pathname === '/api/sessions/workflow-session-123/workflow') {
          requests.push({ method: req.method, url: url.pathname, body: null })
          return Response.json({
            state: {
              mode: 'workflow',
              activePhaseId: 'requirements',
              stateVersion: 8,
            },
            workflow: { activePhaseId: 'requirements' },
          })
        }

        requests.push({
          method: req.method,
          url: url.pathname,
          body: await req.json(),
        })
        return Response.json({
          workflow: { status: 'pending-confirmation', activePhaseId: 'requirements' },
          state: { mode: 'workflow', activePhaseId: 'requirements', stateVersion: 4 },
        })
      },
    })

    process.env.CC_HAHA_DESKTOP_SERVER_URL = `http://127.0.0.1:${server.port}`
    process.env.CC_HAHA_WORKFLOW_SESSION_ID = 'workflow-session-123'

    try {
      const SubmitPhaseCompletionTool = await loadTool()
      const result = await SubmitPhaseCompletionTool.call(validInput(), contextFor('workflow'))

      expect(requests).toHaveLength(2)
      expect(requests[0]?.method).toBe('GET')
      expect(requests[0]?.url).toBe('/api/sessions/workflow-session-123/workflow')
      expect(requests[1]?.method).toBe('POST')
      expect(requests[1]?.url).toBe('/api/sessions/workflow-session-123/workflow/transition')
      expect(requests[1]?.body).toMatchObject({
        action: 'ready',
        phaseId: 'requirements',
        stateVersion: 8,
        rationale: 'The required requirements artifact was produced.',
      })
      expect(result.data.message).toContain('user confirmation')
    } finally {
      server.stop(true)
    }
  })

  test('does not submit stale phase completions when the desktop active phase changed', async () => {
    const requests: Array<{ method: string; url: string }> = []
    const server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch(req) {
        const url = new URL(req.url)
        requests.push({ method: req.method, url: url.pathname })
        return Response.json({
          state: {
            mode: 'workflow',
            activePhaseId: 'design',
            stateVersion: 9,
          },
          workflow: { activePhaseId: 'design' },
        })
      },
    })

    process.env.CC_HAHA_DESKTOP_SERVER_URL = `http://127.0.0.1:${server.port}`
    process.env.CC_HAHA_WORKFLOW_SESSION_ID = 'workflow-session-123'

    try {
      const SubmitPhaseCompletionTool = await loadTool()
      await expect(SubmitPhaseCompletionTool.call(validInput(), contextFor('workflow')))
        .rejects
        .toThrow('active workflow phase')

      expect(requests).toEqual([
        { method: 'GET', url: '/api/sessions/workflow-session-123/workflow' },
      ])
    } finally {
      server.stop(true)
    }
  })
})
