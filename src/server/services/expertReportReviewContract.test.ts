import { describe, expect, test } from 'bun:test'
import { parseExpertReportReviewContract } from './expertReportReviewContract.js'

const block = (value: unknown) => 'Review prose says no patch.\n```expert-report-review\n' + JSON.stringify(value && typeof value === 'object' && !Array.isArray(value) ? { calculations: [], ...value } : value) + '\n```'
const finding = { fieldId: 'TITLE', kind: 'factual-error', reason: 'The captured source attributes this feature to another product.' }

describe('structured final report review contract', () => {
  test('derives required corrections from every nonoptional finding regardless of prose', () => {
    expect(parseExpertReportReviewContract(block({ version: 1, findings: [finding, { ...finding, fieldId: 'SOURCES', kind: 'source-error' }, { ...finding, kind: 'supported-omission' }, { ...finding, fieldId: 'OPTIONAL', kind: 'optional' }] }), ['TITLE', 'SOURCES', 'OPTIONAL']).requiredFields).toEqual(['TITLE', 'SOURCES'])
    expect(parseExpertReportReviewContract(block({ version: 1, findings: [] }), ['TITLE']).requiredFields).toEqual([])
    expect(parseExpertReportReviewContract(block({ version: 1, findings: [{ ...finding, kind: 'optional' }] }), ['TITLE']).requiredFields).toEqual([])
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
