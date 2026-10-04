import { afterEach, describe, expect, it } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ZipPackAdapter } from '../src/server/services/zipPackAdapter.js'
import {
  buildWorkflowPacks,
  checkWorkflowPacks,
  auditWorkflowPackLayer,
} from './build-workflow-packs.js'

const roots: string[] = []
const adapter = new ZipPackAdapter()

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'workflow-packs-'))
  roots.push(root)
  const sourceDir = path.join(root, 'workflows')
  const outputDir = path.join(root, 'packs')
  const packRoot = path.join(sourceDir, 'sample-workflow')
  await mkdir(path.join(packRoot, 'workflows'), { recursive: true })
  await mkdir(path.join(packRoot, 'skills', 'workflow-lightweight-batch-review'), { recursive: true })
  await writeFile(path.join(packRoot, 'manifest.json'), JSON.stringify({
    packId: 'sample-workflow',
    name: 'Sample',
    version: '3',
    schemaVersion: 2,
    type: 'workflow-pack',
    entrypoints: {
      workflows: ['workflows/sample-workflow.workflow.json'],
      experts: [],
      skills: ['skills/workflow-lightweight-batch-review/SKILL.md'],
    },
  }))
  await writeFile(path.join(packRoot, 'workflows', 'sample-workflow.workflow.json'), JSON.stringify({
    id: 'sample-workflow',
    name: 'Sample',
    version: '3',
    source: 'pack',
    phases: [{ id: 'plan', name: 'Plan' }],
  }))
  await writeFile(path.join(packRoot, 'skills', 'workflow-lightweight-batch-review', 'SKILL.md'), '# review\r\n')
  await writeFile(path.join(packRoot, 'README.md'), '# Sample\r\n')
  return { root, sourceDir, outputDir, packRoot, lockFile: path.join(root, 'workflow-pack-lock.json') }
}

describe('workflow pack deterministic builder', () => {
  it('normalizes sources, writes checksums and produces byte-identical ZIPs', async () => {
    const fx = await fixture()
    const first = await buildWorkflowPacks({ ...fx, sourceRevision: 'fixture' })
    const firstBytes = await readFile(first.packs[0]!.outputPath)
    const second = await buildWorkflowPacks({ ...fx, sourceRevision: 'fixture' })
    const secondBytes = await readFile(second.packs[0]!.outputPath)

    expect(Buffer.compare(firstBytes, secondBytes)).toBe(0)
    expect(first.packs[0]).toMatchObject({
      packId: 'sample-workflow',
      packVersion: '3',
      workflowVersion: '3',
      entrypoint: 'workflows/sample-workflow.workflow.json',
    })
    expect(first.packs[0]!.sha256).toBe(createHash('sha256').update(firstBytes).digest('hex'))

    const archive = await adapter.read(firstBytes)
    expect(archive.entries.map((entry) => entry.path)).toEqual([...archive.entries.map((entry) => entry.path)].sort())
    const checksums = await archive.readJson<{ files: Record<string, string> }>('checksums.json')
    expect(checksums.files['manifest.json']).toMatch(/^sha256-[a-f0-9]{64}$/)
    expect(checksums.files['checksums.json']).toBeUndefined()
    expect(await archive.readText('README.md')).toBe('# Sample\n')
    expect(await archive.readText('manifest.json')).toEndWith('\n')
  })

  it('rejects manifest/workflow version drift before writing a ZIP', async () => {
    const fx = await fixture()
    const workflowPath = path.join(fx.packRoot, 'workflows', 'sample-workflow.workflow.json')
    const workflow = JSON.parse(await readFile(workflowPath, 'utf8'))
    workflow.version = '4'
    await writeFile(workflowPath, JSON.stringify(workflow))

    await expect(buildWorkflowPacks({ ...fx })).rejects.toThrow('version')
  })

  it('check mode detects stale repository ZIPs without mutating them', async () => {
    const fx = await fixture()
    await buildWorkflowPacks({ ...fx, sourceRevision: 'fixture' })
    const zipPath = path.join(fx.outputDir, 'sample-workflow.zip')
    const original = await readFile(zipPath)
    await writeFile(path.join(fx.packRoot, 'README.md'), '# changed\n')

    await expect(checkWorkflowPacks({ ...fx, sourceRevision: 'fixture' })).rejects.toThrow('out of date')
    expect(Buffer.compare(await readFile(zipPath), original)).toBe(0)
  })

  it('audits a copied pack layer against workflow-pack-lock.json', async () => {
    const fx = await fixture()
    const result = await buildWorkflowPacks({ ...fx, sourceRevision: 'fixture' })
    await expect(auditWorkflowPackLayer({ packDir: fx.outputDir, lockFile: fx.lockFile })).resolves.toEqual({
      ok: true,
      packs: result.packs.map((pack) => expect.objectContaining({ packId: pack.packId, sha256: pack.sha256 })),
    })
    await writeFile(path.join(fx.outputDir, 'sample-workflow.zip'), 'corrupt')
    await expect(auditWorkflowPackLayer({ packDir: fx.outputDir, lockFile: fx.lockFile })).rejects.toThrow('checksum mismatch')
  })
})
