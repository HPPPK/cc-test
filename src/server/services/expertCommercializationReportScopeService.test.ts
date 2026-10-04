import { describe, expect, test } from 'bun:test'
import { commercializationReportSourceBoundary, ensureCommercializationReportSourceBoundary } from './expertCommercializationReportScopeService.js'

describe('commercialization report source scope', () => {
  test('adds a non-blocking source boundary once for string declarations', () => {
    const original = {
      REPORT_SCOPE: '中国与海外双线；覆盖官网、社区与内容平台候选。',
      DATA_DECLARATION: '**已核验事实**：已打开的具体页面见来源表。',
    }

    const first = ensureCommercializationReportSourceBoundary({
      expertId: 'commercialization-research-report',
      fields: original,
    })
    const second = ensureCommercializationReportSourceBoundary({
      expertId: 'commercialization-research-report',
      fields: first,
    })

    expect(first).not.toBe(original)
    expect(first.REPORT_SCOPE).toBe(original.REPORT_SCOPE)
    expect(String(first.DATA_DECLARATION)).toContain(commercializationReportSourceBoundary)
    expect(second).toEqual(first)
  })

  test('preserves paragraph declarations while adding the source boundary once', () => {
    const original = {
      DATA_DECLARATION: ['**已核验事实**：具体页面已列入来源表。', '**证据缺口**：未打开的平台不作内容结论。'],
    }

    const first = ensureCommercializationReportSourceBoundary({
      expertId: 'commercialization-research-report',
      fields: original,
    })
    const second = ensureCommercializationReportSourceBoundary({
      expertId: 'commercialization-research-report',
      fields: first,
    })

    expect(first.DATA_DECLARATION).toEqual([
      ...original.DATA_DECLARATION,
      '**来源范围**：' + commercializationReportSourceBoundary,
    ])
    expect(second).toEqual(first)
  })

  test('does not alter unrelated experts or incomplete payloads', () => {
    const unrelated = { DATA_DECLARATION: '原说明' }
    expect(ensureCommercializationReportSourceBoundary({ expertId: 'other-expert', fields: unrelated })).toBe(unrelated)

    const withoutDeclaration = { REPORT_SCOPE: '范围' }
    expect(ensureCommercializationReportSourceBoundary({
      expertId: 'commercialization-research-report',
      fields: withoutDeclaration,
    })).toBe(withoutDeclaration)
  })
})


test('points to the complete 119-link visit inventory without calling it factual citations', () => {
  const result = ensureCommercializationReportSourceBoundary({ expertId: 'commercialization-research-report', fields: { DATA_DECLARATION: 'Evidence' } })
  expect(result.DATA_DECLARATION).toContain('commercialization-research/06-browser-audit.md')
  expect(result.DATA_DECLARATION).toContain('119')
  expect(result.DATA_DECLARATION).toContain('不等于事实来源')
})


test('missing final citation is not evidence of an unopened or restricted page', () => {
  expect(commercializationReportSourceBoundary).toContain('已取得但未采用')
  expect(commercializationReportSourceBoundary).toContain('未列入来源表不等于未取得')
  expect(commercializationReportSourceBoundary).not.toContain('仅可表示候选检索入口')
})

const priorGeneratedBoundary = "本轮实际采用的网页证据以“信息来源与说明”表列出的 URL 为准；未列入该表的平台或链接，仅可表示候选检索入口、访问受限或无结果记录、或者后续渠道建议，不代表已完成内容取证。公司 119 个入口及开放平台的完整访问清单见 commercialization-research/06-browser-audit.md（包含已打开、受限、失败、未完成）；访问记录不等于事实来源。"


test.each(['string', 'paragraphs'])('replaces the previous generated boundary without contradictory appended wording (%s)', (shape) => {
  const original = '用户说明保留。\n\n**来源范围**：' + priorGeneratedBoundary
  const fields = { DATA_DECLARATION: shape === 'string' ? original : [original] }
  const result = ensureCommercializationReportSourceBoundary({ expertId: 'commercialization-research-report', fields })
  expect(JSON.stringify(result.DATA_DECLARATION)).not.toContain(priorGeneratedBoundary)
  expect(JSON.stringify(result.DATA_DECLARATION)).toContain('用户说明保留')
  expect(JSON.stringify(result.DATA_DECLARATION).split(commercializationReportSourceBoundary)).toHaveLength(2)
  expect(ensureCommercializationReportSourceBoundary({ expertId: 'commercialization-research-report', fields: result })).toEqual(result)
  expect(fields.DATA_DECLARATION).toEqual(shape === 'string' ? original : [original])
})
