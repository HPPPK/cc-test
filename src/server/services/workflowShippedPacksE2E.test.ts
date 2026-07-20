import { afterEach, describe, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { PackRegistryService, resetPackRegistryForTests } from './packRegistryService.js'
import { WorkflowRuntimeService } from './workflowRuntimeService.js'
import { WorkflowSessionCreateService } from './workflowSessionCreateService.js'
import { WorkflowSessionStateService } from './workflowSessionStateService.js'
import { resetWorkflowTemplateRegistryForTests } from './workflowTemplateRegistryService.js'
import { getWorkflowPhaseDisallowedTools } from './workflowToolPolicy.js'
import type { CompletionSubmission, WorkflowSessionState } from './workflowTypes.js'

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

async function completeCurrentPhase(
  service: WorkflowRuntimeService,
  state: WorkflowSessionState,
  sequence: number,
): Promise<WorkflowSessionState> {
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
      for (const tool of ['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'PowerShell', 'Agent']) {
        expect(stageOneDenied, `${workflow.id} stage one denies ${tool}`).toContain(tool)
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

      const paused = await service.requestWorkflowRoute({
        state,
        requestedAt: '2026-07-17T00:01:00.000Z',
        transitionId: `e2e-pause-${workflow.id}`,
        request: {
          phaseId: state.activePhaseId!,
          stateVersion: state.stateVersion,
          intent: 'pause',
          rationale: 'Exercise the user-visible pause control before continuing.',
          evidence: [],
          requireUserConfirmation: false,
        },
      })
      expect(paused.state.runStatus).toBe('paused')
      const resumed = await service.requestWorkflowRoute({
        state: paused.state,
        requestedAt: '2026-07-17T00:02:00.000Z',
        transitionId: `e2e-resume-${workflow.id}`,
        request: {
          phaseId: paused.state.activePhaseId!,
          stateVersion: paused.state.stateVersion,
          intent: 'resume',
          rationale: 'Resume the active workflow without requiring a typed continue message.',
          evidence: [],
          requireUserConfirmation: false,
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
            stateVersion: requestedRoute.state.stateVersion,
            transitionId: `e2e-route-confirm-${workflow.id}-${routeFromPhaseId}`,
          },
        })
        state = confirmedRoute.state
        expect(state.activePhaseId).toBe(workflow.routeToPhaseId)
        expect(state.pendingRoute).toBeNull()

        if (routeIndex === 0) {
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
        const blocked = await service.submitPhaseCompletion({
          state: reachedValidation,
          requestedAt: `2026-07-20T02:${String(routeIndex).padStart(2, '0')}:00.000Z`,
          transitionId: `e2e-blocked-${workflow.id}-${routeFromPhaseId}`,
          submission: completionFor(reachedValidation, 'blocked'),
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
