import { expect, spyOn, test } from 'bun:test'
import * as installer from '../../utils/nativeInstaller/index.js'
import * as startup from './useStartupNotification.js'
import { useInstallMessages } from './useInstallMessages.js'

test('installation diagnostics preserve notification severity and message text', async () => {
  const computes: Parameters<typeof startup.useStartupNotification>[0][] = []
  const register = spyOn(startup, 'useStartupNotification').mockImplementation(compute => { computes.push(compute) })
  const diagnostics = spyOn(installer, 'checkInstall').mockResolvedValue([
    { type: 'error', message: 'Repair required', userActionRequired: false },
    { type: 'path', message: 'PATH update', userActionRequired: false },
    { type: 'info', message: 'Installed', userActionRequired: false },
  ])
  try {
    useInstallMessages()
    const compute = computes[0]
    if (!compute) throw new Error('Expected startup notification registration')
    expect(await compute()).toMatchObject([
      { text: 'Repair required', priority: 'high', color: 'error' },
      { text: 'PATH update', priority: 'medium', color: 'warning' },
      { text: 'Installed', priority: 'low', color: 'warning' },
    ])
  } finally { register.mockRestore(); diagnostics.mockRestore() }
})
