import { registeredResearchArtifactPaths, researchArtifactRootPath } from '../../services/tools/expertFileFirstResearchProtocol.js'
import * as fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { expertResearchPathApiFor } from './expertResearchArtifactPolicyService.js'
import type { ExpertSessionMetadata } from './expertPackRegistryService.js'
import { hasActiveExpertRuntime } from './expertRuntimeBindingService.js'
import { expertRuntimeSessionStore } from './expertRuntimeSessionStore.js'
import { latestInitialRenderAttempt, reportRenderAttempts } from './expertInitialRenderRecovery.js'
import { sessionService, type MessageEntry, type SessionTaskNotification } from './sessionService.js'
import { expertHumanVerificationService } from './expertHumanVerificationService.js'
import { commercializationResearchBudgetService } from './commercializationResearchBudgetService.js'
import { type ExpertResearchRequiredRouteRecovery } from './expertResearchRouteCompletionService.js'
import { resolveResearchRecordArtifactPath } from './expertResearchSourceLibraryService.js'

const COMMERCIALIZATION_RESEARCH_EXPERT_ID = 'commercialization-research-report'

type AutoContinueCandidate = {
  workDir: string
  messages?: MessageEntry[]
  expert: ExpertSessionMetadata
  terminalNotifications?: Array<Pick<SessionTaskNotification, 'taskId' | 'status' | 'timestamp'>>
  workerLifecycles?: Array<{ agentId: string; artifactPath: string; state: 'running' | 'ended'; generation: number; startedAt?: number }>
}

export type FinishedResearchSourceBatch = {
  artifactPath: string
  batchFingerprint: string
  agentId: string
  candidateUrls: string[]
}

type Dependencies = {
  loadCandidate: (sessionId: string) => Promise<AutoContinueCandidate | undefined>
  readFile: (filePath: string, encoding: BufferEncoding) => Promise<string>
  logError: (message: string, error: unknown) => void
  hasPendingHumanVerification?: (sessionId: string) => boolean
  reviewAdmission?: (sessionId: string) => Promise<void>
  settleSourceBatches?: (sessionId: string, batches: FinishedResearchSourceBatch[]) => Promise<void>
}

export type ExpertResearchAutoContinuePlan =
  | { kind: 'continue-review'; briefPath: string; researcherPaths: string[]; auditPath?: string }
  | { kind: 'recover-quality-checkpoint'; code: string; instruction: string }
  | { kind: 'research-continuation-stalled' }
  | { kind: 'initial-render-stalled'; errorCode: string }
  | { kind: 'report-delivery-stalled'; reportPath: string; errorCode: string }
  | { kind: 'settle-incomplete-source-batches'; batches: FinishedResearchSourceBatch[] }
  | {
    kind: 'continue-absorption'
    briefPath: string
    researcherPaths: string[]
    reviewerPath: string
    auditPath: string
    absorptionPath: string
    absorberAgentType: string
  }
  | {
    kind: 'continue-initial-render'
    briefPath: string
    absorptionPath: string
  }
  | {
    kind: 'continue-output-review'
    briefPath: string
    absorptionPath: string
    completionReviewPath: string
    reportPath: string
    reviewerAgentType: 'expert-evidence-output-reviewer'
    resumeAgentId?: string
  }
  | {
    kind: 'continue-finalize-delivery'
    briefPath: string
    absorptionPath: string
    completionReviewPath: string
    reportPath: string
  }
  | { kind: 'recover-missing-researchers'; missingArtifactPaths: string[] }
  | { kind: 'recover-ended-researchers'; recoveries: Array<{ artifactPath: string; endedAgentId: string; endedAt?: string; reason: 'ended-without-saved-handoff' }>; preservedResearcherPaths: string[] }
  | { kind: 'recover-incomplete-required-routes'; recoveries: ExpertResearchRequiredRouteRecovery[] }
  | {
    kind: 'recover-undispatched-source-batch'
    recoveries: Array<{
      artifactPath: string
      batchFingerprint: string
      coreEntryCount: number
      openEntryCount: number
      remainingEntryCount: number
      entries: Array<{ tier: 'core' | 'open'; category: string; candidateUrl: string }>
      reason: 'source-package-not-dispatched' | 'source-package-incomplete'
    }>
  }

export type ExpertResearchAutoContinueHandler = (
  sessionId: string,
  plan: ExpertResearchAutoContinuePlan,
) => Promise<boolean>

function resolveArtifactAbsolutePath(workDir: string, artifactPath: string): string {
  const pathApi = expertResearchPathApiFor(workDir)
  return pathApi.resolve(workDir, ...artifactPath.split('/'))
}

function hasDurableTemplateFillDelivery(expert: ExpertSessionMetadata): boolean {
  const delivery = expert.templateFillDelivery
  return Boolean(
    delivery
    && typeof delivery.templateId === 'string'
    && delivery.templateId.trim()
    && typeof delivery.finalizedAt === 'string'
    && Number.isFinite(Date.parse(delivery.finalizedAt)),
  )
}

function readRenderedTemplateFillDraft(expert: ExpertSessionMetadata): {
  completionReview: { initialRenderedAt: string; reportPath?: string }
} | undefined {
  const draft = expert.templateFillDraft
  const review = draft?.completionReview
  if (
    !draft
    || typeof draft.templateId !== 'string'
    || !draft.templateId.trim()
    || !review
    || typeof review.initialRenderedAt !== 'string'
    || !Number.isFinite(Date.parse(review.initialRenderedAt))
  ) return undefined
  return {
    completionReview: {
      initialRenderedAt: review.initialRenderedAt,
      ...(typeof review.reportPath === 'string' && review.reportPath.trim()
        ? { reportPath: review.reportPath }
        : {}),
    },
  }
}

function hasCurrentCompletenessReviewReceipt(
  expert: ExpertSessionMetadata,
  completionReviewPath: string,
  initialRenderedAt: string,
): boolean {
  const receipt = expert.reportCompletenessReview
  return Boolean(
    receipt
    && receipt.artifactPath === completionReviewPath
    && typeof receipt.completedAt === 'string'
    && Number.isFinite(Date.parse(receipt.completedAt))
    && Date.parse(receipt.completedAt) >= Date.parse(initialRenderedAt),
  )
}

async function loadCandidateFromSession(sessionId: string): Promise<AutoContinueCandidate | undefined> {
  const session = await sessionService.getSession(sessionId)
  if (!session || session.id !== sessionId) return undefined
  let expert = session.expert ?? await expertRuntimeSessionStore.get(sessionId)
  const workDir = session.workDir || session.projectRoot || session.projectPath
  if (!hasActiveExpertRuntime(expert) || !workDir || expert.runtimeBinding.expertId !== COMMERCIALIZATION_RESEARCH_EXPERT_ID) return undefined
  const terminalNotifications = await sessionService.getSessionTaskNotifications(sessionId)
  if (expert.researchSourceDispatches?.receipts.some((receipt) => !receipt.completedAt)) {
    const { ExpertSessionService } = await import('./expertSessionService.js')
    expert = await new ExpertSessionService().reconcileResearchSourceCompletionNotifications(sessionId) ?? expert
  }
  const { ExpertSessionService } = await import('./expertSessionService.js')
  expert = await new ExpertSessionService().refreshSavedResearchEvidence(sessionId) ?? expert
  const workerLifecycles = commercializationResearchBudgetService.getWorkerLifecycles(sessionId, expert)
  return { workDir, expert, messages: await sessionService.getSessionRuntimeMessages(sessionId), terminalNotifications, workerLifecycles }
}


const defaultDependencies: Dependencies = {
  loadCandidate: loadCandidateFromSession,
  readFile: fs.readFile,
  hasPendingHumanVerification: sessionId => Boolean(expertHumanVerificationService.getPendingRequest(sessionId)),
  reviewAdmission: async sessionId => {
    const { ExpertSessionService } = await import('./expertSessionService.js')
    await new ExpertSessionService().getSubagentSkillContext(sessionId, 'expert-evidence-reviewer')
  },
  logError: (message, error) => console.warn(message, error),
  settleSourceBatches: async (sessionId, batches) => {
    const { ExpertSessionService } = await import('./expertSessionService.js')
    const service = new ExpertSessionService()
    for (const batch of batches) await service.settleFinishedResearchSourceBatch(sessionId, batch)
  },
}

/**
 * Server-side recovery for the file-first commercialization Expert.
 *
 * Research children persist their own Markdown plus browser audit before they
 * complete. After the brief exists and the parent turn has gone idle, this
 * service either resumes D after all researcher handoffs are durable or asks
 * the same parent to recover only the missing handoffs. It never returns
 * research prose to the parent, never touches normal chats, and never launches
 * concurrent recovery turns for the same session. A sent instruction is never
 * treated as proof that the model actually wrote its declared artifact.
 */
export class ExpertResearchAutoContinueService {
  private readonly scheduled = new Set<string>()
  private readonly checking = new Set<string>()
  private readonly inFlight = new Set<string>()
  private readonly outputReviewStalls = new Set<string>()
  private readonly researchRetries = new Map<string, { progress: string; attempts: number; notified: boolean; recoveredTerminals?: Set<string> }>()
  private readonly initialRenderRetries = new Map<string, { progress: string; lastAttempt?: string; errorCode?: string; failureFingerprint?: string; repeats: number; notified: boolean }>()
  private handler: ExpertResearchAutoContinueHandler | undefined
  private settledHandler: ((sessionId: string) => Promise<void>) | undefined
  // Process-local safety valve, not a completion marker or a new user-data schema.
  // A repaired server always permits a first attempt, including legacy failures.
  private readonly finalizeRetries = new Map<string, {
    progress: string; failedAt?: string; failure?: string; repeats: number; notified: boolean
  }>()

  constructor(private readonly dependencies: Dependencies = defaultDependencies) {}

  setHandler(handler: ExpertResearchAutoContinueHandler): void {
    this.handler = handler
  }

  setSettledHandler(handler: (sessionId: string) => Promise<void>): void {
    this.settledHandler = handler
  }

  hasPendingWork(sessionId: string): boolean {
    return this.scheduled.has(sessionId) || this.checking.has(sessionId) || this.inFlight.has(sessionId)
  }

  schedule(sessionId: string): void {
    if (!sessionId || this.scheduled.has(sessionId)) return
    this.scheduled.add(sessionId)
    // Coalesce new signals while checking/sending; the active pass drains them.
    if (this.checking.has(sessionId) || this.inFlight.has(sessionId)) return
    queueMicrotask(() => {
      void this.tryContinue(sessionId)
    })
  }

  async tryContinue(sessionId: string): Promise<boolean> {
    if (this.checking.has(sessionId) || this.inFlight.has(sessionId)) return false
    this.scheduled.delete(sessionId)
    if (!this.handler) return false

    this.checking.add(sessionId)
    let settled = false
    let waiting = false
    const markWaiting = () => { waiting = true }
    try {
      let plan = await this.resolvePlan(sessionId, markWaiting)
      if (plan?.kind === 'settle-incomplete-source-batches') {
        if (!this.dependencies.settleSourceBatches) return false
        await this.dependencies.settleSourceBatches(sessionId, plan.batches)
        waiting = false
        plan = await this.resolvePlan(sessionId, markWaiting)
        if (plan?.kind === 'settle-incomplete-source-batches') return false
      }
      if (!plan) {
        settled = !waiting
        return false
      }

      this.inFlight.add(sessionId)
      try {
        // The next terminal/reconnect signal always re-reads durable state. A
        // model statement such as "I will dispatch F" is not a milestone and
        // must not permanently suppress recovery when no artifact was written.
        const sent = await this.handler(sessionId, plan)
        if (sent && ['continue-review', 'recover-quality-checkpoint', 'recover-missing-researchers', 'recover-ended-researchers', 'research-continuation-stalled'].includes(plan.kind)) {
          const retry = this.researchRetries.get(sessionId)
          if (retry) {
            if (plan.kind === 'research-continuation-stalled') retry.notified = true
            else {
              retry.attempts++
              if (plan.kind === 'recover-ended-researchers') {
                retry.recoveredTerminals ??= new Set()
                for (const recovery of plan.recoveries) retry.recoveredTerminals.add(JSON.stringify([recovery.artifactPath, recovery.endedAgentId, recovery.endedAt]))
              }
            }
          }
        }
        if (sent && plan.kind === 'initial-render-stalled') {
          const state = this.initialRenderRetries.get(sessionId)
          if (state) state.notified = true
        }
        if (sent && plan.kind === 'report-delivery-stalled') {
          const state = this.finalizeRetries.get(sessionId)
          if (state) state.notified = true
        }
        // Sending an internal parent instruction is not source execution. The
        // recovery fingerprint is persisted only when the delegated researcher
        // actually receives its exact source wave through the dispatch endpoint.
        return sent
      } catch (error) {
        this.dependencies.logError(`[ExpertResearchAutoContinue] Failed to resume ${sessionId}`, error)
        return false
      } finally {
        this.inFlight.delete(sessionId)
      }
    } catch (error) {
      this.dependencies.logError(`[ExpertResearchAutoContinue] Failed readiness check for ${sessionId}`, error)
      return false
    } finally {
      this.checking.delete(sessionId)
      // An event received during an await must not be lost or leave a sticky
      // scheduled marker. Re-read durable state once, only when signalled.
      if (this.scheduled.delete(sessionId)) this.schedule(sessionId)
      else if (settled) {
        try { await this.settledHandler?.(sessionId) }
        catch (error) { this.dependencies.logError(`[ExpertResearchAutoContinue] Failed completion notification for ${sessionId}`, error) }
      }
    }
  }

  private guardInitialRenderRetry(sessionId: string, candidate: AutoContinueCandidate, brief: string, absorption: string,
    plan: Extract<ExpertResearchAutoContinuePlan, { kind: 'continue-initial-render' }>): ExpertResearchAutoContinuePlan | undefined {
    const messages = candidate.messages ?? []
    const human = messages.filter(message => message.isHumanInput === true && !message.isSidechain && !message.parentToolUseId).at(-1)?.id
    const progress = createHash('sha256').update(JSON.stringify({ brief, absorption, human })).digest('hex')
    const latest = latestInitialRenderAttempt(messages)
    let state = this.initialRenderRetries.get(sessionId)
    if (!state || state.progress !== progress) {
      state = { progress, lastAttempt: latest?.id, errorCode: latest?.errorCode, failureFingerprint: latest?.failureFingerprint, repeats: 0, notified: false }
      this.initialRenderRetries.set(sessionId, state)
      while (this.initialRenderRetries.size > 128) this.initialRenderRetries.delete(this.initialRenderRetries.keys().next().value!)
      return plan
    }
    if (latest && latest.id !== state.lastAttempt) {
      state.repeats = latest.errorCode ? latest.failureFingerprint === state.failureFingerprint ? state.repeats + 1 : 1 : 0
      state.lastAttempt = latest.id
      state.errorCode = latest.errorCode
      state.failureFingerprint = latest.failureFingerprint
      if (state.repeats < 3) state.notified = false
    }
    if (state.repeats < 3) return plan
    if (state.notified) return undefined
    return { kind: 'initial-render-stalled', errorCode: state.errorCode ?? 'EXPERT_INITIAL_RENDER_TOOL_ERROR' }
  }

  private guardFinalizeRetry(sessionId: string, candidate: AutoContinueCandidate, review: string,
    plan: Extract<ExpertResearchAutoContinuePlan, { kind: 'continue-finalize-delivery' }>): ExpertResearchAutoContinuePlan | undefined {
    const { expert } = candidate
    const messages = candidate.messages ?? []
    const humanIndex = messages.findLastIndex(message => message.isHumanInput === true && !message.isSidechain && !message.parentToolUseId)
    const attempts = reportRenderAttempts(messages.slice(humanIndex + 1))
    const toolFailure = attempts.at(-1)
    let repeatedTools = 0
    if (toolFailure?.failureFingerprint) {
      for (const attempt of [...attempts].reverse()) {
        if (attempt.failureFingerprint !== toolFailure.failureFingerprint) break
        repeatedTools++
      }
    }
    const progress = createHash('sha256').update(JSON.stringify({
      draft: expert.templateFillDraft && { templateId: expert.templateFillDraft.templateId,
        fields: expert.templateFillDraft.fields, evidenceAbsorption: expert.templateFillDraft.evidenceAbsorption,
        completionReview: expert.templateFillDraft.completionReview },
      review, reviewPath: expert.reportCompletenessReview?.artifactPath,
      evidence: expert.researchEvidence?.updatedAt, reviewer: expert.researchEvidenceReviewer?.updatedAt,
      human: messages[humanIndex]?.id,
    })).digest('hex')
    const failures = (expert as ExpertSessionMetadata & { templateFillRepairFailures?: Array<{ failedAt: string; failureFingerprint: string; code?: string }> }).templateFillRepairFailures
    const latest = toolFailure?.errorCode ? { failedAt: toolFailure.id, failureFingerprint: toolFailure.failureFingerprint!, code: toolFailure.errorCode }
      : Array.isArray(failures) ? failures.at(-1) : undefined
    let state = this.finalizeRetries.get(sessionId)
    if (!state || state.progress !== progress) {
      state = { progress, failedAt: latest?.failedAt, failure: latest?.failureFingerprint, repeats: repeatedTools, notified: false }
      this.finalizeRetries.set(sessionId, state)
      while (this.finalizeRetries.size > 128) this.finalizeRetries.delete(this.finalizeRetries.keys().next().value!)
      if (state.repeats < 3) return plan
    }
    if (latest?.failedAt && latest.failedAt !== state.failedAt) {
      state.repeats = latest.failureFingerprint === state.failure ? state.repeats + 1 : 1
      state.failedAt = latest.failedAt
      state.failure = latest.failureFingerprint
      if (state.repeats < 3) state.notified = false
    }
    if (state.repeats < 3) return plan
    if (state.notified) return undefined
    return { kind: 'report-delivery-stalled', reportPath: plan.reportPath, errorCode: latest?.code ?? 'EXPERT_TEMPLATE_FILL_REPAIR_REQUIRED' }
  }

  private async resolvePlan(sessionId: string, markWaiting: () => void): Promise<ExpertResearchAutoContinuePlan | undefined> {
    const candidate = await this.dependencies.loadCandidate(sessionId)
    if (!candidate) return undefined
    // Authentication cannot be repaired by another research instruction. Read
    // the transcript so reconnects/server restarts cannot restart the loop.
    // Only a later real user turn or successful parent response clears it.
    for (const message of [...(candidate.messages ?? [])].reverse()) {
      if (message.isSidechain || message.parentToolUseId) continue
      if (message.isHumanInput === true) break
      if (message.type !== 'assistant') continue
      const text = typeof message.content === 'string' ? message.content
        : Array.isArray(message.content) ? message.content
          .filter(block => block?.type === 'text' && typeof block.text === 'string')
          .map(block => block.text).join('\n') : ''
      if (text.trim() === 'No response requested.') continue
      if (/^(?:Failed to authenticate\.|API Error:\s*(?:401|403)\b)/i.test(text.trim())) {
        markWaiting()
        return undefined
      }
      if (text.trim()) break
    }
    const { expert, workDir } = candidate
    // Only the live verification queue establishes a human wait. Historical
    // browser diagnostics or a child's final prose cannot pause recovery.
    if (this.dependencies.hasPendingHumanVerification?.(sessionId)) { markWaiting(); return undefined }
    if (!hasActiveExpertRuntime(expert)) return undefined
    const binding = expert.runtimeBinding
    if (
      !binding
      || binding.expertId !== COMMERCIALIZATION_RESEARCH_EXPERT_ID
      || !binding.researchArtifactPolicy
      || !binding.researchEvidenceReviewPolicy
    ) return undefined

    // A completed final delivery is terminal even though its research Markdown
    // remains intentionally preserved for provenance and later user reading.
    if (hasDurableTemplateFillDelivery(expert) && expert.templateFillDelivery?.reportPath) {
      try {
        const report = await this.dependencies.readFile(expert.templateFillDelivery.reportPath, 'utf8')
        if (report.trim()) { this.finalizeRetries.delete(sessionId); return undefined }
      } catch {
        // Older versions persisted completion before writing. Missing output is
        // recoverable using existing research, never proof of successful delivery.
      }
    }

    const artifactPolicy = binding.researchArtifactPolicy
    let brief: string
    try {
      brief = await this.dependencies.readFile(
        resolveArtifactAbsolutePath(workDir, artifactPolicy.briefPath),
        'utf8',
      )
      if (!brief.trim()) return undefined
    } catch {
      // Do not synthesize A/B/C recovery before the parent has actually written
      // the declared research brief for this session.
      return undefined
    }

    const sourceAgentTypes = new Set(binding.researchEvidenceReviewPolicy.sourceAgentTypes)
    const sourceDispatches = expert.researchSourceDispatches?.receipts
    const persistedResearcherPaths = new Set(
      (expert.researchEvidence?.records ?? [])
        .filter((record) => sourceAgentTypes.has(record.agentType))
        .map((record) => resolveResearchRecordArtifactPath(record, sourceDispatches))
        .filter((artifactPath): artifactPath is string => Boolean(artifactPath)),
    )

    const missingArtifactPaths: string[] = []
    const durableResearcherPaths: string[] = []
    for (const artifactPath of artifactPolicy.researcherPaths) {
      if (!persistedResearcherPaths.has(artifactPath)) {
        missingArtifactPaths.push(artifactPath)
        continue
      }
      try {
        const savedPaths = registeredResearchArtifactPaths(artifactPolicy, expert.researchEvidence?.records ?? [])
          .filter((savedPath) => researchArtifactRootPath(savedPath) === artifactPath)
        const paths = savedPaths.length ? savedPaths : [artifactPath]
        const contents = await Promise.all(paths.map((savedPath) => this.dependencies.readFile(resolveArtifactAbsolutePath(workDir, savedPath), 'utf8').catch(() => '')))
        durableResearcherPaths.push(...paths.filter((_, index) => contents[index].trim()))
        if (!contents.some((content) => content.trim())) missingArtifactPaths.push(artifactPath)
      } catch {
        missingArtifactPaths.push(artifactPath)
      }
    }
    // The canonical source library and planned routes are diagnostic candidates.
    // Review the actual A/B/C handoffs rather than automatically draining catalog
    // waves, repairing every route, or manufacturing unvisited-site outcomes.
    if (missingArtifactPaths.length) {
      const recoveries: Extract<ExpertResearchAutoContinuePlan, { kind: 'recover-ended-researchers' }>['recoveries'] = []
      const undispatched: string[] = []
      for (const artifactPath of missingArtifactPaths) {
        const workers = (candidate.workerLifecycles ?? [])
          .filter(worker => researchArtifactRootPath(worker.artifactPath) === artifactPath)
          .map(worker => {
            // A finalization failure can happen after query completion but
            // before any audit/finish POST. An actual terminal notification
            // after this generation started settles that otherwise sticky run.
            const terminalAfterStart = worker.startedAt !== undefined && Number.isFinite(worker.startedAt)
              && candidate.terminalNotifications?.some(event => event.taskId === worker.agentId
                && ['completed', 'failed', 'stopped'].includes(event.status)
                && event.timestamp && Date.parse(event.timestamp) >= worker.startedAt!)
            return worker.state === 'running' && terminalAfterStart ? { ...worker, state: 'ended' as const } : worker
          })
        // Canonical targeted tasks may have no source-batch dispatch receipt.
        // Live lifecycle takes priority over an earlier completion of this same
        // resumed worker; its generation advances only on a real resume.
        if (workers.some(worker => worker.state === 'running')) continue
        const endedWorkers = workers.filter(worker => worker.state === 'ended')
        // A failed fresh repair has no original browser context. Prefer the
        // ended worker whose real audit was preserved, even without a saved path.
        const endedWorker = endedWorkers.findLast(worker => expert.researchEvidence?.records.some(record => record.agentId === worker.agentId && record.entries?.length))
          ?? endedWorkers.at(-1)
        if (endedWorker) {
          recoveries.push({ artifactPath, endedAgentId: endedWorker.agentId, endedAt: 'runtime:' + endedWorker.generation, reason: 'ended-without-saved-handoff' })
          continue
        }
        const receipts = (sourceDispatches ?? []).filter(receipt => researchArtifactRootPath(receipt.artifactPath) === artifactPath)
        // A replacement can own the lane while an older terminal receipt still
        // exists. An unclosed receipt is active/unknown, never a failed save.
        if (receipts.some(receipt => !receipt.completedAt)) continue
        const ended = receipts.toSorted((a, b) => Date.parse(b.dispatchedAt) - Date.parse(a.dispatchedAt))[0]
        if (ended) {
          // A resumed same-agent worker keeps its identity and source receipt.
          // Count only a new terminal event, never audit-receipt timestamp churn.
          const terminal = candidate.terminalNotifications?.filter(event => event.taskId === ended.agentId
            && ['completed', 'failed', 'stopped'].includes(event.status)
            && event.timestamp && Date.parse(event.timestamp) >= Date.parse(ended.dispatchedAt))
            .toSorted((a, b) => Date.parse(b.timestamp!) - Date.parse(a.timestamp!))[0]
          recoveries.push({ artifactPath, endedAgentId: ended.agentId, endedAt: terminal?.timestamp ?? ended.completedAt, reason: 'ended-without-saved-handoff' })
        }
        else undispatched.push(artifactPath)
      }
      if (recoveries.length) return this.guardResearchContinuation(sessionId, expert, brief, {
        kind: 'recover-ended-researchers', recoveries, preservedResearcherPaths: durableResearcherPaths,
      })
      if (undispatched.length) return this.guardResearchContinuation(sessionId, expert, brief, { kind: 'recover-missing-researchers', missingArtifactPaths: undispatched })
      markWaiting()
      return undefined
    }


    // A persisted reviewer receipt is not proof that the Markdown reached disk:
    // a denied or interrupted Write can leave this marker behind. Only a real
    // non-empty review suppresses recovery. Once it is durable, the next
    // required file-first stage is E; never rely on the parent merely saying it
    // will dispatch that agent.
    if ((expert.researchEvidenceReviewer?.reviewer?.artifactPath ?? '') === artifactPolicy.reviewerPath) {
      try {
        const review = await this.dependencies.readFile(
          resolveArtifactAbsolutePath(workDir, artifactPolicy.reviewerPath),
          'utf8',
        )
        if (review.trim()) {
          const absorptionPolicy = binding.researchEvidenceAbsorptionPolicy
          const absorptionPath = artifactPolicy.absorptionPath
          const absorberAgentType = absorptionPolicy?.absorberAgentType
          if (absorptionPolicy?.required && absorptionPath && absorberAgentType) {
            try {
              const absorption = await this.dependencies.readFile(
                resolveArtifactAbsolutePath(workDir, absorptionPath),
                'utf8',
              )
              if (absorption.trim()) {
                const renderedDraft = readRenderedTemplateFillDraft(expert)
                if (!renderedDraft) {
                  const continuation = this.guardInitialRenderRetry(sessionId, candidate, brief, absorption, {
                    kind: 'continue-initial-render',
                    briefPath: artifactPolicy.briefPath,
                    absorptionPath,
                  })
                  if (!continuation) markWaiting()
                  return continuation
                }

                this.initialRenderRetries.delete(sessionId)
                const completionReviewPath = artifactPolicy.completionReviewPath
                const reportPath = renderedDraft.completionReview.reportPath
                // Old session metadata did not persist the rendered HTML path.
                // Keep those records compatible without guessing a workspace
                // filename or broadening the output-reviewer's Read surface.
                if (!completionReviewPath || !reportPath) return undefined
                // A failed audit includes the original F identity even when its
                // final API request failed before Write. Resume that transcript.
                const failedReview = [...(candidate.messages ?? [])].reverse().find(message =>
                  Date.parse(message.timestamp) >= Date.parse(renderedDraft.completionReview.initialRenderedAt)
                  && JSON.stringify(message.content).includes('[expert-research-audit] failed to persist audit for expert-evidence-output-reviewer/'))
                const resumeAgentId = failedReview && JSON.stringify(failedReview.content).match(/failed to persist audit for expert-evidence-output-reviewer\/([a-zA-Z0-9_-]+)/)?.[1]
                const latestHuman = (candidate.messages ?? []).filter(message => message.isHumanInput === true).at(-1)
                const failures = resumeAgentId ? (candidate.messages ?? []).filter(message =>
                  Date.parse(message.timestamp) >= Date.parse(latestHuman?.timestamp ?? renderedDraft.completionReview.initialRenderedAt)
                  && JSON.stringify(message.content).includes('failed to persist audit for expert-evidence-output-reviewer/' + resumeAgentId + ':')) : []
                if (failures.length >= 3) {
                  markWaiting()
                  const key = JSON.stringify([sessionId, renderedDraft.completionReview.initialRenderedAt, latestHuman?.id, resumeAgentId])
                  if (this.outputReviewStalls.has(key)) return undefined
                  this.outputReviewStalls.add(key)
                  while (this.outputReviewStalls.size > 128) this.outputReviewStalls.delete(this.outputReviewStalls.values().next().value!)
                  return { kind: 'report-delivery-stalled', reportPath, errorCode: 'EXPERT_OUTPUT_REVIEW_RECOVERY_FAILED' }
                }

                if (!hasCurrentCompletenessReviewReceipt(
                  expert,
                  completionReviewPath,
                  renderedDraft.completionReview.initialRenderedAt,
                )) {
                  return {
                    kind: 'continue-output-review',
                    briefPath: artifactPolicy.briefPath,
                    absorptionPath,
                    completionReviewPath,
                    reportPath,
                    reviewerAgentType: 'expert-evidence-output-reviewer',
                    ...(resumeAgentId ? { resumeAgentId } : {}),
                  }
                }
                let outputReview: string
                try {
                  outputReview = await this.dependencies.readFile(
                    resolveArtifactAbsolutePath(workDir, completionReviewPath),
                    'utf8',
                  )
                  if (!outputReview.trim()) {
                    return {
                      kind: 'continue-output-review',
                      briefPath: artifactPolicy.briefPath,
                      absorptionPath,
                      completionReviewPath,
                      reportPath,
                      reviewerAgentType: 'expert-evidence-output-reviewer',
                      ...(resumeAgentId ? { resumeAgentId } : {}),
                    }
                  }
                } catch {
                  return {
                    kind: 'continue-output-review',
                    briefPath: artifactPolicy.briefPath,
                    absorptionPath,
                    completionReviewPath,
                    reportPath,
                    reviewerAgentType: 'expert-evidence-output-reviewer',
                    ...(resumeAgentId ? { resumeAgentId } : {}),
                  }
                }
                const continuation = this.guardFinalizeRetry(sessionId, candidate, outputReview, {
                  kind: 'continue-finalize-delivery',
                  briefPath: artifactPolicy.briefPath,
                  absorptionPath,
                  completionReviewPath,
                  reportPath,
                })
                if (!continuation || continuation.kind === 'report-delivery-stalled') markWaiting()
                return continuation
              }
            } catch {
              // A missing absorption file is exactly the recoverable D → E
              // handoff gap. Build the internal parent continuation below.
            }
            return {
              kind: 'continue-absorption',
              briefPath: artifactPolicy.briefPath,
              researcherPaths: durableResearcherPaths,
              reviewerPath: artifactPolicy.reviewerPath,
              auditPath: artifactPolicy.auditPath,
              absorptionPath,
              absorberAgentType,
            }
          }
          return undefined
        }
      } catch {
        // Missing review is repairable; researcher ledgers below still decide
        // whether the same parent session can resume D.
      }
    }

    let auditPath: string | undefined
    try {
      if ((await this.dependencies.readFile(resolveArtifactAbsolutePath(workDir, artifactPolicy.auditPath), 'utf8')).trim()) auditPath = artifactPolicy.auditPath
    } catch {}
    let plan: ExpertResearchAutoContinuePlan = { kind: 'continue-review', briefPath: artifactPolicy.briefPath, researcherPaths: durableResearcherPaths, ...(auditPath ? { auditPath } : {}) }
    if (this.dependencies.reviewAdmission) {
      try { await this.dependencies.reviewAdmission(sessionId) }
      catch (error) {
        const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
        if (code === 'EXPERT_RESEARCH_SUBAGENTS_PENDING') { markWaiting(); return undefined }
        if (!['EXPERT_RESEARCH_TARGETED_FOLLOWUP_REQUIRED', 'EXPERT_RESEARCH_EVIDENCE_CONTRACT_INVALID', 'EXPERT_RESEARCH_SOURCE_SELECTION_REQUIRED'].includes(code)) throw error
        plan = { kind: 'recover-quality-checkpoint', code, instruction: error instanceof Error ? error.message : code }
      }
    }
    return this.guardResearchContinuation(sessionId, expert, brief, plan)
  }

  private guardResearchContinuation(sessionId: string, expert: ExpertSessionMetadata, brief: string, plan: ExpertResearchAutoContinuePlan): ExpertResearchAutoContinuePlan | undefined {
    const progress = createHash('sha256').update(JSON.stringify({
      brief, kind: plan.kind,
      // A new receipt timestamp/worker identity is not new evidence.
      evidence: expert.researchEvidence?.records.map(row => JSON.stringify({
        agentType: row.agentType, artifactPath: row.artifactPath, content: row.content, entries: row.entries,
      })).sort(),
      dispatches: plan.kind === 'recover-ended-researchers' ? undefined : expert.researchSourceDispatches?.receipts.map(row => JSON.stringify({
        artifactPath: row.artifactPath, batchFingerprint: row.batchFingerprint,
        completed: Boolean(row.completedAt), retryCount: row.retryCount, coreEntryCount: row.coreEntryCount, openEntryCount: row.openEntryCount,
      })).sort(),
      activation: expert.runtimeBinding?.activatedAt,
    })).digest('hex')
    let retry = this.researchRetries.get(sessionId)
    if (!retry || retry.progress !== progress) {
      retry = { progress, attempts: 0, notified: false }
      this.researchRetries.set(sessionId, retry)
      while (this.researchRetries.size > 128) this.researchRetries.delete(this.researchRetries.keys().next().value!)
    }
    if (plan.kind === 'recover-ended-researchers') {
      const recoveries = plan.recoveries.filter(recovery => !retry.recoveredTerminals?.has(JSON.stringify([recovery.artifactPath, recovery.endedAgentId, recovery.endedAt])))
      // Duplicate terminal/reconnect events are not failed recovery attempts.
      // Only a newly ended replacement can advance the no-progress guard.
      if (!recoveries.length) return undefined
      plan = { ...plan, recoveries }
    }
    if (retry.attempts < 3) return plan
    return retry.notified ? undefined : { kind: 'research-continuation-stalled' }
  }
}

export const expertResearchAutoContinueService = new ExpertResearchAutoContinueService()



export function buildResearchReviewContinuationInstruction(plan: Extract<ExpertResearchAutoContinuePlan, { kind: 'continue-review' }>): string {
  return [
    '<expert-research-auto-continue>',
    'The declared researcher handoffs are durable and the current review admission has passed. Continue independent evidence review, field absorption and the fixed-template report. Do not redo completed browsing.',
    'The parent may read the brief only: ' + plan.briefPath + '. Delegate the reviewer using its runtime-injected artifact paths. The saved researcher paths below are handoff references; do not paste their bodies into the parent context.',
    JSON.stringify({ researcherPaths: plan.researcherPaths, ...(plan.auditPath ? { auditPath: plan.auditPath } : {}) }),
    'Do not probe optional or guessed artifact paths. No listed browser audit means it is not yet available; the runtime must provide or produce the audit at its required stage.',
    '</expert-research-auto-continue>',
  ].join('\n')
}


export function buildResearchEndedRecoveryInstruction(plan: Extract<ExpertResearchAutoContinuePlan, { kind: 'recover-ended-researchers' }>): string {
  const messages = plan.recoveries.map(recovery => ({
    to: recovery.endedAgentId,
    summary: '恢复原研究员保存与审计',
    message: 'This is a save-only recovery in your existing research context. Your assigned research_artifact_path is ' + recovery.artifactPath + '. Read the declared brief if needed. Reuse your existing browser results and truthful runtime browser audit; save the missing Markdown and Read it back, then return the exact saved path so the runner submits the real audit. Do not browse, restart research, launch agents, or consume a new researcher start. Preserve original source quotations and conditions; if existing evidence is insufficient, save explicit evidence gaps instead of inventing facts, visits, audit events or Google wait state.',
  }))
  return [
    '<expert-research-ended-worker-recovery>',
    'The listed research workers ended without a durable audited handoff. Do not wait for their TaskOutput again or treat historical Google verification text as a current human-verification request.',
    JSON.stringify(plan),
    'Use SendMessage exactly once per listed endedAgentId with the following arguments. It resumes that same worker from its original transcript, including browser results. Never launch a fresh Agent or a replacement researcher for this save-only recovery.',
    ...messages.map(message => JSON.stringify(message)),
    'Preserve every handoff listed in preservedResearcherPaths; do not restart those lanes or open independent review yet. A missing original transcript is an explicit recovery blocker, never permission to fabricate its contents or bypass the research budget.',
    'An actual current human-verification request or active worker must be awaited. Continue to independent review only after every declared handoff is durably saved and the unchanged review admission passes.',
    '</expert-research-ended-worker-recovery>',
  ].join('\n')
}
