import { inspectDevelopmentReviewerOutcome, type DevelopmentReviewerOutcome } from '../../server/services/workflowDevelopmentBatchAgentPolicy.js'

/** Ephemeral validation only: durable task status continues to use the existing outcome fields. */
export function validateReviewerFinalMessage(report: string): { outcome?: DevelopmentReviewerOutcome, error: string | null } {
  const { outcome, issue } = inspectDevelopmentReviewerOutcome(report)
  if (outcome?.reviewStatus === 'pass') return { outcome, error: null }
  const excerpt = report.length > 6_000 ? `${report.slice(0, 6_000)}\n[Reviewer report truncated]` : report
  if (!outcome) return {
    error: `WORKFLOW_REVIEW_RESULT_INVALID: ${issue} Repair the receipt format, preserving its findings; do not rerun Coder for a protocol error.\nReviewer report:\n${excerpt}`,
  }
  const serialized = JSON.stringify(outcome)
  const summary = serialized.length > 4_000 ? `${serialized.slice(0, 4_000)}\n[Normalized findings truncated]` : serialized
  return {
    outcome,
    error: `WORKFLOW_REVIEW_NEEDS_FIX: ${summary}\nReviewer report:\n${excerpt}`,
  }
}
