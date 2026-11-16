import type { ToolUseContext } from '../../Tool.js'
import type { Attachment } from '../../utils/attachments.js'
import type { Message } from '../../types/message.js'

export type PendingSkillDiscovery = Promise<Attachment[]>
const unavailable = () => new Error('Internal skill discovery is unavailable in this build')

/** Executable boundaries reject explicitly; they do not return fabricated discoveries. */
export async function getTurnZeroSkillDiscovery(
  _input: string,
  _messages: Message[],
  _context: ToolUseContext,
): Promise<Attachment[]> {
  throw unavailable()
}
export function startSkillDiscoveryPrefetch(
  _input: string | null,
  _messages: Message[],
  _context: ToolUseContext,
): PendingSkillDiscovery {
  throw unavailable()
}
export async function collectSkillDiscoveryPrefetch(
  _pending: PendingSkillDiscovery,
): Promise<Attachment[]> {
  throw unavailable()
}
