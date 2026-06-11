import { describe, expect, test } from 'bun:test'
import { buildClaudeCliArgs, type ClaudeCliLauncher } from './desktopBundledCli.js'

describe('desktop bundled CLI args', () => {
  test('uses the current Bun executable for script launchers on Windows', () => {
    const launcher: ClaudeCliLauncher = {
      command: 'F:\\repo\\src\\entrypoints\\cli.tsx',
      kind: 'script',
      requiresAppRoot: false,
    }

    const args = buildClaudeCliArgs(
      launcher,
      ['--print'],
      undefined,
      'C:\\Users\\me\\.bun\\bin\\bun.exe',
    )

    expect(args).toEqual(
      process.platform === 'win32'
        ? ['C:\\Users\\me\\.bun\\bin\\bun.exe', launcher.command, '--print']
        : ['bun', launcher.command, '--print'],
    )
  })
})
