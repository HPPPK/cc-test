import { afterEach, describe, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { PackRegistryService, resetPackRegistryForTests } from './packRegistryService.js'
import { WorkflowRuntimeService } from './workflowRuntimeService.js'
import { WorkflowSessionCreateService } from './workflowSessionCreateService.js'
import { WorkflowSessionStateService } from './workflowSessionStateService.js'
import { ZipPackAdapter } from './zipPackAdapter.js'
import { resetWorkflowTemplateRegistryForTests } from './workflowTemplateRegistryService.js'
import {
  getWorkflowPhaseDisallowedTools,
  hasWorkflowArtifactWriteCapability,
} from './workflowToolPolicy.js'
import type { CompletionSubmission, WorkflowArtifactPointer, WorkflowSessionState } from './workflowTypes.js'

type ShippedWorkflowCase = {
  id: string
  packFile: string
  implementationPhaseId: string
  routeFromPhaseIds: string[]
  routeToPhaseId: string
  request: string
}

const SHIPPED_WORKFLOWS: ShippedWorkflowCase[] = [
  {
    id: 'efficient-constrained-dev-debug-workflow-v5',
    packFile: 'efficient-constrained-dev-debug-workflow-v5.zip',
    implementationPhaseId: 'delegate-implement',
    routeFromPhaseIds: ['scenario-review', 'local-preview'],
    routeToPhaseId: 'delegate-implement',
    request: '创建一个需要完整计划、分批实现、验收验证和本地预览的 SaaS MVP。',
  },
  {
    id: 'debug-repair-workflow-v8',
    packFile: 'debug-repair-workflow-v8.zip',
    implementationPhaseId: 'debug-fix',
    routeFromPhaseIds: ['debug-quality-preview'],
    routeToPhaseId: 'debug-fix',
    request: '修复生产环境点击保存后出现 500 错误的问题，并验证回归场景。',
  },
  {
    id: 'feature-extension-workflow-v8',
    packFile: 'feature-extension-workflow-v8.zip',
    implementationPhaseId: 'feature-implement',
    routeFromPhaseIds: ['feature-quality-preview'],
    routeToPhaseId: 'feature-implement',
    request: '为现有项目新增可配置的导出筛选功能，并完成实现、验证与预览。',
  },
]

const CANONICAL_WORKFLOW_PROTOCOL_TOOLS = [
  'Agent',
  'AskUserQuestion',
  'Bash',
  'Edit',
  'Glob',
  'Grep',
  'LS',
  'MultiEdit',
  'PowerShell',
  'Read',
  'Write',
  'request_workflow_route',
  'submit_phase_completion',
  'workflow_artifact_write',
  'workflow_template_authoring',
]

const originalConfigDir = process.env.CLAUDE_CONFIG_DIR
let tempConfigDir: string | null = null
let workspaceDirs: string[] = []

function restoreConfigDir(): void {
  if (originalConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR
  } else {
    process.env.CLAUDE_CONFIG_DIR = originalConfigDir
  }
}

async function initializeIsolatedPackRegistry(): Promise<void> {
  tempConfigDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-jiangxia-shipped-workflow-e2e-'))
  process.env.CLAUDE_CONFIG_DIR = tempConfigDir
  resetPackRegistryForTests()
  resetWorkflowTemplateRegistryForTests()

  const registry = new PackRegistryService()
  for (const workflow of SHIPPED_WORKFLOWS) {
    const source = path.join(process.cwd(), 'src', 'server', 'packs', workflow.packFile)
    await registry.importWorkflowPackZip(new Uint8Array(await fs.readFile(source)))
  }
}

async function createRealWorkflowState(
  workflow: ShippedWorkflowCase,
): Promise<WorkflowSessionState> {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), `cc-jiangxia-${workflow.id}-`))
  workspaceDirs.push(workspace)
  const createService = new WorkflowSessionCreateService()
  const template = await createService.resolveTemplate({
    templateId: workflow.id,
    templateSource: 'user',
    request: workflow.request,
  })
  const sessionId = `shipped-pack-e2e-${workflow.id}-${crypto.randomUUID()}`
  await createService.createWorkflowSessionMetadata(sessionId, workspace, template, {
    templateId: workflow.id,
    templateSource: 'user',
    request: workflow.request,
  })
  const read = await new WorkflowSessionStateService().readState(sessionId)
  if (!read.state) throw new Error(`Workflow state was not written for ${workflow.id}`)
  return { ...read.state, workflowLanguage: 'zh' }
}

function runtimeService(): WorkflowRuntimeService {
  return new WorkflowRuntimeService(
    undefined,
    async (state) => state.templateSnapshot ?? null,
  )
}

function completionFor(
  state: WorkflowSessionState,
  status: CompletionSubmission['status'],
): CompletionSubmission {
  if (!state.activePhaseId) throw new Error('An active phase is required for completion')
  return {
    phaseId: state.activePhaseId,
    stateVersion: state.stateVersion,
    status,
    handoff: {
      summary: `${state.activePhaseId} end-to-end handoff`,
      changedFiles: [],
      validation: ['deterministic shipped-pack runtime test'],
    },
    rationale: `${state.activePhaseId} completed in deterministic shipped-pack runtime test.`,
    evidence: [{
      ref: `e2e:${state.activePhaseId}:${state.stateVersion}`,
      summary: 'Deterministic runtime transition evidence.',
    }],
  }
}

function appendPhaseEvidence(
  state: WorkflowSessionState,
  phaseId: string,
  pointer: WorkflowArtifactPointer,
): WorkflowSessionState {
  const hasArtifact = (items: WorkflowArtifactPointer[]) => items.some((item) => item.artifactId === pointer.artifactId)
  return {
    ...state,
    artifactIndex: Array.isArray(state.artifactIndex)
      ? (hasArtifact(state.artifactIndex) ? state.artifactIndex : [...state.artifactIndex, pointer])
      : { ...(state.artifactIndex ?? {}), [pointer.artifactId]: pointer },
    phases: state.phases.map((phase) => phase.id === phaseId && !hasArtifact(phase.artifactPointers)
      ? { ...phase, artifactPointers: [...phase.artifactPointers, pointer] }
      : phase),
    phaseRuns: state.phaseRuns.map((phaseRun) => phaseRun.phaseId === phaseId && !hasArtifact(phaseRun.outputArtifactRefs)
      ? { ...phaseRun, outputArtifactRefs: [...phaseRun.outputArtifactRefs, pointer] }
      : phaseRun),
  }
}

async function recordCompletionPrerequisites(
  service: WorkflowRuntimeService,
  initial: WorkflowSessionState,
  sequence: number,
): Promise<WorkflowSessionState> {
  const phaseId = initial.activePhaseId
  if (!phaseId) throw new Error('Cannot record prerequisites for a terminal workflow')
  const stateService = new WorkflowSessionStateService()
  let state = initial
  const phaseState = state.runtimeContract?.phaseStates[phaseId]
  if (!phaseState) throw new Error('New workflow session is missing its runtime completion contract')

  for (const requirement of phaseState.artifactRequirements.filter((item) => item.required && item.status !== 'satisfied')) {
    const artifactId = 'e2e-evidence-' + phaseId + '-' + requirement.id + '-' + sequence
    const persisted = await stateService.writePhaseArtifact(state.sessionId, {
      schemaVersion: 1,
      sessionId: state.sessionId,
      phaseId,
      artifactId,
      lifecycleStatus: 'pending',
      type: 'structured-output',
      createdAt: '2026-07-17T00:' + String(sequence).padStart(2, '0') + ':10.000Z',
      title: 'Deterministic E2E evidence for ' + requirement.id,
      content: {
        requirementId: requirement.id,
        phaseId,
        evidence: 'Persisted before completion review.',
      },
      provenance: {
        messageId: 'shipped-pack-e2e:' + phaseId + ':' + sequence,
      },
    })
    state = appendPhaseEvidence(state, phaseId, persisted.pointer)
    state = (await service.updatePhaseProgress({
      state,
      phaseId,
      stateVersion: state.stateVersion,
      update: {
        type: 'artifact-satisfied',
        actor: 'runtime',
        artifactRequirementId: requirement.id,
        artifactIds: [artifactId],
        rationale: 'Recorded persisted deterministic E2E evidence for the declared artifact requirement.',
      },
      requestedAt: '2026-07-17T00:' + String(sequence).padStart(2, '0') + ':11.000Z',
    })).state
  }

  const refreshedPhaseState = state.runtimeContract?.phaseStates[phaseId]
  if (!refreshedPhaseState) throw new Error('Runtime completion contract disappeared while recording prerequisites')
  const evidenceArtifactIds = refreshedPhaseState.artifactRequirements.flatMap((requirement) => requirement.artifactIds)
  for (const check of refreshedPhaseState.checks.filter((item) => item.required && item.status !== 'passed')) {
    state = (await service.updatePhaseProgress({
      state,
      phaseId,
      stateVersion: state.stateVersion,
      update: {
        type: 'check-passed',
        actor: 'runtime',
        checkId: check.id,
        ...(evidenceArtifactIds.length ? { evidenceArtifactIds } : {}),
        rationale: 'Recorded deterministic E2E completion check against persisted runtime state.',
      },
      requestedAt: '2026-07-17T00:' + String(sequence).padStart(2, '0') + ':12.000Z',
    })).state
  }

  if (state.runtimeContract?.phaseStates[phaseId]?.workStatus !== 'ready-for-review') {
    state = (await service.updatePhaseProgress({
      state,
      phaseId,
      stateVersion: state.stateVersion,
      update: {
        type: 'work-ready-for-review',
        actor: 'runtime',
        rationale: 'Marked deterministic shipped-pack phase work ready for review after its declared evidence and checks were recorded.',
      },
      requestedAt: '2026-07-17T00:' + String(sequence).padStart(2, '0') + ':13.000Z',
    })).state
  }
  return state
}

async function completeCurrentPhase(
  service: WorkflowRuntimeService,
  state: WorkflowSessionState,
  sequence: number,
): Promise<WorkflowSessionState> {
  state = await recordCompletionPrerequisites(service, state, sequence)
  const phaseId = state.activePhaseId
  if (!phaseId) throw new Error('Cannot complete an already terminal workflow')
  const phase = state.templateSnapshot?.phases.find((candidate) => candidate.id === phaseId)
  if (!phase) throw new Error(`No template definition for ${phaseId}`)
  const status: CompletionSubmission['status'] = phase.transitionAuthority === 'auto'
    ? 'completed'
    : 'ready'
  const submitted = await service.submitPhaseCompletion({
    state,
    requestedAt: `2026-07-17T00:${String(sequence).padStart(2, '0')}:00.000Z`,
    transitionId: `e2e-complete-${phaseId}-${sequence}`,
    submission: completionFor(state, status),
  })
  if (!submitted.state.pendingConfirmation) return submitted.state

  const confirmed = await service.applyTransition({
    state: submitted.state,
    requestedAt: `2026-07-17T00:${String(sequence).padStart(2, '0')}:30.000Z`,
    request: {
      phaseId,
      action: 'confirm',
      confirmationId: submitted.state.pendingConfirmation!.confirmationId,
      stateVersion: submitted.state.stateVersion,
      transitionId: `e2e-confirm-${phaseId}-${sequence}`,
    },
  })
  return confirmed.state
}

async function advanceToPhase(
  service: WorkflowRuntimeService,
  initial: WorkflowSessionState,
  targetPhaseId: string,
): Promise<WorkflowSessionState> {
  let state = initial
  for (let sequence = 1; state.activePhaseId !== targetPhaseId; sequence += 1) {
    if (sequence > 12 || !state.activePhaseId) {
      throw new Error(`Workflow did not reach ${targetPhaseId}; stopped at ${state.activePhaseId ?? 'completed'}`)
    }
    state = await completeCurrentPhase(service, state, sequence)
  }
  return state
}

async function finishWorkflow(
  service: WorkflowRuntimeService,
  initial: WorkflowSessionState,
): Promise<WorkflowSessionState> {
  let state = initial
  for (let sequence = 20; state.activePhaseId; sequence += 1) {
    if (sequence > 40) throw new Error(`Workflow did not complete; stopped at ${state.activePhaseId}`)
    state = await completeCurrentPhase(service, state, sequence)
  }
  return state
}

afterEach(async () => {
  resetPackRegistryForTests()
  resetWorkflowTemplateRegistryForTests()
  restoreConfigDir()
  await Promise.all(workspaceDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })))
  workspaceDirs = []
  if (tempConfigDir) {
    await fs.rm(tempConfigDir, { recursive: true, force: true })
    tempConfigDir = null
  }
})

describe('shipped workflow packs deterministic end-to-end protocol coverage', () => {
  test('declares the canonical runtime tools and structured repair-route capabilities in every shipped workflow ZIP', async () => {
    const adapter = new ZipPackAdapter()
    const routingPhaseIds: Record<string, string[]> = {
      'efficient-constrained-dev-debug-workflow-v5': ['scenario-review', 'local-preview'],
      'feature-extension-workflow-v8': ['feature-quality-preview'],
      'debug-repair-workflow-v8': ['debug-quality-preview'],
    }

    for (const workflow of SHIPPED_WORKFLOWS) {
      const source = path.join(process.cwd(), 'src', 'server', 'packs', workflow.packFile)
      const archive = await adapter.read(new Uint8Array(await fs.readFile(source)))
      const hostTools = await archive.readJson<{ requiredHostTools: Array<{ name: string; supported: boolean }> }>('tools/host-tools.json')
      const manifest = await archive.readJson<{ dependencies?: { requiredHostTools?: Array<{ name: string; supported: boolean }> } }>('manifest.json')
      const workflowEntry = archive.entries.find((entry) => entry.path.startsWith('workflows/') && entry.path.endsWith('.workflow.json'))
      if (!workflowEntry) throw new Error('Workflow entry is missing from ' + workflow.packFile)
      const template = await archive.readJson<{ phases: Array<{ id: string; runtimeContract?: { toolAccess?: { allowed?: string[] } }; instructions?: string; executionRules?: string[]; subagentPolicy?: { parallelSubagentsAllowed?: boolean; maxParallel?: number | null; controlledBy?: string; sequence?: string[] } }> }>(workflowEntry.path)

      expect(hostTools.requiredHostTools.map((tool) => tool.name)).toEqual(CANONICAL_WORKFLOW_PROTOCOL_TOOLS)
      expect(hostTools.requiredHostTools.every((tool) => tool.supported)).toBe(true)
      expect(manifest.dependencies?.requiredHostTools).toEqual(hostTools.requiredHostTools)
      for (const phase of template.phases) {
        expect(phase.runtimeContract?.toolAccess?.allowed).toContain('submit_phase_completion')
        expect(phase.runtimeContract?.toolAccess?.allowed).toContain('request_workflow_route')
      }
      for (const phaseId of routingPhaseIds[workflow.id] ?? []) {
        const phase = template.phases.find((candidate) => candidate.id === phaseId)
        expect(phase, `${workflow.id} is missing routing phase ${phaseId}`).toBeDefined()
        expect(phase?.runtimeContract?.toolAccess?.allowed).toContain('request_workflow_route')
        expect(phase?.runtimeContract?.toolAccess?.allowed).toContain('submit_phase_completion')
      }
      if (workflow.id === 'debug-repair-workflow-v8') {
        const intake = template.phases.find((phase) => phase.id === 'debug-memory-intake')
        expect(intake?.executionRules).toEqual(expect.arrayContaining([
          expect.stringContaining('use workflow_artifact_write'),
          expect.stringContaining('do not ask the user to finish, retry, bypass'),
        ]))
      }
    }
  })
  test('allows the development implementation phase to schedule independent batches through the host runtime while keeping Coder before Reviewer', async () => {
    const adapter = new ZipPackAdapter()
    const source = path.join(process.cwd(), 'src', 'server', 'packs', 'efficient-constrained-dev-debug-workflow-v5.zip')
    const archive = await adapter.read(new Uint8Array(await fs.readFile(source)))
    const workflowEntry = archive.entries.find((entry) => entry.path.startsWith('workflows/') && entry.path.endsWith('.workflow.json'))
    if (!workflowEntry) throw new Error('Development workflow entry is missing')
    const template = await archive.readJson<{ phases: Array<{ id: string; instructions?: string; subagentPolicy?: { parallelSubagentsAllowed?: boolean; maxParallel?: number | null; controlledBy?: string; sequence?: string[] } }> }>(workflowEntry.path)
    const phase = template.phases.find((candidate) => candidate.id === 'delegate-implement')

    expect(phase?.subagentPolicy).toMatchObject({
      parallelSubagentsAllowed: true,
      maxParallel: null,
      controlledBy: 'host-runtime',
      sequence: ['coder', 'reviewer'],
    })
    expect(phase?.instructions).toContain('Coder → Reviewer')
    expect(phase?.instructions).toContain('write scopes')
  })

  test('keeps every shipped subagent phase host-managed and unbounded', async () => {
    const adapter = new ZipPackAdapter()

    for (const workflow of SHIPPED_WORKFLOWS) {
      const source = path.join(process.cwd(), 'src', 'server', 'packs', workflow.packFile)
      const archive = await adapter.read(new Uint8Array(await fs.readFile(source)))
      const workflowEntry = archive.entries.find((entry) => entry.path.startsWith('workflows/') && entry.path.endsWith('.workflow.json'))
      if (!workflowEntry) throw new Error('Workflow entry is missing from ' + workflow.packFile)
      const template = await archive.readJson<{ phases: Array<{ subagentPolicy?: Record<string, unknown>; contract?: { subagentPolicy?: Record<string, unknown> } }> }>(workflowEntry.path)
      const policies = template.phases.flatMap((phase) => [phase.subagentPolicy, phase.contract?.subagentPolicy].filter(Boolean))

      expect(policies.length).toBeGreaterThan(0)
      for (const policy of policies) {
        expect(policy).toMatchObject({
          parallelSubagentsAllowed: true,
          maxParallel: null,
          controlledBy: 'host-runtime',
        })
      }
    }
  })

  test('requires Feature Extension and Debug packs to inventory every requested task and account for every accepted task', async () => {
    const adapter = new ZipPackAdapter()
    const cases = [
      {
        packFile: 'feature-extension-workflow-v8.zip',
        intakePhaseId: 'feature-memory-plan',
        workPhaseIds: ['feature-implement'],
        qualityPhaseId: 'feature-quality-preview',
      },
      {
        packFile: 'debug-repair-workflow-v8.zip',
        intakePhaseId: 'debug-memory-intake',
        workPhaseIds: ['debug-investigate', 'debug-fix'],
        qualityPhaseId: 'debug-quality-preview',
      },
    ]

    for (const workflow of cases) {
      const source = path.join(process.cwd(), 'src', 'server', 'packs', workflow.packFile)
      const archive = await adapter.read(new Uint8Array(await fs.readFile(source)))
      const workflowEntry = archive.entries.find((entry) => entry.path.startsWith('workflows/') && entry.path.endsWith('.workflow.json'))
      if (!workflowEntry) throw new Error('Workflow entry is missing from ' + workflow.packFile)
      const template = await archive.readJson<{
        phases: Array<{
          id: string
          instructions?: string
          handoffRules?: string[]
          completionCriteria?: { description?: string }
          subagentPolicy?: { parallelSubagentsAllowed?: boolean; maxParallel?: number | null; controlledBy?: string }
        }>
      }>(workflowEntry.path)
      const intake = template.phases.find((phase) => phase.id === workflow.intakePhaseId)
      const quality = template.phases.find((phase) => phase.id === workflow.qualityPhaseId)

      expect(intake?.instructions).toContain('every user-requested item')
      expect(intake?.handoffRules).toEqual(expect.arrayContaining([
        expect.stringContaining('task inventory'),
      ]))
      expect(quality?.instructions).toContain('every accepted task')
      expect(quality?.completionCriteria?.description).toContain('every accepted task')

      for (const phaseId of workflow.workPhaseIds) {
        const phase = template.phases.find((candidate) => candidate.id === phaseId)
        expect(phase?.instructions).toContain('every accepted task')
        expect(phase?.instructions).toContain('write scopes')
        expect(phase?.subagentPolicy).toMatchObject({
          parallelSubagentsAllowed: true,
          maxParallel: null,
          controlledBy: 'host-runtime',
        })
      }
    }
  })
  test('ships development continuity and compact Feature/Debug clarification guidance without requiring project-owned files', async () => {
    const adapter = new ZipPackAdapter()
    const loadTemplate = async (packFile: string) => {
      const source = path.join(process.cwd(), 'src', 'server', 'packs', packFile)
      const archive = await adapter.read(new Uint8Array(await fs.readFile(source)))
      const workflowEntry = archive.entries.find((entry) => entry.path.startsWith('workflows/') && entry.path.endsWith('.workflow.json'))
      if (!workflowEntry) throw new Error('Workflow entry is missing from ' + packFile)
      return archive.readJson<{
        version: string
        phases: Array<{
          id: string
          instructions?: string
          executionRules?: string[]
          toolPolicy?: { allowedTools?: string[] }
          runtimeContract?: {
            toolAccess?: { allowed?: string[] }
            questionPolicy?: { maxQuestionCount?: number; requireAnswerProcessingBeforeNextQuestion?: boolean }
          }
          evidencePolicy?: {
            requiredArtifacts?: Array<{ id: string; required?: boolean }>
          }
        }>
      }>(workflowEntry.path)
    }

    const development = await loadTemplate('efficient-constrained-dev-debug-workflow-v5.zip')
    const developmentIntake = development.phases.find((phase) => phase.id === 'route-context')
    const developmentPhase = (id: string) => development.phases.find((phase) => phase.id === id)?.instructions ?? ''
    expect(development.version).toBe('20')
    expect(developmentIntake?.runtimeContract?.questionPolicy).toEqual(expect.objectContaining({
      requireNecessaryQuestion: true,
      requireAnswerProcessingBeforeNextQuestion: false,
    }))
    expect(developmentPhase('route-context')).toContain('Continue this one-question-at-a-time clarification until every material current-phase decision is settled')
    expect(developmentPhase('route-context')).toContain('AGENTS.md')
    expect(developmentPhase('route-context')).toContain('not a precondition')
    expect(developmentPhase('route-context')).toContain('### Focused clarification')
    expect(developmentPhase('route-context')).not.toContain('AskUserQuestion packet')
    expect(developmentPhase('route-context')).not.toContain('Mandatory multi-outcome clarification prerequisite')
    expect(developmentPhase('delivery-plan')).not.toContain('.workflow/engineering-log.md')
    expect(developmentPhase('delivery-plan')).toContain('application-appropriate logging/diagnostic design')
    expect(developmentPhase('delegate-implement')).toContain('Treat continuity and diagnostics as normal implementation work')
    expect(developmentPhase('scenario-review')).toContain('redaction/safety expectations')
    expect(developmentPhase('delivery-plan')).toContain('### Core User-Flow Verification Plan (mandatory)')
    expect(developmentPhase('delegate-implement')).toContain('### Core User-Flow Implementation and Review Contract (mandatory)')
    expect(developmentPhase('delegate-implement')).toContain('### Executable batch-parallelism contract')
    expect(developmentPhase('delegate-implement')).toContain('workflow_parallel_plan.tasks contains every task in the active phase')
    expect(developmentPhase('delegate-implement')).toContain('Do not create an investigation-only Debug Subagent merely because')
    expect(developmentPhase('delivery-plan')).toContain('### Executable batch-parallelism contract')
    expect(developmentPhase('scenario-review')).toContain('### Core-Flow Acceptance Evidence (mandatory)')
    expect(developmentPhase('local-preview')).toContain('### Preview Failure Diagnostic Loop (mandatory)')
    const developmentScenarioReview = development.phases.find((phase) => phase.id === 'scenario-review')
    expect(developmentScenarioReview?.evidencePolicy?.requiredArtifacts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'core-flow-evidence', required: true }),
    ]))

    const feature = await loadTemplate('feature-extension-workflow-v8.zip')
    const featureIntake = feature.phases.find((phase) => phase.id === 'feature-memory-plan')
    const featurePhase = (id: string) => feature.phases.find((phase) => phase.id === id)?.instructions ?? ''
    expect(feature.version).toBe('20')
    expect(featureIntake?.executionRules).toContain('Read-only discovery (Glob, Grep, and Read; use LS when the host exposes it), artifact, and structured question actions only. Do not use Bash or PowerShell.')
    expect(featureIntake?.toolPolicy?.allowedTools).toEqual(expect.arrayContaining(['Read', 'Glob', 'Grep', 'LS']))
    expect(featureIntake?.runtimeContract?.toolAccess?.allowed).toEqual(expect.arrayContaining(['Read', 'Glob', 'Grep', 'LS']))
    expect(featurePhase('feature-memory-plan')).toContain('one structured AskUserQuestion')
    expect(featurePhase('feature-memory-plan')).toContain('Continue sequentially until every material decision in that existing checklist is settled')
    expect(featurePhase('feature-memory-plan')).toContain('decision coverage checklist')
    expect(featurePhase('feature-memory-plan')).toContain('Do not require the user to resolve every possible implementation detail before work can proceed.')
    expect(featurePhase('feature-memory-plan')).toContain('clarification ledger')
    expect(featureIntake?.runtimeContract?.questionPolicy).not.toHaveProperty('maxQuestionCount')
    expect(featureIntake?.runtimeContract?.questionPolicy).toEqual(expect.objectContaining({
      requireAnswerProcessingBeforeNextQuestion: false,
    }))
    expect(featurePhase('feature-memory-plan')).not.toContain('consolidated clarification packet')
    expect(featurePhase('feature-memory-plan')).toContain('read-only discovery: Glob')
    expect(featurePhase('feature-memory-plan')).toContain('optional sources, not required project structure')
    expect(featurePhase('feature-implement')).toContain('Do not stop to ask whether to continue')
    expect(featurePhase('feature-memory-plan')).toContain('### One-question workflow clarification contract')
    expect(featurePhase('feature-memory-plan')).toContain('### Executable batch-parallelism contract')
    expect(featurePhase('feature-implement')).toContain('### Executable batch-parallelism contract')
    expect(featurePhase('feature-quality-preview')).toContain('Compact validation and handoff')
    expect(featurePhase('feature-finish-memory')).toContain('Non-blocking archive')

    const debug = await loadTemplate('debug-repair-workflow-v8.zip')
    const debugIntake = debug.phases.find((phase) => phase.id === 'debug-memory-intake')
    const debugPhase = (id: string) => debug.phases.find((phase) => phase.id === id)?.instructions ?? ''
    expect(debug.version).toBe('21')
    expect(debugIntake?.executionRules).toContain('Read-only discovery (Glob, Grep, and Read; use LS when the host exposes it), artifact, and structured question actions only. Do not use Bash or PowerShell.')
    expect(debugIntake?.toolPolicy?.allowedTools).toEqual(expect.arrayContaining(['Read', 'Glob', 'Grep', 'LS']))
    expect(debugIntake?.runtimeContract?.toolAccess?.allowed).toEqual(expect.arrayContaining(['Read', 'Glob', 'Grep', 'LS']))
    expect(debugPhase('debug-memory-intake')).toContain('one structured AskUserQuestion')
    expect(debugPhase('debug-memory-intake')).toContain('Continue sequentially until every material diagnostic or repair-policy decision in that existing checklist is settled')
    expect(debugPhase('debug-memory-intake')).toContain('diagnostic decision coverage checklist')
    expect(debugPhase('debug-memory-intake')).toContain('Do not require a complete preflight questionnaire before investigation or repair can proceed.')
    expect(debugPhase('debug-memory-intake')).toContain('### Multi-symptom focused clarification')
    expect(debugPhase('debug-memory-intake')).toContain('Before creating the authoritative debug-context.md or debug-work-order.md')
    expect(debugPhase('debug-memory-intake')).toContain('clarification ledger')
    expect(debugIntake?.runtimeContract?.questionPolicy).not.toHaveProperty('maxQuestionCount')
    expect(debugIntake?.runtimeContract?.questionPolicy).toEqual(expect.objectContaining({
      requireAnswerProcessingBeforeNextQuestion: false,
    }))
    expect(debugPhase('debug-memory-intake')).not.toContain('consolidated clarification packet')
    expect(debugPhase('debug-memory-intake')).toContain('### Focused problem clarification and first evidence pass')
    expect(debugPhase('debug-memory-intake')).toContain('read-only discovery: Glob')
    expect(debugPhase('debug-memory-intake')).toContain('optional sources, not required project structure')
    expect(debugPhase('debug-investigate')).toContain('Investigate without progress prompts')
    expect(debugPhase('debug-fix')).toContain('Coder -> Reviewer -> bounded Coder fix sequence')
    expect(debugPhase('debug-investigate')).toContain('### One-question workflow clarification contract')
    expect(debugPhase('debug-investigate')).toContain('### Executable batch-parallelism contract')
    expect(debugPhase('debug-fix')).toContain('### Executable batch-parallelism contract')
    expect(debugPhase('debug-quality-preview')).toContain('Compact regression closeout')
    expect(debugPhase('debug-finish-memory')).toContain('Non-blocking debug archive')

    for (const template of [development, feature, debug]) {
      for (const phase of template.phases) expect(phase.instructions ?? '').not.toContain('engineering-log')
    }

    for (const phaseInstructions of [
      developmentPhase('delegate-implement'),
      featurePhase('feature-implement'),
      debugPhase('debug-fix'),
    ]) {
      expect(phaseInstructions).toContain('### Evidence-based batch-parallelism review')
      expect(phaseInstructions).toContain('explicit batch-parallelism assessment')
      expect(phaseInstructions).toContain('Never choose serial-by-default merely to avoid analysis')
      expect(phaseInstructions).toContain('Launch every qualifying independent group in parallel')
    }
  })

  test('runs every actual ZIP workflow through stage permissions, malformed completion rejection, pause/resume, invalid routes, repair loops, and final completion', async () => {
    await initializeIsolatedPackRegistry()
    const service = runtimeService()

    for (const workflow of SHIPPED_WORKFLOWS) {
      let state = await createRealWorkflowState(workflow)
      expect(state.templateSnapshot?.id).toBe(workflow.id)
      expect(state.activePhaseId).toBe(state.templateSnapshot?.phases[0]?.id)

      const stageOneDenied = getWorkflowPhaseDisallowedTools(state, {
        mode: 'system',
        path: 'rg',
        working: true,
      })
      if (hasWorkflowArtifactWriteCapability(state)) {
        expect(stageOneDenied, `${workflow.id} stage one exposes scoped artifact Write`).not.toContain('Write')
        for (const tool of ['Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'PowerShell', 'Agent']) {
          expect(stageOneDenied, `${workflow.id} stage one still denies ${tool}`).toContain(tool)
        }
      } else {
        for (const tool of ['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'PowerShell', 'Agent']) {
          expect(stageOneDenied, `${workflow.id} stage one denies ${tool}`).toContain(tool)
        }
      }
      for (const tool of ['Read', 'Glob', 'Grep', 'LS', 'AskUserQuestion', 'submit_phase_completion', 'request_workflow_route']) {
        expect(stageOneDenied, `${workflow.id} stage one permits ${tool}`).not.toContain(tool)
      }

      await expect(service.submitPhaseCompletion({
        state,
        requestedAt: '2026-07-17T00:00:01.000Z',
        transitionId: `e2e-missing-handoff-${workflow.id}`,
        submission: {
          phaseId: state.activePhaseId!,
          stateVersion: state.stateVersion,
          status: 'ready',
          rationale: 'Missing handoff must be rejected.',
          evidence: [],
        } as CompletionSubmission,
      })).rejects.toMatchObject({ code: 'WORKFLOW_COMPLETION_INVALID' })
      await expect(service.submitPhaseCompletion({
        state,
        requestedAt: '2026-07-17T00:00:02.000Z',
        transitionId: `e2e-missing-rationale-${workflow.id}`,
        submission: {
          phaseId: state.activePhaseId!,
          stateVersion: state.stateVersion,
          status: 'ready',
          handoff: { summary: 'Missing rationale must be rejected.' },
          evidence: [],
        } as CompletionSubmission,
      })).rejects.toMatchObject({ code: 'WORKFLOW_COMPLETION_INVALID' })
      await expect(service.submitPhaseCompletion({
        state,
        requestedAt: '2026-07-17T00:00:03.000Z',
        transitionId: `e2e-missing-evidence-${workflow.id}`,
        submission: {
          phaseId: state.activePhaseId!,
          stateVersion: state.stateVersion,
          status: 'ready',
          handoff: { summary: 'Missing evidence must be rejected.' },
          rationale: 'Missing evidence must be rejected.',
        } as CompletionSubmission,
      })).rejects.toMatchObject({ code: 'WORKFLOW_COMPLETION_INVALID' })

      const pauseRequested = await service.requestWorkflowRoute({
        state,
        requestedAt: '2026-07-17T00:01:00.000Z',
        transitionId: `e2e-pause-${workflow.id}`,
        request: {
          phaseId: state.activePhaseId!,
          stateVersion: state.stateVersion,
          intent: 'pause',
          rationale: 'Exercise the user-visible pause control before continuing.',
          evidence: [],
          requireUserConfirmation: true,
        },
      })
      expect(pauseRequested.state.pendingRoute).toMatchObject({ intent: 'pause', status: 'pending' })
      const paused = await service.applyTransition({
        state: pauseRequested.state,
        requestedAt: '2026-07-17T00:01:10.000Z',
        request: {
          phaseId: pauseRequested.state.activePhaseId!,
          action: 'confirm',
          confirmationId: pauseRequested.state.pendingRoute!.routeId,
          stateVersion: pauseRequested.state.stateVersion,
          transitionId: `e2e-pause-confirm-${workflow.id}`,
        },
      })
      expect(paused.state.runStatus).toBe('paused')
      const resumeRequested = await service.requestWorkflowRoute({
        state: paused.state,
        requestedAt: '2026-07-17T00:02:00.000Z',
        transitionId: `e2e-resume-${workflow.id}`,
        request: {
          phaseId: paused.state.activePhaseId!,
          stateVersion: paused.state.stateVersion,
          intent: 'resume',
          rationale: 'Resume the active workflow without requiring a typed continue message.',
          evidence: [],
          requireUserConfirmation: true,
        },
      })
      expect(resumeRequested.state.pendingRoute).toMatchObject({ intent: 'resume', status: 'pending' })
      const resumed = await service.applyTransition({
        state: resumeRequested.state,
        requestedAt: '2026-07-17T00:02:10.000Z',
        request: {
          phaseId: resumeRequested.state.activePhaseId!,
          action: 'confirm',
          confirmationId: resumeRequested.state.pendingRoute!.routeId,
          stateVersion: resumeRequested.state.stateVersion,
          transitionId: `e2e-resume-confirm-${workflow.id}`,
        },
      })
      state = resumed.state
      expect(state.runStatus).toBe('active')
      expect(state.activePhaseId).toBe(state.templateSnapshot?.phases[0]?.id)

      state = await advanceToPhase(service, state, workflow.implementationPhaseId)
      const implementationDenied = getWorkflowPhaseDisallowedTools(state, {
        mode: 'system',
        path: 'rg',
        working: true,
      })
      for (const tool of ['Write', 'Edit', 'MultiEdit', 'Bash', 'PowerShell', 'Agent']) {
        expect(implementationDenied, `${workflow.id} implementation permits ${tool}`).not.toContain(tool)
      }

      for (const [routeIndex, routeFromPhaseId] of workflow.routeFromPhaseIds.entries()) {
        state = await advanceToPhase(service, state, routeFromPhaseId)
        state = await recordCompletionPrerequisites(service, state, 50 + routeIndex)
        const pending = await service.submitPhaseCompletion({
          state,
          requestedAt: `2026-07-17T01:${String(routeIndex).padStart(2, '0')}:00.000Z`,
          transitionId: `e2e-route-completion-${workflow.id}-${routeFromPhaseId}`,
          submission: completionFor(state, 'ready'),
        })
        expect(pending.state.pendingConfirmation?.phaseId).toBe(routeFromPhaseId)

        await expect(service.requestWorkflowRoute({
          state: pending.state,
          requestedAt: `2026-07-17T01:${String(routeIndex).padStart(2, '0')}:10.000Z`,
          transitionId: `e2e-stale-route-${workflow.id}-${routeFromPhaseId}`,
          request: {
            phaseId: routeFromPhaseId,
            stateVersion: pending.state.stateVersion - 1,
            intent: 'jump_to_phase',
            targetPhaseId: workflow.routeToPhaseId,
            rationale: 'A stale state version must not create a route.',
            evidence: [],
          },
        })).rejects.toMatchObject({ code: 'WORKFLOW_STATE_STALE' })
        await expect(service.requestWorkflowRoute({
          state: pending.state,
          requestedAt: `2026-07-17T01:${String(routeIndex).padStart(2, '0')}:20.000Z`,
          transitionId: `e2e-invalid-route-${workflow.id}-${routeFromPhaseId}`,
          request: {
            phaseId: routeFromPhaseId,
            stateVersion: pending.state.stateVersion,
            intent: 'jump_to_phase',
            targetPhaseId: 'does-not-exist',
            rationale: 'An unknown target must be rejected without changing the pending completion.',
            evidence: [],
          },
        })).rejects.toMatchObject({ code: 'WORKFLOW_ROUTE_TARGET_INVALID' })
        expect(pending.state.pendingRoute).toBeNull()
        expect(pending.state.pendingConfirmation?.status).toBe('pending')

        const requestedRoute = await service.requestWorkflowRoute({
          state: pending.state,
          requestedAt: `2026-07-17T01:${String(routeIndex).padStart(2, '0')}:30.000Z`,
          transitionId: `e2e-route-request-${workflow.id}-${routeFromPhaseId}`,
          request: {
            phaseId: routeFromPhaseId,
            stateVersion: pending.state.stateVersion,
            intent: 'jump_to_phase',
            targetPhaseId: workflow.routeToPhaseId,
            rationale: 'The validation path found a scoped defect that must be repaired in the implementation phase.',
            evidence: [{ ref: `e2e:route:${routeFromPhaseId}`, summary: 'Scoped regression evidence.' }],
            requireUserConfirmation: true,
          },
        })
        expect(requestedRoute.requiresConfirmation).toBe(true)
        expect(requestedRoute.approvedTargetPhaseId).toBe(workflow.routeToPhaseId)
        expect(requestedRoute.state.pendingRoute?.targetPhaseId).toBe(workflow.routeToPhaseId)

        const confirmedRoute = await service.applyTransition({
          state: requestedRoute.state,
          requestedAt: `2026-07-17T01:${String(routeIndex).padStart(2, '0')}:40.000Z`,
          request: {
            phaseId: routeFromPhaseId,
            action: 'confirm',
            confirmationId: requestedRoute.state.pendingRoute!.routeId,
            stateVersion: requestedRoute.state.stateVersion,
            transitionId: `e2e-route-confirm-${workflow.id}-${routeFromPhaseId}`,
          },
        })
        state = confirmedRoute.state
        expect(state.activePhaseId).toBe(workflow.routeToPhaseId)
        expect(state.pendingRoute).toBeNull()

        if (routeIndex === 0) {
          state = await recordCompletionPrerequisites(service, state, 60 + routeIndex)
          const reworkPending = await service.submitPhaseCompletion({
            state,
            requestedAt: '2026-07-17T01:30:00.000Z',
            transitionId: `e2e-rework-completion-${workflow.id}`,
            submission: completionFor(state, 'ready'),
          })
          const reworkRequested = await service.requestWorkflowRoute({
            state: reworkPending.state,
            requestedAt: '2026-07-17T01:31:00.000Z',
            transitionId: `e2e-rework-request-${workflow.id}`,
            request: {
              phaseId: workflow.routeToPhaseId,
              stateVersion: reworkPending.state.stateVersion,
              intent: 'rework_current_phase',
              rationale: 'A focused repair pass should keep the same implementation phase active.',
              evidence: [{ ref: 'e2e:rework', summary: 'Repair-loop evidence.' }],
              requireUserConfirmation: true,
            },
          })
          const reworked = await service.applyTransition({
            state: reworkRequested.state,
            requestedAt: '2026-07-17T01:32:00.000Z',
            request: {
              phaseId: workflow.routeToPhaseId,
              action: 'confirm',
              confirmationId: reworkRequested.state.pendingRoute!.routeId,
              stateVersion: reworkRequested.state.stateVersion,
              transitionId: `e2e-rework-confirm-${workflow.id}`,
            },
          })
          state = reworked.state
          expect(state.activePhaseId).toBe(workflow.routeToPhaseId)
          expect(state.workflowStatus).toBe('running')
          expect(state.pendingConfirmation).toBeNull()
        }
      }

      state = await finishWorkflow(service, state)
      expect(state.workflowStatus).toBe('completed')
      expect(state.activePhaseId).toBeNull()
      expect(state.finalReportRef).not.toBeNull()
    }
  }, 90_000)

  test('recovers every shipped validation phase from blocked state through a confirmed implementation route', async () => {
    await initializeIsolatedPackRegistry()
    const service = runtimeService()

    for (const workflow of SHIPPED_WORKFLOWS) {
      for (const [routeIndex, routeFromPhaseId] of workflow.routeFromPhaseIds.entries()) {
        const reachedValidation = await advanceToPhase(
          service,
          await createRealWorkflowState(workflow),
          routeFromPhaseId,
        )
        const preparedValidation = await recordCompletionPrerequisites(service, reachedValidation, 70 + routeIndex)
        const blocked = await service.submitPhaseCompletion({
          state: preparedValidation,
          requestedAt: `2026-07-20T02:${String(routeIndex).padStart(2, '0')}:00.000Z`,
          transitionId: `e2e-blocked-${workflow.id}-${routeFromPhaseId}`,
          submission: completionFor(preparedValidation, 'blocked'),
        })
        expect(blocked.state.runStatus).toBe('blocked')
        expect(blocked.state.pendingConfirmation).toBeNull()

        const requested = await service.requestWorkflowRoute({
          state: blocked.state,
          requestedAt: `2026-07-20T02:${String(routeIndex).padStart(2, '0')}:10.000Z`,
          transitionId: `e2e-blocked-route-${workflow.id}-${routeFromPhaseId}`,
          request: {
            phaseId: routeFromPhaseId,
            stateVersion: blocked.state.stateVersion,
            intent: 'jump_to_phase',
            targetPhaseId: workflow.routeToPhaseId,
            rationale: 'Verification found a repairable implementation defect; return through the controlled workflow route.',
            evidence: [{ ref: `e2e:blocked-route:${routeFromPhaseId}`, summary: 'Validation defect requires implementation recovery.' }],
            requireUserConfirmation: true,
          },
        })
        expect(requested.state.pendingRoute).toMatchObject({
          intent: 'jump_to_phase',
          targetPhaseId: workflow.routeToPhaseId,
          origin: 'blocked-recovery',
          status: 'pending',
        })
        expect(requested.state.pendingConfirmation).toBeNull()
        expect(requested.state.runStatus).toBe('waiting_for_user')

        const confirmed = await service.applyTransition({
          state: requested.state,
          requestedAt: `2026-07-20T02:${String(routeIndex).padStart(2, '0')}:20.000Z`,
          request: {
            phaseId: routeFromPhaseId,
            action: 'confirm',
            confirmationId: requested.state.pendingRoute!.routeId,
            stateVersion: requested.state.stateVersion,
            transitionId: `e2e-blocked-route-confirm-${workflow.id}-${routeFromPhaseId}`,
          },
        })
        expect(confirmed.state.activePhaseId).toBe(workflow.routeToPhaseId)
        expect(confirmed.state.runStatus).toBe('active')
        expect(confirmed.state.pendingConfirmation).toBeNull()
        expect(confirmed.state.pendingRoute).toBeNull()
        expect(confirmed.state.transitionHistory.at(-1)).toMatchObject({ action: 'route-recovery-confirmed' })
      }
    }
  }, 90_000)
})


test('ships Feature and Debug core-flow review and evidence contracts without changing the development pack', async () => {
  const adapter = new ZipPackAdapter()
  const load = async (packFile: string) => {
    const source = path.join(process.cwd(), 'src', 'server', 'packs', packFile)
    const archive = await adapter.read(new Uint8Array(await fs.readFile(source)))
    const entry = archive.entries.find((item) => item.path.startsWith('workflows/') && item.path.endsWith('.workflow.json'))
    if (!entry) throw new Error('Workflow entry is missing from ' + packFile)
    return await archive.readJson<any>(entry.path)
  }

  const feature = await load('feature-extension-workflow-v8.zip')
  const featureImplement = feature.phases.find((item: any) => item.id === 'feature-implement')
  const featureQuality = feature.phases.find((item: any) => item.id === 'feature-quality-preview')
  expect(feature.version).toBe('20')
  expect(featureImplement.instructions).toContain('### Core User-Flow Implementation and Review Contract (mandatory)')
  expect(featureImplement.instructions).toContain('actualEntryBoundaryCovered')
  expect(featureQuality.instructions).toContain('### Core-Flow Acceptance Evidence (mandatory)')
  expect(featureQuality.outputArtifacts).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'quality-report', filename: '.workflow/runs/<runId>/quality-report.md', required: true }),
    expect.objectContaining({ id: 'core-flow-evidence', filename: '.workflow/runs/<runId>/core-flow-evidence.json', required: true }),
  ]))
  expect(featureQuality.evidencePolicy.coreFlowEvidence).toEqual({
    type: 'core-flow-evidence-v1',
    outputArtifactId: 'core-flow-evidence',
    qualityReportArtifactId: 'quality-report',
    requireLogDisposition: false,
  })

  const debug = await load('debug-repair-workflow-v8.zip')
  const debugInvestigate = debug.phases.find((item: any) => item.id === 'debug-investigate')
  const debugFix = debug.phases.find((item: any) => item.id === 'debug-fix')
  const debugQuality = debug.phases.find((item: any) => item.id === 'debug-quality-preview')
  expect(debug.version).toBe('21')
  expect(debugInvestigate.instructions).toContain('### Diagnostic Evidence Discipline (mandatory)')
  expect(debugFix.instructions).toContain('### Core Repair Flow and Reviewer Contract (mandatory)')
  expect(debugFix.instructions).toContain('logEvidenceDisposition')
  expect(debugQuality.instructions).toContain('### Debug Core-Flow Evidence and Honest Runtime Status (mandatory)')
  expect(debugQuality.outputArtifacts).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'quality-report', filename: '.workflow/runs/<runId>/quality-report.md', required: true }),
    expect.objectContaining({ id: 'core-flow-evidence', filename: '.workflow/runs/<runId>/core-flow-evidence.json', required: true }),
  ]))
  expect(debugQuality.evidencePolicy.coreFlowEvidence).toEqual({
    type: 'core-flow-evidence-v1',
    outputArtifactId: 'core-flow-evidence',
    qualityReportArtifactId: 'quality-report',
    requireLogDisposition: true,
  })
})
