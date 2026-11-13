import type { Message } from '../../types/message.js'

/** Capability probes remain false; no synthetic boundary is recognized. */
export function isSnipBoundaryMessage(_message: Message): false {
  return false
}
export function projectSnippedView<M extends Message>(_messages: M[]): M[] {
  throw new Error('Internal history-snipping projection is unavailable in this build')
}
