import { describe, expect, test } from 'bun:test'
import { runInNewContext } from 'node:vm'
import { join } from 'node:path'
import { agentBrowserCommand, desktopViteCommand, resolveDesktopSmokeRuntimeSelection, verifyDesktopSmokeChangedFiles, desktopSmokeProjectReadyExpression, verifyDesktopSmokeSessionWorkspace } from './execute'

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

describe('desktop smoke changed-file verification', () => {
  test('normalizes Windows path separators before applying the allowed-change contract', () => {
    expect(() => verifyDesktopSmokeChangedFiles(['src\\greeting.ts'])).not.toThrow()
  })

  test('rejects files outside the greeting fixture contract', () => {
    expect(() => verifyDesktopSmokeChangedFiles(['src/greeting.ts', 'package.json'])).toThrow(
      'desktop smoke changed unexpected files: package.json',
    )
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


describe('desktop smoke project readiness', () => {
  const workDir = '/tmp/quality-gate/example project'
  const expression = () => desktopSmokeProjectReadyExpression('smoke-session', workDir)
  const evaluate = (activeTabId = 'smoke-session', title = workDir, visible = true) => runInNewContext(expression(), {
    localStorage: { getItem: () => JSON.stringify({ activeTabId }) },
    document: {
      body: { innerText: 'folder example project' },
      querySelectorAll: () => [{ title, innerText: 'folder example project', offsetWidth: visible ? 100 : 0, offsetHeight: visible ? 30 : 0 }],
    },
  })

  test('accepts a visible project basename while its absolute path is only in the directory button title', () => {
    expect(evaluate()).toBe(true)
  })

  test('rejects a stale active session, another workspace, and a hidden directory control', () => {
    expect(evaluate('stale-session')).toBe(false)
    expect(evaluate('smoke-session', '/tmp/another/example project')).toBe(false)
    expect(evaluate('smoke-session', workDir, false)).toBe(false)
  })

  test('checks the API session identity and actual workspace before trusting its visible basename', () => {
    const projectDir = join(import.meta.dir, 'fixtures/chat-edit')
    expect(verifyDesktopSmokeSessionWorkspace({ id: 'smoke-session', workDir: projectDir }, 'smoke-session', projectDir)).toBe(projectDir)
    expect(() => verifyDesktopSmokeSessionWorkspace({ id: 'stale-session', workDir: projectDir }, 'smoke-session', projectDir)).toThrow('session identity')
    expect(() => verifyDesktopSmokeSessionWorkspace({ id: 'smoke-session', workDir: import.meta.dir }, 'smoke-session', projectDir)).toThrow('workspace')
  })
})
