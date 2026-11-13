import type { ReactNode } from 'react'
import type { TextBlockParam } from '@anthropic-ai/sdk/resources/messages.mjs'
import { unsupportedFeature } from '../../utils/unsupportedFeature.js'

export function UserForkBoilerplateMessage(_props: { addMargin: boolean, param: TextBlockParam }): ReactNode {
  return unsupportedFeature('private-message-renderer')
}
