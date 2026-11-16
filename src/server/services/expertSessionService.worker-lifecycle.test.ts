import { afterEach, expect, spyOn, test } from 'bun:test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { ExpertSessionService } from './expertSessionService.js'
import { ExpertPackRegistryService, resetExpertPackRegistryForTests } from './expertPackRegistryService.js'
import { sessionService } from './sessionService.js'
import { commercializationResearchBudgetService } from './commercializationResearchBudgetService.js'
import { expertResearchAutoContinueService } from './expertResearchAutoContinueService.js'

const previousConfig = process.env.CLAUDE_CONFIG_DIR
const roots: string[] = []
afterEach(async () => {
  if (previousConfig === undefined) delete process.env.CLAUDE_CONFIG_DIR
  else process.env.CLAUDE_CONFIG_DIR = previousConfig
  resetExpertPackRegistryForTests()
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})
async function fixture() {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'expert-worker-lifecycle-')))
  roots.push(root)
  process.env.CLAUDE_CONFIG_DIR = path.join(root, 'config')
  resetExpertPackRegistryForTests()
  const workDir = path.join(root, 'work')
  await fs.mkdir(workDir)
  await new ExpertPackRegistryService().importExpertPackZip(await fs.readFile(new URL('../packs/experts/commercialization-research-report.zip', import.meta.url)))
  const service = new ExpertSessionService()
  const { sessionId } = await sessionService.createSession(workDir)
  await service.enterExpertMode(sessionId, 'commercialization-research-report')
  const expert = (await sessionService.getSession(sessionId))!.expert!
  const policy = expert.runtimeBinding!.researchArtifactPolicy!
  const artifactPath = policy.researcherPaths[0]!.replace('.md', '.parts/worker-A.md')
  await fs.mkdir(path.dirname(path.join(workDir, artifactPath)), { recursive: true })
  await fs.writeFile(path.join(workDir, policy.briefPath), '# User-confirmed research brief')
  await fs.writeFile(path.join(workDir, artifactPath), '# Evidence gap\nNo useful pages were obtained.\n```expert-research-evidence\n' + JSON.stringify({ version: 1, lane: 'competitors', items: [] }) + '\n```')
  expect(commercializationResearchBudgetService.reserve(sessionId, expert, { action: 'reserve-researcher', agentId: 'worker-A', artifactPath }).allowed).toBe(true)
  const lifecycle = () => commercializationResearchBudgetService.getWorkerLifecycles(sessionId, expert)[0]!.state
  return { service, sessionId, expert, artifactPath, lifecycle }
}

test.each(['completed', 'interrupted'] as const)('terminal %s audit settles actual worker before scheduling continuation', async marker => {
  const f = await fixture()
  const observed: string[] = []
  const schedule = spyOn(expertResearchAutoContinueService, 'schedule').mockImplementation(() => { observed.push(f.lifecycle()) })
  try {
    await f.service.recordResearchAudit(f.sessionId, { agentId: 'worker-A', agentType: 'expert-evidence-researcher', artifactPath: f.artifactPath, entries: [], [marker]: true })
    expect(f.lifecycle()).toBe('ended')
    expect(observed).toEqual(['ended'])
  } finally { schedule.mockRestore() }
})

test('rejected completed audit settles worker without weakening the evidence gate', async () => {
  const f = await fixture()
  const observed: string[] = []
  const schedule = spyOn(expertResearchAutoContinueService, 'schedule').mockImplementation(() => { observed.push(f.lifecycle()) })
  try {
    await expect(f.service.recordResearchAudit(f.sessionId, { agentId: 'worker-A', agentType: 'expert-evidence-researcher', content: '# no durable assigned file', entries: [], completed: true })).rejects.toMatchObject({ code: 'EXPERT_RESEARCH_AUDIT_INVALID' })
    expect(f.lifecycle()).toBe('ended')
    expect(observed).toEqual(['ended'])
    expect((await sessionService.getSession(f.sessionId))!.expert!.researchEvidence?.records ?? []).toEqual([])
  } finally { schedule.mockRestore() }
})

test('partial saved audit keeps worker running', async () => {
  const f = await fixture()
  const schedule = spyOn(expertResearchAutoContinueService, 'schedule').mockImplementation(() => {})
  try {
    await f.service.recordResearchAudit(f.sessionId, { agentId: 'worker-A', agentType: 'expert-evidence-researcher', artifactPath: f.artifactPath, entries: [] })
    expect(f.lifecycle()).toBe('running')
  } finally { schedule.mockRestore() }
})

test('failed session lookup retains original audit error when terminal settlement cannot reread session', async () => {
  const service = new ExpertSessionService()
  const original = new Error('original session read failure')
  const read = spyOn(sessionService, 'getSession').mockRejectedValue(original)
  const schedule = spyOn(expertResearchAutoContinueService, 'schedule').mockImplementation(() => {})
  try {
    await expect(service.recordResearchAudit('missing-session', { agentId: 'worker-A', agentType: 'expert-evidence-researcher', entries: [], completed: true })).rejects.toBe(original)
    expect(schedule).toHaveBeenCalledTimes(1)
  } finally { read.mockRestore(); schedule.mockRestore() }
})

test('a known reserved worker settles after a legacy general-purpose terminal handoff', async () => {
  const f = await fixture()
  const schedule = spyOn(expertResearchAutoContinueService, 'schedule').mockImplementation(() => {})
  try {
    await f.service.recordResearchAudit(f.sessionId, { agentId: 'worker-A', agentType: 'general-purpose', artifactPath: f.artifactPath, entries: [], completed: true })
    expect(f.lifecycle()).toBe('ended')
  } finally { schedule.mockRestore() }
})
