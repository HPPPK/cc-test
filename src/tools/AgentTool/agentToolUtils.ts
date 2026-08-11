import { feature } from 'bun:bundle'
import { z } from 'zod/v4'
import { clearInvokedSkillsForAgent } from '../../bootstrap/state.js'
import {
  ALL_AGENT_DISALLOWED_TOOLS,
  ASYNC_AGENT_ALLOWED_TOOLS,
  CUSTOM_AGENT_DISALLOWED_TOOLS,
  IN_PROCESS_TEAMMATE_ALLOWED_TOOLS,
} from '../../constants/tools.js'
import { startAgentSummarization } from '../../services/AgentSummary/agentSummary.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js'
import { clearDumpState } from '../../services/api/dumpPrompts.js'
import { closeCompletedExpertAgentPlaywrightBrowser } from '../../services/tools/expertAgentPlaywrightLifecycle.js'
import { recordExpertSubagentResearchAudit } from '../../services/tools/expertSubagentSkillRuntime.js'
import type { AppState } from '../../state/AppState.js'
import type {
  Tool,
  ToolPermissionContext,
  Tools,
  ToolUseContext,
} from '../../Tool.js'
import { toolMatchesName } from '../../Tool.js'
import {
  completeAgentTask as completeAsyncAgent,
  createActivityDescriptionResolver,
  createProgressTracker,
  enqueueAgentNotification,
  failAgentTask as failAsyncAgent,
  getProgressUpdate,
  getTokenCountFromTracker,
  isLocalAgentTask,
  killAsyncAgent,
  type ProgressTracker,
  updateAgentProgress as updateAsyncAgentProgress,
  updateProgressFromMessage,
} from '../../tasks/LocalAgentTask/LocalAgentTask.js'
import { asAgentId } from '../../types/ids.js'
import type { Message as MessageType } from '../../types/message.js'
import { isAgentSwarmsEnabled } from '../../utils/agentSwarmsEnabled.js'
import { logForDebugging } from '../../utils/debug.js'
import { isInProtectedNamespace } from '../../utils/envUtils.js'
import { AbortError, errorMessage } from '../../utils/errors.js'
import type { CacheSafeParams } from '../../utils/forkedAgent.js'
import { lazySchema } from '../../utils/lazySchema.js'
import {
  extractTextContent,
  getLastAssistantMessage,
} from '../../utils/messages.js'
import type { PermissionMode } from '../../utils/permissions/PermissionMode.js'
import { permissionRuleValueFromString } from '../../utils/permissions/permissionRuleParser.js'
import {
  buildTranscriptForClassifier,
  classifyYoloAction,
} from '../../utils/permissions/yoloClassifier.js'
import { emitTaskProgress as emitTaskProgressEvent } from '../../utils/task/sdkProgress.js'
import { isInProcessTeammate } from '../../utils/teammateContext.js'
import { getTokenCountFromUsage } from '../../utils/tokens.js'
import { EXIT_PLAN_MODE_V2_TOOL_NAME } from '../ExitPlanModeTool/constants.js'
import { ASK_USER_QUESTION_TOOL_NAME } from '../AskUserQuestionTool/prompt.js'
import { AGENT_TOOL_NAME, LEGACY_AGENT_TOOL_NAME } from './constants.js'
import type { AgentDefinition } from './loadAgentsDir.js'
export type ResolvedAgentTools = {
  hasWildcard: boolean
  validTools: string[]
  invalidTools: string[]
  resolvedTools: Tools
  allowedAgentTypes?: string[]
}

export function isExpertSubagentQuestionForbidden(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CC_JIANGXIA_EXPERT_FORBID_SUBAGENT_ASK_USER_QUESTION === '1'
    || env.CC_HAHA_EXPERT_FORBID_SUBAGENT_ASK_USER_QUESTION === '1'
}

export function filterToolsForAgent({
  tools,
  isBuiltIn,
  isAsync = false,
  permissionMode,
  allowExplicitUserQuestion = false,
}: {
  tools: Tools
  isBuiltIn: boolean
  isAsync?: boolean
  permissionMode?: PermissionMode
  /** Only built-in agents that explicitly list AskUserQuestion may opt in. */
  allowExplicitUserQuestion?: boolean
}): Tools {
  return tools.filter(tool => {
    // Allow MCP tools for all agents
    if (tool.name.startsWith('mcp__')) {
      return true
    }
    // Allow ExitPlanMode for agents in plan mode (e.g., in-process teammates)
    // This bypasses both the ALL_AGENT_DISALLOWED_TOOLS and async tool filters
    if (
      toolMatchesName(tool, EXIT_PLAN_MODE_V2_TOOL_NAME) &&
      permissionMode === 'plan'
    ) {
      return true
    }
    const isExplicitUserQuestion = allowExplicitUserQuestion && toolMatchesName(tool, ASK_USER_QUESTION_TOOL_NAME)
    if (ALL_AGENT_DISALLOWED_TOOLS.has(tool.name) && !isExplicitUserQuestion) {
      return false
    }
    if (!isBuiltIn && CUSTOM_AGENT_DISALLOWED_TOOLS.has(tool.name)) {
      return false
    }
    if (isAsync && !ASYNC_AGENT_ALLOWED_TOOLS.has(tool.name) && !isExplicitUserQuestion) {
      if (isAgentSwarmsEnabled() && isInProcessTeammate()) {
        // Allow AgentTool for in-process teammates to spawn sync subagents.
        // Validation in AgentTool.call() prevents background agents and teammate spawning.
        if (toolMatchesName(tool, AGENT_TOOL_NAME)) {
          return true
        }
        // Allow task tools for in-process teammates to coordinate via shared task list
        if (IN_PROCESS_TEAMMATE_ALLOWED_TOOLS.has(tool.name)) {
          return true
        }
      }
      return false
    }
    return true
  })
}

/**
 * Resolves and validates agent tools against available tools
 * Handles wildcard expansion and validation in one place
 */
export function resolveAgentTools(
  agentDefinition: Pick<
    AgentDefinition,
    'tools' | 'disallowedTools' | 'source' | 'permissionMode'
  >,
  availableTools: Tools,
  isAsync = false,
  isMainThread = false,
): ResolvedAgentTools {
  const {
    tools: agentTools,
    disallowedTools,
    source,
    permissionMode,
  } = agentDefinition
  // AskUserQuestion is normally excluded from every subagent. A reviewed built-in
  // agent can opt in only by explicitly declaring the existing tool in its own
  // definition; custom/plugin agents cannot gain this interaction channel.
  const allowExplicitUserQuestion = !isExpertSubagentQuestionForbidden()
    && source === 'built-in'
    && Boolean(agentTools?.some((toolSpec) => permissionRuleValueFromString(toolSpec).toolName === ASK_USER_QUESTION_TOOL_NAME))
  // When isMainThread is true, skip filterToolsForAgent entirely — the main
  // thread's tool pool is already properly assembled by useMergedTools(), so
  // the sub-agent disallow lists shouldn't apply.
  const filteredAvailableTools = isMainThread
    ? availableTools
    : filterToolsForAgent({
        tools: availableTools,
        isBuiltIn: source === 'built-in',
        isAsync,
        permissionMode,
        allowExplicitUserQuestion,
      })

  // Create a set of disallowed tool names for quick lookup
  const disallowedToolSet = new Set(
    disallowedTools?.map(toolSpec => {
      const { toolName } = permissionRuleValueFromString(toolSpec)
      return toolName
    }) ?? [],
  )

  // Filter available tools based on disallowed list
  const allowedAvailableTools = filteredAvailableTools.filter(
    tool => !disallowedToolSet.has(tool.name),
  )

  // If tools is undefined or ['*'], allow all tools (after filtering disallowed)
  const hasWildcard =
    agentTools === undefined ||
    (agentTools.length === 1 && agentTools[0] === '*')
  if (hasWildcard) {
    return {
      hasWildcard: true,
      validTools: [],
      invalidTools: [],
      resolvedTools: allowedAvailableTools,
    }
  }

  const availableToolMap = new Map<string, Tool>()
  for (const tool of allowedAvailableTools) {
    availableToolMap.set(tool.name, tool)
  }

  const validTools: string[] = []
  const invalidTools: string[] = []
  const resolved: Tool[] = []
  const resolvedToolsSet = new Set<Tool>()
  let allowedAgentTypes: string[] | undefined

  for (const toolSpec of agentTools) {
    // Parse the tool spec to extract the base tool name and any permission pattern
    const { toolName, ruleContent } = permissionRuleValueFromString(toolSpec)

    // Special case: Agent tool carries allowedAgentTypes metadata in its spec
    if (toolName === AGENT_TOOL_NAME) {
      if (ruleContent) {
        // Parse comma-separated agent types: "worker, researcher" → ["worker", "researcher"]
        allowedAgentTypes = ruleContent.split(',').map(s => s.trim())
      }
      // For sub-agents, Agent is excluded by filterToolsForAgent — mark the spec
      // valid for allowedAgentTypes tracking but skip tool resolution.
      if (!isMainThread) {
        validTools.push(toolSpec)
        continue
      }
      // For main thread, filtering was skipped so Agent is in availableToolMap —
      // fall through to normal resolution below.
    }

    const tool = availableToolMap.get(toolName)
    if (tool) {
      validTools.push(toolSpec)
      if (!resolvedToolsSet.has(tool)) {
        resolved.push(tool)
        resolvedToolsSet.add(tool)
      }
    } else {
      invalidTools.push(toolSpec)
    }
  }

  return {
    hasWildcard: false,
    validTools,
    invalidTools,
    resolvedTools: resolved,
    allowedAgentTypes,
  }
}

const EXPERT_PLAYWRIGHT_AUDIT_AGENT_TYPES = new Set([
  'expert-evidence-researcher',
  'expert-evidence-reviewer',
])

/** Evidence subagents may return partial messages before an upstream/tool failure.
 * Those partial messages are not completed research and must reach the parent as
 * an error instead of a misleading completed Agent result. */
export function shouldSurfaceExpertEvidenceAgentFailure(agentType: string | undefined): boolean {
  return agentType === 'expert-evidence-researcher' || agentType === 'expert-evidence-reviewer'
}

export const playwrightAuditStatusSchema = z.enum([
  'opened',
  'access_limited',
  'failed',
  'pending',
])

export const playwrightAuditEntrySchema = z.object({
  target: z.string(),
  /** Present only when the actual navigation was a recognised search-engine entry. */
  kind: z.enum(['search', 'url']).optional(),
  searchEngine: z.enum(['Google', '百度', 'Bing', '360']).optional(),
  query: z.string().optional(),
  searchUrl: z.string().url().optional(),
  status: playwrightAuditStatusSchema,
  finalUrl: z.string().optional(),
  detail: z.string().optional(),
})

export type PlaywrightAuditStatus = z.infer<typeof playwrightAuditStatusSchema>
export type PlaywrightAuditEntry = z.infer<typeof playwrightAuditEntrySchema>

export const agentToolResultSchema = lazySchema(() =>
  z.object({
    agentId: z.string(),
    agentType: z.string().optional(),
    content: z.array(z.object({ type: z.literal('text'), text: z.string() })),
    totalToolUseCount: z.number(),
    playwrightToolUseCount: z.number().optional(),
    playwrightAudit: z.array(playwrightAuditEntrySchema).optional(),
    totalDurationMs: z.number(),
    totalTokens: z.number(),
    usage: z.object({
      input_tokens: z.number(),
      output_tokens: z.number(),
      cache_creation_input_tokens: z.number().nullable(),
      cache_read_input_tokens: z.number().nullable(),
      server_tool_use: z.object({ web_search_requests: z.number(), web_fetch_requests: z.number() }).nullable(),
      service_tier: z.enum(['standard', 'priority', 'batch']).nullable(),
      cache_creation: z.object({ ephemeral_1h_input_tokens: z.number(), ephemeral_5m_input_tokens: z.number() }).nullable(),
    }),
  }),
)

export type AgentToolResult = z.input<ReturnType<typeof agentToolResultSchema>>

export function countToolUses(messages: MessageType[]): number {
  let count = 0
  for (const message of messages) {
    if (message.type !== 'assistant') continue
    for (const block of message.message.content) if (block.type === 'tool_use') count++
  }
  return count
}

/** Counts real SDK tool_use blocks for one exact tool name; never infer usage from text or URLs. */
export function countToolUsesByName(messages: MessageType[], toolName: string): number {
  let count = 0
  for (const message of messages) {
    if (message.type !== 'assistant') continue
    for (const block of message.message.content) if (block.type === 'tool_use' && block.name === toolName) count++
  }
  return count
}

function truncatePlaywrightAuditDetail(value: string, maxLength = 280): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length <= maxLength ? normalized : normalized.slice(0, Math.max(0, maxLength - 1)) + '…'
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : undefined
}

type PlaywrightAuditTarget = Pick<PlaywrightAuditEntry, 'target' | 'kind' | 'searchEngine' | 'query' | 'searchUrl'> & {
  actionIndex?: number
}

function searchEngineForAuditUrl(value: string): PlaywrightAuditEntry['searchEngine'] | undefined {
  try {
    const hostname = new URL(value).hostname.toLowerCase()
    if (hostname.includes('google.')) return 'Google'
    if (hostname.includes('baidu.')) return '百度'
    if (hostname.includes('bing.')) return 'Bing'
    if (hostname === 'so.com' || hostname.endsWith('.so.com')) return '360'
  } catch {
    // A malformed navigation is still retained as a normal failed target below.
  }
  return undefined
}

function searchQueryFromUrl(value: string): string | undefined {
  try {
    const query = new URL(value).searchParams
    for (const name of ['q', 'wd', 'query', 'word']) {
      const candidate = query.get(name)?.trim()
      if (candidate) return candidate
    }
  } catch {
    // The caller keeps the original target for a malformed URL.
  }
  return undefined
}

function searchQueryFromActions(actions: Record<string, unknown>[]): string | undefined {
  for (const action of actions) {
    if ((action.type === 'fill' || action.type === 'type') && typeof action.text === 'string' && action.text.trim()) {
      return action.text.trim()
    }
  }
  return undefined
}

function playwrightAuditTargets(input: unknown): PlaywrightAuditTarget[] {
  const rawActions = asRecord(input)?.actions
  if (!Array.isArray(rawActions)) return []
  const actions = rawActions.map(asRecord).filter((action): action is Record<string, unknown> => Boolean(action))
  const targets = actions.flatMap((action, actionIndex) => {
    if ((action.type !== 'navigate' && action.type !== 'new_tab') || typeof action.url !== 'string') return []
    const searchEngine = searchEngineForAuditUrl(action.url)
    if (!searchEngine) return [{ target: action.url, kind: 'url' as const, actionIndex }]
    const query = searchQueryFromUrl(action.url) ?? searchQueryFromActions(actions)
    return [{
      target: query ?? action.url,
      kind: 'search' as const,
      searchEngine,
      ...(query ? { query } : {}),
      searchUrl: action.url,
      actionIndex,
    }]
  })
  return targets.length > 0 ? targets : [{ target: 'Playwright action sequence' }]
}

type PlaywrightLedgerStep = {
  index?: number
  type?: string
  outcome?: 'success' | 'failed'
  url?: string
  detail?: string
}

type PlaywrightLedger = {
  url?: string
  accessLimited?: boolean
  error?: string
  steps?: PlaywrightLedgerStep[]
}

function decodePlaywrightLedger(content: unknown): PlaywrightLedger | undefined {
  const text = typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content.map((block) => typeof asRecord(block)?.text === 'string' ? asRecord(block)?.text : '').join('\n')
      : ''
  const match = text.match(/<playwright-action-ledger\s+encoding=\"base64\">([A-Za-z0-9+/=]+)<\/playwright-action-ledger>/i)
  if (!match?.[1]) return undefined
  try {
    const parsed = asRecord(JSON.parse(Buffer.from(match[1], 'base64').toString('utf8')))
    if (!parsed) return undefined
    return {
      ...(typeof parsed.url === 'string' ? { url: parsed.url } : {}),
      ...(typeof parsed.accessLimited === 'boolean' ? { accessLimited: parsed.accessLimited } : {}),
      ...(typeof parsed.error === 'string' ? { error: parsed.error } : {}),
      ...(Array.isArray(parsed.steps) ? { steps: parsed.steps.map(asRecord).filter((step): step is PlaywrightLedgerStep => Boolean(step)) } : {}),
    }
  } catch { return undefined }
}

function isHumanVerificationUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false
  return /(?:wappass\.baidu\.com|captcha|recaptcha|hcaptcha|verify|verification)/i.test(value)
}

function firstHumanVerificationStepIndex(ledger: PlaywrightLedger): number | undefined {
  for (const step of ledger.steps ?? []) {
    if (
      typeof step.index === 'number'
      && (isHumanVerificationUrl(step.url) || /captcha|human verification|安全验证|滑块/i.test(step.detail ?? ''))
    ) return step.index
  }
  return undefined
}

/** Reads actual Playwright action traces, never natural-language claims, for evidence-agent auditing. */
export function buildPlaywrightAudit(messages: MessageType[]): PlaywrightAuditEntry[] {
  const resultsByUseId = new Map<string, { content: unknown; isError: boolean }>()
  for (const message of messages) {
    if (message.type !== 'user') continue
    for (const block of message.message.content) if (block.type === 'tool_result') resultsByUseId.set(block.tool_use_id, { content: block.content, isError: Boolean(block.is_error) })
  }
  const audit: PlaywrightAuditEntry[] = []
  for (const message of messages) {
    if (message.type !== 'assistant') continue
    for (const block of message.message.content) {
      if (block.type !== 'tool_use' || block.name !== 'Playwright') continue
      const targets = playwrightAuditTargets(block.input)
      const result = resultsByUseId.get(block.id)
      if (!result) {
        audit.push(...targets.map(({ actionIndex: _actionIndex, ...target }) => ({ ...target, status: 'pending' as const, detail: 'No paired Playwright tool result was recorded.' })))
        continue
      }
      const ledger = decodePlaywrightLedger(result.content)
      if (!ledger) {
        audit.push(...targets.map(({ actionIndex: _actionIndex, ...target }) => ({ ...target, status: 'pending' as const, detail: 'Playwright returned no machine-readable action ledger.' })))
        continue
      }
      const hasIndexedSteps = ledger.steps?.some((step) => typeof step.index === 'number') ?? false
      for (const { actionIndex, ...target } of targets) {
        const actionStep = actionIndex === undefined || !hasIndexedSteps
          ? undefined
          : ledger.steps?.find((step) => step.index === actionIndex)
        const failure = actionStep?.outcome === 'failed' ? actionStep : undefined
        const actionDidNotRun = actionIndex !== undefined && hasIndexedSteps && !actionStep
        const verificationStepIndex = firstHumanVerificationStepIndex(ledger)
        const accessLimitedForTarget = Boolean(ledger.accessLimited) && (
          actionIndex === undefined
          || verificationStepIndex === undefined
          || actionIndex >= verificationStepIndex
        )
        const errorAppliesToTarget = !ledger.accessLimited || accessLimitedForTarget
        const status: PlaywrightAuditStatus = actionDidNotRun
          ? 'pending'
          : accessLimitedForTarget
            ? 'access_limited'
            : errorAppliesToTarget && (ledger.error || result.isError || failure)
              ? 'failed'
              : 'opened'
        const actionUrl = actionStep?.url
        const finalUrl = actionUrl && !(isHumanVerificationUrl(actionUrl) && !accessLimitedForTarget)
          ? actionUrl
          : ledger.url
        audit.push({
          ...target,
          status,
          ...(finalUrl ? { finalUrl } : {}),
          ...(actionDidNotRun
            ? { detail: 'This navigation did not run because the Playwright action sequence stopped earlier.' }
            : errorAppliesToTarget && ledger.error
              ? { detail: truncatePlaywrightAuditDetail(ledger.error) }
              : failure?.detail
                ? { detail: truncatePlaywrightAuditDetail(failure.detail) }
                : {}),
        })
      }
    }
  }
  return audit
}

/** Keeps browser audit provenance available to parent Expert agents; it enforces no pack-specific business rule. */
export function requiresPlaywrightAudit(agentType: string | undefined): boolean {
  return Boolean(agentType && EXPERT_PLAYWRIGHT_AUDIT_AGENT_TYPES.has(agentType))
}

/** Formats bounded, transcript-derived browser outcomes for the parent agent. */
export function formatPlaywrightAudit(
  audit: PlaywrightAuditEntry[] | undefined,
  maxEntries = 32,
): string {
  const entries = audit ?? []
  if (entries.length === 0) {
    return '<playwright-browser-audit>\nNo Playwright tool result was recorded. Do not treat the subagent prose as public-web evidence.\n</playwright-browser-audit>'
  }
  const lines = entries.slice(0, maxEntries).map(entry => {
    const target = entry.kind === 'search'
      ? `query ${JSON.stringify(entry.query ?? entry.target)}${entry.searchEngine ? ` [engine=${entry.searchEngine}]` : ''}${entry.searchUrl ? ` [search_url=${entry.searchUrl}]` : ''}`
      : entry.target
    const finalUrl = entry.finalUrl ? ` [final_url=${entry.finalUrl}]` : ''
    return `- ${entry.status}: ${target}${finalUrl}${entry.detail ? ` — ${entry.detail}` : ''}`
  })
  if (entries.length > maxEntries) {
    lines.push(`- truncated: ${entries.length - maxEntries} additional Playwright call(s) are retained in the transcript.`)
  }
  return `<playwright-browser-audit>\n${lines.join('\n')}\n</playwright-browser-audit>`
}

export function finalizeAgentTool(
  agentMessages: MessageType[],
  agentId: string,
  metadata: {
    prompt: string
    resolvedAgentModel: string
    isBuiltInAgent: boolean
    startTime: number
    agentType: string
    isAsync: boolean
  },
): AgentToolResult {
  const {
    prompt,
    resolvedAgentModel,
    isBuiltInAgent,
    startTime,
    agentType,
    isAsync,
  } = metadata

  const lastAssistantMessage = getLastAssistantMessage(agentMessages)
  if (lastAssistantMessage === undefined) {
    throw new Error('No assistant messages found')
  }
  // Extract text content from the agent's response. If the final assistant
  // message is a pure tool_use block (loop exited mid-turn), fall back to
  // the most recent assistant message that has text content.
  let content = lastAssistantMessage.message.content.filter(
    _ => _.type === 'text',
  )
  if (content.length === 0) {
    for (let i = agentMessages.length - 1; i >= 0; i--) {
      const m = agentMessages[i]!
      if (m.type !== 'assistant') continue
      const textBlocks = m.message.content.filter(_ => _.type === 'text')
      if (textBlocks.length > 0) {
        content = textBlocks
        break
      }
    }
  }

  const totalTokens = getTokenCountFromUsage(lastAssistantMessage.message.usage)
  const totalToolUseCount = countToolUses(agentMessages)
  const playwrightToolUseCount = countToolUsesByName(
    agentMessages,
    'Playwright',
  )
  const playwrightAudit = buildPlaywrightAudit(agentMessages)

  logEvent('tengu_agent_tool_completed', {
    agent_type:
      agentType as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    model:
      resolvedAgentModel as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    prompt_char_count: prompt.length,
    response_char_count: content.length,
    assistant_message_count: agentMessages.length,
    total_tool_uses: totalToolUseCount,
    browser_research_tool_uses: playwrightToolUseCount,
    duration_ms: Date.now() - startTime,
    total_tokens: totalTokens,
    is_built_in_agent: isBuiltInAgent,
    is_async: isAsync,
  })

  // Signal to inference that this subagent's cache chain can be evicted.
  const lastRequestId = lastAssistantMessage.requestId
  if (lastRequestId) {
    logEvent('tengu_cache_eviction_hint', {
      scope:
        'subagent_end' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      last_request_id:
        lastRequestId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
  }

  return {
    agentId,
    agentType,
    content,
    totalDurationMs: Date.now() - startTime,
    totalTokens,
    totalToolUseCount,
    playwrightToolUseCount,
    playwrightAudit,
    usage: lastAssistantMessage.message.usage,
  }
}

/**
 * Persists transcript-derived browser provenance for Expert researchers after
 * either synchronous or asynchronous Agent completion. This remains a no-op
 * for ordinary agents and never exposes another model-callable tool.
 */
export async function recordFinalizedExpertAgentResearchAudit(
  agentResult: Pick<AgentToolResult, 'agentId' | 'agentType' | 'playwrightAudit'>,
  fallbackAgentType: string,
  recordAudit: typeof recordExpertSubagentResearchAudit = recordExpertSubagentResearchAudit,
): Promise<void> {
  await recordAudit({
    agentId: agentResult.agentId,
    agentType: agentResult.agentType ?? fallbackAgentType,
    entries: agentResult.playwrightAudit ?? [],
  })
}

/**
 * Returns the name of the last tool_use block in an assistant message,
 * or undefined if the message is not an assistant message with tool_use.
 */
export function getLastToolUseName(message: MessageType): string | undefined {
  if (message.type !== 'assistant') return undefined
  const block = message.message.content.findLast(b => b.type === 'tool_use')
  return block?.type === 'tool_use' ? block.name : undefined
}

export function emitTaskProgress(
  tracker: ProgressTracker,
  taskId: string,
  toolUseId: string | undefined,
  description: string,
  startTime: number,
  lastToolName: string,
): void {
  const progress = getProgressUpdate(tracker)
  emitTaskProgressEvent({
    taskId,
    toolUseId,
    description: progress.lastActivity?.activityDescription ?? description,
    startTime,
    totalTokens: progress.tokenCount,
    toolUses: progress.toolUseCount,
    lastToolName,
  })
}

export async function classifyHandoffIfNeeded({
  agentMessages,
  tools,
  toolPermissionContext,
  abortSignal,
  subagentType,
  totalToolUseCount,
}: {
  agentMessages: MessageType[]
  tools: Tools
  toolPermissionContext: AppState['toolPermissionContext']
  abortSignal: AbortSignal
  subagentType: string
  totalToolUseCount: number
}): Promise<string | null> {
  if (feature('TRANSCRIPT_CLASSIFIER')) {
    if (toolPermissionContext.mode !== 'auto') return null

    const agentTranscript = buildTranscriptForClassifier(agentMessages, tools)
    if (!agentTranscript) return null

    const classifierResult = await classifyYoloAction(
      agentMessages,
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: "Sub-agent has finished and is handing back control to the main agent. Review the sub-agent's work based on the block rules and let the main agent know if any file is dangerous (the main agent will see the reason).",
          },
        ],
      },
      tools,
      toolPermissionContext as ToolPermissionContext,
      abortSignal,
    )

    const handoffDecision = classifierResult.unavailable
      ? 'unavailable'
      : classifierResult.shouldBlock
        ? 'blocked'
        : 'allowed'
    logEvent('tengu_auto_mode_decision', {
      decision:
        handoffDecision as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      toolName:
        // Use legacy name for analytics continuity across the Task→Agent rename
        LEGACY_AGENT_TOOL_NAME as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      inProtectedNamespace: isInProtectedNamespace(),
      classifierModel:
        classifierResult.model as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      agentType:
        subagentType as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      toolUseCount: totalToolUseCount,
      isHandoff: true,
      // For handoff, the relevant agent completion is the subagent's final
      // assistant message — the last thing the classifier transcript shows
      // before the handoff review prompt.
      agentMsgId: getLastAssistantMessage(agentMessages)?.message
        .id as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      classifierStage:
        classifierResult.stage as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      classifierStage1RequestId:
        classifierResult.stage1RequestId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      classifierStage1MsgId:
        classifierResult.stage1MsgId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      classifierStage2RequestId:
        classifierResult.stage2RequestId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      classifierStage2MsgId:
        classifierResult.stage2MsgId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })

    if (classifierResult.shouldBlock) {
      // When classifier is unavailable, still propagate the sub-agent's
      // results but with a warning so the parent agent can verify the work.
      if (classifierResult.unavailable) {
        logForDebugging(
          'Handoff classifier unavailable, allowing sub-agent output with warning',
          { level: 'warn' },
        )
        return `Note: The safety classifier was unavailable when reviewing this sub-agent's work. Please carefully verify the sub-agent's actions and output before acting on them.`
      }

      logForDebugging(
        `Handoff classifier flagged sub-agent output: ${classifierResult.reason}`,
        { level: 'warn' },
      )
      return `SECURITY WARNING: This sub-agent performed actions that may violate security policy. Reason: ${classifierResult.reason}. Review the sub-agent's actions carefully before acting on its output.`
    }
  }

  return null
}

/**
 * Extract a partial result string from an agent's accumulated messages.
 * Used when an async agent is killed to preserve what it accomplished.
 * Returns undefined if no text content is found.
 */
export function extractPartialResult(
  messages: MessageType[],
): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!
    if (m.type !== 'assistant') continue
    const text = extractTextContent(m.message.content, '\n')
    if (text) {
      return text
    }
  }
  return undefined
}

type SetAppState = (f: (prev: AppState) => AppState) => void

export type AsyncAgentLifecycleOutcome =
  | { status: 'succeeded' }
  | { status: 'failed', reason: string }

/**
 * Drives a background agent from spawn to terminal notification.
 * Shared between AgentTool's async-from-start path and resumeAgentBackground.
 */
export async function runAsyncAgentLifecycle({
  taskId,
  abortController,
  makeStream,
  metadata,
  description,
  toolUseContext,
  rootSetAppState,
  agentIdForCleanup,
  enableSummarization,
  getWorktreeResult,
}: {
  taskId: string
  abortController: AbortController
  makeStream: (
    onCacheSafeParams: ((p: CacheSafeParams) => void) | undefined,
  ) => AsyncGenerator<MessageType, void>
  metadata: Parameters<typeof finalizeAgentTool>[2]
  description: string
  toolUseContext: ToolUseContext
  rootSetAppState: SetAppState
  agentIdForCleanup: string
  enableSummarization: boolean
  getWorktreeResult: () => Promise<{
    worktreePath?: string
    worktreeBranch?: string
  }>
}): Promise<AsyncAgentLifecycleOutcome> {
  let stopSummarization: (() => void) | undefined
  const agentMessages: MessageType[] = []
  try {
    const tracker = createProgressTracker()
    const resolveActivity = createActivityDescriptionResolver(
      toolUseContext.options.tools,
    )
    const onCacheSafeParams = enableSummarization
      ? (params: CacheSafeParams) => {
          const { stop } = startAgentSummarization(
            taskId,
            asAgentId(taskId),
            params,
            rootSetAppState,
          )
          stopSummarization = stop
        }
      : undefined
    for await (const message of makeStream(onCacheSafeParams)) {
      agentMessages.push(message)
      // Append immediately when UI holds the task (retain). Bootstrap reads
      // disk in parallel and UUID-merges the prefix — disk-write-before-yield
      // means live is always a suffix of disk, so merge is order-correct.
      rootSetAppState(prev => {
        const t = prev.tasks[taskId]
        if (!isLocalAgentTask(t) || !t.retain) return prev
        const base = t.messages ?? []
        return {
          ...prev,
          tasks: {
            ...prev.tasks,
            [taskId]: { ...t, messages: [...base, message] },
          },
        }
      })
      updateProgressFromMessage(
        tracker,
        message,
        resolveActivity,
        toolUseContext.options.tools,
      )
      updateAsyncAgentProgress(
        taskId,
        getProgressUpdate(tracker),
        rootSetAppState,
      )
      const lastToolName = getLastToolUseName(message)
      if (lastToolName) {
        emitTaskProgress(
          tracker,
          taskId,
          toolUseContext.toolUseId,
          description,
          metadata.startTime,
          lastToolName,
        )
      }
    }

    stopSummarization?.()

    const agentResult = finalizeAgentTool(agentMessages, taskId, metadata)
    await recordFinalizedExpertAgentResearchAudit(agentResult, metadata.agentType)

    // Mark task completed FIRST so TaskOutput(block=true) unblocks
    // immediately, then notify the parent before any optional cleanup. The
    // parent session depends on this notification to resume its loop.
    completeAsyncAgent(agentResult, rootSetAppState)

    enqueueAgentNotification({
      taskId,
      description,
      status: 'completed',
      setAppState: rootSetAppState,
      finalMessage: extractTextContent(agentResult.content, '\n'),
      usage: {
        totalTokens: getTokenCountFromTracker(tracker),
        toolUses: agentResult.totalToolUseCount,
        durationMs: agentResult.totalDurationMs,
      },
      toolUseId: toolUseContext.toolUseId,
    })

    void (async () => {
      try {
        await getWorktreeResult()
        if (feature('TRANSCRIPT_CLASSIFIER')) {
          await classifyHandoffIfNeeded({
            agentMessages,
            tools: toolUseContext.options.tools,
            toolPermissionContext:
              toolUseContext.getAppState().toolPermissionContext,
            abortSignal: abortController.signal,
            subagentType: metadata.agentType,
            totalToolUseCount: agentResult.totalToolUseCount,
          })
        }
      } catch (cleanupError) {
        logForDebugging(
          `Async agent post-completion cleanup failed: ${errorMessage(cleanupError)}`,
        )
      }
    })()
    return { status: 'succeeded' }
  } catch (error) {
    stopSummarization?.()
    if (error instanceof AbortError) {
      // killAsyncAgent is a no-op if TaskStop already set status='killed' —
      // but only this catch handler has agentMessages, so the notification
      // must fire unconditionally. Transition status BEFORE worktree cleanup
      // so TaskOutput unblocks even if git hangs (gh-20236).
      killAsyncAgent(taskId, rootSetAppState)
      logEvent('tengu_agent_tool_terminated', {
        agent_type:
          metadata.agentType as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        model:
          metadata.resolvedAgentModel as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        duration_ms: Date.now() - metadata.startTime,
        is_async: true,
        is_built_in_agent: metadata.isBuiltInAgent,
        reason:
          'user_kill_async' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })
      const partialResult = extractPartialResult(agentMessages)
      enqueueAgentNotification({
        taskId,
        description,
        status: 'killed',
        setAppState: rootSetAppState,
        toolUseId: toolUseContext.toolUseId,
        finalMessage: partialResult,
      })
      void getWorktreeResult().catch(cleanupError =>
        logForDebugging(
          `Async agent post-cancel cleanup failed: ${errorMessage(cleanupError)}`,
        ),
      )
      return { status: 'failed', reason: 'Agent was cancelled' }
    }
    const msg = errorMessage(error)
    failAsyncAgent(taskId, msg, rootSetAppState)
    enqueueAgentNotification({
      taskId,
      description,
      status: 'failed',
      error: msg,
      setAppState: rootSetAppState,
      toolUseId: toolUseContext.toolUseId,
    })
    void getWorktreeResult().catch(cleanupError =>
      logForDebugging(
        `Async agent post-failure cleanup failed: ${errorMessage(cleanupError)}`,
      ),
    )
    return { status: 'failed', reason: msg }
  } finally {
    void closeCompletedExpertAgentPlaywrightBrowser(agentIdForCleanup).catch((cleanupError) =>
      logForDebugging(`Expert agent browser cleanup failed: ${errorMessage(cleanupError)}`),
    )
    clearInvokedSkillsForAgent(agentIdForCleanup)
    clearDumpState(agentIdForCleanup)
  }
}
