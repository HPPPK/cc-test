import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { changedFiles, cleanupBaselineWorkRoot, writeDiffPatch } from '../baseline/execute'
import type { BaselineTarget, LaneResult } from '../types'
import { bunCommand } from '../bunRuntime'

const FIXTURE = 'scripts/quality-gate/desktop-smoke/fixtures/chat-edit'
const PROMPT = [
  'Run the tests in this project, fix the failing greeting implementation, and rerun the tests.',
  'Only edit src/greeting.ts. Do not edit package.json or tests.',
  'When the tests pass, briefly say done.',
].join(' ')

export function resolveDesktopSmokeRuntimeSelection(target: BaselineTarget | undefined) {
  if (!target) return null
  if (!target.providerId && target.modelId === 'current' && target.label === 'current-runtime') {
    return null
  }
  return {
    providerId: target.providerId ?? null,
    modelId: target.modelId,
  }
}

export function desktopViteCommand() {
  return bunCommand(['run', 'dev'])
}

export function normalizeDesktopSmokeChangedFiles(changed: string[]): string[] {
  return changed.map((file) => file.replaceAll('\\', '/'))
}

function nativeAgentBrowserPath() {
  if (process.platform !== 'win32') return null
  const configured = process.env.AGENT_BROWSER_BINARY
  if (configured && existsSync(configured)) return configured
  const appData = process.env.APPDATA
  if (!appData) return null
  const candidate = join(appData, 'npm', 'node_modules', 'agent-browser', 'bin', 'agent-browser-win32-x64.exe')
  return existsSync(candidate) ? candidate : null
}

function quotePowerShellArgument(value: string) {
  return "'" + value.replace(/'/g, "''") + "'"
}

export function agentBrowserCommand(...args: string[]) {
  const executablePath = process.env.AGENT_BROWSER_EXECUTABLE_PATH
  const browserArgs = executablePath
    ? ['--executable-path', executablePath, ...args]
    : args
  const nativeBinary = nativeAgentBrowserPath()
  if (nativeBinary) return [nativeBinary, ...browserArgs]
  if (process.platform === 'win32') {
    const powerShell = process.env.SystemRoot
      ? process.env.SystemRoot + '\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
      : 'powershell.exe'
    const command = '& agent-browser.cmd ' + browserArgs.map(quotePowerShellArgument).join(' ')
    return [powerShell, '-NoProfile', '-Command', command]
  }
  return ['agent-browser', ...browserArgs]
}

async function getPort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to allocate a local port')))
        return
      }
      const port = address.port
      server.close(() => resolve(port))
    })
  })
}

async function pipeToFile(stream: ReadableStream<Uint8Array> | null, path: string) {
  if (!stream) return
  const reader = stream.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    appendFileSync(path, Buffer.from(value))
  }
}

async function terminateSmokeProcessTree(pid: number): Promise<void> {
  if (process.platform !== 'win32') return
  const taskkill = Bun.spawn(['taskkill', '/PID', String(pid), '/T', '/F'], {
    stdout: 'ignore',
    stderr: 'ignore',
  })
  await taskkill.exited
}

async function waitForHttp(url: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  let lastError = ''
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
      lastError = `HTTP ${response.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await Bun.sleep(500)
  }
  throw new Error(`Timed out waiting for ${url}${lastError ? ` (${lastError})` : ''}`)
}

function withAgentBrowserIsolation(command: string[], env?: Record<string, string>): string[] {
  const executable = command[0]?.toLowerCase() ?? ''
  if (!executable.includes('agent-browser')) return command
  const session = env?.AGENT_BROWSER_SESSION
  const profile = env?.AGENT_BROWSER_PROFILE
  return [
    command[0]!,
    ...(session ? ['--session', session] : []),
    ...(profile ? ['--profile', profile] : []),
    ...command.slice(1),
  ]
}

async function runLoggedCommand(
  command: string[],
  options: {
    cwd: string
    logPath: string
    env?: Record<string, string>
    timeoutMs?: number
    allowFailure?: boolean
    maxLogChars?: number
  },
) {
  const effectiveCommand = withAgentBrowserIsolation(command, options.env)
  appendFileSync(options.logPath, `\n$ ${effectiveCommand.join(' ')}\n`)
  // The Windows native agent-browser daemon inherits stdout/stderr. Capturing those
  // pipes keeps Bun alive after the CLI itself exits, so do not pipe its output.
  const nativeAgentBrowser = process.platform === 'win32'
    && effectiveCommand[0]?.toLowerCase().endsWith('agent-browser-win32-x64.exe')
  // The native launcher detaches its inherited pipes for navigation commands,
  // but read commands must retain stdout or the smoke cannot detect a rendered
  // API/CLI failure and will wait for the full project-verification timeout.
  const capturesBrowserOutput = !nativeAgentBrowser || effectiveCommand.includes('get')
  const proc = Bun.spawn(effectiveCommand, {
    cwd: options.cwd,
    env: options.env ? { ...process.env, ...options.env } : process.env,
    stdout: capturesBrowserOutput ? 'pipe' : 'ignore',
    stderr: capturesBrowserOutput ? 'pipe' : 'ignore',
  })

  const outputPromise = capturesBrowserOutput
    ? Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])
    : proc.exited.then((exitCode) => ['', '', exitCode] as const)
  const timeout = options.timeoutMs
    ? Bun.sleep(options.timeoutMs).then(() => {
      proc.kill()
      throw new Error(`Command timed out after ${options.timeoutMs}ms: ${effectiveCommand.join(' ')}`)
    })
    : null

  const [stdout, stderr, exitCode] = timeout
    ? await Promise.race([outputPromise, timeout])
    : await outputPromise
  const output = `${stdout}${stderr}`
  appendFileSync(
    options.logPath,
    options.maxLogChars && output.length > options.maxLogChars
      ? `${output.slice(0, options.maxLogChars)}\n[quality-gate] output truncated at ${options.maxLogChars} chars\n`
      : output,
  )

  if (exitCode !== 0 && !options.allowFailure) {
    throw new Error(`Command failed (${exitCode}): ${command.join(' ')}`)
  }

  return { stdout, stderr, exitCode }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  if (!response.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${url} failed with HTTP ${response.status}: ${await response.text()}`)
  }
  return response.json() as Promise<T>
}

async function setPermissionMode(baseUrl: string, mode: string) {
  await fetchJson<{ ok: true; mode: string }>(`${baseUrl}/api/permissions/mode`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  })
}

async function waitForVerifiedProject(
  browserEnv: Record<string, string>,
  browserLogPath: string,
  rootDir: string,
  originalDir: string,
  projectDir: string,
  artifactDir: string,
  timeoutMs: number,
) {
  const deadline = Date.now() + timeoutMs
  let lastVerificationError = 'project verification has not run yet'
  while (Date.now() < deadline) {
    const body = await runLoggedCommand(agentBrowserCommand('get', 'text', '#content-area'), {
      cwd: rootDir,
      env: browserEnv,
      logPath: browserLogPath,
      timeoutMs: 15_000,
      allowFailure: true,
      maxLogChars: 4_000,
    })
    const browserText = `${body.stdout}\n${body.stderr}`

    if (browserText.includes('CLI_START_FAILED') || browserText.includes('CLI_RESTART_FAILED')) {
      throw new Error('Desktop session reported a CLI startup failure')
    }
    if (
      browserText.includes('API Error: 429') ||
      browserText.includes('AccountQuotaExceeded') ||
      browserText.includes('TooManyRequests')
    ) {
      throw new Error('Desktop session reported provider quota/rate-limit failure')
    }
    if (browserText.includes('处理过程中发生错误') || browserText.includes('API Error:')) {
      throw new Error('Desktop session reported an API error')
    }

    try {
      await verifyProject(originalDir, projectDir, artifactDir)
      return
    } catch (error) {
      lastVerificationError = error instanceof Error ? error.message : String(error)
    }
    await Bun.sleep(5_000)
  }

  throw new Error(`Timed out waiting for desktop project verification: ${lastVerificationError}`)
}

async function verifyProject(originalDir: string, projectDir: string, artifactDir: string) {
  await writeDiffPatch(originalDir, projectDir, join(artifactDir, 'diff.patch'))
  const changed = normalizeDesktopSmokeChangedFiles(changedFiles(originalDir, projectDir))
  const unexpected = changed.filter((file) => file !== 'src/greeting.ts')
  if (unexpected.length > 0) {
    throw new Error(`desktop smoke changed unexpected files: ${unexpected.join(', ')}`)
  }
  if (!changed.includes('src/greeting.ts')) {
    throw new Error('desktop smoke did not change src/greeting.ts')
  }

  const implementation = readFileSync(join(projectDir, 'src/greeting.ts'), 'utf8')
  if (!implementation.includes('from desktop smoke!')) {
    throw new Error('desktop smoke implementation is missing the expected marker text')
  }

  const proc = Bun.spawn(bunCommand(['test']), {
    cwd: projectDir,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  const exitCode = await proc.exited
  writeFileSync(join(artifactDir, 'verification.log'), `${stdout}${stderr}`)
  if (exitCode !== 0) {
    throw new Error(`desktop smoke verification failed with exit code ${exitCode}`)
  }
}

export async function executeDesktopSmoke(
  rootDir: string,
  artifactDir: string,
  resultId: string,
  resultTitle: string,
  target: BaselineTarget | undefined,
): Promise<LaneResult> {
  const started = Date.now()
  mkdirSync(artifactDir, { recursive: true })

  const serverLogPath = join(artifactDir, 'server.log')
  const viteLogPath = join(artifactDir, 'vite.log')
  const browserLogPath = join(artifactDir, 'browser.log')
  const workRoot = await mkdtemp(join(tmpdir(), 'quality-gate-desktop-smoke-'))
  const originalDir = join(workRoot, 'original')
  const projectDir = join(workRoot, 'project')
  const browserProfileDir = join(workRoot, 'browser-profile')
  cpSync(join(rootDir, FIXTURE), originalDir, { recursive: true })
  cpSync(join(rootDir, FIXTURE), projectDir, { recursive: true })

  const serverPort = await getPort()
  const vitePort = await getPort()
  const baseUrl = `http://127.0.0.1:${serverPort}`
  const appUrl = `http://127.0.0.1:${vitePort}`
  const sessionName = `quality-gate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const browserEnv = {
    AGENT_BROWSER_SESSION: sessionName,
    AGENT_BROWSER_PROFILE: browserProfileDir,
  }

  const server = Bun.spawn(bunCommand(['run', 'src/server/index.ts', '--host', '127.0.0.1', '--port', String(serverPort)]), {
    cwd: rootDir,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  void pipeToFile(server.stdout, serverLogPath)
  void pipeToFile(server.stderr, serverLogPath)

  const vite = Bun.spawn([...desktopViteCommand(), '--', '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort'], {
    cwd: join(rootDir, 'desktop'),
    env: {
      ...process.env,
      VITE_DESKTOP_SERVER_URL: baseUrl,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  void pipeToFile(vite.stdout, viteLogPath)
  void pipeToFile(vite.stderr, viteLogPath)

  let previousPermissionMode: string | null = null
  try {
    await waitForHttp(`${baseUrl}/health`, 20_000)
    await waitForHttp(appUrl, 30_000)

    const permission = await fetchJson<{ mode: string }>(`${baseUrl}/api/permissions/mode`)
    previousPermissionMode = permission.mode
    await setPermissionMode(baseUrl, 'bypassPermissions')

    const session = await fetchJson<{ sessionId: string }>(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workDir: projectDir }),
    })
    const runtimeSelection = resolveDesktopSmokeRuntimeSelection(target)
    writeFileSync(join(artifactDir, 'runtime-selection.json'), JSON.stringify(runtimeSelection
      ? { source: 'explicit-target', ...runtimeSelection }
      : { source: 'default-runtime' }, null, 2) + '\n')

    await runLoggedCommand(agentBrowserCommand('open', appUrl), {
      cwd: rootDir,
      env: browserEnv,
      logPath: browserLogPath,
      timeoutMs: 30_000,
    })
    // Let the first AppShell boot finish before replacing its persisted tab
    // state. Otherwise its asynchronous restore can overwrite the smoke tab
    // and send the test prompt to a stale, cleaned-up session.
    await runLoggedCommand(agentBrowserCommand('wait', '1500'), {
      cwd: rootDir,
      env: browserEnv,
      logPath: browserLogPath,
      timeoutMs: 10_000,
    })
    const browserSetup = [
      `localStorage.setItem('cc-jiangxia-open-tabs', ${JSON.stringify(JSON.stringify({
        openTabs: [{ sessionId: session.sessionId, title: 'Desktop Smoke', type: 'session' }],
        activeTabId: session.sessionId,
      }))})`,
      runtimeSelection
        ? `localStorage.setItem('cc-jiangxia-session-runtime', ${JSON.stringify(JSON.stringify({
          [session.sessionId]: runtimeSelection,
        }))})`
        : `localStorage.removeItem('cc-jiangxia-session-runtime')`,
      `localStorage.removeItem('cc-haha-open-tabs')`,
      `localStorage.removeItem('cc-haha-session-runtime')`,
    ]
    await runLoggedCommand(agentBrowserCommand('eval', browserSetup.join(';')), {
      cwd: rootDir,
      env: browserEnv,
      logPath: browserLogPath,
      timeoutMs: 15_000,
    })
    await runLoggedCommand(agentBrowserCommand('reload'), {
      cwd: rootDir,
      env: browserEnv,
      logPath: browserLogPath,
      timeoutMs: 30_000,
    })
    // AppShell restores persisted tabs asynchronously after the initial shell is
    // interactive. Wait for that restoration before targeting the chat input.
    await runLoggedCommand(agentBrowserCommand('wait', '1500'), {
      cwd: rootDir,
      env: browserEnv,
      logPath: browserLogPath,
      timeoutMs: 10_000,
    })
    await runLoggedCommand(agentBrowserCommand('wait', 'textarea'), {
      cwd: rootDir,
      env: browserEnv,
      logPath: browserLogPath,
      timeoutMs: 30_000,
    })
    await runLoggedCommand(agentBrowserCommand(
      'wait',
      '--fn',
      `document.body.innerText.includes(${JSON.stringify(projectDir)})`,
    ), {
      cwd: rootDir,
      env: browserEnv,
      logPath: browserLogPath,
      timeoutMs: 30_000,
    })
    await runLoggedCommand(agentBrowserCommand('screenshot', join(artifactDir, 'initial.png')), {
      cwd: rootDir,
      env: browserEnv,
      logPath: browserLogPath,
      timeoutMs: 20_000,
      allowFailure: true,
    })
    await runLoggedCommand(agentBrowserCommand('fill', 'textarea', PROMPT), {
      cwd: rootDir,
      env: browserEnv,
      logPath: browserLogPath,
      timeoutMs: 20_000,
    })
    await runLoggedCommand(agentBrowserCommand(
      'wait',
      '--fn',
      "!!document.querySelector('[data-testid=\"chat-submit-button\"]:not([disabled])')",
    ), {
      cwd: rootDir,
      env: browserEnv,
      logPath: browserLogPath,
      timeoutMs: 30_000,
    })
    await runLoggedCommand(agentBrowserCommand(
      'click',
      '[data-testid="chat-submit-button"]:not([disabled])',
    ), {
      cwd: rootDir,
      env: browserEnv,
      logPath: browserLogPath,
      timeoutMs: 15_000,
    })

    await waitForVerifiedProject(
      browserEnv,
      browserLogPath,
      rootDir,
      originalDir,
      projectDir,
      artifactDir,
      360_000,
    )
    await runLoggedCommand(agentBrowserCommand('screenshot', join(artifactDir, 'final.png')), {
      cwd: rootDir,
      env: browserEnv,
      logPath: browserLogPath,
      timeoutMs: 20_000,
      allowFailure: true,
    })

    return {
      id: resultId,
      title: resultTitle,
      status: 'passed',
      durationMs: Date.now() - started,
      artifactDir,
    }
  } catch (error) {
    return {
      id: resultId,
      title: resultTitle,
      status: 'failed',
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
      artifactDir,
    }
  } finally {
    if (previousPermissionMode) {
      await setPermissionMode(baseUrl, previousPermissionMode).catch((error) => {
        appendFileSync(serverLogPath, `\n[quality-gate] Failed to restore permission mode: ${error instanceof Error ? error.message : String(error)}\n`)
      })
    }
    await runLoggedCommand(agentBrowserCommand('close'), {
      cwd: rootDir,
      env: browserEnv,
      logPath: browserLogPath,
      timeoutMs: 10_000,
      allowFailure: true,
    }).catch(() => {})
    if (process.platform === 'win32') {
      await Promise.all([
        terminateSmokeProcessTree(server.pid),
        terminateSmokeProcessTree(vite.pid),
      ])
    } else {
      server.kill()
      vite.kill()
    }
    await cleanupBaselineWorkRoot(workRoot, serverLogPath)
  }
}
