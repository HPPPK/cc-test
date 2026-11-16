import type { UUID } from 'crypto'
import { validateUuid } from '../../utils/uuid.js'

/** SDK envelopes allow string IDs; local transcript identity requires UUIDs. */
export function normalizeSDKMessageUuid(uuid: string | undefined): UUID | undefined {
  return validateUuid(uuid) ?? undefined
}
