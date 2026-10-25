import { describe, expect, test } from 'bun:test'
import type { ExpertSessionMetadata } from './expertPackRegistryService.js'
import { ExpertResearchAutoContinueService } from './expertResearchAutoContinueService.js'
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
  expect(plans).toEqual([{ kind: 'continue-review' }])
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
  expect(plans).toEqual([{ kind: 'continue-review' }])
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
