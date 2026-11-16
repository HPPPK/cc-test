import { unsupportedFeature } from '../utils/unsupportedFeature.js'

export function rollback(_target?: string, _options?: { list?: boolean, dryRun?: boolean, safe?: boolean }): Promise<void> { return unsupportedFeature('internal-cli-rollback') }
