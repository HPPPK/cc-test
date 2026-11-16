import { expect, test } from 'bun:test'
import { parseResearchSourceLibrary } from './expertResearchSourceLibraryService.js'
import { buildResearchSourceSelection, normalizeResearchSourceSelection, renderResearchSourceSelectionMarkdown } from './expertResearchSourceSelection.js'

const paths = ['research/02.md', 'research/03.md', 'research/04.md']
const catalog = parseResearchSourceLibrary('<!-- research-source-library-tier: core -->\n### 数据\n- 数据：https://data.example.com/\n<!-- research-source-library-tier: open -->\n### 用户\n- 社区：https://forum.example.com/\n- 商店：https://store.example.com/')
const lanes = ['competitors', 'user-needs', 'channels'] as const
const plan = () => ({ version: 1, lanes: lanes.map(lane => ({ lane, coreConsidered: [{ candidateUrl: 'https://data.example.com/', decision: lane === 'channels' ? 'selected' : 'deferred', reason: '本线具体用户内容优先，核心数据按问题取舍。' }], coreRationale: '核心库适合作背景，本线先从具体公开内容取证。', picks: [{ candidateUrl: lane === 'channels' ? 'https://data.example.com/' : 'https://forum.example.com/', purpose: '回答本线具体证据问题', reason: '该来源类别与任务和报告字段相关。' }] })) })
const brief = (value: unknown) => '# 用户产品方向\n```expert-source-selection\n' + JSON.stringify(value) + '\n```'
const build = (value = plan(), records: any[] = []) => buildResearchSourceSelection({ brief: brief(value), catalog, researcherPaths: paths, records })

test('small source plans retain core reasoning, catalog provenance and unvisited status without an all-site queue', () => {
  const result = build()
  expect(result.lanes).toHaveLength(3)
  expect(result.lanes[0]!.picks[0]).toMatchObject({ tier: 'open', status: 'not_visited' })
  expect(result.lanes[2]!.picks[0]).toMatchObject({ tier: 'core' })
  expect(result.lanes[0]!.coreRationale).toContain('背景')
  expect(result.unattemptedLanes).toEqual(paths)
})

test('plan errors identify fields rather than allowing arbitrary catalog URLs, duplicate lanes or unbounded picks', () => {
  expect(() => buildResearchSourceSelection({ brief: '# no plan', catalog, researcherPaths: paths, records: [] })).toThrow('expert-source-selection')
  for (const change of [
    (v: any) => { v.lanes[0].picks[0].candidateUrl = 'https://outside.example.com/' },
    (v: any) => { v.lanes[0].coreRationale = '' },
    (v: any) => { v.lanes[0].picks = Array(4).fill(v.lanes[0].picks[0]) },
    (v: any) => { v.lanes[1].lane = 'competitors' },
  ]) { const v = plan(); change(v); expect(() => build(v)).toThrow() }
  expect(() => buildResearchSourceSelection({ brief: brief(plan()) + '\n' + brief(plan()), catalog, researcherPaths: paths, records: [] })).toThrow()
})

test('actual opened/limited outcomes are counted per lane; merely mentioning a source in a query is not a visit', () => {
  const records = [{ agentId: 'b', agentType: 'expert-evidence-researcher', artifactPath: 'research/03.parts/b.md', recordedAt: '2026-11-09', content: '', entries: [
    { target: 'https://forum.example.com/thread/1', finalUrl: 'https://forum.example.com/thread/1', status: 'access_limited', kind: 'url' },
    { target: 'forum.example.com user reviews', finalUrl: 'https://www.bing.com/search?q=forum.example.com', status: 'opened', kind: 'search' },
  ] }]
  const result = build(plan(), records)
  expect(result.lanes[1]!.picks[0].status).toBe('access_limited')
  expect(result.unattemptedLanes).toEqual([paths[0], paths[2]])
  expect(result.lanes[0]!.picks[0].status).toBe('not_visited')
})

test('one selected route attempt suffices; fallback choices do not become a new visitation quota', () => {
  const value = plan(); value.lanes[0]!.picks.push({ candidateUrl: 'https://store.example.com/', purpose: '同字段备用来源路线', reason: '首路线失败时使用具体商店页面。' })
  const result = build(value, [{ agentId: 'a', agentType: 'expert-evidence-researcher', artifactPath: paths[0], recordedAt: '2026-11-09', content: '', entries: [{ target: 'https://forum.example.com/post/2', status: 'opened', kind: 'url' }] }])
  expect(result.unattemptedLanes).not.toContain(paths[0])
  expect(result.lanes[0]!.picks[1].status).toBe('not_visited')
  expect(normalizeResearchSourceSelection(JSON.parse(JSON.stringify(result)))).toEqual(result)
  expect(normalizeResearchSourceSelection(null)).toBeUndefined()
})

 test('a catalog example path may lead to a relevant page on that selected platform without claiming the example itself was opened', () => {
  const specialized = parseResearchSourceLibrary('<!-- research-source-library-tier: core -->\n### 数据\n- 网站示例：https://data.example.com/website/sample.test\n<!-- research-source-library-tier: open -->\n### 数据\n- 数据根页：https://data.example.com/')
  const value = plan(); for (const lane of value.lanes) { lane.picks[0]!.candidateUrl = 'https://data.example.com/website/sample.test'; lane.coreConsidered[0]!.candidateUrl = 'https://data.example.com/website/sample.test'; lane.coreConsidered[0]!.decision = 'selected' }
  const result = buildResearchSourceSelection({ brief: brief(value), catalog: specialized, researcherPaths: paths, records: [{ agentId: 'c', agentType: 'expert-evidence-researcher', artifactPath: paths[2], recordedAt: '2026-11-09', content: '', entries: [{ target: 'https://data.example.com/website/product.test', status: 'opened', kind: 'url' }] }] })
  expect(result.lanes[2]!.picks[0].status).toBe('opened')
  expect(result.lanes[2]!.picks[0].attemptedUrls).toEqual(['https://data.example.com/website/product.test'])
})

test('invalid or oversized plans and malformed transport contexts fail closed with no invented attempts', () => {
  for (const value of [{ version: 2, lanes: [] }, { version: 1, lanes: [] }, { ...plan(), lanes: plan().lanes.map(row => ({ ...row, picks: [{ candidateUrl: 'file:///private/data', purpose: '具体证据问题', reason: '必须使用公开候选入口。' }] })) }]) expect(() => build(value as any)).toThrow()
  expect(() => buildResearchSourceSelection({ brief: '```expert-source-selection\ninvalid json\n```', catalog, researcherPaths: paths, records: [] })).toThrow('JSON')
  expect(() => buildResearchSourceSelection({ brief: '```expert-source-selection\n' + ' '.repeat(16001) + '\n```', catalog, researcherPaths: paths, records: [] })).toThrow()
  const valid = build()
  for (const mutate of [
    (v: any) => { v.version = 2 },
    (v: any) => { v.lanes[0].artifactPath = '' },
    (v: any) => { v.lanes[0].picks[0].status = 'verified-without-audit' },
    (v: any) => { v.lanes[0].picks[0].candidateUrl = 'file:///private/data' },
    (v: any) => { v.lanes[0].picks[0].attemptedUrls = [null] },
  ]) { const bad = JSON.parse(JSON.stringify(valid)); mutate(bad); expect(normalizeResearchSourceSelection(bad)).toBeUndefined() }
})

 test('core consideration must name real core entries and cannot relabel an open store/community as core', () => {
  for (const mutate of [
    (v: any) => { v.lanes[0].coreConsidered = [] },
    (v: any) => { v.lanes[0].coreConsidered[0].candidateUrl = 'https://forum.example.com/' },
  ]) { const v = plan(); mutate(v); expect(() => build(v)).toThrow('coreConsidered') }
  expect(build().lanes[0]!.coreConsidered[0]).toMatchObject({ candidateUrl: 'https://data.example.com/', decision: 'deferred' })
})

 test('selected-route audit is human-readable without restoring the whole-catalog completion gate', () => {
  const markdown = renderResearchSourceSelectionMarkdown(build())
  expect(markdown).toContain('本轮相关选源与执行对账')
  expect(markdown).toContain('deferred')
  expect(markdown).toContain('not_visited')
  expect(markdown).not.toContain('全部入口必须')
  expect(markdown).toContain('https://data.example.com/')
})

test('an explicitly selected core route cannot be silently skipped just because an open fallback was visited', () => {
  const value = plan(); value.lanes[2]!.picks.push({ candidateUrl: 'https://forum.example.com/', purpose: '补充公开渠道与分发材料', reason: '补充入口可提供具体路径观察，不取代已选核心路线。' })
  const records: any[] = [{ agentId: 'c', agentType: 'expert-evidence-researcher', artifactPath: paths[2], recordedAt: '2026-11-09', content: '', entries: [{ target: 'https://forum.example.com/thread/1', kind: 'url', status: 'opened' }] }]
  expect(build(value, records).unattemptedLanes).toContain(paths[2])
  value.lanes[2]!.coreConsidered[0]!.decision = 'deferred'
  value.lanes[2]!.picks.shift()
  expect(build(value, records).unattemptedLanes).not.toContain(paths[2])
})

test('reports every invalid lane URL at once with exact catalog alternatives', () => {
  const value = plan()
  value.lanes[0]!.picks[0]!.candidateUrl = 'http://forum.example.com/unknown-route'
  value.lanes[1]!.coreConsidered[0]!.candidateUrl = 'http://data.example.com/unknown-route'
  value.lanes[2]!.picks[0]!.candidateUrl = 'https://outside.example.com/'
  let message = ''
  try { build(value) } catch (error) { message = (error as Error).message }
  expect(message).toContain('competitors.picks[0].candidateUrl')
  expect(message).toContain('user-needs.coreConsidered[0].candidateUrl')
  expect(message).toContain('channels.picks[0].candidateUrl')
  expect(message).toContain('https://forum.example.com/')
  expect(message).toContain('https://data.example.com/')
  expect(message).toContain('一次修复')
  // Suggestions are guidance, never silent changes or invented visits.
  expect(value.lanes[0]!.picks[0]!.candidateUrl).toBe('http://forum.example.com/unknown-route')
})

test('reports invalid source URLs without treating legacy mirrored decisions as extra failures', () => {
  const value = plan()
  value.lanes[0]!.picks[0]!.candidateUrl = 'http://forum.example.com/unknown-route'
  value.lanes[1]!.coreConsidered[0]!.decision = 'selected'
  value.lanes[2]!.coreConsidered[0]!.decision = 'deferred'
  let message = ''
  try { build(value) } catch (error) { message = (error as Error).message }
  expect(message).toContain('competitors.picks[0].candidateUrl')
  expect(message).not.toContain('coreConsidered.selected 必须')
  expect(message).toContain('unknownCandidateUrl')
})

test('broken JSON reports the actual parser failure, unmatched opening positions and exact plan to the parent', () => {
  const json = JSON.stringify(plan(), null, 2).slice(0, -2)
  try {
    buildResearchSourceSelection({ brief: '# user material\n```expert-source-selection\n' + json + '\n```', catalog, researcherPaths: paths, records: [] })
    throw new Error('expected invalid JSON')
  } catch (error: any) {
    expect(error.message).toContain('parserMessage')
    expect(error.message).toContain('unclosedContainers')
    expect(error.message).toContain('briefLine')
    expect(error.message).toContain('重新 Read')
    expect(error.message).toContain('candidateId')
    expect(error.message).toContain('停止重复派发')
    const diagnostic = JSON.parse(error.message.split('\n')[1])
    expect(diagnostic.source).toBe(json + '\n')
    expect(diagnostic.unclosedContainers[0]).toMatchObject({ opening: '{', expectedClosing: '}', line: 1, column: 1, briefLine: 3 })
  }
})

test('JSON diagnostics ignore brackets inside strings and retain arbitrary parser failures without guessing repairs', () => {
  for (const json of ['{"text":"brackets [ { \\\"", "lanes": [}', '{"version":1,,"lanes":[]}']) {
    try {
      buildResearchSourceSelection({ brief: '```expert-source-selection\n' + json + '\n```', catalog, researcherPaths: paths, records: [] })
      throw new Error('expected invalid JSON')
    } catch (error: any) {
      const diagnostic = JSON.parse(error.message.split('\n')[1])
      expect(diagnostic.parserMessage.length).toBeGreaterThan(0)
      expect(diagnostic.source).toBe(json + '\n')
      expect(diagnostic.unclosedContainers.some((row: any) => row.column === 20)).toBe(false)
    }
  }
})

test('malformed nested input has bounded bracket diagnostics while retaining the original source', () => {
  const source = '['.repeat(1000)
  try {
    buildResearchSourceSelection({ brief: '```expert-source-selection\n' + source + '\n```', catalog, researcherPaths: paths, records: [] })
    throw new Error('expected rejection')
  } catch (error: any) {
    const diagnostic = JSON.parse(error.message.split('\n')[1])
    expect(diagnostic.unclosedContainerCount).toBe(1000)
    expect(diagnostic.unclosedContainers).toHaveLength(16)
    expect(diagnostic.source).toBe(source + '\n')
  }
})

test('picks alone determine selected routes; legacy mirrored decisions cannot contradict the actual choice', () => {
  const value: any = plan()
  value.lanes[0].coreConsidered[0].decision = 'selected'
  delete value.lanes[2].coreConsidered[0].decision
  const result = build(value)
  expect(result.lanes[0]!.coreConsidered[0]!.decision).toBe('deferred')
  expect(result.lanes[2]!.coreConsidered[0]!.decision).toBe('selected')
  expect(normalizeResearchSourceSelection(JSON.parse(JSON.stringify(result)))).toEqual(result)
  expect(value.lanes[0].coreConsidered[0].decision).toBe('selected')
})
