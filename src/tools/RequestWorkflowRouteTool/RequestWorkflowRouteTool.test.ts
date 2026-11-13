import { callToolFixture } from '../toolFixtures.test.js'
import { getDefaultAppState } from '../../state/AppStateStore.js'
import { toolPromptFixture } from '../toolFixtures.test.js'
import { afterEach, describe, expect, test } from 'bun:test'
import type { Tool, ToolUseContext } from '../../Tool.js'
import { getEmptyToolPermissionContext } from '../../Tool.js'

const originalDesktopServerUrl = process.env.CC_JIANGXIA_DESKTOP_SERVER_URL
const originalWorkflowSessionId = process.env.CC_JIANGXIA_WORKFLOW_SESSION_ID

afterEach(() => {
  if (originalDesktopServerUrl === undefined) delete process.env.CC_JIANGXIA_DESKTOP_SERVER_URL
  else process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = originalDesktopServerUrl

  if (originalWorkflowSessionId === undefined) delete process.env.CC_JIANGXIA_WORKFLOW_SESSION_ID
  else process.env.CC_JIANGXIA_WORKFLOW_SESSION_ID = originalWorkflowSessionId
})

async function loadTool(): Promise<typeof import('./RequestWorkflowRouteTool.js')['RequestWorkflowRouteTool']> {
  const mod = await import('./RequestWorkflowRouteTool.js')
  if (!mod.RequestWorkflowRouteTool) throw new Error('RequestWorkflowRouteTool export is required')
  return mod.RequestWorkflowRouteTool
}

function contextFor(): ToolUseContext {
  return {
    options: {
      commands: [],
      debug: false,
      mainLoopModel: 'claude-sonnet-4',
      tools: [],
      verbose: false,
      thinkingConfig: { type: 'disabled' },
      mcpClients: [],
      mcpResources: {},
      isNonInteractiveSession: false,
      agentDefinitions: { activeAgents: [], allAgents: [] },
    },
    abortController: new AbortController(),
    readFileState: {} as ToolUseContext['readFileState'],
    getAppState: () => ({ ...getDefaultAppState(),  toolPermissionContext: getEmptyToolPermissionContext()  }),
    setAppState: () => {},
    setInProgressToolUseIDs: () => {},
    setResponseLength: () => {},
    updateFileHistoryState: () => {},
    updateAttributionState: () => {},
    messages: [],
  }
}

describe('RequestWorkflowRouteTool', () => {
  test('is strict and validates jump target requirements', async () => {
    const tool = await loadTool()
    expect(tool.name).toBe('request_workflow_route')
    expect(tool.strict).toBe(true)
    const valid = {
      intent: 'jump_to_phase',
      requireUserConfirmation: true,
      targetPhaseId: 'delegate-implement',
      rationale: 'Validation found an implementation defect.',
      evidence: [{ kind: 'test', ref: 'route-regression' }],
    }
    expect(tool.inputSchema.safeParse(valid).success).toBe(true)
    expect(tool.inputSchema.safeParse({ ...valid, targetPhaseId: undefined }).success).toBe(false)
    expect(tool.inputSchema.safeParse({
      intent: 'route_to_workflow',
      targetWorkflowId: 'debug-repair-workflow-v8',
      rationale: 'Switch workflows.',
      evidence: [],
    }).success).toBe(true)
    expect(tool.inputSchema.safeParse({
      intent: 'route_to_workflow',
      rationale: 'A route-to-workflow request must name its target.',
      evidence: [],
    }).success).toBe(false)
    expect(tool.inputSchema.safeParse({ ...valid, unknown: true }).success).toBe(false)
    expect(tool.inputSchema.safeParse({
      intent: 'advance',
      rationale: 'Ordinary linear progression.',
      evidence: [],
    }).success).toBe(true)
    const defaultConfirmation = tool.inputSchema.safeParse(valid)
    expect(defaultConfirmation.success).toBe(true)
    if (defaultConfirmation.success) expect(defaultConfirmation.data.requireUserConfirmation).toBe(true)
    expect(tool.inputSchema.safeParse({ ...valid, requireUserConfirmation: false }).success).toBe(false)
  })

  test('instructs the model not to route to the ordinary linear next phase', async () => {
    const tool = await loadTool()
    const prompt = await tool.prompt(toolPromptFixture())

    expect(prompt).toContain('Do not use advance for ordinary linear progression')
    expect(prompt).toContain('immediate linear next phase')
    expect(prompt).toContain('status blocked or needs_user')
    expect(prompt).toContain('route_to_workflow requires targetWorkflowId')
    expect(prompt).toContain('structured unsupported error')
    expect(prompt).toContain('Every normal model-requested route waits for explicit user confirmation')
    expect(prompt).toContain('one-time recovery credential')
    expect(prompt).toContain('does not expire while the model is reasoning')
    expect(prompt).toContain('server may apply that first constrained repair without a user click')
  })

  test('reports a same-target route as the existing normal completion confirmation, not a second pending route', async () => {
    const server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      async fetch(req) {
        const url = new URL(req.url)
        if (req.method === 'GET') {
          return Response.json({
            state: {
              mode: 'workflow',
              activePhaseId: 'delegate-implement',
              stateVersion: 19,
              workflowLanguage: 'zh',
            },
          })
        }

        expect(url.pathname).toBe('/api/sessions/workflow-session-123/workflow/transition')
        return Response.json({
          state: {
            mode: 'workflow',
            activePhaseId: 'delegate-implement',
            stateVersion: 19,
            workflowLanguage: 'zh',
            pendingConfirmation: {
              phaseId: 'delegate-implement',
              toPhaseId: 'scenario-review',
              status: 'pending',
            },
            pendingRoute: null,
          },
          route: {
            approvedTargetPhaseId: 'scenario-review',
            routeReason: 'Re-validate the repair.',
            requiresConfirmation: true,
          },
        })
      },
    })
    process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = `http://127.0.0.1:${server.port}`
    process.env.CC_JIANGXIA_WORKFLOW_SESSION_ID = 'workflow-session-123'

    try {
      const tool = await loadTool()
      const result = await callToolFixture(tool, {
        intent: 'jump_to_phase',
      requireUserConfirmation: true,
        targetPhaseId: 'scenario-review',
        rationale: 'Re-validate the repair.',
        evidence: [{ kind: 'repair', ref: 'AC10' }],
      }, contextFor()) as { data: { message: string } }

      expect(result.data.message).toContain('正常阶段完成确认')
      expect(result.data.message).toContain('scenario-review')
      expect(result.data.message).not.toContain('路由正在等待确认')
    } finally {
      server.stop(true)
    }
  })
})
