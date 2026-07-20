import { z } from 'zod/v4'
import type { Tool, ToolUseContext } from '../../Tool.js'
import { buildTool, type ToolDef } from '../../Tool.js'
import { WorkflowRuntimeService } from '../../server/services/workflowRuntimeService.js'
import {
  REQUEST_WORKFLOW_ROUTE_TOOL_NAME,
  getWorkflowScopedToolNames,
} from '../../server/services/workflowToolPolicy.js'
import type {
  WorkflowRouteIntent,
  WorkflowRouteRequest,
  WorkflowSessionState,
} from '../../server/services/workflowTypes.js'
import { getJiangxiaEnvValue } from '../../utils/appIdentity.js'
import { lazySchema } from '../../utils/lazySchema.js'

const routeIntentSchema = z.enum([
  'advance',
  'rework_current_phase',
  'jump_to_phase',
  'route_to_workflow',
  'pause',
  'resume',
  'finish',
])

const evidenceSchema = z.record(z.string(), z.unknown())

const inputSchema = lazySchema(() =>
  z.strictObject({
    phaseId: z.string().min(1).optional().describe('Current workflow phase ID. Omit to use the active phase.'),
    stateVersion: z.number().int().nonnegative().optional().describe('Current workflow state version. Omit to refresh it from the runtime.'),
    intent: routeIntentSchema.describe('Requested workflow route intent.'),
    targetPhaseId: z.string().min(1).optional().describe('Required only for jump_to_phase.'),
    targetWorkflowId: z.string().min(1).optional().describe('Required only for route_to_workflow.'),
    rationale: z.string().min(1).describe('Non-empty explanation for the requested route.'),
    evidence: z.array(evidenceSchema).describe('Structured evidence supporting this route.'),
    requireUserConfirmation: z.boolean().default(true).describe('Whether the route must be shown to the user before execution.'),
  }).superRefine((value, ctx) => {
    if (value.intent === 'jump_to_phase' && !value.targetPhaseId?.trim()) {
      ctx.addIssue({ code: 'custom', path: ['targetPhaseId'], message: 'jump_to_phase requires targetPhaseId.' })
    }
    if (value.intent === 'route_to_workflow' && !value.targetWorkflowId?.trim()) {
      ctx.addIssue({ code: 'custom', path: ['targetWorkflowId'], message: 'route_to_workflow requires targetWorkflowId.' })
    }
  }),
)

const outputSchema = lazySchema(() =>
  z.object({
    workflow: z.record(z.string(), z.unknown()),
    approvedTargetPhaseId: z.string().nullable(),
    routeReason: z.string(),
    requiresConfirmation: z.boolean(),
    message: z.string(),
  }),
)

type InputSchema = ReturnType<typeof inputSchema>
type OutputSchema = ReturnType<typeof outputSchema>
type Input = z.infer<InputSchema>
type Output = z.infer<OutputSchema>

type AppStateWithWorkflow = ReturnType<ToolUseContext['getAppState']> & {
  workflow?: WorkflowSessionState
}

function workflowStateFromContext(context: ToolUseContext): WorkflowSessionState | null {
  return (context.getAppState() as AppStateWithWorkflow).workflow ?? null
}

function desktopContext(): { serverUrl: string; sessionId: string } | null {
  const serverUrl = getJiangxiaEnvValue('DESKTOP_SERVER_URL')?.trim()
  const sessionId = getJiangxiaEnvValue('WORKFLOW_SESSION_ID')?.trim()
  return serverUrl && sessionId ? { serverUrl: serverUrl.replace(/\/+$/, ''), sessionId } : null
}

function unavailable(message = 'request_workflow_route is available only in active workflow sessions.') {
  return { result: false as const, message, errorCode: 1 }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

async function fetchWorkflowState(desktop: { serverUrl: string; sessionId: string }): Promise<Record<string, unknown>> {
  const response = await fetch(`${desktop.serverUrl}/api/sessions/${encodeURIComponent(desktop.sessionId)}/workflow`)
  const text = await response.text()
  let payload: unknown = {}
  try { payload = text ? JSON.parse(text) : {} } catch { /* structured error below */ }
  if (!response.ok) {
    throw new Error(isRecord(payload) && typeof payload.message === 'string'
      ? payload.message
      : text || `Workflow state refresh failed with HTTP ${response.status}.`)
  }
  if (isRecord(payload) && isRecord(payload.state)) return payload.state
  throw new Error('Workflow state refresh returned an invalid response.')
}

function withState(input: Input, state: Record<string, unknown>): WorkflowRouteRequest {
  return {
    ...input,
    phaseId: input.phaseId ?? (typeof state.activePhaseId === 'string' ? state.activePhaseId : undefined),
    stateVersion: typeof input.stateVersion === 'number'
      ? input.stateVersion
      : typeof state.stateVersion === 'number' ? state.stateVersion : undefined,
  }
}

type RouteResultForMessage = Pick<Output, 'workflow' | 'approvedTargetPhaseId' | 'requiresConfirmation'>

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isSameTargetCompletionConfirmation(result: RouteResultForMessage): boolean {
  const pendingConfirmation = isRecordValue(result.workflow.pendingConfirmation)
    ? result.workflow.pendingConfirmation
    : null
  return Boolean(
    result.requiresConfirmation
    && !result.workflow.pendingRoute
    && pendingConfirmation?.status === 'pending'
    && pendingConfirmation.toPhaseId === result.approvedTargetPhaseId,
  )
}

function messageForRoute(result: RouteResultForMessage): string {
  if (isSameTargetCompletionConfirmation(result)) {
    const target = result.approvedTargetPhaseId ?? 'the normal next phase'
    const isChinese = result.workflow.workflowLanguage === 'zh'
    return isChinese
      ? `当前阶段的正常阶段完成确认正在等待用户确认；未创建额外路由。确认当前阶段后将进入 ${target}。`
      : `The current phase's normal completion confirmation is already waiting for the user; no additional workflow route was created. Confirm the current phase to enter ${target}.`
  }
  if (result.requiresConfirmation) return 'Workflow route is waiting for user confirmation.'
  return result.approvedTargetPhaseId
    ? `Workflow route applied to ${result.approvedTargetPhaseId}.`
    : 'Workflow route applied.'
}

async function routeThroughDesktopApi(
  input: Input,
  context: ToolUseContext,
  desktop: { serverUrl: string; sessionId: string },
): Promise<{ data: Output }> {
  const latest = await fetchWorkflowState(desktop)
  const request = withState(input, latest)
  const response = await fetch(
    `${desktop.serverUrl}/api/sessions/${encodeURIComponent(desktop.sessionId)}/workflow/transition`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'route',
        transitionId: context.toolUseId,
        ...request,
        routeIntent: request.intent,
      }),
    },
  )
  const text = await response.text()
  let payload: unknown = {}
  try { payload = text ? JSON.parse(text) : {} } catch { /* structured error below */ }
  if (!response.ok) {
    const message = isRecord(payload) && typeof payload.message === 'string'
      ? payload.message
      : text || `Workflow route failed with HTTP ${response.status}.`
    throw new Error(message)
  }
  if (!isRecord(payload) || !isRecord(payload.state)) throw new Error('Workflow route returned an invalid response.')
  const route = isRecord(payload.route) ? payload.route : {}
  const result = {
    workflow: payload.state,
    approvedTargetPhaseId: typeof route.approvedTargetPhaseId === 'string' ? route.approvedTargetPhaseId : null,
    routeReason: typeof route.routeReason === 'string' ? route.routeReason : request.rationale,
    requiresConfirmation: typeof route.requiresConfirmation === 'boolean' ? route.requiresConfirmation : true,
  }
  return { data: { ...result, message: messageForRoute(result) } }
}

export const RequestWorkflowRouteTool: Tool<InputSchema, Output> = buildTool({
  name: REQUEST_WORKFLOW_ROUTE_TOOL_NAME,
  maxResultSizeChars: 100_000,
  strict: true,
  async description() {
    return 'Request a validated workflow route after submitting the current phase completion.'
  },
  async prompt() {
    return [
      'Request a structured workflow route; this tool does not submit phase completion.',
      'Call submit_phase_completion first with status, handoff, rationale, and evidence for the current phase.',
      'Use this tool only for a real route: rework_current_phase, a target different from the ordinary linear next phase, a workflow switch, pause/resume, or finish. jump_to_phase requires targetPhaseId.',
      'Do not use this tool for ordinary linear progression. After a normal completion, submit_phase_completion alone creates the current phase confirmation and enters the immediate linear next phase after the user confirms.',
      'In particular, after a repair returns to Stage 4, submit the Stage 4 completion and do not request a route merely to re-enter its normal Stage 5 validation phase.',
      'Do not describe a route only in plain text or hide it inside a completion handoff.',
      'The server validates phase, stateVersion, route policy, and target existence. Model-requested non-linear routes require user confirmation by default.',
    ].join('\n')
  },
  get inputSchema(): InputSchema { return inputSchema() },
  get outputSchema(): OutputSchema { return outputSchema() },
  isConcurrencySafe() { return false },
  isReadOnly() { return false },
  async validateInput(input, context) {
    const desktop = desktopContext()
    if (desktop) {
      try {
        const latest = await fetchWorkflowState(desktop)
        if (typeof input.phaseId === 'string' && input.phaseId !== latest.activePhaseId) {
          return unavailable('Route phase must match the active workflow phase.')
        }
        if (typeof input.stateVersion === 'number' && input.stateVersion !== latest.stateVersion) {
          return unavailable('Workflow state version is stale.')
        }
        return { result: true }
      } catch (error) {
        return unavailable(error instanceof Error ? error.message : 'Workflow route service is unavailable.')
      }
    }
    const state = workflowStateFromContext(context)
    if (!getWorkflowScopedToolNames(state).includes(REQUEST_WORKFLOW_ROUTE_TOOL_NAME)) return unavailable()
    if (input.phaseId && input.phaseId !== state.activePhaseId) return unavailable('Route phase must match the active workflow phase.')
    if (typeof input.stateVersion === 'number' && input.stateVersion !== state.stateVersion) return unavailable('Workflow state version is stale.')
    return { result: true }
  },
  async call(input, context) {
    const desktop = desktopContext()
    if (desktop) return routeThroughDesktopApi(input, context, desktop)
    const state = workflowStateFromContext(context)
    if (!getWorkflowScopedToolNames(state).includes(REQUEST_WORKFLOW_ROUTE_TOOL_NAME)) {
      throw new Error('Workflow routing is available only in workflow sessions.')
    }
    const result = await new WorkflowRuntimeService().requestWorkflowRoute({
      state,
      request: withState(input, state as unknown as Record<string, unknown>),
      requestedAt: new Date().toISOString(),
      transitionId: context.toolUseId,
    })
    context.setAppState((prev) => ({ ...prev, workflow: result.state }) as ReturnType<ToolUseContext['getAppState']>)
    return {
      data: {
        workflow: result.state as unknown as Record<string, unknown>,
        approvedTargetPhaseId: result.approvedTargetPhaseId,
        routeReason: result.routeReason,
        requiresConfirmation: result.requiresConfirmation,
        message: messageForRoute(result),
      },
    }
  },
  renderToolUseMessage() { return null },
  renderToolUseProgressMessage() { return null },
  renderToolResultMessage() { return null },
  renderToolUseErrorMessage() { return null },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    return { type: 'tool_result', content: output.message, tool_use_id: toolUseID }
  },
} satisfies ToolDef<InputSchema, Output>)

export type { Input as RequestWorkflowRouteInput, Output as RequestWorkflowRouteOutput, WorkflowRouteIntent }
