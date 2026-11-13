import type { Tool } from '../Tool.js'
import { unsupportedFeature } from './unsupportedFeature.js'

/** A disabled tool identity. Accessing schemas or any operational path fails closed. */
export function unavailableTool(name: string, feature: string): Tool {
  const fail = (): never => unsupportedFeature(feature)
  return {
    name,
    isEnabled: () => false,
    isConcurrencySafe: () => false,
    isReadOnly: () => false,
    maxResultSizeChars: 0,
    get inputSchema(): Tool['inputSchema'] { return fail() },
    call: fail,
    description: fail,
    prompt: fail,
    checkPermissions: fail,
    userFacingName: fail,
    toAutoClassifierInput: fail,
    mapToolResultToToolResultBlockParam: fail,
    renderToolUseMessage: fail,
  }
}
