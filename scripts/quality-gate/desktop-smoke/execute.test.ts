import { describe, expect, test } from 'bun:test'
import { agentBrowserCommand, desktopViteCommand, normalizeDesktopSmokeChangedFiles, resolveDesktopSmokeRuntimeSelection } from './execute'

describe('desktop smoke runtime selection', () => {
  test('lets current-runtime use the desktop default active provider', () => {
    expect(resolveDesktopSmokeRuntimeSelection({
      providerId: null,
      modelId: 'current',
      label: 'current-runtime',
    })).toBeNull()
  })

  test('keeps explicit official and saved provider selections scoped to the session', () => {
    expect(resolveDesktopSmokeRuntimeSelection({
      providerId: null,
      modelId: 'claude-sonnet-4-6',
      label: 'official-sonnet',
    })).toEqual({
      providerId: null,
      modelId: 'claude-sonnet-4-6',
    })

    expect(resolveDesktopSmokeRuntimeSelection({
      providerId: 'provider-a',
      modelId: 'model-a',
      label: 'provider-a-main',
    })).toEqual({
      providerId: 'provider-a',
      modelId: 'model-a',
    })
  })
})

describe('desktop smoke Vite launcher', () => {
  test('uses the current Bun runtime and package script instead of platform-specific node_modules shims', () => {
    expect(desktopViteCommand()).toEqual([process.execPath, 'run', 'dev'])
  })
})


describe('desktop smoke browser launcher', () => {
  test('uses a direct native executable on Windows when the installed agent-browser package provides one', () => {
    const command = agentBrowserCommand('open', 'http://127.0.0.1')
    if (process.platform === 'win32') {
      expect(command.at(-2)).toBe('open')
      expect(command.at(-1)).toBe('http://127.0.0.1')
      expect(command[0]).toMatch(/agent-browser-win32-x64\.exe$/i)
      return
    }
    expect(command).toEqual(['agent-browser', 'open', 'http://127.0.0.1'])
  })
})

describe('desktop smoke changed-file validation', () => {
  test('normalizes Windows separators before comparing expected fixture paths', () => {
    expect(normalizeDesktopSmokeChangedFiles(['src\\greeting.ts'])).toEqual(['src/greeting.ts'])
  })
})
