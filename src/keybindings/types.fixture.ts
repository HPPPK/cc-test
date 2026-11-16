import type { KeybindingBlock, ParsedBinding, KeybindingContextName } from './types.js'
const block: KeybindingBlock = { context: 'Chat', bindings: { 'ctrl+k': 'command:custom', 'ctrl+j': null } }
// @ts-expect-error actions are strings or null, never command objects
const bad: KeybindingBlock = { context: 'Chat', bindings: { 'ctrl+k': { command: 'custom' } } }
// @ts-expect-error contexts must be known application surfaces
const context: KeybindingContextName = 'Invented'
const binding: ParsedBinding = { context: 'Global', action: 'app:interrupt', chord: [{ key: 'c', ctrl: true, alt: false, shift: false, meta: false, super: false }] }
void [block, bad, context, binding]
