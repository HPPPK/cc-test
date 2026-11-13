import type { Tip, TipContext } from './types.js'
const context: TipContext = { theme: 'dark', bashTools: new Set(['git']) }
const tip: Tip = { id: 'example', cooldownSessions: 3, content: async ({ theme }) => theme, isRelevant: async input => Boolean(input?.bashTools?.has('git')) }
// @ts-expect-error cooldown must count sessions numerically
const invalid: Tip = { ...tip, cooldownSessions: 'three' }
void [context, invalid]
