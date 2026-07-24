import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { WorkflowSessionStateService } from './workflowSessionStateService.js'

const FIXTURE_DIR = path.join(import.meta.dir, '__fixtures__', 'workflow-sessions')

const SESSION_ID = 'workflow-session-state-test'
const NOW = '2026-05-20T00:00:00.000Z'

let tmpDir: string
let originalConfigDir: string | undefined

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-jiangxia-workflow-state-'))
  originalConfigDir = process.env.CLAUDE_CONFIG_DIR
  process.env.CLAUDE_CONFIG_DIR = tmpDir
})

afterEach(async () => {
  if (originalConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR
  } else {
    process.env.CLAUDE_CONFIG_DIR = originalConfigDir
  }
  await fs.rm(tmpDir, { recursive: true, force: true })
})

function statePath(sessionId = SESSION_ID): string {
  return path.join(tmpDir, 'cc-jiangxia', 'workflow-sessions', sessionId, 'state.json')
}

function artifactPath(sessionId: string, artifactId: string): string {
  return path.join(tmpDir, 'cc-jiangxia', 'workflow-sessions', sessionId, 'artifacts', `${artifactId}.json`)
}

async function readJson(filePath: string): Promise<Record<string, unknown>> {
  return JSON.parse(await fs.readFile(filePath, 'utf-8')) as Record<string, unknown>
}

async function copyStateFixture(name: string, sessionId = 'fixture-session'): Promise<void> {
  const raw = await fs.readFile(path.join(FIXTURE_DIR, name), 'utf-8')
  const rewritten = raw.replaceAll('fixture-session', sessionId)
  await fs.mkdir(path.dirname(statePath(sessionId)), { recursive: true })
  await fs.writeFile(statePath(sessionId), rewritten, 'utf-8')
}

function artifactStatuses(state: Record<string, unknown>): string[] {
  const index = state.artifactIndex as Record<string, { lifecycleStatus?: string }>
  return Object.values(index).map((artifact) => artifact.lifecycleStatus ?? 'missing')
}

function makeState(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    sessionId: SESSION_ID,
    mode: 'workflow',
    templateSnapshot: {
      schemaVersion: 1,
      id: 'requirements-to-implementation',
      source: 'builtin',
      version: '1',
      displayName: 'Requirements to implementation',
      description: 'Linear workflow fixture',
      phases: [
        {
          id: 'requirements-clarification',
          label: 'Requirements clarification',
          instructions: 'Clarify requirements',
          requestedModel: null,
          skillDeclarations: [],
          requiredArtifacts: [],
          completionCriteria: [],
          transitionAuthority: 'user-confirmation',
        },
      ],
    },
    templateIdentity: {
      id: 'requirements-to-implementation',
      source: 'builtin',
      version: '1',
      registryKey: 'builtin:requirements-to-implementation',
      contentHash: 'fixture-hash',
    },
    sourceTemplateStatus: 'current',
    workflowStatus: 'created',
    activePhaseId: 'requirements-clarification',
    phaseRuns: [
      {
        phaseId: 'requirements-clarification',
        index: 0,
        status: 'created',
        startedAt: null,
        completedAt: null,
        instructionsProvenance: {
          templateId: 'requirements-to-implementation',
          templateVersion: '1',
          phaseId: 'requirements-clarification',
        },
        inputArtifactRefs: [],
        outputArtifactRefs: [],
        completionChecks: [],
        modelResolution: null,
        skillProvenance: [],
        blockedReason: null,
      },
    ],
    transitionHistory: [],
    artifactIndex: [],
    finalReportRef: null,
    revision: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

describe('WorkflowSessionStateService', () => {
  test('writes schema-versioned workflow state atomically under cc-jiangxia workflow-sessions', async () => {
    const service = new WorkflowSessionStateService()
    const state = makeState()

    const result = await service.writeState(SESSION_ID, state)
    const persisted = await readJson(statePath())
    const sessionDirFiles = await fs.readdir(path.dirname(statePath()))

    expect(result.pointer).toEqual({
      kind: 'workflow-state',
      sessionId: SESSION_ID,
      artifactId: 'state',
      schemaVersion: 1,
      createdAt: NOW,
      updatedAt: NOW,
      label: 'Workflow state',
    })
    expect(result.pointer).not.toHaveProperty('path')
    expect(persisted.schemaVersion).toBe(1)
    expect(persisted.sessionId).toBe(SESSION_ID)
    expect(persisted.mode).toBe('workflow')
    expect(sessionDirFiles.filter((name) => name.includes('.tmp.'))).toEqual([])
    expect(statePath()).toContain(path.join('cc-jiangxia', 'workflow-sessions', SESSION_ID, 'state.json'))
  })

  test('serializes concurrent updates and preserves unknown fields while incrementing revisions', async () => {
    const service = new WorkflowSessionStateService()
    await fs.mkdir(path.dirname(statePath()), { recursive: true })
    await copyStateFixture('pending-ready-state.json', SESSION_ID)

    const updates = await Promise.all([
      service.updateState(SESSION_ID, (current) => ({
        ...current,
        workflowStatus: 'running',
        activePhaseId: 'requirements-clarification',
        updatedAt: '2026-05-20T00:01:00.000Z',
      })),
      service.updateState(SESSION_ID, (current) => ({
        ...current,
        workflowStatus: 'pending-confirmation',
        activePhaseId: 'requirements-clarification',
        pendingConfirmation: {
          confirmationId: 'confirm-1',
          phaseId: 'requirements-clarification',
          fromPhaseId: 'requirements-clarification',
          toPhaseId: 'technical-design',
          completionCheckId: 'check-1',
          artifactRefs: [],
          createdAt: '2026-05-20T00:02:00.000Z',
          status: 'pending',
        },
        updatedAt: '2026-05-20T00:02:00.000Z',
      })),
    ])
    const persisted = await readJson(statePath())

    expect(updates.map((update) => update.state.revision).sort()).toEqual([4, 5])
    expect(updates.map((update) => update.state.stateVersion).sort()).toEqual([4, 5])
    expect(persisted.revision).toBe(5)
    expect(persisted.stateVersion).toBe(5)
    expect(persisted.futureStateField).toEqual({ preserved: true })
    expect(((persisted.phaseRuns as Array<Record<string, unknown>>)[0]).futurePhaseField).toBe('preserve me')
  })

  test('reads missing and corrupt state as recoverable workflow errors without writing protected files', async () => {
    const service = new WorkflowSessionStateService()

    const missing = await service.readState(SESSION_ID)
    await fs.mkdir(path.dirname(statePath()), { recursive: true })
    await fs.copyFile(path.join(FIXTURE_DIR, 'corrupt-state.json'), statePath())
    const corrupt = await service.readState(SESSION_ID)
    const ccJiangxiaFiles = await fs.readdir(path.join(tmpDir, 'cc-jiangxia'), { recursive: true })

    expect(missing).toMatchObject({
      exists: false,
      state: null,
      recoveryStatus: 'state-missing',
      errorCode: 'WORKFLOW_STATE_UNAVAILABLE',
    })
    expect(corrupt).toMatchObject({
      exists: false,
      state: null,
      recoveryStatus: 'state-corrupt',
      errorCode: 'WORKFLOW_STATE_UNAVAILABLE',
    })
    expect(ccJiangxiaFiles.some((file) => String(file).startsWith('settings.json'))).toBe(false)
    expect(await fs.readdir(tmpDir)).toEqual(['cc-jiangxia'])
  })

  test('preserves pending, accepted, rejected, and superseded artifact lifecycle states on resume', async () => {
    const service = new WorkflowSessionStateService()
    const fixtures = [
      ['pending-ready-state.json', 'pending-confirmation', ['pending']],
      ['accepted-completion-state.json', 'running', ['accepted']],
      ['rejected-completion-state.json', 'running', ['rejected']],
      ['superseded-completion-state.json', 'pending-confirmation', ['superseded', 'pending']],
    ] as const

    for (const [fixture, expectedWorkflowStatus, expectedArtifactStatuses] of fixtures) {
      await copyStateFixture(fixture)

      const result = await service.readState('fixture-session')

      expect(result.recoveryStatus).toBe('ok')
      expect(result.state?.workflowStatus).toBe(expectedWorkflowStatus)
      expect(result.state?.status).toBe(expectedWorkflowStatus)
      expect(artifactStatuses(result.state as unknown as Record<string, unknown>).sort()).toEqual(
        [...expectedArtifactStatuses].sort(),
      )
    }
  })

  test('preserves blocked and unable status history with model fallback provenance', async () => {
    const service = new WorkflowSessionStateService()
    await copyStateFixture('model-fallback-state.json')

    const result = await service.readState('fixture-session')
    const state = result.state as unknown as Record<string, unknown>
    const history = state.statusHistory as Array<Record<string, unknown>>
    const phaseRuns = state.phaseRuns as Array<Record<string, unknown>>
    const modelResolution = phaseRuns[0].modelResolution as Record<string, unknown>

    expect(history.map((entry) => entry.status)).toEqual(['blocked', 'unable'])
    expect(modelResolution).toMatchObject({
      requestedModel: 'provider-a/missing-model',
      actualModel: 'provider-b/default-model',
      providerId: 'provider-b',
      source: 'main-session-default',
      fallbackApplied: true,
      fallbackReason: 'Requested phase model is unavailable.',
    })
    expect(result.state?.workflowStatus).toBe('running')
  })

  test('restores pending completion submission and bounded recommended skill evidence', async () => {
    const service = new WorkflowSessionStateService()
    await copyStateFixture('pending-skill-evidence-state.json')

    const result = await service.readState('fixture-session')
    const state = result.state as unknown as Record<string, unknown>
    const pendingConfirmation = state.pendingConfirmation as Record<string, unknown>
    const submission = pendingConfirmation.submission as Record<string, unknown>
    const skillEvidence = state.phaseSkillEvidence as Array<Record<string, unknown>>
    const skillSnapshots = state.phaseSkillSnapshots as Array<Record<string, unknown>>
    const artifactIndex = state.artifactIndex as Record<string, Record<string, unknown>>

    expect(result.recoveryStatus).toBe('ok')
    expect(state.workflowStatus).toBe('pending-confirmation')
    expect(state.activePhaseId).toBe('specify')
    expect(pendingConfirmation).toMatchObject({
      confirmationId: 'submit-ready-1',
      phaseId: 'specify',
      toPhaseId: 'plan',
      status: 'pending',
    })
    expect(submission).toMatchObject({
      phaseId: 'specify',
      stateVersion: 2,
      status: 'ready',
      rationale: 'Required artifacts were produced.',
    })
    expect(submission.evidence).toEqual([
      expect.objectContaining({
        kind: 'artifact',
        ref: '.specify/features/009-specify-discussions-workflows/spec.md',
      }),
    ])
    expect(skillEvidence).toEqual([
      expect.objectContaining({
        name: 'requirements-review',
        outcome: 'used',
      }),
      expect.objectContaining({
        name: 'missing-audit',
        outcome: 'relevant-unavailable',
      }),
    ])
    expect(skillSnapshots[0]).toMatchObject({
      phaseId: 'specify',
      references: expect.arrayContaining([
        expect.objectContaining({ name: 'requirements-review' }),
        expect.objectContaining({ name: 'missing-audit' }),
        expect.objectContaining({ name: 'irrelevant-style' }),
      ]),
    })
    expect(artifactIndex['phase-specify-ready-1'].submission).toMatchObject({
      status: 'ready',
      evidence: submission.evidence,
    })
  })

  test.each([
    ['resume-stale-template-state.json', 'stale-template', 'implementation', ['requirements-summary', 'design-summary']],
    ['resume-missing-template-state.json', 'missing-template', 'implementation', ['plan-summary']],
    ['completed-final-report-state.json', 'current', null, ['requirements-summary']],
  ] as const)('restores %s resume fixture without dropping artifact history', async (
    fixture,
    sourceTemplateStatus,
    activePhaseId,
    artifactIds,
  ) => {
    const service = new WorkflowSessionStateService()
    await copyStateFixture(fixture)

    const result = await service.readState('fixture-session')
    const state = result.state as unknown as Record<string, unknown>
    const artifacts = state.artifactIndex as Array<Record<string, unknown>>

    expect(result.recoveryStatus).toBe('ok')
    expect(state.sourceTemplateStatus).toBe(sourceTemplateStatus)
    expect(state.activePhaseId).toBe(activePhaseId)
    expect((state.templateSnapshot as Record<string, unknown>).phases).toEqual(expect.any(Array))
    expect(artifacts.map((artifact) => artifact.artifactId)).toEqual(artifactIds)
    expect(artifacts).toEqual(
      expect.arrayContaining(artifactIds.map((artifactId) => expect.objectContaining({
        kind: 'phase-artifact',
        sessionId: 'fixture-session',
        artifactId,
      }))),
    )
  })

  test('does not treat corrupt state as an empty resumable workflow state', async () => {
    const service = new WorkflowSessionStateService()
    await fs.mkdir(path.dirname(statePath()), { recursive: true })
    await fs.copyFile(path.join(FIXTURE_DIR, 'corrupt-state.json'), statePath())

    const result = await service.readState(SESSION_ID)

    expect(result).toMatchObject({
      exists: false,
      state: null,
      recoveryStatus: 'state-corrupt',
      errorCode: 'WORKFLOW_STATE_UNAVAILABLE',
    })
  })

  test('writes refreshed lifecycle artifacts without dropping status or unknown fields', async () => {
    const service = new WorkflowSessionStateService()
    await copyStateFixture('pending-ready-state.json')

    const result = await service.updateState('fixture-session', (current) => ({
      ...current,
      artifactIndex: {
        ...(current.artifactIndex as Record<string, unknown>),
        'phase-specify-ready-2': {
          schemaVersion: 1,
          sessionId: 'fixture-session',
          phaseId: 'specify',
          artifactId: 'phase-specify-ready-2',
          lifecycleStatus: 'superseded',
          createdAt: '2026-05-21T00:02:00.000Z',
          updatedAt: '2026-05-21T00:02:00.000Z',
          title: 'Specify phase completion retry',
          handoff: {},
          rationale: 'Superseded by another retry.',
          evidence: [],
          provenance: {
            source: 'agent',
            model: {},
            skillGuidance: [],
          },
          futureArtifactField: {
            preserved: true,
          },
        },
      },
    }))
    const persisted = await readJson(statePath('fixture-session'))
    const artifact = (persisted.artifactIndex as Record<string, Record<string, unknown>>)[
      'phase-specify-ready-2'
    ]

    expect(result.state.futureStateField).toEqual({ preserved: true })
    expect(artifact.lifecycleStatus).toBe('superseded')
    expect(artifact.futureArtifactField).toEqual({ preserved: true })
  })

  test('creates stable session-scoped phase artifact pointers and rejects unsafe artifact ids', async () => {
    const service = new WorkflowSessionStateService()
    const artifact = {
      schemaVersion: 1,
      sessionId: SESSION_ID,
      phaseId: 'requirements-clarification',
      artifactId: 'requirements-clarification-output-v1',
      type: 'structured-output',
      createdAt: NOW,
      title: 'Requirements output',
      content: { summary: 'Accepted requirements' },
      provenance: {},
    }

    const first = await service.writePhaseArtifact(SESSION_ID, artifact)
    const second = await service.writePhaseArtifact(SESSION_ID, artifact)

    expect(first.pointer).toEqual(second.pointer)
    expect(first.pointer).toEqual({
      kind: 'phase-artifact',
      sessionId: SESSION_ID,
      artifactId: 'requirements-clarification-output-v1',
      schemaVersion: 1,
      createdAt: NOW,
      updatedAt: NOW,
      label: 'Requirements output',
    })
    expect(first.pointer).not.toHaveProperty('path')
    expect(await readJson(artifactPath(SESSION_ID, 'requirements-clarification-output-v1'))).toMatchObject({
      sessionId: SESSION_ID,
      artifactId: 'requirements-clarification-output-v1',
    })
    await expect(service.writePhaseArtifact(SESSION_ID, {
      ...artifact,
      artifactId: '../settings',
    })).rejects.toThrow(/artifactId/i)
  })

  test('does not mutate protected user-owned files while reading workflow companion state', async () => {
    const service = new WorkflowSessionStateService()
    const protectedFiles = [
      path.join(tmpDir, 'settings.json'),
      path.join(tmpDir, 'cc-jiangxia', 'providers.json'),
      path.join(tmpDir, 'adapter-sessions.json'),
      path.join(tmpDir, 'projects', 'session.jsonl'),
    ]

    for (const file of protectedFiles) {
      await fs.mkdir(path.dirname(file), { recursive: true })
      await fs.writeFile(file, 'protected-content', 'utf-8')
    }
    await copyStateFixture('pending-ready-state.json')

    await service.readState('fixture-session')

    for (const file of protectedFiles) {
      expect(await fs.readFile(file, 'utf-8')).toBe('protected-content')
    }
  })

  test('persists a fail-closed migration contract when a legacy state is first read', async () => {
    const service = new WorkflowSessionStateService()
    const legacy = makeState({ stateVersion: 5, revision: 8 })
    await fs.mkdir(path.dirname(statePath()), { recursive: true })
    await fs.writeFile(statePath(), JSON.stringify(legacy, null, 2), 'utf-8')

    const read = await service.readState(SESSION_ID)
    const persisted = await readJson(statePath())
    const runtimeContract = persisted.runtimeContract as Record<string, unknown>
    const phaseStates = runtimeContract.phaseStates as Record<string, Record<string, unknown>>

    expect(read.state?.runtimeContract).toMatchObject({ migrationStatus: 'needs-rebuild' })
    expect(runtimeContract.migrationStatus).toBe('needs-rebuild')
    expect(phaseStates['requirements-clarification']).toMatchObject({
      workStatus: 'interrupted',
      eligibility: 'ineligible',
      issues: [expect.objectContaining({
        id: 'migration:requirements-clarification',
        blocksCompletion: true,
        status: 'open',
      })],
    })
  })

  test('rejects a stale expected state version without overwriting persisted state', async () => {
    const service = new WorkflowSessionStateService()
    await service.writeState(SESSION_ID, makeState({ stateVersion: 3, revision: 7 }))
    const before = await fs.readFile(statePath(), 'utf-8')

    await expect(service.updateState(SESSION_ID, (current) => ({
      ...current,
      workflowStatus: 'completed',
    }), { expectedStateVersion: 2 })).rejects.toMatchObject({
      code: 'WORKFLOW_STATE_STALE',
    })

    expect(await fs.readFile(statePath(), 'utf-8')).toBe(before)
  })

  test('rejects a stale expected revision on direct writes without overwriting persisted state', async () => {
    const service = new WorkflowSessionStateService()
    const current = makeState({ stateVersion: 3, revision: 7 })
    await service.writeState(SESSION_ID, current)
    const before = await fs.readFile(statePath(), 'utf-8')

    await expect(service.writeState(SESSION_ID, {
      ...current,
      workflowStatus: 'completed',
    }, { expectedRevision: 6 })).rejects.toMatchObject({
      code: 'WORKFLOW_STATE_STALE',
    })

    expect(await fs.readFile(statePath(), 'utf-8')).toBe(before)
  })

})
