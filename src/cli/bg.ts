import { unsupportedFeature } from '../utils/unsupportedFeature.js'
export function psHandler(_args: string[]): Promise<void> { return unsupportedFeature('background-sessions') }
export function logsHandler(_sessionId: string | undefined): Promise<void> { return unsupportedFeature('background-sessions') }
export function attachHandler(_sessionId: string | undefined): Promise<void> { return unsupportedFeature('background-sessions') }
export function killHandler(_sessionId: string | undefined): Promise<void> { return unsupportedFeature('background-sessions') }
export function handleBgFlag(_args: string[]): Promise<void> { return unsupportedFeature('background-sessions') }
