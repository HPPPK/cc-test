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


  test('renders source rows with internal audit metadata without exposing it', () => {
    const { content } = renderExpertTemplateFill(template, {
      format: EXPERT_TEMPLATE_FILL_FORMAT,
      templateId: 'demo-v1',
      fields: {
        REPORT_TITLE: '来源审计',
        REPORT_DATE: '2026-08-20',
        SOURCE_ROWS: [{
          value: ['Bing', 'https://example.com/search?q=product'],
          auditId: 'bing-serp-cn',
        }],
        NOTES: ['来源状态由服务器审计绑定。'],
      },
    })

    expect(content).toContain('<td>Bing</td>')
    expect(content).toContain('https://example.com/search?q=product')
    expect(content).not.toContain('bing-serp-cn')
  })

  test('renders safe Markdown-light emphasis and lists in paragraph slots', () => {
    const { content } = renderExpertTemplateFill(template, {
      format: EXPERT_TEMPLATE_FILL_FORMAT,
      templateId: 'demo-v1',
      fields: {
        REPORT_TITLE: '新品 **调研**',
        REPORT_DATE: '2026-08-17',
        SOURCE_ROWS: [['官网', 'https://example.com/pricing']],
        NOTES: [
          '**结论**：先验证迁移理由。\n- **已核验事实**：官网公开了定价边界。\n- （AI推断）：迁移成本可能高于功能差异。',
          '1. 先做可用性测试。\n2. 再测试付费意愿。\n<script>alert(1)</script>',
        ],
      },
    })

    expect(content).toContain('<strong>结论</strong>：先验证迁移理由。')
    expect(content).toContain('<ul><li><strong>已核验事实</strong>：官网公开了定价边界。</li>')
    expect(content).toContain('<ol><li>先做可用性测试。</li><li>再测试付费意愿。</li>')
    expect(content).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(content).not.toContain('<script>alert(1)</script>')
  })

  test('renders the real commercialization v4 template with rich top summaries and decision fields', async () => {
    const commercializationTemplate = await Bun.file('experts/commercialization-research-report/templates/commercialization-research-report-template.html').text()
    const schema = deriveExpertTemplateFillSchema(commercializationTemplate)
    const fields = Object.fromEntries(schema.fields.map((field) => {
      if (field.kind === 'text') {
        const value = field.id === 'REPORT_TITLE' ? '鼠标快捷效率工具 **验证版**' : '**已整理的报告字段**'
        return [field.id, value]
      }
      if (field.kind === 'paragraphs') return [field.id, ['**当前判断**：保留证据边界。\n- **已核验事实**：公开页面已打开。\n- **（AI推断）**：下一步需任务测试。']]
      return [field.id, [field.columns.map((_, index) => index === field.urlColumnIndex ? 'https://example.com/source' : '示例字段')]]
    }))

    const { content } = renderExpertTemplateFill(commercializationTemplate, {
      format: EXPERT_TEMPLATE_FILL_FORMAT,
      templateId: schema.templateId,
      fields,
    })

    expect(schema.templateId).toBe('commercialization-research-classic-v4')
    expect(schema.fields.map((field) => field.id)).toEqual(expect.arrayContaining([
      'RISKS_AND_COUNTEREVIDENCE_ROWS',
      'VALIDATION_GATE_ROWS',
      'NEXT_STEP_PLAN_CONTENT',
    ]))
    expect(schema.fields.find((field) => field.id === 'DATA_DECLARATION')).toMatchObject({ kind: 'paragraphs' })
    expect(schema.fields.find((field) => field.id === 'EVIDENCE_STATUS_SUMMARY')).toMatchObject({ kind: 'paragraphs' })
    expect(schema.fields.find((field) => field.id === 'CORE_DECISION_CONCLUSION')).toMatchObject({ kind: 'paragraphs' })
    expect(content).toContain('2.5 关键反证与决策风险')
    expect(content).toContain('2.1 核心结论')
    expect(content).toContain('1.3 产品形态与使用场景')
    expect(content).toContain('六、验证闸门与下一步')
    expect(content).toContain('2.4 各平台流量热度统计 - 需求真实性的量化证据')
    expect(content).toContain('平台 / 渠道')
    expect(content).toContain('热度指标')
    expect(content).toContain('6.2 建议执行顺序')
    expect(content).toContain('<strong>当前判断</strong>：保留证据边界。')
    expect(content).toContain('<ul><li><strong>已核验事实</strong>：公开页面已打开。</li>')
    expect(content).not.toMatch(/{{[A-Z0-9_]+}}|SLOT:/)
  })

  test('renders a complete column-name object row in the template column order', () => {
    const { content } = renderExpertTemplateFill(template, {
      format: EXPERT_TEMPLATE_FILL_FORMAT,
      templateId: 'demo-v1',
      fields: {
        REPORT_TITLE: '列名对象来源表',
        REPORT_DATE: '2026-08-26',
        SOURCE_ROWS: [{
          '名称': 'Bing 中文 SERP 审计',
          '链接（URL）': 'https://www.bing.com/search?q=Quicker+mouse+middle+button',
          auditId: 'bing-serp-cn',
        }],
        NOTES: ['该来源行由模型按母版列名提交。'],
      },
    })

    expect(content).toContain('<td>Bing 中文 SERP 审计</td>')
    expect(content).toContain('<a href="https://www.bing.com/search?q=Quicker+mouse+middle+button">https://www.bing.com/search?q=Quicker+mouse+middle+button</a>')
    expect(content).not.toContain('bing-serp-cn')
  })

  test('rejects incomplete or extra-visible column-name object rows', () => {
    const baseFields = {
      REPORT_TITLE: '列名对象校验',
      REPORT_DATE: '2026-08-26',
      NOTES: ['应保留母版表格契约。'],
    }

    expect(() => renderExpertTemplateFill(template, {
      format: EXPERT_TEMPLATE_FILL_FORMAT,
      templateId: 'demo-v1',
      fields: {
        ...baseFields,
        SOURCE_ROWS: [{ '名称': '缺少链接' }],
      },
    })).toThrow('表格区域 SOURCE_ROWS 第 1 行必须恰好填写 2 个非空单元格')

    expect(() => renderExpertTemplateFill(template, {
      format: EXPERT_TEMPLATE_FILL_FORMAT,
      templateId: 'demo-v1',
      fields: {
        ...baseFields,
        SOURCE_ROWS: [{
          '名称': '额外字段',
          '链接（URL）': 'https://example.com/source',
          '额外可见字段': '不得静默吸收',
        }],
      },
    })).toThrow('表格区域 SOURCE_ROWS 第 1 行必须恰好填写 2 个非空单元格')
  })

  test('renders an explicit table empty state without weakening real URL validation', () => {
    const emptyStateTemplate = template.replace(
      '<table>',
      '<table data-empty-state="本轮未取得可核验公开来源；相关结论已降级为证据缺口。">',
    )
    const schema = deriveExpertTemplateFillSchema(emptyStateTemplate)

    expect(schema.fields.find((field) => field.id === 'SOURCE_ROWS')).toMatchObject({
      kind: 'table-rows',
      urlColumnIndex: 1,
      emptyState: '本轮未取得可核验公开来源；相关结论已降级为证据缺口。',
    })

    const { content } = renderExpertTemplateFill(emptyStateTemplate, {
      format: EXPERT_TEMPLATE_FILL_FORMAT,
      templateId: 'demo-v1',
      fields: {
        REPORT_TITLE: '证据缺口版',
        REPORT_DATE: '2026-08-17',
        SOURCE_ROWS: [],
        NOTES: ['**证据缺口：** 本轮没有可引用的公开网页来源。'],
      },
    })

    expect(content).toContain('<tr class="template-empty-state"><td colspan="2">本轮未取得可核验公开来源；相关结论已降级为证据缺口。</td></tr>')
    expect(content).not.toContain('href="未取得"')
  })

  test('renders the commercialization template as an evidence-gap report when no usable public URL remains', async () => {
    const commercializationTemplate = await Bun.file('experts/commercialization-research-report/templates/commercialization-research-report-template.html').text()
    const schema = deriveExpertTemplateFillSchema(commercializationTemplate)
    const fields = Object.fromEntries(schema.fields.map((field) => {
      if (field.kind === 'text') return [field.id, field.id === 'REPORT_TITLE' ? '零来源验证版' : '待验证']
      if (field.kind === 'paragraphs') return [field.id, ['**证据缺口：** 本轮没有可核验公开来源；不据此作市场、定价或渠道事实判断。']]
      if (field.id === 'SOURCE_ROWS') return [field.id, []]
      return [field.id, [field.columns.map((_, index) => index === field.urlColumnIndex ? 'https://example.com/source' : '示例字段')]]
    }))

    const { content } = renderExpertTemplateFill(commercializationTemplate, {
      format: EXPERT_TEMPLATE_FILL_FORMAT,
      templateId: schema.templateId,
      fields,
    })

    expect(content).toContain('本轮未取得可核验公开来源；报告中的外部结论均已明确标为证据缺口、待验证或有依据的 AI 推断。')
    expect(content).toContain('template-empty-state')
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


test('reports all invalid template fields together without discarding valid fields', () => {
  let message = ''
  try {
    renderExpertTemplateFill(template, { format: EXPERT_TEMPLATE_FILL_FORMAT, templateId: 'demo-v1', fields: {
      REPORT_TITLE: 'Valid title', EXTRA_NOTE: 'Do not silently discard', SOURCE_ROWS: [['bad'], ['also bad']], NOTES: [],
    } })
  } catch (error) { message = (error as Error).message }
  for (const part of ['EXTRA_NOTE', 'REPORT_DATE', 'SOURCE_ROWS', 'NOTES', '第 1 行', '第 2 行']) expect(message).toContain(part)
})
