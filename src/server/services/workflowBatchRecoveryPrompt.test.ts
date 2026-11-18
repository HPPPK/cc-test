import { expect, test } from 'bun:test'
import { WorkflowRuntimeService } from './workflowRuntimeService.js'
import type { WorkflowSessionState, WorkflowTaskSnapshot, WorkflowTemplate } from './workflowTypes.js'

const canonical = 'efficient-constrained-dev-debug-workflow-v5'
const phaseId = 'delegate-implement'
function receipt(role: 'coder' | 'reviewer', status: WorkflowTaskSnapshot['status'], extra: Partial<WorkflowTaskSnapshot> = {}): WorkflowTaskSnapshot {
  return { taskId: `development-batch:B1:${role}`, batchId: 'B1', workflowRole: role, status,
    sessionId: 'recovery-prompt', phaseId, stateVersion: 4, updatedAt: '', ...extra }
}
async function prompt(tasks: WorkflowTaskSnapshot[], id = canonical, runStatus: WorkflowSessionState['runStatus'] = 'active') {
  const phase = { id: phaseId, label: 'Implement', instructions: 'Preserve this unique scoped phase requirement.',
    completionCriteria: ['Preserve the acceptance check.'], transitionAuthority: 'user-confirmation' as const,
    requiredArtifacts: [], skillDeclarations: [] }
  const template = { schemaVersion: 1, id, source: 'builtin', version: 'fixture', displayName: 'Fixture', description: '', phases: [phase] } as WorkflowTemplate
  const state = { schemaVersion: 1, sessionId: 'recovery-prompt', mode: 'workflow',
    template: { id, source: 'builtin', version: 'fixture', snapshotId: 'fixture', sourceState: 'current' },
    templateIdentity: { id, source: 'builtin', version: 'fixture' }, templateSnapshot: template,
    sourceTemplateStatus: 'current',
    status: 'running', workflowStatus: 'running', runStatus, activePhaseId: phaseId,
    phases: [{ id: phaseId, index: 0, status: 'running', artifactPointers: [] }],
    phaseRuns: [], transitionHistory: [], artifactIndex: [], finalReportRef: null,
    stateVersion: 4, revision: 4, createdAt: '', updatedAt: '',
    runtimeContract: { schemaVersion: 1, migrationStatus: 'current', audit: [], phaseStates: { [phaseId]: {
      phaseId, workStatus: 'in-progress', eligibility: 'ineligible', blockerReasons: [], issues: [], checks: [], artifactRequirements: [], evaluatedAt: '', taskSnapshots: tasks,
    } } },
  } as WorkflowSessionState
  const service = new WorkflowRuntimeService(async () => [], async () => template)
  return (await service.assemblePrompt({ state, userMessage: 'Continue the current Batch using the accepted permissions.' })).content
}

test('guides an unfinished Coder to finish authorized work before requesting same-Batch review', async () => {
  const content = await prompt([receipt('coder', 'blocked'), receipt('reviewer', 'waiting_dependency')])
  expect(content.includes('B1: Coder unfinished')).toBe(true)
  expect(content.includes('complete remaining authorized work/checks before Reviewer')).toBe(true)
  expect(content.includes('Reviewer pass is not permission')).toBe(true)
  expect(content.includes('Preserve this unique scoped phase requirement.')).toBe(true)
  expect(content.includes('Preserve the acceptance check.')).toBe(true)
})

test('routes actual Reviewer needs-fix back to scoped Coder repair rather than unfinished-work discovery', async () => {
  const content = await prompt([receipt('coder', 'succeeded'), receipt('reviewer', 'needs_fix', { reviewStatus: 'needs-fix', requiredFixes: ['Fix the observed behavior'] })])
  expect(content.includes('B1: Reviewer needs-fix')).toBe(true)
  expect(content.includes('same Batch Coder repair')).toBe(true)
  expect(content.includes('B1: Coder unfinished')).toBe(false)
})

test.each(['warning', 'unknown', 'hardgate'] as const)('typed dependency %s takes a bounded decision path instead of repeating unchanged Coder work', async kind => {
  const finding = { kind: 'dependency-risk', issue: 'High audit count, production audit zero and build passed', severity: 'high',
    dependencyScope: 'development-only', shipped: false, reachable: kind === 'unknown' ? 'unknown' : false,
    untrustedBuildInputs: false, isolatedDevelopment: true, hardGate: kind === 'hardgate' ? 'zero-vulnerabilities' : 'none',
    policyEvidence: 'Accepted development work order has no zero-advisory gate.',
    evidence: ['Production audit zero; build passed; tools are unshipped and consume trusted isolated local inputs.'],
    disposition: kind === 'warning' ? 'warning' : kind === 'unknown' ? 'decision-required' : 'blocking' }
  const content = await prompt([receipt('coder', 'succeeded'), receipt('reviewer', 'needs_fix', { reviewStatus: 'needs-fix', requiredFixes: [JSON.stringify(finding)] })])
  expect(content).toContain('B1: dependency risk')
  expect(content).not.toContain('send the recorded required fixes/checks to same Batch Coder repair')
  expect(content).toContain('assess a scoped alternative; pause; or stop')
  expect(content).toContain('do not silently choose')
  expect(content.includes('Options: continue limited development')).toBe(kind === 'warning')
})

test('a real code defect accompanying dependency metadata retains scoped Coder repair', async () => {
  const content = await prompt([receipt('coder', 'succeeded'), receipt('reviewer', 'needs_fix', { reviewStatus: 'needs-fix',
    requiredFixes: ['Fix the observed code bug', JSON.stringify({ kind: 'dependency-risk', issue: 'Exposure unknown' })] })])
  expect(content).toContain('same Batch Coder repair')
})

test('keeps a genuinely running Coder on its existing attempt instead of launching a replacement', async () => {
  const content = await prompt([receipt('coder', 'running', { agentRunId: 'current-coder-agent' }), receipt('reviewer', 'waiting_dependency')])
  expect(content.includes('B1: Coder running')).toBe(true)
  expect(content.includes('current-coder-agent')).toBe(true)
  expect(content.includes('wait for the current attempt')).toBe(true)
  expect(content.includes('B1: Coder unfinished')).toBe(false)
})

test('resolves a pending worker permission on the same attempt instead of waiting for completion', async () => {
  const content = await prompt([receipt('coder', 'waiting_user', { agentRunId: 'waiting-coder-agent' })])
  expect(content.includes('B1: Coder waiting for user')).toBe(true)
  expect(content.includes('resolve the existing permission/question')).toBe(true)
  expect(content.includes('B1: Coder running')).toBe(false)
})

test.each(['cancelled', 'stale', 'interrupted'] as const)('keeps %s work behind current recovery authority rather than treating it as unfinished authorization', async status => {
  const content = await prompt([receipt('coder', status)])
  expect(content.includes(`B1: Coder ${status}`)).toBe(true)
  expect(content.includes('do not auto-restart')).toBe(true)
  expect(content.includes('B1: Coder unfinished')).toBe(false)
})

test('does not derive Batch recovery actions from another phase, session or run receipt', async () => {
  for (const extra of [{ phaseId: 'scenario-review' }, { sessionId: 'another-session' }, { runId: 'previous-run' }]) {
    const content = await prompt([receipt('coder', 'blocked', extra)])
    expect(content.includes('B1: Coder unfinished')).toBe(false)
  }
})

test('dispatches Reviewer only after the current Coder has an accepted successful receipt', async () => {
  const content = await prompt([receipt('coder', 'succeeded'), receipt('reviewer', 'waiting_dependency')])
  expect(content.includes('B1: Coder ready; dispatch Reviewer')).toBe(true)
  expect(content.includes('B1: Coder unfinished')).toBe(false)
})

test('preserves a real runtime wait and existing approval boundaries', async () => {
  const content = await prompt([receipt('coder', 'blocked')], canonical, 'waiting_for_user')
  expect(content.includes('Execution remains waiting_for_user')).toBe(true)
  expect(content.includes('resolve the existing pending decision')).toBe(true)
  expect(content.includes('Do not request approvals already recorded')).toBe(true)
})

test('keeps recovery guidance bounded without copying worker reports or changing other templates', async () => {
  const tasks = Array.from({ length: 20 }, (_, index) => receipt('coder', 'blocked', {
    batchId: `B${index + 1}`, taskId: `development-batch:B${index + 1}:coder`, reason: 'PRIVATE_REPORT_BODY'.repeat(1000),
  }))
  const content = await prompt(tasks)
  const guidance = content.split('Same-Batch next actions')[1]?.split('Context lookup:')[0] ?? ''
  expect(guidance.length).toBeGreaterThan(0)
  expect(guidance.length).toBeLessThan(2600)
  expect(content.includes('PRIVATE_REPORT_BODY')).toBe(false)
  for (const id of [canonical + '-copy', 'feature-extension-workflow-v8', 'debug-repair-workflow-v8']) {
    expect((await prompt(tasks, id)).includes('Same-Batch next actions')).toBe(false)
  }
})
