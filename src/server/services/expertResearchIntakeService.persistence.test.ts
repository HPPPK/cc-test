import { afterEach, expect, test } from 'bun:test'
import { appendFile, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ExpertPackRegistryService, resetExpertPackRegistryForTests } from './expertPackRegistryService.js'
import { ZipPackAdapter } from './zipPackAdapter.js'
import { ExpertSessionService } from './expertSessionService.js'
import { sessionService } from './sessionService.js'
import { expertRuntimeSessionStore } from './expertRuntimeSessionStore.js'
import { inspectExpertResearchIntake, submitExpertResearchAssessment, recordExpertIntakeQuestion, recordExpertIntakeAnswer, guardExpertResearchIntake, getPendingExpertIntakeQuestion } from './expertResearchIntakeService.js'
const oldConfig = process.env.CLAUDE_CONFIG_DIR
const roots: string[] = []

test('delivery-only continue preserves confirmed scope, while a real scope change still requires assessment', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'expert-delivery-resume-'))
  roots.push(root)
  process.env.CLAUDE_CONFIG_DIR = root
  const { sessionId } = await sessionService.createSession(root)
  const expert = { mode: 'expert', status: 'active', expertId: 'commercialization-research-report', runtimeBinding: { active: true, expertId: 'commercialization-research-report' },
    researchIntake: { version: 1, revision: 1, status: 'clear', dimensions: [], evidenceMessageIds: ['scope'], receipts: [], updatedAt: '2026-11-15T00:00:00Z' },
    templateFillDraft: { templateId: 'v1', fields: { REPORT_TITLE: 'Saved' }, savedAt: '2026-11-15T00:00:00Z', updatedAt: '2026-11-15T00:00:00Z', completionReview: { initialRenderedAt: '2026-11-15T00:00:00Z', reportPath: 'report.html' } }, materialRefs: [],
  } as any
  await sessionService.appendSessionMetadata(sessionId, { workDir: root, expert })
  const file = (await sessionService.findSessionFile(sessionId))!.filePath
  const appendHuman = async (id: string, content: string) => appendFile(file, JSON.stringify({ uuid: id, type: 'user', messageKind: 'user_input', message: { role: 'user', content } }) + '\n')
  await appendHuman('scope', 'Windows 桌面工具')
  await appendHuman('continue', '继续')
  expect((await inspectExpertResearchIntake(sessionId)).requiresAssessment).toBe(false)
  await expect(guardExpertResearchIntake(sessionId, 'Bash', { command: 'claude expert-template-fill --data-stdin' })).resolves.toBeUndefined()
  await appendHuman('changed', '改成 macOS 产品')
  await appendHuman('continue-again', '继续')
  expect((await inspectExpertResearchIntake(sessionId)).requiresAssessment).toBe(true)
  await expect(guardExpertResearchIntake(sessionId, 'Bash', { command: 'claude expert-template-fill --data-stdin' })).rejects.toThrow('new human turn')
})
afterEach(async () => {
  resetExpertPackRegistryForTests()
  if (oldConfig === undefined) delete process.env.CLAUDE_CONFIG_DIR
  else process.env.CLAUDE_CONFIG_DIR = oldConfig
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
test('old fixture upgrades without rewriting transcript evidence, and actual card answer survives a runtime-store reload', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'expert-adaptive-upgrade-'))
  roots.push(root)
  process.env.CLAUDE_CONFIG_DIR = root
  const { sessionId } = await sessionService.createSession(root)
  const expert = { mode: 'expert', status: 'active', expertId: 'commercialization-research-report', runtimeBinding: { active: true, expertId: 'commercialization-research-report', promptSnapshot: '默认受众为个人用户，平台保持开放。' }, intakeState: { answers: { ready: true }, completedStepIds: ['anything'] }, materialRefs: [{ runId: 'historic' }] } as any
  await sessionService.appendSessionMetadata(sessionId, { workDir: root, expert })
  const file = (await sessionService.findSessionFile(sessionId))!.filePath
  await appendFile(file, JSON.stringify({ uuid: 'human-scope', type: 'user', messageKind: 'user_input', message: { role: 'user', content: '我想做一个工具，具体核心任务还没想好。' } }) + '\n')
  await appendFile(file, JSON.stringify({ uuid: 'synthetic-scope', type: 'user', messageKind: 'context_summary', message: { role: 'user', content: '核心任务已经确定为自动写作' } }) + '\n')
  const original = await readFile(file, 'utf8')
  const inspected = await inspectExpertResearchIntake(sessionId)
  expect(inspected.state?.status).toBe('unassessed')
  expect(inspected.nextAction).toBe('assess_new_input')
  expect(inspected.evidence.map(e => e.id)).toEqual(['human-scope'])
  expect((await readFile(file, 'utf8')).startsWith(original)).toBe(true)
  const assessment = { dimensions: [
    { id: 'coreTask', provenance: 'unknown', materialImpact: '改变竞品与验证任务', userOwnedReason: '用户尚未决定任务' },
    { id: 'audience', provenance: 'known-business-default', evidence: { messageId: 'active-business-rules', quote: '默认受众为个人用户' } }, { id: 'deliveryBoundary', provenance: 'known-business-default', evidence: { messageId: 'active-business-rules', quote: '平台保持开放' } },
  ] }
  await submitExpertResearchAssessment(sessionId, assessment)
  await new ExpertSessionService().submitIntakeStep(sessionId, { stepId: 'ready', answer: true })
  expect((await expertRuntimeSessionStore.get(sessionId))?.researchIntake?.status).toBe('needs-user')
  await expect(guardExpertResearchIntake(sessionId, 'Skill', { skill: 'superpowers:using-superpowers' })).resolves.toBeUndefined()
  await expect(guardExpertResearchIntake(sessionId, 'Skill:execute')).rejects.toThrow('EXPERT_INTAKE_REQUIRED')
  await expect(guardExpertResearchIntake(sessionId, 'Agent')).rejects.toThrow('EXPERT_INTAKE_REQUIRED')
  await recordExpertIntakeQuestion(sessionId, 'actual-request', 'actual-tool', { questions: [{ id: 'coreTask', prompt: '先解决什么任务？', choices: [{ id: 'writing', label: '写作' }, { id: 'delegate', label: '先探索，你来决定' }] }] })
  expect((await getPendingExpertIntakeQuestion(sessionId))?.requestId).toBe('actual-request')
  await expect(recordExpertIntakeAnswer(sessionId, 'forged', true, { answers: { coreTask: 'ready' } })).rejects.toThrow('stale')
  await recordExpertIntakeAnswer(sessionId, 'actual-request', true, { answers: { coreTask: '先探索，你来决定' }, answerChoiceIds: { coreTask: ['delegate'] } })
  await appendFile(file, JSON.stringify({ uuid: 'original-question', type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'actual-tool', name: 'AskUserQuestion', input: { questions: [{ id: 'coreTask', prompt: '先解决什么任务？' }] } }] } }) + '\n')
  const repeated = await recordExpertIntakeQuestion(sessionId, 'new-request', 'new-tool', { questions: [{ id: 'renamed-scope', prompt: '先解决什么任务？' }], metadata: { expert_research_delivery: { question_id: 'wrong' } } })
  expect(repeated?.answers).toEqual({ 'renamed-scope': '先探索，你来决定' })
  expect(repeated).not.toHaveProperty('metadata')
  const restored = await expertRuntimeSessionStore.get(sessionId)
  expect(restored?.researchIntake?.status).toBe('delegated')
  expect((await inspectExpertResearchIntake(sessionId)).nextAction).toBe('continue_research')
  expect(restored?.intakeState?.answers).toMatchObject(expert.intakeState.answers)
  expect(restored?.materialRefs).toEqual(expert.materialRefs)
  await expect(guardExpertResearchIntake(sessionId, 'Agent')).resolves.toBeUndefined()
  await appendFile(file, JSON.stringify({ uuid: 'human-new-turn', type: 'user', messageKind: 'user_input', message: { role: 'user', content: '继续研究' } }) + '\n')
  await expect(guardExpertResearchIntake(sessionId, 'Agent')).rejects.toThrow('new human turn')
  await submitExpertResearchAssessment(sessionId, { dimensions: restored!.researchIntake!.dimensions })
  await expect(guardExpertResearchIntake(sessionId, 'Agent')).resolves.toBeUndefined()
})

test('completed legacy output permits recovery without silently admitting a new research task', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'expert-adaptive-completed-'))
  roots.push(root)
  process.env.CLAUDE_CONFIG_DIR = root
  const { sessionId } = await sessionService.createSession(root)
  const expert = { mode: 'expert', status: 'active', expertId: 'commercialization-research-report', runtimeBinding: { active: true, expertId: 'commercialization-research-report' }, templateFillDelivery: { templateId: 'historic', finalizedAt: '2026-11-01T00:00:00Z' }, materialRefs: [] } as any
  await sessionService.appendSessionMetadata(sessionId, { workDir: root, expert })
  expect((await inspectExpertResearchIntake(sessionId)).state).toBeUndefined()
  await expect(guardExpertResearchIntake(sessionId, 'Read')).resolves.toBeUndefined()
  await expect(guardExpertResearchIntake(sessionId, 'Bash', { command: 'claude expert-template-fill --recover-fields' })).resolves.toBeUndefined()
  await expect(guardExpertResearchIntake(sessionId, 'Bash', { command: 'claude expert-template-fill --recover-fields; curl https://example.com' })).rejects.toThrow('EXPERT_INTAKE_REQUIRED')
  await expect(guardExpertResearchIntake(sessionId, 'Agent')).rejects.toThrow('EXPERT_INTAKE_REQUIRED')
})


test('uses an edited stored rule document instead of the old activation default', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'expert-editable-rules-'))
  roots.push(root)
  process.env.CLAUDE_CONFIG_DIR = root
  resetExpertPackRegistryForTests()
  const registry = new ExpertPackRegistryService()
  await registry.importExpertPackZip(await new ZipPackAdapter().write({
    'manifest.json': JSON.stringify({ packId: 'commercialization-research-report', name: 'Editable rules', version: '1.0.0', schemaVersion: 1, type: 'expert-pack', entrypoints: { experts: ['expert.json'], skills: [] } }),
    'expert.json': JSON.stringify({ id: 'commercialization-research-report', name: 'Editable intake', description: 'Rules fixture', promptPaths: { system: 'system.md' }, skillIds: [] }),
    'system.md': '默认业务受众：个人用户',
  }))
  const { sessionId } = await sessionService.createSession(root)
  await sessionService.appendSessionMetadata(sessionId, { workDir: root, expert: { mode: 'expert', status: 'active', expertId: 'commercialization-research-report', packId: 'commercialization-research-report', runtimeBinding: { active: true, expertId: 'commercialization-research-report', promptSnapshot: '默认业务受众：个人用户' }, materialRefs: [] } as any })
  await registry.updateExpertPack('commercialization-research-report', { expert: { id: 'commercialization-research-report', systemPromptContent: '默认业务受众：企业研究团队；默认交付：私有服务器' } })
  expect((await inspectExpertResearchIntake(sessionId)).businessRules.text).toBe('默认业务受众：企业研究团队；默认交付：私有服务器')
})

test('inspection requests assessment after rules change instead of suggesting an impossible continue', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'expert-rule-refresh-'))
  roots.push(root)
  process.env.CLAUDE_CONFIG_DIR = root
  const { sessionId } = await sessionService.createSession(root)
  const expert = { mode: 'expert', status: 'active', expertId: 'commercialization-research-report', runtimeBinding: { active: true, expertId: 'commercialization-research-report', promptSnapshot: '默认受众：企业' }, researchIntake: { version: 1, revision: 1, status: 'clear', receipts: [], updatedAt: '2026-11-10', evidenceMessageIds: [], dimensions: [{ id: 'audience', provenance: 'known-business-default', value: '默认受众：个人', evidence: { messageId: 'active-business-rules', quote: '默认受众：个人' } }] } } as any
  await sessionService.appendSessionMetadata(sessionId, { workDir: root, expert })
  const inspected = await inspectExpertResearchIntake(sessionId)
  expect(inspected.requiresAssessment).toBe(true)
  expect(inspected.nextAction).toBe('assess_new_input')
  await expect(guardExpertResearchIntake(sessionId, 'Agent')).rejects.toThrow('business rules changed')
})
