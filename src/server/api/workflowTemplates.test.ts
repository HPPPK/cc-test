import { afterEach, describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { handleWorkflowTemplatesApi } from './workflowTemplates.js'
import { PackRegistryService, getWorkflowPackStorageDir } from '../services/packRegistryService.js'
import { resetWorkflowTemplateRegistryForTests } from '../services/workflowTemplateRegistryService.js'

const roots: string[] = []
const previousConfigDir = process.env.CLAUDE_CONFIG_DIR
const previousPacksDir = process.env.CLAUDE_PACKS_DIR

function phase(instructions: string) {
  return {
    id: 'implement',
    name: 'Implement',
    instructions,
    objective: 'Implement the accepted workflow task.',
    requiredIntake: ['Accepted task.'],
    handoffRules: ['Record the result and evidence.'],
    executionRules: ['Stay inside the accepted scope.'],
    outputArtifact: {
      id: 'implementation',
      name: 'Implementation',
      kind: 'markdown',
      description: 'Implementation result.',
      required: true,
    },
    completionCriteria: { type: 'manual-checklist', description: 'Implementation is verified.' },
    transition: { authority: 'auto' },
  }
}

async function pack(workflowId: string, version: string, instructions: string): Promise<Uint8Array> {
  return new PackRegistryService().exportWorkflowPackZip({
    packId: workflowId,
    name: 'Managed workflow',
    version,
    workflows: [{
      schemaVersion: 1,
      id: workflowId,
      version,
      name: 'Managed workflow',
      description: instructions,
      phases: [phase(instructions)],
    }],
    selfContained: false,
  })
}

function digest(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

async function setup() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workflow-templates-api-'))
  roots.push(root)
  const bundleDir = path.join(root, 'bundled')
  await fs.mkdir(bundleDir, { recursive: true })
  process.env.CLAUDE_CONFIG_DIR = root
  process.env.CLAUDE_PACKS_DIR = bundleDir
  resetWorkflowTemplateRegistryForTests()
  return { root, bundleDir }
}

afterEach(async () => {
  if (previousConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR
  else process.env.CLAUDE_CONFIG_DIR = previousConfigDir
  if (previousPacksDir === undefined) delete process.env.CLAUDE_PACKS_DIR
  else process.env.CLAUDE_PACKS_DIR = previousPacksDir
  resetWorkflowTemplateRegistryForTests()
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

describe('workflow templates bundled update API', () => {
  test('lists a user-modified managed workflow update and applies it with backup metadata', async () => {
    const { bundleDir } = await setup()
    const workflowId = 'feature-extension-workflow-v8'
    const initial = await pack(workflowId, '100', 'Official initial workflow.')
    const bundledPath = path.join(bundleDir, `${workflowId}.zip`)
    await fs.writeFile(bundledPath, initial)

    await handleWorkflowTemplatesApi(
      new Request('http://localhost/api/workflows/templates'),
      new URL('http://localhost/api/workflows/templates'),
      ['api', 'workflows', 'templates'],
    )

    const localCustom = await pack(workflowId, '100', 'My local workflow.')
    await fs.writeFile(path.join(getWorkflowPackStorageDir(), `${workflowId}.zip`), localCustom)
    const bundledLatest = await pack(workflowId, '101', 'Official latest workflow.')
    await fs.writeFile(bundledPath, bundledLatest)
    resetWorkflowTemplateRegistryForTests()

    const listed = await handleWorkflowTemplatesApi(
      new Request('http://localhost/api/workflows/templates'),
      new URL('http://localhost/api/workflows/templates'),
      ['api', 'workflows', 'templates'],
    )
    const listedBody = await listed.json()
    const template = listedBody.templates.find((candidate: { id: string }) => candidate.id === workflowId)
    expect(template.bundledUpdate).toEqual({
      kind: 'version',
      localVersion: '100',
      bundledVersion: '101',
      localSha256: digest(localCustom),
      bundledSha256: digest(bundledLatest),
    })

    const response = await handleWorkflowTemplatesApi(
      new Request(`http://localhost/api/workflows/templates/user/${workflowId}/bundled-update`, { method: 'POST', body: '{}' }),
      new URL(`http://localhost/api/workflows/templates/user/${workflowId}/bundled-update`),
      ['api', 'workflows', 'templates', 'user', workflowId, 'bundled-update'],
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      backupFilename: expect.stringMatching(/^feature-extension-workflow-v8\.backup-100-/),
      previousVersion: '100',
      installedVersion: '101',
      installedSha256: digest(bundledLatest),
    })
  })

  test('rejects bundled update actions for non-managed workflow ids', async () => {
    await setup()
    const response = await handleWorkflowTemplatesApi(
      new Request('http://localhost/api/workflows/templates/user/custom-workflow/bundled-update', { method: 'POST', body: '{}' }),
      new URL('http://localhost/api/workflows/templates/user/custom-workflow/bundled-update'),
      ['api', 'workflows', 'templates', 'user', 'custom-workflow', 'bundled-update'],
    )

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual(expect.objectContaining({ code: 'WORKFLOW_BUNDLED_UPDATE_NOT_MANAGED' }))
  })
})
