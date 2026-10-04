import { describe, expect, test } from "bun:test"
import { readFile as readFileForSourceLibraryTest } from "node:fs/promises"
import {
  matchOpenedResearchSourceLibraryEntries,
  matchResearchSourceLibraryAttempts,
  parseResearchSourceLibrary,
  planResearchSourceLibraryExecutionBatches,
  planResearchSourceLibraryExecutionWave,
  planResearchSourceLibraryTaskPool,
  renderResearchSourceLibraryTaskPoolMarkdown,
  renderResearchSourceLibraryUsageMarkdown,
  evaluateResearchSourceLibraryExecutionProgress,
  findUnattemptedResearchSourceLibraryEntries,
} from "./expertResearchSourceLibraryService.js"

const SOURCE_LIBRARY = [
  "<!-- research-source-library-tier: core -->",
  "### 移动应用、产品数据与 ASO / 增长",
  "- TalkingData：https://www.talkingdata.com/",
  "- Example Research：https://research.example.com/",
  "- Google：https://www.google.com/",
  "",
  "<!-- research-source-library-tier: open -->",
  "### 开放社区与评价补充网络",
  "- B 站：https://www.bilibili.com/",
  "- Google Play：https://play.google.com/",
].join("\n")

describe("research source library usage audit", () => {
  test("classifies only actually opened concrete pages by core and open source tiers", () => {
    const catalog = parseResearchSourceLibrary(SOURCE_LIBRARY)
    const matches = matchOpenedResearchSourceLibraryEntries({
      catalog,
      records: [{
        agentId: "agent-a",
        agentType: "expert-evidence-researcher",
        recordedAt: "2026-08-25T00:00:00.000Z",
        content: "research ledger",
        entries: [
          {
            auditId: "audit-talkingdata",
            target: "https://www.talkingdata.com/",
            finalUrl: "https://www.talkingdata.com/reports/mobile-market",
            status: "opened",
          },
          {
            auditId: "audit-google-search",
            target: "https://www.google.com/search?q=mobile+market",
            finalUrl: "https://www.google.com/search?q=mobile+market",
            kind: "search",
            status: "opened",
          },
          {
            auditId: "audit-research-subdomain",
            target: "https://research.example.com/",
            finalUrl: "https://insights.research.example.com/public-report",
            status: "opened",
          },
          {
            auditId: "audit-bilibili",
            target: "https://www.bilibili.com/",
            finalUrl: "https://www.bilibili.com/video/BV1x",
            status: "opened",
          },
          {
            auditId: "audit-google-play",
            target: "https://play.google.com/",
            finalUrl: "https://play.google.com/store/apps/details?id=com.example.product",
            status: "opened",
          },
        ],
      }],
    })

    expect(matches).toEqual([
      {
        agentId: "agent-a",
        agentType: "expert-evidence-researcher",
        auditId: "audit-talkingdata",
        tier: "core",
        category: "移动应用、产品数据与 ASO / 增长",
        candidateHost: "talkingdata.com",
        openedUrl: "https://www.talkingdata.com/reports/mobile-market",
      },
      {
        agentId: "agent-a",
        agentType: "expert-evidence-researcher",
        auditId: "audit-research-subdomain",
        tier: "core",
        category: "移动应用、产品数据与 ASO / 增长",
        candidateHost: "research.example.com",
        openedUrl: "https://insights.research.example.com/public-report",
      },
      {
        agentId: "agent-a",
        agentType: "expert-evidence-researcher",
        auditId: "audit-bilibili",
        tier: "open",
        category: "开放社区与评价补充网络",
        candidateHost: "bilibili.com",
        openedUrl: "https://www.bilibili.com/video/BV1x",
      },
      {
        agentId: "agent-a",
        agentType: "expert-evidence-researcher",
        auditId: "audit-google-play",
        tier: "open",
        category: "开放社区与评价补充网络",
        candidateHost: "play.google.com",
        openedUrl: "https://play.google.com/store/apps/details?id=com.example.product",
      },
    ])
  })

  test("keeps unmarked user additions in the high-priority core tier", () => {
    const catalog = parseResearchSourceLibrary([
      "### 用户后来补充的站点",
      "- Example：https://example.com/",
    ].join("\n"))

    expect(catalog.entries).toEqual([{
      tier: "core",
      category: "用户后来补充的站点",
      candidateUrl: "https://example.com/",
      candidateHost: "example.com",
      allowSubdomains: false,
    }])
  })

  test("renders a transparent non-blocking receipt and never treats an unattempted candidate as used", () => {
    const catalog = parseResearchSourceLibrary(SOURCE_LIBRARY)
    const markdown = renderResearchSourceLibraryUsageMarkdown(matchOpenedResearchSourceLibraryEntries({
      catalog,
      records: [{
        agentId: "agent-b",
        agentType: "expert-evidence-researcher",
        recordedAt: "2026-08-25T00:00:00.000Z",
        content: "research ledger",
        entries: [{
          auditId: "audit-failed",
          target: "https://www.talkingdata.com/",
          status: "failed",
        }],
      }],
    }))

    expect(markdown).toContain("用户候选来源库实际命中")
    expect(markdown).toContain("公司 PM 核心来源库")
    expect(markdown).toContain("开放补充来源网络")
    expect(markdown).toContain("本轮没有已打开且命中")
    expect(markdown).not.toContain("talkingdata.com")
  })

  test("assigns the whole catalog exactly once across A/B/C and preserves actual attempt states", () => {
    const catalog = parseResearchSourceLibrary([
      "<!-- research-source-library-tier: core -->",
      "### 移动应用、产品数据与 ASO / 增长入口",
      "- TalkingData：https://www.talkingdata.com/",
      "### 中国行业、用户、内容、品牌与公开研究入口",
      "- Industry：https://industry.example.com/",
      "### 投融资、公司、资本市场与战略研究入口",
      "- Strategy：https://strategy.example.com/",
      "",
      "<!-- research-source-library-tier: open -->",
      "### 中文社区、内容、短视频与产品讨论",
      "- B 站：https://www.bilibili.com/",
      "### 海外产品、开发者、社区与内容信号",
      "- Product Hunt：https://www.producthunt.com/",
      "- Reddit：https://www.reddit.com/",
      "- X：https://x.com/",
      "### 应用商店、用户评价与产品口碑",
      "- Google Play：https://play.google.com/",
      "### 趋势、搜索与公开流量 / SEO 线索",
      "- Similarweb：https://www.similarweb.com/",
    ].join("\n"))
    const tasks = planResearchSourceLibraryTaskPool(catalog)

    expect(tasks).toHaveLength(catalog.entries.length)
    expect(new Set(tasks.map((task) => task.candidateUrl))).toEqual(new Set(catalog.entries.map((entry) => entry.candidateUrl)))
    expect(tasks.find((task) => task.candidateHost === "talkingdata.com")?.owner).toBe("competitors")
    expect(tasks.find((task) => task.candidateHost === "industry.example.com")?.owner).toBe("demand-market")
    expect(tasks.find((task) => task.candidateHost === "strategy.example.com")?.owner).toBe("commercialization-channel")
    expect(tasks.find((task) => task.candidateHost === "bilibili.com")?.owner).toBe("demand-market")
    expect(tasks.find((task) => task.candidateHost === "producthunt.com")?.owner).toBe("competitors")
    expect(tasks.find((task) => task.candidateHost === "reddit.com")?.owner).toBe("demand-market")
    expect(tasks.find((task) => task.candidateHost === "x.com")?.owner).toBe("commercialization-channel")
    expect(tasks.find((task) => task.candidateHost === "play.google.com")?.owner).toBe("competitors")
    expect(tasks.find((task) => task.candidateHost === "similarweb.com")?.owner).toBe("commercialization-channel")

    const attempts = matchResearchSourceLibraryAttempts({
      catalog,
      records: [{
        agentId: "agent-a",
        agentType: "expert-evidence-researcher",
        recordedAt: "2026-08-25T00:00:00.000Z",
        content: "research ledger",
        entries: [
          {
            auditId: "audit-talkingdata-opened",
            target: "https://www.talkingdata.com/",
            finalUrl: "https://www.talkingdata.com/reports/mobile-market",
            status: "opened",
          },
          {
            auditId: "audit-bilibili-limited",
            target: "https://www.bilibili.com/video/BV1x",
            status: "access_limited",
            detail: "human verification",
          },
        ],
      }],
    })
    const markdown = renderResearchSourceLibraryTaskPoolMarkdown({ catalog, attempts })

    expect(markdown).toContain("公司 PM 核心来源库 3 个候选入口")
    expect(markdown).toContain("开放补充来源网络 6 个候选入口")
    expect(markdown).toContain("### A：产品与竞品")
    expect(markdown).toContain("### B：需求与市场")
    expect(markdown).toContain("### C：商业化与渠道")
    expect(markdown).toContain("https://www.talkingdata.com/")
    expect(markdown).toContain("同域具体页已打开：https://www.talkingdata.com/reports/mobile-market")
    expect(markdown).toContain("https://www.bilibili.com/")
    expect(markdown).toContain("同域入口已尝试：访问受限（human verification）")
    expect(markdown).toContain("尚未产生浏览回执（不是受限或无价值结论）")
  })

  test('recovers a missing artifact path from the unique dispatch receipt for the same agent', () => {
    const catalog = parseResearchSourceLibrary(SOURCE_LIBRARY)
    const artifactPath = 'commercialization-research/04-channels.md'
    const records = [{
      agentId: 'agent-c-edit',
      agentType: 'expert-evidence-researcher',
      recordedAt: '2026-08-28T02:41:56.789Z',
      content: '已写入：commercialization-research/04-channels.md；状态：已 Read 验证',
      entries: [{
        auditId: 'audit-talkingdata-from-edit',
        target: 'https://www.talkingdata.com/',
        finalUrl: 'https://www.talkingdata.com/',
        status: 'opened' as const,
        kind: 'url' as const,
      }],
    }]
    const dispatches = [{
      artifactPath,
      batchFingerprint: 'batch-c-edit',
      coreEntryCount: 1,
      openEntryCount: 0,
      agentId: 'agent-c-edit',
      dispatchedAt: '2026-08-28T02:37:35.077Z',
    }]

    const attempts = matchResearchSourceLibraryAttempts({ catalog, records, dispatches })
    const opened = matchOpenedResearchSourceLibraryEntries({ catalog, records, dispatches })

    expect(attempts.find((attempt) => attempt.auditId === 'audit-talkingdata-from-edit')?.artifactPath).toBe(artifactPath)
    expect(opened.find((usage) => usage.auditId === 'audit-talkingdata-from-edit')?.artifactPath).toBe(artifactPath)
  })

  test('does not turn a cross-site access-limit redirect into a same-domain source attempt', () => {
    const catalog = parseResearchSourceLibrary(SOURCE_LIBRARY)
    const attempts = matchResearchSourceLibraryAttempts({
      catalog,
      records: [{
        agentId: 'agent-a',
        agentType: 'expert-evidence-researcher',
        recordedAt: '2026-08-26T00:00:00.000Z',
        content: 'research ledger',
        entries: [
          {
            auditId: 'raycast-to-google-sorry',
            target: 'https://www.raycast.com/',
            finalUrl: 'https://www.google.com/sorry/index?continue=https%3A%2F%2Fwww.google.com%2Fsearch',
            status: 'access_limited',
          },
          {
            auditId: 'direct-google-limited',
            target: 'https://www.google.com/trends',
            finalUrl: 'https://www.google.com/sorry/index?continue=https%3A%2F%2Ftrends.google.com%2F',
            status: 'access_limited',
          },
        ],
      }],
    })

    expect(attempts).toEqual([expect.objectContaining({
      auditId: 'direct-google-limited',
      candidateUrl: 'https://www.google.com/',
      targetUrl: 'https://www.google.com/trends',
      status: 'access_limited',
    })])
  })

  test('creates three disjoint execution batches that collectively retain every core source exactly once', () => {
    const categories = ['移动应用、产品数据与 ASO / 增长', '行业、用户、内容与品牌', '投融资、公司与战略研究']
    const catalog = parseResearchSourceLibrary([
      '<!-- research-source-library-tier: core -->',
      ...Array.from({ length: 119 }, (_, index) => [
        '### ' + categories[index % categories.length],
        '- Core ' + index + '：https://core-' + index + '.example.com/',
      ]).flat(),
      '<!-- research-source-library-tier: open -->',
      '### 中文社区、内容与讨论',
      '- B 站：https://www.bilibili.com/',
    ].join('\n'))

    const plan = planResearchSourceLibraryExecutionBatches({
      catalog,
      researcherPaths: [
        'commercialization-research/02-competitors.md',
        'commercialization-research/03-user-needs.md',
        'commercialization-research/04-channels.md',
      ],
    })

    expect(plan).toBeDefined()
    if (!plan) throw new Error('expected canonical A/B/C execution batches')
    expect(plan.batches.map((batch) => batch.artifactPath)).toEqual([
      'commercialization-research/02-competitors.md',
      'commercialization-research/03-user-needs.md',
      'commercialization-research/04-channels.md',
    ])
    const plannedCore = plan.batches.flatMap((batch) => batch.entries).filter((entry) => entry.tier === 'core')
    expect(plannedCore).toHaveLength(119)
    expect(new Set(plannedCore.map((entry) => entry.candidateUrl))).toHaveLength(119)
    expect(new Set(plan.batches.flatMap((batch) => batch.entries.map((entry) => entry.candidateUrl)))).toEqual(new Set(catalog.entries.map((entry) => entry.candidateUrl)))
    expect(plan.batches.find((batch) => batch.owner === 'demand-market')?.entries.some((entry) => entry.candidateHost === 'bilibili.com')).toBe(true)
    expect(planResearchSourceLibraryExecutionBatches({
      catalog,
      researcherPaths: ['commercialization-research/02-competitors.md'],
    })).toBeUndefined()
  })
})


test('keeps source-package dispatch receipts separate from actual core attempts in the audit pool', () => {
  const catalog = parseResearchSourceLibrary([
    '### 产品数据',
    '- https://core.example.com/',
    '### 用户讨论',
    '- https://community.example.com/',
  ].join('\n'))
  const plan = planResearchSourceLibraryExecutionBatches({
    catalog,
    researcherPaths: [
      'commercialization-research/02-competitors.md',
      'commercialization-research/03-user-needs.md',
      'commercialization-research/04-channels.md',
    ],
  })
  expect(plan).toBeDefined()
  const competitors = plan!.batches.find((batch) => batch.owner === 'competitors')!
  const attempts = matchResearchSourceLibraryAttempts({
    catalog,
    records: [{
      agentId: 'agent-a',
      agentType: 'expert-evidence-researcher',
      artifactPath: competitors.artifactPath,
      recordedAt: '2026-08-26T00:00:00.000Z',
      content: 'file receipt only',
      entries: [{
        target: 'https://core.example.com/',
        finalUrl: 'https://core.example.com/pricing',
        status: 'opened',
        kind: 'url',
      }],
    }],
  })
  const dispatches = [{
      artifactPath: competitors.artifactPath,
      batchFingerprint: competitors.batchFingerprint,
      coreEntryCount: competitors.entries.filter((entry) => entry.tier === 'core').length,
      openEntryCount: competitors.entries.filter((entry) => entry.tier === 'open').length,
      agentId: 'agent-a',
      dispatchedAt: '2026-08-26T00:00:00.000Z',
    }]
  const progress = evaluateResearchSourceLibraryExecutionProgress({
    plan: plan!,
    attempts,
    dispatches,
  })

  expect(progress.find((batch) => batch.artifactPath === competitors.artifactPath)).toMatchObject({
    dispatched: true,
    coreAttemptedCount: 1,
    coreOpenedCount: 1,
    coreNotStartedCount: 0,
  })
  expect(progress.find((batch) => batch.owner === 'demand-market')).toMatchObject({
    dispatched: false,
    coreAttemptedCount: 0,
    coreNotStartedCount: 1,
  })
  const markdown = renderResearchSourceLibraryTaskPoolMarkdown({ catalog, attempts, plan: plan!, dispatches })
  expect(markdown).toContain('来源包状态：已分发')
  expect(markdown).toContain('核心候选 1；实际尝试 1；已打开 1')
  expect(markdown).toContain('来源包状态：未分发')
})


test('keeps same-host catalog routes independent and leaves pending routes recoverable', () => {
  const catalog = parseResearchSourceLibrary([
    '<!-- research-source-library-tier: core -->',
    '### 移动应用、产品数据与 ASO / 增长',
    '- Similarweb corporate：https://www.similarweb.com/corp/',
    '- Similarweb root：https://www.similarweb.com/',
    '- Terminal failed：https://failed.example.com/',
    '- Terminal limited：https://limited.example.com/',
    '- Still pending：https://pending.example.com/',
  ].join('\n'))
  const plan = planResearchSourceLibraryExecutionBatches({
    catalog,
    researcherPaths: [
      'commercialization-research/02-competitors.md',
      'commercialization-research/03-user-needs.md',
      'commercialization-research/04-channels.md',
    ],
  })
  expect(plan).toBeDefined()
  const competitors = plan!.batches.find((batch) => batch.owner === 'competitors')!
  const attempts = matchResearchSourceLibraryAttempts({
    catalog,
    records: [{
      agentId: 'researcher-a',
      agentType: 'expert-evidence-researcher',
      artifactPath: competitors.artifactPath,
      recordedAt: '2026-08-27T00:00:00.000Z',
      content: '# ledger',
      entries: [
        { target: 'https://www.similarweb.com/corp/', finalUrl: 'https://www.similarweb.com/corp/ourdata/', status: 'opened', kind: 'url' },
        { target: 'https://failed.example.com/', status: 'failed', kind: 'url' },
        { target: 'https://limited.example.com/', finalUrl: 'https://limited.example.com/login', status: 'access_limited', kind: 'url' },
        { target: 'https://pending.example.com/', status: 'pending', kind: 'url' },
      ],
    }],
  })

  expect(attempts.filter((attempt) => attempt.candidateHost === 'similarweb.com').map((attempt) => attempt.candidateUrl)).toEqual([
    'https://www.similarweb.com/corp/',
  ])
  const missing = findUnattemptedResearchSourceLibraryEntries({ plan: plan!, attempts })
    .flatMap((batch) => batch.entries.map((entry) => entry.candidateUrl))
  expect(missing).toEqual(expect.arrayContaining([
    'https://www.similarweb.com/',
    'https://pending.example.com/',
  ]))
  expect(missing).not.toContain('https://failed.example.com/')
  expect(missing).not.toContain('https://limited.example.com/')
})

test('counts exact source-library targets as terminal attempts even when Playwright classifies them as search', async () => {
  const sourceLibrary = await readFileForSourceLibraryTest('experts/commercialization-research-report/skills/research-source-library/SKILL.md', 'utf8')
  const catalog = parseResearchSourceLibrary(sourceLibrary)
  const plan = planResearchSourceLibraryExecutionBatches({
    catalog,
    researcherPaths: [
      'commercialization-research/02-competitors.md',
      'commercialization-research/03-user-needs.md',
      'commercialization-research/04-channels.md',
    ],
  })
  if (!plan) throw new Error('expected execution plan')

  const artifactPath = 'commercialization-research/02-competitors.md'
  const exactTargets = [
    'http://www2.baidu.com/',
    'http://data.baidu.com/index.html',
    'http://www.google.com/trends',
    'http://index.baidu.com/',
    'http://www.thinkwithgoogle.com/mobileplanet/zh-cn/',
  ]
  const attempts = matchResearchSourceLibraryAttempts({
    catalog,
    records: [{
      agentId: 'researcher-a-wave-8',
      agentType: 'expert-evidence-researcher',
      artifactPath,
      recordedAt: '2026-08-27T14:58:15.000Z',
      content: '# browser audit',
      entries: [
        { auditId: 'baidu-keyword', target: exactTargets[0], finalUrl: 'https://cas.baidu.com/?tpl=www2', status: 'opened', kind: 'search' },
        { auditId: 'baidu-data', target: exactTargets[1], finalUrl: 'chrome-error://chromewebdata/', status: 'failed', kind: 'search' },
        { auditId: 'google-trends-old', target: exactTargets[2], finalUrl: 'https://trends.google.com/trends/', status: 'opened', kind: 'search' },
        { auditId: 'baidu-index', target: exactTargets[3], finalUrl: 'https://index.baidu.com/v2/index.html#/', status: 'opened', kind: 'search' },
        { auditId: 'think-with-google', target: exactTargets[4], finalUrl: 'https://business.google.com/en-all/think/', status: 'opened', kind: 'search' },
        { auditId: 'generic-search', target: 'https://www.google.com/search?q=old+photo+restoration', finalUrl: 'https://www.google.com/search?q=old+photo+restoration', status: 'opened', kind: 'search' },
      ],
    }],
  })

  expect(attempts.map((attempt) => attempt.candidateUrl)).toEqual(expect.arrayContaining(exactTargets))
  expect(attempts.some((attempt) => attempt.auditId === 'generic-search')).toBe(false)
  const missing = findUnattemptedResearchSourceLibraryEntries({ plan, attempts })
    .flatMap((batch) => batch.entries.map((entry) => entry.candidateUrl))
  for (const target of exactTargets) expect(missing).not.toContain(target)
})

test('parses the shipped 119 core plus 30 open routes and distributes them exactly once', async () => {
  const sourceLibrary = await readFileForSourceLibraryTest('experts/commercialization-research-report/skills/research-source-library/SKILL.md', 'utf8')
  const catalog = parseResearchSourceLibrary(sourceLibrary)
  const plan = planResearchSourceLibraryExecutionBatches({
    catalog,
    researcherPaths: [
      'commercialization-research/02-competitors.md',
      'commercialization-research/03-user-needs.md',
      'commercialization-research/04-channels.md',
    ],
  })

  expect(catalog.entries.filter((entry) => entry.tier === 'core')).toHaveLength(119)
  expect(catalog.entries.filter((entry) => entry.tier === 'open')).toHaveLength(30)
  expect(plan?.batches.flatMap((batch) => batch.entries)).toHaveLength(149)
  expect(new Set(plan?.batches.flatMap((batch) => batch.entries.map((entry) => entry.candidateUrl)))).toHaveLength(149)
  expect(plan?.batches.find((batch) => batch.owner === 'competitors')?.entries.some((entry) => entry.candidateHost === 'gitee.com')).toBe(true)
  expect(plan?.batches.find((batch) => batch.owner === 'demand-market')?.entries.some((entry) => entry.candidateHost === 'tieba.baidu.com')).toBe(true)
})


test('plans at most ten still-unattempted source URLs per A/B/C wave and advances only on real terminal outcomes', () => {
  const catalog = parseResearchSourceLibrary([
    '<!-- research-source-library-tier: core -->',
    ...Array.from({ length: 23 }, (_, index) => [
      '### 移动应用、产品数据与 ASO / 增长',
      '- A ' + index + '：https://a-' + index + '.example.com/',
    ]).flat(),
    '### 行业、用户、内容与品牌',
    '- B 0：https://b-0.example.com/',
    '- B 1：https://b-1.example.com/',
    '### 投融资、公司与战略研究',
    '- C 0：https://c-0.example.com/',
  ].join('\n'))
  const plan = planResearchSourceLibraryExecutionBatches({
    catalog,
    researcherPaths: [
      'commercialization-research/02-competitors.md',
      'commercialization-research/03-user-needs.md',
      'commercialization-research/04-channels.md',
    ],
  })
  if (!plan) throw new Error('expected execution plan')

  const firstWave = planResearchSourceLibraryExecutionWave({ plan, attempts: [], maxEntriesPerBatch: 10 })
  expect(firstWave.batches).toHaveLength(3)
  const firstA = firstWave.batches.find((batch) => batch.owner === 'competitors')!
  expect(firstA.entries).toHaveLength(10)
  expect(firstWave.batches.every((batch) => batch.entries.length <= 10)).toBe(true)

  const terminalAttempts = firstA.entries.map((entry, index) => ({
    agentId: 'researcher-a',
    agentType: 'expert-evidence-researcher',
    artifactPath: firstA.artifactPath,
    tier: entry.tier,
    category: entry.category,
    candidateHost: entry.candidateHost,
    candidateUrl: entry.candidateUrl,
    status: index % 3 === 0 ? 'opened' as const : index % 3 === 1 ? 'access_limited' as const : 'failed' as const,
    targetUrl: entry.candidateUrl,
  }))
  const secondWave = planResearchSourceLibraryExecutionWave({ plan, attempts: terminalAttempts, maxEntriesPerBatch: 10 })
  const secondA = secondWave.batches.find((batch) => batch.owner === 'competitors')!
  expect(secondA.entries).toHaveLength(10)
  expect(secondA.entries.some((entry) => firstA.entries.some((first) => first.candidateUrl === entry.candidateUrl))).toBe(false)
  expect(secondA.batchFingerprint).not.toBe(firstA.batchFingerprint)

  const pendingOnly = terminalAttempts.map((attempt) => ({ ...attempt, status: 'pending' as const }))
  const pendingWave = planResearchSourceLibraryExecutionWave({ plan, attempts: pendingOnly, maxEntriesPerBatch: 10 })
  expect(pendingWave.batches.find((batch) => batch.owner === 'competitors')?.entries.map((entry) => entry.candidateUrl)).toEqual(
    firstA.entries.map((entry) => entry.candidateUrl),
  )
})


test('treats an interrupted source audit as terminal without promoting it to a successful source', () => {
  const catalog = parseResearchSourceLibrary([
    '<!-- research-source-library-tier: core -->',
    '### Product research',
    '- https://interrupted.example.com/',
  ].join('\n'))
  const plan = planResearchSourceLibraryExecutionBatches({
    catalog,
    researcherPaths: [
      'commercialization-research/02-competitors.md',
      'commercialization-research/03-user-needs.md',
      'commercialization-research/04-channels.md',
    ],
  })
  expect(plan).toBeDefined()
  const assignedBatch = plan!.batches.find((batch) => batch.entries.length > 0)!
  const attempts = matchResearchSourceLibraryAttempts({
    catalog,
    records: [{
      agentId: 'researcher-interrupted',
      agentType: 'expert-evidence-researcher',
      artifactPath: assignedBatch.artifactPath,
      recordedAt: '2026-09-07T00:00:00.000Z',
      content: 'interrupted receipt',
      entries: [{ target: 'https://interrupted.example.com/', status: 'interrupted', kind: 'url' }],
    }],
  })

  expect(attempts[0]).toMatchObject({ status: 'interrupted' })
  const missing = findUnattemptedResearchSourceLibraryEntries({ plan: plan!, attempts })
    .flatMap((batch) => batch.entries.map((entry) => entry.candidateUrl))
  expect(missing).not.toContain('https://interrupted.example.com/')
  expect(matchOpenedResearchSourceLibraryEntries({ catalog, records: [{
    agentId: 'researcher-interrupted',
    agentType: 'expert-evidence-researcher',
    artifactPath: assignedBatch.artifactPath,
    recordedAt: '2026-09-07T00:00:00.000Z',
    content: 'interrupted receipt',
    entries: [{ target: 'https://interrupted.example.com/', status: 'interrupted', kind: 'url' }],
  }] })).toEqual([])
})

test('counts bounded platform search attempts without treating generic discovery or sibling subdomains as coverage', () => {
  const catalog = parseResearchSourceLibrary('<!-- research-source-library-tier: open -->\n### 社交平台\n- https://tieba.baidu.com/\n- https://weibo.com/\n<!-- research-source-library-tier: core -->\n### 数据\n- https://www.google.com/\n- http://data.weibo.com/')
  const records = [{ agentId: 'b', agentType: 'expert-evidence-researcher', recordedAt: '2026-09-08T00:00:00Z', content: '', entries: [
    { kind: 'search', target: 'https://tieba.baidu.com/f?kw=quicker', status: 'opened' },
    { kind: 'url', target: 'https://s.weibo.com/weibo?q=Quicker', status: 'access_limited' },
    { kind: 'search', target: 'https://www.google.com/search?q=market', status: 'opened' },
  ] }] as any
  const attempts = matchResearchSourceLibraryAttempts({ catalog, records })
  expect(attempts.map(x => x.candidateUrl)).toEqual(['https://tieba.baidu.com/', 'https://weibo.com/'])
  expect(matchOpenedResearchSourceLibraryEntries({ catalog, records })).toEqual([])
})


test('attributes part audits to the assigned lane without counting repeated visits twice', () => {
  const catalog = parseResearchSourceLibrary(SOURCE_LIBRARY)
  const plan = planResearchSourceLibraryExecutionBatches({ catalog, researcherPaths: ['commercialization-research/02-competitors.md', 'commercialization-research/03-user-needs.md', 'commercialization-research/04-channels.md'] })
  const lane = plan.batches.find(batch => batch.entries.some(entry => entry.candidateHost === 'talkingdata.com'))!.artifactPath
  const records = [0, 1].map(i => ({ agentId: 'part-' + i, agentType: 'expert-evidence-researcher', recordedAt: '2026-09-10T00:00:00Z', artifactPath: lane.replace('.md', '.parts/worker-' + i + '.md'), content: '# evidence', entries: [{ target: 'https://www.talkingdata.com/', finalUrl: 'https://www.talkingdata.com/', kind: 'url' as const, status: 'opened' as const }] }))
  const attempts = matchResearchSourceLibraryAttempts({ catalog, records })
  expect(attempts).toHaveLength(2) // retain both real visits
  const progress = evaluateResearchSourceLibraryExecutionProgress({ plan, attempts })
  expect(progress.reduce((count, batch) => count + batch.coreAttemptedCount, 0)).toBe(1)
  expect(attempts[0].artifactPath).toBe(lane)
  expect(attempts[0].status).toBe('opened')
})
