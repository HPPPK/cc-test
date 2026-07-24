#!/usr/bin/env bun
import { appendFileSync, mkdirSync, rmSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { agentBrowserCommand, desktopViteCommand } from './desktop-smoke/execute'
import { bunCommand } from './bunRuntime'

async function getPort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => typeof address === 'object' && address ? resolve(address.port) : reject(new Error('Could not allocate local port')))
    })
  })
}

async function waitForHttp(url: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try { if ((await fetch(url)).ok) return } catch {}
    await Bun.sleep(250)
  }
  throw new Error('Timed out waiting for ' + url)
}

async function run(command: string[], cwd: string, logPath: string, env: Record<string, string>, timeoutMs = 20_000) {
  const native = process.platform === 'win32' && command[0]?.toLowerCase().endsWith('agent-browser-win32-x64.exe')
  const full = native ? [command[0]!, '--session', env.AGENT_BROWSER_SESSION!, '--profile', env.AGENT_BROWSER_PROFILE!, ...command.slice(1)] : command
  appendFileSync(logPath, '\n$ ' + full.join(' ') + '\n')
  const capture = !native || full.includes('get')
  const proc = Bun.spawn(full, { cwd, env: { ...process.env, ...env }, stdout: capture ? 'pipe' : 'ignore', stderr: capture ? 'pipe' : 'ignore' })
  const result = capture
    ? Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited])
    : proc.exited.then((code) => ['', '', code] as const)
  const timeout = Bun.sleep(timeoutMs).then(() => { proc.kill(); throw new Error('Timed out: ' + full.join(' ')) })
  const [stdout, stderr, code] = await Promise.race([result, timeout])
  appendFileSync(logPath, stdout + stderr)
  if (code !== 0) throw new Error('Failed: ' + full.join(' '))
  return stdout + stderr
}

async function main() {
  const root = process.cwd()
  const artifactDir = join(root, 'artifacts', 'workflow-ask-browser-e2e', new Date().toISOString().replace(/[:.]/g, '-'))
  mkdirSync(artifactDir, { recursive: true })
  const logPath = join(artifactDir, 'browser.log')
  const workRoot = await mkdtemp(join(tmpdir(), 'workflow-ask-browser-e2e-'))
  const serverPort = await getPort()
  const vitePort = await getPort()
  const baseUrl = 'http://127.0.0.1:' + serverPort
  const appUrl = 'http://127.0.0.1:' + vitePort
  const browserEnv = { AGENT_BROWSER_SESSION: 'workflow-ask-' + Date.now(), AGENT_BROWSER_PROFILE: join(workRoot, 'browser-profile') }
  const server = Bun.spawn(bunCommand(['run', 'src/server/index.ts', '--host', '127.0.0.1', '--port', String(serverPort)]), { cwd: root, stdout: 'pipe', stderr: 'pipe', env: { ...process.env, CC_JIANGXIA_E2E_TEST_MODE: '1' } })
  const vite = Bun.spawn([...desktopViteCommand(), '--', '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort'], { cwd: join(root, 'desktop'), stdout: 'pipe', stderr: 'pipe', env: { ...process.env, VITE_DESKTOP_SERVER_URL: baseUrl } })
  try {
    await waitForHttp(baseUrl + '/health', 20_000)
    await waitForHttp(appUrl, 20_000)
    const created = await fetch(baseUrl + '/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workDir: root }) })
    if (!created.ok) throw new Error('Could not create E2E session: ' + await created.text())
    const { sessionId } = await created.json() as { sessionId: string }
    await run(agentBrowserCommand('open', appUrl), root, logPath, browserEnv)
    await run(agentBrowserCommand('wait', '1000'), root, logPath, browserEnv)
    const tabs = JSON.stringify({ openTabs: [{ sessionId, title: 'Workflow Ask E2E', type: 'session' }], activeTabId: sessionId })
    await run(agentBrowserCommand('eval', 'localStorage.setItem(' + JSON.stringify('cc-jiangxia-open-tabs') + ',' + JSON.stringify(tabs) + ')'), root, logPath, browserEnv)
    await run(agentBrowserCommand('reload'), root, logPath, browserEnv)
    await run(agentBrowserCommand('wait', 'textarea'), root, logPath, browserEnv)
    await run(agentBrowserCommand('wait', '--fn', 'document.body.innerText.includes(' + JSON.stringify(root) + ')'), root, logPath, browserEnv)
    const wsUrl = 'ws://127.0.0.1:' + serverPort + '/ws/' + encodeURIComponent(sessionId)
    const requestId = 'workflow-ask-e2e-request'
    const payload = { type: 'e2e_test_permission_request', requestId, toolUseId: 'workflow-ask-e2e-tool', input: { questions: [{ id: 'scope', header: 'Workflow E2E', question: 'Which scope should be used?', options: [{ id: 'current', label: 'Current scope' }, { id: 'expanded', label: 'Expanded scope' }] }] } }
    await run(agentBrowserCommand('eval', '(() => { const ws = window.__workflowAskE2eWs = new WebSocket(' + JSON.stringify(wsUrl) + '); ws.onopen = () => ws.send(' + JSON.stringify(JSON.stringify(payload)) + ') })()'), root, logPath, browserEnv)
    await run(agentBrowserCommand('wait', '--fn', 'document.body.innerText.includes("Which scope should be used?")'), root, logPath, browserEnv)
    await run(agentBrowserCommand('screenshot', join(artifactDir, 'question.png')), root, logPath, browserEnv)
    await run(agentBrowserCommand('eval', `(() => { const el = document.querySelector('[data-testid="ask-user-option-0-current"]'); el?.scrollIntoView({ block: 'center' }); el?.click() })()` ), root, logPath, browserEnv)
    await run(agentBrowserCommand('eval', `(() => { const el = document.querySelector('[data-testid="ask-user-submit"]'); el?.scrollIntoView({ block: 'center' }); el?.click() })()` ), root, logPath, browserEnv)
    const rejected = { type: 'e2e_test_permission_response_ack', requestId, status: 'rejected', message: 'The structured answer could not be delivered. Please choose again.' }
    await run(agentBrowserCommand('eval', '(() => { const ws = window.__workflowAskRejectedE2eWs = new WebSocket(' + JSON.stringify(wsUrl) + '); ws.onopen = () => ws.send(' + JSON.stringify(JSON.stringify(rejected)) + ') })()'), root, logPath, browserEnv)
    await run(agentBrowserCommand('wait', '--fn', 'document.querySelector("[role=alert]")?.textContent?.includes("could not be delivered")'), root, logPath, browserEnv)
    await run(agentBrowserCommand('screenshot', join(artifactDir, 'rejected-retryable.png')), root, logPath, browserEnv)
    await run(agentBrowserCommand('eval', `(() => { const el = document.querySelector('[data-testid="ask-user-option-0-current"]'); el?.scrollIntoView({ block: 'center' }); el?.click() })()` ), root, logPath, browserEnv)
    await run(agentBrowserCommand('eval', `(() => { const el = document.querySelector('[data-testid="ask-user-submit"]'); el?.scrollIntoView({ block: 'center' }); el?.click() })()` ), root, logPath, browserEnv)
    await run(agentBrowserCommand('wait', '--fn', 'document.querySelector("[data-testid=ask-user-submit]")?.disabled === true'), root, logPath, browserEnv)
    const stale = { type: 'e2e_test_permission_response_ack', requestId, status: 'stale', message: 'This workflow question has expired.' }
    await run(agentBrowserCommand('eval', 'window.__workflowAskE2eWs?.send(' + JSON.stringify(JSON.stringify(stale)) + ')'), root, logPath, browserEnv)
    await run(agentBrowserCommand('wait', '--fn', 'document.querySelector("[role=alert]")?.textContent?.includes("expired")'), root, logPath, browserEnv)
    const state = await run(agentBrowserCommand('get', 'text', '#content-area'), root, logPath, browserEnv)
    if (!state.includes('expired')) throw new Error('Stale acknowledgement was not rendered')
    await run(agentBrowserCommand('screenshot', join(artifactDir, 'stale-disabled.png')), root, logPath, browserEnv)
    console.log('Workflow AskUserQuestion browser E2E passed: ' + artifactDir)
  } finally {
    await run(agentBrowserCommand('close'), root, logPath, browserEnv).catch(() => undefined)
    if (process.platform === 'win32') {
      for (const proc of [server, vite]) await Bun.spawn(['taskkill', '/PID', String(proc.pid), '/T', '/F'], { stdout: 'ignore', stderr: 'ignore' }).exited
    } else { server.kill(); vite.kill() }
    rmSync(workRoot, { recursive: true, force: true })
  }
}

await main()
