import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { WorkflowSessionState } from '../workflowTypes.js'

export async function createScopeAmendmentFixture(root: string, sessionId = 'scope-fixture') {
  await fs.mkdir(path.join(root, 'config'), { recursive: true })
  await fs.writeFile(path.join(root, 'config/settings.py'), 'INSTALLED_APPS = []\n')
  const plan = [
    { id: 'B1', depends_on: [], write_scopes: ['config/'], resource_claims: [], execution_mode: 'write' },
    { id: 'B2', depends_on: ['B1'], write_scopes: ['accounts/'], resource_claims: [], execution_mode: 'write' },
    { id: 'B3', depends_on: ['B2'], write_scopes: ['roster/'], resource_claims: [], execution_mode: 'write' },
    { id: 'B4', depends_on: ['B3'], write_scopes: ['tests/'], resource_claims: [], execution_mode: 'write' },
  ]
  const content = '# Accepted plan\nKeep this unique explanation.\n```json\n' + JSON.stringify({ tasks: plan }, null, 2) + '\n```\nKeep the trailing explanation.\n'
  const file = path.join(root, '.workflow/runs/run-1/delivery-plan.md')
  await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, content)
  const tasks = plan.flatMap((batch, i) => (['coder', 'reviewer'] as const).map(role => ({
    taskId: `development-batch:${batch.id}:${role}`, sessionId: sessionId, runId: 'run-1', phaseId: 'delegate-implement',
    batchId: batch.id, workflowRole: role, stateVersion: 1, updatedAt: '2026-11-17T00:00:00Z',
    status: i < 2 ? 'succeeded' : i === 2 ? 'blocked' : 'waiting_dependency', agentRunId: `${batch.id}-${role}`,
    ...(i < 2 && role === 'reviewer' ? { reviewStatus: 'pass', requiredFixes: [], readyForNextBatch: true } : {}),
    dependsOn: role === 'reviewer' ? [`${batch.id}::coder`] : batch.depends_on.map(id => `${id}::reviewer`),
    writeScopes: role === 'coder' ? batch.write_scopes : [], resourceClaims: [], executionMode: role === 'coder' ? 'write' : 'read',
  })))
  const state = { mode: 'workflow', sessionId: sessionId, templateIdentity: { id: 'efficient-constrained-dev-debug-workflow-v5' },
    activePhaseId: 'delegate-implement', activeWorkflowRunId: 'run-1', workspaceRoot: root, runStatus: 'blocked', stateVersion: 1,
    workflowRuns: [{ id: 'run-1', workspaceRoot: root, artifacts: [{ id: 'delivery-plan', filename: 'delivery-plan.md', content }] }],
    phases: [{ id: 'delegate-implement', status: 'running', startedAt: '2026-11-16T00:00:00Z' }],
    runtimeContract: { phaseStates: { 'delegate-implement': { taskSnapshots: tasks } } },
  } as unknown as WorkflowSessionState
  state.schemaVersion = 1
  state.templateIdentity.version = '32'; state.templateIdentity.source = 'user'
  state.status = 'running'; state.workflowStatus = 'running'; state.blockedReason = 'B3 needs a scoped integration change'
  state.revision = 1; state.transitionHistory = []; state.phaseRuns = []; state.artifactIndex = []; state.createdAt = '2026-11-17T00:00:00Z'; state.updatedAt = state.createdAt
  state.templateSnapshot = { schemaVersion: 1, id: 'efficient-constrained-dev-debug-workflow-v5', source: 'user', version: '32', displayName: 'Development', description: '',
    phases: [{ id: 'delegate-implement', label: 'Implement', instructions: 'Implement current batches', skillDeclarations: [], requiredArtifacts: [], completionCriteria: [], transitionAuthority: 'user-confirmation' }] }
  state.template = state.templateSnapshot
  state.phases[0]!.index = 0; state.phases[0]!.artifactPointers = []; state.phases[0]!.blockedReason = state.blockedReason
  state.runtimeContract!.schemaVersion = 1; state.runtimeContract!.migrationStatus = 'current'; state.runtimeContract!.audit = []
  Object.assign(state.workflowRuns![0]!, { templateId: state.templateIdentity.id, status: 'active', currentPhaseId: 'delegate-implement', history: [], createdAt: state.createdAt, updatedAt: state.updatedAt })
  Object.assign(state.runtimeContract!.phaseStates['delegate-implement']!, { phaseId: 'delegate-implement', workStatus: 'in-progress', eligibility: 'ineligible', blockerReasons: [], issues: [], artifactRequirements: [], checks: [], evaluatedAt: state.createdAt })
  return { state, content, file }
}
