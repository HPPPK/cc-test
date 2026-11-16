import { describe, expect, test } from 'bun:test'
import { parseExpertReportReviewContract, reportCitationGaps } from './expertReportReviewContract.js'

const block = (value: unknown) => 'Review prose says no patch.\n```expert-report-review\n' + JSON.stringify(value && typeof value === 'object' && !Array.isArray(value) ? { calculations: [], ...value } : value) + '\n```'
const finding = { fieldId: 'TITLE', kind: 'factual-error', reason: 'The captured source attributes this feature to another product.' }

describe('structured final report review contract', () => {
  test('derives required corrections from every nonoptional finding regardless of prose', () => {
    expect(parseExpertReportReviewContract(block({ version: 1, findings: [finding, { ...finding, fieldId: 'SOURCES', kind: 'source-error' }, { ...finding, kind: 'supported-omission' }, { ...finding, fieldId: 'OPTIONAL', kind: 'optional' }] }), ['TITLE', 'SOURCES', 'OPTIONAL']).requiredFields).toEqual(['TITLE', 'SOURCES'])
    expect(parseExpertReportReviewContract(block({ version: 1, findings: [] }), ['TITLE']).requiredFields).toEqual([])
    expect(parseExpertReportReviewContract(block({ version: 1, findings: [{ ...finding, kind: 'optional' }] }), ['TITLE']).requiredFields).toEqual([])
  })

  test('names the exact invalid finding path and actual field IDs for correction', () => {
    expect(() => parseExpertReportReviewContract(block({ version: 1, findings: [{ ...finding, fieldId: '5.1' }] }), ['TITLE', 'COMPETITOR_LANDSCAPE_ROWS']))
      .toThrow('findings[0].fieldId')
    expect(() => parseExpertReportReviewContract(block({ version: 1, findings: [{ ...finding, fieldId: '5.1' }] }), ['TITLE', 'COMPETITOR_LANDSCAPE_ROWS']))
      .toThrow('COMPETITOR_LANDSCAPE_ROWS')
  })

  test.each([
    '', block({ version: 1, findings: [] }) + '\n' + block({ version: 1, findings: [] }),
    '```expert-report-review\ninvalid JSON\n```',
    block({ version: 2, findings: [] }), block({ version: 1, findings: [], requiresPatch: false }),
    block({ version: 1, findings: {} }), block({ version: 1, findings: [null] }),
    block({ version: 1, findings: [{ ...finding, fieldId: 'INVENTED_FIELD' }] }),
    block({ version: 1, findings: [{ ...finding, kind: 'warning' }] }),
    block({ version: 1, findings: [{ ...finding, kind: ['optional'] }] }),
    block({ version: 1, findings: [{ ...finding, reason: '' }] }),
    block({ version: 1, findings: [{ ...finding, reason: '<script>raw HTML</script>' }] }),
    block({ version: 1, findings: [{ ...finding, reason: 'x'.repeat(2001) }] }),
    block({ version: 1, findings: [{ ...finding, extra: true }] }),
    block({ version: 1, findings: Array.from({ length: 65 }, () => finding) }),
  ])('rejects missing, malformed, unbounded or invented contract data', content => {
    expect(() => parseExpertReportReviewContract(content, ['TITLE'])).toThrow()
  })
})


describe('report unit-cost arithmetic', () => {
  const calculation = { fieldId: 'COST', amount: 120, amountPeriod: 'year', allowance: 10, allowancePeriod: 'month', unitsPerTask: 1, reportedCost: 12 }
  test('normalizes annual and monthly periods and requires a field when reported cost is wrong', () => {
    const parsed = parseExpertReportReviewContract(block({ version: 1, findings: [], calculations: [calculation] }), ['COST'])
    expect(parsed.requiredFields).toEqual(['COST'])
    expect(parsed.calculationMismatches).toEqual([{ fieldId: 'COST', expectedCost: 1, reportedCost: 12 }])
    expect(parseExpertReportReviewContract(block({ version: 1, findings: [], calculations: [{ ...calculation, amount: 10, amountPeriod: 'month', allowance: 120, allowancePeriod: 'year', reportedCost: 1 }] }), ['COST']).requiredFields).toEqual([])
    expect(parseExpertReportReviewContract(block({ version: 1, findings: [], calculations: [{ ...calculation, amountPeriod: 'month', allowancePeriod: 'month', reportedCost: 12.001 }] }), ['COST']).requiredFields).toEqual([])
  })
  test.each([{ allowance: 0 }, { unitsPerTask: 0 }, { amount: -1 }, { reportedCost: -1 }, { amountPeriod: 'week' }, { amountPeriod: ['month'] }, { amountPeriod: 'one-time' }, { extra: true }])('rejects invalid or non-comparable calculation: %j', change => {
    expect(() => parseExpertReportReviewContract(block({ version: 1, findings: [], calculations: [{ ...calculation, ...change }] }), ['COST'])).toThrow()
  })
  test('requires the calculations array even for a prose-only review', () => {
    expect(() => parseExpertReportReviewContract('```expert-report-review\n{"version":1,"findings":[]}\n```', ['COST'])).toThrow()
  })
})


test('checks actual final citation links without imposing source counts or full-text requirements', () => {
  const fields = { NOTES: ['搜索摘要显示功能请求，正文未核验 [S14]。', '（AI推断）可先测试一项任务。'], SOURCE_ROWS: [['[S9]', '真实搜索摘要', '相关线索', '今天', 'https://example.com/search?q=task']] }
  expect(reportCitationGaps(fields)).toEqual(['[S14]'])
  expect(reportCitationGaps({ ...fields, SOURCE_ROWS: [...fields.SOURCE_ROWS, ['[S14]', '搜索摘要', '原文未核验', '今天', 'https://example.com/search?q=request']] })).toEqual([])
  expect(reportCitationGaps({ NOTES: '没有观察证据，仅建议测试。', SOURCE_ROWS: [] })).toEqual([])
  expect(reportCitationGaps({ NOTES: '用户记录[1]与摘录[S2]', SOURCE_ROWS: [{ value: ['[1]', '用户提供'] }, ['[S2]', '页面摘要']] })).toEqual([])
})

test('keeps ordinary source-label and inline-link formats valid', () => {
  expect(reportCitationGaps({ NOTES: '摘要[S14]、用户资料[1]、行内来源[S2](https://example.com/post)。', SOURCE_ROWS: [['S14', '搜索页'], [1, '用户提供']] })).toEqual([])
})

test('accepts several citation labels bound to one genuine source row', () => {
  expect(reportCitationGaps({ REPORT_TITLE: '两个观察 [S1] [S2]', SOURCE_ROWS: [['[S1]、[S2]', '同一真实页面', 'https://example.com/']] })).toEqual([])
})

test('accepts ordinary Markdown source definitions without forcing a source-table label format', () => {
  expect(reportCitationGaps({ REPORT_TITLE: '已取得的相关摘要 [S3]', REPORT_NOTE: '[S3]: https://example.com/search?q=task', SOURCE_ROWS: [] })).toEqual([])
})
