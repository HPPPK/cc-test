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
const handoffSchema = z.record(z.string(), z.unknown())

const inputSchema = lazySchema(() =>
  z.strictObject({
    phaseId: z.string().min(1).describe('The active workflow phase ID.'),
    stateVersion: z.number().int().nonnegative().describe('The current workflow state version.'),
    status: z.enum(['ready', 'blocked', 'unable']).describe('Completion result for the active phase.'),
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
type Output = z.infer<OutputSchema>

type AppStateWithWorkflow = ReturnType<ToolUseContext['getAppState']> & {
  workflow?: WorkflowSessionState
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
  return status === 'pending'
    ? 'Completion is waiting for user confirmation'
    : 'Workflow remains on the current phase'
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

async function submitThroughDesktopApi(
  input: z.infer<InputSchema>,
  context: ToolUseContext,
  desktop: { serverUrl: string; sessionId: string },
): Promise<{ data: Output }> {
  const latest = await fetchDesktopWorkflowState(desktop)
  const currentPhaseId = typeof latest.activePhaseId === 'string'
    ? latest.activePhaseId
    : null
  if (currentPhaseId && currentPhaseId !== input.phaseId) {
    throw new Error('Completion phase must match the active workflow phase.')
  }
  const stateVersion = typeof latest.stateVersion === 'number'
    ? latest.stateVersion
    : input.stateVersion

  const response = await fetch(
    `${desktop.serverUrl}/api/sessions/${encodeURIComponent(desktop.sessionId)}/workflow/transition`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...input,
        stateVersion,
        action: input.status,
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
  const status: Output['status'] = input.status === 'ready' ? 'pending' : 'recorded'

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

export const SubmitPhaseCompletionTool: Tool<InputSchema, Output> = buildTool({
  name: SUBMIT_PHASE_COMPLETION_TOOL_NAME,
  maxResultSizeChars: 100_000,
  async description() {
    return 'Submit workflow phase completion for user confirmation'
  },
  async prompt() {
    return 'Submit the active workflow phase completion. Use status ready to request user confirmation; use blocked or unable to record why the workflow must stay on the current phase.'
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
    if (getDesktopWorkflowApiContext()) {
      return { result: true }
    }

    const state = workflowStateFromContext(context)
    if (!getWorkflowScopedToolNames(state).includes(SUBMIT_PHASE_COMPLETION_TOOL_NAME)) {
      return unavailable()
    }
    if (state.activePhaseId && input.phaseId !== state.activePhaseId) {
      return unavailable('Completion phase must match the active workflow phase.')
    }
    if (
      typeof state.stateVersion === 'number'
      && input.stateVersion !== state.stateVersion
    ) {
      return unavailable('Workflow state version is stale.')
    }
    return { result: true }
  },
  async call(input, context) {
    const desktop = getDesktopWorkflowApiContext()
    if (desktop) {
      return await submitThroughDesktopApi(input, context, desktop)
    }

    const state = workflowStateFromContext(context)
    if (!getWorkflowScopedToolNames(state).includes(SUBMIT_PHASE_COMPLETION_TOOL_NAME)) {
      throw new Error('Workflow completion is available only in workflow sessions.')
    }

    const result = await new WorkflowRuntimeService().submitPhaseCompletion({
      state,
      submission: input as CompletionSubmission,
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
