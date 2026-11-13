import type { Message } from '../../types/message.js'
import { handleSessionsApi } from '../api/sessions.js'
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test'
import { expertResearchAutoContinueService } from './expertResearchAutoContinueService.js'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { ExpertPackRegistryService, resetExpertPackRegistryForTests } from './expertPackRegistryService.js'
import { ExpertSessionService } from './expertSessionService.js'
import { sessionService } from './sessionService.js'
import { commercializationResearchBudgetService } from './commercializationResearchBudgetService.js'
import { guardExpertResearchIntake, submitExpertResearchAssessment } from './expertResearchIntakeService.js'

const previous = process.env.CLAUDE_CONFIG_DIR
const roots: string[] = []
// These fixtures inspect admission directly. Background singleton checks can outlive
// their temporary config and race the next fixture's ZIP seeding. The automatic
// recovery test below owns a separate service and explicitly awaits tryContinue.
let restoreSchedule: (() => void) | undefined
beforeEach(() => {
  const scheduler = spyOn(expertResearchAutoContinueService, 'schedule').mockImplementation(() => {})
  restoreSchedule = () => scheduler.mockRestore()
})
afterEach(async () => {
  restoreSchedule?.()

  if (previous === undefined) delete process.env.CLAUDE_CONFIG_DIR
  else process.env.CLAUDE_CONFIG_DIR = previous
  resetExpertPackRegistryForTests()
  await Promise.all(roots.splice(0).map(p => fs.rm(p, { recursive: true, force: true })))
})
async function fixture(quality = true) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'expert-quality-checkpoint-'))); roots.push(root)
  process.env.CLAUDE_CONFIG_DIR = path.join(root, 'config'); resetExpertPackRegistryForTests()
  const work = path.join(root, 'work'); await fs.mkdir(work)
  await new ExpertPackRegistryService().importExpertPackZip(await fs.readFile(new URL('../packs/experts/commercialization-research-report.zip', import.meta.url)))
  const service = new ExpertSessionService(), { sessionId } = await sessionService.createSession(work)
  await service.enterExpertMode(sessionId, 'commercialization-research-report')
  // These checkpoint tests start after scope admission. Preserve actual human
  // transcript evidence and let the intake service validate and persist it.
  await expect(guardExpertResearchIntake(sessionId, 'Agent')).rejects.toThrow('EXPERT_INTAKE_REQUIRED')
  const sessionFile = (await sessionService.findSessionFile(sessionId))!.filePath
  await fs.appendFile(sessionFile, JSON.stringify({
    uuid: 'checkpoint-human-scope',
    type: 'user',
    messageKind: 'user_input',
    message: { role: 'user', content: 'Research a product that helps students review course notes, for university students, delivered as a web app.' },
  }) + '\n')
  const admitted = await submitExpertResearchAssessment(sessionId, { dimensions: [
    { id: 'coreTask', provenance: 'confirmed', value: 'Help students review course notes', evidence: { messageId: 'checkpoint-human-scope', quote: 'helps students review course notes' } },
    { id: 'audience', provenance: 'confirmed', value: 'University students', evidence: { messageId: 'checkpoint-human-scope', quote: 'university students' } },
    { id: 'deliveryBoundary', provenance: 'confirmed', value: 'Web app', evidence: { messageId: 'checkpoint-human-scope', quote: 'delivered as a web app' } },
  ] })
  expect(admitted.researchIntake?.status).toBe('clear')
  await expect(guardExpertResearchIntake(sessionId, 'Agent')).resolves.toBeUndefined()
  const current = await sessionService.getSession(sessionId), expert = current!.expert!
  const protocol = JSON.parse(expert.runtimeBinding!.outputProtocol!.content)
  if (quality) protocol.researchQualityCheckpoint = { version: 1, minimumDistinctSuppliers: 2, minimumUserSignals: 2, minimumChannelMechanisms: 2 }
  else delete protocol.researchQualityCheckpoint
  expert.runtimeBinding!.outputProtocol!.content = JSON.stringify(protocol)
  await sessionService.appendSessionMetadata(sessionId, { workDir: work, expert })
  const policy = expert.runtimeBinding!.researchArtifactPolicy!
  await fs.mkdir(path.join(work, policy.directory), { recursive: true })
  await fs.writeFile(path.join(work, policy.briefPath), '# User-confirmed topic\nA product direction.')
  for (const [i, target] of policy.researcherPaths.entries()) {
    commercializationResearchBudgetService.reserve(sessionId, expert, { action: 'reserve-researcher', agentId: 'worker-' + i, artifactPath: target })
    const part = target.replace('.md', '.parts/worker-' + i + '.md')
    await fs.mkdir(path.dirname(path.join(work, part)), { recursive: true })
    await fs.writeFile(path.join(work, part), '# Evidence\nNo useful specific pages were obtained.\n```expert-research-evidence\n' + JSON.stringify({ version: 1, lane: ['competitors', 'user-needs', 'channels'][i], items: [] }) + '\n```')
    await service.recordResearchAudit(sessionId, { agentId: 'worker-' + i, agentType: 'expert-evidence-researcher', artifactPath: part, content: 'Saved honest gap.', entries: [] })
  }
  return { service, sessionId, expert, policy, work }
}

test('researchers receive a runtime evidence contract, not a fixed product research brief', async () => {
  const { service, sessionId } = await fixture()
  const context = await service.getSubagentSkillContext(sessionId, 'expert-evidence-researcher', 'targeted-evidence')
  expect(context.researchQuality?.policy.minimumDistinctSuppliers).toBe(2)
  expect(context.researchQuality?.priorResearch).toHaveLength(3)
  expect(context.researchQuality?.priorResearch?.[1]?.content).toContain('expert-research-evidence')
  expect(JSON.stringify(context.researchQuality)).not.toContain('老照片')
})

test('evidence counts are advisory and admit honest limited-evidence review', async () => {
  const { service, sessionId } = await fixture()
  const context = await service.getSubagentSkillContext(sessionId, 'expert-evidence-reviewer')
  expect(context.researchQuality?.evaluation?.gaps).toHaveLength(3)
  expect(context.researchQuality?.terminalReason).toContain('建议')
})

test('after the one allowed lane follow-up is spent, D receives an explicit limited-evidence result', async () => {
  const { service, sessionId, expert, policy } = await fixture()
  for (const [i, target] of policy.researcherPaths.entries()) expect(commercializationResearchBudgetService.reserve(sessionId, expert, { action: 'reserve-researcher', agentId: 'follow-up-' + i, artifactPath: target }).allowed).toBe(true)
  await expect(service.getSubagentSkillContext(sessionId, 'expert-evidence-reviewer')).rejects.toMatchObject({ code: 'EXPERT_RESEARCH_SUBAGENTS_PENDING' })
  for (let i = 0; i < 3; i++) {
    const url = new URL('http://localhost/api/sessions/' + sessionId + '/expert/research-budget')
    const response = await handleSessionsApi(new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'finish-researcher', agentId: 'follow-up-' + i }) }), url, ['api', 'sessions', sessionId, 'expert', 'research-budget'])
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ allowed: true })
  }
  const context = await service.getSubagentSkillContext(sessionId, 'expert-evidence-reviewer')
  expect(context.researchQuality?.evaluation?.sufficientForReview).toBe(false)
  expect(context.researchQuality?.terminalReason).toContain('补查')
})

test('legacy active fixtures do not gain a new completion gate or mutate their stored protocol', async () => {
  const { service, sessionId } = await fixture(false)
  const context = await service.getSubagentSkillContext(sessionId, 'expert-evidence-reviewer')
  expect(context.researchQuality).toBeUndefined()
  const stored = await sessionService.getSession(sessionId)
  expect(JSON.parse(stored!.expert!.runtimeBinding!.outputProtocol!.content).researchQualityCheckpoint).toBeUndefined()
})

async function selectionFixture(withPlan: boolean) {
  const f = await fixture()
  const current = await sessionService.getSession(f.sessionId), expert = current!.expert!
  const protocol = JSON.parse(expert.runtimeBinding!.outputProtocol!.content)
  protocol.researchQualityCheckpoint.requireSourceSelection = true
  protocol.researchQualityCheckpoint.channelEvidenceStandard = 'public-path'
  expert.runtimeBinding!.outputProtocol!.content = JSON.stringify(protocol)
  await sessionService.appendSessionMetadata(f.sessionId, { workDir: f.work, expert })
  if (withPlan) await fs.writeFile(path.join(f.work, f.policy.briefPath), '# Product direction\n```expert-source-selection\n' + JSON.stringify({ version: 1, lanes: ['competitors', 'user-needs', 'channels'].map(lane => ({ lane, coreConsidered: [{ candidateUrl: 'https://www.talkingdata.com/', decision: 'deferred', reason: '本线优先具体产品及用户页面，宏观应用统计暂作背景。' }], coreRationale: '核心统计用于行业背景，本线选择具体商店和社区取证。', picks: [{ candidateUrl: 'https://www.reddit.com/', purpose: '本线具体页面发现入口', reason: '按产品任务发现具体讨论或原始使用反馈。' }] })) }) + '\n```')
  return f
}

test('new opt-in snapshots require an actionable source plan before dispatch, with a precise repair error', async () => {
  const f = await selectionFixture(false)
  await expect(f.service.getSubagentSkillContext(f.sessionId, 'expert-evidence-researcher')).rejects.toMatchObject({ code: 'EXPERT_RESEARCH_SOURCE_SELECTION_REQUIRED' })
})

test('validated catalog picks reach the worker context and ignored picks use only the existing bounded follow-up', async () => {
  const f = await selectionFixture(true)
  const context = await f.service.getSubagentSkillContext(f.sessionId, 'expert-evidence-researcher')
  expect(context.skills.some(skill => skill.skillId === 'research-source-library')).toBe(false)
  const saved = await sessionService.getSession(f.sessionId)
  expect(saved!.expert!.runtimeBinding!.skills.some(skill => skill.skillId === 'research-source-library')).toBe(true)
  expect(context.researchQuality?.sourceSelection?.lanes[0]?.picks[0]).toMatchObject({ candidateUrl: 'https://www.reddit.com/', status: 'not_visited' })
  try { await f.service.getSubagentSkillContext(f.sessionId, 'expert-evidence-reviewer'); throw new Error('Expected follow-up') }
  catch (error: any) { expect(error.code).toBe('EXPERT_RESEARCH_TARGETED_FOLLOWUP_REQUIRED'); expect(error.message).toContain('选源计划') }
})

test('unattempted selected sources remain visible after budget exhaustion without forcing new research', async () => {
  const f = await selectionFixture(true)
  for (const [i, target] of f.policy.researcherPaths.entries()) {
    expect(commercializationResearchBudgetService.reserve(f.sessionId, f.expert, { action: 'reserve-researcher', agentId: 'selection-follow-up-' + i, artifactPath: target }).allowed).toBe(true)
    expect(commercializationResearchBudgetService.finish(f.sessionId, f.expert, 'selection-follow-up-' + i)).toBe(true)
  }
  const context = await f.service.getSubagentSkillContext(f.sessionId, 'expert-evidence-reviewer')
  expect(context.researchQuality?.sourceSelection?.unattemptedLanes).toHaveLength(3)
  expect(context.researchQuality?.sourceSelection?.lanes[0]?.picks[0]?.status).toBe('not_visited')
  expect(context.researchQuality?.terminalReason).toContain('用尽')
})

 test('new audit Markdown shows selected/core-considered routes rather than the retired all-library task queue', async () => {
  const f = await selectionFixture(true)
  await f.service.getSubagentResearchEvidenceContext(f.sessionId, 'expert-evidence-reviewer')
  const audit = await fs.readFile(path.join(f.work, f.policy.auditPath), 'utf8')
  expect(audit).toContain('本轮相关选源与执行对账')
  expect(audit).toContain('https://www.talkingdata.com/')
  expect(audit).toContain('not_visited')
  expect(audit).not.toContain('全部入口必须各有一次真实终态')
  expect(audit).not.toContain('用户候选来源库任务池与浏览状态')
})

test('adequate external evidence does not silently satisfy an ignored source plan, and exhausted follow-ups remain bounded', async () => {
  const f = await selectionFixture(true)
  const saved = (await sessionService.getSession(f.sessionId))!.expert!
  const quote = 'A concrete excerpt retained from the actually opened fixture page.'
  const sets = [
    [{ url: 'https://vendor-one.example/product', supplier: 'One' }, { url: 'https://vendor-two.example/product', supplier: 'Two' }],
    [{ url: 'https://users.example/thread/1' }, { url: 'https://users.example/thread/2' }],
    [{ url: 'https://vendor-one.example/start', mechanism: 'landing-page' }, { url: 'https://store.example/app/1', mechanism: 'distribution' }],
  ]
  for (const [i, record] of saved.researchEvidence!.records.entries()) {
    const items = sets[i]!.map(item => ({ ...item, quote, observation: 'This specific fixture observation supports a bounded product or channel question.', relevant: true, ...(i === 2 ? { channelPath: '公开产品入口进入具体页面，可见注册、下载或使用动作；未取得实际转化数据。', basis: 'observed' } : {}) }))
    record.content = '# Actual saved fixture evidence\n' + quote + '\n```expert-research-evidence\n' + JSON.stringify({ version: 1, lane: ['competitors', 'user-needs', 'channels'][i], items }) + '\n```'
    record.entries = items.map(item => ({ target: item.url, finalUrl: item.url, kind: 'url', status: 'opened' }))
    await fs.writeFile(path.join(f.work, record.artifactPath!), record.content)
  }
  await sessionService.appendSessionMetadata(f.sessionId, { workDir: f.work, expert: saved })
  await expect(f.service.getSubagentSkillContext(f.sessionId, 'expert-evidence-reviewer')).rejects.toMatchObject({ code: 'EXPERT_RESEARCH_TARGETED_FOLLOWUP_REQUIRED' })
  for (const [i, target] of f.policy.researcherPaths.entries()) {
    expect(commercializationResearchBudgetService.reserve(f.sessionId, saved, { action: 'reserve-researcher', agentId: 'source-only-' + i, artifactPath: target }).allowed).toBe(true)
    commercializationResearchBudgetService.finish(f.sessionId, saved, 'source-only-' + i)
  }
  const context = await f.service.getSubagentSkillContext(f.sessionId, 'expert-evidence-reviewer')
  expect(context.researchQuality?.evaluation?.sufficientForReview).toBe(true)
  expect(context.researchQuality?.sourceSelection?.unattemptedLanes).toHaveLength(3)
})

test('saved malformed researcher evidence is rejected at handoff with local repair guidance', async () => {
  const f = await fixture()
  const target = f.policy.researcherPaths[0]!.replace('.md', '.parts/broken.md')
  await fs.mkdir(path.dirname(path.join(f.work, target)), { recursive: true })
  await fs.writeFile(path.join(f.work, target), '# Saved evidence\n```json\n{"version":1,"lane":"competitors","items":[]}\n```')
  await expect(f.service.recordResearchAudit(f.sessionId, {
    agentId: 'broken', agentType: 'expert-evidence-researcher', artifactPath: target, entries: [], completed: true,
  })).rejects.toMatchObject({ code: 'EXPERT_RESEARCH_EVIDENCE_CONTRACT_INVALID' })
  expect(await fs.readFile(path.join(f.work, target), 'utf8')).toContain('```json')
})

test('real review admission drives automatic recovery instead of contradicting the evidence gate', async () => {
  const f = await fixture()
  const { ExpertResearchAutoContinueService } = await import('./expertResearchAutoContinueService.js')
  const plans: Array<{ kind: string; instruction?: string }> = []
  const auto = new ExpertResearchAutoContinueService({
    loadCandidate: async () => ({ workDir: f.work, expert: (await sessionService.getSession(f.sessionId))!.expert! }),
    readFile: fs.readFile, logError: () => {},
    reviewAdmission: async id => { await f.service.getSubagentSkillContext(id, 'expert-evidence-reviewer') },
  })
  auto.setHandler(async (_id, plan) => { plans.push(plan); return true })
  expect(await auto.tryContinue(f.sessionId)).toBe(true)
  expect(plans[0]?.kind).toBe('continue-review')
  expect(plans[0]?.instruction ?? '').not.toContain('EXPERT_RESEARCH_TARGETED_FOLLOWUP_REQUIRED')
  expect(plans[0]?.instruction ?? '').not.toContain('Do not re-dispatch researchers')
})

test('dispatch returns original JSON diagnostics and current ID contract to the parent without starting a worker', async () => {
  const f = await selectionFixture(true)
  const target = path.join(f.work, f.policy.briefPath)
  const original = await fs.readFile(target, 'utf8')
  const broken = original.replace(/\}\n```$/, '\n```')
  await fs.writeFile(target, broken)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await f.service.getSubagentSkillContext(f.sessionId, 'expert-evidence-researcher')
      throw new Error('expected rejection')
    } catch (error: any) {
      expect(error.code).toBe('EXPERT_RESEARCH_SOURCE_SELECTION_REQUIRED')
      expect(error.message).toContain('parserMessage')
      expect(error.message).toContain('candidateId')
      expect(error.message).toContain('停止重复派发')
      expect(error.message).not.toContain('结构为 version:1')
    }
  }
  expect(await fs.readFile(target, 'utf8')).toBe(broken)
  await fs.writeFile(target, original)
  expect((await f.service.getSubagentSkillContext(f.sessionId, 'expert-evidence-researcher')).researchQuality?.sourceSelection?.lanes).toHaveLength(3)
})

test('repair saved evidence fields before allocating a new research follow-up', async () => {
  const f = await selectionFixture(true)
  const current = await sessionService.getSession(f.sessionId)
  const expert = current!.expert!
  const saved = expert.researchEvidence!.records[0]!
  const prose = 'An actual contiguous passage from the already captured product page.'
  const item = { url: 'https://vendor.example/product', quote: 'A different unsupported concatenated quotation.', observation: 'The saved observation describes the bounded repair feature and its limitations.', relevant: true, supplier: 'Example' }
  saved.content = '# Evidence\n' + prose + '\n```expert-research-evidence\n' + JSON.stringify({ version: 1, lane: 'competitors', items: [item] }) + '\n```'
  await fs.writeFile(path.join(f.work, saved.artifactPath!), saved.content)
  await sessionService.appendSessionMetadata(f.sessionId, { workDir: f.work, expert })
  const startsBeforeRepair = commercializationResearchBudgetService.inspect(f.sessionId, expert).remainingStarts
  await expect(f.service.getSubagentSkillContext(f.sessionId, 'expert-evidence-reviewer')).rejects.toMatchObject({ code: 'EXPERT_RESEARCH_EVIDENCE_CONTRACT_INVALID' })
  try { await f.service.getSubagentSkillContext(f.sessionId, 'expert-evidence-reviewer') } catch (error: any) {
    expect(error.message).toContain('不要新派')
    expect(error.message).toContain(saved.artifactPath)
    expect(error.message).toContain(saved.agentId)
    expect(error.message).not.toContain('通过 SendMessage')
    expect(error.message).toContain('重新读取')
    expect(error.message).not.toContain('每条仅在原工作者已完成后派一次')
  }
  expect(commercializationResearchBudgetService.inspect(f.sessionId, expert).remainingStarts).toBe(startsBeforeRepair)
  item.quote = prose
  saved.content = '# Evidence\n' + prose + '\n```expert-research-evidence\n' + JSON.stringify({ version: 1, lane: 'competitors', items: [item] }) + '\n```'
  await fs.writeFile(path.join(f.work, saved.artifactPath!), saved.content)
  await sessionService.appendSessionMetadata(f.sessionId, { workDir: f.work, expert })
  await expect(f.service.getSubagentSkillContext(f.sessionId, 'expert-evidence-reviewer')).rejects.toMatchObject({ code: 'EXPERT_RESEARCH_TARGETED_FOLLOWUP_REQUIRED' })
})


test('workers receive actual session-template field meanings before researching, and editors retain examples', async () => {
  const f = await fixture()
  const research = await f.service.getSubagentSkillContext(f.sessionId, 'expert-evidence-researcher')
  const skill = research.skills.find(row => row.skillId === 'commercialization-field-evidence')
  expect(skill?.content).toContain('<session-template-field-guide>')
  expect(skill?.content).toContain('CORE_FUNCTION_ROWS')
  expect(skill?.content).toContain('解决什么问题')
  expect(skill?.content).not.toContain('字段示范：AI 视频翻译工具 · 商业化调研报告')
  const review = await f.service.getSubagentSkillContext(f.sessionId, 'expert-evidence-reviewer')
  expect(review.skills.find(row => row.skillId === 'commercialization-field-evidence')?.content).toContain('<session-template-field-guide>')
  await fs.writeFile(path.join(f.work, f.policy.reviewerPath), '# Evidence review\n已核验页面与有限证据边界。')
  const absorption = await f.service.getSubagentSkillContext(f.sessionId, 'expert-evidence-absorber')
  expect(absorption.skills.find(row => row.skillId === 'commercialization-field-evidence')?.content).toContain('字段示范：AI 视频翻译工具 · 商业化调研报告')
})


test('review rereads a repaired registered file without re-browsing or a new worker receipt', async () => {
  const f = await fixture()
  const expert = (await sessionService.getSession(f.sessionId))!.expert!
  const saved = expert.researchEvidence!.records[0]!
  const quote = 'A real continuous quote from the previously opened product page.'
  const url = 'https://vendor.example/product'
  const item = { url, quote: 'Incorrect concatenated quote not present in prose.', observation: 'This observed product capability has a bounded scope, not a validated market outcome.', relevant: true, supplier: 'Vendor' }
  const content = () => '# Evidence\n' + quote + '\n```expert-research-evidence\n' + JSON.stringify({ version: 1, lane: 'competitors', items: [item] }) + '\n```'
  saved.content = content()
  saved.entries = [{ target: url, finalUrl: url, kind: 'url', status: 'opened' }]
  await fs.writeFile(path.join(f.work, saved.artifactPath!), saved.content)
  await sessionService.appendSessionMetadata(f.sessionId, { workDir: f.work, expert })
  await expect(f.service.getSubagentSkillContext(f.sessionId, 'expert-evidence-reviewer')).rejects.toMatchObject({ code: 'EXPERT_RESEARCH_EVIDENCE_CONTRACT_INVALID' })
  const budget = commercializationResearchBudgetService.inspect(f.sessionId, expert).remainingStarts
  item.quote = quote
  await fs.writeFile(path.join(f.work, saved.artifactPath!), content())
  const context = await f.service.getSubagentSkillContext(f.sessionId, 'expert-evidence-reviewer')
  expect(context.researchQuality?.evaluation?.issues).toEqual([])
  const stored = (await sessionService.getSession(f.sessionId))!.expert!
  const refreshed = stored.researchEvidence!.records.find(row => row.artifactPath === saved.artifactPath)!
  expect(refreshed.content).toBe(content())
  expect(refreshed.entries).toEqual(saved.entries)
  expect(refreshed.recordedAt).toBe(saved.recordedAt)
  expect(commercializationResearchBudgetService.inspect(f.sessionId, stored).remainingStarts).toBe(budget)
})

test('automatic continuation resumes after a disk-only repair, but identical bytes do not reset the stop guard', async () => {
  const f = await fixture()
  const expert = (await sessionService.getSession(f.sessionId))!.expert!
  const saved = expert.researchEvidence!.records[0]!
  const quote = 'The actual original product text already saved in this report.'
  const item = { url: 'https://vendor.example/product', quote: 'A mismatched quote from the old saved record.', observation: 'A bounded description of an observed product feature and its known limitations.', relevant: true, supplier: 'Vendor' }
  const content = () => '# Evidence\n' + quote + '\n```expert-research-evidence\n' + JSON.stringify({ version: 1, lane: 'competitors', items: [item] }) + '\n```'
  saved.content = content()
  await fs.writeFile(path.join(f.work, saved.artifactPath!), saved.content)
  await sessionService.appendSessionMetadata(f.sessionId, { workDir: f.work, expert })
  const { ExpertResearchAutoContinueService } = await import('./expertResearchAutoContinueService.js')
  const auto = new ExpertResearchAutoContinueService()
  const plans: string[] = []
  auto.setHandler(async (_id, plan) => { plans.push(plan.kind); return true })
  for (let n = 0; n < 5; n++) await auto.tryContinue(f.sessionId)
  expect(plans.filter(kind => kind === 'research-continuation-stalled')).toHaveLength(1)
  const count = plans.length
  await fs.writeFile(path.join(f.work, saved.artifactPath!), saved.content)
  await auto.tryContinue(f.sessionId)
  expect(plans).toHaveLength(count)
  item.quote = quote
  await fs.writeFile(path.join(f.work, saved.artifactPath!), content())
  await auto.tryContinue(f.sessionId)
  expect(plans.at(-1)).toBe('continue-review')
})

test('refresh leaves a pending writer and an already delivered report untouched', async () => {
  const f = await fixture()
  let expert = (await sessionService.getSession(f.sessionId))!.expert!
  const saved = expert.researchEvidence!.records[0]!
  await fs.writeFile(path.join(f.work, saved.artifactPath!), 'partial ongoing write')
  commercializationResearchBudgetService.reserve(f.sessionId, expert, { action: 'reserve-researcher', agentId: 'pending-writer', artifactPath: f.policy.researcherPaths[0] })
  await f.service.refreshSavedResearchEvidence(f.sessionId)
  expect((await sessionService.getSession(f.sessionId))!.expert!.researchEvidence!.records[0]!.content).toBe(saved.content)
  commercializationResearchBudgetService.finish(f.sessionId, expert, 'pending-writer')
  expert = (await sessionService.getSession(f.sessionId))!.expert!
  expert.templateFillDelivery = { templateId: 'fixture-template', reportPath: 'report.html', finalizedAt: new Date().toISOString() }
  await sessionService.appendSessionMetadata(f.sessionId, { workDir: f.work, expert })
  await f.service.refreshSavedResearchEvidence(f.sessionId)
  expect((await sessionService.getSession(f.sessionId))!.expert!.researchEvidence!.records[0]!.content).toBe(saved.content)
})

test('recovered browser body reaches persisted audit and actual reviewer admission without re-browsing', async () => {
  const { buildPlaywrightAudit } = await import('../../tools/AgentTool/agentToolUtils.js')
  const { createAssistantMessage, createUserMessage } = await import('../../utils/messages.js')
  const f = await fixture()
  const url = 'https://www.baidu.com/s?wd=desktop%20shortcut'
  const quote = 'Observed desktop shortcut search results with a visible product link.'
  const use = createAssistantMessage({ content: [{ type: 'tool_use', id: 'channel-recovered', name: 'Playwright', input: { actions: [
    { type: 'navigate', url }, { type: 'wait', ms: 700 }, { type: 'extract', selector: 'body' },
  ] } }] }) as Message
  const ledger = { url, textExtracted: true, accessLimited: false,
    verificationHistory: [{ stepIndex: 0, url: 'https://wappass.baidu.com/static/captcha/tuxing_v2.html', detail: 'human verification required' }], steps: [
      { index: 0, type: 'navigate', outcome: 'success', url: 'https://wappass.baidu.com/static/captcha/tuxing_v2.html' },
      { index: 1, type: 'wait', outcome: 'success', url },
      { index: 2, type: 'extract', outcome: 'success', url, detail: 'extracted text from body: ' + quote },
    ] }
  const result = createUserMessage({ content: [{ type: 'tool_result', tool_use_id: 'channel-recovered', content:
    '<playwright-action-ledger encoding="base64">' + Buffer.from(JSON.stringify(ledger)).toString('base64') + '</playwright-action-ledger>',
  }] }) as Message
  const entries = buildPlaywrightAudit([use, result])
  const expert = (await sessionService.getSession(f.sessionId))!.expert!
  const row = expert.researchEvidence!.records.find(record => record.agentId === 'worker-2')!
  const content = '# Captured evidence\n' + quote + '\n```expert-research-evidence\n' + JSON.stringify({ version: 1, lane: 'channels', items: [{
    url, quote, observation: 'One public query snapshot, not traffic, paid conversion or evidence about every user.', relevant: true,
    mechanism: 'search-results', channelPath: 'Public task query to a concrete product result and its download entry.', basis: 'observed',
  }] }) + '\n```'
  await fs.writeFile(path.join(f.work, row.artifactPath!), content)
  await f.service.recordResearchAudit(f.sessionId, { agentId: row.agentId, agentType: row.agentType, artifactPath: row.artifactPath, entries, content: 'Saved the captured body.' })
  const context = await f.service.getSubagentSkillContext(f.sessionId, 'expert-evidence-reviewer')
  expect(context.researchQuality?.evaluation?.channelMechanisms).toBe(1)
  const stored = (await sessionService.getSession(f.sessionId))!.expert!.researchEvidence!.records.find(record => record.agentId === row.agentId)!
  expect(stored.entries[0]).toMatchObject({ finalUrl: url, status: 'opened', searchEngine: '百度', searchResultStatus: 'results_observed' })
  await f.service.getSubagentResearchEvidenceContext(f.sessionId, 'expert-evidence-reviewer')
  expect(await fs.readFile(path.join(f.work, f.policy.auditPath), 'utf8')).toContain(url)
  expect(ledger.verificationHistory[0]!.url).toContain('captcha')
})
