import { afterEach, expect, test } from 'bun:test'
import { createPowerShellProvider } from './powershellProvider.js'
const original = process.env.CLAUDE_CLI_PATH
const appRoot = process.env.CLAUDE_APP_ROOT
afterEach(() => {
  if (original === undefined) delete process.env.CLAUDE_CLI_PATH
  else process.env.CLAUDE_CLI_PATH = original
  if (appRoot === undefined) delete process.env.CLAUDE_APP_ROOT
  else process.env.CLAUDE_APP_ROOT = appRoot
})
test.each([
  ["/tmp/app's tools/claude-sidecar.exe", "'cli' '--app-root'"],
  ['/tmp/claude-cli.exe', "'--app-root'"],
  ['/tmp/entry.ts', (process.platform === 'win32' ? "'" + process.execPath.replace(/'/g, "''") + "'" : "'bun'") + " '/tmp/entry.ts'"],
])('injects an app-owned PowerShell wrapper for %s', async (cliPath, expected) => {
  process.env.CLAUDE_CLI_PATH = cliPath
  process.env.CLAUDE_APP_ROOT = '/tmp/app root'
  const { commandString } = await createPowerShellProvider('pwsh').buildExecCommand('claude expert-template-fill --schema', { id: 'wrapper', useSandbox: false })
  expect(commandString).toContain('function claude {')
  expect(commandString).toContain(expected)
  expect(commandString).toContain('@args')
  if (cliPath.includes("app's")) expect(commandString).toContain("app''s tools")
})
