import { expect, test } from 'bun:test'
import { evaluateResearchQualityCheckpoint, resolveResearchQualityCheckpointPolicy, normalizeResearchQualityContext, researchQualityInstruction } from './expertResearchQualityCheckpoint.js'

const paths = ['commercialization-research/02-competitors.md', 'commercialization-research/03-user-needs.md', 'commercialization-research/04-channels.md']
const policy = { version: 1 as const, minimumDistinctSuppliers: 2, minimumUserSignals: 2, minimumChannelMechanisms: 2 }
const quote = 'A concrete observed passage captured from this public page.'
const item = (url: string, extra = {}) => ({ url, quote, observation: 'This specific observation helps assess a bounded product or distribution question.', relevant: true, ...extra })
function record(lane: number, items: any[], entries = items.map(x => ({ target: x.url, finalUrl: x.url, status: 'opened' as const }))) {
  return { path: paths[lane]!.replace('.md', '.parts/worker.md'), content: '# Actual captured evidence\n' + quote + '\n```expert-research-evidence\n' + JSON.stringify({ version: 1, lane: ['competitors', 'user-needs', 'channels'][lane], items }) + '\n```', entries }
}
const evaluate = (records: any[]) => evaluateResearchQualityCheckpoint({ policy, researcherPaths: paths, records })

test('checkpoint is opt-in and leaves old protocols unchanged', () => {
  expect(resolveResearchQualityCheckpointPolicy('{}')).toBeUndefined()
  expect(resolveResearchQualityCheckpointPolicy(JSON.stringify({ researchQualityCheckpoint: policy }))).toEqual(policy)
  expect(() => resolveResearchQualityCheckpointPolicy(JSON.stringify({ researchQualityCheckpoint: { ...policy, minimumDistinctSuppliers: 0 } }))).toThrow()
})

test('three product pages belonging to one supplier count as one competitor operator', () => {
  const result = evaluate([record(0, [item('https://vendor.test/enhance', { supplier: 'One Company' }), item('https://vendor.test/color', { supplier: ' one company ' }), item('https://vendor.test/pricing', { supplier: 'ONE COMPANY' })])])
  expect(result.distinctSuppliers).toBe(1)
  expect(result.sufficientForReview).toBe(false)
  expect(result.gaps.find((x: any) => x.lane === 'competitors')?.question).toContain('另一')
})

test('only separately opened and quoted specific user content counts', () => {
  const rows = [item('https://www.baidu.com/'), item('https://www.google.com/search?q=photo'), item('https://www.reddit.com/r/photos/'), item('https://www.reddit.com/r/photos/comments/123/real_task/'), item('https://forum.test/thread/456')]
  const result = evaluate([record(1, rows)])
  expect(result.userSignals).toBe(2)
  expect(result.gaps.some((x: any) => x.lane === 'user-needs')).toBe(false)
  expect(evaluate([record(1, [item('https://forum.test/thread/456')], [])]).userSignals).toBe(0)
  const missingQuote = record(1, [item('https://forum.test/thread/456')]); missingQuote.content = missingQuote.content.replace(quote + '\n', '')
  expect(evaluate([missingQuote]).userSignals).toBe(0)
})

test('channel coverage requires complementary mechanisms and an actual observed search result', () => {
  const search = item('https://www.bing.com/search?q=photo+repair', { mechanism: 'search-results' })
  const landing = item('https://vendor.test/photo', { mechanism: 'landing-page' })
  expect(evaluate([record(2, [search, landing])]).channelMechanisms).toBe(1)
  const entries: any[] = [{ target: search.url, finalUrl: search.url, status: 'opened', kind: 'search', query: 'photo repair', searchResultStatus: 'results_observed' }, { target: landing.url, status: 'opened' as const }]
  expect(evaluate([record(2, [search, landing], entries)]).channelMechanisms).toBe(2)
  expect(evaluate([record(2, [landing, item('https://vendor.test/other', { mechanism: 'landing-page' })])]).channelMechanisms).toBe(1)
})

test('all three basic evidence lanes can pass without implying representative demand or verified ROI', () => {
  const result = evaluate([
    record(0, [item('https://one.test/photo', { supplier: 'One' }), item('https://two.test/photo', { supplier: 'Two' })]),
    record(1, [item('https://forum.test/thread/1'), item('https://forum.test/thread/2')]),
    record(2, [item('https://one.test/photo', { mechanism: 'landing-page' }), item('https://video.test/watch/1', { mechanism: 'distribution' })]),
  ])
  expect(result.sufficientForReview).toBe(true)
  expect(result.gaps).toEqual([])
  expect(result.boundary).toContain('代表性')
})

test('empty, irrelevant, malformed, mismatched-lane and duplicate evidence cannot manufacture coverage', () => {
  const bad = record(0, [item('https://one.test/photo', { supplier: 'One', relevant: false })])
  const malformed = { ...bad, content: '```expert-research-evidence\nnot json\n```' }
  const wrongLane = { ...record(1, [item('https://forum.test/thread/1')]), path: paths[0]!.replace('.md', '.parts/x.md') }
  const result = evaluate([bad, malformed, wrongLane, { ...bad, path: '../outside.md' }])
  expect(result.distinctSuppliers).toBe(0)
  expect(result.userSignals).toBe(0)
  expect(result.gaps).toHaveLength(3)
  const duplicate = record(1, [item('https://forum.test/thread/1'), item('https://forum.test/thread/1#reply')])
  expect(evaluate([duplicate]).userSignals).toBe(1)
})


test.each(['competitors', 'user-needs', 'channels'] as const)('runtime metadata becomes a concrete %s evidence contract in the child prompt', lane => {
  const context = normalizeResearchQualityContext({ policy })!
  const index = ['competitors', 'user-needs', 'channels'].indexOf(lane)
  const prompt = researchQualityInstruction(context, paths, paths[index]!.replace('.md', '.parts/worker.md'))
  expect(prompt).toContain('"lane":"' + lane + '"')
  expect(prompt).toContain('expert-research-evidence')
  expect(prompt).toContain('25 分钟')
  expect(prompt).toContain('1–1200')
  expect(prompt).toContain('优先已发现的相关具体讨论或问题区链接')
  expect(prompt).toContain('无关教程应调整关键词或来源')
  expect(prompt).not.toContain('老照片')
})

test('terminal checkpoint carries gaps and uncertainty to D instead of claiming successful validation', () => {
  const evaluation = evaluate([])
  const context = normalizeResearchQualityContext({ policy, evaluation, terminalReason: '补查已用尽' })!
  const prompt = researchQualityInstruction(context, paths)
  expect(prompt).toContain('补查已用尽')
  expect(prompt).toContain('不得假装已完成商业验证')
  expect(prompt).toContain('仅作建议，不阻挡复核')
  expect(prompt).toContain('代表性')
  expect(normalizeResearchQualityContext(null)).toBeUndefined()
  expect(normalizeResearchQualityContext({})).toBeUndefined()
  expect(normalizeResearchQualityContext({ policy, evaluation: 42 })).toEqual({ policy })
})

test('follow-up receives its saved lane evidence and shared access failures without sibling claims or broader file access', () => {
  const priorResearch = [
    { ...record(1, []), content: 'Existing user lane: actual task and remaining gap.' },
    { ...record(0, []), content: 'Sibling competitor claims must not leak.', entries: [{ target: 'old query', kind: 'search', searchEngine: 'Google', status: 'access_limited', detail: 'EXPERT_HUMAN_VERIFICATION_RECORDED_AS_GAP: user skipped' }] },
  ]
  const context = normalizeResearchQualityContext({ policy, priorResearch })!
  const prompt = researchQualityInstruction(context, paths, paths[1]!.replace('.md', '.parts/followup.md'))
  expect(prompt).toContain('Existing user lane: actual task and remaining gap.')
  expect(prompt).not.toContain('Sibling competitor claims')
  expect(prompt).toContain('Google')
  expect(prompt).toContain('EXPERT_HUMAN_VERIFICATION_RECORDED_AS_GAP')
  expect(prompt).toContain('不是新一次等待')
  expect(prompt).toContain('不需要读取旧分片')
  expect(researchQualityInstruction(context, paths, 'outside.md')).not.toContain('Existing user lane')
})

test('malformed quote fields request repair from saved evidence before more browsing', () => {
  const saved = record(0, [item('https://vendor.test/product', { supplier: 'Vendor', quote: quote + ' Unquoted appended sentence.' })])
  const result = evaluate([saved])
  expect(result.distinctSuppliers).toBe(0)
  expect(result.issues.join('\n')).toContain('items[0].quote')
  expect(result.gaps.find(g => g.lane === 'competitors')?.question).toContain('先修复')
  expect(result.gaps.find(g => g.lane === 'competitors')?.question).toContain('不要重开')
})

test('a corrected handoff may reuse already-opened evidence from its own lane without reopening it or borrowing sibling audit', () => {
  const url = 'https://vendor.test/product'
  const original = record(0, [item(url, { supplier: 'Vendor', quote: quote + ' Unquoted concatenation.' })])
  const correction = { ...record(0, [item(url, { supplier: 'Vendor' })], []), path: paths[0]!.replace('.md', '.parts/corrected.md') }
  expect(evaluate([original, correction]).distinctSuppliers).toBe(1)
  expect(evaluate([{ ...original, path: paths[1]!.replace('.md', '.parts/sibling.md') }, correction]).distinctSuppliers).toBe(0)
  expect(evaluate([correction]).distinctSuppliers).toBe(0)
})

test('objective public channel path is enough for preliminary analysis without CAC, conversion or paid-traffic proof', () => {
  const standard = { ...policy, minimumChannelMechanisms: 1, channelEvidenceStandard: 'public-path' as const, requireSourceSelection: true }
  expect(resolveResearchQualityCheckpointPolicy(JSON.stringify({ researchQualityCheckpoint: standard }))).toEqual(standard)
  const data = record(2, [item('https://vendor.test/restore', { mechanism: 'landing-page', channelPath: '公开任务页展示上传入口，再引导注册或查看价格；只能确认承接方式。', basis: 'observed' })])
  const result = evaluateResearchQualityCheckpoint({ policy: standard, researcherPaths: paths, records: [data] })
  expect(result.channelMechanisms).toBe(1)
  expect(result.gaps.some(g => g.lane === 'channels')).toBe(false)
  const prompt = researchQualityInstruction({ policy: standard }, paths, paths[2])
  expect(prompt).toContain('不要求')
  expect(prompt).toContain('转化率')
  expect(prompt).toContain('channelPath')
})

test('a mechanism label alone or an irrelevant result still cannot substitute for a concrete channel analysis', () => {
  const standard = { ...policy, minimumChannelMechanisms: 1, channelEvidenceStandard: 'public-path' as const }
  for (const data of [record(2, [item('https://vendor.test/', { mechanism: 'landing-page' })]), record(2, [item('https://www.bing.com/search?q=unrelated', { mechanism: 'search-results', channelPath: '无关查询无法说明产品用户怎样发现并使用产品。', basis: 'observed', relevant: false })])]) {
    expect(evaluateResearchQualityCheckpoint({ policy: standard, researcherPaths: paths, records: [data] }).channelMechanisms).toBe(0)
  }
  expect(() => resolveResearchQualityCheckpointPolicy(JSON.stringify({ researchQualityCheckpoint: { ...standard, channelEvidenceStandard: 'require-proven-ROI' } }))).toThrow()
  expect(() => resolveResearchQualityCheckpointPolicy(JSON.stringify({ researchQualityCheckpoint: { ...standard, requireSourceSelection: 'yes' } }))).toThrow()
})

test('legacy explicit evidence heading with one JSON block retains audited evidence', () => {
  const saved = record(0, [item('https://vendor.test/product', { supplier: 'Vendor' })])
  saved.content = saved.content.replace('```expert-research-evidence', '## expert-research-evidence\n\n```json')
  expect(evaluate([saved]).distinctSuppliers).toBe(1)
  const unrelated = { ...saved, content: saved.content.replace('## expert-research-evidence', '## unrelated') }
  expect(evaluate([unrelated]).distinctSuppliers).toBe(0)
})

test('invalid evidence structure requests local repair before new browsing', () => {
  const saved = record(0, [])
  saved.content = saved.content.replace('```expert-research-evidence', '```json')
  const result = evaluate([saved])
  expect(result.gaps[0]?.question).toContain('先修复已保存材料的字段')
  expect(result.gaps[0]?.question).toContain('代码块')
  expect(result.gaps[0]?.question).toContain('历史分片保持只读')
  expect(researchQualityInstruction({ policy }, paths, saved.path)).toContain('```expert-research-evidence\n')
})

test('accepts concise real observations without minimum quote or explanation padding', () => {
  const quote = '¥57.6/年'
  const source = { path: paths[0]!, content: quote + '\n```expert-research-evidence\n' + JSON.stringify({ version: 1, lane: 'competitors', items: [{ url: 'https://vendor.test/pricing', supplier: 'Vendor', quote, observation: '年付促销', relevant: true }] }) + '\n```', entries: [{ target: 'https://vendor.test/pricing', status: 'opened' as const }] }
  expect(evaluate([source]).distinctSuppliers).toBe(1)
})
