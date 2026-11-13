import { describe, expect, test, spyOn } from 'bun:test'
import type { ExpertSessionMetadata } from './expertPackRegistryService.js'
import { ExpertResearchAutoContinueService, buildResearchReviewContinuationInstruction, buildResearchEndedRecoveryInstruction } from './expertResearchAutoContinueService.js'
import { parseResearchSourceLibrary, planResearchSourceLibraryExecutionBatches } from './expertResearchSourceLibraryService.js'

const researcherPaths = [
  'commercialization-research/02-competitors.md',
  'commercialization-research/03-user-needs.md',
  'commercialization-research/04-channels.md',
]

function candidate(paths: string[] = researcherPaths, reviewerPath?: string) {
  return {
    workDir: 'C:/research',
    expert: {
      mode: 'expert',
      expertId: 'commercialization-research-report',
      expertName: 'Commercialization research',
      packId: 'commercialization-research-report',
      packVersion: '0.13.32-local',
      status: 'active',
      materialRefs: [],
      startedAt: '2026-08-19T00:00:00.000Z',
      updatedAt: '2026-08-19T00:00:00.000Z',
      runtimeBinding: {
        promptSnapshot: 'Commercialization fixture',
        skills: [],
        schemaVersion: 1,
        active: true,
        expertId: 'commercialization-research-report',
        expertName: 'Commercialization research',
        packId: 'commercialization-research-report',
        packVersion: '0.13.32-local',
        hostTools: [],
        tools: [],
        permissions: [],
        activatedAt: '2026-08-19T00:00:00.000Z',
        researchArtifactPolicy: {
          mode: 'markdown-path-only',
          directory: 'commercialization-research',
          briefPath: 'commercialization-research/01-research-brief.md',
          researcherPaths,
          reviewerPath: 'commercialization-research/05-evidence-review.md',
          auditPath: 'commercialization-research/06-browser-audit.md',
          absorptionPath: 'commercialization-research/07-report-field-absorption.md',
          completionReviewPath: 'commercialization-research/08-report-completeness-review.md',
          maxCharacters: 120000,
        },
        researchEvidenceReviewPolicy: {
          reviewerAgentType: 'expert-evidence-reviewer',
          sourceAgentTypes: ['expert-evidence-researcher'],
          maxRecords: 8,
          maxCharactersPerRecord: 120000,
          reviewerEvidenceOnly: true,
        },
        researchEvidenceAbsorptionPolicy: {
          required: true,
          userInteraction: 'none',
          before: 'template-fill',
          reviewerAgentType: 'expert-evidence-reviewer',
          absorberAgentType: 'expert-evidence-absorber',
          sourceAgentTypes: ['expert-evidence-researcher'],
          sourceFieldId: 'SOURCE_ROWS',
          requireAllOpenedSourcesDisposition: true,
          requireSourceFieldMapping: true,
        },
      },
      researchEvidence: {
        updatedAt: '2026-08-19T00:00:00.000Z',
        records: paths.map((artifactPath, index) => ({
          agentId: `researcher-${index}`,
          agentType: 'expert-evidence-researcher',
          recordedAt: '2026-08-19T00:00:00.000Z',
          artifactPath,
          content: '# research',
          entries: [{ target: `https://example${index}.com`, status: 'opened' }],
        })),
      },
      ...(reviewerPath ? {
        researchEvidenceReviewer: {
          reviewer: {
            agentId: 'reviewer-1',
            agentType: 'expert-evidence-reviewer',
            recordedAt: '2026-08-19T00:00:00.000Z',
            artifactPath: reviewerPath,
            content: '# review',
            entries: [],
          },
          updatedAt: '2026-08-19T00:00:00.000Z',
        },
      } : {}),
    } as ExpertSessionMetadata,
  }
}

describe('ExpertResearchAutoContinueService', () => {
  test.each([
    ['/tmp/research', '/tmp/research/commercialization-research/01-research-brief.md'],
    ['C:/research', 'C:\\research\\commercialization-research\\01-research-brief.md'],
    ['\\\\server\\share\\research', '\\\\server\\share\\research\\commercialization-research\\01-research-brief.md'],
  ])('reads persisted artifacts using the workDir path style for %s', async (workDir, briefPath) => {
    const saved = candidate()
    saved.workDir = workDir
    const reads: string[] = []
    const service = new ExpertResearchAutoContinueService({
      loadCandidate: async () => saved,
      readFile: async (filePath) => {
        reads.push(filePath)
        if (filePath !== briefPath) throw new Error('ENOENT')
        return '# saved brief'
      },
      logError: () => {},
    })
    service.setHandler(async () => true)
    expect(await service.tryContinue('path-style')).toBe(true)
    expect(reads).toContain(briefPath)
  })

  test('resumes the D review once when all declared researcher Markdown artifacts are persisted', async () => {
    let resumeCount = 0
    const service = new ExpertResearchAutoContinueService({
      loadCandidate: async () => candidate(researcherPaths),
      readFile: async () => '# non-empty research',
      logError: () => {},
    })
    service.setHandler(async () => {
      resumeCount++
      return true
    })

    await Promise.all([
      service.tryContinue('session-1'),
      service.tryContinue('session-1'),
      service.tryContinue('session-1'),
    ])
    expect(resumeCount).toBe(1)
  })

  test('does not continue an explicitly exited Expert even if its old binding remains', async () => {
    const saved = candidate()
    saved.expert.status = 'exited'
    let sends = 0
    const service = new ExpertResearchAutoContinueService({ loadCandidate: async () => saved, readFile: async () => '# saved brief', logError: () => {} })
    service.setHandler(async () => { sends++; return true })
    expect(await service.tryContinue('exited-expert')).toBe(false)
    expect(sends).toBe(0)
  })

  test('does not recover researcher handoffs before the declared brief exists', async () => {
    let resumeCount = 0
    const service = new ExpertResearchAutoContinueService({
      loadCandidate: async () => candidate(researcherPaths.slice(0, 2)),
      readFile: async (filePath) => {
        if (filePath.endsWith('01-research-brief.md')) throw new Error('ENOENT')
        return '# non-empty research'
      },
      logError: () => {},
    })
    service.setHandler(async () => {
      resumeCount++
      return true
    })

    await service.tryContinue('session-without-brief')

    expect(resumeCount).toBe(0)
  })

  test('retries only missing 04 while its durable handoff is still absent', async () => {
    let resumeCount = 0
    let receivedPlan: unknown
    const service = new ExpertResearchAutoContinueService({
      loadCandidate: async () => candidate(researcherPaths.slice(0, 2)),
      readFile: async () => '# non-empty research',
      logError: () => {},
    })
    service.setHandler(async (_sessionId, plan) => {
      resumeCount++
      receivedPlan = plan
      return true
    })

    await service.tryContinue('session-missing-04')
    await service.tryContinue('session-missing-04')

    expect(resumeCount).toBe(2)
    expect(receivedPlan).toEqual({
      kind: 'recover-missing-researchers',
      missingArtifactPaths: ['commercialization-research/04-channels.md'],
    })
  })

  test('recovers D when an old reviewer receipt exists but 05 is missing on disk', async () => {
    let resumeCount = 0
    const service = new ExpertResearchAutoContinueService({
      loadCandidate: async () => candidate(researcherPaths, 'commercialization-research/05-evidence-review.md'),
      readFile: async (filePath) => {
        if (filePath.endsWith('05-evidence-review.md')) throw new Error('ENOENT')
        return '# non-empty research'
      },
      logError: () => {},
    })
    service.setHandler(async () => {
      resumeCount++
      return true
    })

    await service.tryContinue('session-stale-review')
    expect(resumeCount).toBe(1)
  })

  test('retries E when D is durable but the declared absorption Markdown is still missing', async () => {
    let resumeCount = 0
    let receivedPlan: unknown
    const service = new ExpertResearchAutoContinueService({
      loadCandidate: async () => candidate(researcherPaths, 'commercialization-research/05-evidence-review.md'),
      readFile: async (filePath) => {
        if (filePath.endsWith('07-report-field-absorption.md')) throw new Error('ENOENT')
        return '# non-empty research'
      },
      logError: () => {},
    })
    service.setHandler(async (_sessionId, plan) => {
      resumeCount++
      receivedPlan = plan
      return true
    })

    await service.tryContinue('session-durable-review-missing-absorption')
    await service.tryContinue('session-durable-review-missing-absorption')

    expect(resumeCount).toBe(2)
    expect(receivedPlan).toEqual({
      kind: 'continue-absorption',
      briefPath: 'commercialization-research/01-research-brief.md',
      researcherPaths,
      reviewerPath: 'commercialization-research/05-evidence-review.md',
      auditPath: 'commercialization-research/06-browser-audit.md',
      absorptionPath: 'commercialization-research/07-report-field-absorption.md',
      absorberAgentType: 'expert-evidence-absorber',
    })
  })

  test('continues the initial structured HTML render after 07 is durable', async () => {
    let receivedPlan: unknown
    const service = new ExpertResearchAutoContinueService({
      loadCandidate: async () => candidate(researcherPaths, 'commercialization-research/05-evidence-review.md'),
      readFile: async () => '# non-empty research',
      logError: () => {},
    })
    service.setHandler(async (_sessionId, plan) => {
      receivedPlan = plan
      return true
    })

    await service.tryContinue('session-durable-absorption')

    expect(receivedPlan).toEqual({
      kind: 'continue-initial-render',
      briefPath: 'commercialization-research/01-research-brief.md',
      absorptionPath: 'commercialization-research/07-report-field-absorption.md',
    })
  })

  test('continues the constrained 08 reviewer after an initial HTML draft is durable', async () => {
    let receivedPlan: unknown
    const current = candidate(researcherPaths, 'commercialization-research/05-evidence-review.md')
    Object.assign(current.expert as object, {
      templateFillDraft: {
        templateId: 'commercialization-research-report-v1',
        fields: { REPORT_TITLE: 'Draft' },
        savedAt: '2026-08-20T00:00:00.000Z',
        updatedAt: '2026-08-20T00:00:00.000Z',
        completionReview: {
          initialRenderedAt: '2026-08-20T00:00:00.000Z',
          reportPath: 'C:/research/Quicker-commercialization-research.html',
        },
      },
    })
    const service = new ExpertResearchAutoContinueService({
      loadCandidate: async () => current,
      readFile: async (filePath) => {
        if (filePath.endsWith('08-report-completeness-review.md')) throw new Error('ENOENT')
        return '# non-empty research'
      },
      logError: () => {},
    })
    service.setHandler(async (_sessionId, plan) => {
      receivedPlan = plan
      return true
    })

    await service.tryContinue('session-initial-draft-awaiting-08')

    expect(receivedPlan).toEqual({
      kind: 'continue-output-review',
      briefPath: 'commercialization-research/01-research-brief.md',
      absorptionPath: 'commercialization-research/07-report-field-absorption.md',
      completionReviewPath: 'commercialization-research/08-report-completeness-review.md',
      reportPath: 'C:/research/Quicker-commercialization-research.html',
      reviewerAgentType: 'expert-evidence-output-reviewer',
    })
  })

  test('continues final patch-or-finalize only after this draft has a durable 08 receipt', async () => {
    let receivedPlan: unknown
    const current = candidate(researcherPaths, 'commercialization-research/05-evidence-review.md')
    Object.assign(current.expert as object, {
      templateFillDraft: {
        templateId: 'commercialization-research-report-v1',
        fields: { REPORT_TITLE: 'Draft' },
        savedAt: '2026-08-20T00:00:00.000Z',
        updatedAt: '2026-08-20T00:00:00.000Z',
        completionReview: {
          initialRenderedAt: '2026-08-20T00:00:00.000Z',
          reportPath: 'C:/research/Quicker-commercialization-research.html',
        },
      },
      reportCompletenessReview: {
        agentId: 'output-reviewer-1',
        artifactPath: 'commercialization-research/08-report-completeness-review.md',
        completedAt: '2026-08-20T00:01:00.000Z',
      },
    })
    const service = new ExpertResearchAutoContinueService({
      loadCandidate: async () => current,
      readFile: async () => '# non-empty research',
      logError: () => {},
    })
    service.setHandler(async (_sessionId, plan) => {
      receivedPlan = plan
      return true
    })

    await service.tryContinue('session-awaiting-final-delivery')

    expect(receivedPlan).toEqual({
      kind: 'continue-finalize-delivery',
      briefPath: 'commercialization-research/01-research-brief.md',
      absorptionPath: 'commercialization-research/07-report-field-absorption.md',
      completionReviewPath: 'commercialization-research/08-report-completeness-review.md',
      reportPath: 'C:/research/Quicker-commercialization-research.html',
    })
  })

  test('does not reopen a delivered report even when its 07 research package remains on disk', async () => {
    let resumeCount = 0
    const current = candidate(researcherPaths, 'commercialization-research/05-evidence-review.md')
    Object.assign(current.expert as object, {
      templateFillDelivery: {
        templateId: 'commercialization-research-report-v1',
        reportPath: 'C:/research/Quicker-commercialization-research.html',
        finalizedAt: '2026-08-20T00:02:00.000Z',
      },
    })
    const service = new ExpertResearchAutoContinueService({
      loadCandidate: async () => current,
      readFile: async () => '# non-empty research',
      logError: () => {},
    })
    service.setHandler(async () => {
      resumeCount++
      return true
    })

    await service.tryContinue('session-finalized')

    expect(resumeCount).toBe(0)
  })

})

test.each([undefined, 0, 1])('reviews partial candidates without catalog sweeps or route repair (legacy retry %s)', async (retryCount) => {
  const current = candidate() as any
  current.expert.runtimeBinding.skills = [{ skillId: 'research-source-library', content: '### 产品数据\n- https://unvisited.example.com/' }]
  current.expert.runtimeBinding.researchArtifactPolicy.routeCompletion = { mode: 'dynamic-route-status-v2', requireAttemptedRequiredRoutes: true }
  if (retryCount !== undefined) current.expert.researchSourceDispatches = { receipts: [{ artifactPath: researcherPaths[0], batchFingerprint: 'legacy', agentId: 'ended', retryCount, completedAt: '2026-09-08T00:01:00Z' }] }
  const before = JSON.stringify(current.expert.researchEvidence)
  const plans: unknown[] = []
  const service = new ExpertResearchAutoContinueService({ loadCandidate: async () => current,
    readFile: async (file) => String(file).endsWith('01-research-brief.md') ? '# 用户需求\nB站、YouTube 具体内容取证' : '# audited research',
    settleSourceBatches: async () => { throw new Error('must not synthesize candidate outcomes') }, logError: () => {} })
  service.setHandler(async (_id, plan) => { plans.push(plan); return true })
  expect(await service.tryContinue('partial-library-' + retryCount)).toBe(true)
  expect(plans).toMatchObject([{ kind: 'continue-review' }])
  expect(JSON.stringify(current.expert.researchEvidence)).toBe(before)
})

test('continues to D when an Edit audit is attributable through its dispatch receipt', async () => {
  const current = candidate(researcherPaths) as any
  const sourceLibraryContent = [
    '<!-- research-source-library-tier: core -->',
    '### 投融资、公司与战略研究',
    '- C core：https://core-c.example.com/',
  ].join('\n')
  current.expert.runtimeBinding.skills = [{
    skillId: 'research-source-library',
    title: 'Source library',
    path: 'skills/research-source-library/SKILL.md',
    sha256: 'test',
    content: sourceLibraryContent,
  }]
  current.expert.researchEvidence.records[2] = {
    agentId: 'researcher-c-edit',
    agentType: 'expert-evidence-researcher',
    recordedAt: '2026-08-28T02:41:56.789Z',
    content: '已写入：commercialization-research/04-channels.md；状态：已 Read 验证',
    entries: [{ target: 'https://core-c.example.com/', finalUrl: 'https://core-c.example.com/', status: 'opened', kind: 'url' }],
  }
  const sourcePlan = planResearchSourceLibraryExecutionBatches({
    catalog: parseResearchSourceLibrary(sourceLibraryContent),
    researcherPaths,
  })
  const cBatch = sourcePlan?.batches.find((batch) => batch.artifactPath === researcherPaths[2])
  expect(cBatch).toBeDefined()
  current.expert.researchSourceDispatches = {
    receipts: [{
      artifactPath: researcherPaths[2],
      batchFingerprint: cBatch!.batchFingerprint,
      coreEntryCount: 1,
      openEntryCount: 0,
      agentId: 'researcher-c-edit',
      dispatchedAt: '2026-08-28T02:37:35.077Z',
    }],
    recoveredBatchFingerprints: [cBatch!.batchFingerprint],
  }
  const plans: any[] = []
  const service = new ExpertResearchAutoContinueService({
    loadCandidate: async () => current,
    readFile: async () => '# non-empty research',
    logError: () => {},
  })
  service.setHandler(async (_sessionId, plan) => {
    plans.push(plan)
    return true
  })

  expect(await service.tryContinue('session-edit-orphan')).toBe(true)
  expect(plans).toMatchObject([{ kind: 'continue-review' }])
})

test('does not persist a recovery fingerprint when the parent instruction is merely accepted', async () => {
  const current = candidate(researcherPaths) as any
  current.expert.runtimeBinding.skills = [{
    skillId: 'research-source-library', title: 'Source library', path: 'skills/research-source-library/SKILL.md', sha256: 'test',
    content: '### 移动应用、产品数据与 ASO / 增长\n- https://core.example.com/',
  }]
  current.expert.researchEvidence.records[0].entries = [{ target: 'https://unrelated.example.com/', status: 'opened', kind: 'url' }]
  const service = new ExpertResearchAutoContinueService({
    loadCandidate: async () => current,
    readFile: async () => '# non-empty research',
    logError: () => {},
  })
  service.setHandler(async () => true)

  expect(await service.tryContinue('session-recovery-instruction-accepted')).toBe(true)
  expect(current.expert.researchSourceDispatches?.recoveredBatchFingerprints).toBeUndefined()
})


// Exercise the production queue, not just direct calls to tryContinue().
const flushQueue = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

test('Expert completion waits for readiness checks and is not emitted for an internal continuation', async () => {
  const blocked = deferredCheck()
  let complete = false
  const settled: string[] = []
  const service = new ExpertResearchAutoContinueService({
    loadCandidate: async () => { await blocked.promise; return complete ? undefined : candidate() },
    readFile: async () => '# saved', logError: () => {},
  })
  service.setHandler(async () => true)
  service.setSettledHandler(async id => { settled.push(id) })
  service.schedule('expert-notification')
  await flushQueue()
  expect(settled).toEqual([])
  blocked.resolve()
  await flushQueue()
  expect(settled).toEqual([])
  service.setHandler(async () => false)
  service.schedule('expert-notification')
  await flushQueue()
  expect(settled).toEqual([]) // A failed continuation send is not completion.
  complete = true
  service.schedule('expert-notification')
  await flushQueue()
  expect(settled).toEqual(['expert-notification'])
})

test('Expert completion is withheld when readiness fails or another check was queued', async () => {
  const blocked = deferredCheck()
  let checks = 0
  const settled: string[] = []
  const service = new ExpertResearchAutoContinueService({
    loadCandidate: async () => {
      checks++
      if (checks === 1) { await blocked.promise; return undefined }
      throw new Error('cannot establish completion')
    },
    readFile: async () => '# saved', logError: () => {},
  })
  service.setHandler(async () => true)
  service.setSettledHandler(async id => { settled.push(id) })
  service.schedule('queued-completion')
  await flushQueue()
  service.schedule('queued-completion')
  blocked.resolve()
  await flushQueue()
  expect(checks).toBe(2)
  expect(settled).toEqual([])
})
function deferredCheck() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

test('schedule coalesces notifications during a readiness check and remains usable afterwards', async () => {
  const blocked = deferredCheck()
  let checks = 0
  let resumes = 0
  const service = new ExpertResearchAutoContinueService({
    loadCandidate: async () => {
      checks++
      if (checks === 1) { await blocked.promise; return undefined }
      return candidate()
    },
    readFile: async () => '# saved',
    logError: () => {},
  })
  service.setHandler(async () => { resumes++; return true })
  service.schedule('queued-session')
  await flushQueue()
  for (let i = 0; i < 5; i++) service.schedule('queued-session')
  await flushQueue()
  blocked.resolve()
  await flushQueue()
  expect(checks).toBe(2)
  expect(resumes).toBe(1)
  service.schedule('queued-session')
  await flushQueue()
  expect(resumes).toBe(2)
})

test('schedule preserves an idle notification arriving while its busy handler is returning false', async () => {
  const blocked = deferredCheck()
  let calls = 0
  const service = new ExpertResearchAutoContinueService({
    loadCandidate: async () => candidate(), readFile: async () => '# saved', logError: () => {},
  })
  service.setHandler(async () => {
    calls++
    if (calls === 1) { await blocked.promise; return false }
    return true
  })
  service.schedule('busy-parent')
  await flushQueue()
  service.schedule('busy-parent')
  await flushQueue()
  blocked.resolve()
  await flushQueue()
  expect(calls).toBe(2)
  await flushQueue()
  expect(calls).toBe(2) // No spin or self-generated retry without a new event.
})

test('schedule drains a queued signal after a failed readiness check', async () => {
  const blocked = deferredCheck()
  let checks = 0
  let resumes = 0
  const errors: unknown[] = []
  const service = new ExpertResearchAutoContinueService({
    loadCandidate: async () => {
      if (++checks === 1) { await blocked.promise; throw new Error('temporary read failure') }
      return candidate()
    },
    readFile: async () => '# saved', logError: (...args) => { errors.push(args) },
  })
  service.setHandler(async () => { resumes++; return true })
  service.schedule('failed-check')
  await flushQueue()
  service.schedule('failed-check')
  await flushQueue()
  blocked.resolve()
  await flushQueue()
  expect(errors.length).toBe(1)
  expect(resumes).toBe(1)
})


test('legacy finalized metadata cannot stop recovery when its HTML is missing', async () => {
  const current = candidate(researcherPaths, 'commercialization-research/05-evidence-review.md')
  current.expert.templateFillDelivery = { templateId: 'commercialization-research-report-v1', reportPath: 'C:/research/missing.html', finalizedAt: '2026-08-20T00:02:00Z' }
  let reads = 0
  let resumed = false
  const service = new ExpertResearchAutoContinueService({ loadCandidate: async () => current, readFile: async (file) => {
    reads++
    if (String(file).endsWith('missing.html')) throw new Error('ENOENT')
    return '# Valid research artifact'
  }, logError: () => {} })
  service.setHandler(async () => { resumed = true; return true })
  await service.tryContinue('legacy-missing-report')
  expect(reads).toBeGreaterThan(0)
  expect(resumed).toBe(true)
})


test('report delivery retry guard only stops repeated new failures without progress and resumes after changed review', async () => {
  const current = candidate(researcherPaths, 'commercialization-research/05-evidence-review.md')
  Object.assign(current.expert, {
    templateFillDraft: { templateId: 'v1', fields: { REPORT_TITLE: 'Draft' }, savedAt: '2026-08-20T00:00:00Z', updatedAt: '2026-08-20T00:00:00Z',
      completionReview: { initialRenderedAt: '2026-08-20T00:00:00Z', reportPath: 'C:/research/report.html' } },
    reportCompletenessReview: { agentId: 'F', artifactPath: 'commercialization-research/08-report-completeness-review.md', completedAt: '2026-08-20T00:01:00Z' },
  })
  let review = '# No patch needed'
  const plans: Array<{ kind: string }> = []
  const service = new ExpertResearchAutoContinueService({
    loadCandidate: async () => current,
    readFile: async (file) => file.endsWith('08-report-completeness-review.md') ? review : '# existing artifact',
    logError: () => {},
  })
  service.setHandler(async (_id, plan) => { plans.push(plan); return true })
  const fail = (n: number) => Object.assign(current.expert, { templateFillRepairFailures: [{
    kind: 'template-fill', code: 'BAD_REQUEST', payloadFingerprint: 'different-payload-' + n,
    failureFingerprint: 'same-schema-error', failedAt: '2026-08-20T00:02:0' + n + 'Z',
  }] })
  fail(0) // Legacy errors must not prevent a first attempt after a fixed server restarts.
  await service.tryContinue('stalled-report')
  await service.tryContinue('stalled-report') // A duplicate signal is not a new failed Write.
  expect(plans.every((p) => p.kind === 'continue-finalize-delivery')).toBe(true)
  for (let n = 1; n <= 3; n++) { fail(n); await service.tryContinue('stalled-report') }
  expect(plans.at(-1)?.kind).toBe('report-delivery-stalled')
  const notified = plans.length
  await service.tryContinue('stalled-report')
  expect(plans).toHaveLength(notified)
  current.expert.reportCompletenessReview!.completedAt = '2026-08-20T00:04:00Z'
  await service.tryContinue('stalled-report') // Repeating the same review receipt is not content progress.
  expect(plans).toHaveLength(notified)
  review = '# Updated review: source-supported correction explained'
  await service.tryContinue('stalled-report')
  expect(plans.at(-1)?.kind).toBe('continue-finalize-delivery')
  current.expert.templateFillDelivery = { templateId: 'v1', reportPath: 'C:/research/report.html', finalizedAt: '2026-08-20T00:05:00Z' }
  const completed = plans.length
  await service.tryContinue('stalled-report')
  expect(plans).toHaveLength(completed)
})


test('continues from all registered parts without requiring the three nonexistent root files', async () => {
  const parts = researcherPaths.flatMap((base, lane) => Array.from({ length: 4 }, (_, i) => base.replace('.md', '.parts/worker-' + lane + '-' + i + '.md')))
  const interrupted = 'commercialization-research/02-competitors.parts/interrupted.md'
  const state = candidate([...parts, interrupted], 'commercialization-research/05-evidence-review.md')
  state.expert.runtimeBinding!.researchArtifactPolicy!.researcherParts = true
  let plan: unknown
  const reads: string[] = []
  const service = new ExpertResearchAutoContinueService({ loadCandidate: async () => state, readFile: async (filePath) => {
    const normalized = filePath.replace(/\\/g, '/')
    reads.push(normalized)
    if (normalized.endsWith(interrupted) || researcherPaths.some(base => normalized.endsWith(base)) || normalized.endsWith('07-report-field-absorption.md')) throw new Error('ENOENT')
    return '# evidence'
  }, logError: () => {} })
  service.setHandler(async (_id, next) => { plan = next; return true })
  await service.tryContinue('parts-only')
  expect(plan).toMatchObject({ kind: 'continue-absorption', researcherPaths: parts })
  for (const part of parts) expect(reads.some(file => file.endsWith(part))).toBe(true)
})

test('recovery consults the actual review admission and returns its bounded repair instead of review', async () => {
  const saved = candidate(researcherPaths)
  const plans: any[] = []
  const service = new ExpertResearchAutoContinueService({
    loadCandidate: async () => saved, readFile: async () => '# saved', logError: () => {},
    reviewAdmission: async () => { throw Object.assign(new Error('Repair saved evidence; do not browse again'), { code: 'EXPERT_RESEARCH_TARGETED_FOLLOWUP_REQUIRED' }) },
  })
  service.setHandler(async (_id, plan) => { plans.push(plan); return true })
  await service.tryContinue('quality-repair')
  expect(plans[0]).toMatchObject({ kind: 'recover-quality-checkpoint', code: 'EXPERT_RESEARCH_TARGETED_FOLLOWUP_REQUIRED', instruction: 'Repair saved evidence; do not browse again' })
})

test('unchanged review recovery stops after bounded attempts and resumes after real evidence changes', async () => {
  const saved = candidate(researcherPaths)
  const plans: any[] = []
  const service = new ExpertResearchAutoContinueService({ loadCandidate: async () => saved, readFile: async () => '# saved', logError: () => {},
    reviewAdmission: async () => { throw Object.assign(new Error('same gap'), { code: 'EXPERT_RESEARCH_TARGETED_FOLLOWUP_REQUIRED' }) },
  })
  service.setHandler(async (_id, plan) => { plans.push(plan); return true })
  for (let i = 0; i < 8; i++) await service.tryContinue('bounded-quality-repair')
  expect(plans.filter(p => p.kind === 'recover-quality-checkpoint')).toHaveLength(3)
  expect(plans.filter(p => p.kind === 'research-continuation-stalled')).toHaveLength(1)
  saved.expert.researchEvidence!.records[0]!.recordedAt = new Date().toISOString()
  const before = plans.length
  await service.tryContinue('bounded-quality-repair')
  expect(plans).toHaveLength(before)
  saved.expert.researchEvidence!.records[0]!.content += '\nReal repaired evidence'
  await service.tryContinue('bounded-quality-repair')
  expect(plans.at(-1).kind).toBe('recover-quality-checkpoint')
})

test('an admitted but pending researcher is awaited without review or recovery messages', async () => {
  const service = new ExpertResearchAutoContinueService({ loadCandidate: async () => candidate(researcherPaths), readFile: async () => '# saved', logError: () => {},
    reviewAdmission: async () => { throw Object.assign(new Error('wait'), { code: 'EXPERT_RESEARCH_SUBAGENTS_PENDING' }) },
  })
  let sent = false
  const settled: string[] = []
  service.setSettledHandler(async id => { settled.push(id) })
  service.setHandler(async () => { sent = true; return true })
  expect(await service.tryContinue('pending-quality')).toBe(false)
  expect(sent).toBe(false)
  expect(settled).toEqual([])
})

test('missing handoff recovery cannot loop indefinitely after rejected malformed saves', async () => {
  const plans: any[] = []
  const service = new ExpertResearchAutoContinueService({ loadCandidate: async () => candidate([]), readFile: async () => '# saved', logError: () => {} })
  service.setHandler(async (_id, plan) => { plans.push(plan); return true })
  for (let i = 0; i < 7; i++) await service.tryContinue('missing-format-repair')
  expect(plans.filter(p => p.kind === 'recover-missing-researchers')).toHaveLength(3)
  expect(plans.filter(p => p.kind === 'research-continuation-stalled')).toHaveLength(1)
})

test('review continuation lists real registered parts and excludes a missing optional browser audit', async () => {
  const parts = researcherPaths.map((base, i) => base.replace('.md', '.parts/worker-' + i + '.md'))
  const state = candidate(parts)
  state.expert.runtimeBinding!.researchArtifactPolicy!.researcherParts = true
  let plan: any
  const service = new ExpertResearchAutoContinueService({ loadCandidate: async () => state, readFile: async file => {
    if (file.endsWith('06-browser-audit.md')) throw new Error('ENOENT')
    return '# saved'
  }, logError: () => {} })
  service.setHandler(async (_id, next) => { plan = next; return true })
  await service.tryContinue('real-review-paths')
  expect(plan.researcherPaths).toEqual(parts)
  expect(plan.auditPath).toBeUndefined()
  const instruction = buildResearchReviewContinuationInstruction(plan)
  expect(instruction).not.toContain('06-browser-audit.md')
  for (const part of parts) expect(instruction).toContain(part)
})

test('missing handoff with a live dispatch waits without consuming recovery retries', async () => {
  const state = candidate(researcherPaths.slice(1))
  state.expert.researchSourceDispatches = { receipts: [{ artifactPath: researcherPaths[0]!, batchFingerprint: 'A', coreEntryCount: 1, openEntryCount: 0, agentId: 'working-A', dispatchedAt: '2026-08-19T00:00:00Z' }] }
  const plans: any[] = []
  const service = new ExpertResearchAutoContinueService({ loadCandidate: async () => state, readFile: async () => '# saved', logError: () => {} })
  service.setHandler(async (_id, plan) => { plans.push(plan); return true })
  const settled: string[] = []
  service.setSettledHandler(async id => { settled.push(id) })
  for (let i = 0; i < 8; i++) expect(await service.tryContinue('live-worker')).toBe(false)
  expect(plans).toEqual([])
  expect(settled).toEqual([])
  state.expert.researchSourceDispatches.receipts[0]!.completedAt = '2026-08-19T00:01:00Z'
  expect(await service.tryContinue('live-worker')).toBe(true)
  expect(plans).toMatchObject([{ kind: 'recover-ended-researchers', recoveries: [{ artifactPath: researcherPaths[0], endedAgentId: 'working-A', reason: 'ended-without-saved-handoff' }], preservedResearcherPaths: researcherPaths.slice(1) }])
})

test('current human verification suppresses missing recovery until resolved without consuming retries', async () => {
  let pending = true
  const plans: any[] = []
  const service = new ExpertResearchAutoContinueService({ loadCandidate: async () => candidate([]), readFile: async () => '# saved', logError: () => {}, hasPendingHumanVerification: () => pending })
  service.setHandler(async (_id, plan) => { plans.push(plan); return true })
  const settled: string[] = []
  service.setSettledHandler(async id => { settled.push(id) })
  for (let i = 0; i < 8; i++) expect(await service.tryContinue('verification-wait')).toBe(false)
  expect(plans).toEqual([])
  expect(settled).toEqual([])
  pending = false
  await service.tryContinue('verification-wait')
  expect(plans).toMatchObject([{ kind: 'recover-missing-researchers' }])
})

test('ended missing worker recovery is targeted, deduplicated and bounded by actual failed replacement terminals', async () => {
  const state = candidate(researcherPaths.slice(1))
  const receipt: NonNullable<ExpertSessionMetadata['researchSourceDispatches']>['receipts'][number] = { artifactPath: researcherPaths[0]!, batchFingerprint: 'A', coreEntryCount: 1, openEntryCount: 0, agentId: 'ended-0', dispatchedAt: '2026-08-19T00:00:00Z', completedAt: '2026-08-19T00:01:00Z' }
  state.expert.researchSourceDispatches = { receipts: [receipt] }
  const originalEvidence = JSON.stringify(state.expert.researchEvidence)
  const plans: any[] = []
  const service = new ExpertResearchAutoContinueService({ loadCandidate: async () => state, readFile: async () => '# saved', logError: () => {} })
  service.setHandler(async (_id, plan) => { plans.push(plan); return true })
  await service.tryContinue('ended-target')
  for (let i = 0; i < 8; i++) await service.tryContinue('ended-target')
  expect(plans).toHaveLength(1)
  expect(plans[0]).toMatchObject({ kind: 'recover-ended-researchers', preservedResearcherPaths: researcherPaths.slice(1) })
  for (let i = 1; i <= 3; i++) {
    receipt.agentId = 'replacement-' + i
    receipt.retryCount = i
    receipt.completedAt = undefined
    for (let n = 0; n < 5; n++) await service.tryContinue('ended-target')
    receipt.completedAt = '2026-08-19T00:02:0' + i + 'Z'
    await service.tryContinue('ended-target')
  }
  expect(plans.filter(p => p.kind === 'recover-ended-researchers')).toHaveLength(3)
  expect(plans.filter(p => p.kind === 'research-continuation-stalled')).toHaveLength(1)
  expect(plans.some(p => p.kind === 'continue-review')).toBe(false)
  expect(JSON.stringify(state.expert.researchEvidence)).toBe(originalEvidence)
})


test('a replacement dispatch suppresses recovery from an older terminal receipt for its lane', async () => {
  const state = candidate(researcherPaths.slice(1))
  state.expert.researchSourceDispatches = { receipts: [
    { artifactPath: researcherPaths[0]!, batchFingerprint: 'A', coreEntryCount: 1, openEntryCount: 0, agentId: 'old-ended', dispatchedAt: '2026-08-19T00:00:00Z', completedAt: '2026-08-19T00:01:00Z' },
    { artifactPath: researcherPaths[0]!, batchFingerprint: 'A-followup', coreEntryCount: 0, openEntryCount: 0, agentId: 'replacement-active', dispatchedAt: '2026-08-19T00:02:00Z' },
  ] }
  const service = new ExpertResearchAutoContinueService({ loadCandidate: async () => state, readFile: async () => '# saved', logError: () => {} })
  service.setHandler(async () => { throw new Error('must await replacement, no parent instruction') })
  expect(await service.tryContinue('replacement-running')).toBe(false)
})

test('a rejected recovery send remains eligible and saved target advances through the existing review admission', async () => {
  const state = candidate(researcherPaths.slice(1))
  state.expert.researchSourceDispatches = { receipts: [{ artifactPath: researcherPaths[0]!, batchFingerprint: 'A', coreEntryCount: 1, openEntryCount: 0, agentId: 'ended-A', dispatchedAt: '2026-08-19T00:00:00Z', completedAt: '2026-08-19T00:01:00Z' }] }
  let sent = false
  let admissions = 0
  const plans: any[] = []
  const service = new ExpertResearchAutoContinueService({ loadCandidate: async () => state, readFile: async () => '# saved', logError: () => {}, reviewAdmission: async () => { admissions++ } })
  service.setHandler(async (_id, plan) => { plans.push(plan); return sent })
  expect(await service.tryContinue('busy-recovery')).toBe(false)
  sent = true
  expect(await service.tryContinue('busy-recovery')).toBe(true)
  expect(plans.map(p => p.kind)).toEqual(['recover-ended-researchers', 'recover-ended-researchers'])
  expect(admissions).toBe(0)
  state.expert.researchEvidence!.records.push(candidate([researcherPaths[0]!]).expert.researchEvidence!.records[0]!)
  expect(await service.tryContinue('busy-recovery')).toBe(true)
  expect(plans.at(-1).kind).toBe('continue-review')
  expect(admissions).toBe(1)
})

test('ended recovery instruction preserves saved lanes and requires truthful bounded save and readback', () => {
  const instruction = buildResearchEndedRecoveryInstruction({ kind: 'recover-ended-researchers',
    recoveries: [{ artifactPath: researcherPaths[0]!, endedAgentId: 'ended-A', reason: 'ended-without-saved-handoff' }], preservedResearcherPaths: researcherPaths.slice(1) })
  for (const path of researcherPaths) expect(instruction).toContain(path)
  expect(instruction).toContain('SendMessage')
  expect(instruction).toContain('\"to\":\"ended-A\"')
  expect(instruction).toContain('Never launch a fresh Agent')
  expect(instruction).toContain('save-only')
  expect(instruction).toContain('Do not browse')
  expect(instruction).toContain('existing browser results')
  expect(instruction).toContain('Read it back')
  expect(instruction).toContain('Do not browse')
  expect(instruction).toContain('unchanged review admission passes')
})

test('same-agent save-only recovery counts distinct terminal notifications and ignores receipt timestamp churn', async () => {
  const state = Object.assign(candidate(researcherPaths.slice(1)), { terminalNotifications: [
    { taskId: 'same-A', status: 'completed' as const, timestamp: '2026-08-19T00:01:00Z' },
  ] })
  const receipt = { artifactPath: researcherPaths[0]!, batchFingerprint: 'A', coreEntryCount: 1, openEntryCount: 0, agentId: 'same-A', dispatchedAt: '2026-08-19T00:00:00Z', completedAt: '2026-08-19T00:01:00Z' }
  state.expert.researchSourceDispatches = { receipts: [receipt] }
  const plans: any[] = []
  const service = new ExpertResearchAutoContinueService({ loadCandidate: async () => state, readFile: async () => '# saved', logError: () => {} })
  service.setHandler(async (_id, plan) => { plans.push(plan); return true })
  await service.tryContinue('same-worker-recovery')
  expect(plans[0]).toMatchObject({ kind: 'recover-ended-researchers', recoveries: [{ endedAgentId: 'same-A', endedAt: '2026-08-19T00:01:00Z' }] })
  receipt.completedAt = '2026-08-19T00:01:30Z'
  for (let i = 0; i < 6; i++) await service.tryContinue('same-worker-recovery')
  expect(plans).toHaveLength(1)
  for (let i = 2; i <= 4; i++) {
    state.terminalNotifications.push({ taskId: 'same-A', status: 'completed' as const, timestamp: '2026-08-19T00:0' + i + ':00Z' })
    await service.tryContinue('same-worker-recovery')
    await service.tryContinue('same-worker-recovery')
  }
  expect(plans.filter(plan => plan.kind === 'recover-ended-researchers')).toHaveLength(3)
  expect(plans.filter(plan => plan.kind === 'research-continuation-stalled')).toHaveLength(1)
})

test('runtime lifecycle recovers targeted workers without source receipts and awaits same-agent save-only resumes', async () => {
  const worker: { agentId: string; artifactPath: string; state: 'running' | 'ended'; generation: number } = { agentId: 'targeted-A', artifactPath: researcherPaths[0]!, state: 'running', generation: 1 }
  const state = Object.assign(candidate(researcherPaths.slice(1)), { workerLifecycles: [worker] })
  const plans: any[] = []
  const service = new ExpertResearchAutoContinueService({ loadCandidate: async () => state, readFile: async () => '# saved', logError: () => {} })
  service.setHandler(async (_id, plan) => { plans.push(plan); return true })
  expect(await service.tryContinue('targeted-lifecycle')).toBe(false)
  worker.state = 'ended'
  expect(await service.tryContinue('targeted-lifecycle')).toBe(true)
  expect(plans[0]).toMatchObject({ kind: 'recover-ended-researchers', recoveries: [{ endedAgentId: 'targeted-A', endedAt: 'runtime:1' }] })
  for (let generation = 2; generation <= 4; generation++) {
    worker.state = 'running'
    worker.generation = generation
    for (let n = 0; n < 5; n++) expect(await service.tryContinue('targeted-lifecycle')).toBe(false)
    worker.state = 'ended'
    await service.tryContinue('targeted-lifecycle')
    await service.tryContinue('targeted-lifecycle')
  }
  expect(plans.filter(plan => plan.kind === 'recover-ended-researchers')).toHaveLength(3)
  expect(plans.filter(plan => plan.kind === 'research-continuation-stalled')).toHaveLength(1)
})

test('running runtime worker overrides an old completed dispatch receipt and terminal notification', async () => {
  const state = Object.assign(candidate(researcherPaths.slice(1)), {
    workerLifecycles: [{ agentId: 'same-A', artifactPath: researcherPaths[0]!, state: 'running' as const, generation: 2 }],
    terminalNotifications: [{ taskId: 'same-A', status: 'completed' as const, timestamp: '2026-08-19T00:01:00Z' }],
  })
  state.expert.researchSourceDispatches = { receipts: [{ artifactPath: researcherPaths[0]!, batchFingerprint: 'A', coreEntryCount: 1, openEntryCount: 0, agentId: 'same-A', dispatchedAt: '2026-08-19T00:00:00Z', completedAt: '2026-08-19T00:01:00Z' }] }
  const plans: any[] = []
  const service = new ExpertResearchAutoContinueService({ loadCandidate: async () => state, readFile: async () => '# saved', logError: () => {} })
  service.setHandler(async (_id, plan) => { plans.push(plan); return true })
  expect(await service.tryContinue('stale-receipt-running')).toBe(false)
  expect(plans).toEqual([])
})


test('actual budget lifecycle resumes only unsaved A after a released Google gate, then admits saved A/B/C', async () => {
  const { CommercializationResearchBudgetService } = await import('./commercializationResearchBudgetService.js')
  const { PlaywrightTool } = await import('../../tools/PlaywrightTool/PlaywrightTool.js')
  const state = candidate(researcherPaths.slice(1))
  const budget = new CommercializationResearchBudgetService()
  const now = Date.parse(state.expert.runtimeBinding!.activatedAt)
  budget.reserve('joined-recovery', state.expert, { action: 'reserve-researcher', agentId: 'original-A', artifactPath: researcherPaths[0] }, now)
  const result = PlaywrightTool.mapToolResultToToolResultBlockParam({ url: 'https://www.baidu.com/s?wd=photo', title: 'Results', text: 'Actual public material', links: [], steps: [], durationMs: 1, truncated: false, accessLimited: false, verificationHistory: [{ detail: 'EXPERT_HUMAN_VERIFICATION_PENDING: Google old gate' }] }, 'released')
  expect(String(result.content)).toContain('requiresUserAction=false')
  expect(PlaywrightTool.inputSchema.safeParse({ actions: [] }).success).toBe(false)
  budget.finish('joined-recovery', state.expert, 'original-A')
  const plans: string[] = []
  let admitted = 0
  const service = new ExpertResearchAutoContinueService({
    loadCandidate: async () => ({ ...state, workerLifecycles: budget.getWorkerLifecycles('joined-recovery', state.expert) }),
    readFile: async () => '# existing file', logError: (_message, error) => { throw error },
    hasPendingHumanVerification: () => false, reviewAdmission: async () => { admitted++ },
  })
  service.setHandler(async (_session, plan) => { plans.push(plan.kind); if (plan.kind === 'recover-ended-researchers') {
    const instruction = buildResearchEndedRecoveryInstruction(plan)
    expect(instruction).toContain('SendMessage')
    expect(instruction).toContain('original-A')
    expect(instruction).not.toContain('dispatch exactly one')
    expect(plan.preservedResearcherPaths).toEqual(researcherPaths.slice(1))
  }; return true })
  expect(await service.tryContinue('joined-recovery')).toBe(true)
  budget.reserve('joined-recovery', state.expert, { action: 'reserve-researcher', agentId: 'original-A', artifactPath: researcherPaths[0] }, now + 99999999)
  expect(await service.tryContinue('joined-recovery')).toBe(false)
  expect(admitted).toBe(0)
  budget.finish('joined-recovery', state.expert, 'original-A')
  state.expert.researchEvidence!.records.push({ ...state.expert.researchEvidence!.records[0]!, agentId: 'original-A', artifactPath: researcherPaths[0]! })
  expect(await service.tryContinue('joined-recovery')).toBe(true)
  expect(plans).toEqual(['recover-ended-researchers', 'continue-review'])
  expect(admitted).toBe(1)
})

test('a terminal notification after actual worker start recovers a failure before any audit was submitted', async () => {
  const startedAt = Date.parse('2026-08-19T00:00:00Z')
  const worker = { agentId: 'no-audit-A', artifactPath: researcherPaths[0]!, state: 'running' as const, generation: 1, startedAt }
  const state = Object.assign(candidate(researcherPaths.slice(1)), {
    workerLifecycles: [worker],
    terminalNotifications: [{ taskId: worker.agentId, status: 'failed' as const, timestamp: '2026-08-19T00:01:00Z' }],
  })
  const plans: any[] = []
  const service = new ExpertResearchAutoContinueService({ loadCandidate: async () => state, readFile: async () => '# saved', logError: () => {} })
  service.setHandler(async (_id, plan) => { plans.push(plan); return true })
  expect(await service.tryContinue('no-audit-terminal')).toBe(true)
  expect(plans[0]).toMatchObject({ kind: 'recover-ended-researchers', recoveries: [{ endedAgentId: worker.agentId, endedAt: 'runtime:1' }] })
  worker.startedAt = Date.parse('2026-08-19T00:02:00Z')
  worker.generation = 2
  expect(await service.tryContinue('no-audit-terminal')).toBe(false)
  expect(plans).toHaveLength(1)
})


test('default recovery loader refuses foreign session metadata and unrelated Experts before any task/history reads', async () => {
  const { sessionService } = await import('./sessionService.js')
  const state = candidate()
  const getSession = spyOn(sessionService, 'getSession')
  const notifications = spyOn(sessionService, 'getSessionTaskNotifications').mockResolvedValue([])
  try {
    const service = new ExpertResearchAutoContinueService()
    service.setHandler(async () => { throw new Error('Unrelated session must never continue') })
    getSession.mockResolvedValue({ ...state, id: 'foreign-session' } as never)
    expect(await service.tryContinue('requested-session')).toBe(false)
    expect(notifications).not.toHaveBeenCalled()
    state.expert.runtimeBinding!.expertId = 'unrelated-expert'
    getSession.mockResolvedValue({ ...state, id: 'requested-session' } as never)
    expect(await service.tryContinue('requested-session')).toBe(false)
    expect(notifications).not.toHaveBeenCalled()
  } finally { getSession.mockRestore(); notifications.mockRestore() }
})


test('initial rendering stops identical new tool failures, ignores duplicate signals, and resumes on real progress', async () => {
  const current = { ...candidate(researcherPaths, 'commercialization-research/05-evidence-review.md'), messages: [] as import('./sessionService.js').MessageEntry[] }
  let absorption = '# unchanged fields'
  const plans: Array<{ kind: string }> = []
  const service = new ExpertResearchAutoContinueService({ loadCandidate: async () => current, readFile: async file => file.endsWith('07-report-field-absorption.md') ? absorption : '# saved', logError: () => {} })
  service.setHandler(async (_id, plan) => { plans.push(plan); return true })
  const fail = (id: string) => current.messages.push(
    { id, type: 'tool_use', timestamp: id, content: [{ type: 'tool_use', id, name: 'Bash', input: { command: 'claude expert-template-fill --data-stdin' } }] },
    { id: id + '-result', type: 'tool_result', timestamp: id, content: [{ type: 'tool_result', tool_use_id: id, is_error: true, content: 'EXPERT_RESEARCH_BUDGET_REJECTED: missing identity' }] },
  )
  let settled = 0
  service.setSettledHandler(async () => { settled++ })
  fail('legacy')
  await service.tryContinue('initial-failure')
  for (let i = 0; i < 5; i++) await service.tryContinue('initial-failure')
  expect(plans.every(plan => plan.kind === 'continue-initial-render')).toBe(true)
  for (let i = 1; i <= 3; i++) { fail('new-' + i); await service.tryContinue('initial-failure') }
  expect(plans.at(-1)?.kind).toBe('initial-render-stalled')
  const stopped = plans.length
  await service.tryContinue('initial-failure')
  expect(plans).toHaveLength(stopped)
  expect(settled).toBe(0)
  current.messages.push({ id: 'internal-summary', type: 'user', timestamp: 'later', isHumanInput: false, isMeta: true, content: 'Internal continuation' })
  await service.tryContinue('initial-failure')
  expect(plans).toHaveLength(stopped)
  absorption += '\nCorrected fields'
  await service.tryContinue('initial-failure')
  expect(plans.at(-1)?.kind).toBe('continue-initial-render')
  for (let i = 4; i <= 6; i++) { fail('new-' + i); await service.tryContinue('initial-failure') }
  expect(plans.at(-1)?.kind).toBe('initial-render-stalled')
  current.messages.push({ id: 'human-retry', type: 'user', timestamp: 'now', isHumanInput: true, content: 'Please retry after repair' })
  await service.tryContinue('initial-failure')
  expect(plans.at(-1)?.kind).toBe('continue-initial-render')
})
