import { afterEach, describe, expect, it } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PackRegistryService } from '../src/server/services/packRegistryService.js'
import { ZipPackAdapter } from '../src/server/services/zipPackAdapter.js'
import { buildWorkflowPacks } from './build-workflow-packs.js'

const repoRoot = path.resolve(import.meta.dir, '..')
const originalId = 'efficient-constrained-dev-debug-workflow-v5'
const packId = 'stradn-managed-development-workflow-v1'
const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function directoryDigest(root: string): Promise<string> {
  const hash = createHash('sha256')
  async function walk(current: string): Promise<void> {
    const entries = (await readdir(current, { withFileTypes: true }))
      .sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      const resolved = path.join(current, entry.name)
      if (entry.isDirectory()) await walk(resolved)
      else if (entry.isFile()) {
        hash.update(path.relative(root, resolved).replaceAll('\\', '/'))
        hash.update('\0')
        hash.update(await readFile(resolved))
        hash.update('\0')
      }
    }
  }
  await walk(root)
  return hash.digest('hex')
}

describe('stradn managed development workflow pack', () => {
  it('copies the canonical workflow assets but fuses planning, implementation, review, and QA into one managed graph phase', async () => {
    const workflowsRoot = path.join(repoRoot, 'workflows')
    const originalRoot = path.join(workflowsRoot, originalId)
    const copiedRoot = path.join(workflowsRoot, packId)
    const originalBefore = await directoryDigest(originalRoot)

    const [originalManifest, copiedManifest, workflow] = await Promise.all([
      readFile(path.join(originalRoot, 'manifest.json'), 'utf8').then(JSON.parse),
      readFile(path.join(copiedRoot, 'manifest.json'), 'utf8').then(JSON.parse),
      readFile(path.join(copiedRoot, 'workflows', `${packId}.workflow.json`), 'utf8').then(JSON.parse),
    ])

    expect(copiedManifest).toMatchObject({
      packId,
      name: 'stradn管理开发',
      version: '1',
      compatibility: { selfContained: true },
    })
    expect(workflow).toMatchObject({ id: packId, name: 'stradn管理开发', version: '1' })
    expect(workflow.phases.map((phase: { id: string }) => phase.id)).toEqual([
      'route-context',
      'scope-plan',
      'stradn-delivery',
      'local-preview',
      'finish-memory',
    ])

    const delivery = workflow.phases.find((phase: { id: string }) => phase.id === 'stradn-delivery')
    expect(delivery).toMatchObject({
      transition: { authority: 'user-confirmation' },
      subagentPolicy: {
        allowedRoles: ['coder', 'reviewer', 'qa', 'debug'],
        maxParallel: 3,
        controlledBy: 'host-runtime',
      },
    })
    expect(delivery.instructions).toContain('plan-lock')
    expect(delivery.instructions).toContain('AskUserQuestion')
    expect(delivery.instructions).toContain('Coder -> Reviewer')
    expect(delivery.instructions).toContain('QA')
    expect(delivery.skillBindings).toContain('workflow:stradn-delivery-manager')
    expect(delivery.outputArtifacts.map((artifact: { id: string }) => artifact.id)).toEqual(
      expect.arrayContaining(['delivery-plan', 'quality-report', 'run-report']),
    )

    const originalSkills = new Set<string>(originalManifest.entrypoints.skills)
    const copiedSkills = new Set<string>(copiedManifest.entrypoints.skills)
    for (const skill of originalSkills) {
      expect(copiedSkills.has(skill), skill).toBe(true)
      expect(await readFile(path.join(copiedRoot, skill)), `${skill} should stay byte-for-byte copied`).toEqual(
        await readFile(path.join(originalRoot, skill)),
      )
    }
    expect(copiedSkills.has('skills/workflow-stradn-delivery-manager/SKILL.md')).toBe(true)

    const tempRoot = await mkdtemp(path.join(tmpdir(), 'stradn-pack-'))
    roots.push(tempRoot)
    const result = await buildWorkflowPacks({
      sourceDir: workflowsRoot,
      outputDir: path.join(tempRoot, 'packs'),
      lockFile: path.join(tempRoot, 'workflow-pack-lock.json'),
      packIds: [packId],
      sourceRevision: 'stradn-test',
    })
    const zipBytes = await readFile(result.packs[0]!.outputPath)
    const zip = await new ZipPackAdapter().read(zipBytes)
    const zipPaths = new Set(zip.entries.map((entry) => entry.path))
    for (const skill of copiedSkills) expect(zipPaths.has(skill), skill).toBe(true)
    const hostTools = await zip.readJson<{ requiredHostTools: Array<{ name: string, supported: boolean }> }>('tools/host-tools.json')
    expect(hostTools.requiredHostTools.every((tool) => tool.supported)).toBe(true)
    expect(hostTools.requiredHostTools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(['Agent', 'AskUserQuestion', 'Bash', 'Read', 'Edit', 'submit_phase_completion']),
    )
    const preview = await new PackRegistryService().previewWorkflowPackZip(zipBytes)
    expect(preview.workflows).toHaveLength(1)
    expect(preview.workflows[0]).toMatchObject({
      id: packId,
      name: 'stradn管理开发',
      version: '1',
      packId,
    })
    expect(await directoryDigest(originalRoot)).toBe(originalBefore)
  })
})
