/** Envelope provenance. Never put these fields inside provider role/content payloads. */
export const MESSAGE_KINDS = ['user_input', 'assistant_response', 'context_summary', 'internal_notification', 'tool_exchange', 'system_event'] as const
export type MessageKind = (typeof MESSAGE_KINDS)[number]
export type MessageKindMetadata = {
  messageKind: MessageKind
  isMeta?: boolean
  isCompactSummary?: boolean
  isVisibleInTranscriptOnly?: boolean
  isSynthetic?: boolean
}
const kinds = new Set<string>(MESSAGE_KINDS)
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
export function resolveMessageKind(value: unknown): MessageKind {
  const message = record(value)
  if (typeof message.messageKind === 'string' && kinds.has(message.messageKind)) return message.messageKind as MessageKind
  const nested = record(message.message)
  const content = nested.content ?? message.content
  const type = message.type ?? nested.role ?? message.role
  if (message.mode === 'task-notification') return 'internal_notification'
  if (message.isCompactSummary === true || message.subtype === 'compact_boundary') return 'context_summary'
  if (message.toolUseResult !== undefined || type === 'tool_use' || type === 'tool_result' || (Array.isArray(content) && content.some(block => ['tool_use', 'tool_result'].includes(String(record(block).type))))) return 'tool_exchange'
  if (message.isMeta === true || message.isSynthetic === true || message.isVisibleInTranscriptOnly === true || (typeof record(message.origin).kind === 'string' && record(message.origin).kind !== 'human')) return 'internal_notification'
  if (type === 'stream_event') {
    const event = record(message.event)
    const block = record(event.content_block)
    const delta = record(event.delta)
    return block.type === 'tool_use' || delta.type === 'input_json_delta' ? 'tool_exchange' : 'assistant_response'
  }
  if (['assistant', 'assistant_text', 'content_delta', 'thinking'].includes(String(type)) || (type === 'content_start' && message.blockType === 'text')) return 'assistant_response'
  if (type === 'user' || type === 'user_text' || type === 'user_message' || (!type && message.mode === 'prompt')) return 'user_input'
  return 'system_event'
}
export function isHumanInputMessage(value: unknown): boolean {
  return resolveMessageKind(value) === 'user_input'
}
export function messageKindMetadata(value: unknown): MessageKindMetadata {
  const source = record(value)
  const metadata: MessageKindMetadata = { messageKind: resolveMessageKind(value) }
  for (const key of ['isMeta', 'isCompactSummary', 'isVisibleInTranscriptOnly', 'isSynthetic'] as const) {
    if (typeof source[key] === 'boolean') metadata[key] = source[key]
  }
  return metadata
}
/** Additive in-memory upgrade; caller owns persistence, originals remain untouched. */
export function attachMessageKind<T>(value: T): T & MessageKindMetadata {
  return { ...value, ...messageKindMetadata(value) }
}
