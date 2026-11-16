import { expect, test } from 'bun:test'
import { getRequiredWorkflowQuestionAnswerViolation, usesDevelopmentQuestionBatches } from './workflowDevelopmentQuestionPolicy.js'
import type { WorkflowSessionState } from './workflowTypes.js'

function oldState(): WorkflowSessionState {
  return {
    activePhaseId: 'scope-plan', template: { id: 'efficient-constrained-dev-debug-workflow-v5', version: '25' },
    runtimeContract: { phaseStates: { 'scope-plan': { issues: [
      { source: 'ask-user-question', status: 'open', questionRequestId: 'batch', questionId: 'platform', question: 'Platform?', blocksCompletion: true },
      { source: 'ask-user-question', status: 'open', questionRequestId: 'batch', questionId: 'style', question: 'Style?', blocksCompletion: false },
      { source: 'ask-user-question', status: 'open', questionRequestId: 'other-request', questionId: 'other', blocksCompletion: true },
    ] } } },
  } as unknown as WorkflowSessionState
}

test('old snapshots use batches without a persistence format change; other templates do not', () => {
  expect(usesDevelopmentQuestionBatches(oldState())).toBe(true)
  expect(usesDevelopmentQuestionBatches(null)).toBe(false)
  expect(usesDevelopmentQuestionBatches({ templateIdentity: { id: 'skills-development' } } as WorkflowSessionState)).toBe(false)
})
test('required answers use server-owned issues and ignore optional or unrelated requests', () => {
  expect(getRequiredWorkflowQuestionAnswerViolation(oldState(), 'batch', { style: 'Simple' })).toContain('Platform?')
  expect(getRequiredWorkflowQuestionAnswerViolation(oldState(), 'batch', { platform: '   ' })).toContain('Platform?')
  expect(getRequiredWorkflowQuestionAnswerViolation(oldState(), 'batch', { 'Platform?': 'Mac' })).toBeNull()
  expect(getRequiredWorkflowQuestionAnswerViolation(oldState(), 'batch', { platform: 'Mac' })).toBeNull()
})
