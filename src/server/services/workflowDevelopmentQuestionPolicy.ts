import type { WorkflowSessionState } from './workflowTypes.js'

export const DEVELOPMENT_QUESTION_BATCH_LIMIT = 8

export function usesDevelopmentQuestionBatches(state: WorkflowSessionState | null | undefined): boolean {
  return (state?.templateIdentity?.id ?? state?.templateSnapshot?.id ?? state?.template?.id)
    === 'efficient-constrained-dev-debug-workflow-v5'
}

export const DEVELOPMENT_QUESTION_POLICY = `Development question policy (takes precedence over single-question guidance in inherited snapshots and brainstorming skills):
- Read the user request, previous answers and supplied evidence before asking. Never ask again what they already resolve, including across stages.
- Before each batch, identify all currently relevant unresolved decisions and their dependencies. Ask the entire independent frontier together; use a single question only when no other currently relevant question is independent. Do not serialize independent questions.
- Group independent questions in one AskUserQuestion batch (1–8 questions), displayed together and answered in one submission. Do not fill a quota. Defer a question when its relevance or choices depend on an unanswered question; ask it only after processing that answer.
- Before every question identify the unresolved fact, what concrete decision its answer changes, and why existing evidence does not answer it. Mere completeness, speculative edge cases and easily reversible low-impact details do not justify a question.
- In auto/full or on brainstorming, also ask consequential preferences that materially affect user experience, scope, cost or likely rework, even when not blockers. Use blocksCompletion: false and offer a recommended choice plus an explicit delegate-to-system choice. In off/mini mode ask only missing material or blocking questions and record reasonable defaults for minor gaps.
- Set blocksCompletion: true only if proceeding without this answer risks choosing the wrong core purpose, platform, first-version scope, conflicting requirements or unauthorized operations. Explain blockingReason and answerImpact per blocking question. Never classify every preference as blocking.
- Process the whole batch before asking again: carry forward answers, remove indirectly resolved questions, record skipped optional preferences as undecided with proposed reversible defaults, and ask only newly exposed consequential dependencies or genuine contradictions. Silence is never authorization.
- Stop exploration as soon as target users, purpose and success criteria are clear enough, core flows and MVP/non-goals can form a coherent proposal, and no critical conflict or authorization gap remains. Present that proposal with user decisions separated from system-proposed defaults; confirm the scope together rather than asking about each minor default. Do not reopen accepted scope absent new evidence, changed requirements or an actual contradiction.
- Stage 1 confirms framing, materials and operation boundaries only. Stage 2 inherits those answers and discovers product scope. Do not duplicate the intake across stages. Phase confirmation, permissions and safety gates remain authoritative.`

/** Validate against server-owned issues, never the client's rewritten questions. */
export function getRequiredWorkflowQuestionAnswerViolation(
  state: WorkflowSessionState,
  requestId: string,
  answers: Record<string, unknown>,
): string | null {
  const issues = state.activePhaseId ? state.runtimeContract?.phaseStates[state.activePhaseId]?.issues ?? [] : []
  const missing = issues.filter((issue) => {
    if (issue.source !== 'ask-user-question' || issue.status !== 'open' || issue.questionRequestId !== requestId || !issue.blocksCompletion) return false
    const question = issue.questionInput?.questions
    const original = Array.isArray(question) ? question.find((entry) => entry && typeof entry === 'object' && (entry as Record<string, unknown>).id === issue.questionId) as Record<string, unknown> | undefined : undefined
    const keys = [issue.questionId, issue.question, original?.prompt, original?.question]
    return !keys.some((key) => typeof key === 'string' && typeof answers[key] === 'string' && (answers[key] as string).trim())
  })
  return missing.length ? 'Please answer all required questions before submitting: ' + missing.map((issue) => issue.question ?? issue.questionId).join('; ') : null
}
