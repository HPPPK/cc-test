import type { Message } from '../types/message.js'
import { unsupportedFeature } from './unsupportedFeature.js'
export function createSessionTurnUploader(): (messages: Message[]) => Promise<void> { return unsupportedFeature('session-data-uploader') }
