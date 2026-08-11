export const EXPERT_TEMPLATE_FILL_FORMAT = 'cc-jiangxia-expert-template-fill/v1' as const

export type ExpertTemplateFillField =
  | { id: string; kind: 'text' }
  | { id: string; kind: 'paragraphs' }
  | { id: string; kind: 'table-rows'; columns: string[]; urlColumnIndex?: number }

export type ExpertTemplateFillSchema = {
  format: typeof EXPERT_TEMPLATE_FILL_FORMAT
  templateId: string
  fields: ExpertTemplateFillField[]
}

export type ExpertTemplateFillPayload = {
  format: typeof EXPERT_TEMPLATE_FILL_FORMAT
  templateId: string
  fields: Record<string, unknown>
}

const TEMPLATE_ID_RE = /<html\b[^>]*\bdata-template-id\s*=\s*["']([^"']+)["']/i
const PLACEHOLDER_RE = /{{([A-Z][A-Z0-9_]*)}}/g
const SLOT_RE = /<!--\s*SLOT:\s*([A-Z][A-Z0-9_]*)\s*-->/g

function textContent(value: string): string {
  return value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function templateIdOf(content: string): string {
  const templateId = content.match(TEMPLATE_ID_RE)?.[1]?.trim()
  if (!templateId) throw new Error('固定 HTML 母版缺少 data-template-id，不能启用模板填充输出。')
  return templateId
}

function uniqueInOrder(values: string[]): string[] {
  return [...new Set(values)]
}

function nearestTableDefinition(content: string, offset: number): { columns: string[]; urlColumnIndex?: number } | null {
  const before = content.slice(0, offset)
  const tableStart = before.lastIndexOf('<table')
  const tableEnd = before.lastIndexOf('</table>')
  if (tableStart < 0 || tableStart < tableEnd) return null
  const table = content.slice(tableStart, offset)
  if (!/<tbody\b[^>]*>[\s\S]*$/i.test(table)) return null
  const header = table.match(/<thead\b[^>]*>([\s\S]*?)<\/thead>/i)?.[1]
  if (!header) return null
  const columns = [...header.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map((match) => textContent(match[1] ?? ''))
  if (!columns.length) return null
  const urlColumnIndex = columns.findIndex((column) => /url|链接/i.test(column))
  return { columns, ...(urlColumnIndex >= 0 ? { urlColumnIndex } : {}) }
}

export function deriveExpertTemplateFillSchema(templateContent: string): ExpertTemplateFillSchema {
  const templateId = templateIdOf(templateContent)
  const placeholders = uniqueInOrder([...templateContent.matchAll(PLACEHOLDER_RE)].map((match) => match[1] ?? ''))
  const fields: ExpertTemplateFillField[] = placeholders.map((id) => ({ id, kind: 'text' }))
  for (const match of templateContent.matchAll(SLOT_RE)) {
    const id = match[1] ?? ''
    if (!id || fields.some((field) => field.id === id)) continue
    const table = nearestTableDefinition(templateContent, match.index ?? 0)
    fields.push(table
      ? { id, kind: 'table-rows', columns: table.columns, ...(table.urlColumnIndex !== undefined ? { urlColumnIndex: table.urlColumnIndex } : {}) }
      : { id, kind: 'paragraphs' })
  }
  if (!fields.length) throw new Error('固定 HTML 母版没有可填写的 {{字段}} 或 SLOT 区域。')
  return { format: EXPERT_TEMPLATE_FILL_FORMAT, templateId, fields }
}

export function isExpertTemplateFillPayload(value: unknown): value is ExpertTemplateFillPayload {
  return Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      (value as Record<string, unknown>).format === EXPERT_TEMPLATE_FILL_FORMAT &&
      typeof (value as Record<string, unknown>).templateId === 'string' &&
      (value as Record<string, unknown>).fields &&
      typeof (value as Record<string, unknown>).fields === 'object' &&
      !Array.isArray((value as Record<string, unknown>).fields),
  )
}


function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

function normalizeTextFieldForTemplate(templateContent: string, fieldId: string, value: unknown): unknown {
  if (fieldId !== 'REPORT_TITLE' || typeof value !== 'string') return value
  const suffix = ' · 商业化调研报告'
  const marker = '{{' + fieldId + '}}' + suffix
  if (!templateContent.includes(marker)) return value
  const title = value.trim()
  if (!title.endsWith(suffix)) return value
  const withoutSuffix = title.slice(0, -suffix.length).trimEnd()
  return withoutSuffix || value
}
function renderText(value: unknown, fieldId: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`模板字段 ${fieldId} 必须填写为非空文本。`)
  return escapeHtml(value.trim()).replace(/\r?\n/g, '<br>')
}

function renderParagraphs(value: unknown, fieldId: string): string {
  const paragraphs = Array.isArray(value) ? value : [value]
  if (!paragraphs.length || paragraphs.some((paragraph) => typeof paragraph !== 'string' || !paragraph.trim())) {
    throw new Error(`模板区域 ${fieldId} 必须填写为至少一段非空文本。`)
  }
  return paragraphs.map((paragraph) => `<p>${escapeHtml(String(paragraph).trim()).replace(/\r?\n/g, '<br>')}</p>`).join('\n')
}

function tableCellsFromRow(value: unknown): unknown {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value

  // Some providers serialize a row as { value: ["…"], Count: 3 } instead of a
  // raw JSON array. This wrapper is unambiguous and contains no report content
  // outside `value`, so unwrap it before applying the normal strict cell checks.
  const row = value as Record<string, unknown>
  const keys = Object.keys(row)
  if (!Array.isArray(row.value) || keys.some((key) => key !== 'value' && key !== 'count' && key !== 'Count')) return value
  const declaredCount = row.count ?? row.Count
  if (declaredCount !== undefined && declaredCount !== row.value.length) return value
  return row.value
}

function renderTableRows(value: unknown, field: Extract<ExpertTemplateFillField, { kind: 'table-rows' }>): string {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`表格区域 ${field.id} 至少需要一行数据；资料不足时请填写“未取得，需一手验证”。`)
  return value.map((rawRow, rowIndex) => {
    const row = tableCellsFromRow(rawRow)
    if (!Array.isArray(row) || row.length !== field.columns.length || row.some((cell) => typeof cell !== 'string' || !cell.trim())) {
      throw new Error(`表格区域 ${field.id} 第 ${rowIndex + 1} 行必须恰好填写 ${field.columns.length} 个非空单元格。`)
    }
    const cells = row.map((cell, columnIndex) => {
      const text = String(cell).trim()
      if (field.urlColumnIndex === columnIndex) {
        const url = safeHttpUrl(text)
        if (!url) throw new Error(`表格区域 ${field.id} 第 ${rowIndex + 1} 行的 URL 必须是 http 或 https 链接。`)
        return `<td><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></td>`
      }
      return `<td>${escapeHtml(text).replace(/\r?\n/g, '<br>')}</td>`
    }).join('')
    return `<tr>${cells}</tr>`
  }).join('\n')
}

export function renderExpertTemplateFill(templateContent: string, payload: ExpertTemplateFillPayload): { content: string; schema: ExpertTemplateFillSchema } {
  const schema = deriveExpertTemplateFillSchema(templateContent)
  if (payload.templateId !== schema.templateId) {
    throw new Error(`模板标识不匹配：当前会话要求 ${schema.templateId}，但收到 ${payload.templateId}。`)
  }

  const allowed = new Set(schema.fields.map((field) => field.id))
  const unknown = Object.keys(payload.fields).filter((key) => !allowed.has(key))
  if (unknown.length) throw new Error(`存在当前母版未声明的字段：${unknown.join('、')}。`)

  let rendered = templateContent
  for (const field of schema.fields) {
    if (!(field.id in payload.fields)) throw new Error(`缺少模板字段：${field.id}。`)
    const value = normalizeTextFieldForTemplate(templateContent, field.id, payload.fields[field.id])
    const replacement = field.kind === 'text'
      ? renderText(value, field.id)
      : field.kind === 'paragraphs'
        ? renderParagraphs(value, field.id)
        : renderTableRows(value, field)
    if (field.kind === 'text') {
      rendered = rendered.replaceAll(`{{${field.id}}}`, replacement)
    } else {
      rendered = rendered.replace(new RegExp(`<!--\\s*SLOT:\\s*${field.id}\\s*-->`), replacement)
    }
  }

  if (PLACEHOLDER_RE.test(rendered) || SLOT_RE.test(rendered)) {
    throw new Error('母版仍保留未填写的字段或 SLOT 区域。')
  }
  return { content: rendered, schema }
}

export function describeExpertTemplateFillSchema(templateContent: string): string {
  const schema = deriveExpertTemplateFillSchema(templateContent)
  const fields = schema.fields.map((field) => field.kind === 'table-rows'
    ? { id: field.id, kind: field.kind, columns: field.columns }
    : { id: field.id, kind: field.kind })
  return JSON.stringify({ format: schema.format, templateId: schema.templateId, fields }, null, 2)
}
