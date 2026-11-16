import { z } from 'zod/v4'

import { buildTool, type ToolInputJSONSchema, type ToolUseContext } from '../../Tool.js'
import {
  executeExpertPackAuthoringOperation,
  type ExpertPackAuthoringOperationInput,
  type ExpertPackAuthoringOperationName,
  type ExpertPackAuthoringResult,
} from '../../server/services/expertPackAuthoringService.js'
import { getJiangxiaEnvValue } from '../../utils/appIdentity.js'
import { lazySchema } from '../../utils/lazySchema.js'

const operationNames = ['guide', 'list', 'inspect', 'validate', 'create', 'update', 'duplicate', 'delete'] as const
const basisHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/)

const inputJSONSchema: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    operation: {
      type: 'string',
      enum: operationNames,
      description: 'Expert ZIP pack authoring operation to execute.',
    },
    topic: {
      type: 'string',
      minLength: 1,
      description: 'Optional guide topic when operation is guide.',
    },
    packId: {
      type: 'string',
      minLength: 1,
      description: 'Expert ZIP pack identifier for inspect, update, duplicate, and delete.',
    },
    basisHash: {
      type: 'string',
      pattern: '^sha256:[a-f0-9]{64}$',
      description: 'Fresh basis hash from inspect for update and delete.',
    },
    pack: {
      type: 'object',
      additionalProperties: true,
      description: 'Expert ZIP pack candidate for validate and create. Use guide for required fields.',
    },
    patch: {
      type: 'object',
      additionalProperties: true,
      description: 'Patch for a user Expert ZIP pack update. Inspect first and use its basisHash.',
    },
  },
  required: ['operation'],
  additionalProperties: false,
}

const inputSchema = lazySchema(() =>
  z.discriminatedUnion('operation', [
    z.strictObject({ operation: z.literal('guide'), topic: z.string().min(1).optional() }),
    z.strictObject({ operation: z.literal('list') }),
    z.strictObject({ operation: z.literal('inspect'), packId: z.string().min(1) }),
    z.strictObject({ operation: z.literal('validate'), pack: z.unknown() }),
    z.strictObject({ operation: z.literal('create'), pack: z.unknown() }),
    z.strictObject({ operation: z.literal('update'), packId: z.string().min(1), basisHash: basisHashSchema, patch: z.unknown() }),
    z.strictObject({ operation: z.literal('duplicate'), packId: z.string().min(1) }),
    z.strictObject({ operation: z.literal('delete'), packId: z.string().min(1), basisHash: basisHashSchema }),
  ]),
)

const outputSchema = lazySchema(() =>
  z.object({
    operation: z.enum(operationNames),
    status: z.enum(['succeeded', 'validated', 'rejected', 'failed']),
    persisted: z.boolean(),
    validation: z.object({
      valid: z.boolean(),
      issues: z.array(z.record(z.string(), z.unknown())),
    }).optional(),
    packs: z.array(z.record(z.string(), z.unknown())).optional(),
    affectedPack: z.record(z.string(), z.unknown()).optional(),
    beforeSummary: z.record(z.string(), z.unknown()).optional(),
    afterSummary: z.record(z.string(), z.unknown()).optional(),
    draft: z.record(z.string(), z.unknown()).optional(),
    guide: z.record(z.string(), z.unknown()).optional(),
    nextAction: z.enum(['none', 'inspect-and-retry', 'repair-and-validate', 'choose-unique-pack-id', 'retry-after-server-available']),
    message: z.string(),
  }),
)

type InputSchema = ReturnType<typeof inputSchema>
type OutputSchema = ReturnType<typeof outputSchema>
type Input = z.infer<InputSchema>

function desktopServerUrl(): string | null {
  const serverUrl = getJiangxiaEnvValue('DESKTOP_SERVER_URL')?.trim()
  return serverUrl ? serverUrl.replace(/\/+$/, '') : null
}

function auditSummary(result: ExpertPackAuthoringResult): string {
  const issueCodes = (result.validation?.issues ?? [])
    .map((entry) => entry.code)
    .filter((code): code is string => typeof code === 'string')
  return [
    'operation=' + result.operation,
    'status=' + result.status,
    'persisted=' + result.persisted,
    result.affectedPack ? 'affected=' + result.affectedPack.packId : null,
    result.affectedPack ? 'zipPath=' + result.affectedPack.zipPath : null,
    'validation=' + (result.validation?.valid ?? 'n/a') + ' (' + (issueCodes.length ? issueCodes.join(', ') : '0 issue(s)') + ')',
    'nextAction=' + result.nextAction,
    'message=' + result.message,
  ].filter(Boolean).join('\n')
}

function failedDesktopResult(operation: ExpertPackAuthoringOperationName, message: string): ExpertPackAuthoringResult {
  return {
    operation,
    status: 'failed',
    persisted: false,
    validation: {
      valid: false,
      issues: [{
        path: '$',
        code: 'EXPERT_PACK_AUTHORING_DESKTOP_SERVER_UNAVAILABLE',
        message,
        severity: 'error',
      }],
    },
    nextAction: 'retry-after-server-available',
    message: 'Expert ZIP pack authoring desktop server request failed.',
  }
}

async function executeThroughDesktopApi(
  input: ExpertPackAuthoringOperationInput,
  serverUrl: string,
): Promise<ExpertPackAuthoringResult> {
  try {
    const response = await fetch(serverUrl + '/api/experts/packs/authoring', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
    const text = await response.text()
    let payload: unknown = {}
    try {
      payload = text ? JSON.parse(text) : {}
    } catch {
      payload = {}
    }
    if (!response.ok) {
      const message = payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string'
        ? payload.message
        : text || 'Expert ZIP pack authoring endpoint failed with HTTP ' + response.status + '.'
      return failedDesktopResult(input.operation, message)
    }
    if (!payload || typeof payload !== 'object' || !('operation' in payload) || typeof payload.operation !== 'string') {
      return failedDesktopResult(input.operation, 'Expert ZIP pack authoring endpoint returned an invalid response.')
    }
    return payload as ExpertPackAuthoringResult
  } catch (error) {
    return failedDesktopResult(input.operation, error instanceof Error ? error.message : String(error))
  }
}

export const ExpertPackAuthoringTool = buildTool({
  name: 'expert_pack_authoring',
  searchHint: 'Expert ZIP pack authoring and validation',
  maxResultSizeChars: 200_000,
  eagerInputStreaming: true,
  inputJSONSchema,
  async description() {
    return 'Guide, list, inspect, validate, create, update, duplicate, and delete user Expert ZIP packs without modifying workflow packs.'
  },
  async prompt() {
    return [
      'Use expert_pack_authoring when the user asks to create or maintain an Expert ZIP pack.',
      'Start with guide when the package shape is unclear. Validate candidates before create.',
      'When the user asks only to create a general-purpose Expert, derive its ZIP only from the user-stated requirements.',
      'Do not inspect or read the current workspace, project directories, attachments, or unrelated files merely to author it.',
      'Do not call Bash, Read, Browse, or another analysis tool for a general-purpose authoring request unless the user explicitly asks to incorporate specified project context.',
      'Do not automatically run the newly created Expert or analyze a directory after creation; do so only after the user explicitly asks to use it on a specified directory.',
      'After create, report the pack name, ID, and ZIP path instead of an unsolicited analysis.',
      "Use the create result's affectedPack.zipPath as the ZIP path; do not use filesystem tools to discover it.",
      'This tool writes only user Expert ZIP packs and must never be used to modify workflow ZIP packs, workflow state, sessions, transcripts, providers, OAuth, or MCP configuration.',
      'Create uses a unique packId. Inspect first and use its returned basisHash before update or delete.',
      'To add or replace a self-contained Skill during update, use patch.skills as [{ id, files: { "SKILL.md": "..." } }] and include the same id in patch.expert.skillIds. The legacy { name, systemPromptContent } shape is rejected.',
      'Never use Bash or direct filesystem writes to change an Expert ZIP; use this controlled update operation. Do not use package-local executables or tool archives.',
    ].join(' ')
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
    return ['guide', 'list', 'inspect', 'validate'].includes(input.operation)
  },
  isDestructive(input) {
    return input.operation === 'delete'
  },
  async call(input) {
    const operationInput = input as ExpertPackAuthoringOperationInput
    const serverUrl = desktopServerUrl()
    const result = serverUrl
      ? await executeThroughDesktopApi(operationInput, serverUrl)
      : await executeExpertPackAuthoringOperation(operationInput)
    return { data: result }
  },
  renderToolUseMessage(input) {
    return input.packId
      ? 'expert_pack_authoring ' + (input.operation ?? 'operation') + ' ' + input.packId
      : 'expert_pack_authoring ' + (input.operation ?? 'operation')
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
      content: auditSummary(output) + '\n\n' + JSON.stringify(output, null, 2),
      tool_use_id: toolUseID,
    }
  },
})
