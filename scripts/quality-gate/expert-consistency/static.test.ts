import { test, expect } from 'bun:test'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, mkdtemp, readdir } from 'node:fs/promises'
import path from 'node:path'
import { ZipPackAdapter } from '../../../src/server/services/zipPackAdapter.js'
import { buildBundledExpertPacks } from '../../build-expert-packs.js'
import { ExpertPackRegistryService, resetExpertPackRegistryForTests } from '../../../src/server/services/expertPackRegistryService.js'
import { ExpertRuntimeService } from '../../../src/server/services/expertRuntimeService.js'
const root = path.resolve(import.meta.dir, '../../..')
const out = process.env.EXPERT_CONSISTENCY_OUT || path.join(root, 'artifacts/expert-consistency-20260917')
const id = 'commercialization-research-report'
const sha = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex')
const adapter = new ZipPackAdapter()

test('all source entries equal current ZIP; official registry loads every declared resource without fallback', async () => {
  await mkdir(out, { recursive: true })
  const built = await buildBundledExpertPacks({ sourceDir: path.join(root, 'experts'), outputDir: path.join(out, 'rebuilt'), packId: id })
  const source = await adapter.read(await readFile(built[0]))
  const zipBytes = await readFile(path.join(root, 'src/server/packs/experts', id + '.zip'))
  const zip = await adapter.read(zipBytes)
  expect(source.entries.map(e => e.path).sort()).toEqual(zip.entries.map(e => e.path).sort())
  const entries = []
  for (const entry of source.entries) {
    const a = await source.readBytes(entry.path), b = await zip.readBytes(entry.path)
    expect(sha(a)).toBe(sha(b))
    entries.push({ path: entry.path, bytes: a.length, sha256: sha(a) })
  }
  const previous = { config: process.env.CLAUDE_CONFIG_DIR, bundle: process.env.CLAUDE_EXPERT_PACKS_DIR }
  process.env.CLAUDE_CONFIG_DIR = await mkdtemp(path.join(out, 'static-config-'))
  process.env.CLAUDE_EXPERT_PACKS_DIR = path.join(out, 'rebuilt')
  resetExpertPackRegistryForTests()
  try {
    const registry = new ExpertPackRegistryService()
    await registry.importExpertPackZip(zipBytes)
    const context = await new ExpertRuntimeService().loadContext(id)
    expect(context.expert.packVersion).toBe('0.13.55-local')
    expect(context.expert.outputMode).toBe('template-fill')
    expect(context.globalSkillFallbackUsed).toBe(false)
    expect(context.prompts.system).toBe(await zip.readText(context.expert.promptPaths.system!))
    expect(context.outputTemplate!.content).toBe(await zip.readText(context.expert.outputTemplatePath!))
    expect(context.skills.length).toBe(context.expert.skillIds.length)
    for (const skill of context.skills) expect(skill.content).toBe(await zip.readText(skill.path))
    for (const tool of context.expert.hostTools) expect(tool.id).toBeTruthy()
    await writeFile(path.join(out, 'loaded-context.json'), JSON.stringify(context, null, 2))
    const observations = []
    for (const p of [path.join(root, 'desktop/src-tauri/binaries/packs/experts', id+'.zip'), path.join(root, 'desktop/src-tauri/target/debug/binaries/packs/experts', id+'.zip'), path.join(process.env.USERPROFILE!, '.claude/cc-jiangxia/experts/packs', id+'.zip')]) {
      try { const b = await readFile(p); const z = await adapter.read(b); observations.push({ path: p, sha256: sha(b), manifest: await z.readJson('manifest.json') }) } catch { observations.push({ path: p, missing: true }) }
    }
    await writeFile(path.join(out, 'fingerprints.json'), JSON.stringify({ sourceVersion: context.expert.packVersion, zipSha256: sha(zipBytes), entries, loadedPromptSha256: sha(context.prompts.system!), loadedSkills: context.skills.map(s => ({ id:s.skillId, bytes:s.bytes, sha256:s.sha256 })), observedOnly: observations }, null, 2))
  } finally {
    for (const [key, value] of Object.entries({ CLAUDE_CONFIG_DIR: previous.config, CLAUDE_EXPERT_PACKS_DIR: previous.bundle })) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
    resetExpertPackRegistryForTests()
  }
}, 60000)

test('actual old ZIP updates through registry; a user override remains user-owned', async () => {
  const priorConfig = process.env.CLAUDE_CONFIG_DIR, priorBundle = process.env.CLAUDE_EXPERT_PACKS_DIR
  process.env.CLAUDE_CONFIG_DIR = await mkdtemp(path.join(out, 'upgrade-config-'))
  process.env.CLAUDE_EXPERT_PACKS_DIR = path.join(out, 'upgrade-bundle')
  await mkdir(process.env.CLAUDE_EXPERT_PACKS_DIR, { recursive: true })
  const bundle = path.join(process.env.CLAUDE_EXPERT_PACKS_DIR, id+'.zip')
  const old = await readFile(path.join(root, 'desktop/src-tauri/binaries/packs/experts', id+'.zip'))
  const current = await readFile(path.join(root, 'src/server/packs/experts', id+'.zip'))
  try {
    await writeFile(bundle, old); resetExpertPackRegistryForTests()
    const registry = new ExpertPackRegistryService()
    expect((await registry.getExpert(id))!.packVersion).toBe('0.13.54-local')
    await writeFile(bundle, current); resetExpertPackRegistryForTests()
    expect((await registry.getExpert(id))!.packVersion).toBe('0.13.55-local')
    await registry.updateExpertPack(id, { name: 'Consistency test custom pack' })
    await writeFile(bundle, old); resetExpertPackRegistryForTests()
    expect((await registry.listPacks()).find(p => p.packId === id)!.name).toBe('Consistency test custom pack')
    expect((await registry.getExpert(id))!.packVersion).toBe('0.13.55-local')
  } finally {
    if (priorConfig === undefined) delete process.env.CLAUDE_CONFIG_DIR; else process.env.CLAUDE_CONFIG_DIR = priorConfig
    if (priorBundle === undefined) delete process.env.CLAUDE_EXPERT_PACKS_DIR; else process.env.CLAUDE_EXPERT_PACKS_DIR = priorBundle
    resetExpertPackRegistryForTests()
  }
}, 60000)
