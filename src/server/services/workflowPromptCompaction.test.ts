import { describe, expect, test } from 'bun:test'
import { WorkflowRuntimeService } from './workflowRuntimeService.js'
import type { WorkflowSessionState, WorkflowTemplate } from './workflowTypes.js'

function fixture(id = 'efficient-constrained-dev-debug-workflow-v5') {
  const phase = {
    id: 'delivery-plan', label: 'Plan', instructions: 'Unique current phase instruction.',
    completionCriteria: ['Unique completion requirement.'], transitionAuthority: 'user-confirmation' as const,
    skillDeclarations: [], requiredArtifacts: [{ id: 'intake', kind: 'markdown' as const, description: 'Unique intake requirement.', required: true }],
  }
  const template = { schemaVersion: 1, id, source: 'builtin', version: '1', displayName: 'Fixture', description: '', phases: [phase] } as WorkflowTemplate
  const state = {
    schemaVersion: 1, sessionId: 'compact-prompt-fixture', mode: 'workflow',
    template: { id, source: 'builtin', version: '1', snapshotId: 'fixture', sourceState: 'current' },
    templateIdentity: { id, source: 'builtin', version: '1' }, templateSnapshot: template,
    sourceTemplateStatus: 'current',
    status: 'running', workflowStatus: 'running', runStatus: 'active', activePhaseId: phase.id,
    phases: [{ id: phase.id, index: 0, status: 'running', artifactPointers: [] }],
    phaseRuns: [], transitionHistory: [], artifactIndex: [], finalReportRef: null,
    stateVersion: 7, revision: 7, createdAt: '2026-11-16T00:00:00Z', updatedAt: '2026-11-16T00:00:00Z',
    runtimeContract: { schemaVersion: 1, migrationStatus: 'current', audit: [], phaseStates: {
      [phase.id]: { phaseId: phase.id, workStatus: 'in-progress', eligibility: 'ineligible', blockerReasons: [], issues: [], artifactRequirements: [], checks: [], evaluatedAt: '',
        taskSnapshots: [{ taskId: 'authoritative-task', status: 'succeeded', sessionId: 'compact-prompt-fixture', phaseId: phase.id, stateVersion: 7, updatedAt: '' }],
      },
    } },
  } as WorkflowSessionState
  const service = new WorkflowRuntimeService(async () => [], async () => template)
  return { state, service }
}

describe('canonical workflow prompt composition', () => {
  test('retains distinct edited phase criteria alongside runtime criteria in the canonical template', async () => {
    const { state, service } = fixture()
    state.templateSnapshot!.phases[0]!.completionCriteria = ['shared-criterion', 'unique-edited-phase-criterion']
    state.templateSnapshot!.phases[0]!.runtimeContract = { completionRequires: ['shared-criterion', 'unique-runtime-criterion'] }
    const { content } = await service.assemblePrompt({ state, userMessage: 'Continue.' })
    for (const criterion of ['shared-criterion', 'unique-edited-phase-criterion', 'unique-runtime-criterion']) {
      expect(content.split(criterion)).toHaveLength(2)
    }
  })

  test('preserves unique phase handoff rules without injecting later-stage instructions', async () => {
    const { state, service } = fixture()
    const template = state.templateSnapshot!
    template.phases[0]!.phasePrompt = {
      objective: 'Unique handoff objective.', handoffInput: ['Unique accepted input.'],
      executionRules: ['Unique current-stage rule.'], outputArtifact: { name: 'current.md', sections: ['Unique output section.'] },
      completionRules: ['Unique stop rule.'],
    }
    template.phases.push({ ...template.phases[0]!, id: 'future-phase', instructions: 'FUTURE_PHASE_PRIVATE_SENTINEL' })
    const { content } = await service.assemblePrompt({ state, userMessage: 'Continue.' })
    for (const fact of ['Unique handoff objective.', 'Unique accepted input.', 'Unique current-stage rule.', 'Unique output section.', 'Unique stop rule.']) {
      expect(content).toContain(fact)
    }
    expect(content).not.toContain('FUTURE_PHASE_PRIVATE_SENTINEL')
  })

  test('places current authority first and emits shared question and intake rules only once', async () => {
    const { state, service } = fixture()
    const { content } = await service.assemblePrompt({ state, userMessage: 'Latest user request.' })
    expect(content.indexOf('Authoritative current task receipts')).toBeLessThan(content.indexOf('Workflow runtime contract'))
    expect(content).not.toContain('Workflow-generated question policy')
    expect(content.match(/Unique intake requirement\./g)).toHaveLength(1)
    expect(content).toContain('Unique current phase instruction.')
    expect(content).toContain('Unique completion requirement.')
    expect(content.match(/Unique completion requirement\./g)).toHaveLength(1)
    expect(content).toContain('on-demand pointers')
    expect(content).toContain('Preserve permission, approval and completion gates')
    expect(content).toContain('Plain assistant text is not an approval gate')
    expect(content).toContain('stop that turn immediately')
    expect(content).toContain('Forbidden actions:')
    expect(content).toContain('dependency installs')
    expect(content.endsWith('Latest user request.')).toBe(true)
  })

  test.each(['custom-workflow', 'efficient-constrained-dev-debug-workflow-v5-copy', 'feature-extension-workflow-v8', 'debug-repair-workflow-v8'])('preserves the existing assembly for %s', async id => {
    const { state, service } = fixture(id)
    const { content } = await service.assemblePrompt({ state, userMessage: 'Latest user request.' })
    expect(content).toContain('Workflow-generated question policy')
    expect(content).toContain('Required artifacts:')
    expect(content).toContain('Unique intake requirement.')
  })
})
