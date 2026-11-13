import { unsupportedFeature } from '../utils/unsupportedFeature.js'
export function runDaemonWorker(_kind: string | undefined): Promise<void> { return unsupportedFeature('daemon') }
