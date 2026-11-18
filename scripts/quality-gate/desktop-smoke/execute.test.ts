import { describe, expect, test } from 'bun:test'
import { runInNewContext } from 'node:vm'
import { join } from 'node:path'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { agentBrowserCommand, desktopViteCommand, resolveDesktopSmokeRuntimeSelection, verifyDesktopSmokeChangedFiles, desktopSmokeProjectReadyExpression, verifyDesktopSmokeSessionWorkspace, waitForVerifiedProject } from './execute'

describe('desktop model completion waiting', () => {
  test('keeps waiting without a total deadline until project verification passes', async () => {
    let checks = 0
    const wait = runInNewContext(`(${waitForVerifiedProject.toString()})`, {
      Date: { now: () => ++checks * 86_400_000 },
      Bun: { sleep: async () => {} },
      agentBrowserCommand: () => [],
      runLoggedCommand: async () => ({ stdout: '', stderr: '' }),
      verifyProject: async () => { if (checks++ < 3) throw new Error('model still working') },
    })
    await expect(wait({}, '', '', '', '', '', 0)).resolves.toBeUndefined()
    expect(checks).toBeGreaterThan(3)
  })

  test('unlimited waiting still reports explicit runtime errors', async () => {
    const wait = runInNewContext(`(${waitForVerifiedProject.toString()})`, {
      Date,
      Bun: { sleep: async () => {} },
      agentBrowserCommand: () => [],
      runLoggedCommand: async () => ({ stdout: 'API Error: 429', stderr: '' }),
    })
    await expect(wait({}, '', '', '', '', '', 0)).rejects.toThrow('quota/rate-limit failure')
  })
})

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
  function withLauncherFixture(platform: NodeJS.Platform, check: (root: string) => void) {
    const root = mkdtempSync(join(tmpdir(), 'desktop-launcher-fixture-'))
    const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')!
    const names = ['APPDATA', 'AGENT_BROWSER_BINARY', 'AGENT_BROWSER_EXECUTABLE_PATH', 'SystemRoot'] as const
    const previous = Object.fromEntries(names.map(name => [name, process.env[name]]))
    try {
      Object.defineProperty(process, 'platform', { ...descriptor, value: platform })
      process.env.APPDATA = root
      process.env.AGENT_BROWSER_BINARY = join(root, 'missing.exe')
      process.env.AGENT_BROWSER_EXECUTABLE_PATH = "C:\\Browser's Path\\browser.exe"
      process.env.SystemRoot = 'C:\\Windows'
      check(root)
    } finally {
      Object.defineProperty(process, 'platform', descriptor)
      for (const name of names) {
        if (previous[name] === undefined) delete process.env[name]
        else process.env[name] = previous[name]
      }
      rmSync(root, { recursive: true, force: true })
    }
  }

  test('uses a direct native executable on Windows when the installed agent-browser package provides one', () => {
    withLauncherFixture('win32', root => {
      const native = join(root, 'npm', 'node_modules', 'agent-browser', 'bin', 'agent-browser-win32-x64.exe')
      mkdirSync(join(root, 'npm', 'node_modules', 'agent-browser', 'bin'), { recursive: true })
      writeFileSync(native, '')
      expect(agentBrowserCommand('open', 'http://127.0.0.1')).toEqual([
        native, '--executable-path', "C:\\Browser's Path\\browser.exe", 'open', 'http://127.0.0.1',
      ])
    })
  })

  test('uses the quoted PowerShell shim when no Windows native package executable exists', () => {
    withLauncherFixture('win32', () => {
      expect(agentBrowserCommand('open', 'http://127.0.0.1')).toEqual([
        'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', '-NoProfile', '-Command',
        "& agent-browser.cmd '--executable-path' 'C:\\Browser''s Path\\browser.exe' 'open' 'http://127.0.0.1'",
      ])
    })
  })

  test('keeps the non-Windows executable and arguments independent of Windows package installation', () => {
    withLauncherFixture('linux', root => {
      const configured = join(root, 'configured.exe')
      writeFileSync(configured, '')
      process.env.AGENT_BROWSER_BINARY = configured
      expect(agentBrowserCommand('open', 'http://127.0.0.1')).toEqual([
        'agent-browser', '--executable-path', "C:\\Browser's Path\\browser.exe", 'open', 'http://127.0.0.1',
      ])
    })
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
