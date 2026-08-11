import { expect, test } from 'bun:test'
import { TaskOutputTool } from './TaskOutputTool.js'

test('returns the real Playwright audit with an async Agent TaskOutput', () => {
  const result = TaskOutputTool.mapToolResultToToolResultBlockParam({
    retrieval_status: 'success',
    task: {
      task_id: 'expert-evidence-agent',
      task_type: 'local_agent',
      status: 'completed',
      description: 'Research external demand evidence',
      output: 'Evidence ledger complete.',
      toolAudit: { playwright: 3 },
    },
  } as never, 'toolu_task_output')

  expect(result.content).toContain('<tool-audit>')
  expect(result.content).toContain('Playwright: 3')
})

test('does not invent a Playwright audit for a legacy Agent TaskOutput', () => {
  const result = TaskOutputTool.mapToolResultToToolResultBlockParam({
    retrieval_status: 'success',
    task: {
      task_id: 'legacy-agent',
      task_type: 'local_agent',
      status: 'completed',
      description: 'Legacy agent task',
      output: 'Legacy output.',
    },
  } as never, 'toolu_task_output')

  expect(result.content).not.toContain('<tool-audit>')
})
