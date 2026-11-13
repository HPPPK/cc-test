import type { BetaUsage } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'

/** Usage normalization makes every SDK usage field present, including nested counters. */
type DeepNonNullable<T> = T extends readonly unknown[] ? T : T extends object
  ? { [K in keyof T]-?: DeepNonNullable<NonNullable<T[K]>> }
  : NonNullable<T>
export type NonNullableUsage = DeepNonNullable<BetaUsage>
