import { expect, test } from 'bun:test'
import { parseResearchSourceLibrary } from './expertResearchSourceLibraryService.js'
import { buildResearchSourceSelection, researchSourceCandidateId, renderResearchSourceSelectionCatalog } from './expertResearchSourceSelection.js'

const catalog = parseResearchSourceLibrary('<!-- research-source-library-tier: core -->\n### 数据\n- Appannie：https://www.appannie.com/\n- Trends：http://trends.google.com/trends/?geo=US\n<!-- research-source-library-tier: open -->\n### 用户\n- YouTube：https://www.youtube.com/')
const makePlan = () => ({ version: 1, lanes: ['competitors', 'user-needs', 'channels'].map(lane => ({ lane, coreRationale: '核心趋势与产品数据与当前问题相关，先尝试公开页面。', coreConsidered: [{ candidateUrl: 'http://www.appannie.com/', decision: 'selected', reason: '公开产品数据用于补充本线竞争分析。' }, { candidateUrl: 'https://trends.google.com/trends/?geo=US', decision: 'deferred', reason: '当前优先产品数据，趋势数据作为备用。' }], picks: [{ candidateUrl: 'http://www.appannie.com/', purpose: '验证公开产品与竞品线索', reason: '选择具体相关的公开产品数据入口。' }] })) })
const build = (plan: unknown, sourceCatalog = catalog) => buildResearchSourceSelection({ brief: '```expert-source-selection\n' + JSON.stringify(plan) + '\n```', catalog: sourceCatalog, researcherPaths: ['02.md', '03.md', '04.md'], records: [] })

test('legacy version 1 protocol spelling aliases resolve to catalog identity without claiming visits or mutating the brief', () => {
  const plan = makePlan()
  const result = build(plan)
  for (const lane of result.lanes) {
    expect(lane.picks[0]!.candidateUrl).toBe('https://www.appannie.com/')
    expect(lane.coreConsidered[1]!.candidateUrl).toBe('http://trends.google.com/trends/?geo=US')
    expect(lane.picks[0]!.status).toBe('not_visited')
    expect(lane.picks[0]!.attemptedUrls).toEqual([])
  }
  expect(plan.lanes[0]!.picks[0]!.candidateUrl).toBe('http://www.appannie.com/')
})

test('route aliases do not merge different paths, queries, hosts, ports or credentialed URLs', () => {
  for (const url of ['https://www.appannie.com/other', 'https://www.appannie.com/?q=1', 'https://appannie.com/', 'https://www.appannie.com:444/', 'https://secret@www.appannie.com/']) {
    const plan = makePlan(); plan.lanes[0]!.picks[0]!.candidateUrl = url
    expect(() => build(plan)).toThrow()
  }
})

test('repair detects duplicate YouTube aliases by catalog identity and tells the model to replace the whole structured plan', () => {
  const plan = makePlan()
  plan.lanes[0]!.picks = ['https://www.youtube.com/', 'http://www.youtube.com/'].map(candidateUrl => ({ candidateUrl, purpose: '检查公开用户与分发内容', reason: '按具体任务验证相关公开视频。' }))
  plan.lanes[0]!.coreConsidered[0]!.decision = 'deferred'
  expect(() => build(plan)).toThrow('duplicateCandidate')
  expect(() => build(plan)).toThrow('完整替换')
})

test('catalog identity conflicts fail closed instead of last-write-wins tier reassignment', () => {
  const ambiguous = { entries: [...catalog.entries, { ...catalog.entries[0]!, tier: 'open' as const }] }
  expect(() => build(makePlan(), ambiguous)).toThrow('ambiguousCatalogIdentity')
})

 test('runtime catalog exposes stable IDs; ID-only version 1 selections resolve without guessed URLs', () => {
  const plan: any = makePlan()
  for (const lane of plan.lanes) for (const row of [...lane.picks, ...lane.coreConsidered]) {
    const source = row.candidateUrl.includes('appannie') ? catalog.entries[0]! : catalog.entries[1]!
    row.candidateId = researchSourceCandidateId(source)
    delete row.candidateUrl
  }
  const rendered = renderResearchSourceSelectionCatalog(catalog)
  expect(rendered).toContain(researchSourceCandidateId(catalog.entries[0]!))
  expect(rendered).toContain('candidateId')
  expect(build(plan).lanes[0]!.picks[0]!.candidateUrl).toBe('https://www.appannie.com/')
  plan.lanes[0].picks[0].candidateUrl = 'https://www.youtube.com/'
  expect(() => build(plan)).toThrow('candidateIdentityMismatch')
})

test('ID-only references retain core tier checks and report unknown IDs without falling back to a guessed URL', () => {
  const plan: any = makePlan()
  plan.lanes[0].coreConsidered[0] = { candidateId: researchSourceCandidateId(catalog.entries[2]!), decision: 'deferred', reason: '不能将公开视频平台当成核心数据入口。' }
  expect(() => build(plan)).toThrow('不能冒充核心来源')
  plan.lanes[0].picks[0] = { ...plan.lanes[0].picks[0], candidateId: 'source-nonexistent' }
  expect(() => build(plan)).toThrow('unknownCandidateId')
})

test('duplicate core aliases produce field-specific aggregate repair errors and redact credentials', () => {
  const plan = makePlan()
  plan.lanes[0]!.coreConsidered.push({ ...plan.lanes[0]!.coreConsidered[0]!, candidateUrl: 'https://www.appannie.com/' })
  plan.lanes[1]!.picks[0]!.candidateUrl = 'https://private-token@www.appannie.com/'
  let message = ''
  try { build(plan) } catch (error) { message = (error as Error).message }
  expect(message).toContain('competitors.coreConsidered[2]')
  expect(message).toContain('duplicateCandidate')
  expect(message).toContain('user-needs.picks[0]')
  expect(message).not.toContain('private-token')
})

test('stable IDs survive catalog reorder and successful protocol alias resolution still uses actual receipt URLs', () => {
  expect(researchSourceCandidateId(catalog.entries[0]!)).toBe(researchSourceCandidateId({ candidateUrl: catalog.entries[0]!.candidateUrl + '#note' }))
  const result = buildResearchSourceSelection({ brief: '```expert-source-selection\n' + JSON.stringify(makePlan()) + '\n```', catalog: { entries: [...catalog.entries].reverse() }, researcherPaths: ['02.md', '03.md', '04.md'], records: [{ agentId: 'a', agentType: 'expert-evidence-researcher', artifactPath: '02.md', recordedAt: '2026-11-11', content: '', entries: [{ target: 'https://www.appannie.com/products/sample', status: 'opened', kind: 'url' }] }] })
  expect(result.lanes[0]!.picks[0]!.candidateUrl).toBe('https://www.appannie.com/')
  expect(result.lanes[0]!.picks[0]!.attemptedUrls).toEqual(['https://www.appannie.com/products/sample'])
  expect(result.unattemptedLanes).not.toContain('02.md')
})
