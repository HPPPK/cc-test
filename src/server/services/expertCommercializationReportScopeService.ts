const COMMERCIALIZATION_REPORT_EXPERT_ID = 'commercialization-research-report'
const SOURCE_BOUNDARY = '本轮实际采用的网页证据以“信息来源与说明”表列出的 URL 为准；未列入来源表不等于未取得：可能是已取得但未采用，也可能是候选、未取得、受限或后续建议，须分别依据研究材料与浏览审计说明，不能仅凭来源表缺项判定网站受限或未取证。公司 119 个入口及开放平台的完整访问清单见 commercialization-research/06-browser-audit.md（包含已打开、受限、失败、未完成）；访问记录不等于事实来源。'

// Exact previous generated text only; never rewrite arbitrary user-authored claims.
const LEGACY_SOURCE_BOUNDARY = "本轮实际采用的网页证据以“信息来源与说明”表列出的 URL 为准；未列入该表的平台或链接，仅可表示候选检索入口、访问受限或无结果记录、或者后续渠道建议，不代表已完成内容取证。公司 119 个入口及开放平台的完整访问清单见 commercialization-research/06-browser-audit.md（包含已打开、受限、失败、未完成）；访问记录不等于事实来源。"

function isNonEmptyParagraphArray(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.length > 0
    && value.every((paragraph) => typeof paragraph === 'string' && paragraph.trim())
}

function hasSourceBoundary(value: unknown): boolean {
  return typeof value === 'string'
    ? value.includes(SOURCE_BOUNDARY)
    : Array.isArray(value) && value.some((paragraph) => typeof paragraph === 'string' && paragraph.includes(SOURCE_BOUNDARY))
}

/**
 * Adds a deterministic source-scope boundary to commercialization reports.
 *
 * This intentionally never blocks report rendering and does not prescribe a
 * fixed platform/domain list. It only prevents a broad scope sentence from
 * being read as proof that every named candidate platform produced usable
 * evidence. The actual evidence set remains the audited final URL table.
 */
export function ensureCommercializationReportSourceBoundary(input: {
  expertId: string
  fields: Record<string, unknown>
}): Record<string, unknown> {
  if (input.expertId !== COMMERCIALIZATION_REPORT_EXPERT_ID) return input.fields

  const declaration = input.fields.DATA_DECLARATION
  if (typeof declaration === 'string' && declaration.includes(LEGACY_SOURCE_BOUNDARY)) {
    return { ...input.fields, DATA_DECLARATION: declaration.replaceAll(LEGACY_SOURCE_BOUNDARY, SOURCE_BOUNDARY) }
  }
  if (isNonEmptyParagraphArray(declaration) && declaration.some((paragraph) => paragraph.includes(LEGACY_SOURCE_BOUNDARY))) {
    return { ...input.fields, DATA_DECLARATION: declaration.map((paragraph) => paragraph.replaceAll(LEGACY_SOURCE_BOUNDARY, SOURCE_BOUNDARY)) }
  }
  if (hasSourceBoundary(declaration)) return input.fields

  if (typeof declaration === 'string' && declaration.trim()) {
    return {
      ...input.fields,
      DATA_DECLARATION: declaration + '\n\n- **来源范围**：' + SOURCE_BOUNDARY,
    }
  }

  if (isNonEmptyParagraphArray(declaration)) {
    return {
      ...input.fields,
      DATA_DECLARATION: [...declaration, '**来源范围**：' + SOURCE_BOUNDARY],
    }
  }

  // Leave missing and malformed fields to the existing template schema. The
  // scope boundary is a best-effort truth disclosure, never a new render gate.
  return input.fields
}

export const commercializationReportSourceBoundary = SOURCE_BOUNDARY
