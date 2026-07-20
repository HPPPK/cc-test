import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import { ApiError } from '../middleware/errorHandler.js'
import { conversationService } from './conversationService.js'
import {
  type MessageEntry,
  SessionService,
  sessionService as defaultSessionService,
} from './sessionService.js'
import {
  WorkflowSessionCreateService,
} from './workflowSessionCreateService.js'
import { WorkflowSessionStateService } from './workflowSessionStateService.js'
import type {
  WorkflowArtifactPointer,
  WorkflowSessionCreateOptions,
  WorkflowSessionState,
  WorkflowSessionSummary,
} from './workflowTypes.js'
import {
  stateToWorkflowMetadata,
  workflowSummaryFromState,
} from './workflowSummary.js'
import {
  generateWorkflowSummaryCarryover,
  WorkflowSummaryCarryoverError,
  type WorkflowSummaryCarryoverResult,
  type WorkflowSummaryCarryoverOptions,
} from '../../services/compact/workflowSummaryCarryover.js'
import { getAppStoragePath } from '../../utils/appIdentity.js'

export type WorkflowLinkContextStrategy = 'clear' | 'inherit' | 'summarize'

export type LinkedWorkflowSessionCreateRequest = {
  workflow: WorkflowSessionCreateOptions
  contextStrategy: WorkflowLinkContextStrategy
  summaryInstructions?: string
  summaryContent?: string
  clientRequestId?: string
}

export type LinkedWorkflowSessionProvenance = {
  sourceSessionId: string
  sourceSessionTitle?: string
  sourceMessageCount: number
  contextStrategy: WorkflowLinkContextStrategy
  summaryArtifactId?: string
  expertMaterialArtifactId?: string
  createdAt: string
  clientRequestId?: string
}

export type WorkflowContextCarryoverArtifact = {
  schemaVersion: 1
  sourceSessionId: string
  targetSessionId: string
  strategy: WorkflowLinkContextStrategy
  content: string
  createdAt: string
  sourceMessageIds?: string[]
}

export type LinkedWorkflowSessionCreateResult = {
  sessionId: string
  workDir: string
  workflow: WorkflowSessionSummary
  link: LinkedWorkflowSessionProvenance & { targetSessionId: string }
  created: boolean
}

export type WorkflowSessionLinkServiceOptions = {
  sessionService?: SessionService
  createService?: WorkflowSessionCreateService
  stateService?: WorkflowSessionStateService
  isSourceActive?: (sessionId: string) => boolean | Promise<boolean>
  summaryCarryover?: (
    options: WorkflowSummaryCarryoverOptions,
  ) => Promise<WorkflowSummaryCarryoverResult>
  summaryContext?: WorkflowSummaryCarryoverOptions['context']
  inheritMaxCharacters?: number
  summaryFallbackMaxCharacters?: number
}

const LINK_CREATE_KEYS = new Set([
  'workflow',
  'contextStrategy',
  'summaryInstructions',
  'summaryContent',
  'clientRequestId',
])
const CONTEXT_STRATEGIES = new Set<WorkflowLinkContextStrategy>([
  'clear',
  'inherit',
  'summarize',
])
const CARRYOVER_ARTIFACT_ID = 'context-carryover'
const DEFAULT_INHERIT_MAX_CHARACTERS = 24_000
const DEFAULT_SUMMARY_FALLBACK_MAX_CHARACTERS = 12_000

class WorkflowSessionLinkError extends ApiError {
  constructor(statusCode: number, code: string, message: string) {
    super(statusCode, message, code)
  }
}

function configDir(): string {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
}

function workflowLinkError(
  statusCode: number,
  code: string,
  message: string,
): WorkflowSessionLinkError {
  return new WorkflowSessionLinkError(statusCode, code, message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function normalizeRequest(value: unknown): LinkedWorkflowSessionCreateRequest {
  if (!isRecord(value)) {
    throw workflowLinkError(400, 'WORKFLOW_TEMPLATE_INVALID', 'Linked workflow request must be an object')
  }

  for (const key of Object.keys(value)) {
    if (!LINK_CREATE_KEYS.has(key)) {
      throw workflowLinkError(400, 'WORKFLOW_TEMPLATE_INVALID', `Unsupported linked workflow field: ${key}`)
    }
  }

  const strategy = value.contextStrategy
  if (typeof strategy !== 'string' || !CONTEXT_STRATEGIES.has(strategy as WorkflowLinkContextStrategy)) {
    throw workflowLinkError(400, 'WORKFLOW_TEMPLATE_INVALID', 'contextStrategy must be clear, inherit, or summarize')
  }

  if (value.summaryInstructions !== undefined && typeof value.summaryInstructions !== 'string') {
    throw workflowLinkError(400, 'WORKFLOW_TEMPLATE_INVALID', 'summaryInstructions must be a string')
  }
  if (value.summaryContent !== undefined) {
    if (typeof value.summaryContent !== 'string' || value.summaryContent.trim().length === 0) {
      throw workflowLinkError(400, 'WORKFLOW_TEMPLATE_INVALID', 'summaryContent must be a non-empty string')
    }
    if (value.summaryContent.length > DEFAULT_SUMMARY_FALLBACK_MAX_CHARACTERS) {
      throw workflowLinkError(400, 'WORKFLOW_TEMPLATE_INVALID', 'summaryContent is too large')
    }
  }

  if (value.clientRequestId !== undefined) {
    if (typeof value.clientRequestId !== 'string' || value.clientRequestId.trim().length === 0) {
      throw workflowLinkError(400, 'WORKFLOW_TEMPLATE_INVALID', 'clientRequestId must be a non-empty string')
    }
  }

  return {
    workflow: value.workflow as WorkflowSessionCreateOptions,
    contextStrategy: strategy as WorkflowLinkContextStrategy,
    ...(typeof value.summaryInstructions === 'string' ? { summaryInstructions: value.summaryInstructions } : {}),
    ...(typeof value.summaryContent === 'string' ? { summaryContent: value.summaryContent.trim() } : {}),
    ...(typeof value.clientRequestId === 'string' ? { clientRequestId: value.clientRequestId.trim() } : {}),
  }
}

function hydrateSelectedExpertMaterials(
  source: Awaited<ReturnType<SessionService['getSession']>> ,
  request: LinkedWorkflowSessionCreateRequest,
): LinkedWorkflowSessionCreateRequest {
  const repoMetadata = request.workflow.repoMetadata
  if (!isRecord(repoMetadata) || !Array.isArray(repoMetadata.expertMaterials)) return request
  const requestedRunIds = repoMetadata.expertMaterials.map((value) => {
    if (typeof value === 'string') return value
    return isRecord(value) && typeof value.runId === 'string' ? value.runId : ''
  }).filter(Boolean)
  if (requestedRunIds.length === 0) return request

  const available = new Map((source?.expert?.materialRefs ?? []).map((ref) => [ref.runId, ref]))
  const resolved = requestedRunIds.map((runId) => available.get(runId)).filter(Boolean)
  if (resolved.length !== requestedRunIds.length) {
    throw workflowLinkError(400, 'WORKFLOW_TEMPLATE_INVALID', 'Selected expert materials are not available from this source session')
  }
  return {
    ...request,
    workflow: {
      ...request.workflow,
      repoMetadata: {
        ...repoMetadata,
        expertMaterials: resolved,
      },
    },
  }
}

function hasSelectedExpertMaterials(request: LinkedWorkflowSessionCreateRequest): boolean {
  return isRecord(request.workflow.repoMetadata) &&
    Array.isArray(request.workflow.repoMetadata.expertMaterials) &&
    request.workflow.repoMetadata.expertMaterials.length > 0
}

async function exitExpertRuntimeForWorkflowSource(
  service: SessionService,
  sourceSessionId: string,
  source: Awaited<ReturnType<SessionService['getSession']>> ,
): Promise<void> {
  if (!source?.expert || source.expert.status === 'exited') return
  const { runtimeBinding: _runtimeBinding, ...retainedExpertMetadata } = source.expert
  const now = new Date().toISOString()
  await service.appendSessionMetadata(sourceSessionId, {
    workDir: source.workDir || process.cwd(),
    expert: {
      ...retainedExpertMetadata,
      status: 'exited',
      updatedAt: now,
      exitedAt: now,
    },
  })
}

function visibleMessageText(message: MessageEntry): string {
  if (typeof message.content === 'string') return message.content.trim()
  if (!Array.isArray(message.content)) return ''

  return message.content
    .flatMap((block) => {
      if (!isRecord(block)) return []
      if (block.type === 'text' && typeof block.text === 'string') return [block.text]
      return []
    })
    .join('\n')
    .trim()
}

function formatInheritContent(messages: MessageEntry[]): string {
  return messages
    .map((message) => {
      const text = visibleMessageText(message)
      if (!text) return null
      const label = message.type === 'assistant' ? 'Assistant' : 'User'
      return `${label}: ${text}`
    })
    .filter((line): line is string => !!line)
    .join('\n\n')
}

function truncateForCarryover(text: string, maxCharacters: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxCharacters) return normalized
  return `${normalized.slice(0, Math.max(0, maxCharacters - 16)).trimEnd()} ...[truncated]`
}

function generateLocalSummaryCarryover(
  messages: MessageEntry[],
  options: {
    summaryInstructions?: string
    maxCharacters: number
    unavailableReason?: string
  },
): { content: string; sourceMessageIds: string[] } {
  const visible = messages
    .map((message) => {
      const text = visibleMessageText(message)
      if (!text) return null
      const label = message.type === 'assistant' ? 'Assistant' : message.type === 'system' ? 'System' : 'User'
      return {
        id: message.id,
        text: `${label}: ${truncateForCarryover(text, 1_600)}`,
      }
    })
    .filter((item): item is { id: string; text: string } => !!item)

  const header = [
    'Local workflow context summary',
    'Provider-backed summarization was unavailable, so this carryover was generated locally from visible source messages.',
    options.unavailableReason ? `Unavailable reason: ${truncateForCarryover(options.unavailableReason, 600)}` : '',
    options.summaryInstructions?.trim()
      ? `User summary instructions: ${truncateForCarryover(options.summaryInstructions, 800)}`
      : 'User summary instructions: preserve decisions, constraints, and unresolved questions.',
    '',
    'Source message excerpts:',
  ].filter(Boolean).join('\n')

  if (visible.length === 0) {
    return {
      content: `${header}\n- No visible source messages were available.`,
      sourceMessageIds: [],
    }
  }

  const selected: typeof visible = []
  let used = header.length
  for (const item of [...visible].reverse()) {
    const nextLength = item.text.length + 4
    if (selected.length > 0 && used + nextLength > options.maxCharacters) break
    selected.unshift(item)
    used += nextLength
  }

  return {
    content: `${header}\n${selected.map((item) => `- ${item.text}`).join('\n')}`,
    sourceMessageIds: selected.map((item) => item.id),
  }
}

function toSummaryMessages(messages: MessageEntry[]): WorkflowSummaryCarryoverOptions['messages'] {
  return messages
    .filter((message) => message.type === 'user' || message.type === 'assistant' || message.type === 'system')
    .map((message) => ({
      type: message.type === 'system' ? 'system' : message.type,
      uuid: message.id,
      timestamp: message.timestamp,
      message: {
        role: message.type === 'assistant' ? 'assistant' : message.type === 'system' ? 'system' : 'user',
        content: message.type === 'assistant' && typeof message.content === 'string'
          ? [{ type: 'text', text: message.content }]
          : message.content,
      },
    })) as WorkflowSummaryCarryoverOptions['messages']
}

function artifactPointer(
  targetSessionId: string,
  artifactId: string,
  createdAt: string,
): WorkflowArtifactPointer {
  return {
    kind: 'phase-artifact',
    sessionId: targetSessionId,
    artifactId,
    schemaVersion: 1,
    createdAt,
    updatedAt: createdAt,
    label: 'Workflow context carryover',
  }
}

function appendArtifactPointer(
  state: WorkflowSessionState,
  pointer: WorkflowArtifactPointer,
): WorkflowSessionState['artifactIndex'] {
  if (Array.isArray(state.artifactIndex)) {
    return state.artifactIndex.some((item) => item.artifactId === pointer.artifactId)
      ? state.artifactIndex
      : [...state.artifactIndex, pointer]
  }

  return {
    ...(state.artifactIndex ?? {}),
    [pointer.artifactId]: pointer,
  }
}

function appendActivePhaseInputRef(
  state: WorkflowSessionState,
  pointer: WorkflowArtifactPointer,
): WorkflowSessionState['phaseRuns'] {
  return state.phaseRuns.map((phaseRun) => {
    if (phaseRun.phaseId !== state.activePhaseId) return phaseRun
    if (phaseRun.inputArtifactRefs.some((ref) => ref.artifactId === pointer.artifactId)) return phaseRun
    return {
      ...phaseRun,
      inputArtifactRefs: [...phaseRun.inputArtifactRefs, pointer],
    }
  })
}

function makeStartupPrompt(
  strategy: WorkflowLinkContextStrategy,
  content: string,
): string | undefined {
  if (!content || strategy === 'clear') return undefined
  return [
    '<workflow-context-carryover>',
    `strategy: ${strategy}`,
    '',
    content,
    '</workflow-context-carryover>',
  ].join('\n')
}

export class WorkflowSessionLinkService {
  private readonly sessionService: SessionService
  private readonly createService: WorkflowSessionCreateService
  private readonly stateService: WorkflowSessionStateService
  private readonly isSourceActive: (sessionId: string) => boolean | Promise<boolean>
  private readonly summaryCarryover: (
    options: WorkflowSummaryCarryoverOptions,
  ) => Promise<WorkflowSummaryCarryoverResult>
  private readonly summaryContext?: WorkflowSummaryCarryoverOptions['context']
  private readonly inheritMaxCharacters: number
  private readonly summaryFallbackMaxCharacters: number

  constructor(options: WorkflowSessionLinkServiceOptions = {}) {
    this.sessionService = options.sessionService ?? defaultSessionService
    this.stateService = options.stateService ?? new WorkflowSessionStateService()
    this.createService = options.createService ?? new WorkflowSessionCreateService({
      stateService: this.stateService,
    })
    this.isSourceActive = options.isSourceActive ?? ((sessionId) => conversationService.hasSession(sessionId))
    this.summaryCarryover = options.summaryCarryover ?? generateWorkflowSummaryCarryover
    this.summaryContext = options.summaryContext
    this.inheritMaxCharacters = options.inheritMaxCharacters ?? DEFAULT_INHERIT_MAX_CHARACTERS
    this.summaryFallbackMaxCharacters = options.summaryFallbackMaxCharacters ?? DEFAULT_SUMMARY_FALLBACK_MAX_CHARACTERS
  }

  async createLinkedWorkflowSession(
    sourceSessionId: string,
    requestInput: unknown,
  ): Promise<LinkedWorkflowSessionCreateResult> {
    let request = normalizeRequest(requestInput)
    const duplicate = request.clientRequestId
      ? await this.findDuplicateLink(sourceSessionId, request.clientRequestId)
      : null
    if (duplicate) return duplicate

    const source = await this.sessionService.getSession(sourceSessionId)
    if (!source) {
      throw workflowLinkError(404, 'SESSION_NOT_FOUND', `Session not found: ${sourceSessionId}`)
    }
    if (source.workflow?.mode === 'workflow' && source.workflow.status !== 'completed' && source.workflow.status !== 'cancelled') {
      throw workflowLinkError(400, 'WORKFLOW_SOURCE_INVALID', 'Workflow sessions cannot be used as linked workflow sources')
    }
    if (await this.isSourceActive(sourceSessionId)) {
      throw workflowLinkError(409, 'WORKFLOW_SOURCE_ACTIVE', 'Source session is active')
    }

    request = hydrateSelectedExpertMaterials(source, request)
    const workflowTemplate = await this.createService.resolveTemplate(request.workflow)

    if (request.contextStrategy === 'inherit') {
      await exitExpertRuntimeForWorkflowSource(this.sessionService, sourceSessionId, source)
      const workDir = source.workDir || process.cwd()
      const workflow = await this.createService.createWorkflowSessionMetadata(
        sourceSessionId,
        workDir,
        workflowTemplate,
        request.workflow,
      )
      const createdAt = new Date().toISOString()
      const link = {
        sourceSessionId,
        targetSessionId: sourceSessionId,
        sourceMessageCount: source.messageCount,
        contextStrategy: request.contextStrategy,
        ...(hasSelectedExpertMaterials(request) ? { expertMaterialArtifactId: 'expert-materials' } : {}),
        createdAt,
        ...(request.clientRequestId ? { clientRequestId: request.clientRequestId } : {}),
      } satisfies LinkedWorkflowSessionCreateResult['link']
      await this.persistLinkState(sourceSessionId, link, { content: '', sourceMessageIds: [] }, createdAt)
      const updatedState = await this.stateService.readState(sourceSessionId)
      return {
        sessionId: sourceSessionId,
        workDir,
        workflow: updatedState.state ? workflowSummaryFromState(updatedState.state) : workflow,
        link,
        created: true,
      }
    }

    const carryover = await this.prepareCarryover(source.messages, request)
    const target = await this.sessionService.createSession(source.workDir || undefined)
    const workflow = await this.createService.createWorkflowSessionMetadata(
      target.sessionId,
      target.workDir,
      workflowTemplate,
      request.workflow,
    )
    const createdAt = new Date().toISOString()
    const link = {
      sourceSessionId,
      targetSessionId: target.sessionId,
      sourceMessageCount: source.messageCount,
      contextStrategy: request.contextStrategy,
      ...(carryover.content ? { summaryArtifactId: CARRYOVER_ARTIFACT_ID } : {}),
      ...(hasSelectedExpertMaterials(request) ? { expertMaterialArtifactId: 'expert-materials' } : {}),
      createdAt,
      ...(request.clientRequestId ? { clientRequestId: request.clientRequestId } : {}),
    } satisfies LinkedWorkflowSessionCreateResult['link']

    await this.persistLinkState(target.sessionId, link, carryover, createdAt)

    const updatedState = await this.stateService.readState(target.sessionId)
    return {
      sessionId: target.sessionId,
      workDir: target.workDir,
      workflow: updatedState.state ? workflowSummaryFromState(updatedState.state) : workflow,
      link,
      created: true,
    }
  }

  async previewSummary(
    sourceSessionId: string,
    options: { summaryInstructions?: string },
  ): Promise<{ content: string; sourceMessageCount: number }> {
    const source = await this.sessionService.getSession(sourceSessionId)
    if (!source) {
      throw workflowLinkError(404, 'SESSION_NOT_FOUND', `Session not found: ${sourceSessionId}`)
    }
    if (source.workflow?.mode === 'workflow' && source.workflow.status !== 'completed' && source.workflow.status !== 'cancelled') {
      throw workflowLinkError(400, 'WORKFLOW_SOURCE_INVALID', 'Workflow sessions cannot be used as linked workflow sources')
    }
    if (await this.isSourceActive(sourceSessionId)) {
      throw workflowLinkError(409, 'WORKFLOW_SOURCE_ACTIVE', 'Source session is active')
    }
    const carryover = await this.prepareCarryover(source.messages, {
      workflow: {} as WorkflowSessionCreateOptions,
      contextStrategy: 'summarize',
      ...(options.summaryInstructions ? { summaryInstructions: options.summaryInstructions } : {}),
    })
    return {
      content: carryover.content,
      sourceMessageCount: source.messageCount,
    }
  }

  private async prepareCarryover(
    messages: MessageEntry[],
    request: LinkedWorkflowSessionCreateRequest,
  ): Promise<{ content: string; sourceMessageIds: string[] }> {
    if (request.contextStrategy === 'clear') {
      return { content: '', sourceMessageIds: [] }
    }

    if (request.contextStrategy === 'inherit') {
      const content = formatInheritContent(messages)
      if (content.length > this.inheritMaxCharacters) {
        throw workflowLinkError(
          422,
          'WORKFLOW_CONTEXT_TOO_LARGE',
          'Source context is too large to inherit; choose summarize instead',
        )
      }
      return {
        content,
        sourceMessageIds: messages.map((message) => message.id),
      }
    }

    if (request.summaryContent) {
      return {
        content: request.summaryContent,
        sourceMessageIds: messages.map((message) => message.id),
      }
    }

    if (!this.summaryContext) {
      return generateLocalSummaryCarryover(messages, {
        summaryInstructions: request.summaryInstructions,
        maxCharacters: this.summaryFallbackMaxCharacters,
        unavailableReason: 'summary runtime context is not configured',
      })
    }

    try {
      const result = await this.summaryCarryover({
        messages: toSummaryMessages(messages),
        context: this.summaryContext,
        summaryInstructions: request.summaryInstructions,
      })
      return {
        content: result.content,
        sourceMessageIds: result.sourceMessageIds,
      }
    } catch (error) {
      if (error instanceof WorkflowSummaryCarryoverError) {
        return generateLocalSummaryCarryover(messages, {
          summaryInstructions: request.summaryInstructions,
          maxCharacters: this.summaryFallbackMaxCharacters,
          unavailableReason: error.message,
        })
      }
      return generateLocalSummaryCarryover(messages, {
        summaryInstructions: request.summaryInstructions,
        maxCharacters: this.summaryFallbackMaxCharacters,
        unavailableReason: `Compact-style workflow summary is unavailable: ${error instanceof Error ? error.message : String(error)}`,
      })
    }
  }

  private async persistLinkState(
    targetSessionId: string,
    link: LinkedWorkflowSessionCreateResult['link'],
    carryover: { content: string; sourceMessageIds: string[] },
    createdAt: string,
  ): Promise<void> {
    let carryoverPointer: WorkflowArtifactPointer | undefined
    if (carryover.content) {
      const artifact: WorkflowContextCarryoverArtifact = {
        schemaVersion: 1,
        sourceSessionId: link.sourceSessionId,
        targetSessionId,
        strategy: link.contextStrategy,
        content: carryover.content,
        createdAt,
        ...(carryover.sourceMessageIds.length > 0 ? { sourceMessageIds: carryover.sourceMessageIds } : {}),
      }
      const write = await this.stateService.writePhaseArtifact(targetSessionId, {
        schemaVersion: 1,
        sessionId: targetSessionId,
        phaseId: 'startup',
        artifactId: CARRYOVER_ARTIFACT_ID,
        lifecycleStatus: 'accepted',
        type: 'text-summary',
        createdAt,
        title: 'Workflow context carryover',
        content: artifact,
        provenance: {
          messageId: link.sourceSessionId,
        },
      })
      carryoverPointer = write.pointer
    }

    const carryoverStartupPrompt = makeStartupPrompt(link.contextStrategy, carryover.content)
    const updated = await this.stateService.updateState(targetSessionId, (state) => {
      const startupPrompt = [state.startupPrompt, carryoverStartupPrompt].filter(Boolean).join('\n\n') || undefined
      const nextState = {
        ...state,
        link,
        contextCarryover: carryoverPointer
          ? {
              artifactId: carryoverPointer.artifactId,
              pointer: carryoverPointer,
              startupPrompt: startupPrompt!,
            }
          : undefined,
        startupPrompt,
        artifactIndex: carryoverPointer
          ? appendArtifactPointer(state, carryoverPointer)
          : state.artifactIndex,
        phaseRuns: carryoverPointer
          ? appendActivePhaseInputRef(state, carryoverPointer)
          : state.phaseRuns,
        updatedAt: createdAt,
      }
      return nextState
    })

    const detail = await this.sessionService.getSession(targetSessionId)
    const workDir = detail?.workDir || process.cwd()
    await this.createService.appendWorkflowMetadata(
      targetSessionId,
      workDir,
      {
        ...stateToWorkflowMetadata(updated.state, updated.pointer),
        link,
      },
    )
  }

  private async findDuplicateLink(
    sourceSessionId: string,
    clientRequestId: string,
  ): Promise<LinkedWorkflowSessionCreateResult | null> {
    const workflowRoot = getAppStoragePath(configDir(), 'workflow-sessions')
    let entries: Array<import('node:fs').Dirent>
    try {
      entries = await fs.readdir(workflowRoot, { withFileTypes: true })
    } catch {
      return null
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const targetSessionId = entry.name
      const read = await this.stateService.readState(targetSessionId)
      const link = read.state?.link
      if (!isRecord(link)) continue
      if (
        link.sourceSessionId !== sourceSessionId ||
        link.clientRequestId !== clientRequestId
      ) {
        continue
      }

      const detail = await this.sessionService.getSession(targetSessionId)
      if (!detail?.workflow || !read.state) continue

      return {
        sessionId: targetSessionId,
        workDir: detail.workDir || process.cwd(),
        workflow: workflowSummaryFromState(read.state),
        link: link as LinkedWorkflowSessionCreateResult['link'],
        created: false,
      }
    }

    return null
  }
}
