import { expect, test } from 'bun:test'
import { validateCoderFinalMessage } from './coderResultValidation.js'

test('treats explicit unresolved blockers as unfinished business without requiring a positive readiness declaration', () => {
  for (const blockers of [['Verification not run'], { issue: 'Missing scope approval' }, 'Waiting for investigation']) {
    const result = validateCoderFinalMessage(JSON.stringify({ blockers, summary: 'Partial work retained' }))
    expect(result.status).toBe('not-ready')
    expect(result.readyForReview).toBe(false)
    expect(result.error).toContain('non-empty blockers')
    expect(result.error).not.toContain('is missing')
  }
  expect(validateCoderFinalMessage('{"blockers":[]}').status).toBe('invalid')
  expect(validateCoderFinalMessage('{"readyForReview":true,"blockers":["not run"]}').status).toBe('invalid')
  expect(validateCoderFinalMessage('{"readyForReview":"true","blockers":["not run"]}').status).toBe('invalid')
})

test('recognizes an inline negative receipt followed by its actual blocker without accepting inline positive prose', () => {
  const result = validateCoderFinalMessage('检查已通过，但 HTTP 冒烟未验证。\n`readyForReview: false`，原因是服务健康端点未能验证。')
  expect(result.status).toBe('not-ready')
  expect(result.error).toContain('readyForReview=false')
  expect(result.error).not.toContain('is missing')
  expect(validateCoderFinalMessage('`readyForReview: true`，只是说明格式。').status).toBe('invalid')
  expect(validateCoderFinalMessage('```json\n{"readyForReview":true}\n```\n`readyForReview: false`，检查未完成。').status).toBe('invalid')
})

test('does not equate the recorded Coder natural stop while awaiting Debug with success', () => {
  const report = '已阅读当前 schema。等待 Debug 确认关系模型后再修复；本轮尚未修改或执行测试。'
  const result = validateCoderFinalMessage(report)
  expect(result.readyForReview).toBe(false)
  expect(result.error).toContain('WORKFLOW_CODER_INCOMPLETE:')
  expect(result.error).toContain('readyForReview is missing')
  expect(result.error).toContain(report)
  expect(result.error).toContain('same Batch')
  expect(result.error).toContain('Do not create new handoff files')
})

test('accepts explicit boolean readiness in JSON, Markdown JSON fences, or a machine key', () => {
  for (const report of [
    '{"changedFiles":["src/module.ts"],"readyForReview":true}',
    'Completed scoped repair.\n```json\n{"readyForReview":true,"tests":["2 passed"]}\n```',
    'Changed module and tests.\nreadyForReview: true',
    '- readyForReview: true',
    'readyForReview=true',
  ]) expect(validateCoderFinalMessage(report)).toEqual({ status: 'ready', readyForReview: true, error: null })
})

test('requires a boolean and rejects missing, false, conflicting or quoted/example readiness', () => {
  for (const report of [
    '{"readyForReview":false,"blocker":"Need actual verification"}',
    '{"readyForReview":"true"}',
    '{"readyForReview":1}',
    'readyForReview: "true"',
    'readyForReview: false',
    'readyForReview: true\nreadyForReview: false',
    'Successful work; example only: readyForReview: true',
    '> readyForReview: true',
    '```json\n{"readyForReview":false}\n```\nreadyForReview: true',
  ]) {
    expect(validateCoderFinalMessage(report).readyForReview).toBe(false)
    expect(validateCoderFinalMessage(report).error).toContain('WORKFLOW_CODER_INCOMPLETE:')
  }
})

test('keeps complete work for receipt-only continuation and bounds incomplete feedback', () => {
  const result = validateCoderFinalMessage('Module and regression tests completed; 2 passed.\n' + 'evidence '.repeat(2000))
  expect(result.error).toContain('retain that work')
  expect(result.error).toContain('do not repeat completed checks merely to repair the receipt')
  expect(result.error!.length).toBeLessThan(7500)
  expect(result.error).toContain('[Coder report truncated]')
})

test('rejects explicit readiness contradicted by unresolved machine-readable blockers', () => {
  for (const blockers of [['Debug investigation is still pending'], [{ issue: 'Verification has not run' }], 'Waiting for Debug', { issue: 'Verification has not run' }]) {
    const result = validateCoderFinalMessage(JSON.stringify({ readyForReview: true, blockers }))
    expect(result.readyForReview).toBe(false)
    expect(result.error).toContain('non-empty blockers')
  }
  expect(validateCoderFinalMessage('{"readyForReview":true,"blockers":[]}').error).toBeNull()
  expect(validateCoderFinalMessage('{"readyForReview":true,"blockers":"  "}').error).toBeNull()
  expect(validateCoderFinalMessage('{"readyForReview":true,"blockers":null}').error).toBeNull()
  expect(validateCoderFinalMessage('{"readyForReview":true,"blockers":[" ",null]}').error).toBeNull()
  expect(validateCoderFinalMessage('{"readyForReview":true,"remainingRisks":["UI validation remains for a later batch"]}').error).toBeNull()
})
