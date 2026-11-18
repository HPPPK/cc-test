import { expect, test } from 'bun:test'
import { validateReviewerFinalMessage } from './reviewerResultValidation.js'

test('keeps an unresolved dependency decision typed in requiredFixes instead of losing it behind a Leader Ask action', () => {
  const risk = { kind: 'dependency-risk', issue: 'Vite build advisory reachability remains unknown', severity: 'high',
    dependencyScope: 'development-only', shipped: false, reachable: 'unknown', untrustedBuildInputs: false,
    isolatedDevelopment: true, hardGate: 'none', policyEvidence: 'Accepted isolated development contract, no zero gate',
    evidence: ['Production audit clean; Vite build ran, vulnerable branch reachability not established'], disposition: 'decision-required' }
  const receipt = { workflowReview: { reviewStatus: 'needs-fix', readyForNextBatch: false,
    requiredFixes: [{ issue: risk.issue, requiredAction: 'Leader AskUserQuestion; this is not a code defect or a request to repeat audit/build' }], dependencyRisks: [risk] } }
  const rejected = validateReviewerFinalMessage(JSON.stringify(receipt))
  expect(rejected.outcome).toBeUndefined()
  expect(rejected.error).toContain('WORKFLOW_REVIEW_RESULT_INVALID')
  expect(rejected.error).toContain('dependencyRisks[0]')
  expect(rejected.error).toContain('requiredFixes')
  expect(rejected.error).toContain('same Reviewer')
  const corrected = validateReviewerFinalMessage(JSON.stringify({ workflowReview: { ...receipt.workflowReview, requiredFixes: [risk] } }))
  expect(corrected.outcome?.reviewStatus).toBe('needs-fix')
  expect(JSON.parse(corrected.outcome!.requiredFixes[0]!)).toEqual(risk)
  const otherRisk = { ...risk, issue: 'Different advisory' }
  expect(validateReviewerFinalMessage(JSON.stringify({ workflowReview: { ...receipt.workflowReview, requiredFixes: [otherRisk] } })).outcome).toBeUndefined()
  const blocking = { ...risk, dependencyScope: 'runtime', shipped: true, disposition: 'blocking' }
  expect(validateReviewerFinalMessage(JSON.stringify({ workflowReview: { ...receipt.workflowReview, dependencyRisks: [blocking] } })).outcome).toBeUndefined()
  expect(validateReviewerFinalMessage(JSON.stringify({ workflowReview: { ...receipt.workflowReview, dependencyRisks: [blocking], requiredFixes: [blocking] } })).outcome?.reviewStatus).toBe('needs-fix')
})

test('accepts the recorded B3 object finding and preserves its concrete repair and evidence', () => {
  const report = JSON.stringify({ workflowReview: {
    reviewStatus: 'needs-fix', readyForNextBatch: false,
    requiredFixes: [{ file: 'app/classes/__init__.py', issue: 'teacher ID whitespace breaks matching', requiredChange: 'Reject whitespace and add a regression test.' }],
  }, evidence: ['Read lines 131-139'], remainingRisks: ['No new test was run by Reviewer'] })
  const result = validateReviewerFinalMessage(report)
  expect(result.outcome?.reviewStatus).toBe('needs-fix')
  expect(result.outcome?.requiredFixes[0]).toContain('Reject whitespace')
  expect(result.error).toContain('WORKFLOW_REVIEW_NEEDS_FIX:')
  expect(result.error).toContain('Read lines 131-139')
  expect(result.error).toContain('No new test was run by Reviewer')
})

test('identifies an invalid fix entry without dropping it or claiming a missing receipt', () => {
  const report = JSON.stringify({ workflowReview: { reviewStatus: 'pass', requiredFixes: [42], readyForNextBatch: true } })
  const result = validateReviewerFinalMessage(report)
  expect(result.outcome).toBeUndefined()
  expect(result.error).toContain('WORKFLOW_REVIEW_RESULT_INVALID:')
  expect(result.error).toContain('requiredFixes[0]')
  expect(result.error).toContain('42')
})

test('does not accept empty or contradictory fixes as a passing review', () => {
  for (const fix of [{}, { severity: 'high' }, '', null]) {
    expect(validateReviewerFinalMessage(JSON.stringify({ workflowReview: {
      reviewStatus: 'pass', requiredFixes: [fix], readyForNextBatch: true,
    } })).outcome).toBeUndefined()
  }
  expect(validateReviewerFinalMessage(JSON.stringify({ workflowReview: {
    reviewStatus: 'pass', requiredFixes: [{ issue: 'actual bug' }], readyForNextBatch: true,
  } })).error).toContain('pass requires')
})

test('accepts valid pass reports and bounds rejected report feedback', () => {
  expect(validateReviewerFinalMessage('{"workflowReview":{"reviewStatus":"pass","requiredFixes":[],"readyForNextBatch":true}}'))
    .toMatchObject({ outcome: { reviewStatus: 'pass', requiredFixes: [], readyForNextBatch: true }, error: null })
  const result = validateReviewerFinalMessage('invalid '.repeat(10000))
  expect(result.outcome).toBeUndefined()
  expect(result.error!.length).toBeLessThan(14000)
  const largeFinding = validateReviewerFinalMessage(JSON.stringify({ workflowReview: {
    reviewStatus: 'needs-fix', readyForNextBatch: false, requiredFixes: [{ issue: 'bug '.repeat(10000) }],
  } }))
  expect(largeFinding.outcome?.reviewStatus).toBe('needs-fix')
  expect(largeFinding.error!.length).toBeLessThan(11000)
})

test('reports precise malformed receipt fields and preserves mixed valid finding forms', () => {
  for (const [receipt, issue] of [
    [{ workflowReview: [] }, 'workflowReview must be an object'],
    [{ reviewStatus: 'unknown', requiredFixes: [], readyForNextBatch: true }, 'reviewStatus'],
    [{ reviewStatus: 'pass', requiredFixes: [], readyForNextBatch: 1 }, 'readyForNextBatch'],
    [{ reviewStatus: 'pass', requiredFixes: [], readyForNextBatch: true, allowNextBatch: false }, 'conflicts'],
    [{ reviewStatus: 'needs-fix', requiredFixes: [], readyForNextBatch: false }, 'at least one concrete'],
    [{ reviewStatus: 'pass', readyForNextBatch: true }, 'requiredFixes'],
  ] as const) {
    const result = validateReviewerFinalMessage(JSON.stringify(receipt))
    expect(result.outcome).toBeUndefined()
    expect(result.error).toContain(issue)
  }
  const fixes = [
    'Fix the module',
    { severity: 'Medium', suggestedFix: 'Provide the promised test result', basis: 'No execution evidence' },
    { scope: 'app/auth/**', fix: 'Validate configuration before writing data' },
    { scope: 'tests/auth/**', requiredAction: 'Add the missing regression case' },
  ]
  const result = validateReviewerFinalMessage(JSON.stringify({ workflowReview: {
    reviewStatus: 'needs-fix', requiredFixes: fixes, readyForNextBatch: false,
  } }))
  expect(result.outcome?.requiredFixes).toEqual(fixes.map(fix => typeof fix === 'string' ? fix : JSON.stringify(fix)))
})
