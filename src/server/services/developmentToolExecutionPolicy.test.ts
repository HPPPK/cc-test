import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createDevelopmentWorkerContract, developmentArtifactWriteAllowed, developmentToolCallViolation, developmentWorkerContractPrompt, developmentWorkerToolAllowed, type DevelopmentWorkerContract } from './developmentToolExecutionPolicy.js'
import type { WorkflowSessionState } from './workflowTypes.js'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))

function state(overrides: Record<string, unknown> = {}): WorkflowSessionState {
  return {
    mode: 'workflow', sessionId: 'session', activePhaseId: 'delegate-implement',
    runStatus: 'active', workflowStatus: 'running',
    templateIdentity: { id: 'efficient-constrained-dev-debug-workflow-v5' },
    ...overrides,
  } as WorkflowSessionState
}

function worker(overrides: Partial<DevelopmentWorkerContract> = {}): DevelopmentWorkerContract {
  return { sessionId: 'session', phaseId: 'delegate-implement', role: 'coder',
    workspaceRoot: '/project', writeScopes: ['src/**'], ...overrides }
}

describe('default development execution contract', () => {
  test('canonical bound Coder and Reviewer receive evidence-based dependency risk guidance without changing other workflows', () => {
    const current = state({ activeWorkflowRunId: 'current-run' })
    for (const role of ['coder', 'reviewer'] as const) {
      const assigned = worker({ runId: 'current-run', role })
      const prompt = developmentWorkerContractPrompt(assigned, current)
      expect(prompt).toContain('Dependency advisories:')
      expect(prompt).toContain('dependencyScope')
      expect(prompt).toContain('workflowReview.dependencyRisks')
      expect(prompt).toContain('limited development')
      expect(prompt).toContain('hard gates')
      expect(prompt).toContain('"disposition":"decision-required"')
      expect(prompt).toContain('"shipped":"unknown"')
      expect(prompt).toContain('partial remediation')
      expect(prompt).toContain('policyEvidence (accepted contract reference)')
      expect(prompt).toContain('not independently verified')
      expect(developmentWorkerContractPrompt(assigned, state({ activeWorkflowRunId: 'current-run', templateIdentity: { id: 'custom' } }))).not.toContain('Dependency advisories:')
      expect(developmentWorkerContractPrompt({ ...assigned, runId: 'old-run' }, current)).not.toContain('Dependency advisories:')
    }
  })
  test('uses a single exact JSON Coder receipt only for a current canonical worker binding', () => {
    const current = state({ activeWorkflowRunId: 'current-run' })
    const assigned = worker({ runId: 'current-run' })
    const prompt = developmentWorkerContractPrompt(assigned, current)
    expect(prompt).toContain('one final JSON receipt')
    expect(prompt).toContain('exact boolean key {"readyForReview":true}')
    expect(prompt).not.toContain('or a standalone readyForReview')
    for (const mismatch of [worker({ runId: 'old-run' }), worker({ runId: 'current-run', sessionId: 'other' }),
      worker({ runId: 'current-run', phaseId: 'old-phase' }), worker({ runId: 'current-run', role: 'qa' })]) {
      expect(developmentWorkerContractPrompt(mismatch, current)).not.toContain('Reviewer pass is not permission')
    }
    expect(developmentWorkerContractPrompt(assigned, state({ activeWorkflowRunId: 'current-run', templateIdentity: { id: 'custom' } }))).not.toContain('one final JSON receipt')
  })
  test('binds the actual workspace and snapshots Batch scopes only for the default development workflow', () => {
    const scopes = ['src/**']
    const contract = createDevelopmentWorkerContract(state(), 'coder', '/isolated/worktree', 'B1', scopes)
    scopes.push('outside/**')
    expect(contract).toMatchObject({ sessionId: 'session', phaseId: 'delegate-implement', role: 'coder', batchId: 'B1', workspaceRoot: '/isolated/worktree', writeScopes: ['src/**'] })
    expect(createDevelopmentWorkerContract(state({ templateIdentity: { id: 'skills-development' } }), 'coder', '/project')).toBeUndefined()
    expect(createDevelopmentWorkerContract(state(), undefined, '/project')).toBeUndefined()
  })
  test('leaves skills-development and ordinary chat on their own policies', () => {
    expect(developmentToolCallViolation('Agent', {}, state({ templateIdentity: { id: 'skills-development' } }))).toBeNull()
    expect(developmentToolCallViolation('Write', {}, undefined)).toBeNull()
  })

  test('requires runtime authority when an old subagent resumes without a worker contract', () => {
    expect(developmentToolCallViolation('Read', {}, state(), undefined, undefined, true)).toContain('WORKFLOW_WORKER_CONTRACT_REQUIRED')
    expect(developmentToolCallViolation('Read', {}, state())).toBeNull()
  })

  test.each(['paused', 'waiting_for_user', 'blocked', 'stopped', 'cancelled'])('blocks business tools when %s', runStatus => {
    expect(developmentToolCallViolation('Bash', { command: 'echo test' }, state({ runStatus }))).toContain('WORKFLOW_EXECUTION_SUSPENDED')
    expect(developmentToolCallViolation('request_workflow_route', {}, state({ runStatus }))).toBeNull()
  })

  test('keeps pending confirmation a hard wait even when runStatus is stale', () => {
    expect(developmentToolCallViolation('Read', {}, state({ pendingConfirmation: { id: 'pending' } }))).toContain('WORKFLOW_EXECUTION_SUSPENDED')
  })

  test('rejects a worker after its workflow or phase changes', () => {
    expect(developmentToolCallViolation('Read', {}, state({ activePhaseId: 'scenario-review' }), worker())).toContain('WORKFLOW_WORKER_STALE')
    expect(developmentToolCallViolation('Read', {}, state({ sessionId: 'other' }), worker())).toContain('WORKFLOW_WORKER_STALE')
    expect(developmentToolCallViolation('Read', {}, undefined, worker())).toContain('WORKFLOW_WORKER_STALE')
    expect(developmentToolCallViolation('Read', {}, state({ activeWorkflowRunId: 'new-run' }), worker({ runId: 'old-run' }))).toContain('WORKFLOW_WORKER_STALE')
  })

  test('rejects a stale Batch owner and accepts only the current running Agent Run', () => {
    const contract = worker({ batchId: 'B1', agentId: 'agent-current' })
    expect(developmentToolCallViolation('Read', {}, state(), contract)).toContain('WORKFLOW_WORKER_STALE')
    const snapshot = { batchId: 'B1', workflowRole: 'coder', status: 'running', agentRunId: 'agent-current' }
    const session = state({ runtimeContract: { phaseStates: { 'delegate-implement': { taskSnapshots: [snapshot] } } } })
    expect(developmentToolCallViolation('Read', {}, session, contract)).toBeNull()
    expect(developmentToolCallViolation('Read', {}, session, { ...contract, agentId: 'old-agent' })).toContain('WORKFLOW_WORKER_STALE')
  })

  test.each(['submit_phase_completion', 'request_workflow_route', 'Agent', 'AskUserQuestion'])('workers cannot take Leader authority through %s', tool => {
    expect(developmentToolCallViolation(tool, {}, state(), worker())).toContain('WORKFLOW_WORKER_AUTHORITY')
  })

  test('requires role, matching phase, nonempty instructions and explicit background scheduling', () => {
    expect(developmentToolCallViolation('Agent', { description: 'Task', prompt: 'Implement' }, state())).toContain('workflow_role')
    expect(developmentToolCallViolation('Agent', { description: 'Task', prompt: 'Implement', workflow_role: 'qa' }, state())).toContain('WORKFLOW_AGENT_ROLE')
    expect(developmentToolCallViolation('Agent', { description: ' ', prompt: 'Implement', workflow_role: 'coder' }, state())).toContain('description')
    expect(developmentToolCallViolation('Agent', { description: 'Task', prompt: ' ', workflow_role: 'coder' }, state())).toContain('prompt')
    expect(developmentToolCallViolation('Agent', { description: 'Task', prompt: 'Implement', workflow_role: 'coder' }, state())).toContain('run_in_background')
    expect(developmentToolCallViolation('Agent', { description: 'QA', prompt: 'Validate', workflow_role: 'qa' }, state({ activePhaseId: 'scenario-review' }))).toBeNull()
  })

  test('rejects discarded fields instead of silently accepting a misspelled parameter', () => {
    const input = { description: 'Task', prompt: 'Implement', workflow_role: 'coder', run_in_background: true }
    expect(developmentToolCallViolation('Agent', { ...input, workflow_roles: 'reviewer' }, state(), undefined, input)).toContain('workflow_roles')
    expect(developmentToolCallViolation('Agent', input, state(), undefined, input)).toBeNull()
    expect(developmentToolCallViolation('Agent', { ...input, cwd: '/other' }, state())).toContain('cwd')
    expect(developmentToolCallViolation('Agent', { ...input, workflow_parallel_plan: { tasks: [{ dependsOn: [] }] } }, state(), undefined,
      { ...input, workflow_parallel_plan: { tasks: [{}] } })).toContain('workflow_parallel_plan.tasks.0.dependsOn')
  })

  test('keeps unusable worker tools out of the model tool pool and forbids sandbox overrides', () => {
    for (const role of ['coder', 'reviewer', 'qa', 'debug'] as const) {
      expect(developmentWorkerToolAllowed('submit_phase_completion', role)).toBe(false)
      expect(developmentWorkerToolAllowed('Read', role)).toBe(true)
    }
    expect(developmentWorkerToolAllowed('Write', 'coder')).toBe(true)
    expect(developmentWorkerToolAllowed('Bash', 'reviewer')).toBe(false)
    expect(developmentWorkerToolAllowed('Edit', 'qa')).toBe(false)
    expect(developmentToolCallViolation('Bash', { dangerouslyDisableSandbox: true }, state())).toContain('WORKFLOW_SANDBOX_BYPASS')
    expect(developmentToolCallViolation('Bash', { dangerouslyDisableSandbox: false }, state())).toBeNull()
    for (const role of ['coder', 'reviewer', 'qa', 'debug'] as const) {
      expect(developmentWorkerContractPrompt(worker({ role }))).toContain('runtime enforced')
    }
  })

  test('injects the enforced Reviewer result contract directly into the child prompt', () => {
    const prompt = developmentWorkerContractPrompt(worker({ role: 'reviewer' }))
    expect(prompt).toContain('workflowReview')
    expect(prompt).toContain('readyForNextBatch')
    expect(prompt).toContain('requiredFixes')
    expect(prompt).toContain('needs-fix')
    expect(prompt).toContain('non-empty strings or finding objects')
    expect(prompt).toContain('Coder-provided commands, results and recorded evidence')
    expect(prompt).toContain('Do not treat unavailable shell access itself as a code defect')
    expect(prompt).toContain('Do not claim unperformed checks passed')
    expect(developmentWorkerContractPrompt(worker({ role: 'coder' }))).not.toContain('workflowReview')
  })

  test('keeps nested Skill execution out of default Stage 4 workers while preserving Leader and unrelated workflows', () => {
    for (const role of ['coder', 'reviewer', 'qa', 'debug'] as const) {
      const contract = worker({ role })
      expect(developmentWorkerToolAllowed('Skill', role, state())).toBe(false)
      expect(developmentToolCallViolation('Skill', { skill: 'spx-debug' }, state(), contract)).toContain('WORKFLOW_WORKER_SKILL_BOUNDARY')
      expect(developmentToolCallViolation('Read', { file_path: '/project/file.ts' }, state(), contract)).toBeNull()
      expect(developmentWorkerToolAllowed('Skill', role, state({ templateIdentity: { id: 'stradn-managed-development-workflow-v1' }, activePhaseId: 'stradn-delivery' }))).toBe(true)
    }
    expect(developmentToolCallViolation('Skill', { skill: 'spx-debug' }, state())).toBeNull()
    expect(developmentToolCallViolation('Skill', { skill: 'spx-debug' }, undefined)).toBeNull()
    expect(developmentToolCallViolation('Skill', { skill: 'spx-debug' }, state({ templateIdentity: { id: 'custom-workflow' } }))).toBeNull()
    const preview = state({ activePhaseId: 'local-preview' })
    expect(developmentToolCallViolation('Skill', { skill: 'spx-debug' }, preview, worker({ role: 'debug', phaseId: 'local-preview' }))).toBeNull()
    expect(developmentWorkerContractPrompt(worker({ role: 'debug' }))).toContain('independent workflow')
    expect(developmentWorkerContractPrompt(worker({ role: 'coder' }))).toContain('readyForReview')
  })

  test.each(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])('read-only QA cannot mutate with %s', tool => {
    expect(developmentToolCallViolation(tool, { file_path: '/project/src/a.ts' }, state({ activePhaseId: 'scenario-review' }), worker({ phaseId: 'scenario-review', role: 'qa' }))).toContain('WORKFLOW_WORKER_READ_ONLY')
  })

  test('checks real file boundaries, including relative paths, directory globs and symlinks', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'workflow-write-scope-'))
    roots.push(root)
    mkdirSync(path.join(root, 'src'))
    mkdirSync(path.join(root, 'outside'))
    symlinkSync(path.join(root, 'outside'), path.join(root, 'src', 'escape'), 'junction')
    mkdirSync(path.join(root, '.workflow'))
    symlinkSync(path.join(root, 'outside'), path.join(root, '.workflow', 'escape'), 'junction')
    expect(developmentArtifactWriteAllowed(root, '.workflow/evidence.md')).toBe(true)
    expect(developmentArtifactWriteAllowed(root, '.workflow/escape/a.ts')).toBe(false)
    const contract = worker({ workspaceRoot: root })
    expect(developmentToolCallViolation('Write', { file_path: 'src/a.ts' }, state(), contract)).toBeNull()
    expect(developmentToolCallViolation('Edit', { file_path: path.join(root, 'src/a.ts') }, state(), contract)).toBeNull()
    for (const file_path of ['src/../outside/a.ts', 'outside/a.ts', 'src/escape/a.ts', '../escape.ts']) {
      expect(developmentToolCallViolation('Write', { file_path }, state(), contract)).toContain('WORKFLOW_WRITE_SCOPE')
    }
    expect(developmentToolCallViolation('Write', { file_path: 'src/ab.ts' }, state(), { ...contract, writeScopes: ['src/a.ts'] })).toContain('WORKFLOW_WRITE_SCOPE')
    expect(developmentToolCallViolation('Write', { file_path: 'src/a.ts' }, state(), { ...contract, writeScopes: [] })).toContain('WORKFLOW_WRITE_SCOPE')
    mkdirSync(path.join(root, 'src', '[id]'))
    expect(developmentToolCallViolation('Write', { file_path: 'src/[id]/page.tsx' }, state(), { ...contract, writeScopes: ['src/[id]/page.tsx'] })).toBeNull()
    expect(developmentToolCallViolation('Write', { file_path: 'src/[id]/page.tsx' }, state(), { ...contract, writeScopes: ['src/[id]'] })).toBeNull()
    expect(developmentToolCallViolation('Write', { file_path: 'src/new-module/a.ts' }, state(), { ...contract, writeScopes: ['src/new-module'] })).toBeNull()
    expect(developmentToolCallViolation('Write', { file_path: 'outside/a.ts' }, state(), { ...contract, writeScopes: ['!src/**'] })).toContain('WORKFLOW_WRITE_SCOPE')
  })
})
