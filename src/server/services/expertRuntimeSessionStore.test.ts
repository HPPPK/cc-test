import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ExpertRuntimeSessionStore } from './expertRuntimeSessionStore.js'
import type { ExpertSessionMetadata } from './expertPackRegistryService.js'

const previousConfigDir = process.env.CLAUDE_CONFIG_DIR
const tempRoots: string[] = []

function activeExpert(): ExpertSessionMetadata {
  return {
    mode: 'expert',
    expertId: 'commercialization-research-report',
    expertName: '新品商业化调研报告专家',
    packId: 'commercialization-research-report',
    packVersion: '1.0.0',
    status: 'active',
    materialRefs: [], startedAt: '2026-05-20T00:00:00Z', updatedAt: '2026-05-20T00:00:00Z',
    runtimeBinding: {
      schemaVersion: 1,
      packId: 'commercialization-research-report', packVersion: '1.0.0',
      permissions: [], activatedAt: '2026-05-20T00:00:00Z',
      active: true,
      expertId: 'commercialization-research-report',
      expertName: '新品商业化调研报告专家',
      promptSnapshot: 'Test prompt',
      skills: [],
      tools: [],
      hostTools: [],
    },
  }
}

afterEach(async () => {
  if (previousConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR
  else process.env.CLAUDE_CONFIG_DIR = previousConfigDir
  await Promise.all(tempRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('ExpertRuntimeSessionStore', () => {
  test('persists and removes an active Expert runtime binding', async () => {
    const configDir = await mkdtemp(path.join(tmpdir(), 'expert-runtime-store-'))
    tempRoots.push(configDir)
    process.env.CLAUDE_CONFIG_DIR = configDir
    const store = new ExpertRuntimeSessionStore()
    const sessionId = '11111111-2222-3333-4444-555555555555'
    const expert = activeExpert()

    await store.save(sessionId, expert)
    await expect(store.get(sessionId)).resolves.toEqual(expert)

    await store.remove(sessionId)
    await expect(store.get(sessionId)).resolves.toBeUndefined()
  })

  test('ignores ordinary non-UUID chat IDs instead of throwing', async () => {
    const configDir = await mkdtemp(path.join(tmpdir(), 'expert-runtime-store-'))
    tempRoots.push(configDir)
    process.env.CLAUDE_CONFIG_DIR = configDir
    const store = new ExpertRuntimeSessionStore()

    await expect(store.get('chat-inspection-123')).resolves.toBeUndefined()
    await expect(store.remove('chat-inspection-123')).resolves.toBeUndefined()
  })
})
