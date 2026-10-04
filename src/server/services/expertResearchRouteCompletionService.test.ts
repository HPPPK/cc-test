import { describe, expect, test } from 'bun:test'
import { evaluateExpertResearchRequiredRoutes } from './expertResearchRouteCompletionService.js'
import type { ExpertResearchAuditEntry } from './expertResearchCompletionService.js'
import type { ExpertResearchArtifactPolicy } from './expertResearchArtifactPolicyService.js'

const artifactPolicy: ExpertResearchArtifactPolicy = {
  mode: 'markdown-path-only',
  directory: 'commercialization-research',
  briefPath: 'commercialization-research/01-research-brief.md',
  researcherPaths: [
    'commercialization-research/02-competitors.md',
    'commercialization-research/03-user-needs.md',
    'commercialization-research/04-channels.md',
  ],
  reviewerPath: 'commercialization-research/05-evidence-review.md',
  auditPath: 'commercialization-research/06-browser-audit.md',
  maxCharacters: 90_000,
  routeCompletion: { mode: 'dynamic-route-status-v2', requireAttemptedRequiredRoutes: true },
}

const brief = [
  '# Research brief',
  '### Route: cn-video-user-signal',
  '- Owner report: commercialization-research/03-user-needs.md',
  '- Required route: yes',
  '- Evidence field: user-demand',
  '- Goal: Read concrete Chinese video-community user evidence.',
  '- First route: Open a concrete Bilibili video page and extract visible text.',
  '- Fallback route: Open a concrete V2EX discussion for the same user-demand field and extract visible text.',
  '- Completion bar: A concrete page supports the user-demand field, or both routes are truthfully recorded as limited.',
  '- Primary target host: bilibili.com',
  '- Fallback target host: v2ex.com',
  '### Route: global-video-user-signal',
  '- Owner report: commercialization-research/03-user-needs.md',
  '- Required route: yes',
  '- Evidence field: user-demand',
  '- Goal: Read concrete overseas video-community user evidence.',
  '- First route: Open a concrete YouTube video page and extract visible text.',
  '- Fallback route: Open a concrete Product Hunt page for the same user-demand field and extract visible text.',
  '- Completion bar: A concrete page supports the user-demand field, or both routes are truthfully recorded as limited.',
  '- Primary target host: youtube.com',
  '- Fallback target host: producthunt.com',
  '### Route: optional-candidate',
  '- Owner report: commercialization-research/04-channels.md',
  '- Goal: Optional later distribution lead.',
  '- First route: Search a future channel.',
  '- Fallback route: Search another future channel.',
  '- Completion bar: Optional only.',
].join('\n')

function researcher(entries: ExpertResearchAuditEntry[]) {
  return [{
    agentId: 'research-user-needs',
    agentType: 'expert-evidence-researcher',
    recordedAt: '2026-08-24T00:00:00.000Z',
    artifactPath: 'commercialization-research/03-user-needs.md',
    content: '# user research',
    entries,
  }]
}

describe('dynamic required Expert research routes', () => {
  test('uses the requested target host when a Bilibili navigation is redirected to Bing and requires the same-field fallback', () => {
    const result = evaluateExpertResearchRequiredRoutes({
      artifactPolicy,
      researchBriefMarkdown: brief,
      sourceRecords: researcher([{
        kind: 'url',
        target: 'https://www.bilibili.com/video/BV1GF411G7cb/',
        finalUrl: 'https://www.bing.com/search?q=Quicker+middle+click',
        status: 'access_limited',
        actionTypes: ['navigate', 'wait'],
      }]),
    })

    expect(result.complete).toBe(false)
    expect(result.recoveries).toContainEqual(expect.objectContaining({
      artifactPath: 'commercialization-research/03-user-needs.md',
      routeId: 'cn-video-user-signal',
      nextStep: 'attempt-fallback',
      primaryTargetHost: 'bilibili.com',
      fallbackTargetHost: 'v2ex.com',
    }))
    expect(result.recoveries).toContainEqual(expect.objectContaining({
      routeId: 'global-video-user-signal',
      nextStep: 'attempt-primary',
      primaryTargetHost: 'youtube.com',
    }))
  })

  test('does not treat a missing YouTube browser record as completed merely because other browsing happened', () => {
    const result = evaluateExpertResearchRequiredRoutes({
      artifactPolicy,
      researchBriefMarkdown: brief,
      sourceRecords: researcher([{
        kind: 'url',
        target: 'https://www.v2ex.com/t/123',
        finalUrl: 'https://www.v2ex.com/t/123',
        status: 'opened',
        actionTypes: ['navigate', 'wait', 'extract'],
      }]),
    })

    expect(result.complete).toBe(false)
    expect(result.recoveries).toContainEqual(expect.objectContaining({
      routeId: 'global-video-user-signal',
      nextStep: 'attempt-primary',
      primaryTargetHost: 'youtube.com',
    }))
  })

  test('allows a bounded evidence gap only after both primary and same-field fallback were actually attempted and limited', () => {
    const result = evaluateExpertResearchRequiredRoutes({
      artifactPolicy,
      researchBriefMarkdown: brief,
      sourceRecords: researcher([
        { kind: 'url', target: 'https://www.bilibili.com/video/BV1GF411G7cb/', status: 'access_limited', actionTypes: ['navigate', 'wait'] },
        { kind: 'url', target: 'https://www.v2ex.com/t/123', status: 'access_limited', actionTypes: ['navigate', 'wait'] },
        { kind: 'url', target: 'https://www.youtube.com/watch?v=abc', status: 'access_limited', actionTypes: ['navigate', 'wait'] },
        { kind: 'url', target: 'https://www.producthunt.com/posts/example', status: 'failed', actionTypes: ['navigate', 'wait'] },
      ]),
    })

    expect(result).toMatchObject({ complete: true, recoveries: [] })
    expect(result.routes).toEqual(expect.arrayContaining([
      expect.objectContaining({ routeId: 'cn-video-user-signal', status: 'evidence-gap-after-fallback' }),
      expect.objectContaining({ routeId: 'global-video-user-signal', status: 'evidence-gap-after-fallback' }),
    ]))
  })

  test('requires an extract for an opened concrete required route but does not impose checks on ordinary candidates', () => {
    const oneOpenOnly = evaluateExpertResearchRequiredRoutes({
      artifactPolicy,
      researchBriefMarkdown: brief,
      sourceRecords: researcher([{
        kind: 'url', target: 'https://www.bilibili.com/video/BV1GF411G7cb/', status: 'opened', actionTypes: ['navigate', 'wait'],
      }]),
    })
    expect(oneOpenOnly.recoveries).toContainEqual(expect.objectContaining({
      routeId: 'cn-video-user-signal',
      nextStep: 'extract-primary',
    }))

    const extracted = evaluateExpertResearchRequiredRoutes({
      artifactPolicy,
      researchBriefMarkdown: brief,
      sourceRecords: researcher([
        { kind: 'url', target: 'https://www.bilibili.com/video/BV1GF411G7cb/', status: 'opened', actionTypes: ['navigate', 'wait', 'extract'] },
        { kind: 'url', target: 'https://www.youtube.com/watch?v=abc', status: 'opened', actionTypes: ['navigate', 'wait', 'extract'] },
      ]),
    })
    expect(extracted).toMatchObject({ complete: true, recoveries: [] })
  })
})


describe('format-independent planned evidence and bounded completion', () => {
  test('a Chinese route matrix cannot silently become zero required research routes', () => {
    const result = evaluateExpertResearchRequiredRoutes({ artifactPolicy, researchBriefMarkdown: '# 调研任务\n| B：用户需求 | B站、知乎、YouTube 具体内容取证 |\n', sourceRecords: [] })
    expect(result.complete).toBe(false)
    expect(result.routes.map((route) => route.primaryTargetHost)).toEqual(expect.arrayContaining(['bilibili.com', 'zhihu.com', 'youtube.com']))
  })
  test('a social homepage or search landing is not a completed concrete-page extract', () => {
    const result = evaluateExpertResearchRequiredRoutes({ artifactPolicy, researchBriefMarkdown: brief, sourceRecords: researcher([
      { kind: 'url', target: 'https://www.bilibili.com/', status: 'opened', actionTypes: ['navigate', 'extract'] },
      { kind: 'url', target: 'https://www.youtube.com/results?search_query=quicker', status: 'opened', actionTypes: ['navigate', 'extract'] },
    ]) })
    expect(result.complete).toBe(false)
    expect(result.recoveries).toHaveLength(2)
  })
  test('a real product search with a recorded no-result is a bounded attempt, not an invented website failure', () => {
    const records = researcher([
      { kind: 'search', target: 'site:youtube.com Quicker 用户评价', query: 'site:youtube.com Quicker 用户评价', finalUrl: 'https://www.bing.com/search?q=site%3Ayoutube.com+Quicker', searchEngine: 'Bing', searchResultStatus: 'results_observed', status: 'opened', actionTypes: ['navigate', 'extract'] },
      { kind: 'url', target: 'https://www.producthunt.com/posts/quicker', status: 'opened', actionTypes: ['navigate', 'extract'] },
      { kind: 'url', target: 'https://www.bilibili.com/video/BV123/', status: 'opened', actionTypes: ['navigate', 'extract'] },
    ])
    records[0]!.content = '# 用户调研\nYouTube：真实检索 Quicker，未找到相关视频；不声称平台受限。'
    const result = evaluateExpertResearchRequiredRoutes({ artifactPolicy, researchBriefMarkdown: brief, sourceRecords: records })
    expect(result.complete).toBe(true)
    expect(result.routes.find((route) => route.primaryTargetHost === 'youtube.com')?.status).toBe('fallback-succeeded')
  })
  test('two homepage visits do not substitute for targeted research', () => {
    const entries: ExpertResearchAuditEntry[] = [{ kind: 'url', target: 'https://www.youtube.com/', status: 'opened', actionTypes: ['navigate', 'extract'] }]
    const records = [...researcher(entries), ...researcher(entries).map((r) => ({ ...r, agentId: 'bounded-retry' }))]
    const result = evaluateExpertResearchRequiredRoutes({ artifactPolicy, researchBriefMarkdown: '# B 用户证据\nYouTube 视频取证', sourceRecords: records })
    expect(result.complete).toBe(false)
    expect(result.routes[0]?.status).toBe('primary-needs-extract')
  })
})


test('bounded unresolved depth is explicitly visible to the reviewer, not disguised as website denial', async () => {
  const { formatExpertResearchRouteEvaluation } = await import('./expertResearchRouteCompletionService.js')
  const result = evaluateExpertResearchRequiredRoutes({ artifactPolicy, researchBriefMarkdown: 'YouTube 视频取证', sourceRecords: [
    ...researcher([{ kind: 'url', target: 'https://www.youtube.com/', status: 'opened' }]),
    ...researcher([{ kind: 'url', target: 'https://www.youtube.com/', status: 'opened' }]).map((r) => ({ ...r, agentId: 'retry' })),
  ] })
  expect(formatExpertResearchRouteEvaluation(result)).toContain('unresolved-after-bounded-attempts')
  expect(formatExpertResearchRouteEvaluation(result)).toContain('不代表网站受限或已完成具体取证')
})


test('merged homepage receipts still require a targeted attempt', () => {
  const records = researcher([
    { auditId: 'playwright:initial-call:0', kind: 'url', target: 'https://www.youtube.com/', status: 'opened' },
    { auditId: 'playwright:retry-call:0', kind: 'url', target: 'https://www.youtube.com/', status: 'opened' },
  ])
  const result = evaluateExpertResearchRequiredRoutes({ artifactPolicy, researchBriefMarkdown: 'YouTube 视频取证', sourceRecords: records })
  expect(result.routes[0]?.status).toBe('primary-needs-extract')
  expect(result.complete).toBe(false)
})


test('a bounded primary attempt offers fallback rather than dropping it', () => {
  const result = evaluateExpertResearchRequiredRoutes({ artifactPolicy, researchBriefMarkdown: 'YouTube 视频取证', sourceRecords: researcher([
    { auditId: 'playwright:one:0', kind: 'url', target: 'https://www.youtube.com/watch?v=one', status: 'opened' },
    { auditId: 'playwright:two:0', kind: 'url', target: 'https://www.youtube.com/watch?v=two', status: 'opened' },
  ]) })
  expect(result.routes[0]?.status).toBe('fallback-required')
  expect(result.complete).toBe(false)
})

test('failed primary followed by repeated unproductive fallback visits terminates with a truthful gap', () => {
  const result = evaluateExpertResearchRequiredRoutes({ artifactPolicy, researchBriefMarkdown: 'YouTube 视频取证', sourceRecords: researcher([
    { auditId: 'playwright:primary:0', kind: 'url', target: 'https://www.youtube.com/', status: 'access_limited' },
    ...Array.from({ length: 5 }, (_, n): ExpertResearchAuditEntry => ({ auditId: 'playwright:fallback-' + n + ':0', kind: 'url', target: 'https://www.producthunt.com/', status: 'opened' })),
  ]) })
  expect(result.complete).toBe(true)
  expect(result.routes[0]?.status).toBe('unresolved-after-bounded-attempts')
})

test('a later fallback failure is not masked by an earlier homepage opening', () => {
  const result = evaluateExpertResearchRequiredRoutes({ artifactPolicy, researchBriefMarkdown: 'YouTube 视频取证', sourceRecords: researcher([
    { kind: 'url', target: 'https://www.youtube.com/', status: 'failed' },
    { kind: 'url', target: 'https://www.producthunt.com/', status: 'opened' },
    { kind: 'url', target: 'https://www.producthunt.com/posts/product', status: 'failed' },
  ]) })
  expect(result.complete).toBe(true)
  expect(result.routes[0]?.status).toBe('evidence-gap-after-fallback')
})


test('several pages inside one script remain one targeted call, not exhausted retries', () => {
  const result = evaluateExpertResearchRequiredRoutes({ artifactPolicy, researchBriefMarkdown: 'YouTube 视频取证', sourceRecords: researcher([
    { auditId: 'playwright:one-call:0:script:0', kind: 'url', target: 'https://www.youtube.com/watch?v=one', status: 'opened' },
    { auditId: 'playwright:one-call:0:script:1', kind: 'url', target: 'https://www.youtube.com/watch?v=two', status: 'opened' },
  ]) })
  expect(result.routes[0]?.status).toBe('primary-needs-extract')
  expect(result.complete).toBe(false)
})


test('a planned query on an engine homepage does not count as an executed product search', () => {
  const result = evaluateExpertResearchRequiredRoutes({ artifactPolicy, researchBriefMarkdown: 'YouTube 视频取证', sourceRecords: researcher([
    ...[1, 2].map((id): ExpertResearchAuditEntry => ({ auditId: 'playwright:home-' + id + ':0', kind: 'search', target: 'site:youtube.com Quicker', query: 'site:youtube.com Quicker', finalUrl: 'https://www.google.com/', status: 'opened', searchResultStatus: 'entry_opened', actionTypes: ['navigate', 'extract'] })),
  ]) })
  expect(result.routes[0]?.status).toBe('primary-not-attempted')
})


test('uses evidence spread across independent parts for the same planned routes', () => {
  const original = researcher([
    { kind: 'url', target: 'https://www.bilibili.com/video/BV1GF411G7cb/', status: 'opened', actionTypes: ['navigate', 'extract'] },
    { kind: 'url', target: 'https://www.youtube.com/watch?v=abc', status: 'opened', actionTypes: ['navigate', 'extract'] },
  ])
  const parts = original[0].entries.map((entry, i) => ({ ...original[0], agentId: 'worker-' + i, artifactPath: 'commercialization-research/03-user-needs.parts/worker-' + i + '.md', entries: [entry] }))
  expect(evaluateExpertResearchRequiredRoutes({ artifactPolicy: { ...artifactPolicy, researcherParts: true }, researchBriefMarkdown: brief, sourceRecords: parts }).routes.map(route => route.status))
    .toEqual(evaluateExpertResearchRequiredRoutes({ artifactPolicy, researchBriefMarkdown: brief, sourceRecords: original }).routes.map(route => route.status))
})
