import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { handleExpertsApi } from './experts.js'
import { resetExpertPackRegistryForTests } from '../services/expertPackRegistryService.js'
import { ZipPackAdapter } from '../services/zipPackAdapter.js'

const adapter = new ZipPackAdapter()
const tempRoots: string[] = []
const previousConfigDir = process.env.CLAUDE_CONFIG_DIR

function entries() {
  return {
    'manifest.json': JSON.stringify({
      packId: 'api-pack',
      name: 'API Pack',
      version: '1.0.0',
      schemaVersion: 1,
      type: 'expert-pack',
      description: 'API test pack',
      entrypoints: { experts: ['experts/api/expert.json'], skills: ['api-skill'] },
    }),
    'experts/api/expert.json': JSON.stringify({
      id: 'api-expert',
      name: 'API Expert',
      description: 'API test expert',
      promptPaths: { system: 'experts/api/system.md' },
      skillIds: ['api-skill'],
    }),
    'experts/api/system.md': 'API system prompt',
    'skills/api-skill/SKILL.md': 'API skill',
  }
}

async function setup() {
  const root = await mkdtemp(path.join(tmpdir(), 'expert-api-'))
  tempRoots.push(root)
  process.env.CLAUDE_CONFIG_DIR = root
  resetExpertPackRegistryForTests()
}

describe('experts API', () => {
  afterEach(async () => {
    process.env.CLAUDE_CONFIG_DIR = previousConfigDir
    resetExpertPackRegistryForTests()
    await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
  })

  it('imports, updates, copies, and deletes only ZIP-backed expert packages', async () => {
    await setup()
    const dataBase64 = Buffer.from(await adapter.write(entries())).toString('base64')
    const imported = await handleExpertsApi(new Request('http://localhost/api/experts/packs/import', { method: 'POST', body: JSON.stringify({ dataBase64 }) }), new URL('http://localhost'), ['api', 'experts', 'packs', 'import'])
    expect(imported.status).toBe(201)

    const updated = await handleExpertsApi(new Request('http://localhost/api/experts/packs/api-pack', { method: 'PUT', body: JSON.stringify({ name: 'Updated API Pack' }) }), new URL('http://localhost'), ['api', 'experts', 'packs', 'api-pack'])
    expect(updated.status).toBe(200)
    expect((await updated.json()).name).toBe('Updated API Pack')

    const copied = await handleExpertsApi(new Request('http://localhost/api/experts/packs/api-pack/copy', { method: 'POST', body: '{}' }), new URL('http://localhost'), ['api', 'experts', 'packs', 'api-pack', 'copy'])
    expect(copied.status).toBe(201)

    const deleted = await handleExpertsApi(new Request('http://localhost/api/experts/packs/api-pack', { method: 'DELETE' }), new URL('http://localhost'), ['api', 'experts', 'packs', 'api-pack'])
    expect(deleted.status).toBe(204)
  })
})
