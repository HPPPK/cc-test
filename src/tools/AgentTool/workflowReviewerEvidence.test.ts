import '../toolFixtures.test.js'
import { expect, test } from 'bun:test'
import type { WorkflowSessionState } from '../../server/services/workflowTypes.js'
import { buildWorkflowReviewerEvidence } from './workflowReviewerEvidence.js'

function fixture() {
  return { sessionId: 'session', activeWorkflowRunId: 'run', activePhaseId: 'implement', runtimeContract: { phaseStates: {
    implement: { taskSnapshots: [{ sessionId: 'session', runId: 'run', phaseId: 'implement', batchId: 'B3', workflowRole: 'coder', status: 'succeeded', agentRunId: 'coder-current', attempt: 2, startedAt: '2026-11-17T01:00:00Z' }] },
  } } } as unknown as WorkflowSessionState
}

test('Reviewer receives current Coder report and actual command receipts without copying source reads', async () => {
  const ids: string[] = []
  const packet = await buildWorkflowReviewerEvidence(fixture(), 'B3', {
    finalReport: () => undefined, transcriptPath: id => `/existing/${id}.jsonl`,
    transcript: async id => { ids.push(id); return [
      { type: 'assistant', timestamp: '2026-11-17T00:00:00Z', message: { content: [{ type: 'tool_use', id: 'old', name: 'Bash', input: { command: 'old attempt test' } }] } },
      { type: 'user', timestamp: '2026-11-17T00:00:01Z', message: { content: [{ type: 'tool_result', tool_use_id: 'old', content: 'old pass' }] } },
      { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'read', name: 'Read', input: { file_path: 'huge.py' } }, { type: 'tool_use', id: 'test', name: 'Bash', input: { command: 'python manage.py test --settings=config.test_settings' } }] } },
      { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'read', content: 'entire-source-file' }, { type: 'tool_result', tool_use_id: 'test', content: 'Ran 12 tests\nOK\nExit code 0' }] } },
      { type: 'assistant', message: { content: [{ type: 'text', text: '{"readyForReview":true,"summary":"roster implemented"}' }] } },
    ] },
  })
  expect(ids).toEqual(['coder-current'])
  expect(packet).toContain('Ran 12 tests')
  expect(packet).toContain('Exit code 0')
  expect(packet).toContain('config.test_settings')
  expect(packet).toContain('roster implemented')
  expect(packet).toContain('/existing/coder-current.jsonl')
  expect(packet).not.toContain('old attempt test')
  expect(packet).not.toContain('entire-source-file')
})

test.each(['failed', 'blocked', 'running'])('does not attach %s Coder evidence as a successful handoff', async status => {
  const state = fixture()
  state.runtimeContract!.phaseStates.implement!.taskSnapshots[0]!.status = status as 'failed'
  await expect(buildWorkflowReviewerEvidence(state, 'B3')).rejects.toThrow('WORKFLOW_REVIEW_EVIDENCE_UNAVAILABLE')
})

test('rejects another run, missing batch and ambiguous owner', async () => {
  const state = fixture()
  await expect(buildWorkflowReviewerEvidence(state, 'B2')).rejects.toThrow('unique successful')
  state.activeWorkflowRunId = 'other'
  await expect(buildWorkflowReviewerEvidence(state, 'B3')).rejects.toThrow('unique successful')
  state.activeWorkflowRunId = 'run'
  state.runtimeContract!.phaseStates.implement!.taskSnapshots.push({ ...state.runtimeContract!.phaseStates.implement!.taskSnapshots[0]! })
  await expect(buildWorkflowReviewerEvidence(state, 'B3')).rejects.toThrow('unique successful')
})

test('bounds context and preserves existing transcript reference when receipt is unavailable', async () => {
  const packet = await buildWorkflowReviewerEvidence(fixture(), 'B3', {
    finalReport: () => undefined, transcriptPath: () => '/existing/coder.jsonl', transcript: async () => { throw new Error('unavailable') },
  })
  expect(packet).toContain('No report available')
  expect(packet).toContain('/existing/coder.jsonl')
  expect(packet).toContain('does not establish that tests were not run')
  const bounded = await buildWorkflowReviewerEvidence(fixture(), 'B3', {
    finalReport: () => 'x'.repeat(100_000), transcriptPath: () => '/existing/coder.jsonl', transcript: async () => [],
  })
  expect(bounded.length).toBeLessThan(10_000)
  expect(bounded).toContain('Excerpt ends')
})
