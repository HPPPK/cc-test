import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  PackRegistryService,
  getWorkflowPackStorageDir,
  resetPackRegistryForTests,
} from './packRegistryService.js'
import { ZipPackAdapter } from './zipPackAdapter.js'

let tempConfigDir: string
let originalConfigDir: string | undefined

const encoder = new TextEncoder()

function jsonBytes(value: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(value, null, 2))
}

function validPhase(overrides: Record<string, unknown> = {}) {
  return {
    id: 'plan',
    name: 'Plan',
    instructions: 'Plan the work.',
    requiredIntake: ['Use the request.'],
    handoffRules: ['Summarize the plan.'],
    outputArtifact: {
      id: 'plan-output',
      name: 'Plan Output',
      kind: 'markdown',
      description: 'A plan.',
      required: true,
    },
    completionCriteria: {
      type: 'manual-checklist',
      description: 'Plan is complete.',
    },
    transition: { authority: 'auto' },
    ...overrides,
  }
}

function validWorkflow(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 2,
    id: 'guided-development',
    version: '1.0.0',
    name: 'Guided Development',
    description: 'A workflow loaded from a pack.',
    phases: [validPhase()],
    ...overrides,
  }
}

function manifest(overrides: Record<string, unknown> = {}) {
  return {
    packId: 'guided-development-pack',
    name: 'Guided Development Pack',
    version: '1.0.0',
    schemaVersion: 1,
    type: 'workflow-pack',
    description: 'Test pack',
    entrypoints: {
      workflows: ['workflows/guided-development.workflow.json'],
      experts: [],
      skills: [],
    },
    permissions: [],
    modelRequirements: {},
    compatibility: {
      workflowSchemaVersion: 2,
    },
    ...overrides,
  }
}

async function makeZip(entries: Record<string, Uint8Array | string>): Promise<Uint8Array> {
  return new ZipPackAdapter().write(entries)
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function writeUserSkill(root: string, name = 'my-skill', body = 'Use this test skill.'): Promise<void> {
  const skillDir = path.join(root, 'skills', name)
  await fs.mkdir(skillDir, { recursive: true })
  await fs.writeFile(path.join(skillDir, 'SKILL.md'), `---\nname: "${name}"\nreferenceId: "${name}"\n---\n# ${name}\n\n${body}\n`, 'utf-8')
  await fs.writeFile(path.join(skillDir, 'instructions.md'), `# Instructions for ${name}\n`, 'utf-8')
}

async function makeWorkflowPackZip(overrides: {
  manifest?: Record<string, unknown>
  workflow?: Record<string, unknown>
  entries?: Record<string, Uint8Array>
} = {}): Promise<Uint8Array> {
  return makeZip({
    'manifest.json': jsonBytes(manifest(overrides.manifest ?? {})),
    'workflows/guided-development.workflow.json': jsonBytes(validWorkflow(overrides.workflow ?? {})),
    ...(overrides.entries ?? {}),
  })
}

beforeEach(async () => {
  originalConfigDir = process.env.CLAUDE_CONFIG_DIR
  tempConfigDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-pack-registry-'))
  process.env.CLAUDE_CONFIG_DIR = tempConfigDir
  resetPackRegistryForTests()
})

afterEach(async () => {
  if (originalConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR
  } else {
    process.env.CLAUDE_CONFIG_DIR = originalConfigDir
  }
  resetPackRegistryForTests()
  await fs.rm(tempConfigDir, { recursive: true, force: true })
})

describe('PackRegistryService', () => {
  test('imports a workflow ZIP pack and lists schemaVersion 2 workflows from registry', async () => {
    const service = new PackRegistryService()
    const archive = await makeWorkflowPackZip()

    const result = await service.importWorkflowPackZip(archive)
    const workflows = await service.listWorkflows()

    expect(result.pack.packId).toBe('guided-development')
    expect(result.pack.storage.path).toBe('workflows/packs/guided-development.zip')
    expect(result.workflows[0]?.schemaVersion).toBe(2)
    expect(workflows.map((workflow) => workflow.id)).toContain('guided-development')
    const listed = workflows.find((workflow) => workflow.id === 'guided-development')
    expect(listed?.source).toBe('user')
    expect(listed?.editable).toBe(true)
    expect(listed?.packId).toBe('guided-development')
    expect(await fileExists(path.join(getWorkflowPackStorageDir(), 'guided-development.zip'))).toBe(true)
  })

  test('loads the latest same-id workflow directly from the canonical ZIP after overwrite', async () => {
    const service = new PackRegistryService()
    await service.importWorkflowPackZip(await makeWorkflowPackZip({
      workflow: { id: 'guided-development', name: 'Old Workflow', version: '1' },
    }))
    await service.importWorkflowPackZip(await makeWorkflowPackZip({
      workflow: { id: 'guided-development', name: 'Updated Workflow', version: '2' },
    }))

    const current = await service.loadStoredWorkflowTemplate('guided-development')

    expect(current.id).toBe('guided-development')
    expect(current.name).toBe('Updated Workflow')
    expect(current.version).toBe('2')
    expect(current.source).toBe('user')
    expect(current.editable).toBe(true)
  })

  test('keeps duplicate workflow-id ZIPs intact while listing the latest workflow view', async () => {
    const service = new PackRegistryService()
    const oldArchive = await makeWorkflowPackZip({
      manifest: { packId: 'old-debug-pack', name: 'Old Debug Pack' },
      workflow: { id: 'debug-repair-workflow-v8', name: 'Old Debug Workflow', version: '1' },
    })
    const newArchive = await makeWorkflowPackZip({
      manifest: { packId: 'new-debug-pack', name: 'New Debug Pack' },
      workflow: { id: 'debug-repair-workflow-v8', name: 'New Debug Workflow', version: '2' },
    })

    const storageDir = getWorkflowPackStorageDir()
    await fs.mkdir(storageDir, { recursive: true })
    const oldPath = path.join(storageDir, 'debug-repair-workflow-v8-old.zip')
    await fs.writeFile(oldPath, oldArchive)
    const oldTime = new Date('2026-01-01T00:00:00.000Z')
    await fs.utimes(oldPath, oldTime, oldTime)

    await service.importWorkflowPackZip(newArchive)
    const workflows = (await service.listWorkflows()).filter((workflow) => workflow.id === 'debug-repair-workflow-v8')

    expect(workflows).toHaveLength(1)
    expect(workflows[0]?.name).toBe('New Debug Workflow')
    expect(workflows[0]?.packId).toBe('debug-repair-workflow-v8')
    expect(await fileExists(path.join(storageDir, 'debug-repair-workflow-v8.zip'))).toBe(true)
    expect(await fileExists(oldPath)).toBe(true)
  })

  test('saving one workflow does not delete unrelated stored ZIPs', async () => {
    const service = new PackRegistryService()
    const unrelatedPath = path.join(getWorkflowPackStorageDir(), 'unrelated-invalid.zip')
    await fs.mkdir(path.dirname(unrelatedPath), { recursive: true })
    await fs.writeFile(unrelatedPath, Buffer.from('not-a-valid-workflow-pack'))

    await service.writeSingleWorkflowPacks([validWorkflow({ id: 'saved-workflow' })])

    expect(await fileExists(unrelatedPath)).toBe(true)
    expect(await fileExists(path.join(getWorkflowPackStorageDir(), 'saved-workflow.zip'))).toBe(true)
  })

  test('does not list legacy archive registry packs as read-only runtime workflows', async () => {
    const service = new PackRegistryService()
    const archive = await makeWorkflowPackZip({
      manifest: { packId: 'legacy-archive-pack', name: 'Legacy Archive Pack' },
      workflow: { id: 'test1', name: 'test', version: '1' },
    })
    const appDir = path.join(tempConfigDir, 'cc-jiangxia')
    const archiveDir = path.join(appDir, 'packs', 'archives')
    await fs.mkdir(archiveDir, { recursive: true })
    await fs.writeFile(path.join(archiveDir, 'workflow-export-test1.zip'), archive)
    await fs.writeFile(path.join(appDir, 'packs', 'registry.json'), `${JSON.stringify({
      schemaVersion: 1,
      packs: [{
        packId: 'legacy-archive-pack',
        name: 'Legacy Archive Pack',
        version: '1.0.0',
        type: 'workflow-pack',
        description: 'Old exported archive.',
        manifest: manifest({ packId: 'legacy-archive-pack', name: 'Legacy Archive Pack' }),
        storage: { kind: 'zip', path: 'archives/workflow-export-test1.zip' },
        workflows: [{
          id: 'test1',
          name: 'test',
          version: '1',
          schemaVersion: 2,
          description: '',
          entrypoint: 'workflows/guided-development.workflow.json',
          phaseCount: 1,
          phaseNames: ['Plan'],
        }],
        importedAt: '2026-01-01T00:00:00.000Z',
      }],
    }, null, 2)}\n`, 'utf-8')
    resetPackRegistryForTests()

    expect((await service.listPacks()).map((pack) => pack.packId)).toContain('legacy-archive-pack')
    expect((await service.listWorkflows()).map((workflow) => workflow.id)).not.toContain('test1')

    await service.importWorkflowPackZip(archive)
    const imported = (await service.listWorkflows()).find((workflow) => workflow.id === 'test1')
    expect(imported?.source).toBe('user')
    expect(imported?.editable).toBe(true)
    expect(await fileExists(path.join(getWorkflowPackStorageDir(), 'test1.zip'))).toBe(true)
  })

  test('fails ZIP import when manifest is missing', async () => {
    const service = new PackRegistryService()
    const archive = await makeZip({
      'workflows/guided-development.workflow.json': jsonBytes(validWorkflow()),
    })

    await expect(service.importWorkflowPackZip(archive)).rejects.toThrow(/manifest\.json/i)
  })

  test('fails ZIP import when a workflow entrypoint is missing', async () => {
    const service = new PackRegistryService()
    const archive = await makeZip({
      'manifest.json': jsonBytes(manifest()),
    })

    await expect(service.importWorkflowPackZip(archive)).rejects.toThrow(/entrypoint/i)
  })

  test('keeps legacy workflow JSON import compatible through pack wrapping', async () => {
    const service = new PackRegistryService()

    const result = await service.importLegacyWorkflowJson(validWorkflow({ id: 'legacy-flow' }))
    const workflows = await service.listWorkflows()

    expect(result.pack.packId).toContain('legacy-flow')
    expect(workflows.map((workflow) => workflow.id)).toContain('legacy-flow')
  })

  test('exports a ZIP pack containing manifest and workflow entrypoints', async () => {
    const service = new PackRegistryService()
    const exported = await service.exportWorkflowPackZip({
      packId: 'exported-pack',
      name: 'Exported Pack',
      version: '1.0.0',
      workflows: [validWorkflow({ id: 'exported-flow' })],
    })
    const zip = await new ZipPackAdapter().read(exported)

    expect(zip.has('manifest.json')).toBe(true)
    expect(zip.has('workflows/exported-flow.workflow.json')).toBe(true)
    const parsedManifest = JSON.parse(await zip.readText('manifest.json')) as { entrypoints: { workflows: string[] } }
    expect(parsedManifest.entrypoints.workflows).toEqual(['workflows/exported-flow.workflow.json'])
  })

  test('exports v2 ZIP pack with real skill files, host tools, and checksums', async () => {
    await writeUserSkill(tempConfigDir, 'my-skill')
    const service = new PackRegistryService()
    const exported = await service.exportWorkflowPackZip({
      packId: 'skill-pack',
      name: 'Skill Pack',
      workflows: [validWorkflow({
        id: 'skill-flow',
        phases: [validPhase({
          skills: [{ name: 'my-skill', source: 'user', referenceId: 'my-skill' }],
          toolPolicy: { allowedTools: ['Read', 'Bash'] },
        })],
      })],
    })
    const zip = await new ZipPackAdapter().read(exported)
    const parsedManifest = await zip.readJson<{ schemaVersion: number; entrypoints: { skills: string[] }; dependencies: { packagedSkills: Array<{ aliases?: string[]; referenceMappings?: Array<{ field: string; reference: string; referenceId?: string }> }>; requiredHostTools: Array<{ name: string; supported: boolean }> } }>('manifest.json')

    expect(parsedManifest.schemaVersion).toBe(2)
    expect(parsedManifest.entrypoints.skills).toEqual(['skills/my-skill/SKILL.md'])
    expect(zip.has('skills/my-skill/SKILL.md')).toBe(true)
    expect(zip.has('skills/my-skill/instructions.md')).toBe(true)
    expect(zip.has('tools/host-tools.json')).toBe(true)
    expect(zip.has('checksums.json')).toBe(true)
    expect(parsedManifest.dependencies.packagedSkills).toHaveLength(1)
    expect(parsedManifest.dependencies.packagedSkills[0]?.aliases).toEqual(expect.arrayContaining(['my-skill']))
    expect(parsedManifest.dependencies.packagedSkills[0]?.referenceMappings).toEqual([
      expect.objectContaining({
        field: 'skills',
        reference: 'my-skill',
        referenceId: 'my-skill',
      }),
    ])
    expect(parsedManifest.dependencies.requiredHostTools).toEqual([
      { name: 'Bash', supported: true },
      { name: 'Read', supported: true },
    ])
  })

  test('writes single workflow ZIPs with real files for user-prefixed skill bindings', async () => {
    await writeUserSkill(tempConfigDir, 'brainstorming')
    await writeUserSkill(tempConfigDir, 'managed-code-review-skill')

    const result = await new PackRegistryService().writeSingleWorkflowPack(validWorkflow({
      id: 'test1',
      phases: [validPhase({
        id: 'phase-1',
        skillBindings: ['user:brainstorming', 'user:managed-code-review-skill'],
      })],
    }), 'test1')

    const zip = await new ZipPackAdapter().read(new Uint8Array(await fs.readFile(result.zipPath)))
    expect(zip.has('skills/user-brainstorming/SKILL.md')).toBe(true)
    expect(zip.has('skills/user-brainstorming/instructions.md')).toBe(true)
    expect(zip.has('skills/user-managed-code-review-skill/SKILL.md')).toBe(true)
    expect(zip.has('skills/user-managed-code-review-skill/instructions.md')).toBe(true)
    const manifestJson = await zip.readJson('manifest.json') as { entrypoints?: { skills?: string[] }; dependencies?: { packagedSkills?: Array<{ identity?: string }> } }
    expect(manifestJson.entrypoints?.skills?.sort()).toEqual([
      'skills/user-brainstorming/SKILL.md',
      'skills/user-managed-code-review-skill/SKILL.md',
    ])
    expect(manifestJson.dependencies?.packagedSkills?.map((skill) => skill.identity).sort()).toEqual([
      'user:brainstorming',
      'user:managed-code-review-skill',
    ])
  })

  test('blocks v2 export when a referenced skill has no real directory', async () => {
    const service = new PackRegistryService()

    await expect(service.exportWorkflowPackZip({
      packId: 'missing-skill-pack',
      name: 'Missing Skill Pack',
      workflows: [validWorkflow({
        phases: [validPhase({
          skillBindings: ['missing-provider:missing-skill'],
        })],
      })],
    })).rejects.toThrow(/real packable dependencies/i)
  })

  test('imports v2 ZIP pack and uses pack-private skill status', async () => {
    await writeUserSkill(tempConfigDir, 'my-skill')
    const exported = await new PackRegistryService().exportWorkflowPackZip({
      packId: 'install-skill-pack',
      name: 'Install Skill Pack',
      workflows: [validWorkflow({
        id: 'install-skill-flow',
        phases: [validPhase({ skills: [{ name: 'my-skill', source: 'user', referenceId: 'my-skill' }] })],
      })],
    })

    const importConfigDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-pack-import-'))
    process.env.CLAUDE_CONFIG_DIR = importConfigDir
    resetPackRegistryForTests()
    try {
      const result = await new PackRegistryService().importWorkflowPackZip(exported)

      // Skills are now pack-private - never installed to user skills directory
      expect(result.skillInstallPlan?.[0]?.status).toBe('pack-private')
      expect(await fs.readdir(path.join(importConfigDir, 'skills')).catch(() => [])).toEqual([])
    } finally {
      await fs.rm(importConfigDir, { recursive: true, force: true })
      process.env.CLAUDE_CONFIG_DIR = tempConfigDir
      resetPackRegistryForTests()
    }
  })

  test('blocks v2 import when installed skill identity has different content', async () => {
    await writeUserSkill(tempConfigDir, 'my-skill', 'original content')
    const exported = await new PackRegistryService().exportWorkflowPackZip({
      packId: 'conflict-skill-pack',
      name: 'Conflict Skill Pack',
      workflows: [validWorkflow({
        phases: [validPhase({ skills: [{ name: 'my-skill', source: 'user', referenceId: 'my-skill' }] })],
      })],
    })

    const importConfigDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-pack-conflict-'))
    await writeUserSkill(importConfigDir, 'my-skill', 'different content')
    process.env.CLAUDE_CONFIG_DIR = importConfigDir
    resetPackRegistryForTests()
    try {
      const preview = await new PackRegistryService().previewWorkflowPackZip(exported)
      // Skills are now pack-private - status is always 'pack-private' regardless of conflicts
      expect(preview.skillInstallPlan?.[0]?.status).toBe('pack-private')
      // Import should succeed since skills are no longer installed to user directory
      const result = await new PackRegistryService().importWorkflowPackZip(exported)
      expect(result.skillInstallPlan?.[0]?.status).toBe('pack-private')
    } finally {
      await fs.rm(importConfigDir, { recursive: true, force: true })
      process.env.CLAUDE_CONFIG_DIR = tempConfigDir
      resetPackRegistryForTests()
    }
  })

})

