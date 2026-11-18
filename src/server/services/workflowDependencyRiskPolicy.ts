export type DependencyRiskClassification = 'nonblocking-warning' | 'decision-required' | 'blocking'
export type DependencyRiskContext = { hardGate?: 'zero-vulnerabilities' | 'none' | 'unknown' }
export type DependencyRiskFinding = {
  kind: 'dependency-risk'
  issue: string
  severity: 'low' | 'moderate' | 'high' | 'critical' | 'unknown'
  dependencyScope: 'development-only' | 'runtime' | 'unknown'
  shipped: boolean | 'unknown'
  reachable: boolean | 'unknown'
  untrustedBuildInputs: boolean | 'unknown'
  isolatedDevelopment: boolean | 'unknown'
  hardGate: 'zero-vulnerabilities' | 'none' | 'unknown'
  policyEvidence: string
  evidence: string[]
  disposition: 'warning' | 'decision-required' | 'blocking'
}
export type DependencyRiskAssessment = {
  classification: DependencyRiskClassification
  eligibleLimitedDevelopment: boolean
  reason: string
}

/** Counts and claimed waivers are not proof of exposure or permission. */
export function assessDependencyRisk(value: unknown, context: DependencyRiskContext = {}): DependencyRiskAssessment | null {
  if (typeof value === 'string') {
    try { value = JSON.parse(value) } catch { return null }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value) || !('kind' in value) || value.kind !== 'dependency-risk') return null
  const finding = value as Record<string, unknown>
  const assessment = (classification: DependencyRiskClassification, reason: string): DependencyRiskAssessment => ({
    classification, eligibleLimitedDevelopment: classification === 'nonblocking-warning', reason,
  })
  if (context.hardGate === 'zero-vulnerabilities' || finding.hardGate === 'zero-vulnerabilities') {
    return assessment('blocking', 'An accepted zero-vulnerability gate remains mandatory; a reported waiver cannot override it.')
  }
  if (finding.severity === 'critical' || finding.dependencyScope === 'runtime' || finding.shipped === true
    || finding.reachable === true || finding.untrustedBuildInputs === true) {
    return assessment('blocking', 'Critical severity or runtime/build-input exposure requires resolution before this review can pass.')
  }
  if ((context.hardGate !== undefined && context.hardGate !== 'none') || finding.hardGate !== 'none'
    || finding.dependencyScope !== 'development-only' || finding.shipped !== false || finding.reachable !== false
    || finding.untrustedBuildInputs !== false || finding.isolatedDevelopment !== true
    || !['low', 'moderate', 'high'].includes(String(finding.severity))
    || typeof finding.issue !== 'string' || !finding.issue.trim()
    || typeof finding.policyEvidence !== 'string' || !finding.policyEvidence.trim()
    || !Array.isArray(finding.evidence) || !finding.evidence.length
    || !finding.evidence.every(item => typeof item === 'string' && item.trim())) {
    return assessment('decision-required', 'Exposure, development isolation, accepted policy or supporting evidence is incomplete; development-only is not proof of safety.')
  }
  return assessment('nonblocking-warning', 'Evidence supports isolated, unshipped development using trusted inputs, without a zero-vulnerability gate; limited development only, not release or a security-fixed claim.')
}

export const DEPENDENCY_RISK_REVIEW_GUIDANCE = 'Dependency advisories: use explicit kind="dependency-risk" findings with dependencyScope, shipped, reachable, untrustedBuildInputs, isolatedDevelopment, hardGate, policyEvidence (accepted contract reference), severity, evidence and disposition. Counts alone do not determine blocking. Critical severity, runtime/shipped/reachable exposure, untrusted build inputs, or accepted zero-vulnerability gates remain blocking. Only evidenced unshipped, unreachable, isolated development with trusted inputs and no zero-vulnerability gate is a nonblocking warning for limited development, never release/security-fixed approval. Put coherent warnings in workflowReview.dependencyRisks, not mandatory requiredFixes. Every unresolved or blocking dependency finding in dependencyRisks must also appear unchanged as a typed kind="dependency-risk" object in workflowReview.requiredFixes so its disposition/evidence survive the receipt; a plain Leader Ask action is not a code fix. Such decisions or blockers cannot pass; malformed risk placement requires the same Reviewer to correct its receipt, not repeated Coder work. Preserve all existing completion checks and authorizations; typed Reviewer facts are consistency-checked, not independently verified, and claimed human waivers do not override accepted hard gates. If no verified patch exists, assess partial remediation and remaining exposure rather than repeat unchanged Coder work or force audit fix/unauthorized installation or lifecycle scripts. For material or unknown risk, the Leader must present applicable limited-development, scoped-alternative, pause and stop options through existing controls; never silently accept risk or invent a new approval loop.'

export const DEPENDENCY_RISK_FINDING_EXAMPLE = JSON.stringify({ kind: 'dependency-risk', issue: 'Describe the observed advisory and remaining exposure',
  severity: 'high', dependencyScope: 'development-only', shipped: 'unknown', reachable: 'unknown', untrustedBuildInputs: 'unknown',
  isolatedDevelopment: 'unknown', hardGate: 'unknown', policyEvidence: '', evidence: ['Reference observed audit/build/exposure/policy evidence, not a count-based safety claim'], disposition: 'decision-required' } satisfies DependencyRiskFinding)

export function dependencyRiskDecisionOptions(eligibleLimitedDevelopment: boolean): string {
  return `${eligibleLimitedDevelopment ? 'Options: continue limited development with the recorded warning (no release/security-fixed claim); ' : 'Options: obtain exposure/policy evidence before considering limited development; '}assess a scoped alternative; pause; or stop. Present the applicable options to the Leader/user through existing controls; do not silently choose a risk acceptance or repeat unchanged Coder work.`
}
