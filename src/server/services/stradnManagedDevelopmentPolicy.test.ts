import { describe, expect, it } from 'bun:test'
import {
  createDevelopmentWorkerContract,
  developmentToolCallViolation,
} from './developmentToolExecutionPolicy.js'
import { isManagedWorkflowAgentImplementationPhase } from './workflowAgentTaskStateService.js'
import type { WorkflowSessionState } from './workflowTypes.js'

const templateId = 'stradn-managed-development-workflow-v1'

function state(overrides: Partial<WorkflowSessionState> = {}): WorkflowSessionState {
  return {
    mode: 'workflow',
    sessionId: 'stradn-session',
    activeWorkflowRunId: 'stradn-run',
    activePhaseId: 'stradn-delivery',
    workflowStatus: 'running',
    runStatus: 'running',
    templateIdentity: { id: templateId, version: '1', source: 'pack' },
    template: { id: templateId, version: '1', source: 'pack' },
    ...overrides,
  } as WorkflowSessionState
}

describe('stradn managed development runtime policy', () => {
  it('uses the existing host scheduler and worker boundary as the single source of truth', () => {
    const workflow = state()
    expect(isManagedWorkflowAgentImplementationPhase(workflow)).toBe(true)

    const contract = createDevelopmentWorkerContract(workflow, 'coder', '/project', 'B1', ['src/**'])
    expect(contract).toMatchObject({
      sessionId: 'stradn-session',
      phaseId: 'stradn-delivery',
      runId: 'stradn-run',
      batchId: 'B1',
      role: 'coder',
      writeScopes: ['src/**'],
    })

    expect(developmentToolCallViolation('Agent', {
      description: 'Implement B1',
      prompt: 'Implement the approved batch',
      workflow_role: 'coder',
    }, workflow)).toContain('run_in_background')
    expect(developmentToolCallViolation('Agent', {
      description: 'Validate the changed user path',
      prompt: 'Run independent QA and return evidence',
      workflow_role: 'qa',
    }, workflow)).toBeNull()
  })
})
