import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { ZipPackAdapter } from './zipPackAdapter.js'
import {
  getWorkflowPackStorageDir,
  resetPackRegistryForTests,
} from './packRegistryService.js'
import { WorkflowSaveService } from './workflowSaveService.js'
import { resetWorkflowTemplateRegistryForTests } from './workflowTemplateRegistryService.js'

let tempConfigDir: string
let originalConfigDir: string | undefined

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
    id: 'save-flow',
    version: '1.0.0',
    name: 'Save Flow',
    description: 'A workflow saved through WorkflowSaveService.',
    phases: [validPhase()],
    ...overrides,
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

beforeEach(async () => {
  originalConfigDir = process.env.CLAUDE_CONFIG_DIR
  tempConfigDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-workflow-save-'))
  process.env.CLAUDE_CONFIG_DIR = tempConfigDir
  resetPackRegistryForTests()
  resetWorkflowTemplateRegistryForTests()
})

afterEach(async () => {
  if (originalConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR
  } else {
    process.env.CLAUDE_CONFIG_DIR = originalConfigDir
  }
  resetPackRegistryForTests()
  resetWorkflowTemplateRegistryForTests()
  await fs.rm(tempConfigDir, { recursive: true, force: true })
})

describe('WorkflowSaveService', () => {
  test('saves one workflow as one ZIP in the fixed workflow pack store', async () => {
    const service = new WorkflowSaveService()
    const result = await service.saveWorkflow('save-flow', validWorkflow())

    expect(result.success).toBe(true)
    expect(result.packId).toBe('save-flow')
    expect(result.zipPath).toBe(path.join(getWorkflowPackStorageDir(), 'save-flow.zip'))
    expect(service.getWorkflowDirectory()).toBe(getWorkflowPackStorageDir())
    expect(await fileExists(result.zipPath)).toBe(true)

    const zip = await new ZipPackAdapter().read(new Uint8Array(await fs.readFile(result.zipPath)))
    expect(zip.has('manifest.json')).toBe(true)
    expect(zip.has('workflows/save-flow.workflow.json')).toBe(true)
    expect(zip.has('tools/host-tools.json')).toBe(true)
    expect(zip.has('checksums.json')).toBe(true)
  })

  test('updates only ZIPs inside the fixed workflow pack store', async () => {
    const service = new WorkflowSaveService()
    const saved = await service.saveWorkflow('save-flow', validWorkflow())
    expect(saved.success).toBe(true)

    const updated = await service.updateWorkflow(saved.zipPath, validWorkflow({ name: 'Updated Save Flow' }))
    expect(updated.success).toBe(true)

    const zip = await new ZipPackAdapter().read(new Uint8Array(await fs.readFile(saved.zipPath)))
    const workflow = await zip.readJson<{ name: string }>('workflows/save-flow.workflow.json')
    expect(workflow.name).toBe('Updated Save Flow')

    const loosePath = path.join(tempConfigDir, 'loose-workflow.zip')
    const rejected = await service.updateWorkflow(loosePath, validWorkflow({ name: 'Loose Flow' }))
    expect(rejected.success).toBe(false)
    expect(rejected.message).toContain('fixed workflow ZIP store')
    expect(await fileExists(loosePath)).toBe(false)
  })
})
