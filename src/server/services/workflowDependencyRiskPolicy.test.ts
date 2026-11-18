import { expect, test } from 'bun:test'
import { inspectDevelopmentReviewerOutcome } from './workflowDevelopmentBatchAgentPolicy.js'
import { assessDependencyRisk } from './workflowDependencyRiskPolicy.js'

const devWarning = {
  kind: 'dependency-risk', issue: 'npm audit reports high advisories in the development tool chain', severity: 'high',
  dependencyScope: 'development-only', shipped: false, reachable: false, untrustedBuildInputs: false,
  isolatedDevelopment: true, hardGate: 'none', disposition: 'warning',
  policyEvidence: 'Accepted work order: local development only; no zero-advisory acceptance criterion was agreed.',
  evidence: ['Production audit has zero advisories; isolated local build passed; tools are not shipped and consume only trusted local inputs.'],
  auditCount: 17,
}

const passReceipt = { reviewStatus: 'pass' as const, requiredFixes: [], readyForNextBatch: true }
const fenced = (value: unknown) => `\`\`\`json\n${JSON.stringify(value)}\n\`\`\``

test.each([false, true])('checks blocking risk receipts in every fence regardless of order: %j', reverse => {
  const blocking = { ...passReceipt, dependencyRisks: [{ ...devWarning, severity: 'critical', disposition: 'blocking' }] }
  const receipts = [blocking, passReceipt]
  if (reverse) receipts.reverse()
  const result = inspectDevelopmentReviewerOutcome(receipts.map(fenced).join('\n'))
  expect(result.outcome).toBeNull()
  expect(result.issue).toContain('dependency')
})

test.each([false, true])('rejects conflicting valid review receipts regardless of order: %j', reverse => {
  const receipts = [passReceipt, { reviewStatus: 'needs-fix', requiredFixes: ['Fix the actual defect'], readyForNextBatch: false }]
  if (reverse) receipts.reverse()
  const result = inspectDevelopmentReviewerOutcome(receipts.map(fenced).join('\n'))
  expect(result.outcome).toBeNull()
  expect(result.issue).toContain('conflict')
})

test('accepts duplicate coherent receipts and ignores unrelated evidence JSON', () => {
  expect(inspectDevelopmentReviewerOutcome([fenced({ auditCount: 4 }), fenced(passReceipt), fenced({ workflowReview: passReceipt })].join('\n')))
    .toEqual({ outcome: passReceipt, issue: null })
})

test.each([
  { dependencyRisks: { kind: 'dependency-risk', severity: 'critical' } },
  { dependencyRisks: [{ kind: 'dependency-rsik', severity: 'critical' }] },
])('an explicitly supplied dependencyRisks field cannot silently hide invalid risk entries: %j', ({ dependencyRisks }) => {
  const result = inspectDevelopmentReviewerOutcome(JSON.stringify({ reviewStatus: 'pass', requiredFixes: [], readyForNextBatch: true, dependencyRisks }))
  expect(result.outcome).toBeNull()
  expect(result.issue).toContain('dependencyRisks')
})

test('does not turn a confirmed isolated development audit warning into a mandatory Coder repair', () => {
  const result = inspectDevelopmentReviewerOutcome(JSON.stringify({ workflowReview: {
    reviewStatus: 'needs-fix', requiredFixes: [devWarning], readyForNextBatch: false,
  } }))
  expect(result.outcome).toBeNull()
  expect(result.issue).toContain('nonblocking warning')
})

test.each([
  { dependencyScope: 'runtime', shipped: true, reachable: true, disposition: 'blocking' },
  { severity: 'critical', reachable: 'unknown', disposition: 'decision-required' },
  { shipped: 'unknown', disposition: 'decision-required' },
  { untrustedBuildInputs: 'unknown', disposition: 'decision-required' },
  { hardGate: 'zero-vulnerabilities', disposition: 'blocking', humanWaiver: true },
])('a positive Reviewer receipt cannot ignore a typed blocking or unresolved dependency risk: %j', override => {
  const result = inspectDevelopmentReviewerOutcome(JSON.stringify({ workflowReview: {
    reviewStatus: 'pass', requiredFixes: [], readyForNextBatch: true, dependencyRisks: [{ ...devWarning, ...override }],
  } }))
  expect(result.outcome).toBeNull()
  expect(result.issue).toContain('dependency')
})

test('preserves explicit limited-development pass with a separate coherent warning and legacy findings unchanged', () => {
  expect(inspectDevelopmentReviewerOutcome(JSON.stringify({ workflowReview: {
    reviewStatus: 'pass', requiredFixes: [], readyForNextBatch: true, dependencyRisks: [devWarning],
  } })).outcome).toEqual({ reviewStatus: 'pass', requiredFixes: [], readyForNextBatch: true })
  const finding = { issue: 'Actual broken feature', requiredChange: 'Fix the observed result', severity: 'high' }
  expect(inspectDevelopmentReviewerOutcome(JSON.stringify({ reviewStatus: 'needs-fix', requiredFixes: [finding, 'Existing plain fix'], readyForNextBatch: false })).outcome?.requiredFixes)
    .toEqual([JSON.stringify(finding), 'Existing plain fix'])
})

test('assesses typed exposure/evidence, not advisory counts or claimed human waivers', () => {
  for (const auditCount of [0, 1, 1700]) expect(assessDependencyRisk({ ...devWarning, auditCount })?.classification).toBe('nonblocking-warning')
  expect(assessDependencyRisk(devWarning, { hardGate: 'zero-vulnerabilities' })?.classification).toBe('blocking')
  expect(assessDependencyRisk({ ...devWarning, hardGate: 'zero-vulnerabilities', humanWaiver: true }, { hardGate: 'none' })?.classification).toBe('blocking')
  expect(assessDependencyRisk(devWarning, { hardGate: 'unknown' })?.classification).toBe('decision-required')
  for (const change of [{ evidence: [] }, { policyEvidence: '' }, { isolatedDevelopment: 'unknown' }, { shipped: 'unknown' },
    { reachable: 'unknown' }, { untrustedBuildInputs: 'unknown' }, { dependencyScope: 'unknown' }, { hardGate: 'unknown' }]) {
    expect(assessDependencyRisk({ ...devWarning, ...change })?.classification).toBe('decision-required')
  }
  for (const change of [{ severity: 'critical' }, { dependencyScope: 'runtime' }, { shipped: true },
    { reachable: true }, { untrustedBuildInputs: true }]) expect(assessDependencyRisk({ ...devWarning, ...change })?.classification).toBe('blocking')
  expect(assessDependencyRisk('ordinary old finding')).toBeNull()
  expect(assessDependencyRisk({ kind: 'other', issue: 'old metadata' })).toBeNull()
  expect(assessDependencyRisk(JSON.stringify(devWarning))?.eligibleLimitedDevelopment).toBe(true)
})

test('receipt consistency preserves hard gates and never rewrites an incoherent needs-fix into pass', () => {
  const report = JSON.stringify({ reviewStatus: 'pass', requiredFixes: [], readyForNextBatch: true,
    dependencyRisks: [{ ...devWarning, humanWaiver: true }] })
  expect(inspectDevelopmentReviewerOutcome(report, { hardGate: 'zero-vulnerabilities' }).outcome).toBeNull()
  const unknown = { ...devWarning, shipped: 'unknown' }
  const incoherent = inspectDevelopmentReviewerOutcome(JSON.stringify({ reviewStatus: 'needs-fix', requiredFixes: [unknown], readyForNextBatch: false }))
  expect(incoherent.outcome).toBeNull()
  expect(incoherent.issue).toContain('disposition must be decision-required')
  expect(inspectDevelopmentReviewerOutcome(JSON.stringify({ reviewStatus: 'needs-fix', requiredFixes: JSON.stringify(devWarning), readyForNextBatch: false })).outcome).toBeNull()
  const blocking = { ...devWarning, hardGate: 'zero-vulnerabilities', disposition: 'blocking' }
  expect(inspectDevelopmentReviewerOutcome(JSON.stringify({ reviewStatus: 'needs-fix', requiredFixes: [blocking], readyForNextBatch: false })).outcome)
    .toEqual({ reviewStatus: 'needs-fix', requiredFixes: [JSON.stringify(blocking)], readyForNextBatch: false })
})
