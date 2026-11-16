import { expect, test } from 'bun:test'
import { WorkflowStateReadTiming } from './workflowStateReadTiming.js'

test('records only request identity, stage numbers and outcome when enabled', async () => {
  let now = 0
  const logs: unknown[] = []
  const timing = new WorkflowStateReadTiming({ enabled: true, now: () => now, log: record => logs.push(record) })
  await timing.measure('metadata', async () => { now += 10; return 'private-content-never-logged' })
  const queued = timing.begin('queueWait'); now += 20; queued()
  await timing.measure('stateRead', async () => { now += 30 })
  await timing.measure('reconcile', async () => { now += 40 })
  timing.measureSync('serialization', () => { now += 50 })
  timing.finish('ok'); timing.finish('error')
  expect(logs).toHaveLength(1)
  expect(logs[0]).toMatchObject({ totalMs: 150, outcome: 'ok', stagesMs: { metadata: 10, queueWait: 20, stateRead: 30, reconcile: 40, serialization: 50 } })
  expect(JSON.stringify(logs)).not.toContain('private-content')
})

test('keeps fast requests quiet and logs slow or failed stage durations without error content', async () => {
  let now = 0
  const logs: unknown[] = []
  new WorkflowStateReadTiming({ enabled: false, now: () => now, log: record => logs.push(record) }).finish('ok')
  const slow = new WorkflowStateReadTiming({ enabled: false, now: () => now, log: record => logs.push(record) })
  await expect(slow.measure('stateRead', async () => { now = 1200; throw new Error('secret-error-content') })).rejects.toThrow('secret-error-content')
  slow.finish('error')
  expect(logs).toHaveLength(1)
  expect(logs[0]).toMatchObject({ outcome: 'error', totalMs: 1200, stagesMs: { stateRead: 1200 } })
  expect(JSON.stringify(logs)).not.toContain('secret-error')
})
