import { expect, test } from 'bun:test'
import type { ViewState } from './types.js'
import { parsePluginArgs } from './parseArgs.js'

test('implemented plugin actions fit the manager transition contract', () => {
  for (const action of ['enable', 'disable', 'uninstall'] as const) {
    const command = parsePluginArgs(`${action} example`)
    if (command.type !== 'enable' && command.type !== 'disable' && command.type !== 'uninstall') throw new Error('Expected a manager command')
    const view: ViewState = { type: 'manage-plugins', action: command.type, targetPlugin: command.plugin }
    expect(view).toEqual({ type: 'manage-plugins', action, targetPlugin: 'example' })
  }
})
