import { describe, expect, test } from 'bun:test'
import {
  deriveExpertTemplateFillSchema,
  EXPERT_TEMPLATE_FILL_FORMAT,
  renderExpertTemplateFill,
} from './expertTemplateFill.js'

const template = `<html data-template-id="demo-v1"><head><style>body{color:#111}</style></head><body>
<h1>{{REPORT_TITLE}}</h1>
<p>{{REPORT_DATE}}</p>
<table><thead><tr><th>名称</th><th>链接（URL）</th></tr></thead><tbody><!-- SLOT: SOURCE_ROWS --></tbody></table>
<!-- SLOT: NOTES -->
</body></html>`

describe('expert template fill', () => {
  test('derives text, paragraph and table fields from a pack template without expert-specific code', () => {
    expect(deriveExpertTemplateFillSchema(template)).toEqual({
      format: EXPERT_TEMPLATE_FILL_FORMAT,
      templateId: 'demo-v1',
      fields: [
        { id: 'REPORT_TITLE', kind: 'text' },
        { id: 'REPORT_DATE', kind: 'text' },
        { id: 'SOURCE_ROWS', kind: 'table-rows', columns: ['名称', '链接（URL）'], urlColumnIndex: 1 },
        { id: 'NOTES', kind: 'paragraphs' },
      ],
    })
  })

  test('renders field data into the fixed template without accepting model HTML', () => {
    const { content } = renderExpertTemplateFill(template, {
      format: EXPERT_TEMPLATE_FILL_FORMAT,
      templateId: 'demo-v1',
      fields: {
        REPORT_TITLE: '新品 <测试>',
        REPORT_DATE: '2026-07-28',
        SOURCE_ROWS: [['官网', 'https://example.com/path?a=1']],
        NOTES: ['第一条说明', '第二条说明'],
      },
    })

    expect(content).toContain('<h1>新品 &lt;测试&gt;</h1>')
    expect(content).toContain('<a href="https://example.com/path?a=1">https://example.com/path?a=1</a>')
    expect(content).toContain('<p>第一条说明</p>')
    expect(content).toContain('body{color:#111}')
    expect(content).not.toContain('{{REPORT_TITLE}}')
    expect(content).not.toContain('SLOT:')
  })

  test('renders the unambiguous value/Count table wrapper emitted by some providers', () => {
    const { content } = renderExpertTemplateFill(template, {
      format: EXPERT_TEMPLATE_FILL_FORMAT,
      templateId: 'demo-v1',
      fields: {
        REPORT_TITLE: '新品',
        REPORT_DATE: '2026-08-04',
        SOURCE_ROWS: [{ value: ['官网', 'https://example.com/pricing'], Count: 2 }],
        NOTES: ['第一条说明'],
      },
    })

    expect(content).toContain('<td>官网</td>')
    expect(content).toContain('<a href="https://example.com/pricing">https://example.com/pricing</a>')
  })

  test('does not duplicate a title suffix already supplied by the report field', () => {
    const titledTemplate = '<html data-template-id="title-v1"><body><h1>{{REPORT_TITLE}} · 商业化调研报告</h1></body></html>'
    const { content } = renderExpertTemplateFill(titledTemplate, {
      format: EXPERT_TEMPLATE_FILL_FORMAT,
      templateId: 'title-v1',
      fields: { REPORT_TITLE: 'Mac Markdown 阅读器 · 商业化调研报告' },
    })

    expect(content).toContain('<h1>Mac Markdown 阅读器 · 商业化调研报告</h1>')
    expect(content).not.toContain('商业化调研报告 · 商业化调研报告')
  })

  test('rejects missing fields, invalid table widths and non-http source URLs', () => {
    expect(() => renderExpertTemplateFill(template, {
      format: EXPERT_TEMPLATE_FILL_FORMAT,
      templateId: 'demo-v1',
      fields: { REPORT_TITLE: 'x' },
    })).toThrow('缺少模板字段：REPORT_DATE')

    expect(() => renderExpertTemplateFill(template, {
      format: EXPERT_TEMPLATE_FILL_FORMAT,
      templateId: 'demo-v1',
      fields: {
        REPORT_TITLE: 'x',
        REPORT_DATE: '2026-07-28',
        SOURCE_ROWS: [['only one cell']],
        NOTES: ['note'],
      },
    })).toThrow('恰好填写 2 个非空单元格')

    expect(() => renderExpertTemplateFill(template, {
      format: EXPERT_TEMPLATE_FILL_FORMAT,
      templateId: 'demo-v1',
      fields: {
        REPORT_TITLE: 'x',
        REPORT_DATE: '2026-07-28',
        SOURCE_ROWS: [['官网', 'file:///not-allowed']],
        NOTES: ['note'],
      },
    })).toThrow('必须是 http 或 https 链接')
  })


})
