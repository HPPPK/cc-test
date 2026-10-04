import { searchEngineForUrl, isSearchResultsUrl } from '../../utils/searchEngineSurface.js'
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
import { isFileFirstExpertResearchAgentType } from '../../services/tools/expertFileFirstResearchProtocol.js'
import { loadExpertPostReviewEvidenceAbsorptionContext, recordExpertSubagentResearchAudit, type ExpertResearchSourceAssignment } from '../../services/tools/expertSubagentSkillRuntime.js'
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

/** Active Expert sessions bypass ordinary subagent tool narrowing. */
export function isExpertSubagentFullToolAccess(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CC_JIANGXIA_EXPERT_FULL_TOOL_ACCESS === '1'
    || env.CC_HAHA_EXPERT_FULL_TOOL_ACCESS === '1'
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
  env: NodeJS.ProcessEnv = process.env,
): ResolvedAgentTools {
  const {
    tools: agentTools,
    disallowedTools,
    source,
    permissionMode,
  } = agentDefinition
  // An active Expert session grants every delegated agent the same host tool
  // pool as its parent, except for package-scoped interaction channels that are
  // explicitly forbidden. In particular, a research worker must not regain
  // AskUserQuestion merely because full tool access is enabled.
  if (!isMainThread && isExpertSubagentFullToolAccess(env)) {
    const resolvedTools = isExpertSubagentQuestionForbidden(env)
      ? availableTools.filter((tool) => !toolMatchesName(tool, ASK_USER_QUESTION_TOOL_NAME))
      : availableTools
    return {
      hasWildcard: true,
      validTools: [],
      invalidTools: [],
      resolvedTools,
    }
  }
  // AskUserQuestion is normally excluded from every subagent. A reviewed built-in
  // agent can opt in only by explicitly declaring the existing tool in its own
  // definition; custom/plugin agents cannot gain this interaction channel.
  const allowExplicitUserQuestion = !isExpertSubagentQuestionForbidden(env)
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
  // Reviewers receive upstream ledgers and are deliberately forbidden from
  // browsing again, so only evidence researchers require browser provenance.
  'expert-evidence-researcher',
])

/** Evidence subagents may return partial messages before an upstream/tool failure.
 * Those partial messages are not completed research and must reach the parent as
 * an error instead of a misleading completed Agent result. */
export function shouldSurfaceExpertEvidenceAgentFailure(agentType: string | undefined): boolean {
  return isFileFirstExpertResearchAgentType(agentType)
}

export const playwrightAuditStatusSchema = z.enum([
  'opened',
  'access_limited',
  'failed',
  'pending',
  'interrupted',
])

export const playwrightAuditEntrySchema = z.object({
  /** Stable per tool use/action inside one active Expert session. */
  auditId: z.string().optional(),
  target: z.string(),
  /** Present only when the actual navigation was a recognised search-engine entry. */
  kind: z.enum(['search', 'url']).optional(),
  searchEngine: z.enum(['Google', '百度', 'Bing', '360']).optional(),
  query: z.string().optional(),
  searchUrl: z.string().url().optional(),
  /** A search homepage does not count as observed keyword results. */
  searchResultStatus: z.enum(['results_observed', 'entry_opened', 'access_limited', 'failed', 'pending', 'interrupted']).optional(),
  status: playwrightAuditStatusSchema,
  finalUrl: z.string().optional(),
  /** Browser action kinds observed in this navigation group. */
  actionTypes: z.array(z.string()).max(64).optional(),
  detail: z.string().optional(),
  accessDiagnostics: z.object({
    connectionKind: z.enum(['managed', 'cdp']),
    searchEngine: z.enum(['Google', '百度', 'Bing', '360']).optional(),
    observedAt: z.string(),
    pacingWaitedMs: z.number().int().nonnegative().optional(),
    verificationKind: z.string().optional(),
  }).optional(),
})

export type PlaywrightAuditStatus = z.infer<typeof playwrightAuditStatusSchema>
export type PlaywrightAuditEntry = z.infer<typeof playwrightAuditEntrySchema>

export const agentToolResultSchema = lazySchema(() =>
  z.object({
    agentId: z.string(),
    agentType: z.string().optional(),
    /** Derived from a successful Write/Edit Markdown mutation, never from an exact final handoff format. */
    artifactPath: z.string().optional(),
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

/** Returns the last Markdown destination whose real Write or Edit call succeeded.
 * A declared tool_use is only an intent: permission denials, failed mutations,
 * or an interrupted stream must never be promoted into a durable artifact path.
 * The server separately validates the allowed path and the saved artifact. */
export function lastWrittenMarkdownArtifactPath(messages: MessageType[]): string | undefined {
  const successfulMutationIds = new Set<string>()
  for (const message of messages) {
    if (message?.type !== 'user') continue
    for (const block of message.message.content) {
      if (block?.type === 'tool_result' && typeof block.tool_use_id === 'string' && block.is_error !== true) {
        successfulMutationIds.add(block.tool_use_id)
      }
    }
  }
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex--) {
    const message = messages[messageIndex]
    if (message?.type !== 'assistant') continue
    for (let blockIndex = message.message.content.length - 1; blockIndex >= 0; blockIndex--) {
      const block = message.message.content[blockIndex]
      if (
        block?.type !== 'tool_use'
        || (block.name !== 'Write' && block.name !== 'Edit')
        || !successfulMutationIds.has(block.id)
      ) continue
      const input = asRecord(block.input)
      const filePath = input?.file_path
      if (typeof filePath !== 'string') continue
      const normalized = filePath.trim()
      if (normalized && normalized === filePath && normalized.endsWith('.md') && !/[\r\n]/.test(normalized)) return normalized
    }
  }
  return undefined
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

/** File-first Expert workers use durable Markdown as their only research handoff. */
export function isFileFirstExpertResearchArtifactAgent(
  agentType: string | undefined,
  _env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isFileFirstExpertResearchAgentType(agentType)
}

function displayArtifactName(artifactPath: string | undefined): string | undefined {
  if (typeof artifactPath !== 'string') return undefined
  const normalized = artifactPath.trim()
  if (!normalized || /[\r\n]/.test(normalized)) return undefined
  const name = normalized.split(/[\\/]/).filter(Boolean).at(-1)
  return name?.endsWith('.md') ? name : undefined
}

/**
 * A file-first worker may think or report freely inside its own transcript, but
 * its parent-visible completion is deliberately reduced to a one-line file
 * receipt. The actual Markdown is read and verified separately by the server.
 */
export function normalizeFinalizedExpertResearchArtifactContent(
  agentType: string,
  content: AgentToolResult['content'],
  artifactPath?: string,
): AgentToolResult['content'] {
  if (!isFileFirstExpertResearchArtifactAgent(agentType)) return content
  const artifactName = displayArtifactName(artifactPath)
  return [{
    type: 'text',
    text: artifactName
      ? `文件交接：${artifactName}；状态：子代理已结束，请直接 Read 已分配 Markdown 核验。`
      : '文件交接：未捕获 Markdown 路径；状态：子代理已结束，请按任务中已分配的 Markdown Read 核验。',
  }]
}

/**
 * Compatibility no-op. Intermediate artifact paths and prose are not a
 * completion gate; later evidence and final-output review own validation.
 */
export function assertFinalizedExpertResearchArtifactWrite(
  _agentMessages: MessageType[],
  _agentType: string,
  _contentOrEnv: AgentToolResult['content'] | NodeJS.ProcessEnv = process.env,
  _legacyEnv?: NodeJS.ProcessEnv,
): void {}
type PlaywrightAuditTarget = Pick<PlaywrightAuditEntry, 'target' | 'kind' | 'searchEngine' | 'query' | 'searchUrl'> & {
  actionIndex?: number
  scriptPageIndex?: number
  scriptPage?: PlaywrightScriptPage
}

const searchEngineForAuditUrl = searchEngineForUrl

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

/** A recognised engine homepage is an entry only; never treat it as a SERP. */
function hasObservedSearchResults(engine: NonNullable<PlaywrightAuditEntry['searchEngine']>, value: string | undefined): boolean {
  return isSearchResultsUrl(value, engine)
}

function playwrightActionTypesForAuditTarget(input: unknown, actionIndex: number | undefined, nextActionIndex: number | undefined): string[] | undefined {
  if (actionIndex === undefined) return undefined
  const rawActions = asRecord(input)?.actions
  if (!Array.isArray(rawActions)) return undefined
  const actionTypes = rawActions
    .slice(actionIndex, nextActionIndex)
    .map(asRecord)
    .map((action) => typeof action?.type === 'string' ? action.type : undefined)
    .filter((action): action is string => Boolean(action))
  return actionTypes.length ? [...new Set(actionTypes)] : undefined
}

function playwrightAuditTargets(input: unknown): PlaywrightAuditTarget[] {
  const rawActions = asRecord(input)?.actions
  if (!Array.isArray(rawActions)) return []
  const actions = rawActions.map(asRecord).filter((action): action is Record<string, unknown> => Boolean(action))
  const targets = actions.flatMap<PlaywrightAuditTarget>((action, actionIndex) => {
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
  return targets
}

type PlaywrightScriptPage = {
  requestedUrl?: string
  finalUrl?: string
  title?: string
  status?: 'opened' | 'access_limited' | 'failed'
  detail?: string
}

type PlaywrightLedgerStep = {
  index?: number
  type?: string
  outcome?: 'success' | 'failed'
  url?: string
  detail?: string
  scriptPages?: PlaywrightScriptPage[]
}

type PlaywrightAccessDiagnostics = {
  connectionKind?: 'managed' | 'cdp'
  searchEngine?: 'Google' | '百度' | 'Bing' | '360'
  observedAt?: string
  pacingWaitedMs?: number
  verificationKind?: string
}

type PlaywrightVerificationHistory = {
  stepIndex?: number
  url?: string
  detail?: string
}

type PlaywrightLedger = {
  sharedHumanVerificationBlocked?: boolean
  url?: string
  textExtracted?: boolean
  accessLimited?: boolean
  verificationHistory?: PlaywrightVerificationHistory[]
  accessDiagnostics?: PlaywrightAccessDiagnostics
  error?: string
  steps?: PlaywrightLedgerStep[]
}

function decodePlaywrightLedger(content: unknown): PlaywrightLedger | undefined {
  const text = typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content.map((block) => typeof asRecord(block)?.text === 'string' ? asRecord(block)?.text : '').join('\n')
      : ''
  const match = text.match(/<playwright-action-ledger\s+encoding="base64">([A-Za-z0-9+/=]+)<\/playwright-action-ledger>/i)
  if (!match?.[1]) return undefined
  try {
    const parsed = asRecord(JSON.parse(Buffer.from(match[1], 'base64').toString('utf8')))
    if (!parsed) return undefined
    return {
      ...(typeof parsed.url === 'string' ? { url: parsed.url } : {}),
      ...(parsed.textExtracted === true ? { textExtracted: true } : {}),
      ...(typeof parsed.accessLimited === 'boolean' ? { accessLimited: parsed.accessLimited } : {}),
      ...(parsed.sharedHumanVerificationBlocked === true ? { sharedHumanVerificationBlocked: true } : {}),
      ...(Array.isArray(parsed.verificationHistory) ? { verificationHistory: parsed.verificationHistory.map(asRecord).filter((entry): entry is PlaywrightVerificationHistory => Boolean(entry)) } : {}),
      ...(asRecord(parsed.accessDiagnostics) ? { accessDiagnostics: parsed.accessDiagnostics as PlaywrightAccessDiagnostics } : {}),
      ...(typeof parsed.error === 'string' ? { error: parsed.error } : {}),
      ...(Array.isArray(parsed.steps) ? { steps: parsed.steps.map(asRecord).filter((step): step is PlaywrightLedgerStep => Boolean(step)) } : {}),
    }
  } catch { return undefined }
}

function scriptPageAuditTargets(ledger: PlaywrightLedger): PlaywrightAuditTarget[] {
  const targets: PlaywrightAuditTarget[] = []
  for (const step of ledger.steps ?? []) {
    if (step.type !== 'script' || typeof step.index !== 'number') continue
    for (const [scriptPageIndex, scriptPage] of (step.scriptPages ?? []).entries()) {
      const targetUrl = scriptPage.requestedUrl ?? scriptPage.finalUrl
      if (!targetUrl) continue
      const searchEngine = searchEngineForAuditUrl(targetUrl)
      if (searchEngine) {
        const query = searchQueryFromUrl(targetUrl)
        targets.push({
          target: query ?? targetUrl,
          kind: 'search',
          searchEngine,
          ...(query ? { query } : {}),
          searchUrl: targetUrl,
          actionIndex: step.index,
          scriptPageIndex,
          scriptPage,
        })
      } else {
        targets.push({ target: targetUrl, kind: 'url', actionIndex: step.index, scriptPageIndex, scriptPage })
      }
    }
  }
  return targets
}

function isHumanVerificationUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false
  return /(?:wappass\.baidu\.com|captcha|recaptcha|hcaptcha|verify|verification)/i.test(value)
}

function firstHumanVerificationStepIndex(ledger: PlaywrightLedger): number | undefined {
  for (const entry of ledger.verificationHistory ?? []) {
    if (typeof entry.stepIndex === 'number') return entry.stepIndex
  }
  for (const step of ledger.steps ?? []) {
    if (
      typeof step.index === 'number'
      && (isHumanVerificationUrl(step.url) || /captcha|human verification|安全验证|滑块/i.test(step.detail ?? ''))
    ) return step.index
  }
  return undefined
}

/**
 * A human-verification history records the page that was actually blocked before
 * the Expert runtime injected a later fallback navigation. Keep that provenance
 * attached to the blocked target rather than replacing it with the fallback URL.
 */
function verificationUrlForAuditTarget(ledger: PlaywrightLedger, actionIndex: number | undefined): string | undefined {
  const history = ledger.verificationHistory ?? []
  if (actionIndex !== undefined) {
    const matchingEntry = history.find((entry) => entry.stepIndex === actionIndex && typeof entry.url === 'string')
    if (matchingEntry?.url) return matchingEntry.url
  }
  if (history.length === 1 && typeof history[0]?.url === 'string') return history[0].url
  return undefined
}

/**
 * The runner may observe an engine's short verification interstitial while the
 * same browser action is still in flight. When the final page is a normal SERP
 * for that same engine and the runner's final assessment is healthy, that is an
 * internal transition diagnostic rather than a user-blocking access limit.
 */
function transientVerificationRecoveredToSearchResults(ledger: PlaywrightLedger): boolean {
  if (ledger.accessLimited || !ledger.url || !(ledger.verificationHistory?.length)) return false
  return ledger.verificationHistory.some((entry) => {
    if (typeof entry.url !== 'string') return false
    const engine = searchEngineForAuditUrl(entry.url)
    return Boolean(engine && hasObservedSearchResults(engine, ledger.url))
  })
}

/**
 * Resolves the URL that a navigation actually reached before the next navigation
 * began. This deliberately differs from the initial action URL: a search flow
 * commonly starts on an engine homepage, fills a query, presses Enter, and only
 * then reaches the evidence-bearing SERP.
 */
function observedActionFinalUrl(input: {
  ledger: PlaywrightLedger
  actionIndex: number | undefined
  nextActionIndex: number | undefined
  accessLimited: boolean
}): string | undefined {
  const { ledger, actionIndex, nextActionIndex, accessLimited } = input
  const urlIsUsable = (url: string | undefined): url is string => Boolean(url) && (accessLimited || !isHumanVerificationUrl(url))

  // The ledger's top-level URL is the browser's final URL for the last action
  // group. Prefer it there so submit/redirect flows retain the resulting page.
  if (nextActionIndex === undefined && urlIsUsable(ledger.url)) return ledger.url

  const observed = (ledger.steps ?? [])
    .filter((step) => (
      typeof step.index === 'number'
      && (actionIndex === undefined || step.index >= actionIndex)
      && (nextActionIndex === undefined || step.index < nextActionIndex)
      && urlIsUsable(step.url)
    ))
    .map((step) => step.url)
    .findLast((url): url is string => Boolean(url))
  if (observed) return observed

  // Preserve an access-limited final URL (for example a CAPTCHA page) when it
  // is the only observed outcome for this action group.
  if (accessLimited && nextActionIndex === undefined && ledger.url) return ledger.url
  return undefined
}

/** Reads actual Playwright action traces, never natural-language claims, for evidence-agent auditing. */
export function buildPlaywrightAudit(messages: MessageType[]): PlaywrightAuditEntry[] {
  const resultsByUseId = new Map<string, { content: unknown; isError: boolean }>()
  for (const message of messages) {
    if (message.type !== 'user') continue
    for (const block of message.message.content) {
      if (block.type === 'tool_result') resultsByUseId.set(block.tool_use_id, { content: block.content, isError: Boolean(block.is_error) })
    }
  }
  const audit: PlaywrightAuditEntry[] = []
  for (const message of messages) {
    if (message.type !== 'assistant') continue
    for (const block of message.message.content) {
      if (block.type !== 'tool_use' || block.name !== 'Playwright') continue
      const result = resultsByUseId.get(block.id)
      const declaredTargets = playwrightAuditTargets(block.input)
      if (!result) {
        const targets = declaredTargets.length > 0 ? declaredTargets : [{ target: 'Playwright action sequence' }]
        audit.push(...targets.map(({ actionIndex: _actionIndex, scriptPageIndex: _scriptPageIndex, scriptPage: _scriptPage, ...target }) => ({ ...target, status: 'pending' as const, detail: 'No paired Playwright tool result was recorded.' })))
        continue
      }
      const ledger = decodePlaywrightLedger(result.content)
      if (!ledger) {
        const targets = declaredTargets.length > 0 ? declaredTargets : [{ target: 'Playwright action sequence' }]
        audit.push(...targets.map(({ actionIndex: _actionIndex, scriptPageIndex: _scriptPageIndex, scriptPage: _scriptPage, ...target }) => ({ ...target, status: 'pending' as const, detail: 'Playwright returned no machine-readable action ledger.' })))
        continue
      }
      if (ledger.sharedHumanVerificationBlocked && !(ledger.steps?.length)) {
        audit.push(...declaredTargets.map(({ actionIndex: _actionIndex, scriptPageIndex: _scriptPageIndex, scriptPage: _scriptPage, ...target }) => ({
          ...target,
          status: 'interrupted' as const,
          detail: '本请求因其它页面的共享验证等待而未执行；不代表目标网站受限或访问失败。' + (ledger.error ? ' ' + ledger.error : ''),
        })))
        continue
      }
      const targets = [...declaredTargets, ...scriptPageAuditTargets(ledger)]
      if (targets.length === 0 && ledger.url && ledger.steps?.length) {
        // An extract/click/typed search in a later call still belongs to the page
        // actually observed by the runner, not a generic action sequence.
        const engine = searchEngineForAuditUrl(ledger.url)
        const query = engine ? searchQueryFromUrl(ledger.url) : undefined
        targets.push({ target: query ?? ledger.url, kind: engine ? 'search' : 'url',
          ...(engine ? { searchEngine: engine, searchUrl: ledger.url } : {}),
          ...(query ? { query } : {}), actionIndex: ledger.steps[0]?.index ?? 0 })
      }
      if (targets.length === 0) targets.push({ target: 'Playwright action sequence' })
      const hasIndexedSteps = ledger.steps?.some((step) => typeof step.index === 'number') ?? false
      for (const [targetPosition, rawTarget] of targets.entries()) {
        const { actionIndex, scriptPageIndex, scriptPage, ...target } = rawTarget
        const nextActionIndex = targets.slice(targetPosition + 1)
          .map((candidate) => candidate.actionIndex)
          .find((candidate): candidate is number => typeof candidate === 'number' && candidate !== actionIndex)
        const actionStep = actionIndex === undefined || !hasIndexedSteps
          ? undefined
          : ledger.steps?.find((step) => step.index === actionIndex)
        const failure = (ledger.steps ?? []).find((step) => step.outcome === 'failed'
          && typeof step.index === 'number' && (actionIndex === undefined || step.index >= actionIndex)
          && (nextActionIndex === undefined || step.index < nextActionIndex))
        const actionDidNotRun = !scriptPage && actionIndex !== undefined && hasIndexedSteps && !actionStep
        const verificationStepIndex = firstHumanVerificationStepIndex(ledger)
        const hasVerificationHistory = (ledger.verificationHistory?.length ?? 0) > 0
        const transientVerificationRecovered = transientVerificationRecoveredToSearchResults(ledger)
        const verificationObserved = Boolean(ledger.accessLimited) || (hasVerificationHistory && !transientVerificationRecovered)
        const accessLimitedForTarget = scriptPage
          ? scriptPage.status === 'access_limited'
          : verificationObserved && (
            actionIndex === undefined ||
            verificationStepIndex === undefined ||
            actionIndex === verificationStepIndex
          )
        const errorAppliesToTarget = scriptPage
          ? scriptPage.status === 'failed'
          : (!verificationObserved || accessLimitedForTarget)
            && (Boolean(failure) || !hasIndexedSteps || nextActionIndex === undefined)
        const status: PlaywrightAuditStatus = scriptPage?.status
          ?? (actionDidNotRun
            ? 'pending'
            : accessLimitedForTarget
              ? 'access_limited'
              : errorAppliesToTarget && (ledger.error || result.isError || failure)
                ? 'failed'
                : 'opened')
        const verificationUrl = accessLimitedForTarget
          ? verificationUrlForAuditTarget(ledger, actionIndex)
          : undefined
        const finalUrl = scriptPage
          ? scriptPage.finalUrl ?? scriptPage.requestedUrl
          : verificationUrl ?? observedActionFinalUrl({
            ledger,
            actionIndex,
            nextActionIndex,
            accessLimited: accessLimitedForTarget,
          }) ?? actionStep?.url ?? ledger.url
        const executedTypes = hasIndexedSteps
          ? (ledger.steps ?? []).filter((step) => step.outcome === 'success'
            && (actionIndex === undefined || step.index! >= actionIndex)
            && (nextActionIndex === undefined || step.index! < nextActionIndex))
            .map((step) => step.type).filter((type): type is string => Boolean(type))
          : playwrightActionTypesForAuditTarget(block.input, actionIndex, nextActionIndex) ?? []
        // Script navigation alone proves no extraction. Only the final body
        // actually returned by the tool can attest that particular page.
        if (executedTypes.includes('script') && ledger.textExtracted && status === 'opened' && finalUrl === ledger.url) executedTypes.push('extract')
        const actionTypes = [...new Set(executedTypes)]
        const searchResultStatus = target.kind === 'search'
          ? status === 'access_limited'
            ? 'access_limited' as const
            : status === 'pending'
              ? 'pending' as const
              : status === 'failed'
                ? 'failed' as const
                : hasObservedSearchResults(target.searchEngine!, finalUrl)
                  ? 'results_observed' as const
                  : 'entry_opened' as const
          : undefined
        audit.push({
          ...target,
          auditId: scriptPage
            ? 'playwright:' + block.id + ':' + (actionIndex ?? 'script') + ':script:' + (scriptPageIndex ?? 0)
            : 'playwright:' + block.id + ':' + (actionIndex ?? 'sequence'),
          status,
          ...(searchResultStatus ? { searchResultStatus } : {}),
          ...(finalUrl ? { finalUrl } : {}),
          ...(actionTypes ? { actionTypes } : {}),
          ...(accessLimitedForTarget && ledger.accessDiagnostics?.connectionKind && ledger.accessDiagnostics.observedAt
            ? { accessDiagnostics: ledger.accessDiagnostics as PlaywrightAuditEntry['accessDiagnostics'] }
            : {}),
          ...(actionDidNotRun
            ? { detail: 'This navigation did not run because the Playwright action sequence stopped earlier.' }
            : scriptPage?.detail
              ? { detail: truncatePlaywrightAuditDetail(scriptPage.detail) }
              : errorAppliesToTarget && ledger.error
                ? { detail: truncatePlaywrightAuditDetail(ledger.error) }
                : failure?.detail
                  ? { detail: truncatePlaywrightAuditDetail(failure.detail) }
                  : transientVerificationRecovered
                    ? { detail: 'A transient verification interstitial automatically recovered to the final normal search-results page.' }
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
      ? `query ${JSON.stringify(entry.query ?? entry.target)}${entry.searchEngine ? ` [engine=${entry.searchEngine}]` : ''}${entry.searchUrl ? ` [search_url=${entry.searchUrl}]` : ''}${entry.searchResultStatus ? ` [search_result=${entry.searchResultStatus}]` : ''}${entry.auditId ? ` [audit_id=${entry.auditId}]` : ''}`
      : `${entry.target}${entry.auditId ? ` [audit_id=${entry.auditId}]` : ''}`
    const finalUrl = entry.finalUrl ? ` [final_url=${entry.finalUrl}]` : ''
    const diagnostics = entry.accessDiagnostics
      ? ` [browser=${entry.accessDiagnostics.connectionKind}${entry.accessDiagnostics.searchEngine ? `; engine=${entry.accessDiagnostics.searchEngine}` : ''}${typeof entry.accessDiagnostics.pacingWaitedMs === 'number' ? `; pacingWaitedMs=${entry.accessDiagnostics.pacingWaitedMs}` : ''}${entry.accessDiagnostics.verificationKind ? `; verification=${entry.accessDiagnostics.verificationKind}` : ''}]`
      : ''
    return `- ${entry.status}: ${target}${finalUrl}${diagnostics}${entry.detail ? ` — ${entry.detail}` : ''}`
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
    researchSourceAssignment?: ExpertResearchSourceAssignment
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
  const artifactPath = lastWrittenMarkdownArtifactPath(agentMessages)
  const parentVisibleContent = normalizeFinalizedExpertResearchArtifactContent(
    agentType,
    content,
    artifactPath,
  )

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
    ...(artifactPath ? { artifactPath } : {}),
    content: parentVisibleContent,
    totalDurationMs: Date.now() - startTime,
    totalTokens,
    totalToolUseCount,
    playwrightToolUseCount,
    playwrightAudit,
    usage: lastAssistantMessage.message.usage,
  }
}

/**
 * Records a bounded terminal outcome when an Expert researcher stops before its
 * normal final message. Pending transcript entries become "interrupted" and
 * every URL in the injected source batch receives an explicit interrupted
 * receipt when it was not reached. This is never an access-limit conclusion.
 */
export async function recordInterruptedExpertAgentResearchAudit(
  input: {
    agentId: string
    agentType?: string
    prompt?: string
    messages: MessageType[]
    artifactPath?: string
    sourceAssignment?: ExpertResearchSourceAssignment
    reason: string
    recordAudit?: typeof recordExpertSubagentResearchAudit
  },
): Promise<boolean> {
  if (input.agentType !== 'expert-evidence-researcher') return false

  const transcriptText = input.messages
    .filter((message) => message.type === 'assistant' || message.type === 'user')
    .map((message) => extractTextContent(message.message.content, '\n'))
    .concat(input.prompt ?? '')
    .join('\n')
  const assignment = [...transcriptText.matchAll(/<expert-research-source-assignment>([\s\S]*?)<\/expert-research-source-assignment>/g)].at(-1)?.[1] ?? ''
  const transcriptArtifactPath = assignment.match(/(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\.md\b/i)?.[0]
  const transcriptUrls = [...assignment.matchAll(/https?:\/\/[^\s<>"']+/g)]
    .map((match) => match[0].replace(/[.,;:!?)}]+$/g, ''))
    .filter((url, index, urls) => Boolean(url) && urls.indexOf(url) === index)
  // Prefer the runner's structured assignment. The transcript is only a
  // compatibility fallback for older callers; it may be absent when the
  // provider/tool stream fails before injected meta messages are emitted.
  const assignedArtifactPath = input.sourceAssignment?.artifactPath ?? transcriptArtifactPath
  const assignedUrls = input.sourceAssignment?.candidateUrls ?? transcriptUrls

  const reason = input.reason.trim().slice(0, 240)
  const interruptedDetail = '研究子代理在当前来源小批次完成前中断；这不代表该入口已访问、受限或失败' + (reason ? '。原因：' + reason : '。')
  const audit = buildPlaywrightAudit(input.messages).map((entry) => {
    if (entry.status !== 'pending') return entry
    return {
      ...entry,
      status: 'interrupted' as const,
      ...(entry.searchResultStatus === 'pending' ? { searchResultStatus: 'interrupted' as const } : {}),
      detail: interruptedDetail + (entry.detail ? ' ' + entry.detail : ''),
    }
  })
  const representedUrls = new Set(audit.flatMap((entry) => [entry.target, entry.finalUrl].filter((value): value is string => Boolean(value))))
  for (const [index, target] of assignedUrls.entries()) {
    if (representedUrls.has(target)) continue
    audit.push({
      auditId: 'interrupted:' + input.agentId + ':' + index,
      target,
      kind: 'url',
      status: 'interrupted',
      detail: interruptedDetail,
    })
  }
  if (audit.length === 0) return false

  const recordAudit = input.recordAudit ?? recordExpertSubagentResearchAudit
  await recordAudit({
    agentId: input.agentId,
    agentType: input.agentType,
    entries: audit,
    ...(input.artifactPath ?? assignedArtifactPath ? { artifactPath: input.artifactPath ?? assignedArtifactPath } : {}),
    content: '研究子代理在当前来源小批次完成前中断。以下记录仅用于恢复队列和浏览审计，不代表入口已打开、访问受限或访问失败。' + (reason ? '原因：' + reason : ''),
    interrupted: true,
  })
  return true
}

/**
 * Persists transcript-derived browser provenance for Expert researchers after
 * either synchronous or asynchronous Agent completion. This remains a no-op
 * for ordinary agents and never exposes another model-callable tool.
 */
export async function recordFinalizedExpertAgentResearchAudit(
  agentResult: Pick<AgentToolResult, 'agentId' | 'agentType' | 'artifactPath' | 'content' | 'playwrightAudit'>,
  fallbackAgentType: string,
  recordAudit: typeof recordExpertSubagentResearchAudit = recordExpertSubagentResearchAudit,
  loadPostReviewContext: typeof loadExpertPostReviewEvidenceAbsorptionContext = loadExpertPostReviewEvidenceAbsorptionContext,
): Promise<string | undefined> {
  const agentType = agentResult.agentType ?? fallbackAgentType
  const persistedHandoff = normalizeFinalizedExpertResearchArtifactContent(
    agentType,
    agentResult.content,
    agentResult.artifactPath,
  )
  await recordAudit({
    agentId: agentResult.agentId,
    agentType,
    ...((agentType === 'expert-evidence-researcher' || (agentType === 'general-purpose' && agentResult.artifactPath)) ? { completed: true } : {}),
    entries: agentResult.playwrightAudit ?? [],
    ...(agentResult.artifactPath ? { artifactPath: agentResult.artifactPath } : {}),
    ...(persistedHandoff.length > 0 ? { content: extractTextContent(persistedHandoff, '\n') } : {}),
  })
  return (await loadPostReviewContext(agentType))?.instruction
}

/**
 * Appends a server-authorized, ZIP-opt-in evidence absorption phase to the
 * parent-visible handoff. This has no effect for ordinary agents or Experts.
 */
export function appendExpertPostReviewEvidenceAbsorptionContext(
  agentResult: Pick<AgentToolResult, 'agentType' | 'content'>,
  instruction: string | undefined,
): void {
  if (isFileFirstExpertResearchArtifactAgent(agentResult.agentType)) return
  const normalized = instruction?.trim()
  if (!normalized || !normalized.includes('<expert-post-review-evidence-absorption>')) return
  if (agentResult.content.some((block) => block.text.includes('<expert-post-review-evidence-absorption>'))) return
  agentResult.content.push({ type: 'text', text: normalized })
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
  validateFinalMessage,
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
  validateFinalMessage?: (message: string) => string | null
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
    const finalMessage = extractTextContent(agentResult.content, '\n')
    const finalValidationError = validateFinalMessage?.(finalMessage)
    if (finalValidationError) throw new Error(finalValidationError)
    const postReviewEvidenceAbsorption = await recordFinalizedExpertAgentResearchAudit(agentResult, metadata.agentType)
    appendExpertPostReviewEvidenceAbsorptionContext(agentResult, postReviewEvidenceAbsorption)

    // Mark task completed FIRST so TaskOutput(block=true) unblocks
    // immediately, then notify the parent before any optional cleanup. The
    // parent session depends on this notification to resume its loop.
    completeAsyncAgent(agentResult, rootSetAppState)

    enqueueAgentNotification({
      taskId,
      description,
      status: 'completed',
      setAppState: rootSetAppState,
      finalMessage,
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
    try {
      await recordInterruptedExpertAgentResearchAudit({
        agentId: agentIdForCleanup,
        agentType: metadata.agentType,
        prompt: metadata.prompt,
        messages: agentMessages,
        sourceAssignment: metadata.researchSourceAssignment,
        reason: error instanceof AbortError ? 'Agent was cancelled before normal completion.' : errorMessage(error),
      })
    } catch (auditError) {
      logForDebugging(`Interrupted Expert research audit failed: ${errorMessage(auditError)}`)
    }
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
