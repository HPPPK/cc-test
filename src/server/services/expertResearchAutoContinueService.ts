import { registeredResearchArtifactPaths, researchArtifactRootPath } from '../../services/tools/expertFileFirstResearchProtocol.js'
import * as fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import * as path from 'node:path'
import type { ExpertSessionMetadata } from './expertPackRegistryService.js'
import { hasActiveExpertRuntime } from './expertRuntimeBindingService.js'
import { expertRuntimeSessionStore } from './expertRuntimeSessionStore.js'
import { sessionService } from './sessionService.js'
import { evaluateExpertResearchRequiredRoutes, type ExpertResearchRequiredRouteRecovery } from './expertResearchRouteCompletionService.js'
import { evaluateResearchSourceLibraryExecutionCoverage, matchResearchSourceLibraryAttempts, parseResearchSourceLibrary, planResearchSourceLibraryExecutionBatches, resolveResearchRecordArtifactPath } from './expertResearchSourceLibraryService.js'

const COMMERCIALIZATION_RESEARCH_EXPERT_ID = 'commercialization-research-report'

type AutoContinueCandidate = {
  workDir: string
  expert: ExpertSessionMetadata
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
  settleSourceBatches?: (sessionId: string, batches: FinishedResearchSourceBatch[]) => Promise<void>
}

export type ExpertResearchAutoContinuePlan =
  | { kind: 'continue-review' }
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
  }
  | {
    kind: 'continue-finalize-delivery'
    briefPath: string
    absorptionPath: string
    completionReviewPath: string
    reportPath: string
  }
  | { kind: 'recover-missing-researchers'; missingArtifactPaths: string[] }
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
  const pathApi = path.win32.isAbsolute(workDir) ? path.win32 : path
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
  if (!session) return undefined
  let expert = session.expert ?? await expertRuntimeSessionStore.get(sessionId)
  const workDir = session.workDir || session.projectRoot || session.projectPath
  if (!hasActiveExpertRuntime(expert) || !workDir) return undefined
  if (expert.researchSourceDispatches?.receipts.some((receipt) => !receipt.completedAt)) {
    const { ExpertSessionService } = await import('./expertSessionService.js')
    expert = await new ExpertSessionService().reconcileResearchSourceCompletionNotifications(sessionId) ?? expert
  }
  return { workDir, expert }
}


const defaultDependencies: Dependencies = {
  loadCandidate: loadCandidateFromSession,
  readFile: fs.readFile,
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
  private handler: ExpertResearchAutoContinueHandler | undefined
  // Process-local safety valve, not a completion marker or a new user-data schema.
  // A repaired server always permits a first attempt, including legacy failures.
  private readonly finalizeRetries = new Map<string, {
    progress: string; failedAt?: string; failure?: string; repeats: number; notified: boolean
  }>()

  constructor(private readonly dependencies: Dependencies = defaultDependencies) {}

  setHandler(handler: ExpertResearchAutoContinueHandler): void {
    this.handler = handler
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
    try {
      let plan = await this.resolvePlan(sessionId)
      if (plan?.kind === 'settle-incomplete-source-batches') {
        if (!this.dependencies.settleSourceBatches) return false
        await this.dependencies.settleSourceBatches(sessionId, plan.batches)
        plan = await this.resolvePlan(sessionId)
        if (plan?.kind === 'settle-incomplete-source-batches') return false
      }
      if (!plan) return false

      this.inFlight.add(sessionId)
      try {
        // The next terminal/reconnect signal always re-reads durable state. A
        // model statement such as "I will dispatch F" is not a milestone and
        // must not permanently suppress recovery when no artifact was written.
        const sent = await this.handler(sessionId, plan)
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
    }
  }

  private guardFinalizeRetry(sessionId: string, expert: ExpertSessionMetadata, review: string,
    plan: Extract<ExpertResearchAutoContinuePlan, { kind: 'continue-finalize-delivery' }>): ExpertResearchAutoContinuePlan | undefined {
    const progress = createHash('sha256').update(JSON.stringify({
      draft: expert.templateFillDraft && { templateId: expert.templateFillDraft.templateId,
        fields: expert.templateFillDraft.fields, evidenceAbsorption: expert.templateFillDraft.evidenceAbsorption,
        completionReview: expert.templateFillDraft.completionReview },
      review, reviewPath: expert.reportCompletenessReview?.artifactPath,
      evidence: expert.researchEvidence?.updatedAt, reviewer: expert.researchEvidenceReviewer?.updatedAt,
    })).digest('hex')
    const failures = (expert as ExpertSessionMetadata & { templateFillRepairFailures?: Array<{ failedAt: string; failureFingerprint: string; code?: string }> }).templateFillRepairFailures
    const latest = Array.isArray(failures) ? failures.at(-1) : undefined
    let state = this.finalizeRetries.get(sessionId)
    if (!state || state.progress !== progress) {
      state = { progress, failedAt: latest?.failedAt, failure: latest?.failureFingerprint, repeats: 0, notified: false }
      this.finalizeRetries.set(sessionId, state)
      while (this.finalizeRetries.size > 128) this.finalizeRetries.delete(this.finalizeRetries.keys().next().value!)
      return plan
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

  private async resolvePlan(sessionId: string): Promise<ExpertResearchAutoContinuePlan | undefined> {
    const candidate = await this.dependencies.loadCandidate(sessionId)
    if (!candidate) return undefined
    const { expert, workDir } = candidate
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
    const sourceRecords = (expert.researchEvidence?.records ?? [])
      .filter((record) => sourceAgentTypes.has(record.agentType))
    // Give planned product/user/competitor evidence a turn before draining
    // further catalog waves. Existing active-worker guards still prevent overlaps.
    if (!missingArtifactPaths.length && sourceRecords.length && artifactPolicy.routeCompletion?.mode === 'dynamic-route-status-v2') {
      const routeEvaluation = evaluateExpertResearchRequiredRoutes({
        artifactPolicy,
        researchBriefMarkdown: brief,
        sourceRecords: (expert.researchEvidence?.records ?? [])
          .filter((record) => sourceAgentTypes.has(record.agentType)),
      })
      if (!routeEvaluation.complete) {
        return { kind: 'recover-incomplete-required-routes', recoveries: routeEvaluation.recoveries }
      }
    }

    const sourceLibraryContent = (binding.skills ?? []).find((skill) => skill.skillId === 'research-source-library')?.content
    const sourceLibraryCatalog = sourceLibraryContent ? parseResearchSourceLibrary(sourceLibraryContent) : undefined
    const sourceLibraryPlan = sourceLibraryCatalog?.entries.length
      ? planResearchSourceLibraryExecutionBatches({
          catalog: sourceLibraryCatalog,
          researcherPaths: artifactPolicy.researcherPaths,
        })
      : undefined
    if (sourceLibraryCatalog && sourceLibraryPlan) {
      const attempts = matchResearchSourceLibraryAttempts({
        catalog: sourceLibraryCatalog,
        records: sourceRecords,
        dispatches: sourceDispatches,
      })
      const coverage = evaluateResearchSourceLibraryExecutionCoverage({
        plan: sourceLibraryPlan,
        attempts,
      })
      const recovered = new Set(expert.researchSourceDispatches?.recoveredBatchFingerprints ?? [])
      const dispatchedFingerprints = new Set(
        (expert.researchSourceDispatches?.receipts ?? [])
          .map((receipt) => `${receipt.artifactPath}\n${receipt.batchFingerprint}`),
      )
      const priorReceipt = (batch: typeof coverage.executionWave.batches[number]) =>
        expert.researchSourceDispatches?.receipts.find((receipt) => receipt.artifactPath === batch.artifactPath && receipt.batchFingerprint === batch.batchFingerprint)
      const exhausted = coverage.executionWave.batches.flatMap((batch) => {
        const receipt = priorReceipt(batch)
        return batch.entries.length && receipt?.completedAt && (receipt.retryCount ?? 0) >= 1
          ? [{ artifactPath: batch.artifactPath, batchFingerprint: batch.batchFingerprint, agentId: receipt.agentId, candidateUrls: batch.entries.map((entry) => entry.candidateUrl) }]
          : []
      })
      if (exhausted.length) return { kind: 'settle-incomplete-source-batches', batches: exhausted }
      const dispatchableBatches = coverage.executionWave.batches.filter((batch) => {
        const receipt = priorReceipt(batch)
        return batch.entries.length > 0 && (receipt?.completedAt
          ? (receipt.retryCount ?? 0) < 1
          : !recovered.has(batch.batchFingerprint) && !dispatchedFingerprints.has(`${batch.artifactPath}\n${batch.batchFingerprint}`))
      })
      if (dispatchableBatches.length) {
        return {
          kind: 'recover-undispatched-source-batch',
          recoveries: dispatchableBatches.map((batch) => {
            const planned = sourceLibraryPlan.batches.find((candidate) => candidate.artifactPath === batch.artifactPath)!
            const dispatched = (expert.researchSourceDispatches?.receipts ?? []).some((receipt) => (
              receipt.artifactPath === batch.artifactPath
            ))
            return {
              artifactPath: batch.artifactPath,
              batchFingerprint: batch.batchFingerprint,
              coreEntryCount: planned.entries.filter((entry) => entry.tier === 'core').length,
              openEntryCount: planned.entries.filter((entry) => entry.tier === 'open').length,
              remainingEntryCount: batch.entries.length,
              entries: batch.entries.map((entry) => ({ tier: entry.tier, category: entry.category, candidateUrl: entry.candidateUrl })),
              reason: dispatched ? 'source-package-incomplete' as const : 'source-package-not-dispatched' as const,
            }
          }),
        }
      }
      // A recovery instruction that was accepted is still not evidence. If the
      // same execution wave has no new terminal receipts, wait instead of
      // silently advancing to D or repeatedly re-dispatching an unchanged batch.
      if (!coverage.complete) {
        this.dependencies.logError(
          `[ExpertResearchAutoContinue] Source coverage is incomplete but the current recovery wave is already dispatched for ${sessionId}`,
          {
            missing: coverage.executionWave.batches
              .filter((batch) => batch.entries.length > 0)
              .map((batch) => ({
                artifactPath: batch.artifactPath,
                batchFingerprint: batch.batchFingerprint,
                candidateUrls: batch.entries.map((entry) => entry.candidateUrl),
              })),
          },
        )
        return undefined
      }
    }

    if (missingArtifactPaths.length) {
      return { kind: 'recover-missing-researchers', missingArtifactPaths }
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
                  return {
                    kind: 'continue-initial-render',
                    briefPath: artifactPolicy.briefPath,
                    absorptionPath,
                  }
                }

                const completionReviewPath = artifactPolicy.completionReviewPath
                const reportPath = renderedDraft.completionReview.reportPath
                // Old session metadata did not persist the rendered HTML path.
                // Keep those records compatible without guessing a workspace
                // filename or broadening the output-reviewer's Read surface.
                if (!completionReviewPath || !reportPath) return undefined

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
                  }
                }
                return this.guardFinalizeRetry(sessionId, expert, outputReview, {
                  kind: 'continue-finalize-delivery',
                  briefPath: artifactPolicy.briefPath,
                  absorptionPath,
                  completionReviewPath,
                  reportPath,
                })
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

    return { kind: 'continue-review' }
  }
}

export const expertResearchAutoContinueService = new ExpertResearchAutoContinueService()


