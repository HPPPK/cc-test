import { unsupportedFeature } from '../utils/unsupportedFeature.js'
export function postInterClaudeMessage(_targetSession: string, _message: string): Promise<{ ok: boolean, error?: string }> { return unsupportedFeature('peer-session-messaging') }
