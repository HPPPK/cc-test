import { unsupportedFeature } from '../../utils/unsupportedFeature.js'

export type CacheEditsBlock = { type: 'cache_edits', edits: { type: 'delete', cache_reference: string }[] }
export type PinnedCacheEdits = { userMessageIndex: number, block: CacheEditsBlock }
export type CachedMCState = { registeredTools: Set<string>, toolOrder: string[], deletedRefs: Set<string>, pinnedEdits: PinnedCacheEdits[] }
export function isCachedMicrocompactEnabled(): boolean { return false }
export function isModelSupportedForCacheEditing(_model: string): boolean { return false }
export function getCachedMCConfig(): { triggerThreshold: number, keepRecent: number, supportedModels: string[] } { return unsupportedFeature('cached-microcompact') }
export function createCachedMCState(): CachedMCState { return unsupportedFeature('cached-microcompact') }
export function registerToolResult(_state: CachedMCState, _toolUseId: string): void { unsupportedFeature('cached-microcompact') }
export function registerToolMessage(_state: CachedMCState, _toolUseIds: string[]): void { unsupportedFeature('cached-microcompact') }
export function getToolResultsToDelete(_state: CachedMCState): string[] { return unsupportedFeature('cached-microcompact') }
export function createCacheEditsBlock(_state: CachedMCState, _toolUseIds: string[]): CacheEditsBlock | null { return unsupportedFeature('cached-microcompact') }
export function markToolsSentToAPI(_state: CachedMCState): void { unsupportedFeature('cached-microcompact') }
export function resetCachedMCState(_state: CachedMCState): void { unsupportedFeature('cached-microcompact') }
