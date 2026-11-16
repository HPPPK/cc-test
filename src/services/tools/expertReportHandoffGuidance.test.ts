import { expect, test } from 'bun:test'
import { REPORT_ABSORPTION_WORK_GUIDANCE, REPORT_EVIDENCE_HANDOFF_GUIDANCE } from './expertReportHandoffGuidance.js'

test('report guidance preserves acquisition, exact citations and bounded inference without a new gate', () => {
  expect(REPORT_EVIDENCE_HANDOFF_GUIDANCE).toContain('Absence from SOURCE_ROWS never proves absence of evidence')
  expect(REPORT_EVIDENCE_HANDOFF_GUIDANCE).toContain('partial evidence, not an inaccessible platform')
  expect(REPORT_EVIDENCE_HANDOFF_GUIDANCE).toContain('every concrete page actually used')
  expect(REPORT_EVIDENCE_HANDOFF_GUIDANCE).toContain('not conversion, profitability or paid willingness')
  expect(REPORT_EVIDENCE_HANDOFF_GUIDANCE).toContain('does not prove commercial licensing impossible')
  expect(REPORT_EVIDENCE_HANDOFF_GUIDANCE).toContain('its basis and falsification conditions')
  expect(REPORT_EVIDENCE_HANDOFF_GUIDANCE).toContain('Do not add browsing, agents, review rounds, word/source quotas, or a new completion gate')
})

test('absorption reuses independent review and saves cumulative substantive material with available tools', () => {
  expect(REPORT_ABSORPTION_WORK_GUIDANCE).toContain('Read the brief and independent review to EOF first')
  expect(REPORT_ABSORPTION_WORK_GUIDANCE).toContain('not a second exhaustive pass over every raw shard')
  expect(REPORT_ABSORPTION_WORK_GUIDANCE).toContain('only relevant ranges')
  expect(REPORT_ABSORPTION_WORK_GUIDANCE).toContain('Save substantive chapter-ready details and their source identities')
  expect(REPORT_ABSORPTION_WORK_GUIDANCE).toContain('Use only Read and Write, never instruct this worker to Edit or shell-append')
  expect(REPORT_ABSORPTION_WORK_GUIDANCE).toContain('include the full accumulated material')
  expect(REPORT_ABSORPTION_WORK_GUIDANCE).toContain('A non-empty scaffold or a compaction summary is not a completed 07 handoff')
})


test('grounded proposal numbers are distinct from invented observed business metrics', () => {
  expect(REPORT_EVIDENCE_HANDOFF_GUIDANCE).toContain('proposed test price')
  expect(REPORT_EVIDENCE_HANDOFF_GUIDANCE).toContain('never invent observed prices, market size, conversion or willingness to pay')
  expect(REPORT_ABSORPTION_WORK_GUIDANCE).toContain('recommendation, basis, alternative, trade-off and falsification condition')
})

test('template guide uses only declared fields and actual headers, with examples only when requested', async () => {
  const { renderReportTemplateFieldGuide } = await import('./expertReportHandoffGuidance.js')
  const fields = [{ id: 'PRODUCT', kind: 'paragraphs' as const }, { id: 'OPTIONS', kind: 'table-rows' as const, columns: ['方案', '取舍'] }]
  const protocol = JSON.stringify({ templateFieldGuide: {
    fields: [{ field: 'PRODUCT', meaning: '解释用户任务', example: '假设任务示范' }, { field: 'UNDECLARED', meaning: 'not in this template' }, { field: 'PRODUCT', meaning: 'duplicate' }, { field: 'OPTIONS', meaning: 42 }, null],
    tables: [{ field: 'OPTIONS', meaning: '比较方案', columns: [['obsolete header']], rowExample: ['预览', '额外一步'] }],
  } })
  const research = renderReportTemplateFieldGuide(protocol, fields, false)
  expect(research).toContain('PRODUCT: 解释用户任务')
  expect(research).toContain('实际表头：方案 | 取舍')
  for (const absent of ['假设任务示范', 'UNDECLARED', 'duplicate', 'obsolete header']) expect(research).not.toContain(absent)
  const editor = renderReportTemplateFieldGuide(protocol, fields, true)
  expect(editor).toContain('字段示范：假设任务示范')
  expect(editor).toContain('示范行：["预览","额外一步"]')
  for (const legacy of [undefined, '', '{bad', 'null', '{}', '{"templateFieldGuide":[]}']) expect(renderReportTemplateFieldGuide(legacy, fields, true)).toBe('')
  expect(renderReportTemplateFieldGuide(protocol, [], true)).toBe('')
  const invalid = JSON.stringify({ templateFieldGuide: { fields: 3, tables: [[], { field: 'OPTIONS', meaning: 'valid meaning', rowExample: ['wrong count'] }] } })
  expect(renderReportTemplateFieldGuide(invalid, fields, true)).not.toContain('示范行')
})

test('decision writing retains concrete choices and reports contradictory receipts without inventing facts', () => {
  expect(REPORT_EVIDENCE_HANDOFF_GUIDANCE).toContain('Compare concrete candidate approaches')
  expect(REPORT_EVIDENCE_HANDOFF_GUIDANCE).toContain('audit/result conflict')
  expect(REPORT_ABSORPTION_WORK_GUIDANCE).toContain('Do not replace a specific task')
})

test('permits genuine relevant summaries and qualified reasoning without requiring full-text or outcomes', () => {
  expect(REPORT_EVIDENCE_HANDOFF_GUIDANCE).toContain('Genuinely retrieved, relevant search summaries')
  expect(REPORT_EVIDENCE_HANDOFF_GUIDANCE).toContain('original text not verified')
  expect(REPORT_EVIDENCE_HANDOFF_GUIDANCE).toContain('Do not require full-text access')
})

test('handoff preserves source identity and concrete limits without trusting opened as content proof', () => {
  expect(REPORT_EVIDENCE_HANDOFF_GUIDANCE).toContain('Prefer the exact audit: ID shown in 06')
  expect(REPORT_EVIDENCE_HANDOFF_GUIDANCE).toContain('opened is navigation status')
  expect(REPORT_ABSORPTION_WORK_GUIDANCE).toContain('Keep the observed numbers, units, conditions')
  expect(REPORT_EVIDENCE_HANDOFF_GUIDANCE).toContain('actual page-bound extract')
  expect(REPORT_EVIDENCE_HANDOFF_GUIDANCE).toContain('A business-default label in 07 alone is not absorption')
  expect(REPORT_EVIDENCE_HANDOFF_GUIDANCE).toContain('When rendering and during F review')
  expect(REPORT_EVIDENCE_HANDOFF_GUIDANCE).toContain('absence from it alone does not refute a quote')
  expect(REPORT_ABSORPTION_WORK_GUIDANCE).toContain('金舟 C 端工具业务')
  expect(REPORT_ABSORPTION_WORK_GUIDANCE).toContain('not a repeat of the declaration')
})
