import { z } from 'zod/v4'
import type { Tool, ToolUseContext } from '../../Tool.js'
import { buildTool, type ToolDef } from '../../Tool.js'
import { WorkflowRuntimeService } from '../../server/services/workflowRuntimeService.js'
import {
  SUBMIT_PHASE_COMPLETION_TOOL_NAME,
  getWorkflowScopedToolNames,
} from '../../server/services/workflowToolPolicy.js'
import type {
  CompletionSubmission,
  WorkflowSessionState,
} from '../../server/services/workflowTypes.js'
import { getJiangxiaEnvValue } from '../../utils/appIdentity.js'
import { lazySchema } from '../../utils/lazySchema.js'

const evidenceSchema = z.record(z.string(), z.unknown())
const EXECUTABLE_WORKFLOW_ROUTE_HANDOFF_FIELDS = new Set([
  'routeRequest',
  'routeDecision',
  'workflowRoute',
  'routeIntent',
  'targetPhaseId',
  'targetWorkflowId',
])

function executableWorkflowRouteHandoffField(handoff: Record<string, unknown>): string | null {
  return Object.keys(handoff).find((key) => EXECUTABLE_WORKFLOW_ROUTE_HANDOFF_FIELDS.has(key)) ?? null
}

const handoffSchema = z.record(z.string(), z.unknown()).superRefine((handoff, ctx) => {
  const field = executableWorkflowRouteHandoffField(handoff)
  if (!field) return

  ctx.addIssue({
    code: 'custom',
    path: [field],
    message: `Completion handoff cannot contain executable workflow routing field "${field}". Call request_workflow_route after completion instead.`,
  })
})

const inputSchema = lazySchema(() =>
  z.strictObject({
    phaseId: z.string().min(1).optional().describe('The active workflow phase ID. If omitted, the tool uses the current active workflow phase.'),
    stateVersion: z.number().int().nonnegative().optional().describe('The current workflow state version. If omitted, the tool refreshes the current workflow state version.'),
    status: z.enum(['ready', 'needs_user', 'completed', 'blocked', 'unable']).describe('Completion result for the active phase. Use needs_user when a structured user decision is required; use completed when an auto-transition phase is fully complete.'),
    handoff: handoffSchema.describe('Structured phase handoff for user confirmation or follow-up.'),
    rationale: z.string().min(1).describe('Why the phase is ready, blocked, or unable.'),
    evidence: z.array(evidenceSchema).describe('Evidence supporting the completion status.'),
  }),
)

const outputSchema = lazySchema(() =>
  z.object({
    status: z.enum(['pending', 'recorded']),
    workflow: z.record(z.string(), z.unknown()),
    artifact: z.record(z.string(), z.unknown()),
    message: z.string(),
  }),
)

type InputSchema = ReturnType<typeof inputSchema>
type OutputSchema = ReturnType<typeof outputSchema>
type Input = z.infer<InputSchema>
type Output = z.infer<OutputSchema>

type WorkflowSubmitFailureRecovery = {
  phaseId: string | null
  attempts: number
}

type AppStateWithWorkflow = ReturnType<ToolUseContext['getAppState']> & {
  workflow?: WorkflowSessionState
  workflowSubmitFailureRecovery?: WorkflowSubmitFailureRecovery
}

function workflowStateFromContext(context: ToolUseContext): WorkflowSessionState | null {
  const appState = context.getAppState() as AppStateWithWorkflow
  return appState.workflow ?? null
}

function unavailable(message = 'submit_phase_completion is available only in active workflow sessions.') {
  return {
    result: false as const,
    message,
    errorCode: 1,
  }
}

function unavailableTransition(message: string) {
  return unavailable(`WORKFLOW_TRANSITION_BLOCKED: ${message} The workflow is blocked and must not advance until submit_phase_completion is available again.`)
}

function errorToValidationResult(error: unknown) {
  const record = error as { message?: unknown; statusCode?: unknown }
  return {
    result: false as const,
    message: typeof record.message === 'string'
      ? record.message
      : 'Workflow completion submission is invalid.',
    errorCode: typeof record.statusCode === 'number' ? record.statusCode : 1,
  }
}

function messageForStatus(status: Output['status']): string {
  if (status !== 'pending') return 'Workflow remains on the current phase'

  return [
    'Completion is recorded and is waiting for user confirmation.',
    'While confirmation is pending, stop current-phase business progression and wait for the user.',
    'Do not produce next-phase questions, plans, artifacts, operations, or nonessential tool calls while confirmation is pending.',
    'Do not hide a route inside handoff or ordinary assistant text; submit_phase_completion records completion only and never creates a workflow route.',
  ].join(' ')
}

function getDesktopWorkflowApiContext(): { serverUrl: string; sessionId: string } | null {
  const serverUrl = getJiangxiaEnvValue('DESKTOP_SERVER_URL')?.trim()
  const sessionId = getJiangxiaEnvValue('WORKFLOW_SESSION_ID')?.trim()
  if (!serverUrl || !sessionId) return null
  return { serverUrl: serverUrl.replace(/\/+$/, ''), sessionId }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function completionInputWithState(input: Input, state: WorkflowSessionState): CompletionSubmission {
  return {
    ...input,
    phaseId: state.activePhaseId ?? input.phaseId,
    stateVersion: state.stateVersion,
  } as CompletionSubmission
}

function completionInputWithDesktopState(input: Input, latest: Record<string, unknown>): CompletionSubmission {
  return {
    ...input,
    phaseId: typeof latest.activePhaseId === 'string' ? latest.activePhaseId : input.phaseId,
    stateVersion: typeof latest.stateVersion === 'number' ? latest.stateVersion : input.stateVersion,
  } as CompletionSubmission
}

async function submitThroughDesktopApi(
  input: Input,
  context: ToolUseContext,
  desktop: { serverUrl: string; sessionId: string },
): Promise<{ data: Output }> {
  const latest = await fetchDesktopWorkflowState(desktop)
  const currentPhaseId = typeof latest.activePhaseId === 'string'
    ? latest.activePhaseId
    : null
  if (currentPhaseId && input.phaseId && currentPhaseId !== input.phaseId) {
    throw new Error('Completion phase must match the active workflow phase.')
  }
  const submission = completionInputWithDesktopState(input, latest)

  const response = await fetch(
    `${desktop.serverUrl}/api/sessions/${encodeURIComponent(desktop.sessionId)}/workflow/transition`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...submission,
        action: submission.status,
        transitionId: context.toolUseId,
      }),
    },
  )
  const bodyText = await response.text()
  let payload: unknown
  try {
    payload = bodyText ? JSON.parse(bodyText) : {}
  } catch {
    payload = {}
  }

  if (!response.ok) {
    const message = isRecord(payload) && typeof payload.message === 'string'
      ? payload.message
      : bodyText || `Workflow completion submission failed with HTTP ${response.status}.`
    throw new Error(message)
  }

  const payloadRecord = isRecord(payload) ? payload : {}
  const workflow = isRecord(payloadRecord.workflow)
    ? payloadRecord.workflow
    : isRecord(payloadRecord.state)
      ? payloadRecord.state
      : {}
  const artifact = isRecord(payloadRecord.artifact) ? payloadRecord.artifact : {}
  const status: Output['status'] = submission.status === 'ready' ? 'pending' : 'recorded'

  return {
    data: {
      status,
      workflow,
      artifact,
      message: messageForStatus(status),
    },
  }
}

async function fetchDesktopWorkflowState(
  desktop: { serverUrl: string; sessionId: string },
): Promise<Record<string, unknown>> {
  const response = await fetch(
    `${desktop.serverUrl}/api/sessions/${encodeURIComponent(desktop.sessionId)}/workflow`,
  )
  const bodyText = await response.text()
  let payload: unknown
  try {
    payload = bodyText ? JSON.parse(bodyText) : {}
  } catch {
    payload = {}
  }

  if (!response.ok) {
    const message = isRecord(payload) && typeof payload.message === 'string'
      ? payload.message
      : bodyText || `Workflow state refresh failed with HTTP ${response.status}.`
    throw new Error(message)
  }

  if (isRecord(payload) && isRecord(payload.state)) {
    return payload.state
  }
  throw new Error('Workflow state refresh returned an invalid response.')
}

function isRecoverableSubmissionInputFailure(message: string): boolean {
  const normalized = message.toLowerCase()
  return [
    'handoff',
    'rationale',
    'evidence',
    'stateversion',
    'state version',
  ].some((field) => normalized.includes(field))
}

function workflowStateForFailure(context: ToolUseContext): WorkflowSessionState | null {
  return workflowStateFromContext(context)
}

async function blockCompletionRecovery(
  context: ToolUseContext,
  message: string,
  attempts: number,
): Promise<void> {
  const desktop = getDesktopWorkflowApiContext()
  if (desktop) {
    const latest = await fetchDesktopWorkflowState(desktop)
    const phaseId = typeof latest.activePhaseId === 'string' ? latest.activePhaseId : null
    const stateVersion = typeof latest.stateVersion === 'number' ? latest.stateVersion : null
    if (!phaseId || stateVersion === null) throw new Error('Current workflow phase is unavailable.')
    const response = await fetch(
      `${desktop.serverUrl}/api/sessions/${encodeURIComponent(desktop.sessionId)}/workflow/transition`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'blocked',
          phaseId,
          stateVersion,
          transitionId: `submit-recovery-blocked:${phaseId}:${stateVersion}:${attempts}`,
          handoff: { failureKind: 'submit_phase_completion', attempts },
          rationale: message,
          evidence: [],
        }),
      },
    )
    if (!response.ok) throw new Error(`Unable to block workflow after submit failure (HTTP ${response.status}).`)
    return
  }

  const state = workflowStateForFailure(context)
  if (!state?.activePhaseId) return
  const result = await new WorkflowRuntimeService().submitPhaseCompletion({
    state,
    requestedAt: new Date().toISOString(),
    transitionId: `submit-recovery-blocked:${state.activePhaseId}:${state.stateVersion}:${attempts}`,
    submission: {
      phaseId: state.activePhaseId,
      stateVersion: state.stateVersion,
      status: 'blocked',
      handoff: { failureKind: 'submit_phase_completion', attempts },
      rationale: message,
      evidence: [],
    },
  })
  context.setAppState((previous) => ({
    ...previous,
    workflow: result.state,
    workflowSubmitFailureRecovery: undefined,
  }) as ReturnType<ToolUseContext['getAppState']>)
}

export async function handleSubmitPhaseCompletionFailure(
  context: ToolUseContext,
  failureMessage: string,
): Promise<{ retryAllowed: boolean; message: string }> {
  const appState = context.getAppState() as AppStateWithWorkflow
  const phaseId = appState.workflow?.activePhaseId ?? null
  const prior = appState.workflowSubmitFailureRecovery
  const attempts = prior?.phaseId === phaseId ? prior.attempts + 1 : 1
  const recoverable = isRecoverableSubmissionInputFailure(failureMessage)

  if (recoverable && attempts === 1) {
    context.setAppState((previous) => ({
      ...previous,
      workflowSubmitFailureRecovery: { phaseId, attempts },
    }) as ReturnType<ToolUseContext['getAppState']>)
    return {
      retryAllowed: true,
      message: `WORKFLOW_SUBMIT_RETRY_ALLOWED: ${failureMessage} Correct the structured submit_phase_completion input and retry once. Do not advance or route the workflow before a successful submission.`,
    }
  }

  const reason = recoverable
    ? `阶段完成提交连续失败两次：${failureMessage}`
    : `阶段完成提交无法安全恢复：${failureMessage}`
  try {
    await blockCompletionRecovery(context, reason, attempts)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return {
      retryAllowed: false,
      message: `WORKFLOW_SUBMIT_BLOCKED: ${reason} The workflow could not persist the blocked state: ${detail}`,
    }
  }
  return {
    retryAllowed: false,
    message: `WORKFLOW_SUBMIT_BLOCKED: ${reason} 当前阶段已阻塞，不能进入下一阶段。只可调整当前结果、查看产物、暂停或退出工作流。`,
  }
}

export const SubmitPhaseCompletionTool: Tool<InputSchema, Output> = buildTool({
  name: SUBMIT_PHASE_COMPLETION_TOOL_NAME,
  maxResultSizeChars: 100_000,
  strict: true,
  async description() {
    return 'Submit workflow phase completion for user confirmation'
  },
  async prompt() {
    return [
      'Submit the active workflow phase completion. Use status ready to request user confirmation; use blocked or unable to record why the workflow must stay on the current phase.',
      'Required input: status, handoff, rationale, and evidence.',
      'handoff must be an object containing the phase summary, key decisions, evidence or artifact references, remaining risks, and next-phase inputs.',
      'rationale must be a non-empty string explaining why the selected completion status is appropriate.',
      'evidence must be an array of evidence objects. Use an empty array only when no evidence can be recorded, and explain that limitation in rationale.',
      'Plain assistant text does not satisfy handoff, rationale, or evidence: put all three values in this tool input before calling the tool.',
      'After status ready succeeds, wait for the controlled user confirmation, rejection, retry, pause, stop, or other explicitly supported recovery action; do not initiate a route or begin another phase in the same turn.',
      'Do not hide a route inside handoff or ordinary assistant text: submit_phase_completion records completion only; request_workflow_route is the only tool that creates a pending route.',
      'phaseId and stateVersion may be omitted; the active workflow phase and latest workflow state are inferred at call time.',
    ].join('\n')
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  isConcurrencySafe() {
    return false
  },
  isReadOnly() {
    return false
  },
  async validateInput(input, context) {
    const desktopContext = getDesktopWorkflowApiContext()
    if (desktopContext) {
      try {
        await fetchDesktopWorkflowState(desktopContext)
        return { result: true }
      } catch (error) {
        return unavailableTransition(error instanceof Error ? error.message : 'Workflow transition service is unavailable.')
      }
    }

    const state = workflowStateFromContext(context)
    if (!getWorkflowScopedToolNames(state).includes(SUBMIT_PHASE_COMPLETION_TOOL_NAME)) {
      return unavailable()
    }
    if (
      state.activePhaseId
      && typeof input.phaseId === 'string'
      && input.phaseId !== state.activePhaseId
    ) {
      return unavailable('Completion phase must match the active workflow phase.')
    }
    return { result: true }
  },
  async call(input, context) {
    context.setAppState((previous) => ({
      ...previous,
      workflowSubmitFailureRecovery: undefined,
    }) as ReturnType<ToolUseContext['getAppState']>)
    const desktop = getDesktopWorkflowApiContext()
    if (desktop) {
      return await submitThroughDesktopApi(input, context, desktop)
    }

    const state = workflowStateFromContext(context)
    if (!getWorkflowScopedToolNames(state).includes(SUBMIT_PHASE_COMPLETION_TOOL_NAME)) {
      throw new Error('Workflow completion is available only in workflow sessions.')
    }
    const submission = completionInputWithState(input, state)

    const result = await new WorkflowRuntimeService().submitPhaseCompletion({
      state,
      submission,
      requestedAt: new Date().toISOString(),
      transitionId: context.toolUseId,
    })

    context.setAppState((prev) => ({
      ...prev,
      workflow: result.state,
    }) as ReturnType<ToolUseContext['getAppState']>)

    return {
      data: {
        status: result.status,
        workflow: result.state as unknown as Record<string, unknown>,
        artifact: result.artifact,
        message: messageForStatus(result.status),
      },
    }
  },
  renderToolUseMessage() {
    return null
  },
  renderToolUseProgressMessage() {
    return null
  },
  renderToolResultMessage() {
    return null
  },
  renderToolUseErrorMessage() {
    return null
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    return {
      type: 'tool_result',
      content: output.message,
      tool_use_id: toolUseID,
    }
  },
} satisfies ToolDef<InputSchema, Output>)
