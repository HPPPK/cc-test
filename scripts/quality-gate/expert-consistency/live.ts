import * as fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
const repo = path.resolve(import.meta.dir, '../../..')
const out = process.env.EXPERT_CONSISTENCY_OUT || path.join(repo, 'artifacts/expert-consistency-20260917')
await fs.mkdir(out, { recursive: true })
const { evaluateLiveEvidence, redact, selectFlash, answerFixtureQuestion } = await import('./evidence.js')
const originalHome = os.homedir()
const saved = JSON.parse(await fs.readFile(path.join(originalHome, '.claude/cc-jiangxia/providers.json'), 'utf8'))
const selected = selectFlash(saved.providers.map((p: any) => ({ id: p.id, model: p.models?.main, smallFastModel: p.models?.haiku })), saved.activeId)
const provider = saved.providers.find((p: any) => p.id === selected?.providerId)
if (!provider?.apiKey) { await fs.writeFile(path.join(out, 'live-smoke-summary.json'), JSON.stringify({ status: 'blocked', reason: 'No configured DeepSeek Flash credentials', passed: false })); process.exit(2) }
const resume = process.argv.includes('--resume-owned') ? JSON.parse(await fs.readFile(path.join(out, 'live-smoke-summary.json'), 'utf8')) : undefined
if (resume && (!path.resolve(resume.temp).startsWith(path.resolve(os.tmpdir()) + path.sep + 'jiangxia-expert-startup-smoke-') || !resume.sessionId || (resume.resumeCount || 0) >= 2 || Date.now() - Date.parse(resume.startedAt) > 15 * 60 * 1000)) throw new Error('Owned session missing, expired, or outside test root')
if (resume) await fs.copyFile(path.join(out, 'live-smoke-summary.json'), path.join(out, 'live-attempt-' + (resume.resumeCount || 0) + '.json'))
const temp = resume?.temp || await fs.mkdtemp(path.join(os.tmpdir(), 'jiangxia-expert-startup-smoke-'))
const config = path.join(temp, 'config'), workDir = path.join(temp, 'work')
await fs.mkdir(path.join(config, 'cc-jiangxia'), { recursive: true })
await fs.mkdir(workDir, { recursive: true })
await fs.mkdir(path.join(temp, 'home'), { recursive: true })
await fs.writeFile(path.join(config, 'cc-jiangxia/providers.json'), JSON.stringify({ ...saved, activeId: provider.id, providers: [{ ...provider, models: Object.fromEntries(Object.keys(provider.models).map(k => [k, 'deepseek-v4-flash'])) }] }), { mode: 0o600 })
process.on('exit', () => { try { require('node:fs').rmSync(path.join(config, 'cc-jiangxia/providers.json'), { force: true }) } catch {} })
await fs.writeFile(path.join(config, 'settings.json'), JSON.stringify({ permissionMode: 'default', alwaysThinkingEnabled: false }))
process.env.CLAUDE_CONFIG_DIR = config
process.env.HOME = path.join(temp, 'home')
process.env.USERPROFILE = path.join(temp, 'home')
delete process.env.CLAUDE_CLI_PATH
delete process.env.CLAUDE_APP_ROOT
process.env.CLAUDE_BROWSER_RUNTIME_DIR = path.join(repo, 'desktop/src-tauri/binaries/browser-runtime/playwright')
const nodeRoot = path.join(repo, 'desktop/src-tauri/binaries/node-runtime')
const nodeDirs = await fs.readdir(nodeRoot)
const nodeCandidates = await Promise.all(nodeDirs.map(async (d: string) => { const p = path.join(nodeRoot, d, 'node.exe'); return await fs.stat(p).then(() => p).catch(() => undefined) }))
const bundledNode = nodeCandidates.find(Boolean)
if (bundledNode) process.env.CLAUDE_BUNDLED_NODE_EXECUTABLE = bundledNode
process.env.CLAUDE_EXPERT_PACKS_DIR = path.join(repo, 'src/server/packs/experts')
const load = (p: string) => import(pathToFileURL(path.join(repo, p)).href)
const { startServer } = await load('src/server/index.ts')
const { sessionService } = await load('src/server/services/sessionService.ts')
const { conversationService } = await load('src/server/services/conversationService.ts')
const { ExpertPackRegistryService } = await load('src/server/services/expertPackRegistryService.ts')
const { ExpertSessionService } = await load('src/server/services/expertSessionService.ts')
const { getExpertProcessBindingKey } = await load('src/server/services/expertRuntimeBindingService.ts')
const { ZipPackAdapter } = await load('src/server/services/zipPackAdapter.ts')
let server: any, ws: WebSocket | undefined, id: string | undefined
const summary: any = { model: 'deepseek-v4-flash', provider: provider.name, startedAt: resume?.startedAt || new Date().toISOString(), resumedSameSession: Boolean(resume), resumeCount: resume ? (resume.resumeCount || 0) + 1 : 0, temp, milestones: {}, tools: [], errors: [] }
const timeline: any[] = []
const hash = (s: string | Uint8Array) => createHash('sha256').update(s).digest('hex')
let finish!: (reason: string) => void
const finished = new Promise<string>(resolve => { finish = resolve })
const toolNames = new Map<string, string>()
const toolInputs = new Map<string, any>()
const evidence = { asked: false, answerMatched: false, briefSaved: false, agentStarted: false, bindingMatched: false, sourcePackageMatched: false, pages: [] as any[] }
const expectedAnswer = '拟开发新品；Quicker 仅作为参照竞品，面向桌面重复操作的效率工具。国内与海外市场都覆盖，使用公开资料。'
const answeredRequests = new Set<string>()
let timeout: ReturnType<typeof setTimeout> | undefined
let probe: ReturnType<typeof setInterval> | undefined
process.on('SIGTERM', () => finish('test-interrupted'))
process.on('SIGINT', () => finish('test-interrupted'))
try {
  const zipBytes = await fs.readFile(path.join(repo, 'src/server/packs/experts/commercialization-research-report.zip'))
  await new ExpertPackRegistryService().importExpertPackZip(zipBytes)
  const zip = await new ZipPackAdapter().read(zipBytes)
  const sourcePrompt = await fs.readFile(path.join(repo, 'experts/commercialization-research-report/prompts/system.md'), 'utf8')
  const zipPrompt = await zip.readText('experts/commercialization-research-report/prompts/system.md')
  summary.sourceZipPromptMatch = sourcePrompt.trim() === zipPrompt.trim()
  summary.zipSha256 = hash(zipBytes)
  // startServer expects a real port when constructing SDK/proxy endpoints.
  const { createServer } = await import('node:net')
  const reservation = createServer()
  await new Promise<void>(resolve => reservation.listen(0, '127.0.0.1', resolve))
  const selectedPort = (reservation.address() as { port: number }).port
  await new Promise<void>((resolve, reject) => reservation.close(err => err ? reject(err) : resolve()))
  server = startServer(selectedPort, '127.0.0.1')
  summary.port = server.port
  const created = resume ? { sessionId: resume.sessionId } : await sessionService.createSession(workDir)
  id = created.sessionId
  summary.sessionId = id
  await sessionService.appendSessionMetadata(id, { workDir, customTitle: 'Isolated Expert startup smoke' })
  process.env.CC_JIANGXIA_EXPERT_SESSION_ID = id
  process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = 'http://127.0.0.1:' + server.port
  ws = new WebSocket('ws://127.0.0.1:' + server.port + '/ws/' + id)
  await new Promise<void>((resolve, reject) => { ws!.onopen = () => resolve(); ws!.onerror = () => reject(new Error('smoke websocket failed')) })
  ws.onmessage = event => {
    const m = JSON.parse(String(event.data))
    if (['tool_use_complete', 'tool_result', 'permission_request', 'error', 'message_complete'].includes(m.type)) console.log('SMOKE_EVENT ' + JSON.stringify({ type: m.type, tool: m.toolName, at: new Date().toISOString() }))
    if (m.type === 'tool_use_complete') {
      toolNames.set(m.toolUseId, m.toolName)
      toolInputs.set(m.toolUseId, m.input)
      summary.tools.push({ name: m.toolName, parent: m.parentToolUseId ?? null, at: new Date().toISOString() })
      timeline.push({ type: m.type, name: m.toolName, toolUseId: m.toolUseId, input: m.input })
      if (m.toolName === 'Agent') { summary.milestones.agent = true }
      if (m.toolName === 'Playwright') summary.milestones.playwrightCall = true
    }
    if (m.type === 'permission_request') {
      if (m.toolName === 'AskUserQuestion') {
        summary.milestones.ask = true; evidence.asked = true
        if (answeredRequests.has(m.requestId)) return
        const input = m.input as any
        const answers: Record<string, string> = {}
        for (const q of input.questions ?? []) {
          const response = answerFixtureQuestion(q)
          if (!response) {
            summary.errors.push({ type: 'unexpected_question', input }); finish('unexpected-question-needs-review'); return
          }
          answers[q.question ?? q.prompt ?? q.id] = response
        }
        if (!Object.keys(answers).length) { finish('empty-question'); return }
        answeredRequests.add(m.requestId); evidence.answerMatched = true
        timeline.push({ type: 'question', input, answers })
        ws!.send(JSON.stringify({ type: 'permission_response', requestId: m.requestId, allowed: true, updatedInput: { ...input, answers } }))
      } else {
        const allowed = ['Read', 'Write', 'Edit', 'Agent', 'Playwright', 'TaskCreate', 'TaskList', 'TaskGet', 'TaskUpdate', 'TaskOutput', 'Glob', 'Grep', 'LS'].includes(m.toolName)
        ws!.send(JSON.stringify({ type: 'permission_response', requestId: m.requestId, allowed }))
        if (!allowed) summary.errors.push({ type: 'fixture_permission_not_granted', tool: m.toolName })
      }
    }
    if (m.type === 'tool_result') {
      const name = toolNames.get(m.toolUseId)
      timeline.push({ type: m.type, name, isError: m.isError, content: m.content })
      if (m.isError) summary.errors.push({ type: 'tool_error', tool: name, content: m.content })
      if (name === 'Playwright' && !m.isError) {
         summary.milestones.playwrightResult = true
         const raw = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
         let ledger: any
         try { ledger = JSON.parse(raw) } catch { try { ledger = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}')+1)) } catch {} }
         const call = toolInputs.get(m.toolUseId)
         const extracted = Boolean(call?.actions?.some((a: any) => a.type === 'extract') || ledger?.steps?.some((s: any) => s.type === 'extract' && s.outcome === 'success'))
         if (ledger?.url) evidence.pages.push({ url:ledger.url, text:ledger.text || '', toolUseId:m.toolUseId, audited:false, extracted, accessLimited:ledger.accessLimited, isError:Boolean(ledger.error) })
       }
    }
    if (m.type === 'error') { summary.errors.push(m); finish(/401|402|403|429|余额|balance|quota|authentication|unavailable|503/i.test(JSON.stringify(m)) ? 'provider-blocked' : 'runtime-error') }
    if (m.type === 'message_complete') timeline.push({ type: m.type, at: new Date().toISOString() })
  }
  // Exercise the real HTTP-service/WS interleave without advancing any user session.
  ws.send(JSON.stringify({ type: 'prewarm_session' }))
  await new Promise(resolve => setTimeout(resolve, 150))
  ws.send(JSON.stringify({ type: 'set_runtime_config', providerId: provider.id, modelId: 'deepseek-v4-flash' }))
  const expert = await new ExpertSessionService().enterExpertMode(id, 'commercialization-research-report')
  summary.expert = { id: expert.expertId, version: expert.packVersion, outputMode: expert.runtimeBinding.outputMode }
  ws.send(JSON.stringify({ type: 'user_message', content: (resume ? '刚才本测试连接在回答前中断，请通过 AskUserQuestion 重新发出必要的产品澄清卡。' : '') + '调研 Quicker 这类鼠标中键效率工具；但我还没明确要以现有 Quicker 还是我计划开发的新品为研究对象。请先问清这一点，再按专家流程执行。' }))
  timeout = setTimeout(() => finish('fifteen-minute-timeout'), Math.max(1, 15 * 60 * 1000 - (Date.now() - Date.parse(summary.startedAt))))
  let probing = false
   probe = setInterval(async () => {
    if (!id || probing) return
    probing = true
    try {
    const process = (conversationService as any).sessions.get(id)
    if (process?.runtimePromptFilePath && !summary.milestones.loadedPrompt) {
      const actual = await fs.readFile(process.runtimePromptFilePath, 'utf8').catch(() => '')
      summary.milestones.loadedPrompt = actual.includes(sourcePrompt.trim())
      summary.loadedPromptSha256 = hash(actual)
      summary.bindingKeyMatches = conversationService.getSessionExpertRuntimeBindingKey(id) === getExpertProcessBindingKey((await sessionService.getSession(id))?.expert)
    }
    const brief = await fs.readFile(path.join(workDir, 'commercialization-research/01-research-brief.md'), 'utf8').catch(() => '')
    if (brief.trim()) { summary.milestones.brief = true; summary.briefBytes = Buffer.byteLength(brief); evidence.briefSaved = /新品|开发/.test(brief) && /Quicker/.test(brief) }
     evidence.bindingMatched = Boolean(summary.bindingKeyMatches && summary.milestones.loadedPrompt)
     const active = (await sessionService.getSession(id))?.expert
     evidence.sourcePackageMatched = Boolean(active?.researchSourceDispatches?.receipts?.some((r: any) => r.agentId && r.batchFingerprint && r.coreEntryCount + r.openEntryCount > 0))
     evidence.agentStarted = Boolean(active?.researchEvidence?.records?.some((r: any) => r.agentType === 'expert-evidence-researcher' && r.agentId))
     const audits = active?.researchEvidence?.records?.flatMap((r: any) => r.entries) || []
     for (const page of evidence.pages) page.audited = audits.some((a: any) => a.status === 'opened' && (a.finalUrl === page.url || a.target === page.url) && (a.auditId?.includes(page.toolUseId) || a.toolUseId === page.toolUseId))
     const verdict = evaluateLiveEvidence(evidence)
     if (verdict.passed) finish('concrete-extraction-and-audit')
    } catch (e) { summary.errors.push({ type: 'probe_error', message: String(e) }); finish('probe-error') } finally { probing = false }
  }, 1500)
  summary.stopReason = await finished
  clearTimeout(timeout)
  clearInterval(probe)
  summary.verdict = evaluateLiveEvidence(evidence)
   summary.evidence = evidence
   summary.passed = summary.sourceZipPromptMatch && summary.verdict.passed
   summary.status = summary.passed ? 'passed-startup-only' : summary.stopReason === 'provider-blocked' ? 'blocked' : 'incomplete'
} catch (e) {
  summary.errors.push({ type: 'harness_error', message: e instanceof Error ? e.message : String(e) })
  summary.passed = false
} finally {
  clearTimeout(timeout)
  clearInterval(probe)
  if (id) await conversationService.stopSessionAndWait(id)
  ws?.close()
  server?.stop(true)
  summary.finishedAt = new Date().toISOString()
  await fs.writeFile(path.join(out, 'live-smoke-summary.json'), JSON.stringify(redact(summary), null, 2))
  await fs.writeFile(path.join(out, 'live-smoke-timeline.json'), JSON.stringify(redact(timeline), null, 2))
  await fs.cp(workDir, path.join(out, 'live-smoke-work'), { recursive: true })
  // Remove only this harness's private credential directory, never user config.
  const resolvedConfig = path.resolve(config), resolvedTemp = path.resolve(temp)
  if (!resolvedConfig.startsWith(resolvedTemp + path.sep)) throw new Error('Unsafe smoke cleanup target')
  await fs.rm(path.join(resolvedConfig, 'cc-jiangxia/providers.json'), { force: true })
  // Retain this isolated session for evidence; only credentials are deleted.
  const logs = await fs.readdir(path.join(config, 'projects')).catch(() => [])
  for (const dir of logs) {
    const transcript = path.join(config, 'projects', dir, String(id)+'.jsonl')
    const text = await fs.readFile(transcript, 'utf8').catch(() => '')
    if (text) await fs.writeFile(path.join(out, 'live-transcript.jsonl'), text.split('\n').filter(Boolean).map(line => { try { return JSON.stringify(redact(JSON.parse(line))) } catch { return '[unparsed record omitted]' } }).join('\n'))
  }
  console.log('SMOKE_RESULT ' + JSON.stringify(redact(summary)))
  process.exit(summary.passed ? 0 : 1)
}