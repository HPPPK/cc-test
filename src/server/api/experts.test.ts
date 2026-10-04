import { afterEach, describe, expect, it } from 'bun:test'
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { handleExpertsApi } from './experts.js'
import { resetExpertPackRegistryForTests } from '../services/expertPackRegistryService.js'
import { ZipPackAdapter } from '../services/zipPackAdapter.js'

const adapter = new ZipPackAdapter()
const tempRoots: string[] = []
const previousConfigDir = process.env.CLAUDE_CONFIG_DIR
const previousBundledPacksDir = process.env.CLAUDE_EXPERT_PACKS_DIR

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
      profile: { tagline: 'Packaged tagline', workflow: [{ id: 'audit', title: 'Audit' }] },
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
  process.env.CLAUDE_EXPERT_PACKS_DIR = path.join(root, 'bundled')
  resetExpertPackRegistryForTests()
  return root
}

describe('experts API', () => {
  afterEach(async () => {
    process.env.CLAUDE_CONFIG_DIR = previousConfigDir
    process.env.CLAUDE_EXPERT_PACKS_DIR = previousBundledPacksDir
    resetExpertPackRegistryForTests()
    await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
  })

  it('lists and updates expert categories before the generic resource fallback', async () => {
    await setup()

    const listed = await handleExpertsApi(new Request('http://localhost/api/experts/categories'), new URL('http://localhost'), ['api', 'experts', 'categories'])
    expect(listed.status).toBe(200)
    expect((await listed.json()).categories.map((category: { id: string }) => category.id)).toEqual(['product', 'development', 'design', 'uncategorized'])

    const updated = await handleExpertsApi(new Request('http://localhost/api/experts/categories', {
      method: 'PUT',
      body: JSON.stringify({ categories: [{ id: 'research', name: '市场研究' }] }),
    }), new URL('http://localhost'), ['api', 'experts', 'categories'])
    expect(updated.status).toBe(200)
    expect((await updated.json()).categories.map((category: { id: string }) => category.id)).toEqual(['research', 'uncategorized'])
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
  it('applies a confirmed bundled Expert ZIP update through the API and keeps a backup', async () => {
    const root = await setup()
    const bundleDir = path.join(root, 'bundled')
    await mkdir(bundleDir, { recursive: true })
    const first = entries()
    first['experts/api/system.md'] = 'Official first prompt'
    await writeFile(path.join(bundleDir, 'api-pack.zip'), await adapter.write(first))
    resetExpertPackRegistryForTests()

    const local = entries()
    local['experts/api/system.md'] = 'My local prompt'
    const dataBase64 = Buffer.from(await adapter.write(local)).toString('base64')
    await handleExpertsApi(new Request('http://localhost/api/experts/packs/import', { method: 'POST', body: JSON.stringify({ dataBase64 }) }), new URL('http://localhost'), ['api', 'experts', 'packs', 'import'])

    const latest = entries()
    latest['manifest.json'] = JSON.stringify({
      packId: 'api-pack', name: 'API Pack', version: '1.1.0', schemaVersion: 1, type: 'expert-pack', description: 'API test pack',
      entrypoints: { experts: ['experts/api/expert.json'], skills: ['api-skill'] },
    })
    latest['experts/api/system.md'] = 'Official latest prompt'
    await writeFile(path.join(bundleDir, 'api-pack.zip'), await adapter.write(latest))
    resetExpertPackRegistryForTests()

    const listed = await handleExpertsApi(new Request('http://localhost/api/experts/packs'), new URL('http://localhost'), ['api', 'experts', 'packs'])
    const listedBody = await listed.json()
    const apiPack = listedBody.packs.find((pack: { packId: string }) => pack.packId === 'api-pack')
    expect(apiPack?.bundledUpdate).toEqual(expect.objectContaining({ bundledVersion: '1.1.0' }))

    const response = await handleExpertsApi(new Request('http://localhost/api/experts/packs/api-pack/bundled-update', { method: 'POST', body: '{}' }), new URL('http://localhost'), ['api', 'experts', 'packs', 'api-pack', 'bundled-update'])
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(expect.objectContaining({ bundledVersion: '1.1.0', backupFilename: expect.any(String) }))
  })

  it('authors a standalone Expert ZIP without creating Workflow ZIP storage', async () => {
    const root = await setup()
    const response = await handleExpertsApi(
      new Request('http://localhost/api/experts/packs/authoring', {
        method: 'POST',
        body: JSON.stringify({
          operation: 'create',
          pack: {
            packId: 'api-authored-expert',
            name: 'API Authored Expert',
            version: '1.0.0',
            description: 'Created through the separate Expert authoring endpoint.',
            expert: {
              id: 'api-authored-expert',
              name: 'API Authored Expert',
              systemPromptContent: 'You are an API-authored Expert.',
            },
          },
        }),
      }),
      new URL('http://localhost'),
      ['api', 'experts', 'packs', 'authoring'],
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      operation: 'create',
      status: 'succeeded',
      persisted: true,
      affectedPack: { packId: 'api-authored-expert' },
    })
    await expect(stat(path.join(root, 'cc-jiangxia', 'experts', 'packs', 'api-authored-expert.zip'))).resolves.toBeDefined()
    await expect(stat(path.join(root, 'cc-jiangxia', 'workflows', 'packs'))).rejects.toThrow()
  })

  it('returns a clear error when an imported ZIP declares a missing Skill file', async () => {
    await setup()
    const incomplete = entries()
    delete incomplete['skills/api-skill/SKILL.md']
    const dataBase64 = Buffer.from(await adapter.write(incomplete)).toString('base64')

    const response = await handleExpertsApi(
      new Request('http://localhost/api/experts/packs/import/preview', { method: 'POST', body: JSON.stringify({ dataBase64 }) }),
      new URL('http://localhost'),
      ['api', 'experts', 'packs', 'import', 'preview'],
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'EXPERT_PACK_INCOMPLETE',
      message: '专家包不完整，缺少 Skill 文件：skills/api-skill/SKILL.md。请重新导入完整专家 ZIP。',
    })
  })

  it('reads the packaged profile and stores editable profile overrides locally', async () => {
    await setup()
    const dataBase64 = Buffer.from(await adapter.write(entries())).toString('base64')
    await handleExpertsApi(new Request('http://localhost/api/experts/packs/import', { method: 'POST', body: JSON.stringify({ dataBase64 }) }), new URL('http://localhost'), ['api', 'experts', 'packs', 'import'])

    const initial = await handleExpertsApi(new Request('http://localhost/api/experts/profiles/api-expert'), new URL('http://localhost'), ['api', 'experts', 'profiles', 'api-expert'])
    expect(initial.status).toBe(200)
    expect((await initial.json()).profile.tagline).toBe('Packaged tagline')

    const updated = await handleExpertsApi(new Request('http://localhost/api/experts/profiles/api-expert', {
      method: 'PUT',
      body: JSON.stringify({ profile: { tagline: 'Local tagline', memories: [{ id: 'm1', content: 'Use brand terminology.', createdAt: '2026-07-22T00:00:00.000Z' }] } }),
    }), new URL('http://localhost'), ['api', 'experts', 'profiles', 'api-expert'])
    expect(updated.status).toBe(200)
    const body = await updated.json()
    expect(body.profile.tagline).toBe('Local tagline')
    expect(body.profile.workflow[0].title).toBe('Audit')
  })


  it('rejects unknown online Skill discovery sources before a provider is contacted', async () => {
    const response = await handleExpertsApi(
      new Request('http://localhost/api/experts/discovery?query=research&source=unknown'),
      new URL('http://localhost/api/experts/discovery?query=research&source=unknown'),
      ['api', 'experts', 'discovery'],
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'BAD_REQUEST', message: 'Skill discovery source must be web, qclaw, or all.' })
  })

  it('validates online Skill discovery requests before a provider is contacted', async () => {
    const response = await handleExpertsApi(
      new Request('http://localhost/api/experts/discovery?query='),
      new URL('http://localhost/api/experts/discovery?query='),
      ['api', 'experts', 'discovery'],
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'BAD_REQUEST', message: 'A skill discovery query is required.' })
  })
})
