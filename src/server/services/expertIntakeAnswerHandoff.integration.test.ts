import { expect, test } from 'bun:test'
import { appendFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { sessionService } from './sessionService.js'
import { submitExpertResearchAssessment, recordExpertIntakeQuestion, recordExpertIntakeAnswer, inspectExpertResearchIntake } from './expertResearchIntakeService.js'
import { handleSessionsApi } from '../api/sessions.js'
import { guardExpertIntakeToolCall, requestExpertIntake } from '../../services/tools/expertResearchIntakeRuntime.js'

test('saved Windows/new-product answers survive a lost local admission response and permit research without another card', async () => {
  const prior = process.env.CLAUDE_CONFIG_DIR
  const root = await mkdtemp(path.join(tmpdir(), 'expert-answer-handoff-'))
  process.env.CLAUDE_CONFIG_DIR = root
  let server: ReturnType<typeof Bun.serve> | undefined
  try {
    const { sessionId } = await sessionService.createSession(root)
    await sessionService.appendSessionMetadata(sessionId, { workDir: root, expert: {
      mode: 'expert', expertId: 'commercialization-research-report', expertName: 'test', status: 'active', materialRefs: [],
      runtimeBinding: { active: true, expertId: 'commercialization-research-report', promptSnapshot: '默认受众：C端个人用户' },
    } as any })
    const file = (await sessionService.findSessionFile(sessionId))!.filePath
    await appendFile(file, JSON.stringify({ type: 'user', uuid: 'product', messageKind: 'user_input', message: { role: 'user', content: 'Quicker-鼠标中键效率神器' } }) + '\n')
    await submitExpertResearchAssessment(sessionId, { dimensions: [
      { id: 'coreTask', provenance: 'unknown', materialImpact: '新品与现有产品的竞品范围不同', userOwnedReason: '用户决定研究对象' },
      { id: 'audience', provenance: 'known-business-default', evidence: { messageId: 'active-business-rules', quote: 'C端个人用户' } },
      { id: 'deliveryBoundary', provenance: 'unknown', materialImpact: '平台决定竞品和兼容范围', userOwnedReason: '用户决定首发平台' },
    ] })
    const questions = [{ id: 'coreTask', prompt: '产品方向？', choices: [{ id: 'new', label: '开发新品' }, { id: 'existing', label: '现有产品' }] },
      { id: 'deliveryBoundary', prompt: '首发平台？', choices: [{ id: 'windows', label: 'Windows桌面' }, { id: 'mac', label: 'macOS' }] }]
    await appendFile(file, JSON.stringify({ type: 'assistant', uuid: 'question', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'original-card', name: 'AskUserQuestion', input: { questions } }] } }) + '\n')
    await recordExpertIntakeQuestion(sessionId, 'request', 'original-card', { questions })
    const answer = await recordExpertIntakeAnswer(sessionId, 'request', true, { answers: { coreTask: '开发新品', deliveryBoundary: 'Windows桌面' } })
    expect(answer!.answers).toMatchObject({ 'expert-intake:coreTask': '开发新品', 'expert-intake:deliveryBoundary': 'Windows桌面' })
    let admissions = 0
    server = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(req) {
      const url = new URL(req.url)
      const response = await handleSessionsApi(req, url, url.pathname.split('/').filter(Boolean))
      if (url.pathname.endsWith('/intake-admission') && ++admissions === 1) await Bun.sleep(800)
      return response ?? new Response('not found', { status: 404 })
    } })
    const env = { CC_JIANGXIA_EXPERT_TEMPLATE_FILL_DELIVERY: 'cli-only', CC_JIANGXIA_EXPERT_SESSION_ID: sessionId, CC_JIANGXIA_DESKTOP_SERVER_URL: `http://127.0.0.1:${server.port}` }
    const inspected = await requestExpertIntake('scope-assessment', { action: 'inspect' }, { env })
    expect(inspected.nextAction).toBe('continue_research')
    expect(inspected.requiresAssessment).toBe(false)
    await guardExpertIntakeToolCall({ toolName: 'Agent', env, timeoutMs: 500 })
    expect(admissions).toBe(2)
    const repeated = await recordExpertIntakeQuestion(sessionId, 'retry-card', 'retry-tool', { questions })
    expect(repeated!.answers).toEqual({ coreTask: '开发新品', deliveryBoundary: 'Windows桌面' })
    const state = await inspectExpertResearchIntake(sessionId)
    expect(state.state!.receipts).toHaveLength(1)
    expect(state.state!.pending).toBeUndefined()
    expect(state.nextAction).toBe('continue_research')
  } finally {
    server?.stop(true)
    if (prior === undefined) delete process.env.CLAUDE_CONFIG_DIR
    else process.env.CLAUDE_CONFIG_DIR = prior
    await rm(root, { recursive: true, force: true })
  }
}, 20_000)
