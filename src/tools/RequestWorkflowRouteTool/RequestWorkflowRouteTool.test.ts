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

async function loadTool(): Promise<Tool> {
  const mod = await import('./RequestWorkflowRouteTool.js') as { RequestWorkflowRouteTool?: Tool }
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
      thinkingConfig: {},
      mcpClients: [],
      mcpResources: {},
      isNonInteractiveSession: false,
      agentDefinitions: { activeAgents: [], inactiveAgents: [] },
    },
    abortController: new AbortController(),
    readFileState: {} as ToolUseContext['readFileState'],
    getAppState: () => ({ toolPermissionContext: getEmptyToolPermissionContext() }) as ReturnType<ToolUseContext['getAppState']>,
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
      targetPhaseId: 'delegate-implement',
      rationale: 'Validation found an implementation defect.',
      evidence: [{ kind: 'test', ref: 'route-regression' }],
    }
    expect(tool.inputSchema.safeParse(valid).success).toBe(true)
    expect(tool.inputSchema.safeParse({ ...valid, targetPhaseId: undefined }).success).toBe(false)
    expect(tool.inputSchema.safeParse({ ...valid, unknown: true }).success).toBe(false)
  })

  test('instructs the model not to route to the ordinary linear next phase', async () => {
    const tool = await loadTool()
    const prompt = await tool.prompt()

    expect(prompt).toContain('Do not use this tool for ordinary linear progression')
    expect(prompt).toContain('immediate linear next phase')
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
      const result = await tool.call({
        intent: 'jump_to_phase',
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
