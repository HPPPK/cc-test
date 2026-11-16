import { unsupportedFeature } from './unsupportedFeature.js'
export function sendToUdsSocket(_target: string, _message: string): Promise<void> { return unsupportedFeature('uds-messaging') }
/** Only fields consumed by guarded resume filtering are declared. */
export function listAllLiveSessions(): Promise<{ kind?: string, sessionId?: string }[]> { return unsupportedFeature('background-session-discovery') }
