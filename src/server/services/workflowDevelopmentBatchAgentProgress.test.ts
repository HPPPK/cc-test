import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  DEVELOPMENT_IMPLEMENT_PHASE_ID,
  DEVELOPMENT_PLAN_PHASE_ID,
  DEVELOPMENT_WORKFLOW_TEMPLATE_ID,
  authoritativeDevelopmentBatchIds,
  developmentBatchAgentBlockerReasons,
  developmentBatchHandoffPrompt,
  developmentBatchPlanSignature,
  developmentLeaderToolViolation,
  extractDevelopmentBatchIds,
  parseDevelopmentBatchPlanDocument,
  parseDevelopmentReviewerOutcome,
  prepareDevelopmentDeliveryPlanHandoff,
  validateDevelopmentBatchPlanForState,
  type DevelopmentBatchAgentProgressInput,
  type DevelopmentBatchPlanTask,
} from './workflowDevelopmentBatchAgentPolicy.js'
import {
  recordDevelopmentBatchAgentProgress,
  recordDevelopmentBatchAgentProgressWithLedger,
} from './workflowDevelopmentBatchAgentProgress.js'
import type { WorkflowSessionState, WorkflowTemplate } from './workflowTypes.js'

const NOW = '2026-08-28T08:00:00.000Z'
test('preserves recorded structured Reviewer fixes instead of dropping object entries', () => {
  const fix = { file: 'app/classes/__init__.py', issue: 'Whitespace teacher ID does not match identity', requiredChange: 'Reject padded IDs and test standard ID visibility.' }
  expect(parseDevelopmentReviewerOutcome(JSON.stringify({ workflowReview: {
    reviewStatus: 'needs-fix', requiredFixes: [fix], readyForNextBatch: false,
  } }))).toEqual({ reviewStatus: 'needs-fix', requiredFixes: [JSON.stringify(fix)], readyForNextBatch: false })
})

let workspaceRoot = ''

const plan: DevelopmentBatchPlanTask[] = [
  { id: 'B1', dependsOn: [], writeScopes: ['src/a.ts'], resourceClaims: [], executionMode: 'write' },
  { id: 'B2', dependsOn: ['B1'], writeScopes: ['src/b.ts'], resourceClaims: [], executionMode: 'write' },
]

function template(): WorkflowTemplate {
  return {
    schemaVersion: 1,
    id: DEVELOPMENT_WORKFLOW_TEMPLATE_ID,
    source: 'user',
    version: '22',
    displayName: 'Development',
    description: 'Fixture',
    phases: [{
      id: DEVELOPMENT_IMPLEMENT_PHASE_ID,
      label: 'Implementation',
      instructions: 'Delegate every Batch.',
      skillDeclarations: [],
      requiredArtifacts: [],
      completionCriteria: [],
      transitionAuthority: 'user-confirmation',
    }],
  }
}

function state(templateId = DEVELOPMENT_WORKFLOW_TEMPLATE_ID): WorkflowSessionState {
  const snapshot = template()
  snapshot.id = templateId
  return {
    schemaVersion: 1,
    sessionId: 'development-batch-test',
    mode: 'workflow',
    template: snapshot,
    templateSnapshot: snapshot,
    templateIdentity: { id: templateId, source: 'user', version: '22' },
    sourceTemplateStatus: 'current',
    status: 'running',
    workflowStatus: 'running',
    runStatus: 'active',
    activePhaseId: DEVELOPMENT_IMPLEMENT_PHASE_ID,
    workspaceRoot,
    activeWorkflowRunId: 'run-1',
    workflowRuns: [{
      id: 'run-1',
      templateId,
      status: 'active',
      workspaceRoot,
      currentPhaseId: DEVELOPMENT_IMPLEMENT_PHASE_ID,
      artifacts: [],
      history: [],
      createdAt: NOW,
      updatedAt: NOW,
    }],
    phases: [{ id: DEVELOPMENT_IMPLEMENT_PHASE_ID, index: 0, status: 'running', artifactPointers: [] }],
    phaseRuns: [],
    transitionHistory: [],
    artifactIndex: [],
    finalReportRef: null,
    stateVersion: 1,
    revision: 1,
    createdAt: NOW,
    updatedAt: NOW,
    runtimeContract: {
      schemaVersion: 1,
      migrationStatus: 'current',
      phaseStates: {
        [DEVELOPMENT_IMPLEMENT_PHASE_ID]: {
          phaseId: DEVELOPMENT_IMPLEMENT_PHASE_ID,
          workStatus: 'ready-for-review',
          eligibility: 'ineligible',
          blockerReasons: [],
          issues: [],
          artifactRequirements: [],
          checks: [],
          taskSnapshots: [],
          evaluatedAt: NOW,
        },
      },
      audit: [],
    },
  }
}

function progress(
  role: 'coder' | 'reviewer',
  batchId: string,
  status: DevelopmentBatchAgentProgressInput['status'],
  agentId: string,
  extra: Partial<DevelopmentBatchAgentProgressInput> = {},
): DevelopmentBatchAgentProgressInput {
  return {
    phaseId: DEVELOPMENT_IMPLEMENT_PHASE_ID,
    role,
    batchId,
    plan,
    status,
    agentId,
    recordedAt: NOW,
    ...extra,
  }
}



function structuredPlanContent(
  tasks: DevelopmentBatchPlanTask[] = plan,
  workspaceMode?: 'existing-project' | 'blank-create',
): string {
  return [
    '# Delivery plan',
    '',
    '```json',
    JSON.stringify({
      ...(workspaceMode ? { workspace_mode: workspaceMode } : {}),
      tasks: tasks.map((task) => ({
        id: task.id,
        depends_on: task.dependsOn,
        write_scopes: task.writeScopes,
        resource_claims: task.resourceClaims,
        execution_mode: task.executionMode,
      })),
    }, null, 2),
    '```',
  ].join('\n')
}

beforeEach(async () => {
  workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'development-batch-agent-'))
  await fs.writeFile(path.join(workspaceRoot, 'package.json'), '{"name":"fixture"}\n')
  const runDir = path.join(workspaceRoot, '.workflow', 'runs', 'run-1')
  await fs.mkdir(runDir, { recursive: true })
  await fs.writeFile(path.join(runDir, 'delivery-plan.md'), '# Delivery plan\n- B1 setup\n- B2 feature\n')
})

afterEach(async () => {
  await fs.rm(workspaceRoot, { recursive: true, force: true })
})

describe('default development Stage 4 Batch Agent receipts', () => {
  test('writes the same durable Agent Run Ledger used by workflow recovery', async () => {
    const events: Array<{ runId?: string; status?: string; toolUseId?: string }> = []
    const appendLedgerEvent = async (event: { runId?: string; status?: string; toolUseId?: string }) => {
      events.push(event)
    }

    const running = await recordDevelopmentBatchAgentProgressWithLedger(
      state(),
      progress('coder', 'B1', 'running', 'coder-1', { toolUseId: 'agent-call-1' }),
      appendLedgerEvent,
    )
    await recordDevelopmentBatchAgentProgressWithLedger(
      running,
      progress('coder', 'B1', 'succeeded', 'coder-1', { toolUseId: 'agent-call-1' }),
      appendLedgerEvent,
    )

    expect(events).toEqual([
      expect.objectContaining({ runId: 'coder-1', status: 'running', toolUseId: 'agent-call-1:workflow-task-running' }),
      expect.objectContaining({ runId: 'coder-1', status: 'completed', toolUseId: 'agent-call-1:workflow-task-succeeded' }),
    ])
  })

  test('rejects a shortened plan and requires Coder before Reviewer', () => {
    const current = state()
    expect(() => validateDevelopmentBatchPlanForState(current, [plan[0]!])).toThrow('complete Stage 3 Batch list (B1, B2)')
    expect(() => recordDevelopmentBatchAgentProgress(current, progress('reviewer', 'B1', 'running', 'reviewer-1'))).toThrow('Reviewer cannot start before its Coder succeeds')
  })

  test('does not accept successful Coder output after the workflow has paused', () => {
    const running = recordDevelopmentBatchAgentProgress(state(), progress('coder', 'B1', 'running', 'coder-1'))
    const paused = { ...running, runStatus: 'paused' as const }
    expect(() => recordDevelopmentBatchAgentProgress(paused, progress('coder', 'B1', 'succeeded', 'coder-1'))).toThrow('WORKFLOW_EXECUTION_SUSPENDED')
    const failed = recordDevelopmentBatchAgentProgress(paused, progress('coder', 'B1', 'failed', 'coder-1', { reason: 'Workflow was paused' }))
    expect(failed.runtimeContract!.phaseStates[DEVELOPMENT_IMPLEMENT_PHASE_ID]!.taskSnapshots.find(task => task.batchId === 'B1' && task.workflowRole === 'coder')!.status).toBe('failed')
    expect(failed.runStatus).toBe('paused')
    const done = recordDevelopmentBatchAgentProgress(running, progress('coder', 'B1', 'succeeded', 'coder-1'))
    const acceptedBeforePause = { ...done, runStatus: 'paused' as const }
    expect(recordDevelopmentBatchAgentProgress(acceptedBeforePause, progress('coder', 'B1', 'succeeded', 'coder-1'))).toBe(acceptedBeforePause)
  })

  test('records every Batch and allows completion only after Coder then passing Reviewer', () => {
    let current = state()
    current = recordDevelopmentBatchAgentProgress(current, progress('coder', 'B1', 'running', 'coder-1'))
    expect(current.runtimeContract!.phaseStates[DEVELOPMENT_IMPLEMENT_PHASE_ID]!.taskSnapshots).toEqual(expect.arrayContaining([
      expect.objectContaining({
        batchId: 'B1', workflowRole: 'coder', status: 'running', attempt: 1,
        dependsOn: [], writeScopes: ['src/a.ts'], resourceClaims: [], agentRunId: 'coder-1',
      }),
      expect.objectContaining({ batchId: 'B1', workflowRole: 'reviewer', status: 'waiting_dependency', dependsOn: ['B1::coder'] }),
      expect.objectContaining({ batchId: 'B2', workflowRole: 'coder', status: 'waiting_dependency', dependsOn: ['B1::reviewer'] }),
    ]))
    const duplicate = recordDevelopmentBatchAgentProgress(current, progress('coder', 'B1', 'running', 'coder-1'))
    expect(duplicate).toBe(current)
    current = recordDevelopmentBatchAgentProgress(current, progress('coder', 'B1', 'succeeded', 'coder-1'))
    current = recordDevelopmentBatchAgentProgress(current, progress('reviewer', 'B1', 'running', 'reviewer-1'))
    current = recordDevelopmentBatchAgentProgress(current, progress('reviewer', 'B1', 'succeeded', 'reviewer-1', {
      reviewerOutcome: { reviewStatus: 'pass', requiredFixes: [], readyForNextBatch: true },
    }))
    expect(developmentBatchAgentBlockerReasons(current, current.runtimeContract!.phaseStates[DEVELOPMENT_IMPLEMENT_PHASE_ID]!)).toContain('Batch B2 is missing a successful Coder Agent run.')

    current = recordDevelopmentBatchAgentProgress(current, progress('coder', 'B2', 'running', 'coder-2'))
    current = recordDevelopmentBatchAgentProgress(current, progress('coder', 'B2', 'succeeded', 'coder-2'))
    current = recordDevelopmentBatchAgentProgress(current, progress('reviewer', 'B2', 'running', 'reviewer-2'))
    current = recordDevelopmentBatchAgentProgress(current, progress('reviewer', 'B2', 'succeeded', 'reviewer-2', {
      reviewerOutcome: { reviewStatus: 'pass', requiredFixes: [], readyForNextBatch: true },
    }))
    expect(developmentBatchAgentBlockerReasons(current, current.runtimeContract!.phaseStates[DEVELOPMENT_IMPLEMENT_PHASE_ID]!)).toEqual([])
  })

  test('replaces stale Stage 4 receipts when Stage 3 produces a revised plan', () => {
    let current = recordDevelopmentBatchAgentProgress(
      state(),
      progress('coder', 'B1', 'running', 'old-coder'),
    )
    const phaseState = current.runtimeContract!.phaseStates[DEVELOPMENT_IMPLEMENT_PHASE_ID]!
    phaseState.taskSnapshots = phaseState.taskSnapshots.map(snapshot => ({
      ...snapshot,
      status: 'stale',
      updatedAt: '2026-11-13T07:20:00.000Z',
    }))

    const revisedPlan: DevelopmentBatchPlanTask[] = [
      {
        ...plan[0]!,
        writeScopes: ['Sources/VideoWorkbench/'],
        resourceClaims: ['swiftpm-probe'],
      },
      {
        ...plan[1]!,
        writeScopes: ['Tests/VideoWorkbenchTests/'],
      },
    ]
    const revised = recordDevelopmentBatchAgentProgress(
      current,
      progress('coder', 'B1', 'running', 'new-coder', {
        plan: revisedPlan,
        recordedAt: '2026-11-13T07:25:00.000Z',
      }),
    )
    const revisedSnapshots = revised.runtimeContract!.phaseStates[DEVELOPMENT_IMPLEMENT_PHASE_ID]!.taskSnapshots

    expect(revisedSnapshots).toHaveLength(4)
    expect(revisedSnapshots.every(snapshot => snapshot.status !== 'stale')).toBe(true)
    expect(revisedSnapshots.every(snapshot => snapshot.developmentPlanSignature === developmentBatchPlanSignature(revisedPlan))).toBe(true)
    expect(revisedSnapshots.find(snapshot => snapshot.taskId === 'development-batch:B1:coder')).toMatchObject({
      status: 'running',
      agentId: 'new-coder',
      writeScopes: ['Sources/VideoWorkbench/'],
      resourceClaims: ['swiftpm-probe'],
    })
  })

  test('requires a new Coder run after Reviewer requests fixes', () => {
    let current = state()
    current = recordDevelopmentBatchAgentProgress(current, progress('coder', 'B1', 'running', 'coder-1'))
    current = recordDevelopmentBatchAgentProgress(current, progress('coder', 'B1', 'succeeded', 'coder-1'))
    current = recordDevelopmentBatchAgentProgress(current, progress('reviewer', 'B1', 'running', 'reviewer-1'))
    current = recordDevelopmentBatchAgentProgress(current, progress('reviewer', 'B1', 'failed', 'reviewer-1', {
      reason: 'needs fix',
      reviewerOutcome: { reviewStatus: 'needs-fix', requiredFixes: ['fix validation'], readyForNextBatch: false },
    }))
    expect(() => recordDevelopmentBatchAgentProgress(current, progress('reviewer', 'B1', 'running', 'reviewer-2'))).toThrow('Coder must run again')
    current = recordDevelopmentBatchAgentProgress(current, progress('coder', 'B1', 'running', 'coder-2'))
    const reviewer = current.runtimeContract!.phaseStates[DEVELOPMENT_IMPLEMENT_PHASE_ID]!.taskSnapshots.find((snapshot) => snapshot.taskId.endsWith(':reviewer'))
    expect(reviewer).toMatchObject({ status: 'waiting_dependency', reviewStatus: undefined, requiredFixes: undefined })
  })

  test('parses Reviewer protocol and isolates the Leader write guard to this workflow', () => {
    expect(parseDevelopmentReviewerOutcome(JSON.stringify({
      workflowReview: { reviewStatus: 'pass', requiredFixes: [], readyForNextBatch: true },
    }))).toEqual({ reviewStatus: 'pass', requiredFixes: [], readyForNextBatch: true })
    expect(parseDevelopmentReviewerOutcome('reviewStatus: needs-fix\nrequiredFixes: fix test\nreadyForNextBatch: false')).toEqual({
      reviewStatus: 'needs-fix', requiredFixes: ['fix test'], readyForNextBatch: false,
    })
    expect(parseDevelopmentReviewerOutcome('looks good')).toBeNull()

    const development = state()
    expect(developmentLeaderToolViolation('Write', { file_path: path.join(workspaceRoot, 'src', 'app.ts') }, development, false)).toContain('WORKFLOW_DEVELOPMENT_LEADER_IMPLEMENTATION_FORBIDDEN')
    expect(developmentLeaderToolViolation('Write', { file_path: path.join(workspaceRoot, '.workflow', 'run-report.md') }, development, false)).toBeNull()
    expect(developmentLeaderToolViolation('Write', { file_path: path.join(workspaceRoot, 'src', 'app.ts') }, development, true)).toBeNull()
    expect(developmentLeaderToolViolation('Write', { file_path: path.join(workspaceRoot, 'src', 'app.ts') }, state('feature-extension-workflow-v8'), false)).toBeNull()
  })

  test('normalizes legacy Reviewer readiness without accepting conflicting or incomplete reviews', () => {
    for (const reviewStatus of ['pass', 'needs-fix'] as const) {
      const requiredFixes = reviewStatus === 'pass' ? [] : ['repair module entry']
      const ready = reviewStatus === 'pass'
      expect(parseDevelopmentReviewerOutcome(JSON.stringify({
        workflowReview: { reviewStatus, requiredFixes, allowNextBatch: ready },
      }))).toEqual({ reviewStatus, requiredFixes, readyForNextBatch: ready })
      expect(parseDevelopmentReviewerOutcome(JSON.stringify({
        workflowReview: { reviewStatus, requiredFixes, allowNextBatch: !ready },
      }))).toBeNull()
    }
    expect(parseDevelopmentReviewerOutcome(JSON.stringify({
      workflowReview: { reviewStatus: 'pass', requiredFixes: [], readyForNextBatch: true, allowNextBatch: false },
    }))).toBeNull()
    expect(parseDevelopmentReviewerOutcome(JSON.stringify({
      workflowReview: { reviewStatus: 'pass', readyForNextBatch: true },
    }))).toBeNull()
    expect(parseDevelopmentReviewerOutcome('reviewStatus: pass\nreadyForNextBatch: true')).toBeNull()
    expect(parseDevelopmentReviewerOutcome('reviewStatus: needs-fix\nrequiredFixes: repair module entry\nallowNextBatch: false')).toEqual({
      reviewStatus: 'needs-fix', requiredFixes: ['repair module entry'], readyForNextBatch: false,
    })
    expect(parseDevelopmentReviewerOutcome(JSON.stringify({ reviewStatus: 'needs-fix', requiredFixes: 'repair module entry', allowNextBatch: false }))).toEqual({
      reviewStatus: 'needs-fix', requiredFixes: ['repair module entry'], readyForNextBatch: false,
    })
    for (const value of [
      { reviewStatus: 'pass', requiredFixes: [], readyForNextBatch: 'unknown', allowNextBatch: true },
      { reviewStatus: 'pass', requiredFixes: [], allowNextBatch: 'unknown' },
      { reviewStatus: 'pass', requiredFixes: ['repair module entry'], allowNextBatch: true },
      { reviewStatus: 'needs-fix', requiredFixes: [], allowNextBatch: false },
    ]) expect(parseDevelopmentReviewerOutcome(JSON.stringify(value))).toBeNull()
    expect(parseDevelopmentReviewerOutcome('reviewStatus: pass\nrequiredFixes: []\nreadyForNextBatch: true\nallowNextBatch: false')).toBeNull()
  })

  test('locks the Stage 3 handoff format and never parses BatchId as a fake id Batch', () => {
    expect(extractDevelopmentBatchIds('BatchId: B1\n- BatchId: B2')).toEqual(['B1', 'B2'])
    const parsed = parseDevelopmentBatchPlanDocument(structuredPlanContent())
    expect(parsed.issues).toEqual([])
    expect(parsed.plan).toEqual(plan)

    const current = state()
    current.activePhaseId = DEVELOPMENT_PLAN_PHASE_ID
    current.workflowRuns![0]!.currentPhaseId = DEVELOPMENT_PLAN_PHASE_ID
    const prompt = developmentBatchHandoffPrompt(current)
    expect(prompt).toContain('.workflow/runs/run-1/delivery-plan.md')
    expect(prompt).toContain('"depends_on"')
    expect(prompt).toContain('"workspace_mode"')
    expect(prompt).toContain('Workspace preflight: existing project evidence found (package.json)')
    expect(prompt).toContain('never use a range such as B1-B3')

    const feature = state('feature-extension-workflow-v8')
    feature.activePhaseId = DEVELOPMENT_PLAN_PHASE_ID
    expect(developmentBatchHandoffPrompt(feature)).toBe('')
  })

  test('rejects unordered overlapping Batches before Stage 4 can consume them', () => {
    const parsed = parseDevelopmentBatchPlanDocument(structuredPlanContent([
      { id: 'B1', dependsOn: [], writeScopes: ['src/shared'], resourceClaims: [], executionMode: 'write' },
      { id: 'B2', dependsOn: [], writeScopes: ['src/shared/file.ts'], resourceClaims: [], executionMode: 'write' },
    ]))
    expect(parsed.plan).toBeNull()
    expect(parsed.issues.join('\n')).toContain('have no dependency ordering')
  })

  test('migrates the legacy session-id delivery plan into the active run and persists the validated plan', async () => {
    const current = state()
    current.sessionId = 'legacy-session'
    current.activePhaseId = DEVELOPMENT_PLAN_PHASE_ID
    current.activeWorkflowRunId = 'legacy-session-run-1'
    current.workflowRuns![0]!.id = 'legacy-session-run-1'
    current.workflowRuns![0]!.currentPhaseId = DEVELOPMENT_PLAN_PHASE_ID
    const legacyDir = path.join(workspaceRoot, '.workflow', 'runs', current.sessionId)
    await fs.mkdir(legacyDir, { recursive: true })
    await fs.writeFile(path.join(legacyDir, 'delivery-plan.md'), structuredPlanContent())

    const prepared = await prepareDevelopmentDeliveryPlanHandoff(current, NOW)
    expect(prepared.issues).toEqual([])
    expect(prepared.plan).toEqual(plan)
    const canonicalPath = path.join(workspaceRoot, '.workflow', 'runs', 'legacy-session-run-1', 'delivery-plan.md')
    await expect(fs.readFile(canonicalPath, 'utf8')).resolves.toContain('"id": "B1"')
    expect(prepared.state.workflowRuns![0]!.artifacts).toContainEqual(expect.objectContaining({
      id: 'delivery-plan',
      filename: '.workflow/runs/legacy-session-run-1/delivery-plan.md',
      phaseId: DEVELOPMENT_PLAN_PHASE_ID,
      developmentBatchPlan: plan,
    }))

    prepared.state.activePhaseId = DEVELOPMENT_IMPLEMENT_PHASE_ID
    prepared.state.workflowRuns![0]!.currentPhaseId = DEVELOPMENT_IMPLEMENT_PHASE_ID
    expect(authoritativeDevelopmentBatchIds(prepared.state)).toEqual(['B1', 'B2'])
    expect(() => validateDevelopmentBatchPlanForState(prepared.state, [
      { ...plan[0]!, writeScopes: ['src/changed.ts'] },
      plan[1]!,
    ])).toThrow('must exactly match the validated Stage 3 tasks')
  })

  test('keeps the newly rewritten canonical Stage 3 plan instead of restoring a stale artifact copy', async () => {
    const current = state()
    current.activePhaseId = DEVELOPMENT_PLAN_PHASE_ID
    current.workflowRuns![0]!.currentPhaseId = DEVELOPMENT_PLAN_PHASE_ID
    current.workflowRuns![0]!.artifacts = [{
      id: 'delivery-plan',
      filename: '.workflow/runs/run-1/delivery-plan.md',
      kind: 'markdown',
      phaseId: DEVELOPMENT_PLAN_PHASE_ID,
      createdAt: '2026-08-28T07:00:00.000Z',
      updatedAt: '2026-08-28T07:00:00.000Z',
      content: structuredPlanContent(plan),
      developmentBatchPlan: plan,
    }]
    const revisedPlan: DevelopmentBatchPlanTask[] = [
      { id: 'B1', dependsOn: [], writeScopes: ['VideoEditor/App/**'], resourceClaims: ['app-skeleton'], executionMode: 'write' },
      { id: 'B2', dependsOn: ['B1'], writeScopes: ['VideoEditorTests/App/**'], resourceClaims: ['app-tests'], executionMode: 'write' },
    ]
    const canonicalPath = path.join(workspaceRoot, '.workflow', 'runs', 'run-1', 'delivery-plan.md')
    await fs.writeFile(canonicalPath, structuredPlanContent(revisedPlan))

    const prepared = await prepareDevelopmentDeliveryPlanHandoff(current, NOW)

    expect(prepared.issues).toEqual([])
    expect(prepared.plan).toEqual(revisedPlan)
    await expect(fs.readFile(canonicalPath, 'utf8')).resolves.toContain('VideoEditor/App/**')
    expect(prepared.state.workflowRuns![0]!.artifacts).toContainEqual(expect.objectContaining({
      id: 'delivery-plan',
      developmentBatchPlan: revisedPlan,
      content: expect.stringContaining('VideoEditor/App/**'),
    }))
  })

  test('rejects an empty-workspace plan until it explicitly declares a blank-create start', async () => {
    const current = state()
    current.activePhaseId = DEVELOPMENT_PLAN_PHASE_ID
    current.workflowRuns![0]!.currentPhaseId = DEVELOPMENT_PLAN_PHASE_ID
    await fs.rm(path.join(workspaceRoot, 'package.json'))
    const canonicalPath = path.join(workspaceRoot, '.workflow', 'runs', 'run-1', 'delivery-plan.md')
    await fs.writeFile(canonicalPath, structuredPlanContent([
      { id: 'B1', dependsOn: [], writeScopes: ['macOS-app/**'], resourceClaims: ['app-skeleton'], executionMode: 'write' },
    ]))

    const prepared = await prepareDevelopmentDeliveryPlanHandoff(current, NOW)

    expect(prepared.plan).toBeNull()
    expect(prepared.issues.join('\n')).toContain('"workspace_mode": "blank-create"')
  })

  test('accepts a blank-create plan for an empty workspace and reports that preflight to the model', async () => {
    const current = state()
    current.activePhaseId = DEVELOPMENT_PLAN_PHASE_ID
    current.workflowRuns![0]!.currentPhaseId = DEVELOPMENT_PLAN_PHASE_ID
    await fs.rm(path.join(workspaceRoot, 'package.json'))
    const blankCreatePlan: DevelopmentBatchPlanTask[] = [
      { id: 'B1', dependsOn: [], writeScopes: ['VideoEditor/**'], resourceClaims: ['app-skeleton'], executionMode: 'write' },
    ]
    const canonicalPath = path.join(workspaceRoot, '.workflow', 'runs', 'run-1', 'delivery-plan.md')
    await fs.writeFile(canonicalPath, structuredPlanContent(blankCreatePlan, 'blank-create'))

    const prepared = await prepareDevelopmentDeliveryPlanHandoff(current, NOW)

    expect(prepared.issues).toEqual([])
    expect(prepared.plan).toEqual(blankCreatePlan)
    expect(developmentBatchHandoffPrompt(current)).toContain('Workspace preflight: blank')
  })

})


test('stage 4 prompt distinguishes public batch ID from internal ledger and scheduler IDs', () => {
  const prompt = developmentBatchHandoffPrompt(state())
  expect(prompt).toContain('workflow_parallel_plan.task_id is the original Batch ID')
  expect(prompt).toContain('development-batch:B1:coder')
  expect(prompt).toContain('B1::coder')
})
