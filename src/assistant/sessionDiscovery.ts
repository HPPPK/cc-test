import { unsupportedFeature } from '../utils/unsupportedFeature.js'
/** The only field decoded by the available chooser launcher is session identity. */
export type AssistantSession = { id: string }
export function discoverAssistantSessions(): Promise<AssistantSession[]> { return unsupportedFeature('assistant') }
