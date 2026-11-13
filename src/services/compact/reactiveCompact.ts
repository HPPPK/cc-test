import type { Message, StreamEvent } from '../../types/message.js'
import type { QuerySource } from '../../constants/querySource.js'
import type { CacheSafeParams } from '../../utils/forkedAgent.js'
import type { CompactionResult } from './compact.js'
import { unsupportedFeature } from '../../utils/unsupportedFeature.js'

export function isReactiveCompactEnabled(): boolean { return false }
export function isReactiveOnlyMode(): boolean { return false }
export function isWithheldPromptTooLong(_message: Message | StreamEvent | undefined): boolean { return false }
export function isWithheldMediaSizeError(_message: Message | StreamEvent | undefined): boolean { return false }
export function tryReactiveCompact(_params: { hasAttempted: boolean, querySource?: QuerySource, aborted: boolean, messages: Message[], cacheSafeParams: CacheSafeParams }): Promise<CompactionResult | null> { return unsupportedFeature('reactive-compact') }
type ReactiveCompactOutcome = { ok: true, result: CompactionResult } | { ok: false, reason: 'too_few_groups' | 'aborted' | 'exhausted' | 'error' | 'media_unstrippable' }
export function reactiveCompactOnPromptTooLong(_messages: Message[], _params: CacheSafeParams, _options: { customInstructions?: string, trigger: 'manual' }): Promise<ReactiveCompactOutcome> { return unsupportedFeature('reactive-compact') }
