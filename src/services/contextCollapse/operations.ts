import type { Message } from '../../types/message.js'
import { unsupportedFeature } from '../../utils/unsupportedFeature.js'
export function projectView(_messages: Message[]): Message[] { return unsupportedFeature('context-collapse') }
