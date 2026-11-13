import type { ToolUseContext } from '../../Tool.js'
import type { Message, AssistantMessage, StreamEvent } from '../../types/message.js'
import type { QuerySource } from '../../constants/querySource.js'
import { unsupportedFeature } from '../../utils/unsupportedFeature.js'

export function isContextCollapseEnabled(): boolean { return false }
export type ContextCollapseStats = {
  collapsedSpans: number
  collapsedMessages: number
  stagedSpans: number
  health: { totalSpawns: number, totalErrors: number, totalEmptySpawns: number, emptySpawnWarningEmitted: boolean, lastError?: string | null }
}
export function getStats(): ContextCollapseStats { return unsupportedFeature('context-collapse') }
export function subscribe(_listener: () => void): () => void { return unsupportedFeature('context-collapse') }
export function initContextCollapse(): void { unsupportedFeature('context-collapse') }
export function resetContextCollapse(): void { unsupportedFeature('context-collapse') }
export function applyCollapsesIfNeeded(_messages: Message[], _context: ToolUseContext, _querySource?: QuerySource): Promise<{ messages: Message[] }> { return unsupportedFeature('context-collapse') }
export function recoverFromOverflow(_messages: Message[], _querySource?: QuerySource): { messages: Message[], committed: number } { return unsupportedFeature('context-collapse') }
export function isWithheldPromptTooLong(_message: Message | StreamEvent | undefined, _isPromptTooLong: (message: AssistantMessage) => boolean, _querySource?: QuerySource): boolean { return false }
