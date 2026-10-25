import { afterEach, describe, expect, it, spyOn } from 'bun:test'
import { link, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ExpertSessionService } from './expertSessionService.js'
import { sessionService } from './sessionService.js'
import { ExpertPackRegistryService, resetExpertPackRegistryForTests } from './expertPackRegistryService.js'
import { ZipPackAdapter } from './zipPackAdapter.js'

const roots: string[] = []
const previousConfigDir = process.env.CLAUDE_CONFIG_DIR
const restorers: Array<{ mockRestore(): void }> = []
async function tempRoot() {
  const root = await mkdtemp(path.join(tmpdir(), 'expert-material-boundary-'))
  roots.push(root)
  return root
}

async function prepareMaterialSession(projectRoot: string, expertId = 'material-expert') {
  process.env.CLAUDE_CONFIG_DIR = await tempRoot()
  resetExpertPackRegistryForTests()
  await new ExpertPackRegistryService().importExpertPackZip(await new ZipPackAdapter().write({
    'manifest.json': JSON.stringify({ packId: 'material-boundary-pack', name: 'Material Boundary', version: '1.0.0', schemaVersion: 1, type: 'expert-pack', entrypoints: { experts: ['experts/material/expert.json'], skills: ['material-skill'] } }),
    'experts/material/expert.json': JSON.stringify({ id: expertId, name: 'Material Expert', description: 'Non-executable material expert', skillIds: ['material-skill'] }),
    'skills/material-skill/SKILL.md': '# Material Skill\nBuild a material package from the selected project.',
  }))
  restorers.push(spyOn(sessionService, 'getSession').mockResolvedValue({ id: 'material-boundary-session', workDir: projectRoot } as any))
  restorers.push(spyOn(sessionService, 'appendSessionMetadata').mockResolvedValue(undefined))
}

describe('Expert material filesystem boundary', () => {
  afterEach(async () => {
    for (const restorer of restorers.splice(0)) restorer.mockRestore()
    process.env.CLAUDE_CONFIG_DIR = previousConfigDir
    resetExpertPackRegistryForTests()
    await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
  })

  it('rejects a project workflow symlink before a non-executable pack creates outside material directories', async () => {
    const projectRoot = await tempRoot()
    const outside = await tempRoot()
    await symlink(outside, path.join(projectRoot, '.workflow'), 'junction')
    await prepareMaterialSession(projectRoot)

    await expect(new ExpertSessionService().writeMaterialPackage('material-boundary-session', { expertId: 'material-expert' })).rejects.toThrow('outside the allowed directory')

    expect(await readdir(outside)).toEqual([])
  })

  for (const report of ['material-summary.md', 'material.json', 'evidence.md']) {
    it(`rejects a preexisting hard-linked ${report} without modifying the outside file`, async () => {
      const projectRoot = await tempRoot()
      const outside = await tempRoot()
      const sentinel = path.join(outside, 'sentinel.txt')
      await writeFile(sentinel, 'outside sentinel')
      await prepareMaterialSession(projectRoot)
      restorers.push(spyOn(sessionService, 'appendSessionMetadata').mockImplementation(async (_id, metadata) => {
        if (metadata.expert?.status === 'running') {
          const output = path.join(projectRoot, '.workflow/intake/expert-runs', metadata.expert.activeRunId!, 'material-expert', report)
          await link(sentinel, output)
        }
      }))

      // APFS may canonicalize a hard link to its outside sibling first. Both
      // containment checks and the handle's link-count check must deny it.
      await expect(new ExpertSessionService().writeMaterialPackage('material-boundary-session', { expertId: 'material-expert' })).rejects.toThrow(/multiple hard links|outside the allowed directory/)

      expect(await readFile(sentinel, 'utf8')).toBe('outside sentinel')
    })
  }

  for (const expertId of ['../..', '../../../../escaped']) {
    it(`rejects imported expert ID ${expertId} before creating a derived material directory`, async () => {
      const projectRoot = await tempRoot()
      await prepareMaterialSession(projectRoot, expertId)

      await expect(new ExpertSessionService().writeMaterialPackage('material-boundary-session', { expertId })).rejects.toThrow()

      expect(await readdir(projectRoot)).toEqual([])
    })
  }

  it('writes all material reports under the canonical native project root', async () => {
    const projectRoot = await tempRoot()
    await prepareMaterialSession(projectRoot)

    const result = await new ExpertSessionService().writeMaterialPackage('material-boundary-session', { expertId: 'material-expert', title: 'Boundary report' })

    const expectedRoot = path.join(await realpath(projectRoot), '.workflow/intake/expert-runs') + path.sep
    expect(result.materialRef.summaryPath.startsWith(expectedRoot)).toBe(true)
    expect(await readFile(result.materialRef.summaryPath, 'utf8')).toContain('Material Skill')
    expect(JSON.parse(await readFile(result.materialRef.materialJsonPath, 'utf8')).runtime).toBe('expert-pack-runtime')
    expect(await readFile(result.materialRef.evidencePath, 'utf8')).toContain('Material Expert')
    expect(await readdir(path.join(path.dirname(result.materialRef.summaryPath), 'logs'))).toEqual([])
  })
})
