/** Bounded real-provider integration proof; creates and stops only its own isolated session. */
import * as fs from 'node:fs/promises'
import { rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { createServer } from 'node:net'

const repo = path.resolve(import.meta.dir, '../..')
const originalHome = os.homedir()
const out = path.join(repo, 'artifacts/message-identity', 'expert-intake-live-' + new Date().toISOString().replace(/[:.]/g, '-'))
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'jiangxia-intake-luna-'))
const config = path.join(temp, 'config'), work = path.join(temp, 'work'), privateHome = path.join(temp, 'home')
await Promise.all([fs.mkdir(out, { recursive: true }), fs.mkdir(path.join(config, 'cc-jiangxia'), { recursive: true }), fs.mkdir(work), fs.mkdir(privateHome)])
const key = (await fs.readFile(path.join(originalHome, '.config/cc-jiangxia-live-tests/openai.key'), 'utf8')).trim()
if (!key) throw new Error('Authorized Luna credential is empty')
const saved = JSON.parse(await fs.readFile(path.join(originalHome, '.claude/cc-jiangxia/providers.json'), 'utf8'))
const provider = saved.providers.find((p: any) => p.name === 'OpenAI Luna 6' && p.apiFormat === 'openai_responses' && p.models?.main === 'gpt-6-luna')
if (!provider) throw new Error('Saved selector openai-luna-6:main:openai-luna-6-main unavailable')
await fs.writeFile(path.join(config, 'cc-jiangxia/providers.json'), JSON.stringify({ activeId: provider.id, providers: [{ ...provider, apiKey: key, models: { main: 'gpt-6-luna', haiku: 'gpt-6-luna', sonnet: 'gpt-6-luna', opus: 'gpt-6-luna' } }] }), { mode: 0o600 })
process.on('exit', () => { rmSync(path.join(config, 'cc-jiangxia/providers.json'), { force: true }) })
await fs.writeFile(path.join(config, 'settings.json'), JSON.stringify({ permissionMode: 'default', alwaysThinkingEnabled: false }))
Object.assign(process.env, { CLAUDE_CONFIG_DIR: config, HOME: privateHome, USERPROFILE: privateHome, CLAUDE_EXPERT_PACKS_DIR: path.join(repo, 'src/server/packs/experts') })
process.env.CLAUDE_CLI_PATH = path.join(repo, 'bin/claude-jiangxia')
process.env.CLAUDE_APP_ROOT = repo
process.env.CLAUDE_BROWSER_RUNTIME_DIR = path.join(repo, 'desktop/src-tauri/binaries/browser-runtime/playwright')
process.env.CLAUDE_BUNDLED_NODE_EXECUTABLE = path.join(repo, 'desktop/src-tauri/binaries/node-runtime/node-v22.23.1-darwin-arm64/bin/node')
const load = (file: string) => import(pathToFileURL(path.join(repo, file)).href)
const { startServer } = await load('src/server/index.ts')
const { sessionService } = await load('src/server/services/sessionService.ts')
const { conversationService } = await load('src/server/services/conversationService.ts')
const { ExpertPackRegistryService } = await load('src/server/services/expertPackRegistryService.ts')
const { ExpertSessionService } = await load('src/server/services/expertSessionService.ts')
const { ZipPackAdapter } = await load('src/server/services/zipPackAdapter.ts')
const { getExpertProcessBindingKey } = await load('src/server/services/expertRuntimeBindingService.ts')
const summary: any = { startedAt: new Date().toISOString(), providerSelector: 'openai-luna-6:main:openai-luna-6-main', model: 'gpt-6-luna', soleHumanPrompt: '老照片修复', isolated: true, temp, tools: [], errors: [], milestones: {}, passed: false }
const timeline: any[] = []
const redact = (value: any): any => typeof value === 'string' ? value.split(key).join('[REDACTED]') : Array.isArray(value) ? value.map(redact) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([k]) => !/apiKey|authorization|token|secret/i.test(k)).map(([k, v]) => [k, redact(v)])) : value
let server: any, ws: WebSocket | undefined, sessionId: string | undefined
let finish!: (reason: string) => void
const finished = new Promise<string>(resolve => { let done = false; finish = reason => { if (!done) { done = true; resolve(reason) } } })
const forbidden = (name: string) => /Agent|Bash|Playwright|Browser|Computer|WebSearch|WebFetch|mcp.*browser/i.test(name)
const names = new Map<string, string>()
const answered = new Set<string>()
let timer: ReturnType<typeof setTimeout> | undefined, probe: ReturnType<typeof setInterval> | undefined
process.on('SIGTERM', () => finish('interrupted'))
process.on('SIGINT', () => finish('interrupted'))
try {
  const bytes = await fs.readFile(path.join(repo, 'src/server/packs/experts/commercialization-research-report.zip'))
  const zip = await new ZipPackAdapter().read(bytes)
  const sourcePrompt = await fs.readFile(path.join(repo, 'experts/commercialization-research-report/prompts/system.md'), 'utf8')
  summary.sourceZipPromptMatch = sourcePrompt.trim() === (await zip.readText('experts/commercialization-research-report/prompts/system.md')).trim()
  if (!summary.sourceZipPromptMatch) throw new Error('Rebuilt pack does not match current source prompt')
  summary.zipSha256 = createHash('sha256').update(bytes).digest('hex')
  await new ExpertPackRegistryService().importExpertPackZip(bytes)
  const reservation = createServer()
  await new Promise<void>(resolve => reservation.listen(0, '127.0.0.1', resolve))
  const port = (reservation.address() as any).port
  await new Promise<void>((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()))
  server = startServer(port, '127.0.0.1')
  summary.port = server.port
  sessionId = (await sessionService.createSession(work)).sessionId
  summary.sessionId = sessionId
  await sessionService.appendSessionMetadata(sessionId, { workDir: work, customTitle: 'Isolated Luna intake proof' })
  process.env.CC_JIANGXIA_EXPERT_SESSION_ID = sessionId
  process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = 'http://127.0.0.1:' + server.port
  ws = new WebSocket('ws://127.0.0.1:' + server.port + '/ws/' + sessionId)
  await new Promise<void>((resolve, reject) => { ws!.onopen = () => resolve(); ws!.onerror = () => reject(new Error('Isolated smoke WebSocket unavailable')) })
  ws.onmessage = event => {
    const message = JSON.parse(String(event.data))
    if (message.type === 'tool_use_complete') {
      names.set(message.toolUseId, message.toolName)
      summary.tools.push({ name: message.toolName, input: message.input, parent: message.parentToolUseId ?? null, at: new Date().toISOString() })
      timeline.push({ type: message.type, toolName: message.toolName, toolUseId: message.toolUseId, input: message.input })
      if (message.toolName === 'assess_expert_research_scope' && message.input?.action === 'assess') summary.milestones.modelAssessed = true
      if (forbidden(message.toolName)) { summary.milestones.forbiddenAttempt = message.toolName; ws!.send(JSON.stringify({ type: 'stop_generation' })); finish('forbidden-tool-attempt'); return }
    }
    if (message.type === 'permission_request') {
      timeline.push({ type: message.type, requestId: message.requestId, toolName: message.toolName, toolUseId: message.toolUseId, input: message.input })
      if (message.toolName === 'AskUserQuestion') {
        if (!summary.milestones.modelAssessed) { finish('question-before-model-assessment'); return }
        if (answered.has(message.requestId)) return
        const answers: Record<string, string> = {}, answerChoiceIds: Record<string, string[]> = {}
        for (const question of message.input?.questions ?? []) {
          const choices = question.choices ?? question.options ?? []
          const chosen = choices.find((choice: any) => choice.id !== 'delegate')
          if (!question.id || !chosen?.id || !chosen.label) { finish('invalid-live-question-card'); return }
          answers[question.id] = chosen.label
          answerChoiceIds[question.id] = [chosen.id]
        }
        if (!Object.keys(answers).length) { finish('empty-live-question-card'); return }
        summary.milestones.realQuestion = true
        answered.add(message.requestId)
        timeline.push({ type: 'actual-test-user-card-answer', requestId: message.requestId, answers, answerChoiceIds })
        ws!.send(JSON.stringify({ type: 'permission_response', requestId: message.requestId, allowed: true, updatedInput: { ...message.input, answers, answerChoiceIds } }))
      } else {
        const allowed = !forbidden(message.toolName) && ['Read', 'Glob', 'Grep', 'LS'].includes(message.toolName)
        ws!.send(JSON.stringify({ type: 'permission_response', requestId: message.requestId, allowed }))
        if (forbidden(message.toolName)) finish('forbidden-permission-request')
      }
    }
    if (message.type === 'tool_result') timeline.push({ type: message.type, toolName: names.get(message.toolUseId), isError: message.isError, content: message.content })
    if (message.type === 'error') { summary.errors.push({ type: message.type, message: message.message }); finish('runtime-error') }
  }
  ws.send(JSON.stringify({ type: 'set_runtime_config', providerId: provider.id, modelId: 'gpt-6-luna' }))
  const expert = await new ExpertSessionService().enterExpertMode(sessionId, 'commercialization-research-report')
  summary.expertVersion = expert.packVersion
  ws.send(JSON.stringify({ type: 'user_message', content: '老照片修复' }))
  timer = setTimeout(() => finish('six-minute-timeout'), 6 * 60_000)
  let probing = false
  probe = setInterval(async () => {
    if (probing || !sessionId) return
    probing = true
    try {
      const active = (await sessionService.getSession(sessionId))?.expert
      const current = (conversationService as any).sessions.get(sessionId)
      if (current?.runtimePromptFilePath && !summary.milestones.loadedPrompt) {
        const actual = await fs.readFile(current.runtimePromptFilePath, 'utf8').catch(() => '')
        summary.milestones.loadedPrompt = actual.includes(sourcePrompt.trim())
        summary.bindingMatched = conversationService.getSessionExpertRuntimeBindingKey(sessionId) === getExpertProcessBindingKey(active)
      }
      const intake = active?.researchIntake
      if (intake) summary.intake = intake
      if (intake?.receipts?.some((receipt: any) => answered.has(receipt.requestId))) {
        summary.milestones.trustedReceipt = true
        if (['clear', 'delegated'].includes(intake.status) && intake.admittedAt) {
          summary.milestones.admitted = true
          ws!.send(JSON.stringify({ type: 'stop_generation' }))
          finish('trusted-card-receipt-admitted')
        }
      }
    } catch (error) { summary.errors.push({ type: 'probe', message: String(error) }); finish('probe-error') }
    finally { probing = false }
  }, 100)
  summary.stopReason = await finished
  summary.passed = !!(summary.sourceZipPromptMatch && summary.milestones.loadedPrompt && summary.bindingMatched && summary.milestones.modelAssessed && summary.milestones.realQuestion && summary.milestones.trustedReceipt && summary.milestones.admitted && !summary.milestones.forbiddenAttempt)
} catch (error) { summary.stopReason = 'harness-error'; summary.errors.push({ type: 'harness', message: error instanceof Error ? error.message : String(error) }) }
finally {
  clearTimeout(timer); clearInterval(probe)
  if (sessionId) await conversationService.stopSessionAndWait(sessionId)
  ws?.close(); server?.stop(true)
  summary.finishedAt = new Date().toISOString()
  await fs.rm(path.join(config, 'cc-jiangxia/providers.json'), { force: true })
  await fs.writeFile(path.join(out, 'summary.json'), JSON.stringify(redact(summary), null, 2))
  await fs.writeFile(path.join(out, 'timeline.json'), JSON.stringify(redact(timeline), null, 2))
  await fs.writeFile(path.join(out, 'report.md'), `# Actual Luna intake integration proof\n\nStatus: ${summary.passed ? 'PASS' : 'INCOMPLETE'}\nStop: ${summary.stopReason}\nModel: gpt-6-luna\nHuman input: 老照片修复\n\nMilestones:\n${Object.entries(summary.milestones).map(([k,v]) => `- ${k}: ${v}`).join('\n')}\n\nNo browser, Agent, or Bash execution is allowed by this harness. Only its own session is stopped.\n`)
  console.log(JSON.stringify({ passed: summary.passed, stopReason: summary.stopReason, out, milestones: summary.milestones }))
  process.exit(summary.passed ? 0 : 1)
}
