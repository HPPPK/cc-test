import { getJiangxiaEnvValue } from '../../utils/appIdentity.js'
import { createResearcherPartPath, researchArtifactRootPath, isFileFirstExpertResearchAgentType } from '../../services/tools/expertFileFirstResearchProtocol.js'
import { feature } from 'bun:bundle'
import type { UUID } from 'crypto'
import { randomUUID } from 'crypto'
import uniqBy from 'lodash-es/uniqBy.js'
import { logForDebugging } from 'src/utils/debug.js'
import { getProjectRoot, getSessionId } from '../../bootstrap/state.js'
import { getCommand, getSkillToolCommands, hasCommand } from '../../commands.js'
import {
  DEFAULT_AGENT_PROMPT,
  enhanceSystemPromptWithEnvDetails,
} from '../../constants/prompts.js'
import type { QuerySource } from '../../constants/querySource.js'
import { getSystemContext, getUserContext } from '../../context.js'
import type { CanUseToolFn } from '../../hooks/useCanUseTool.js'
import { query } from '../../query.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js'
import { getDumpPromptsPath } from '../../services/api/dumpPrompts.js'
import { cleanupAgentTracking } from '../../services/api/promptCacheBreakDetection.js'
import {
  connectToServer,
  fetchToolsForClient,
} from '../../services/mcp/client.js'
import { getMcpConfigByName } from '../../services/mcp/config.js'
import type {
  MCPServerConnection,
  ScopedMcpServerConfig,
} from '../../services/mcp/types.js'
import { toolMatchesName, type Tool, type Tools, type ToolUseContext } from '../../Tool.js'
import { killShellTasksForAgent } from '../../tasks/LocalShellTask/killShellTasks.js'
import type { Command } from '../../types/command.js'
import type { AgentId } from '../../types/ids.js'
import type {
  AssistantMessage,
  Message,
  ProgressMessage,
  RequestStartEvent,
  StreamEvent,
  SystemCompactBoundaryMessage,
  TombstoneMessage,
  ToolUseSummaryMessage,
  UserMessage,
} from '../../types/message.js'
import { createAttachmentMessage } from '../../utils/attachments.js'
import { AbortError } from '../../utils/errors.js'
import { getDisplayPath } from '../../utils/file.js'
import {
  cloneFileStateCache,
  createFileStateCacheWithSizeLimit,
  READ_FILE_STATE_CACHE_SIZE,
} from '../../utils/fileStateCache.js'
import {
  type CacheSafeParams,
  createSubagentContext,
} from '../../utils/forkedAgent.js'
import { registerFrontmatterHooks } from '../../utils/hooks/registerFrontmatterHooks.js'
import { clearSessionHooks } from '../../utils/hooks/sessionHooks.js'
import { executeSubagentStartHooks } from '../../utils/hooks.js'
import { createUserMessage } from '../../utils/messages.js'
import {
  currentExpertTemplateOutputReviewContext,
  isCurrentExpertTemplateOutputReviewReportPath,
} from '../../services/tools/expertTemplateFillRuntime.js'
import {
  formatExpertSubagentResearchEvidenceContext,
  formatExpertSubagentSkillContext,
  loadExpertSubagentResearchEvidenceContext,
  loadExpertSubagentSkillContext,
  recordExpertSubagentResearchSourceDispatch,
  resolveExpertAssignedResearchSourceBatch,
  type ExpertResearchSourceAssignment,
  type ExpertResearchTaskKind,
} from '../../services/tools/expertSubagentSkillRuntime.js'
import {
  resolveExpertResearchArtifactPath,
  resolveRuntimeExpertResearchArtifactPolicy,
  type ExpertResearchArtifactKind,
} from '../../server/services/expertResearchArtifactPolicyService.js'
import { getAgentModel } from '../../utils/model/agent.js'
import type { ModelAlias } from '../../utils/model/aliases.js'
import {
  clearAgentTranscriptSubdir,
  recordSidechainTranscript,
  setAgentTranscriptSubdir,
  writeAgentMetadata,
} from '../../utils/sessionStorage.js'
import {
  isRestrictedToPluginOnly,
  isSourceAdminTrusted,
} from '../../utils/settings/pluginOnlyPolicy.js'
import {
  asSystemPrompt,
  type SystemPrompt,
} from '../../utils/systemPromptType.js'
import {
  isPerfettoTracingEnabled,
  registerAgent as registerPerfettoAgent,
  unregisterAgent as unregisterPerfettoAgent,
} from '../../utils/telemetry/perfettoTracing.js'
import type { ContentReplacementState } from '../../utils/toolResultStorage.js'
import { createAgentId } from '../../utils/uuid.js'
import { resolveAgentTools } from './agentToolUtils.js'
import { type AgentDefinition, isBuiltInAgent } from './loadAgentsDir.js'

/**
 * Initialize agent-specific MCP servers
 * Agents can define their own MCP servers in their frontmatter that are additive
 * to the parent's MCP clients. These servers are connected when the agent starts
 * and cleaned up when the agent finishes.
 *
 * @param agentDefinition The agent definition with optional mcpServers
 * @param parentClients MCP clients inherited from parent context
 * @returns Merged clients (parent + agent-specific), agent MCP tools, and cleanup function
 */
async function initializeAgentMcpServers(
  agentDefinition: AgentDefinition,
  parentClients: MCPServerConnection[],
): Promise<{
  clients: MCPServerConnection[]
  tools: Tools
  cleanup: () => Promise<void>
}> {
  // If no agent-specific servers defined, return parent clients as-is
  if (!agentDefinition.mcpServers?.length) {
    return {
      clients: parentClients,
      tools: [],
      cleanup: async () => {},
    }
  }

  // When MCP is locked to plugin-only, skip frontmatter MCP servers for
  // USER-CONTROLLED agents only. Plugin, built-in, and policySettings agents
  // are admin-trusted — their frontmatter MCP is part of the admin-approved
  // surface. Blocking them (as the first cut did) breaks plugin agents that
  // legitimately need MCP, contradicting "plugin-provided always loads."
  const agentIsAdminTrusted = isSourceAdminTrusted(agentDefinition.source)
  if (isRestrictedToPluginOnly('mcp') && !agentIsAdminTrusted) {
    logForDebugging(
      `[Agent: ${agentDefinition.agentType}] Skipping MCP servers: strictPluginOnlyCustomization locks MCP to plugin-only (agent source: ${agentDefinition.source})`,
    )
    return {
      clients: parentClients,
      tools: [],
      cleanup: async () => {},
    }
  }

  const agentClients: MCPServerConnection[] = []
  // Track which clients were newly created (inline definitions) vs. shared from parent
  // Only newly created clients should be cleaned up when the agent finishes
  const newlyCreatedClients: MCPServerConnection[] = []
  const agentTools: Tool[] = []

  for (const spec of agentDefinition.mcpServers) {
    let config: ScopedMcpServerConfig | null = null
    let name: string
    let isNewlyCreated = false

    if (typeof spec === 'string') {
      // Reference by name - look up in existing MCP configs
      // This uses the memoized connectToServer, so we may get a shared client
      name = spec
      config = getMcpConfigByName(spec)
      if (!config) {
        logForDebugging(
          `[Agent: ${agentDefinition.agentType}] MCP server not found: ${spec}`,
          { level: 'warn' },
        )
        continue
      }
    } else {
      // Inline definition as { [name]: config }
      // These are agent-specific servers that should be cleaned up
      const entries = Object.entries(spec)
      if (entries.length !== 1) {
        logForDebugging(
          `[Agent: ${agentDefinition.agentType}] Invalid MCP server spec: expected exactly one key`,
          { level: 'warn' },
        )
        continue
      }
      const [serverName, serverConfig] = entries[0]!
      name = serverName
      config = {
        ...serverConfig,
        scope: 'dynamic' as const,
      } as ScopedMcpServerConfig
      isNewlyCreated = true
    }

    // Connect to the server
    const client = await connectToServer(name, config)
    agentClients.push(client)
    if (isNewlyCreated) {
      newlyCreatedClients.push(client)
    }

    // Fetch tools if connected
    if (client.type === 'connected') {
      const tools = await fetchToolsForClient(client)
      agentTools.push(...tools)
      logForDebugging(
        `[Agent: ${agentDefinition.agentType}] Connected to MCP server '${name}' with ${tools.length} tools`,
      )
    } else {
      logForDebugging(
        `[Agent: ${agentDefinition.agentType}] Failed to connect to MCP server '${name}': ${client.type}`,
        { level: 'warn' },
      )
    }
  }

  // Create cleanup function for agent-specific servers
  // Only clean up newly created clients (inline definitions), not shared/referenced ones
  // Shared clients (referenced by string name) are memoized and used by the parent context
  const cleanup = async () => {
    for (const client of newlyCreatedClients) {
      if (client.type === 'connected') {
        try {
          await client.cleanup()
        } catch (error) {
          logForDebugging(
            `[Agent: ${agentDefinition.agentType}] Error cleaning up MCP server '${client.name}': ${error}`,
            { level: 'warn' },
          )
        }
      }
    }
  }

  // Return merged clients (parent + agent-specific) and agent tools
  return {
    clients: [...parentClients, ...agentClients],
    tools: agentTools,
    cleanup,
  }
}

type QueryMessage =
  | StreamEvent
  | RequestStartEvent
  | Message
  | ToolUseSummaryMessage
  | TombstoneMessage

/**
 * Type guard to check if a message from query() is a recordable Message type.
 * Matches the types we want to record: assistant, user, progress, or system compact_boundary.
 */
function isRecordableMessage(
  msg: QueryMessage,
): msg is
  | AssistantMessage
  | UserMessage
  | ProgressMessage
  | SystemCompactBoundaryMessage {
  return (
    msg.type === 'assistant' ||
    msg.type === 'user' ||
    msg.type === 'progress' ||
    (msg.type === 'system' &&
      'subtype' in msg &&
      msg.subtype === 'compact_boundary')
  )
}

type FileFirstResearchArtifactPaths = {
  briefPath: string
  researcherPaths: string[]
  researcherParts?: boolean
  reviewerPath: string
  auditPath: string
  absorptionPath?: string
  completionReviewPath?: string
}

export function formatFileFirstOutputReviewContext(input: {
  briefPath: string
  absorptionPath: string
  reportPath: string
  targetPath: string
}): string {
  return [
    '<expert-rendered-output-review>',
    'Review the current rendered report for omitted or flattened decision-relevant details and source-supported corrections, including wrong source attribution or meaning-changing errors. Do not browse, do not ask the user, do not write HTML, and do not discover other files.',
    'Read only these exact inputs:',
    '- ' + input.briefPath,
    '- ' + input.absorptionPath,
    '- ' + input.reportPath,
    'Write only this Markdown review: ' + input.targetPath,
    'You may also Read that exact output Markdown for save verification; it is not an additional research source.',
    'After Write and the required Read-back verification, return exactly one short file receipt: `已写入：' + input.targetPath + '；状态：已 Read 验证。`',
    'If the file was not verified saved, return exactly one short factual receipt: `未写入：' + input.targetPath + '；状态：<brief factual reason>`.',
    'Do not repeat findings, evidence, URLs, review prose, limitations, error history, or next steps outside that Markdown. The parent must Read this declared Markdown itself; the receipt is not a completion gate.',
    '</expert-rendered-output-review>',
  ].join('\n')
}

function exactResearchArtifactPath(input: unknown): string | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined
  const value = (input as Record<string, unknown>).file_path
  return typeof value === 'string' && value.trim() === value && value.endsWith('.md') && !/[\r\n]/.test(value)
    ? value
    : undefined
}

function researchArtifactPolicyValue(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = env.CC_JIANGXIA_EXPERT_RESEARCH_ARTIFACT_POLICY ?? env.CC_HAHA_EXPERT_RESEARCH_ARTIFACT_POLICY
  return typeof value === 'string' && value.trim() ? value : undefined
}

function researchArtifactOutputRoot(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT ?? env.CC_HAHA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function safeRelativeResearchArtifactPath(value: string): string | undefined {
  const normalized = value.replace(/\\/g, '/')
  return normalized.startsWith('/') || /^[a-zA-Z]:\//.test(normalized) || normalized.split('/').some((part) => !part || part === '.' || part === '..')
    ? undefined
    : normalized
}

/**
 * Tool inputs may use either the declared relative artifact path or the same
 * file's absolute path under this Expert session work directory. The contract
 * itself remains relative-only; this turns both spellings into that declaration.
 */
function canonicalResearchArtifactPath(
  input: unknown,
  allowedKinds: ExpertResearchArtifactKind[],
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const artifactPath = exactResearchArtifactPath(input)
  if (!artifactPath) return undefined
  const serializedPolicy = researchArtifactPolicyValue(env)
  const outputRoot = researchArtifactOutputRoot(env)
  if (!serializedPolicy || !outputRoot) {
    // Compatibility for a non-file-first test/old context: retain only a safe
    // relative spelling. An absolute path requires the session root above.
    return safeRelativeResearchArtifactPath(artifactPath)
  }
  try {
    const policy = resolveRuntimeExpertResearchArtifactPolicy(serializedPolicy)
    if (!policy) return undefined
    return resolveExpertResearchArtifactPath({
      workDir: outputRoot,
      policy,
      artifactPath,
      allowedKinds,
    }).relativePath
  } catch {
    return undefined
  }
}

/** One Read boundary for report workers; the same predicate is used by the runner and regressions. */
export function reportWorkerReadError(input: unknown, context: {
  agentType: string
  artifactPaths: FileFirstResearchArtifactPaths
  reportPath?: string
}): string | undefined {
  const { agentType, artifactPaths } = context
  if (agentType === 'expert-evidence-output-reviewer') {
    const allowed = new Set([artifactPaths.briefPath, ...(artifactPaths.absorptionPath ? [artifactPaths.absorptionPath] : []), ...(artifactPaths.completionReviewPath ? [artifactPaths.completionReviewPath] : [])])
    const requested = canonicalResearchArtifactPath(input, ['research-brief', 'field-absorption', 'final-output-review'])
    const rawPath = input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>).file_path : undefined
    if ((!requested || !allowed.has(requested)) && !isCurrentExpertTemplateOutputReviewReportPath(rawPath, context.reportPath)) {
      return 'This Expert output-review worker may Read only the declared brief, the declared report-field absorption Markdown, the exact HTML draft rendered in this same session, and its own declared completeness Markdown for save verification. It may not scan the workDir or read researcher ledgers, browser audits, or other files.'
    }
  }
  if (agentType === 'expert-evidence-absorber') {
    const allowed = new Set([artifactPaths.briefPath, ...artifactPaths.researcherPaths, artifactPaths.reviewerPath, artifactPaths.auditPath, ...(artifactPaths.absorptionPath ? [artifactPaths.absorptionPath] : [])])
    const requested = canonicalResearchArtifactPath(input, ['research-brief', 'researcher-report', 'evidence-review', 'browser-audit', 'field-absorption'])
    if (!requested || !allowed.has(requested)) {
      return 'This Expert evidence absorption worker may Read only the declared brief, researcher reports, evidence review, browser audit, and its own declared absorption Markdown for save verification. It may not scan the workDir or read another file.'
    }
  }
  return undefined
}

function isExactResearchArtifactWrite(
  input: unknown,
  expectedPath: string,
  expectedKind: ExpertResearchArtifactKind,
): boolean {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false
  const record = input as Record<string, unknown>
  return canonicalResearchArtifactPath(input, [expectedKind]) === expectedPath
    && typeof record.content === 'string'
    && record.content.trim().length > 0
}

/**
 * Researcher Markdown is a durable, incremental evidence ledger. The runner
 * enforces ownership and a real non-empty checkpoint only; route coverage,
 * source diversity, and browser limitations are reviewed after saving from the
 * server-generated audit instead of blocking a child from recording evidence.
 */
export function researcherArtifactWriteError(
  input: unknown,
  expectedPath: string | undefined,
): string | undefined {
  if (expectedPath && isExactResearchArtifactWrite(input, expectedPath, 'researcher-report')) return undefined
  return 'This Expert evidence researcher must Write only its one task-assigned Markdown path with non-empty content. Save incremental evidence checkpoints to that path; do not write any other file.'
}

/** Incremental updates use the same exact destination as Write; tool availability
 * must not send a worker into shell or nested-agent detours to save its ledger. */
export function researcherArtifactEditError(input: unknown, expectedPath: string | undefined): string | undefined {
  const edit = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : undefined
  if (expectedPath && canonicalResearchArtifactPath(input, ['researcher-report']) === expectedPath
    && typeof edit?.old_string === 'string' && typeof edit.new_string === 'string' && edit.new_string.trim()) return undefined
  return 'This Expert evidence researcher may Edit only its assigned Markdown with a non-empty replacement. Read it first, preserve earlier evidence, and Read back the saved checkpoint.'
}

/**
 * Finds the single researcher ledger named by the parent task. Parent prompts
 * may carry Windows absolute paths, while the ZIP policy is deliberately
 * relative with forward slashes. JSON serialization also escapes every `\`,
 * so collapse either spelling before comparing instead of treating a valid
 * Windows target as an unassigned file.
 */
function researchArtifactMatchesInSerializedPrompt(serializedPrompt: string, candidates: string[]): string[] {
  const normalized = serializedPrompt.replace(/\.parts\/[A-Za-z0-9_-]+\.md/g, '.md')
  return candidates.filter((candidate) => normalized.includes(candidate.replace(/\\+/g, '/')))
}

/**
 * The fork prefix deliberately contains every sibling Agent tool call for prompt
 * cache reuse. The final fork-worker directive is the only per-child message,
 * so resolve its assigned ledger before looking at the shared prefix.
 */
export function assignedResearchArtifactPath(
  promptMessages: Message[],
  candidates: string[],
): string | undefined {
  for (const message of [...promptMessages].reverse()) {
    const serializedMessage = JSON.stringify(message).replace(/\\+/g, '/')
    if (!serializedMessage.includes('<forked-worker>')) continue
    const matches = researchArtifactMatchesInSerializedPrompt(serializedMessage, candidates)
    if (matches.length === 1) return matches[0]
  }

  for (const message of [...promptMessages].reverse()) {
    const matches = researchArtifactMatchesInSerializedPrompt(JSON.stringify(message).replace(/\\+/g, '/'), candidates)
    if (matches.length === 1) return matches[0]
  }
  return undefined
}

export function assignedResearchArtifactPathFromTask(
  declaredResearchArtifactPath: string | undefined,
  taskPrompt: string | undefined,
  candidates: string[],
): string | undefined {
  const declaredMatches = declaredResearchArtifactPath
    ? researchArtifactMatchesInSerializedPrompt(declaredResearchArtifactPath.replace(/\\+/g, '/'), candidates)
    : []
  if (declaredResearchArtifactPath && declaredMatches.length !== 1) return undefined

  const taskMatches = taskPrompt
    ? researchArtifactMatchesInSerializedPrompt(taskPrompt.replace(/\\+/g, '/'), candidates)
    : []
  if (taskPrompt && taskMatches.length > 1) return undefined

  const declared = declaredMatches[0]
  const task = taskMatches[0]
  if (declared && task && declared !== task) return undefined
  return declared ?? task
}

export function buildExpertSubagentPackagePrompt(input: {
  agentId?: string
  agentType: string
  promptMessages: Message[]
  /** Explicit target supplied by the current Agent tool call, never sibling history. */
  declaredResearchArtifactPath?: string
  researchTaskKind?: ExpertResearchTaskKind
  /** Compatibility fallback scoped to the current Agent tool call only. */
  taskPrompt?: string
  expertSkillContext: Awaited<ReturnType<typeof loadExpertSubagentSkillContext>>
}): {
  researchArtifactPaths?: FileFirstResearchArtifactPaths
  researcherTargetPath?: string
  prompt?: string
} {
  const isTargeted = input.agentType === 'expert-evidence-researcher' && input.researchTaskKind === 'targeted-evidence'
  const explicitCommercializationResearcher = input.agentType === 'expert-evidence-researcher'
    && [input.declaredResearchArtifactPath, input.taskPrompt].some((value) => (
      typeof value === 'string'
      && /(?:^|[\/\s"'(])commercialization-research[\/]0[234]-[^\/\s"'),;:]+\.md(?:$|[\s"'),;:])/i.test(value.replace(/\\/g, '/'))
    ))
  if (explicitCommercializationResearcher && (
    input.expertSkillContext?.expertId !== 'commercialization-research-report'
    || !input.expertSkillContext.artifactPaths
    || (!isTargeted && !(input.expertSkillContext.researchSourcePlan?.batches.length))
  )) {
    throw new Error('EXPERT_RESEARCH_SOURCE_CONTEXT_REQUIRED: The commercialization research task context was not loaded after the bounded retry. Keep its assigned 02/03/04 Markdown; source-batch tasks also require their server source package.')
  }
  const researchArtifactPaths = input.expertSkillContext?.artifactPaths as FileFirstResearchArtifactPaths | undefined
  const assignedLanePath = input.agentType === 'expert-evidence-researcher' && researchArtifactPaths
    ? assignedResearchArtifactPathFromTask(
        input.declaredResearchArtifactPath,
        input.taskPrompt,
        researchArtifactPaths.researcherPaths,
      ) ?? (input.declaredResearchArtifactPath === undefined && input.taskPrompt === undefined
        ? assignedResearchArtifactPath(input.promptMessages, researchArtifactPaths.researcherPaths)
        : undefined)
    : undefined
  const researcherTargetPath = assignedLanePath && researchArtifactPaths?.researcherParts && input.agentId
    ? createResearcherPartPath(assignedLanePath, input.agentId) : assignedLanePath
  const hasSourcePlan = !isTargeted && input.agentType === 'expert-evidence-researcher'
    && (input.expertSkillContext?.researchSourcePlan?.batches.length ?? 0) > 0
  if ((hasSourcePlan || isTargeted) && !researcherTargetPath) {
    throw new Error('EXPERT_RESEARCH_SOURCE_ASSIGNMENT_REQUIRED: The current research task did not declare exactly one matching 02/03/04 Markdown path. Use the same unique artifact path for source-batch and targeted-evidence tasks.')
  }
  if (hasSourcePlan && researcherTargetPath && !resolveExpertAssignedResearchSourceBatch(input.expertSkillContext, researcherTargetPath)) {
    throw new Error('EXPERT_RESEARCH_SOURCE_ASSIGNMENT_REQUIRED: The declared researcher path has no matching A/B/C source package. Refuse to start rather than running with an empty assignment.')
  }
  return {
    ...(researchArtifactPaths ? { researchArtifactPaths } : {}),
    ...(researcherTargetPath ? { researcherTargetPath } : {}),
    ...(input.expertSkillContext ? { prompt: formatExpertSubagentSkillContext({ ...input.expertSkillContext, ...(isTargeted ? { researchTaskKind: 'targeted-evidence' as const } : {}) }, { researcherTargetPath }) } : {}),
  }
}

export async function* runAgent({
  agentDefinition,
  promptMessages,
  declaredResearchArtifactPath,
  researchTaskKind,
  taskPrompt,
  toolUseContext,
  canUseTool,
  isAsync,
  canShowPermissionPrompts,
  forkContextMessages,
  querySource,
  override,
  model,
  maxTurns,
  preserveToolUseResults,
  availableTools,
  allowedTools,
  onCacheSafeParams,
  onExpertResearchAssignment,
  contentReplacementState,
  useExactTools,
  worktreePath,
  description,
  transcriptSubdir,
  onQueryProgress,
}: {
  agentDefinition: AgentDefinition
  promptMessages: Message[]
  /** Structured per-call A/B/C target from AgentTool; never inferred from fork siblings. */
  declaredResearchArtifactPath?: string
  researchTaskKind?: ExpertResearchTaskKind
  /** Current Agent task text, used only as a backward-compatible single-path fallback. */
  taskPrompt?: string
  /** Receives the resolved source batch before the child model starts. */
  onExpertResearchAssignment?: (assignment: ExpertResearchSourceAssignment | undefined) => void
  toolUseContext: ToolUseContext
  canUseTool: CanUseToolFn
  isAsync: boolean
  /** Whether this agent can show permission prompts. Defaults to !isAsync.
   * Set to true for in-process teammates that run async but share the terminal. */
  canShowPermissionPrompts?: boolean
  forkContextMessages?: Message[]
  querySource: QuerySource
  override?: {
    userContext?: { [k: string]: string }
    systemContext?: { [k: string]: string }
    systemPrompt?: SystemPrompt
    abortController?: AbortController
    agentId?: AgentId
  }
  model?: ModelAlias
  maxTurns?: number
  /** Preserve toolUseResult on messages for subagents with viewable transcripts */
  preserveToolUseResults?: boolean
  /** Precomputed tool pool for the worker agent. Computed by the caller
   * (AgentTool.tsx) to avoid a circular dependency between runAgent and tools.ts.
   * Always contains the full tool pool assembled with the worker's own permission
   * mode, independent of the parent's tool restrictions. */
  availableTools: Tools
  /** Tool permission rules to add to the agent's session allow rules.
   * When provided, replaces ALL allow rules so the agent only has what's
   * explicitly listed (parent approvals don't leak through). */
  allowedTools?: string[]
  /** Optional callback invoked with CacheSafeParams after constructing the agent's
   * system prompt, context, and tools. Used by background summarization to fork
   * the agent's conversation for periodic progress summaries. */
  onCacheSafeParams?: (params: CacheSafeParams) => void
  /** Replacement state reconstructed from a resumed sidechain transcript so
   * the same tool results are re-replaced (prompt cache stability). When
   * omitted, createSubagentContext clones the parent's state. */
  contentReplacementState?: ContentReplacementState
  /** When true, use availableTools directly without filtering through
   * resolveAgentTools(). Also inherits the parent's thinkingConfig and
   * isNonInteractiveSession instead of overriding them. Used by the fork
   * subagent path to produce byte-identical API request prefixes for
   * prompt cache hits. */
  useExactTools?: boolean
  /** Worktree path if the agent was spawned with isolation: "worktree".
   * Persisted to metadata so resume can restore the correct cwd. */
  worktreePath?: string
  /** Original task description from AgentTool input. Persisted to metadata
   * so a resumed agent's notification can show the original description. */
  description?: string
  /** Optional subdirectory under subagents/ to group this agent's transcript
   * with related ones (e.g. workflows/<runId> for workflow subagents). */
  transcriptSubdir?: string
  /** Optional callback fired on every message yielded by query() — including
   * stream_event deltas that runAgent otherwise drops. Use to detect liveness
   * during long single-block streams (e.g. thinking) where no assistant
   * message is yielded for >60s. */
  onQueryProgress?: () => void
}): AsyncGenerator<Message, void> {
  // Track subagent usage for feature discovery

  const appState = toolUseContext.getAppState()
  const permissionMode = appState.toolPermissionContext.mode
  // Always-shared channel to the root AppState store. toolUseContext.setAppState
  // is a no-op when the *parent* is itself an async agent (nested async→async),
  // so session-scoped writes (hooks, bash tasks) must go through this instead.
  const rootSetAppState =
    toolUseContext.setAppStateForTasks ?? toolUseContext.setAppState

  const resolvedAgentModel = getAgentModel(
    agentDefinition.model,
    toolUseContext.options.mainLoopModel,
    model,
    permissionMode,
  )

  const agentId = override?.agentId ? override.agentId : createAgentId()

  // Route this agent's transcript into a grouping subdirectory if requested
  // (e.g. workflow subagents write to subagents/workflows/<runId>/).
  if (transcriptSubdir) {
    setAgentTranscriptSubdir(agentId, transcriptSubdir)
  }

  // Register agent in Perfetto trace for hierarchy visualization
  if (isPerfettoTracingEnabled()) {
    const parentId = toolUseContext.agentId ?? getSessionId()
    registerPerfettoAgent(agentId, agentDefinition.agentType, parentId)
  }

  // Log API calls path for subagents (ant-only)
  if (process.env.USER_TYPE === 'ant') {
    logForDebugging(
      `[Subagent ${agentDefinition.agentType}] API calls: ${getDisplayPath(getDumpPromptsPath(agentId))}`,
    )
  }

  // Handle message forking for context sharing
  // Filter out incomplete tool calls from parent messages to avoid API errors
  const contextMessages: Message[] = forkContextMessages
    ? filterIncompleteToolCalls(forkContextMessages)
    : []
  const initialMessages: Message[] = [...contextMessages, ...promptMessages]

  const agentReadFileState =
    forkContextMessages !== undefined
      ? cloneFileStateCache(toolUseContext.readFileState)
      : createFileStateCacheWithSizeLimit(READ_FILE_STATE_CACHE_SIZE)

  const [baseUserContext, baseSystemContext] = await Promise.all([
    override?.userContext ?? getUserContext(),
    override?.systemContext ?? getSystemContext(),
  ])

  // Read-only agents (Explore, Plan) don't act on commit/PR/lint rules from
  // CLAUDE.md — the main agent has full context and interprets their output.
  // Dropping claudeMd here saves ~5-15 Gtok/week across 34M+ Explore spawns.
  // Explicit override.userContext from callers is preserved untouched.
  // Kill-switch defaults true; flip tengu_slim_subagent_claudemd=false to revert.
  const shouldOmitClaudeMd =
    agentDefinition.omitClaudeMd &&
    !override?.userContext &&
    getFeatureValue_CACHED_MAY_BE_STALE('tengu_slim_subagent_claudemd', true)
  const { claudeMd: _omittedClaudeMd, ...userContextNoClaudeMd } =
    baseUserContext
  const resolvedUserContext = shouldOmitClaudeMd
    ? userContextNoClaudeMd
    : baseUserContext

  // Explore/Plan are read-only search agents — the parent-session-start
  // gitStatus (up to 40KB, explicitly labeled stale) is dead weight. If they
  // need git info they run `git status` themselves and get fresh data.
  // Saves ~1-3 Gtok/week fleet-wide.
  const { gitStatus: _omittedGitStatus, ...systemContextNoGit } =
    baseSystemContext
  const resolvedSystemContext =
    agentDefinition.agentType === 'Explore' ||
    agentDefinition.agentType === 'Plan'
      ? systemContextNoGit
      : baseSystemContext

  // Enabled only after the package context below has actually loaded. This
  // changes permission transport, not authorization or path/tool restrictions.
  let desktopExpertPermissionRelay = false

  // Override permission mode if agent defines one
  // However, don't override if parent is in bypassPermissions or acceptEdits mode - those should always take precedence
  // For async agents, also set shouldAvoidPermissionPrompts since they can't show UI
  const agentPermissionMode = agentDefinition.permissionMode
  const agentGetAppState = () => {
    const state = toolUseContext.getAppState()
    let toolPermissionContext = state.toolPermissionContext

    // Override permission mode if agent defines one (unless parent is bypassPermissions, acceptEdits, or auto)
    if (
      agentPermissionMode &&
      state.toolPermissionContext.mode !== 'bypassPermissions' &&
      state.toolPermissionContext.mode !== 'acceptEdits' &&
      !(
        feature('TRANSCRIPT_CLASSIFIER') &&
        state.toolPermissionContext.mode === 'auto'
      )
    ) {
      toolPermissionContext = {
        ...toolPermissionContext,
        mode: agentPermissionMode,
      }
    }

    const promptPolicy = resolveAgentPermissionPromptPolicy({
      isAsync,
      canShowPermissionPrompts,
      agentPermissionMode,
      desktopExpertBound: desktopExpertPermissionRelay,
    })
    if (promptPolicy.shouldAvoidPermissionPrompts || desktopExpertPermissionRelay) {
      toolPermissionContext = {
        ...toolPermissionContext,
        shouldAvoidPermissionPrompts: promptPolicy.shouldAvoidPermissionPrompts,
      }
    }
    if (promptPolicy.awaitAutomatedChecksBeforePrompt) {
      toolPermissionContext = {
        ...toolPermissionContext,
        awaitAutomatedChecksBeforeDialog: true,
      }
    }

    // Scope tool permissions: when allowedTools is provided, use them as session rules.
    // IMPORTANT: Preserve cliArg rules (from SDK's --allowedTools) since those are
    // explicit permissions from the SDK consumer that should apply to all agents.
    // Only clear session-level rules from the parent to prevent unintended leakage.
    if (allowedTools !== undefined) {
      toolPermissionContext = {
        ...toolPermissionContext,
        alwaysAllowRules: {
          // Preserve SDK-level permissions from --allowedTools
          cliArg: state.toolPermissionContext.alwaysAllowRules.cliArg,
          // Use the provided allowedTools as session-level permissions
          session: [...allowedTools],
        },
      }
    }

    // Override effort level if agent defines one
    const effortValue =
      agentDefinition.effort !== undefined
        ? agentDefinition.effort
        : state.effortValue

    if (
      toolPermissionContext === state.toolPermissionContext &&
      effortValue === state.effortValue
    ) {
      return state
    }
    return {
      ...state,
      toolPermissionContext,
      effortValue,
    }
  }

  const resolvedTools = useExactTools
    ? availableTools
    : resolveAgentTools(agentDefinition, availableTools, isAsync).resolvedTools

  const additionalWorkingDirectories = Array.from(
    appState.toolPermissionContext.additionalWorkingDirectories.keys(),
  )

  const agentSystemPrompt = override?.systemPrompt
    ? override.systemPrompt
    : asSystemPrompt(
        await getAgentSystemPrompt(
          agentDefinition,
          toolUseContext,
          resolvedAgentModel,
          additionalWorkingDirectories,
          resolvedTools,
        ),
      )

  // Determine abortController:
  // - Override takes precedence
  // - Async agents get a new unlinked controller (runs independently)
  // - Sync agents share parent's controller
  const agentAbortController = override?.abortController
    ? override.abortController
    : isAsync
      ? new AbortController()
      : toolUseContext.abortController

  // Execute SubagentStart hooks and collect additional context
  const additionalContexts: string[] = []
  for await (const hookResult of executeSubagentStartHooks(
    agentId,
    agentDefinition.agentType,
    agentAbortController.signal,
  )) {
    if (
      hookResult.additionalContexts &&
      hookResult.additionalContexts.length > 0
    ) {
      additionalContexts.push(...hookResult.additionalContexts)
    }
  }

  // Add SubagentStart hook context as a user message (consistent with SessionStart/UserPromptSubmit)
  if (additionalContexts.length > 0) {
    const contextMessage = createAttachmentMessage({
      type: 'hook_additional_context',
      content: additionalContexts,
      hookName: 'SubagentStart',
      toolUseID: randomUUID(),
      hookEvent: 'SubagentStart',
    })
    initialMessages.push(contextMessage)
  }

  // Expert ZIP Skills are already available to the parent through the managed
  // runtime prompt. Delegated agents do not inherit that prompt, so fetch only
  // the package-declared Skill bindings for this specific Expert agent type.
  const [expertSkillContext, expertResearchEvidenceContext] = await Promise.all([
    loadExpertSubagentSkillContext(agentDefinition.agentType, undefined, { researchTaskKind }),
    loadExpertSubagentResearchEvidenceContext(agentDefinition.agentType),
  ])
  // File-first research artifacts are intentionally scoped to one child task.
  // The parent task states exactly one target path. The runner enforces that the
  // researcher cannot overwrite a sibling's ledger or use Write for final HTML.
  const expertPackagePrompt = buildExpertSubagentPackagePrompt({
    agentId,
    agentType: agentDefinition.agentType,
    promptMessages,
    declaredResearchArtifactPath,
    researchTaskKind,
    taskPrompt,
    expertSkillContext,
  })
  desktopExpertPermissionRelay = Boolean(
    expertSkillContext?.artifactPaths
    && isFileFirstExpertResearchAgentType(agentDefinition.agentType)
    && getJiangxiaEnvValue('EXPERT_SESSION_ID')
    && getJiangxiaEnvValue('DESKTOP_SERVER_URL'),
  )
  const researchArtifactPaths = expertPackagePrompt.researchArtifactPaths
  const researcherTargetPath = expertPackagePrompt.researcherTargetPath
  const expertSubagentSkills = expertPackagePrompt.prompt
  if (expertSubagentSkills) {
    initialMessages.push(createUserMessage({
      content: [{ type: 'text', text: expertSubagentSkills }],
      isMeta: true,
    }))
  }
  // The source assignment is now in the child context. Persist only a compact
  // receipt for diagnostics; a failed receipt transport never blocks research.
  const sourceBatch = researchTaskKind === 'targeted-evidence'
    ? undefined
    : resolveExpertAssignedResearchSourceBatch(expertSkillContext, researcherTargetPath)
  onExpertResearchAssignment?.(
    sourceBatch && researcherTargetPath
      ? {
          artifactPath: researcherTargetPath,
          candidateUrls: sourceBatch.entries.map((entry) => entry.candidateUrl),
        }
      : undefined,
  )
  if (
    agentDefinition.agentType === 'expert-evidence-researcher'
    && researcherTargetPath
    && sourceBatch?.batchFingerprint
  ) {
    await recordExpertSubagentResearchSourceDispatch({
      agentId,
      agentType: agentDefinition.agentType,
      artifactPath: researchArtifactRootPath(researcherTargetPath),
      batchFingerprint: sourceBatch.batchFingerprint,
      coreEntryCount: sourceBatch.entries.filter((entry) => entry.tier === 'core').length,
      openEntryCount: sourceBatch.entries.filter((entry) => entry.tier === 'open').length,
    })
  }
  const expertResearchEvidence = formatExpertSubagentResearchEvidenceContext(expertResearchEvidenceContext)
  if (expertResearchEvidence) {
    initialMessages.push(createUserMessage({
      content: [{ type: 'text', text: expertResearchEvidence }],
      isMeta: true,
    }))
  }
  const reviewerArtifactPaths = (expertResearchEvidenceContext?.artifactPaths ?? researchArtifactPaths) as FileFirstResearchArtifactPaths | undefined
  const absorptionTargetPath = agentDefinition.agentType === 'expert-evidence-absorber'
    ? researchArtifactPaths?.absorptionPath
    : undefined
  const outputReviewTargetPath = agentDefinition.agentType === 'expert-evidence-output-reviewer'
    ? researchArtifactPaths?.completionReviewPath
    : undefined
  const outputReviewContext = agentDefinition.agentType === 'expert-evidence-output-reviewer'
    ? currentExpertTemplateOutputReviewContext() ?? expertSkillContext?.outputReview
    : undefined
  if (agentDefinition.agentType === 'expert-evidence-output-reviewer') {
    if (!outputReviewTargetPath || !outputReviewContext) {
      throw new Error('EXPERT_TEMPLATE_OUTPUT_REVIEW_DRAFT_REQUIRED: The output reviewer may run only after the same Expert session has successfully rendered its initial HTML draft.')
    }
    initialMessages.push(createUserMessage({
      content: [{
        type: 'text',
        text: formatFileFirstOutputReviewContext({
          briefPath: outputReviewContext.briefPath,
          absorptionPath: outputReviewContext.absorptionPath,
          reportPath: outputReviewContext.reportPath,
          targetPath: outputReviewTargetPath,
        }),
      }],
      isMeta: true,
    }))
  }

  const canUseAgentTool: CanUseToolFn = async (tool, input, context, assistantMessage, toolUseID, forceDecision) => {
    if (agentDefinition.agentType === 'expert-evidence-researcher' && researchArtifactPaths) {
      if (toolMatchesName(tool, 'Read')) {
        const requestedPath = canonicalResearchArtifactPath(input, ['research-brief', 'researcher-report', 'evidence-review', 'browser-audit'])
        if (!requestedPath || (requestedPath !== researchArtifactPaths.briefPath && requestedPath !== researcherTargetPath)) {
          return {
            behavior: 'deny' as const,
            message: 'This Expert evidence researcher may Read only the session brief and its own assigned Markdown report. It may not inspect sibling reports, the review, the browser audit, or other workDir files.',
          }
        }
      }
      if (toolMatchesName(tool, 'Edit')) {
        const editError = researcherArtifactEditError(input, researcherTargetPath)
        if (editError) return { behavior: 'deny' as const, message: editError, decisionReason: { type: 'asyncAgent' as const, reason: editError } }
      }
      if (toolMatchesName(tool, 'Write')) {
        const writeError = researcherArtifactWriteError(input, researcherTargetPath)
        if (writeError) {
          return {
            behavior: 'deny' as const,
            message: writeError,
          }
        }
      }
    }

    if (agentDefinition.agentType === 'expert-evidence-output-reviewer' && researchArtifactPaths) {
      if (toolMatchesName(tool, 'Read')) {
        const error = reportWorkerReadError(input, { agentType: agentDefinition.agentType, artifactPaths: researchArtifactPaths, reportPath: outputReviewContext?.reportPath })
        if (error) return { behavior: 'deny' as const, message: error }
      }
      if (toolMatchesName(tool, 'Write')) {
        if (!outputReviewTargetPath || !isExactResearchArtifactWrite(input, outputReviewTargetPath, 'final-output-review')) {
          return {
            behavior: 'deny' as const,
            message: 'This Expert output-review worker must Write only the declared report-completeness Markdown with non-empty content. Do not write HTML or any other workspace file.',
          }
        }
      }
    }

    if (agentDefinition.agentType === 'expert-evidence-absorber' && researchArtifactPaths) {
      if (toolMatchesName(tool, 'Read')) {
        const error = reportWorkerReadError(input, { agentType: agentDefinition.agentType, artifactPaths: researchArtifactPaths })
        if (error) return { behavior: 'deny' as const, message: error }
      }
      if (toolMatchesName(tool, 'Write')) {
        if (!absorptionTargetPath || !isExactResearchArtifactWrite(input, absorptionTargetPath, 'field-absorption')) {
          return {
            behavior: 'deny' as const,
            message: 'This Expert evidence absorption worker must Write only the declared report-field absorption Markdown with non-empty content. Do not write a report HTML file or any other workspace path.',
          }
        }
      }
    }

    if (expertResearchEvidenceContext?.reviewerEvidenceOnly) {
      if (toolMatchesName(tool, 'Playwright')) {
        return {
          behavior: 'deny' as const,
          message: 'This Expert evidence reviewer must not call Playwright. Review only the declared upstream research artifacts.',
        }
      }
      if (toolMatchesName(tool, 'Read')) {
        const requestedPath = canonicalResearchArtifactPath(input, ['research-brief', 'researcher-report', 'evidence-review', 'browser-audit'])
        const declaredArtifactPaths = reviewerArtifactPaths && new Set([
          reviewerArtifactPaths.briefPath,
          ...reviewerArtifactPaths.researcherPaths,
          reviewerArtifactPaths.reviewerPath,
          reviewerArtifactPaths.auditPath,
        ])
        if (!requestedPath || !declaredArtifactPaths?.has(requestedPath)) {
          return {
            behavior: 'deny' as const,
            message: 'This Expert evidence reviewer may Read only the exact Markdown artifacts declared for this review. Do not scan the workDir or read tool-result files.',
          }
        }
      }
      if (toolMatchesName(tool, 'Write')) {
        if (!reviewerArtifactPaths || !isExactResearchArtifactWrite(input, reviewerArtifactPaths.reviewerPath, 'evidence-review')) {
          return {
            behavior: 'deny' as const,
            message: 'This Expert evidence reviewer must Write only the declared evidence-review Markdown with non-empty content. Do not write any other file.',
          }
        }
      }
    }

    const decision = await canUseTool(tool, input, context, assistantMessage, toolUseID, forceDecision)
    if (decision.behavior === 'allow' && researchArtifactPaths && toolMatchesName(tool, 'Read')
      && canonicalResearchArtifactPath(input, ['research-brief', 'researcher-report', 'evidence-review', 'browser-audit', 'field-absorption', 'final-output-review'])) {
      return { ...decision, updatedInput: pageExpertResearchRead(decision.updatedInput ?? input) }
    }
    return decision
  }

  // Register agent's frontmatter hooks (scoped to agent lifecycle)
  // Pass isAgent=true to convert Stop hooks to SubagentStop (since subagents trigger SubagentStop)
  // Same admin-trusted gate for frontmatter hooks: under ["hooks"] alone
  // (skills/agents not locked), user agents still load — block their
  // frontmatter-hook REGISTRATION here where source is known, rather than
  // blanket-blocking all session hooks at execution time (which would
  // also kill plugin agents' hooks).
  const hooksAllowedForThisAgent =
    !isRestrictedToPluginOnly('hooks') ||
    isSourceAdminTrusted(agentDefinition.source)
  if (agentDefinition.hooks && hooksAllowedForThisAgent) {
    registerFrontmatterHooks(
      rootSetAppState,
      agentId,
      agentDefinition.hooks,
      `agent '${agentDefinition.agentType}'`,
      true, // isAgent - converts Stop to SubagentStop
    )
  }

  // Preload skills from agent frontmatter
  const skillsToPreload = agentDefinition.skills ?? []
  if (skillsToPreload.length > 0) {
    const allSkills = await getSkillToolCommands(getProjectRoot())

    // Filter valid skills and warn about missing ones
    const validSkills: Array<{
      skillName: string
      skill: (typeof allSkills)[0] & { type: 'prompt' }
    }> = []

    for (const skillName of skillsToPreload) {
      // Resolve the skill name, trying multiple strategies:
      // 1. Exact match (hasCommand checks name, userFacingName, aliases)
      // 2. Fully-qualified with agent's plugin prefix (e.g., "my-skill" → "plugin:my-skill")
      // 3. Suffix match on ":skillName" for plugin-namespaced skills
      const resolvedName = resolveSkillName(
        skillName,
        allSkills,
        agentDefinition,
      )
      if (!resolvedName) {
        logForDebugging(
          `[Agent: ${agentDefinition.agentType}] Warning: Skill '${skillName}' specified in frontmatter was not found`,
          { level: 'warn' },
        )
        continue
      }

      const skill = getCommand(resolvedName, allSkills)
      if (skill.type !== 'prompt') {
        logForDebugging(
          `[Agent: ${agentDefinition.agentType}] Warning: Skill '${skillName}' is not a prompt-based skill`,
          { level: 'warn' },
        )
        continue
      }
      validSkills.push({ skillName, skill })
    }

    // Load all skill contents concurrently and add to initial messages
    const { formatSkillLoadingMetadata } = await import(
      '../../utils/processUserInput/processSlashCommand.js'
    )
    const loaded = await Promise.all(
      validSkills.map(async ({ skillName, skill }) => ({
        skillName,
        skill,
        content: await skill.getPromptForCommand('', toolUseContext),
      })),
    )
    for (const { skillName, skill, content } of loaded) {
      logForDebugging(
        `[Agent: ${agentDefinition.agentType}] Preloaded skill '${skillName}'`,
      )

      // Add command-message metadata so the UI shows which skill is loading
      const metadata = formatSkillLoadingMetadata(
        skillName,
        skill.progressMessage,
      )

      initialMessages.push(
        createUserMessage({
          content: [{ type: 'text', text: metadata }, ...content],
          isMeta: true,
        }),
      )
    }
  }

  // Initialize agent-specific MCP servers (additive to parent's servers)
  const {
    clients: mergedMcpClients,
    tools: agentMcpTools,
    cleanup: mcpCleanup,
  } = await initializeAgentMcpServers(
    agentDefinition,
    toolUseContext.options.mcpClients,
  )

  // Merge agent MCP tools with resolved agent tools, deduplicating by name.
  // resolvedTools is already deduplicated (see resolveAgentTools), so skip
  // the spread + uniqBy overhead when there are no agent-specific MCP tools.
  const allTools =
    agentMcpTools.length > 0
      ? uniqBy([...resolvedTools, ...agentMcpTools], 'name')
      : resolvedTools

  // Build agent-specific options
  const agentOptions: ToolUseContext['options'] = {
    isNonInteractiveSession: useExactTools
      ? toolUseContext.options.isNonInteractiveSession
      : isAsync
        ? true
        : (toolUseContext.options.isNonInteractiveSession ?? false),
    appendSystemPrompt: toolUseContext.options.appendSystemPrompt,
    tools: allTools,
    commands: [],
    debug: toolUseContext.options.debug,
    verbose: toolUseContext.options.verbose,
    mainLoopModel: resolvedAgentModel,
    // For fork children (useExactTools), inherit thinking config to match the
    // parent's API request prefix for prompt cache hits. For regular
    // sub-agents, disable thinking to control output token costs.
    thinkingConfig: useExactTools
      ? toolUseContext.options.thinkingConfig
      : { type: 'disabled' as const },
    mcpClients: mergedMcpClients,
    mcpResources: toolUseContext.options.mcpResources,
    agentDefinitions: toolUseContext.options.agentDefinitions,
    // Fork children (useExactTools path) need querySource on context.options
    // for the recursive-fork guard at AgentTool.tsx call() — it checks
    // options.querySource === 'agent:builtin:fork'. This survives autocompact
    // (which rewrites messages, not context.options). Without this, the guard
    // reads undefined and only the message-scan fallback fires — which
    // autocompact defeats by replacing the fork-boilerplate message.
    ...(useExactTools && { querySource }),
  }

  // Create subagent context using shared helper
  // - Sync agents share setAppState, setResponseLength, abortController with parent
  // - Async agents are fully isolated (but with explicit unlinked abortController)
  const agentToolUseContext = createSubagentContext(toolUseContext, {
    options: agentOptions,
    agentId,
    agentType: agentDefinition.agentType,
    messages: initialMessages,
    readFileState: agentReadFileState,
    abortController: agentAbortController,
    getAppState: agentGetAppState,
    // Sync agents share these callbacks with parent
    shareSetAppState: !isAsync,
    shareSetResponseLength: true, // Both sync and async contribute to response metrics
    criticalSystemReminder_EXPERIMENTAL:
      agentDefinition.criticalSystemReminder_EXPERIMENTAL,
    contentReplacementState,
  })

  // Preserve tool use results for subagents with viewable transcripts (in-process teammates)
  if (preserveToolUseResults) {
    agentToolUseContext.preserveToolUseResults = true
  }

  // Expose cache-safe params for background summarization (prompt cache sharing)
  if (onCacheSafeParams) {
    onCacheSafeParams({
      systemPrompt: agentSystemPrompt,
      userContext: resolvedUserContext,
      systemContext: resolvedSystemContext,
      toolUseContext: agentToolUseContext,
      forkContextMessages: initialMessages,
    })
  }

  // Record initial messages before the query loop starts, plus the agentType
  // so resume can route correctly when subagent_type is omitted. Both writes
  // are fire-and-forget — persistence failure shouldn't block the agent.
  void recordSidechainTranscript(initialMessages, agentId).catch(_err =>
    logForDebugging(`Failed to record sidechain transcript: ${_err}`),
  )
  void writeAgentMetadata(agentId, {
    agentType: agentDefinition.agentType,
    ...(worktreePath && { worktreePath }),
    ...(description && { description }),
  }).catch(_err => logForDebugging(`Failed to write agent metadata: ${_err}`))

  // Track the last recorded message UUID for parent chain continuity
  let lastRecordedUuid: UUID | null = initialMessages.at(-1)?.uuid ?? null

  try {
    for await (const message of query({
      messages: initialMessages,
      systemPrompt: agentSystemPrompt,
      userContext: resolvedUserContext,
      systemContext: resolvedSystemContext,
      canUseTool: canUseAgentTool,
      toolUseContext: agentToolUseContext,
      querySource,
      maxTurns: maxTurns ?? agentDefinition.maxTurns,
    })) {
      onQueryProgress?.()
      // Forward subagent API request starts to parent's metrics display
      // so TTFT/OTPS update during subagent execution.
      if (
        message.type === 'stream_event' &&
        message.event.type === 'message_start' &&
        message.ttftMs != null
      ) {
        toolUseContext.pushApiMetricsEntry?.(message.ttftMs)
        continue
      }

      // Yield attachment messages (e.g., structured_output) without recording them
      if (message.type === 'attachment') {
        // Handle max turns reached signal from query.ts
        if (message.attachment.type === 'max_turns_reached') {
          logForDebugging(
            `[Agent
: $
{
  agentDefinition.agentType
}
] Reached max turns limit ($
{
  message.attachment.maxTurns
}
)`,
          )
          break
        }
        yield message
        continue
      }

      if (isRecordableMessage(message)) {
        // Record only the new message with correct parent (O(1) per message)
        await recordSidechainTranscript(
          [message],
          agentId,
          lastRecordedUuid,
        ).catch(err =>
          logForDebugging(`Failed to record sidechain transcript: ${err}`),
        )
        if (message.type !== 'progress') {
          lastRecordedUuid = message.uuid
        }
        yield message
      }
    }

    if (agentAbortController.signal.aborted) {
      throw new AbortError()
    }

    // Run callback if provided (only built-in agents have callbacks)
    if (isBuiltInAgent(agentDefinition) && agentDefinition.callback) {
      agentDefinition.callback()
    }
  } finally {
    // Clean up agent-specific MCP servers (runs on normal completion, abort, or error)
    await mcpCleanup()
    // Clean up agent's session hooks
    if (agentDefinition.hooks) {
      clearSessionHooks(rootSetAppState, agentId)
    }
    // Clean up prompt cache tracking state for this agent
    if (feature('PROMPT_CACHE_BREAK_DETECTION')) {
      cleanupAgentTracking(agentId)
    }
    // Release cloned file state cache memory
    agentToolUseContext.readFileState.clear()
    // Release the cloned fork context messages
    initialMessages.length = 0
    // Release perfetto agent registry entry
    unregisterPerfettoAgent(agentId)
    // Release transcript subdir mapping
    clearAgentTranscriptSubdir(agentId)
    // Release this agent's todos entry. Without this, every subagent that
    // called TodoWrite leaves a key in AppState.todos forever (even after all
    // items complete, the value is [] but the key stays). Whale sessions
    // spawn hundreds of agents; each orphaned key is a small leak that adds up.
    rootSetAppState(prev => {
      if (!(agentId in prev.todos)) return prev
      const { [agentId]: _removed, ...todos } = prev.todos
      return { ...prev, todos }
    })
    // Kill any background bash tasks this agent spawned. Without this, a
    // `run_in_background` shell loop (e.g. test fixture fake-logs.sh) outlives
    // the agent as a PPID=1 zombie once the main session eventually exits.
    killShellTasksForAgent(agentId, toolUseContext.getAppState, rootSetAppState)
    /* eslint-disable @typescript-eslint/no-require-imports */
    if (feature('MONITOR_TOOL')) {
      const mcpMod =
        require('../../tasks/MonitorMcpTask/MonitorMcpTask.js') as typeof import('../../tasks/MonitorMcpTask/MonitorMcpTask.js')
      mcpMod.killMonitorMcpTasksForAgent(
        agentId,
        toolUseContext.getAppState,
        rootSetAppState,
      )
    }
    /* eslint-enable @typescript-eslint/no-require-imports */
  }
}

/**
 * Filters out assistant messages with incomplete tool calls (tool uses without results).
 * This prevents API errors when sending messages with orphaned tool calls.
 */
export function filterIncompleteToolCalls(messages: Message[]): Message[] {
  // Build a set of tool use IDs that have results
  const toolUseIdsWithResults = new Set<string>()

  for (const message of messages) {
    if (message?.type === 'user') {
      const userMessage = message as UserMessage
      const content = userMessage.message.content
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'tool_result' && block.tool_use_id) {
            toolUseIdsWithResults.add(block.tool_use_id)
          }
        }
      }
    }
  }

  // Filter out assistant messages that contain tool calls without results
  return messages.filter(message => {
    if (message?.type === 'assistant') {
      const assistantMessage = message as AssistantMessage
      const content = assistantMessage.message.content
      if (Array.isArray(content)) {
        // Check if this assistant message has any tool uses without results
        const hasIncompleteToolCall = content.some(
          block =>
            block.type === 'tool_use' &&
            block.id &&
            !toolUseIdsWithResults.has(block.id),
        )
        // Exclude messages with incomplete tool calls
        return !hasIncompleteToolCall
      }
    }
    // Keep all non-assistant messages and assistant messages without tool calls
    return true
  })
}

async function getAgentSystemPrompt(
  agentDefinition: AgentDefinition,
  toolUseContext: Pick<ToolUseContext, 'options'>,
  resolvedAgentModel: string,
  additionalWorkingDirectories: string[],
  resolvedTools: readonly Tool[],
): Promise<string[]> {
  const enabledToolNames = new Set(resolvedTools.map(t => t.name))
  try {
    const agentPrompt = agentDefinition.getSystemPrompt({ toolUseContext })
    const prompts = [agentPrompt]

    return await enhanceSystemPromptWithEnvDetails(
      prompts,
      resolvedAgentModel,
      additionalWorkingDirectories,
      enabledToolNames,
    )
  } catch (_error) {
    return enhanceSystemPromptWithEnvDetails(
      [DEFAULT_AGENT_PROMPT],
      resolvedAgentModel,
      additionalWorkingDirectories,
      enabledToolNames,
    )
  }
}

/**
 * Resolve a skill name from agent frontmatter to a registered command name.
 *
 * Plugin skills are registered with namespaced names (e.g., "my-plugin:my-skill")
 * but agents reference them with bare names (e.g., "my-skill"). This function
 * tries multiple resolution strategies:
 *
 * 1. Exact match via hasCommand (name, userFacingName, aliases)
 * 2. Prefix with agent's plugin name (e.g., "my-skill" → "my-plugin:my-skill")
 * 3. Suffix match — find any command whose name ends with ":skillName"
 */
function resolveSkillName(
  skillName: string,
  allSkills: Command[],
  agentDefinition: AgentDefinition,
): string | null {
  // 1. Direct match
  if (hasCommand(skillName, allSkills)) {
    return skillName
  }

  // 2. Try prefixing with the agent's plugin name
  // Plugin agents have agentType like "pluginName:agentName"
  const pluginPrefix = agentDefinition.agentType.split(':')[0]
  if (pluginPrefix) {
    const qualifiedName = `${pluginPrefix}:${skillName}`
    if (hasCommand(qualifiedName, allSkills)) {
      return qualifiedName
    }
  }

  // 3. Suffix match — find a skill whose name ends with ":skillName"
  const suffix = `:${skillName}`
  const match = allSkills.find(cmd => cmd.name.endsWith(suffix))
  if (match) {
    return match.name
  }

  return null
}

/** Bound a read page, not the amount of evidence that may be saved or read in total. */
export function pageExpertResearchRead(input: unknown): Record<string, unknown> {
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {}
  return { ...value, offset: typeof value.offset === 'number' && value.offset > 0 ? value.offset : 1,
    limit: typeof value.limit === 'number' && value.limit > 0 ? Math.min(value.limit, 200) : 200 }
}

/** Desktop can relay background permission cards; ordinary headless agents cannot.
 * This never allows a tool: existing rules, hooks and user decisions still apply.
 */
export function resolveAgentPermissionPromptPolicy(input: {
  isAsync: boolean
  canShowPermissionPrompts?: boolean
  agentPermissionMode?: string
  desktopExpertBound: boolean
}): { shouldAvoidPermissionPrompts: boolean; awaitAutomatedChecksBeforePrompt: boolean } {
  const shouldAvoidPermissionPrompts = input.canShowPermissionPrompts !== undefined
    ? !input.canShowPermissionPrompts
    : input.agentPermissionMode === 'bubble' || input.desktopExpertBound
      ? false
      : input.isAsync
  return { shouldAvoidPermissionPrompts, awaitAutomatedChecksBeforePrompt: input.isAsync && !shouldAvoidPermissionPrompts }
}
