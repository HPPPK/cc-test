import { createScopeAmendmentFixture } from './__fixtures__/workflowScopeAmendment.js'
import { afterEach, beforeEach, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { prepareScopeAmendment, applyScopeAmendment, validateScopeAmendmentFile, migrateWorkflowScopeApproval } from './workflowScopeAmendment.js'
import type { WorkflowSessionState } from './workflowTypes.js'
import { WorkflowRuntimeService } from './workflowRuntimeService.js'

let root = ''
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'workflow-scope-amend-')) })
afterEach(async () => {
  if (root.startsWith(path.join(os.tmpdir(), 'workflow-scope-amend-'))) await fs.rm(root, { recursive: true, force: true })
})

async function fixture() { return createScopeAmendmentFixture(root) }

test('approves an exact file and updates one JSON block while preserving accepted upstream receipts', async () => {
  const { state, content, file } = await fixture()
  const before = structuredClone(state.runtimeContract!.phaseStates['delegate-implement']!.taskSnapshots)
  const approval = prepareScopeAmendment(state, { batchId: 'B3', addWriteScopes: ['config/settings.py'] })
  applyScopeAmendment(state, approval, '2026-11-17T00:10:00Z')
  const tasks = state.runtimeContract!.phaseStates['delegate-implement']!.taskSnapshots
  for (let i = 0; i < 4; i++) expect(tasks[i]).toMatchObject(before[i]!)
  expect(tasks[4]).toMatchObject({ status: 'pending', writeScopes: ['roster/', 'config/settings.py'] })
  expect(tasks.slice(4).every(task => !task.agentRunId)).toBe(true)
  expect(new Set(tasks.map(task => task.developmentPlanSignature)).size).toBe(1)
  expect(tasks[0]!.developmentPlanSignature).not.toBe(approval.basePlanSignature)
  const next = state.workflowRuns![0]!.artifacts[0]!.content!
  expect(next).toContain('Keep this unique explanation.')
  expect(next).toContain('Keep the trailing explanation.')
  expect(next.match(/```json/g)).toHaveLength(1)
  expect(await fs.readFile(file, 'utf8')).toBe(content) // Runtime calculation has no disk side effects.
})

test('rejects unsafe, absent, protected and wildcard paths; does not widen custom templates', async () => {
  const { state } = await fixture()
  for (const file of ['../settings.py', '/settings.py', 'config/*.py', '.claude/settings.json', 'config/no-file.py', 'C:/settings.py']) {
    expect(() => prepareScopeAmendment(state, { batchId: 'B3', addWriteScopes: [file] })).toThrow()
  }
  state.templateIdentity.id = 'custom-workflow'
  expect(() => prepareScopeAmendment(state, { batchId: 'B3', addWriteScopes: ['config/settings.py'] })).toThrow()
})

test('rejects changed plans, stale run bindings, ambiguous JSON and any running worker', async () => {
  const { state, file, content } = await fixture()
  const approval = prepareScopeAmendment(state, { batchId: 'B3', addWriteScopes: ['config/settings.py'] })
  state.activeWorkflowRunId = 'different-run'
  expect(() => applyScopeAmendment(state, approval, 'now')).toThrow()
  state.activeWorkflowRunId = 'run-1'
  await fs.writeFile(file, content + '\nChanged after approval\n')
  expect(() => validateScopeAmendmentFile(state, approval)).toThrow()
  await fs.writeFile(file, content)
  state.runtimeContract!.phaseStates['delegate-implement']!.taskSnapshots[0]!.status = 'running'
  expect(() => prepareScopeAmendment(state, { batchId: 'B3', addWriteScopes: ['config/settings.py'] })).toThrow('Wait')
  state.runtimeContract!.phaseStates['delegate-implement']!.taskSnapshots[0]!.status = 'succeeded'
  await fs.writeFile(file, content + content)
  expect(() => prepareScopeAmendment(state, { batchId: 'B3', addWriteScopes: ['config/settings.py'] })).toThrow()
})

test('forward migration preserves legacy routes and rejects incomplete newer approvals without widening scope', async () => {
  const { state } = await fixture()
  state.pendingRoute = { routeId: 'legacy', phaseId: 'delegate-implement', fromPhaseId: 'delegate-implement', targetPhaseId: 'delegate-implement', intent: 'rework_current_phase', status: 'pending', rationale: 'Legacy rework', evidence: [], createdAt: '2026-11-17T00:00:00Z', requiresConfirmation: true, approvedTargetPhaseId: 'delegate-implement' }
  expect(migrateWorkflowScopeApproval(state)).toBe(state)
  state.pendingRoute!.scopeAmendment = { schemaVersion: 99, batchId: 'B3', addWriteScopes: ['config/settings.py'] } as never
  const migrated = migrateWorkflowScopeApproval(state)
  expect(migrated.pendingRoute?.status).toBe('rejected')
  expect(migrated.pendingRoute?.scopeAmendment).toBeUndefined()
  expect(migrated.runStatus).toBe('blocked')
  expect(migrated.runtimeContract!.phaseStates['delegate-implement']!.taskSnapshots).toEqual(state.runtimeContract!.phaseStates['delegate-implement']!.taskSnapshots)
})

test.each(['confirm', 'reject'] as const)('one formal runtime scope %s does not advance stages or mutate files before storage', async action => {
  const { state, file, content } = await fixture()
  const service = new WorkflowRuntimeService(async () => [], async () => state.templateSnapshot!)
  const requested = await service.requestWorkflowRoute({ state, requestedAt: '2026-11-17T00:01:00Z', transitionId: 'scope-request',
    request: { phaseId: 'delegate-implement', stateVersion: state.stateVersion, intent: 'rework_current_phase', rationale: 'Register roster app in settings.', evidence: [{ ref: 'B3-blocker' }],
      scopeAmendment: { batchId: 'B3', addWriteScopes: ['config/settings.py'] } },
  })
  expect(requested.state.pendingRoute?.scopeAmendment).toMatchObject({ batchId: 'B3', addWriteScopes: ['config/settings.py'], runId: 'run-1' })
  expect(requested.state.pendingConfirmation).toBeFalsy()
  expect(requested.state.runtimeContract!.phaseStates['delegate-implement']!.taskSnapshots).toEqual(state.runtimeContract!.phaseStates['delegate-implement']!.taskSnapshots)
  const result = await service.applyTransition({ state: requested.state, requestedAt: '2026-11-17T00:02:00Z', request: {
    phaseId: 'delegate-implement', action, confirmationId: requested.state.pendingRoute!.routeId, transitionId: `scope-${action}`, expectedStateVersion: requested.state.stateVersion,
  } })
  expect(result.state.activePhaseId).toBe('delegate-implement')
  const task = result.state.runtimeContract!.phaseStates['delegate-implement']!.taskSnapshots.find(item => item.batchId === 'B3' && item.workflowRole === 'coder')!
  expect(task.writeScopes).toEqual(action === 'confirm' ? ['roster/', 'config/settings.py'] : ['roster/'])
  expect(await fs.readFile(file, 'utf8')).toBe(content)
})
