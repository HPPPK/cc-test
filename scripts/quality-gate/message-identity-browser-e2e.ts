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
  const artifactDir = join(root, 'artifacts', 'message-identity', 'browser-' + Date.now())
  mkdirSync(artifactDir, { recursive: true })
  const logPath = join(artifactDir, 'browser.log')
  const workRoot = await mkdtemp(join(tmpdir(), 'message-kind-ui-'))
  const config = join(workRoot, 'config')
  const serverPort = await getPort(), vitePort = await getPort()
  const baseUrl = 'http://127.0.0.1:' + serverPort, appUrl = 'http://127.0.0.1:' + vitePort
  const browserEnv = { AGENT_BROWSER_SESSION: 'message-kind-' + Date.now(), AGENT_BROWSER_PROFILE: join(workRoot, 'browser-profile') }
  const server = Bun.spawn(bunCommand(['run', 'src/server/index.ts', '--host', '127.0.0.1', '--port', String(serverPort)]), { cwd: root, stdout: 'ignore', stderr: 'ignore', env: { ...process.env, CLAUDE_CONFIG_DIR: config } })
  const vite = Bun.spawn([...desktopViteCommand(), '--', '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort'], { cwd: join(root, 'desktop'), stdout: 'ignore', stderr: 'ignore', env: { ...process.env, VITE_DESKTOP_SERVER_URL: baseUrl } })
  const { readdir, readFile, writeFile } = await import('node:fs/promises')
  try {
    await waitForHttp(baseUrl + '/health', 60_000)
    await waitForHttp(appUrl, 20_000)
    const response = await fetch(baseUrl + '/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workDir: workRoot }) })
    if (!response.ok) throw new Error(await response.text())
    const { sessionId } = await response.json() as { sessionId: string }
    const dirs = await readdir(join(config, 'projects'))
    const transcript = join(config, 'projects', dirs[0]!, sessionId + '.jsonl')
    const base = { sessionId, cwd: workRoot, timestamp: new Date().toISOString() }
    const rows = [
      { ...base, uuid: 'human-initial', parentUuid: null, type: 'user', messageKind: 'user_input', message: { role: 'user', content: '真实输入老照片修复' } },
      { ...base, uuid: 'old-summary', parentUuid: 'human-initial', type: 'user', isCompactSummary: true, isVisibleInTranscriptOnly: true, message: { role: 'user', content: 'PRIVATE_SUMMARY_DO_NOT_RENDER' } },
      { ...base, uuid: 'notice', parentUuid: 'old-summary', type: 'user', messageKind: 'internal_notification', message: { role: 'user', content: 'PRIVATE_NOTIFICATION_DO_NOT_RENDER' } },
      { ...base, uuid: 'human-paste', parentUuid: 'notice', type: 'user', messageKind: 'user_input', message: { role: 'user', content: 'This session is being continued <task-notification>这是我粘贴的例子</task-notification>' } },
    ]
    appendFileSync(transcript, rows.map(row => JSON.stringify(row)).join('\n') + '\n')
    const original = await readFile(transcript, 'utf8')
    await run(agentBrowserCommand('open', appUrl), root, logPath, browserEnv, 60_000)
    const tabs = JSON.stringify({ openTabs: [{ sessionId, title: '消息身份回归', type: 'session' }], activeTabId: sessionId })
    await run(agentBrowserCommand('eval', 'localStorage.setItem("cc-jiangxia-open-tabs",' + JSON.stringify(tabs) + ')'), root, logPath, browserEnv)
    for (let pass = 0; pass < 2; pass++) {
      await run(agentBrowserCommand('reload'), root, logPath, browserEnv)
      await run(agentBrowserCommand('wait', '--fn', 'document.body.innerText.includes("上下文已整理") && document.body.innerText.includes("这是我粘贴的例子")'), root, logPath, browserEnv)
      const result = await run(agentBrowserCommand('eval', 'JSON.stringify({hasSummary:document.body.innerText.includes("PRIVATE_SUMMARY_DO_NOT_RENDER"),hasNotice:document.body.innerText.includes("PRIVATE_NOTIFICATION_DO_NOT_RENDER"),hasHuman:document.body.innerText.includes("真实输入老照片修复"),hasPaste:document.body.innerText.includes("这是我粘贴的例子")})'), root, logPath, browserEnv)
      if (result.includes('hasSummary\\":true') || result.includes('hasNotice\\":true') || !result.includes('true')) throw new Error('Invalid rendered provenance projection: ' + result)
      await run(agentBrowserCommand('wait', '--fn', '!document.body.innerText.includes("PRIVATE_SUMMARY_DO_NOT_RENDER") && !document.body.innerText.includes("PRIVATE_NOTIFICATION_DO_NOT_RENDER") && document.body.innerText.includes("真实输入老照片修复")'), root, logPath, browserEnv)
    }
    await run(agentBrowserCommand('screenshot', join(artifactDir, 'reopened.png')), root, logPath, browserEnv)
    if (await readFile(transcript, 'utf8') !== original) throw new Error('Reading/reopening mutated transcript')
    await writeFile(join(artifactDir, 'result.json'), JSON.stringify({ passed: true, checks: ['isolated API JSONL load', 'two full page reloads', 'legacy summary status', 'internal notice hidden', 'human pasted summary visible', 'original transcript bytes preserved'] }, null, 2))
    console.log(artifactDir)
  } finally {
    await run(agentBrowserCommand('close'), root, logPath, browserEnv).catch(() => {})
    server.kill(); vite.kill()
    rmSync(workRoot, { recursive: true, force: true })
  }
}
await main()
