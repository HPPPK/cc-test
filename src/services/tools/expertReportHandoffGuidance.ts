import type { ExpertTemplateFillField } from '../../utils/expertTemplateFill.js'
import { RESEARCH_COVERAGE_GUIDANCE } from '../../server/services/expertResearchSourceSelection.js'

/** Shared report-only guidance. No research gate, quota, or new model turn. */
export const REPORT_EVIDENCE_HANDOFF_GUIDANCE = [
  RESEARCH_COVERAGE_GUIDANCE,
  'Genuinely retrieved, relevant search summaries, readable passages, first-party claims and user comments may be included. Mark a summary as original text not verified; attribute promotion and personal experience; explain the basis of AI inference. Do not require full-text access, multiple sources, payment records, measured acquisition results or complete data before retaining useful material. Correct fabrication, irrelevant support, challenge pages posing as content and overclaims instead of deleting honest partial evidence. Follow relevant discovered links first; further research is bounded and value-driven, never a source quota.',
  'Keep acquisition and final selection separate: obtained and used, obtained but not used, partially obtained, not obtained, and access-limited are different states. Absence from SOURCE_ROWS never proves absence of evidence. A readable video description with unavailable comments is partial evidence, not an inaccessible platform. opened is navigation status, not proof of relevant content: a challenge, empty SERP or 404 supplies no product/user observation. Use the exact page/attempt from 06 to bound the observation; do not overwrite a successful observation with a different failed route.',
  'Retain reviewer-approved, decision-relevant details in their matching chapters; repeated or irrelevant material need not be included. Keep every concrete page actually used with its complete audited URL or audit ID. Prefer the exact audit: ID shown in 06 through D, E and SOURCE_ROWS; never reconstruct or clean up a source URL from memory. Prefer a distinct label for each page and reuse it in the prose and source table. Do not replace several posts/comments with one representative URL, or a search URL with its homepage. Ordinary Markdown definitions, inline links and explicit source-table labels remain valid; none is a mandatory format.',
  'Separate observed commercial practice from demonstrated commercial outcomes: a public price/free tier proves an offer exists, not conversion, profitability or paid willingness. One competitor allowing free commercial use does not prove commercial licensing impossible for the whole category. Keep useful AI inference with its basis and falsification conditions rather than converting it into a proven conclusion or deleting it. A proposed test price or experiment threshold may be a labeled hypothesis with its basis, assumptions and falsification condition; never invent observed prices, market size, conversion or willingness to pay.',
  'Compare concrete candidate approaches: for each proposed feature, platform, pricing or channel choice retain the task, observed basis, alternative, trade-off and condition that would change the recommendation. Missing market size does not prevent a bounded product proposal. Report an audit/result conflict using exact call/page references for local reconciliation; do not erase captured content solely because a historical challenge appears in a receipt, and never treat model prose alone as proof of successful browsing.',
  'For a quote, compare its declared page with the actual page-bound extract in the audit detail; opened does not override a captured challenge body. Keep a search excerpt attributed to its actual search page, with the target link as an unverified lead. An excerpt is partial: absence from it alone does not refute a quote; flag the uncertainty rather than inventing full-text verification.',
  'When rendering and during F review, trace the brief/07 active business context into the actual product, pricing or distribution recommendations. A business-default label in 07 alone is not absorption. Preserve a relevant conditional application and its trade-off, or explain why it does not apply; never invent capabilities, customers or conversion, and do not force a brand-name mention when the user overrides that default.',
  'Correct only the affected report fields or source rows using the existing materials and existing review/patch step. Do not add browsing, agents, review rounds, word/source quotas, or a new completion gate.',
].join('\n')

export const REPORT_ABSORPTION_WORK_GUIDANCE = [
  'Carry the active business defaults from the brief into relevant recommendations, including 金舟 C 端工具业务 when active; do not invent its users, capabilities or conversion. Keep one concise DATA_DECLARATION; use EVIDENCE_STATUS_SUMMARY for a short decision-relevant delta, not a repeat of the declaration, source-boundary boilerplate or every chapter’s unknowns. A proposed price is a labeled experiment, not an observed sale; preserve its basis, alternatives and stop conditions when available.',
  'Do not replace a specific task, observed free-tier limit or supported alternative with generic repeat-validation prose. Keep the observed numbers, units, conditions and applicable date together; an exact free limit must not become merely “limited”. Keep materially different options and their trade-offs in the matching chapter; scope unknowns remain explicit, without turning every chapter into the same disclaimer.',
  'Read the brief and independent review to EOF first. D has already reviewed all registered research parts: use its include/merge/partially_verified detail clusters as the primary material, not a second exhaustive pass over every raw shard. Consult only relevant ranges of the declared browser audit or research parts when an exact URL, supporting detail, or status conflict needs checking. Do not scan directories or browse.',
  'Preserve each chapter’s recommendation, basis, alternative, trade-off and falsification condition when supported by the existing material. A candidate product design is a proposal, not a claim that the product is built or users prefer it. Do not replace useful options with repeated unknown-status disclaimers.',
  'Save substantive chapter-ready details and their source identities before further optional lookups; a header, outline or promise to append is not the material package. Use only Read and Write, never instruct this worker to Edit or shell-append. Write overwrites the file: when saving incrementally, include the full accumulated material, then Read back the saved details and references. A non-empty scaffold or a compaction summary is not a completed 07 handoff.',
].join('\n')


/** Reuse the bound pack's guide; no new response field, storage shape or admission gate. */
export function renderReportTemplateFieldGuide(protocol: string | undefined, fields: ExpertTemplateFillField[], includeExamples: boolean): string {
  if (!protocol || !fields.length) return ''
  let guide: unknown
  try { guide = JSON.parse(protocol)?.templateFieldGuide } catch { return '' }
  if (!guide || typeof guide !== 'object' || Array.isArray(guide)) return ''
  const raw = guide as Record<string, unknown>
  const declared = new Map(fields.map(field => [field.id, field]))
  const seen = new Set<string>()
  const lines: string[] = []
  for (const entry of [...(Array.isArray(raw.fields) ? raw.fields : []), ...(Array.isArray(raw.tables) ? raw.tables : [])]) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    const row = entry as Record<string, unknown>
    if (typeof row.field !== 'string' || typeof row.meaning !== 'string' || !row.meaning.trim() || seen.has(row.field)) continue
    const field = declared.get(row.field)
    if (!field) continue
    seen.add(row.field)
    lines.push(field.id + ': ' + row.meaning)
    if (field.kind === 'table-rows') lines.push('实际表头：' + field.columns.join(' | '))
    if (includeExamples && typeof row.example === 'string') lines.push('字段示范：' + row.example)
    if (includeExamples && field.kind === 'table-rows' && Array.isArray(row.rowExample)
      && row.rowExample.length === field.columns.length && row.rowExample.every((cell: unknown) => typeof cell === 'string')) {
      lines.push('示范行：' + JSON.stringify(row.rowExample))
    }
  }
  return lines.length ? ['<session-template-field-guide>', '以下职责来自本会话固定模板；例子只示范写法，不是本轮事实。研究围绕字段所需材料展开；复核与整理保留有依据的建议和具体细节，不按字数或来源数量判完成。', ...lines, '</session-template-field-guide>'].join('\n') : ''
}
