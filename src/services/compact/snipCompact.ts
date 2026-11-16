import type { Message, SystemMessage } from '../../types/message.js'

/** No internal history-snipping algorithm is distributed in the public build. */
export function isSnipRuntimeEnabled(): false {
  return false
}
export function shouldNudgeForSnips(_messages: Message[]): false {
  return false
}
export function isSnipMarkerMessage(_message: Message): false {
  return false
}
export const SNIP_NUDGE_TEXT = 'History snipping is unavailable in this build.'
export type SnipCompactResult = {
  messages: Message[]
  tokensFreed: number
  executed: boolean
  boundaryMessage?: SystemMessage
}
export function snipCompactIfNeeded(_messages: Message[], _options?: { force?: boolean }): SnipCompactResult {
  throw new Error('Internal history snipping is unavailable in this build')
}
