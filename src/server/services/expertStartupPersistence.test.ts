import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { sessionService } from './sessionService.js'
import { expertRuntimeSessionStore } from './expertRuntimeSessionStore.js'
import type { ExpertSessionMetadata } from './expertPackRegistryService.js'

const originalConfigDir = process.env.CLAUDE_CONFIG_DIR
let root: string
function fixture(): ExpertSessionMetadata {
  return {
    mode: 'expert', expertId: 'startup-test', expertName: 'Startup expert', packId: 'startup-test', packVersion: '1',
    status: 'active', materialRefs: [], startedAt: '2026-09-16T00:00:00Z', updatedAt: '2026-09-16T00:00:00Z',
    runtimeBinding: {
      schemaVersion: 1, active: true, expertId: 'startup-test', expertName: 'Startup expert', packId: 'startup-test', packVersion: '1',
      promptSnapshot: 'Write the brief, then dispatch research.', skills: [], tools: [], hostTools: [], permissions: [], activatedAt: '2026-09-16T00:00:00Z',
    },
  }
}
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'expert-startup-persistence-'))
  process.env.CLAUDE_CONFIG_DIR = path.join(root, 'config')
})
afterEach(async () => {
  if (originalConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR
  else process.env.CLAUDE_CONFIG_DIR = originalConfigDir
  await rm(root, { recursive: true, force: true })
})
describe('Expert startup metadata continuity', () => {
  test('retains the complete Expert binding when replacing an empty transcript', async () => {
    const { sessionId, workDir } = await sessionService.createSession(root)
    const expert = fixture()
    await sessionService.appendSessionMetadata(sessionId, { workDir, expert })
    await sessionService.clearSessionTranscript(sessionId, workDir)
    expect((await sessionService.getSession(sessionId))?.expert).toEqual(expert)
    await sessionService.clearSessionTranscript(sessionId, workDir)
    expect((await sessionService.getSession(sessionId))?.expert).toEqual(expert)
  })
  test('reads legacy missing metadata from the runtime store without rewriting chat', async () => {
    const { sessionId } = await sessionService.createSession(root)
    const expert = fixture()
    const session = await sessionService.getSession(sessionId)
    const transcript = path.join(process.env.CLAUDE_CONFIG_DIR!, 'projects', session!.projectPath, sessionId + '.jsonl')
    const before = await readFile(transcript, 'utf8')
    await expertRuntimeSessionStore.save(sessionId, expert)
    expect((await sessionService.getSession(sessionId))?.expert).toEqual(expert)
    const listed = await sessionService.listSessions({ limit: 50 })
    expect(listed.sessions.find(item => item.id === sessionId)?.expert).toEqual(expert)
    expect(await readFile(transcript, 'utf8')).toBe(before)
  })
  test('preserves explicit exit instead of reviving a stale active runtime record', async () => {
    const { sessionId, workDir } = await sessionService.createSession(root)
    const active = fixture()
    const exited: ExpertSessionMetadata = { ...active, status: 'exited', runtimeBinding: undefined }
    await expertRuntimeSessionStore.save(sessionId, active)
    await sessionService.appendSessionMetadata(sessionId, { workDir, expert: exited })
    await sessionService.clearSessionTranscript(sessionId, workDir)
    expect((await sessionService.getSession(sessionId))?.expert).toEqual(exited)
  })
})
