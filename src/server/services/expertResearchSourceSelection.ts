import { createHash } from 'node:crypto'
import { matchResearchSourceLibraryAttempts, type ExpertResearchSourceLibraryCatalog } from './expertResearchSourceLibraryService.js'
import type { ExpertResearchEvidenceRecord } from './expertResearchEvidenceReviewService.js'

const laneNames = ['competitors', 'user-needs', 'channels'] as const
const statuses = ['opened', 'access_limited', 'failed', 'interrupted', 'pending', 'not_visited'] as const
type SelectionStatus = typeof statuses[number]
type CoreConsideration = { candidateUrl: string; category: string; decision: 'selected' | 'deferred'; reason: string }
export type ResearchSourceSelection = {
  version: 1
  lanes: Array<{
    lane: typeof laneNames[number]
    artifactPath: string
    coreRationale: string
    coreConsidered: CoreConsideration[]
    picks: Array<{ candidateUrl: string; tier: 'core' | 'open'; category: string; purpose: string; reason: string; status: SelectionStatus; attemptedUrls: string[] }>
  }>
  unattemptedLanes: string[]
}
const object = (x: unknown): x is Record<string, unknown> => Boolean(x) && typeof x === 'object' && !Array.isArray(x)
const text = (x: unknown, min: number, max = 600): x is string => typeof x === 'string' && x.trim().length >= min && x.length <= max
const rootPath = (p: string) => p.replaceAll('\\', '/').replace(/\.parts\/[^/]+\.md$/, '.md')
function canonicalUrl(value: unknown): string {
  if (!text(value, 1, 4096)) throw new Error('candidateUrl 必须是来源库中的完整 URL')
  let url: URL
  try { url = new URL(value) } catch { throw new Error('candidateUrl 必须是来源库中的有效完整 URL') }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new Error('candidateUrl 必须是公开 http(s) 来源')
  url.hash = ''
  return url.href
}

type CatalogEntry = ExpertResearchSourceLibraryCatalog['entries'][number]

/** Stable route identity, independent of entry order and human-readable labels. */
export function researchSourceCandidateId(entry: Pick<CatalogEntry, 'candidateUrl'>): string {
  return 'source-' + createHash('sha256').update(canonicalUrl(entry.candidateUrl)).digest('hex').slice(0, 20)
}

export function renderResearchSourceSelectionCatalog(catalog: ExpertResearchSourceLibraryCatalog): string {
  return '<expert-source-selection-catalog>\n' + JSON.stringify(catalog.entries.map(entry => ({
    candidateId: researchSourceCandidateId(entry), candidateUrl: canonicalUrl(entry.candidateUrl), tier: entry.tier, category: entry.category,
  }))) + '\nversion:1 保持兼容；picks 与 coreConsidered 优先填写 candidateId（可省略 candidateUrl）；若同时填写两者必须指向同一目录条目。选择只在 picks 中填写，coreConsidered 保留候选和理由，decision 由程序推导。来源身份不代表访问或页面证据。\n</expert-source-selection-catalog>'
}

/** Diagnostics only: never repair, accept, or change the model's malformed plan. */
function sourcePlanSyntaxError(source: string, brief: string, sourceStart: number, error: unknown): Error {
  const stack: Array<{ opening: string; expectedClosing: string; line: number; column: number; briefLine: number }> = []
  const firstBriefLine = brief.slice(0, sourceStart).split('\n').length
  let quoted = false, escaped = false, line = 1, column = 1
  for (const char of source) {
    if (quoted) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') quoted = false
    } else if (char === '"') quoted = true
    else if (char === '{' || char === '[') stack.push({ opening: char, expectedClosing: char === '{' ? '}' : ']', line, column, briefLine: firstBriefLine + line - 1 })
    else if ((char === '}' || char === ']') && stack.at(-1)?.expectedClosing === char) stack.pop()
    if (char === '\n') { line++; column = 1 } else column++
  }
  return new Error('expert-source-selection JSON 格式无效\n' + JSON.stringify({
    parserMessage: error instanceof Error ? error.message : String(error),
    sourceFingerprint: createHash('sha256').update(source).digest('hex'),
    sourceStartBriefLine: firstBriefLine,
    unclosedContainerCount: stack.length,
    unclosedContainers: stack.slice(-16),
    source,
  }) + '\n原始解析错误和当前选源块已原样返回主代理；unclosedContainers 只是括号诊断，不是自动修复结果。重新 Read 最新 01，保留块外材料，修正并完整替换唯一选源 JSON 块；candidateId 是合法目录身份，不要因为语法错误改成 candidateUrl。先检查 JSON 语法，再检查目录与字段。当前计划未通过前停止重复派发 A/B/C，不修改不相关来源来碰运气。')
}

function catalogIndex(catalog: ExpertResearchSourceLibraryCatalog) {
  const candidates = new Map<string, CatalogEntry>()
  for (const entry of catalog.entries) {
    const url = canonicalUrl(entry.candidateUrl)
    const previous = candidates.get(url)
    if (previous && (previous.tier !== entry.tier || previous.category !== entry.category)) throw new Error('ambiguousCatalogIdentity: 同一来源 URL 在目录中有冲突归属：' + url)
    candidates.set(url, entry)
  }
  return candidates
}

/** Only an unambiguous protocol spelling alias is accepted, never a host-wide guess. */
function resolveCandidate(row: Record<string, unknown>, candidates: Map<string, CatalogEntry>): CatalogEntry {
  let byId: CatalogEntry | undefined
  if (row.candidateId !== undefined) {
    if (!text(row.candidateId, 1, 100)) throw new Error('unknownCandidateId')
    byId = [...candidates.values()].find(entry => researchSourceCandidateId(entry) === row.candidateId)
    if (!byId) throw new Error('unknownCandidateId: 请复制运行时目录中的 candidateId')
  }
  if (row.candidateUrl === undefined && byId) return byId
  const url = canonicalUrl(row.candidateUrl)
  let candidate = candidates.get(url)
  if (!candidate) {
    const requested = new URL(url)
    const aliases = [...candidates.entries()].filter(([key]) => {
      const known = new URL(key)
      return known.host === requested.host && known.pathname === requested.pathname && known.search === requested.search
    })
    if (aliases.length === 1) candidate = aliases[0]![1]
  }
  if (!candidate) throw new Error('unknownCandidateUrl: 不在来源库内')
  if (byId && byId !== candidate) throw new Error('candidateIdentityMismatch: candidateId 与 candidateUrl 指向不同目录条目')
  return candidate
}

function coreConsideration(value: unknown, catalog?: Map<string, ExpertResearchSourceLibraryCatalog['entries'][number]>, selected?: ReadonlySet<string>): CoreConsideration[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > (catalog ? 3 : 6)) throw new Error('coreConsidered 必须列出 1–3 个具体核心候选及 selected/deferred 理由')
  const seen = new Set<string>()
  return value.map(row => {
    if (!object(row) || (!selected && !['selected', 'deferred'].includes(String(row.decision))) || !text(row.reason, 8)) throw new Error('coreConsidered 缺少 decision 或具体 reason')
    let url: string
    let candidate: CatalogEntry | undefined
    if (catalog) { candidate = resolveCandidate(row, catalog); url = canonicalUrl(candidate.candidateUrl) }
    else { try { url = canonicalUrl(row.candidateUrl) } catch { throw new Error('coreConsidered.candidateUrl 不是公开完整 URL') } }
    const category = catalog ? candidate?.category : row.category
    if ((catalog && candidate?.tier !== 'core') || !text(category, 1) || seen.has(url)) throw new Error('coreConsidered 必须使用真实核心库条目，不能把补充来源重命名为核心来源或重复候选')
    seen.add(url)
    return { candidateUrl: url, category, decision: selected ? (selected.has(url) ? 'selected' : 'deferred') : row.decision as CoreConsideration['decision'], reason: row.reason.trim() }
  })
}

/** Return all URL mistakes before dispatch, rather than burning a worker wave
 * to discover each old http/https spelling or invented catalog entry in turn.
 * Suggestions never rewrite the brief or count as browser evidence.
 */
function collectCatalogUrlIssues(
  lanes: unknown[],
  candidates: Map<string, ExpertResearchSourceLibraryCatalog['entries'][number]>,
) {
  const issues: Array<{ field: string; value: unknown; reason: string; exactCatalogAlternatives: string[] }> = []
  for (const lane of lanes) {
    if (!object(lane)) continue
    for (const group of ['picks', 'coreConsidered'] as const) {
      const rows = lane[group]
      if (!Array.isArray(rows)) continue
      const seen = new Set<string>()
      for (const [index, row] of rows.entries()) {
        if (!object(row)) continue
        let candidate: CatalogEntry | undefined
        let reason = ''
        try { candidate = resolveCandidate(row, candidates) } catch (error) { reason = error instanceof Error ? error.message : String(error) }
        if (candidate && (group !== 'coreConsidered' || candidate.tier === 'core')) {
          const identity = canonicalUrl(candidate.candidateUrl)
          if (seen.has(identity)) issues.push({ field: `${lane.lane}.${group}[${index}]`, value: identity,
            reason: 'duplicateCandidate: 同一目录身份重复；删除重复项并合并相关用途，不要追加相同平台', exactCatalogAlternatives: [identity] })
          seen.add(identity)
          continue
        }
        let host: string | undefined
        try { host = new URL(canonicalUrl(row.candidateUrl)).hostname } catch { /* Never echo credentialed or invalid URLs. */ }
        const alternatives = [...candidates.entries()]
          .filter(([url, entry]) => new URL(url).hostname === host && (group !== 'coreConsidered' || entry.tier === 'core'))
          .map(([url]) => url).slice(0, 3)
        issues.push({ field: `${lane.lane}.${group}[${index}].candidateUrl`, value: host ? row.candidateUrl : '[invalid public URL or candidateId]',
          reason: candidate ? '此条目属于补充来源，不能冒充核心来源' : reason, exactCatalogAlternatives: alternatives })
      }
    }
  }
  return issues
}

/** Plans only selected routes. This never restores the old 149-entry visitation queue. */
export function buildResearchSourceSelection(input: {
  brief: string
  catalog: ExpertResearchSourceLibraryCatalog
  researcherPaths: string[]
  records: ExpertResearchEvidenceRecord[]
}): ResearchSourceSelection {
  const blocks = [...input.brief.matchAll(/^```expert-source-selection[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gm)]
  if (blocks.length !== 1 || blocks[0]![1]!.length > 16000) throw new Error('01 brief 必须包含一个 expert-source-selection JSON 代码块（version:1，lanes 为 competitors/user-needs/channels）')
  let value: unknown
  try { value = JSON.parse(blocks[0]![1]!) } catch (error) {
    const block = blocks[0]!
    throw sourcePlanSyntaxError(block[1]!, input.brief, block.index! + block[0].indexOf('\n') + 1, error)
  }
  if (!object(value) || value.version !== 1 || !Array.isArray(value.lanes) || value.lanes.length !== 3) throw new Error('expert-source-selection.version 必须为 1，lanes 必须恰好包含 A/B/C 三线')
  const candidates = catalogIndex(input.catalog)
  const plannedLanes = value.lanes
  const catalogIssues = collectCatalogUrlIssues(plannedLanes, candidates)
  const laneIssues: string[] = []
  const lanes = laneNames.flatMap((lane, index) => {
    try {
      const found = plannedLanes.filter((row: unknown) => object(row) && row.lane === lane)
      const row = found[0]
      if (found.length !== 1 || !object(row) || !text(row.coreRationale, 12) || !Array.isArray(row.picks) || row.picks.length < 1 || row.picks.length > 3) throw new Error('source selection ' + lane + ': 每线必须有 1–3 个 picks，以及 coreRationale 说明核心库选择或暂不选择的具体理由')
      const seen = new Set<string>()
      const picks = row.picks.map((pick: unknown) => {
        if (!object(pick) || !text(pick.purpose, 4, 300) || !text(pick.reason, 8)) throw new Error('source selection ' + lane + '.picks: 缺少 purpose 或 reason')
        const candidate = resolveCandidate(pick, candidates), url = canonicalUrl(candidate.candidateUrl)
        if (seen.has(url)) throw new Error('duplicateCandidate: source selection ' + lane + '.picks 重复目录身份：' + url + '；删除重复项，保留相关 purpose/reason')
        seen.add(url)
        // Catalog entries may contain a historical example path. This measures
        // use of the selected platform; attemptedUrls remains the actual page,
        // never proof that the example URL or its data was opened.
        const attempts = matchResearchSourceLibraryAttempts({ catalog: { entries: [candidate] }, records: input.records })
        const matching = attempts.filter(attempt => attempt.artifactPath && rootPath(attempt.artifactPath) === input.researcherPaths[index] && canonicalUrl(attempt.candidateUrl) === url)
        const status = statuses.find(status => matching.some(attempt => attempt.status === status)) ?? 'not_visited'
        return { candidateUrl: url, tier: candidate.tier, category: candidate.category, purpose: pick.purpose.trim(), reason: pick.reason.trim(), status, attemptedUrls: [...new Set(matching.map(attempt => attempt.targetUrl))].slice(0, 32) }
      })
      const coreConsidered = coreConsideration(row.coreConsidered, candidates, seen)
      // picks is the single source of selection truth; legacy mirrored flags are derived.
      for (const pick of picks.filter(pick => pick.tier === 'core')) {
        if (!coreConsidered.some(core => core.candidateUrl === pick.candidateUrl)) coreConsidered.push({ candidateUrl: pick.candidateUrl, category: pick.category, decision: 'selected', reason: pick.reason })
      }
      return [{ lane, artifactPath: input.researcherPaths[index]!, coreRationale: row.coreRationale.trim(), coreConsidered, picks }]
    } catch (error) {
      laneIssues.push(lane + ': ' + (error instanceof Error ? error.message : String(error)))
      return []
    }
  })
  if (catalogIssues.length || laneIssues.length) throw new Error('选源计划错误，请一次修复以下全部字段后再派遣研究者：' + JSON.stringify({ catalogIssues, laneIssues })
    + '。重新 Read 最新 01，解析 JSON 后完整替换唯一 expert-source-selection 代码块，禁止连续猜测旧字符串做 Edit；按目录身份去重 picks/coreConsidered，选择状态只由 picks 推导，再重新校验。只改 01 的选源计划，保留代码块外内容及已有研究；exactCatalogAlternatives 仅为同域真实目录地址，不代表已访问。没有同域条目时移出 picks 或按相关性另选真实库条目；其它公开官网和搜索引擎仍可用于发现，不必伪装成目录候选。')
  return { version: 1, lanes, unattemptedLanes: lanes.filter(lane => requiredSourceCandidates(lane).length > 0).map(lane => lane.artifactPath) }
}

/** Defensive normalization for the transient server -> CLI context, not persisted settings. */
export function normalizeResearchSourceSelection(value: unknown): ResearchSourceSelection | undefined {
  if (!object(value) || value.version !== 1 || !Array.isArray(value.lanes) || value.lanes.length !== 3) return undefined
  const lanes: ResearchSourceSelection['lanes'] = []
  for (const [index, row] of value.lanes.entries()) {
    if (!object(row) || row.lane !== laneNames[index] || !text(row.artifactPath, 1, 4096) || !text(row.coreRationale, 12) || !Array.isArray(row.picks) || row.picks.length < 1 || row.picks.length > 3) return undefined
    let coreConsidered: CoreConsideration[]
    try { coreConsidered = coreConsideration(row.coreConsidered) } catch { return undefined }
    const picks: ResearchSourceSelection['lanes'][number]['picks'] = []
    for (const pick of row.picks) {
      if (!object(pick) || !text(pick.candidateUrl, 1, 4096) || !['core', 'open'].includes(String(pick.tier)) || !text(pick.category, 1) || !text(pick.purpose, 4, 300) || !text(pick.reason, 8) || !(statuses as readonly unknown[]).includes(pick.status) || !Array.isArray(pick.attemptedUrls) || pick.attemptedUrls.length > 256 || pick.attemptedUrls.some(x => !text(x, 1, 4096))) return undefined
      try { canonicalUrl(pick.candidateUrl) } catch { return undefined }
      picks.push(pick as ResearchSourceSelection['lanes'][number]['picks'][number])
    }
    lanes.push({ lane: laneNames[index]!, artifactPath: row.artifactPath, coreRationale: row.coreRationale, coreConsidered, picks })
  }
  return { version: 1, lanes, unattemptedLanes: lanes.filter(lane => requiredSourceCandidates(lane).length > 0).map(lane => lane.artifactPath) }
}

/** Explicitly selected core routes need one real attempt or an honest deferred decision. */
export function requiredSourceCandidates(lane: ResearchSourceSelection['lanes'][number]) {
  const selectedCore = lane.picks.filter(pick => pick.tier === 'core')
  if (selectedCore.length && selectedCore.every(pick => pick.status === 'not_visited')) return selectedCore
  return lane.picks.every(pick => pick.status === 'not_visited') ? lane.picks : []
}

export function sourceSelectionInstruction(selection: ResearchSourceSelection, assignedPath?: string): string {
  const lanes = assignedPath ? selection.lanes.filter(lane => lane.artifactPath === rootPath(assignedPath)) : selection.lanes
  return '<expert-source-selection>\n' + JSON.stringify(lanes) + '\n按本线 purpose 选取具体页面；来源入口按所选平台对账，attemptedUrls 才是实际尝试页面，不表示样例路径或数据已打开。候选根入口不是最终证据。至少尝试一条相关的选定路线；若明确选用核心入口，至少真实尝试其中一条，不能用其他补充来源代替。确实不适用则由主代理将核心取舍改为 deferred 并说明理由。其余为备用，不逐站扫库。已有同线回执可以复用。失败、登录、付费墙或无相关内容时按真实状态记录并换同字段公开来源；不强求成功、付费数据或全部候选访问。未访问不等于失败。D 按运行时对账检查选源是否合理，不以来源数量代替内容质量。\n</expert-source-selection>'
}

export function renderResearchSourceSelectionMarkdown(selection: ResearchSourceSelection): string {
  const cell = (value: string) => value.replace(/[|\r\n]/g, ' ').slice(0, 600)
  const lines = ['## 本轮相关选源与执行对账', '', '> 只对账本轮选定路线及核心候选取舍，不要求全库访问。状态来自真实浏览回执；not_visited 不是网站失败。平台入口或样例路径不等于已读取数据，实际尝试页单独列出。', '']
  for (const lane of selection.lanes) {
    lines.push('### ' + lane.lane, '', '核心库取舍：' + cell(lane.coreRationale), '', '| 核心候选 | 类别 | 取舍 | 理由 |', '| --- | --- | --- | --- |')
    for (const core of lane.coreConsidered) lines.push('| ' + [core.candidateUrl, core.category, core.decision, core.reason].map(cell).join(' | ') + ' |')
    lines.push('', '| 选定入口 | 来源层 | 用途 | 状态 | 实际尝试页 |', '| --- | --- | --- | --- | --- |')
    for (const pick of lane.picks) lines.push('| ' + [pick.candidateUrl, pick.tier, pick.purpose, pick.status, pick.attemptedUrls.join('、')].map(cell).join(' | ') + ' |')
    lines.push('')
  }
  return lines.join('\n') + '\n'
}
