import { expect, test } from 'bun:test'
import type { KeybindingBlock } from './types.js'
import { parseBindings } from './parser.js'
import { getBindingDisplayText } from './resolver.js'

test('parsed keybindings retain custom command strings and explicit unbinding', () => {
  const blocks: KeybindingBlock[] = [{ context: 'Chat', bindings: { 'ctrl+k': 'command:custom-name', 'ctrl+j': null } }]
  const bindings = parseBindings(blocks)
  expect(bindings).toMatchObject([{ context: 'Chat', action: 'command:custom-name', chord: [{ key: 'k', ctrl: true }] }, { context: 'Chat', action: null }])
  expect(getBindingDisplayText('command:custom-name', 'Chat', bindings)).toBe('ctrl+k')
})
