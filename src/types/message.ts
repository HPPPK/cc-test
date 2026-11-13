import type { APIError } from '@anthropic-ai/sdk'
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages.mjs'
import type { BetaContentBlock, BetaMessage, BetaRawMessageStreamEvent, BetaToolUseBlock } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { UUID } from 'crypto'
import type { Progress } from '../Tool.js'
import type { SDKAssistantMessageError } from '../entrypoints/agentSdkTypes.js'
import type { Attachment } from '../utils/attachments.js'
import type { MessageKindMetadata } from '../utils/messageKind.js'
import type { BranchAction, CommitKind, PrAction } from '../tools/shared/gitOperationTracking.js'
import type { HookProgress } from './hooks.js'
import type { PermissionMode } from './permissions.js'

/** Additive metadata remains optional when reading older transcripts. A user role is transport, not authorship. */
export type MessageMetadata = Partial<MessageKindMetadata> & {
  uuid: UUID
  timestamp: string
  isVirtual?: true
}
export type MessageOrigin =
  | { kind: 'human' }
  | { kind: 'task-notification' }
  | { kind: 'coordinator' }
  | { kind: 'channel'; server: string }
export type PartialCompactDirection = 'from' | 'up_to'
export type UserMessage = MessageMetadata & {
  type: 'user'
  message: MessageParam & { role: 'user' }
  toolUseResult?: unknown
  /** Legacy plan-bearing user entries remain readable on resume. */
  planContent?: string
  mcpMeta?: { _meta?: Record<string, unknown>; structuredContent?: Record<string, unknown> }
  imagePasteIds?: number[]
  sourceToolAssistantUUID?: UUID
  sourceToolUseID?: string
  permissionMode?: PermissionMode
  summarizeMetadata?: { messagesSummarized: number; userContext?: string; direction?: PartialCompactDirection }
  origin?: MessageOrigin
}
export type AssistantMessage = MessageMetadata & {
  type: 'assistant'
  message: BetaMessage
  requestId?: string
  apiError?: 'max_output_tokens'
  error?: SDKAssistantMessageError
  errorDetails?: string
  isApiErrorMessage?: boolean
  advisorModel?: string
  /** Internal API extensions are opaque until their owner validates them. */
  research?: unknown
}
export type AttachmentMessage<A extends Attachment = Attachment> = MessageMetadata & { type: 'attachment'; attachment: A }
export type ProgressMessage<P extends Progress = Progress> = MessageMetadata & {
  type: 'progress'; data: P; toolUseID: string; parentToolUseID: string
}
export type SystemMessageLevel = 'info' | 'warning' | 'error' | 'suggestion'
type SystemBase<S extends string> = MessageMetadata & { type: 'system'; subtype: S; level?: SystemMessageLevel; toolUseID?: string; content?: string }
export type SystemInformationalMessage = SystemBase<'informational'> & { content: string; preventContinuation?: boolean }
export type SystemLocalCommandMessage = SystemBase<'local_command'> & { content: string }
export type SystemPermissionRetryMessage = SystemBase<'permission_retry'> & { content: string; commands: string[] }
export type SystemBridgeStatusMessage = SystemBase<'bridge_status'> & { content: string; url: string; upgradeNudge?: string }
export type SystemScheduledTaskFireMessage = SystemBase<'scheduled_task_fire'> & { content: string }
export type StopHookInfo = { command: string; promptText?: string; durationMs?: number }
export type SystemStopHookSummaryMessage = SystemBase<'stop_hook_summary'> & {
  hookCount: number; hookInfos: StopHookInfo[]; hookErrors: string[]; preventedContinuation: boolean
  stopReason?: string; hasOutput: boolean; hookLabel?: string; totalDurationMs?: number
}
export type SystemTurnDurationMessage = SystemBase<'turn_duration'> & {
  durationMs: number; budgetTokens?: number; budgetLimit?: number; budgetNudges?: number; messageCount?: number
}
export type SystemAwaySummaryMessage = SystemBase<'away_summary'> & { content: string }
export type SystemMemorySavedMessage = SystemBase<'memory_saved'> & { writtenPaths: string[]; verb?: string; teamCount?: number }
export type SystemAgentsKilledMessage = SystemBase<'agents_killed'>
export type SystemApiMetricsMessage = SystemBase<'api_metrics'> & {
  ttftMs: number; otps: number; isP50?: boolean; hookDurationMs?: number; turnDurationMs?: number
  toolDurationMs?: number; classifierDurationMs?: number; toolCount?: number; hookCount?: number
  classifierCount?: number; configWriteCount?: number
}
export type CompactMetadata = {
  trigger: 'manual' | 'auto'; preTokens: number; userContext?: string; messagesSummarized?: number
  preCompactDiscoveredTools?: string[]
  preservedSegment?: { headUuid: string; anchorUuid: string; tailUuid: string }
}
export type SystemCompactBoundaryMessage = SystemBase<'compact_boundary'> & { content: string; compactMetadata: CompactMetadata; logicalParentUuid?: UUID | null }
export type SystemMicrocompactBoundaryMessage = SystemBase<'microcompact_boundary'> & {
  content: string
  microcompactMetadata: { trigger: 'auto'; preTokens: number; tokensSaved: number; compactedToolIds: string[]; clearedAttachmentUUIDs: string[] }
}
export type SystemAPIErrorMessage = SystemBase<'api_error'> & { error: APIError; cause?: Error; retryInMs: number; retryAttempt: number; maxRetries: number }
export type SystemFileSnapshotMessage = SystemBase<'file_snapshot'> & { content: string; snapshotFiles: { key: string; path: string; content: string }[] }
export type SystemThinkingMessage = SystemBase<'thinking'> & { content: string }
export type SystemMessage = SystemInformationalMessage | SystemLocalCommandMessage | SystemPermissionRetryMessage
  | SystemBridgeStatusMessage | SystemScheduledTaskFireMessage | SystemStopHookSummaryMessage | SystemTurnDurationMessage
  | SystemAwaySummaryMessage | SystemMemorySavedMessage | SystemAgentsKilledMessage | SystemApiMetricsMessage
  | SystemCompactBoundaryMessage | SystemMicrocompactBoundaryMessage | SystemAPIErrorMessage | SystemFileSnapshotMessage | SystemThinkingMessage
export type Message = UserMessage | AssistantMessage | AttachmentMessage | ProgressMessage | SystemMessage
export type NormalizedUserMessage = Omit<UserMessage, 'message'> & { message: Omit<UserMessage['message'], 'content'> & { content: Exclude<MessageParam['content'], string> } }
export type NormalizedAssistantMessage<C extends BetaContentBlock = BetaContentBlock> = Omit<AssistantMessage, 'message'> & { message: Omit<BetaMessage, 'content'> & { content: C[] } }
export type NormalizedMessage = NormalizedUserMessage | NormalizedAssistantMessage | AttachmentMessage | ProgressMessage | SystemMessage
export type HookResultMessage = AttachmentMessage | ProgressMessage<HookProgress>
export type StreamEvent = Partial<MessageKindMetadata> & { type: 'stream_event'; event: BetaRawMessageStreamEvent; ttftMs?: number }
export type RequestStartEvent = { type: 'stream_request_start' }
export type TombstoneMessage = { type: 'tombstone'; message: Message }
export type ToolUseSummaryMessage = MessageMetadata & { type: 'tool_use_summary'; summary: string; precedingToolUseIds: string[] }

export type GroupedToolUseMessage = Omit<MessageMetadata, 'uuid'> & {
  type: 'grouped_tool_use'; uuid: string; toolName: string; messages: NormalizedAssistantMessage<BetaToolUseBlock>[]
  results: NormalizedUserMessage[]; displayMessage: NormalizedAssistantMessage<BetaToolUseBlock>; messageId: string
}
export type CollapsibleMessage = NormalizedAssistantMessage | NormalizedUserMessage | GroupedToolUseMessage
export type CollapsedReadSearchGroup = MessageMetadata & {
  type: 'collapsed_read_search'; searchCount: number; readCount: number; listCount: number; replCount: number
  memorySearchCount: number; memoryReadCount: number; memoryWriteCount: number; readFilePaths: string[]
  searchArgs: string[]; latestDisplayHint?: string; messages: CollapsibleMessage[]; displayMessage: CollapsibleMessage
  teamMemorySearchCount?: number; teamMemoryReadCount?: number; teamMemoryWriteCount?: number
  mcpCallCount?: number; mcpServerNames?: string[]; bashCount?: number; gitOpBashCount?: number
  commits?: { sha: string; kind: CommitKind }[]; pushes?: { branch: string }[]
  branches?: { ref: string; action: BranchAction }[]; prs?: { number: number; url?: string; action: PrAction }[]
  hookTotalMs?: number; hookCount?: number; hookInfos?: StopHookInfo[]
  relevantMemories?: { path: string; content: string; mtimeMs: number }[]
}
export type RenderableMessage = Exclude<NormalizedMessage, ProgressMessage> | GroupedToolUseMessage | CollapsedReadSearchGroup
