import type { ReactNode } from 'react'
import type { Message } from '../../types/message.js'
import { unsupportedFeature } from '../../utils/unsupportedFeature.js'

export function SnipBoundaryMessage(_props: { message: Message }): ReactNode {
  return unsupportedFeature('history-snip-renderer')
}
