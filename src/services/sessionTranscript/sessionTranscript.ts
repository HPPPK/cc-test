import type { Message } from '../../types/message.js'

/** Internal assistant-mode export is not the core persisted chat transcript. */
export async function writeSessionTranscriptSegment(_messages: Message[]): Promise<void> {
  throw new Error('Internal per-day transcript export is unavailable in this build')
}
export function flushOnDateChange(_messages: Message[], _currentDate: string): never {
  throw new Error('Internal per-day transcript export is unavailable in this build')
}
