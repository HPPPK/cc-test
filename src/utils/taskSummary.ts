import type { CacheSafeParams } from './forkedAgent.js'
import { unsupportedFeature } from './unsupportedFeature.js'
export function shouldGenerateTaskSummary(): boolean { return false }
export function maybeGenerateTaskSummary(_params: CacheSafeParams): void { unsupportedFeature('task-summary') }
