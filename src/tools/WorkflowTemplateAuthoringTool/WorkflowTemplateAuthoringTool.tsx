import { z } from 'zod/v4'
import { buildTool, type ToolDef, type ToolInputJSONSchema, type ToolUseContext } from '../../Tool.js'
import {
  executeWorkflowTemplateAuthoringOperation,
  type WorkflowTemplateAuthoringOperationInput,
  type WorkflowTemplateAuthoringOperationName,
  type WorkflowTemplateAuthoringResult,
} from '../../server/services/workflowTemplateAuthoringService.js'
import {
  getWorkflowTemplateAuthoringOperationPolicy,
  isWorkflowTemplateAuthoringReadOnlyOperation,
} from '../../server/services/workflowToolPolicy.js'
import type { WorkflowSessionState } from '../../server/services/workflowTypes.js'
import { getJiangxiaEnvValue } from '../../utils/appIdentity.js'
import { lazySchema } from '../../utils/lazySchema.js'

const selectorSchema = z.strictObject({
  source: z.enum(['builtin', 'user']),
  id: z.string().min(1),
})

const userSelectorSchema = z.strictObject({
  source: z.literal('user'),
  id: z.string().min(1),
})

const targetSchema = z.strictObject({
  id: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
})

const templateSchema = z.unknown()
const basisHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const operationNames = ['guide', 'skill_catalog', 'skill_create', 'list', 'inspect', 'validate', 'create', 'update', 'duplicate', 'delete'] as const

const selectorJSONSchema = {
  type: 'object',
  properties: {
    source: { type: 'string', enum: ['builtin', 'user'] },
    id: { type: 'string', minLength: 1 },
  },
  required: ['source', 'id'],
  additionalProperties: false,
} as const

const targetJSONSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', minLength: 1 },
    name: { type: 'string', minLength: 1 },
  },
  additionalProperties: false,
} as const

const workflowTemplateAuthoringInputJSONSchema: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    operation: {
      type: 'string',
      enum: operationNames,
      description: 'Authoring operation to execute.',
    },
    topic: {
      type: 'string',
      minLength: 1,
      description: 'Optional guide topic when operation is guide.',
    },
    source: {
      type: 'string',
      enum: ['all', 'builtin', 'user', 'project', 'plugin', 'managed', 'bundled', 'mcp', 'unknown'],
      description: 'Optional list filter when operation is list, or skill source filter when operation is skill_catalog.',
    },
    query: {
      type: 'string',
      minLength: 1,
      description: 'Optional skill name, display name, source, plugin, namespace, version, or referenceId search when operation is skill_catalog.',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 200,
      description: 'Optional maximum number of skill_catalog entries to return.',
    },
    name: {
      type: 'string',
      minLength: 1,
      description: 'Lowercase user skill slug when operation is skill_create.',
    },
    description: {
      type: 'string',
      minLength: 1,
      description: 'Skill description frontmatter when operation is skill_create.',
    },
    body: {
      type: 'string',
      minLength: 1,
      description: 'Optional SKILL.md body when operation is skill_create.',
    },
    selector: {
      ...selectorJSONSchema,
      description: 'Template selector for inspect, update, duplicate, and delete operations.',
    },
    target: {
      ...targetJSONSchema,
      description: 'Optional duplicate target id/name.',
    },
    template: {
      type: 'object',
      description: 'Workflow template candidate for validate, create, and update operations.',
      additionalProperties: true,
    },
    allowExistingId: {
      type: 'string',
      minLength: 1,
      description: 'Existing user template id allowed during validate.',
    },
    basisHash: {
      type: 'string',
      pattern: '^sha256:[a-f0-9]{64}$',
      description: 'Fresh basis hash from inspect for update and delete operations.',
    },
  },
  required: ['operation'],
  additionalProperties: false,
}

const inputSchema = lazySchema(() =>
  z.discriminatedUnion('operation', [
    z.strictObject({
      operation: z.literal('guide'),
      topic: z.string().min(1).optional(),
    }),
    z.strictObject({
      operation: z.literal('skill_catalog'),
      query: z.string().min(1).optional(),
      source: z.enum(['all', 'user', 'project', 'plugin', 'managed', 'bundled', 'mcp', 'unknown']).optional(),
      limit: z.number().int().min(1).max(200).nullable().optional(),
    }),
    z.strictObject({
      operation: z.literal('skill_create'),
      name: z.string().min(1),
      description: z.string().min(1),
      body: z.string().min(1).optional(),
    }),
    z.strictObject({
      operation: z.literal('list'),
      source: z.enum(['all', 'builtin', 'user']).optional(),
    }),
    z.strictObject({
      operation: z.literal('inspect'),
      selector: selectorSchema,
    }),
    z.strictObject({
      operation: z.literal('validate'),
      template: templateSchema,
      allowExistingId: z.string().min(1).nullable().optional(),
    }),
    z.strictObject({
      operation: z.literal('create'),
      template: templateSchema,
    }),
    z.strictObject({
      operation: z.literal('update'),
      selector: userSelectorSchema,
      basisHash: basisHashSchema,
      template: templateSchema,
    }),
    z.strictObject({
      operation: z.literal('duplicate'),
      selector: selectorSchema,
      target: targetSchema.optional(),
    }),
    z.strictObject({
      operation: z.literal('delete'),
      selector: userSelectorSchema,
      basisHash: basisHashSchema,
    }),
  ]),
)

const outputSchema = lazySchema(() =>
  z.object({
    operation: z.enum(['guide', 'skill_catalog', 'skill_create', 'list', 'inspect', 'validate', 'create', 'update', 'duplicate', 'delete']),
    status: z.enum(['succeeded', 'validated', 'rejected', 'failed']),
    persisted: z.boolean(),
    affectedTemplate: z.record(z.string(), z.unknown()).optional(),
    beforeSummary: z.record(z.string(), z.unknown()).optional(),
    afterSummary: z.record(z.string(), z.unknown()).optional(),
    validation: z.strictObject({
      valid: z.boolean(),
      issues: z.array(z.record(z.string(), z.unknown())),
    }).optional(),
    templates: z.array(z.record(z.string(), z.unknown())).optional(),
    skillCatalog: z.array(z.record(z.string(), z.unknown())).optional(),
    createdSkill: z.record(z.string(), z.unknown()).optional(),
    invalidTemplates: z.array(z.record(z.string(), z.unknown())).optional(),
    guide: z.record(z.string(), z.unknown()).optional(),
    template: z.record(z.string(), z.unknown()).optional(),
    nextAction: z.enum([
      'none',
      'inspect-and-retry',
      'repair-and-validate',
      'choose-unique-target',
      'copy-builtin-first',
      'ask-user-to-disambiguate',
      'retry-after-server-available',
    ]),
    message: z.string(),
  }),
)

type InputSchema = ReturnType<typeof inputSchema>
type OutputSchema = ReturnType<typeof outputSchema>
type Input = z.infer<InputSchema>

type AppStateWithWorkflow = ReturnType<ToolUseContext['getAppState']> & {
  workflow?: WorkflowSessionState
}

function workflowStateFromContext(context: ToolUseContext): WorkflowSessionState | null {
  const appState = context.getAppState() as AppStateWithWorkflow
  return appState.workflow ?? null
}

function desktopServerUrl(): string | null {
  const serverUrl = getJiangxiaEnvValue('DESKTOP_SERVER_URL')?.trim()
  return serverUrl ? serverUrl.replace(/\/+$/, '') : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function selectorSummary(input: Partial<Input> | undefined): string | null {
  const selector = isRecord(input?.selector) ? input.selector : null
  const source = typeof selector?.source === 'string' ? selector.source : null
  const id = typeof selector?.id === 'string' ? selector.id : null
  if (!source || !id) return null
  return `${source}/${id}`
}

function affectedSummary(result: WorkflowTemplateAuthoringResult): string | null {
  const affected = result.affectedTemplate
  if (!affected) return null
  return `${affected.source}:${affected.id}`
}

function validationIssueCodes(result: WorkflowTemplateAuthoringResult): string[] {
  return (result.validation?.issues ?? [])
    .map((issue) => issue.code)
    .filter((code): code is string => typeof code === 'string')
}

function auditSummary(result: WorkflowTemplateAuthoringResult): string {
  const issueCodes = validationIssueCodes(result)
  const issueSummary = issueCodes.length
    ? `${issueCodes.length} issue(s): ${issueCodes.slice(0, 5).join(', ')}`
    : '0 issue(s)'
  const affected = affectedSummary(result)
  const before = result.beforeSummary
  const after = result.afterSummary

  return [
    `operation=${result.operation}`,
    `status=${result.status}`,
    `persisted=${result.persisted}`,
    affected ? `affected=${affected}` : null,
    before && isRecord(before) ? `before=${before.source}/${before.id}` : null,
    after && isRecord(after) ? `after=${after.source}/${after.id}` : null,
    `validation=${result.validation?.valid ?? 'n/a'} (${issueSummary})`,
    `nextAction=${result.nextAction}`,
    `message=${result.message}`,
  ].filter(Boolean).join('\n')
}

function failedDesktopResult(
  operation: WorkflowTemplateAuthoringOperationName,
  message: string,
): WorkflowTemplateAuthoringResult {
  return {
    operation,
    status: 'failed',
    persisted: false,
    validation: {
      valid: false,
      issues: [
        {
          source: 'authoring',
          path: '$',
          code: 'WORKFLOW_TEMPLATE_DESKTOP_SERVER_UNAVAILABLE',
          message,
          severity: 'error',
        },
      ],
    },
    nextAction: 'retry-after-server-available',
    message: 'Workflow template authoring desktop server request failed.',
  }
}

async function executeThroughDesktopApi(
  input: WorkflowTemplateAuthoringOperationInput,
  serverUrl: string,
): Promise<WorkflowTemplateAuthoringResult> {
  try {
    const response = await fetch(`${serverUrl}/api/workflows/templates/authoring`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
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
        : bodyText || `Workflow template authoring endpoint failed with HTTP ${response.status}.`
      return failedDesktopResult(input.operation, message)
    }

    if (!isRecord(payload) || typeof payload.operation !== 'string') {
      return failedDesktopResult(input.operation, 'Workflow template authoring endpoint returned an invalid response.')
    }

    return payload as WorkflowTemplateAuthoringResult
  } catch (error) {
    return failedDesktopResult(
      input.operation,
      error instanceof Error ? error.message : String(error),
    )
  }
}

export const WorkflowTemplateAuthoringTool = buildTool({
  name: 'workflow_template_authoring',
  searchHint: 'workflow template authoring and validation',
  maxResultSizeChars: 200_000,
  inputJSONSchema: workflowTemplateAuthoringInputJSONSchema,
  async description() {
    return 'Guide, list, inspect, validate, create, update, duplicate, delete workflow templates, and create missing user skills for workflow phases'
  },
  async prompt() {
    return 'Use workflow_template_authoring to guide, list, inspect, validate, create, update, duplicate, or delete workflow templates. Use skill_catalog before assigning phases[].skills so recommended phase skills reference installed skills instead of guessed names or copied skill instructions. If the needed skill is missing, use skill_create first to create a user skill under the installed skills directory, then reference the returned recommendedReference. Validate candidates before mutating. Read-only operations remain available in workflow phases; mutating operations are phase-policy gated.'
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
  isReadOnly(input) {
    return isWorkflowTemplateAuthoringReadOnlyOperation(input.operation)
  },
  isDestructive(input) {
    return input.operation === 'delete'
  },
  async validateInput(input, context) {
    const policy = getWorkflowTemplateAuthoringOperationPolicy(
      input.operation,
      workflowStateFromContext(context),
    )
    if (policy.denied) {
      return {
        result: false,
        message: policy.message,
        errorCode: 1,
      }
    }
    return { result: true }
  },
  async call(input) {
    const serverUrl = desktopServerUrl()
    const operationInput = input as WorkflowTemplateAuthoringOperationInput
    const result = serverUrl
      ? await executeThroughDesktopApi(operationInput, serverUrl)
      : await executeWorkflowTemplateAuthoringOperation(operationInput)

    return { data: result }
  },
  renderToolUseMessage(input) {
    const selected = selectorSummary(input)
    return selected
      ? `workflow_template_authoring ${input.operation ?? 'operation'} ${selected}`
      : `workflow_template_authoring ${input.operation ?? 'operation'}`
  },
  renderToolUseProgressMessage() {
    return null
  },
  renderToolResultMessage(output) {
    return auditSummary(output)
  },
  renderToolUseErrorMessage() {
    return null
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    return {
      type: 'tool_result',
      content: `${auditSummary(output)}\n\n${JSON.stringify(output, null, 2)}`,
      tool_use_id: toolUseID,
    }
  },
  extractSearchText(output) {
    return auditSummary(output)
  },
  getToolUseSummary(input) {
    const selected = selectorSummary(input)
    return selected
      ? `${input?.operation ?? 'operation'} ${selected}`
      : input?.operation ?? null
  },
  getActivityDescription(input) {
    return `Authoring workflow template: ${input?.operation ?? 'operation'}`
  },
  toAutoClassifierInput(input) {
    return {
      operation: input.operation,
      selector: selectorSummary(input),
      readOnly: isWorkflowTemplateAuthoringReadOnlyOperation(input.operation),
      destructive: input.operation === 'delete',
    }
  },
} satisfies ToolDef<InputSchema, WorkflowTemplateAuthoringResult>)
