import { afterEach, describe, expect, it, mock } from 'bun:test'
import {
  loadCurrentWorkflowTemplate,
  setWorkflowRuntimeTemplateLoaderForTests,
  resolveWorkflowTemplateForRun,
  workflowTemplateSnapshotHash,
} from './workflowRuntimeTemplateService.js'
import type { WorkflowSessionState, WorkflowTemplate } from './workflowTypes.js'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { PackRegistryService, getWorkflowPackStorageDir, resetPackRegistryForTests } from './packRegistryService.js'
import { resetWorkflowTemplateRegistryForTests } from './workflowTemplateRegistryService.js'
import { WorkflowSessionCreateService } from './workflowSessionCreateService.js'
import { WorkflowSessionStateService } from './workflowSessionStateService.js'
import { ZipPackAdapter } from './zipPackAdapter.js'

function template(version: string, instructions: string): WorkflowTemplate {
  return {
    schemaVersion: 2,
    id: 'efficient-constrained-dev-debug-workflow-v5',
    source: 'pack',
    version,
    displayName: 'Development',
    phases: [{
      id: 'route-context',
      label: 'Route',
      instructions,
      requestedModel: null,
      skills: [],
      skillDeclarations: [],
      requiredArtifacts: [],
      completionCriteria: [],
      transitionAuthority: 'user-confirmation',
    }],
  }
}

function state(snapshot?: WorkflowTemplate): WorkflowSessionState {
  return {
    schemaVersion: 1,
    sessionId: 'session-1',
    mode: 'workflow',
    template: { id: 'efficient-constrained-dev-debug-workflow-v5', version: '22', source: 'pack', snapshotId: 'snapshot-22', sourceState: 'current' },
    ...(snapshot ? { templateSnapshot: snapshot } : {}),
    templateIdentity: { id: 'efficient-constrained-dev-debug-workflow-v5', version: '22', source: 'pack' },
    sourceTemplateStatus: 'current',
    status: 'running',
    workflowStatus: 'running',
    activePhaseId: 'route-context',
    phases: [{ id: 'route-context', index: 0, status: 'running', artifactPointers: [] }],
    phaseRuns: [],
    transitionHistory: [],
    artifactIndex: [],
    finalReportRef: null,
    stateVersion: 1,
    revision: 1,
    createdAt: '2026-09-17T00:00:00.000Z',
    updatedAt: '2026-09-17T00:00:00.000Z',
  }
}

describe('workflow runtime template snapshots', () => {
  afterEach(() => setWorkflowRuntimeTemplateLoaderForTests(null))

  function customState(snapshot?: WorkflowTemplate): WorkflowSessionState {
    const session = state(snapshot ? { ...snapshot, id: 'custom-workflow' } : undefined)
    session.templateIdentity.id = 'custom-workflow'
    session.template.id = 'custom-workflow'
    return session
  }

  it('keeps custom runs pinned without consulting a replaced or deleted ZIP', async () => {
    const session = customState(template('22', 'original custom rules'))
    const loader = mock(async () => ({ ...template('23', 'replacement rules'), id: 'custom-workflow' }))
    setWorkflowRuntimeTemplateLoaderForTests(loader)

    expect(await loadCurrentWorkflowTemplate(session)).toEqual(session.templateSnapshot)
    expect(loader).not.toHaveBeenCalled()
    setWorkflowRuntimeTemplateLoaderForTests(async () => null)
    expect((await loadCurrentWorkflowTemplate(session))?.phases[0]?.instructions).toBe('original custom rules')
  })

  it('rejects a damaged custom snapshot instead of falling back to installed rules', async () => {
    const session = customState(template('22', 'saved rules'))
    session.templateSnapshotHash = 'sha256-invalid'
    setWorkflowRuntimeTemplateLoaderForTests(async () => ({ ...template('22', 'installed rules'), id: 'custom-workflow' }))

    expect(await loadCurrentWorkflowTemplate(session)).toBeNull()
    expect(session.sourceTemplateStatus).toBe('stale-template')
  })

  it('lets a newly created custom run use new rules without changing an older run', async () => {
    const older = customState(template('22', 'original rules'))
    const newer = customState(template('23', 'new rules'))
    newer.templateIdentity.version = '23'
    newer.template.version = '23'

    expect((await loadCurrentWorkflowTemplate(older))?.phases[0]?.instructions).toBe('original rules')
    expect((await loadCurrentWorkflowTemplate(newer))?.phases[0]?.instructions).toBe('new rules')
  })

  it('hydrates a legacy custom run only from the matching recorded content hash', async () => {
    const session = customState()
    const installed = { ...template('22', 'original rules'), id: 'custom-workflow' }
    session.templateIdentity.contentHash = workflowTemplateSnapshotHash(installed)
    setWorkflowRuntimeTemplateLoaderForTests(async () => installed)

    expect(await loadCurrentWorkflowTemplate(session)).toEqual(installed)
    expect(session.templateSnapshot).toEqual(installed)
    expect(session.templateSnapshotHash).toBe(workflowTemplateSnapshotHash(installed))
  })

  it('fails closed for a legacy custom run whose installed ZIP cannot be verified', async () => {
    const session = customState()
    setWorkflowRuntimeTemplateLoaderForTests(async () => ({ ...template('22', 'unverified rules'), id: 'custom-workflow' }))

    expect(await loadCurrentWorkflowTemplate(session)).toBeNull()
    expect(session.sourceTemplateStatus).toBe('stale-template')
  })

  it('marks a legacy custom run unavailable when its original ZIP is missing', async () => {
    const session = customState()
    setWorkflowRuntimeTemplateLoaderForTests(async () => null)

    expect(await loadCurrentWorkflowTemplate(session)).toBeNull()
    expect(session.sourceTemplateStatus).toBe('missing-template')
  })

  it('pins real custom sessions across ZIP replacement, creation and deletion', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workflow-custom-pinning-'))
    const previousConfigDir = process.env.CLAUDE_CONFIG_DIR
    process.env.CLAUDE_CONFIG_DIR = path.join(root, 'config')
    resetPackRegistryForTests()
    resetWorkflowTemplateRegistryForTests()
    try {
      const registry = new PackRegistryService()
      const creation = new WorkflowSessionCreateService()
      const storage = new WorkflowSessionStateService()
      const workspace = path.join(root, 'project')
      await fs.mkdir(workspace)
      const options = { templateId: 'custom-pinning', templateSource: 'user' as const }
      const install = async (version: string, instructions: string) => {
        const zip = await new ZipPackAdapter().write({
          'manifest.json': JSON.stringify({
            packId: 'custom-pinning-pack', name: 'Custom pinning', version,
            schemaVersion: 1, type: 'workflow-pack',
            entrypoints: { workflows: ['workflows/custom.workflow.json'], experts: [], skills: [] },
          }),
          'workflows/custom.workflow.json': JSON.stringify({
            schemaVersion: 2, id: options.templateId, name: 'Custom pinning', version,
            phases: [{
              id: 'plan', name: 'Plan', instructions,
              requiredIntake: ['Use the request.'], handoffRules: ['Save the plan.'],
              outputArtifact: { id: 'plan-output', name: 'Plan', kind: 'markdown', description: 'Saved plan.', required: true },
              completionCriteria: { type: 'manual-checklist', description: 'Plan is complete.' },
              transition: { authority: 'auto' },
            }],
          }),
        })
        await registry.importWorkflowPackZip(zip)
        resetWorkflowTemplateRegistryForTests()
      }

      await install('1', 'original custom rules')
      await creation.createWorkflowSessionMetadata('custom-old', workspace, await creation.resolveTemplate(options), options)
      await install('2', 'updated custom rules')
      await creation.createWorkflowSessionMetadata('custom-new', workspace, await creation.resolveTemplate(options), options)
      const older = (await storage.readState('custom-old')).state!
      const newer = (await storage.readState('custom-new')).state!
      expect((await loadCurrentWorkflowTemplate(older))?.phases[0]?.instructions).toBe('original custom rules')
      expect((await loadCurrentWorkflowTemplate(newer))?.phases[0]?.instructions).toBe('updated custom rules')
      await fs.unlink(path.join(getWorkflowPackStorageDir(), 'custom-pinning.zip'))
      expect((await loadCurrentWorkflowTemplate(older))?.version).toBe('1')
      expect((await loadCurrentWorkflowTemplate(newer))?.version).toBe('2')
    } finally {
      if (previousConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR
      else process.env.CLAUDE_CONFIG_DIR = previousConfigDir
      resetPackRegistryForTests()
      resetWorkflowTemplateRegistryForTests()
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('keeps the run pinned to its snapshot when the installed same-id ZIP is newer', () => {
    const pinned = template('22', 'old rules')
    const installed = template('23', 'new rules')
    const session = state(pinned)
    session.templateIdentity.contentHash = workflowTemplateSnapshotHash(pinned)

    expect(resolveWorkflowTemplateForRun(session, installed)).toEqual(pinned)
    expect(session.templateSnapshot).toEqual(pinned)
  })

  it('hydrates a legacy missing snapshot only when identity and hash match', () => {
    const installed = template('22', 'same rules')
    const session = state()
    session.templateIdentity.contentHash = workflowTemplateSnapshotHash(installed)

    expect(resolveWorkflowTemplateForRun(session, installed)).toEqual(installed)
    expect(session.templateSnapshot).toEqual(installed)
    expect(session.templateSnapshotHash).toBe(workflowTemplateSnapshotHash(installed))
  })

  it('fails closed when a legacy run cannot prove the installed ZIP matches', () => {
    const installed = template('23', 'different rules')
    const session = state()

    expect(resolveWorkflowTemplateForRun(session, installed)).toBeNull()
    expect(session.sourceTemplateStatus).toBe('stale-template')
  })
})
