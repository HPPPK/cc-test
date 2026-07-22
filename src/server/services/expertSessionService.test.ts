import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { sessionService } from './sessionService.js'
import { ExpertSessionService } from './expertSessionService.js'
import { ExpertPackRegistryService, resetExpertPackRegistryForTests } from './expertPackRegistryService.js'
import { ZipPackAdapter } from './zipPackAdapter.js'

const adapter = new ZipPackAdapter()
const previousConfigDir = process.env.CLAUDE_CONFIG_DIR
const tempRoots: string[] = []

async function makeTempRoot(prefix: string) {
  const root = await mkdtemp(path.join(tmpdir(), prefix))
  tempRoots.push(root)
  return root
}

async function installExpert(configRoot: string) {
  process.env.CLAUDE_CONFIG_DIR = configRoot
  resetExpertPackRegistryForTests()
  await new ExpertPackRegistryService().importExpertPackZip(await adapter.write({
    'manifest.json': JSON.stringify({ packId: 'session-pack', name: 'Session Pack', version: '1.0.0', schemaVersion: 1, type: 'expert-pack', entrypoints: { experts: ['experts/session/expert.json'], skills: ['session-skill'] } }),
    'experts/session/expert.json': JSON.stringify({ id: 'session-expert', name: 'Session Expert', description: 'Session test expert', promptPaths: { system: 'experts/session/system.md' }, skillIds: ['session-skill'] }),
    'experts/session/system.md': 'Session package prompt',
    'skills/session-skill/SKILL.md': 'Session package skill',
  }))
}

describe('ExpertSessionService', () => {
  afterEach(async () => {
    process.env.CLAUDE_CONFIG_DIR = previousConfigDir
    resetExpertPackRegistryForTests()
    await Promise.all(tempRoots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  it('enters and exits package-driven Expert Mode without workflow state', async () => {
    const configRoot = await makeTempRoot('expert-session-config-')
    const projectRoot = await makeTempRoot('expert-session-project-')
    await installExpert(configRoot)
    const service = new ExpertSessionService()
    const { sessionId } = await sessionService.createSession(projectRoot)

    const entered = await service.enterExpertMode(sessionId, 'session-expert')
    const expertSession = await sessionService.getSession(sessionId)

    expect(entered.mode).toBe('expert')
    expect(entered.expertId).toBe('session-expert')
    expect(entered.runtimeBinding).toMatchObject({ schemaVersion: 1, expertId: 'session-expert', active: true })
    expect(entered.runtimeBinding?.promptSnapshot).toContain('Session package prompt')
    expect(expertSession?.workflow).toBeUndefined()

    const written = await service.writeMaterialPackage(sessionId, { title: 'Session result' })
    const afterWrite = await sessionService.getSession(sessionId)
    const expectedRoot = path.resolve(await realpath(projectRoot), '.workflow', 'intake', 'expert-runs')

    expect(written.materialRef.summaryPath.startsWith(expectedRoot + path.sep)).toBe(true)
    expect(afterWrite?.expert?.materialRefs[0]?.runId).toBe(written.materialRef.runId)
    expect(JSON.parse(await readFile(written.materialRef.materialJsonPath, 'utf8')).runtime).toBe('expert-pack-runtime')
    expect(await readFile(written.materialRef.evidencePath, 'utf8')).toContain('Session package prompt')

    const exited = await service.exitExpertMode(sessionId)
    expect(exited.status).toBe('exited')
    expect(exited.runtimeBinding).toBeUndefined()
    expect(exited.materialRefs[0]?.runId).toBe(written.materialRef.runId)
  })
})
