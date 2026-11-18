import { chromium, expect } from 'playwright/test'
import { existsSync, mkdirSync, openSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'

// Real production component and HTTP fixtures; no model or user storage access.
const root = process.cwd()
const output = join(root, 'artifacts/quality-runs/workflow-timeline-smoke')
mkdirSync(output, { recursive: true })
const dist = resolve(output, 'fixture-dist')
const server = createServer(async (request, response) => {
  const file = resolve(dist, '.' + new URL(request.url ?? '/', 'http://localhost').pathname)
  if (!file.startsWith(dist + sep)) { response.writeHead(403).end(); return }
  try {
    const content = await readFile(file)
    const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' }
    response.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' }).end(content)
  } catch { response.writeHead(404).end() }
})
await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
const port = (server.address() as { port: number }).port
const base = `http://127.0.0.1:${port}`
const build = spawn('node', ['node_modules/vite/bin/vite.js', 'build', '--config', 'scripts/workflow-timeline-vite.config.ts'], {
  cwd: join(root, 'desktop'), env: { ...process.env, VITE_DESKTOP_SERVER_URL: base },
  stdio: ['ignore', openSync(join(output, 'vite.log'), 'w'), openSync(join(output, 'vite-errors.log'), 'w')],
  windowsHide: true,
})
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
try {
  const code = await new Promise<number | null>((done, reject) => { build.once('exit', done); build.once('error', reject) })
  if (code !== 0) throw new Error('Timeline fixture build failed; see vite-errors.log')
  console.log('[timeline-smoke] fixture ready')
  const installed = join(homedir(), 'AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe')
  browser = await chromium.launch({ headless: true, ...(existsSync(installed) ? { executablePath: installed } : {}), args: ['--disable-gpu', '--disable-features=CalculateNativeWinOcclusion'] })
  console.log('[timeline-smoke] browser ready')
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
  page.setDefaultTimeout(20_000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  let finished = false
  let offline = false
  const startedAt = Date.now() - 4_000
  const start = { id: 'start', at: new Date(startedAt).toISOString(), kind: 'tool-start', summary: 'Bash', detail: 'bun test', toolName: 'Bash', toolUseId: 't1', phaseId: 'implement', status: 'running', source: 'live' }
  await page.route('**/api/sessions/*/workflow/timeline*', async route => {
    if (offline) { await route.abort(); return }
    const older = route.request().url().includes('before=')
    const events = older ? [{ ...start, id: 'older', kind: 'phase', summary: '需求阶段已完成', at: new Date(startedAt - 60_000).toISOString() }]
      : [start, ...(finished ? [
        { ...start, id: 'result', kind: 'tool-result', summary: '工具返回结果', detail: '12 tests passed', status: 'succeeded', at: new Date(startedAt + 2_000).toISOString() },
        { ...start, id: 'error', kind: 'error', summary: 'PROVIDER_TIMEOUT', detail: '等待模型响应超时', status: 'failed', at: new Date(startedAt + 3_000).toISOString() },
      ] : [])]
    await route.fulfill({ json: { events, hasMore: !older, historySource: 'mixed', warnings: [], updatedAt: new Date().toISOString() } })
  })
  await page.goto(base + '/scripts/workflow-timeline-fixture.html', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: '执行时间线' }).click({ noWaitAfter: true })
  await expect(page.getByText('Bash', { exact: true })).toBeVisible()
  await page.getByText('查看调用参数', { exact: true }).click({ noWaitAfter: true })
  await expect(page.getByText('bun test', { exact: true })).toBeVisible()
  finished = true
  await expect(page.getByText('PROVIDER_TIMEOUT', { exact: true })).toBeVisible({ timeout: 15_000 })
  await page.getByText('查看返回结果', { exact: true }).click({ noWaitAfter: true })
  await expect(page.getByText('12 tests passed', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '加载更早记录' }).click({ noWaitAfter: true })
  await expect(page.getByText('需求阶段已完成', { exact: true })).toBeVisible()
  await page.getByLabel('筛选执行事件').selectOption('problems')
  await expect(page.getByText('需求阶段已完成', { exact: true })).toHaveCount(0)
  await expect(page.getByText('PROVIDER_TIMEOUT', { exact: true })).toBeVisible()
  await page.getByLabel('筛选执行事件').selectOption('all')
  offline = true
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('需求阶段已完成', { exact: true })).toBeVisible()
  offline = false
  await expect(page.getByRole('alert')).toHaveCount(0, { timeout: 15_000 })
  await page.screenshot({ path: join(output, 'timeline.png'), fullPage: true, timeout: 30_000 })
  await page.getByRole('button', { name: 'Close dialog' }).click({ noWaitAfter: true })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByRole('button', { name: '执行时间线' }).click({ noWaitAfter: true })
  await expect(page.getByText('PROVIDER_TIMEOUT', { exact: true })).toBeVisible()
  if (errors.length) throw new Error(errors.join('\n'))
  const report = { passed: true, checks: ['tool input and result expansion', 'live polling', 'older history', 'problem filter', 'network interruption retains history', 'reload', 'dialog close'], screenshot: join(output, 'timeline.png') }
  writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
} finally {
  await browser?.close()
  build.kill()
  server.closeAllConnections()
  await new Promise<void>(done => server.close(() => done()))
}
