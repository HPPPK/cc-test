import { expect, test } from 'bun:test'

test('legacy keybinding import delegates to the maintained real hook', async () => {
  const legacy = await import('./useKeybinding.js')
  const current = await import('../keybindings/useKeybinding.js')
  expect(typeof legacy.useKeybinding).toBe('function')
  expect(legacy.useKeybinding).toBe(current.useKeybinding)
})
