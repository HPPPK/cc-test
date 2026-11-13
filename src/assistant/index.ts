import type { AppState } from '../state/AppStateStore.js'
import { unsupportedFeature } from '../utils/unsupportedFeature.js'

export function isAssistantMode(): boolean { return false }
export function isAssistantForced(): boolean { return false }
export function getAssistantActivationPath(): undefined { return undefined }
export function initializeAssistantTeam(): Promise<NonNullable<AppState['teamContext']>> { return unsupportedFeature('assistant') }
export function markAssistantForced(): void { unsupportedFeature('assistant') }
export function getAssistantSystemPromptAddendum(): string { return unsupportedFeature('assistant') }
