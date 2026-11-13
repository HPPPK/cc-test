import { unsupportedFeature } from '../utils/unsupportedFeature.js'

export type LegacyServerLock = { pid: number, port: number, host: string, httpUrl: string, startedAt: number }
export function writeServerLock(_lock: LegacyServerLock): Promise<void> { return unsupportedFeature('legacy-direct-connect-lock') }
export function removeServerLock(): Promise<void> { return unsupportedFeature('legacy-direct-connect-lock') }
export function probeRunningServer(): Promise<LegacyServerLock | null> { return unsupportedFeature('legacy-direct-connect-lock') }
