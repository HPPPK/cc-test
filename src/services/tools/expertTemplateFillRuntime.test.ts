import * as path from 'node:path'
import { afterEach, describe, expect, test } from 'bun:test'
import {
  currentExpertTemplateOutputReviewContext,
  expertTemplateFillPostWriteNotice,
  isCurrentExpertTemplateOutputReviewReportPath,
  isSessionResearchArtifactReadAllowed,
  recordMainAgentReportCompletenessReviewRead,
  recordMainAgentReportFieldAbsorptionRead,
  renderExpertTemplateFillForWrite,
  resetMainAgentReportFieldAbsorptionReadsForTests,
} from './expertTemplateFillRuntime.js'

const envKeys = [
  'CC_JIANGXIA_EXPERT_TEMPLATE_FILL_WRITE',
  'CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT',
  'CC_JIANGXIA_EXPERT_SESSION_ID',
  'CC_JIANGXIA_DESKTOP_SERVER_URL',
  'CC_JIANGXIA_EXPERT_RESEARCH_ARTIFACT_POLICY',
] as const

const initialEnv = new Map(envKeys.map((key) => [key, process.env[key]]))
const initialFetch = globalThis.fetch

function enableTemplateFillSession(): void {
  process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_WRITE = '1'
  process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT = 'C:/expert-session-output'
  process.env.CC_JIANGXIA_EXPERT_SESSION_ID = 'expert-session-1'
  process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = 'http://127.0.0.1:3456/'
}

afterEach(() => {
  for (const key of envKeys) {
    const value = initialEnv.get(key)
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  resetMainAgentReportFieldAbsorptionReadsForTests()
  globalThis.fetch = initialFetch
})

describe('expert template-fill Write runtime', () => {
  test('returns a specific repair instruction for an accidental empty Write without calling the renderer', async () => {
    enableTemplateFillSession()
    let rendererCalled = false
    globalThis.fetch = async () => {
      rendererCalled = true
      return new Response('{}')
    }

    await expect(renderExpertTemplateFillForWrite({})).rejects.toThrow('EXPERT_TEMPLATE_FILL_REPAIR_REQUIRED')
    await expect(renderExpertTemplateFillForWrite({})).rejects.toThrow('otherwise mode="finalize"')
    expect(rendererCalled).toBe(false)
  })


  test('normalizes an absolute final report path in the active workDir but rejects another destination', async () => {
    enableTemplateFillSession()
    let rendererCalls = 0
    globalThis.fetch = async () => {
      rendererCalls++
      return new Response(JSON.stringify({ templateId: 'commercialization-report-v1', content: '<html>report</html>' }))
    }

    const inSessionPath = path.resolve('C:/expert-session-output', 'report.html')
    await expect(renderExpertTemplateFillForWrite({
      file_path: inSessionPath,
      content: '',
      expert_output: { templateId: 'commercialization-report-v1', fields: {} },
    })).resolves.toEqual({
      kind: 'rendered-template-fill',
      confirmWrite: expect.any(Function),
      filePath: inSessionPath,
      content: '<html>report</html>',
      templateId: 'commercialization-report-v1',
    })
    expect(rendererCalls).toBe(1)

    await expect(renderExpertTemplateFillForWrite({
      file_path: path.resolve('C:/another-session-output', 'report.html'),
      content: '',
      expert_output: { templateId: 'commercialization-report-v1', fields: {} },
    })).rejects.toThrow('parent is exactly the current session workDir')
    expect(rendererCalls).toBe(1)
  })

  test('rejects a dynamic research brief until it assigns a complete Route plan to every researcher', async () => {
    enableTemplateFillSession()
    process.env.CC_JIANGXIA_EXPERT_RESEARCH_ARTIFACT_POLICY = JSON.stringify({
      mode: 'markdown-path-only',
      directory: 'commercialization-research',
      briefPath: 'commercialization-research/01-research-brief.md',
      researcherPaths: [
        'commercialization-research/02-competitors.md',
        'commercialization-research/03-user-needs.md',
        'commercialization-research/04-channels.md',
      ],
      reviewerPath: 'commercialization-research/05-evidence-review.md',
      auditPath: 'commercialization-research/06-browser-audit.md',
      routeCompletion: { mode: 'dynamic-route-status-v1' },
      maxCharacters: 90_000,
    })
    const file_path = 'commercialization-research/01-research-brief.md'

    await expect(renderExpertTemplateFillForWrite({
      file_path,
      content: '# AI 老照片修复调研 Brief\n\n- 还没有把来源路线分派给三个研究员。',
    })).rejects.toThrow('EXPERT_RESEARCH_BRIEF_ROUTE_PLAN_REQUIRED')

    const content = [
      '# AI 老照片修复调研 Brief',
      '### Route: competitor-official-pricing',
      '- Owner report: 02-competitors.md',
      '- Goal: 核验公开竞品能力、价格和免费边界。',
      '- First route: 打开候选竞品官网、产品页和价格页。',
      '- Fallback route: 打开另一家公开竞品官网或帮助页。',
      '- Completion bar: 一家已打开的官方产品或定价页直接回答功能、价格或免费边界。',
      '### Route: family-restoration-demand',
      '- Owner report: commercialization-research/03-user-needs.md',
      '- Goal: 寻找家庭老照片修复的具体任务、抱怨与信任顾虑。',
      '- First route: 打开公开社区讨论或应用评价。',
      '- Fallback route: 打开另一公开社区、Issue 或问答页。',
      '- Completion bar: 至少一条具体公开用户表达说明任务和当前替代；搜索页仅发现候选。',
      '### Route: acquisition-public-paths',
      '- Owner report: 04-channels.md',
      '- Goal: 核验商店、内容平台和任务词落地页。',
      '- First route: 打开应用商店、内容平台或官网分发页。',
      '- Fallback route: 打开另一公开商店或内容落地页。',
      '- Completion bar: 已打开的具体商店、分发或内容页能回答该字段，而不是仅有搜索候选。',
    ].join('\n')

    await expect(renderExpertTemplateFillForWrite({ file_path, content })).resolves.toMatchObject({
      kind: 'research-artifact',
      filePath: path.resolve('C:/expert-session-output', file_path),
    })
  })

  test('requires a default dual-market brief to explicitly plan Chinese and overseas source lanes before researchers start', async () => {
    enableTemplateFillSession()
    process.env.CC_JIANGXIA_EXPERT_RESEARCH_ARTIFACT_POLICY = JSON.stringify({
      mode: 'markdown-path-only',
      directory: 'commercialization-research',
      briefPath: 'commercialization-research/01-research-brief.md',
      researcherPaths: [
        'commercialization-research/02-competitors.md',
        'commercialization-research/03-user-needs.md',
        'commercialization-research/04-channels.md',
      ],
      reviewerPath: 'commercialization-research/05-evidence-review.md',
      auditPath: 'commercialization-research/06-browser-audit.md',
      routeCompletion: {
        mode: 'dynamic-route-status-v1',
        defaultMarketScope: 'dual',
        requiredSourceLanesByReport: {
          'commercialization-research/03-user-needs.md': ['cn-user', 'global-user'],
          'commercialization-research/04-channels.md': ['cn-channel', 'global-channel'],
        },
        sourceLanes: {
          'cn-user': { hostSuffixes: ['zhihu.com'] },
          'global-user': { hostSuffixes: ['reddit.com'] },
          'cn-channel': { hostSuffixes: ['bilibili.com'] },
          'global-channel': { hostSuffixes: ['youtube.com'] },
        },
      },
      maxCharacters: 90_000,
    })
    const file_path = 'commercialization-research/01-research-brief.md'
    const withoutMarketOrLanes = [
      '# AI 老照片修复调研 Brief',
      '### Route: competitors',
      '- Owner report: 02-competitors.md',
      '- Goal: 核验竞品、价格和免费边界。',
      '- First route: 打开官网和价格页。',
      '- Fallback route: 打开另一竞品官方页。',
      '- Completion bar: 具体官方页面支持功能或价格判断。',
      '### Route: users',
      '- Owner report: 03-user-needs.md',
      '- Goal: 核验用户任务、痛点与替代。',
      '- First route: 打开公开讨论。',
      '- Fallback route: 打开另一公开讨论。',
      '- Completion bar: 具体用户表达支持任务或替代观察。',
      '### Route: channels',
      '- Owner report: 04-channels.md',
      '- Goal: 核验发现与分发路径。',
      '- First route: 打开商店或内容页。',
      '- Fallback route: 打开另一公开入口。',
      '- Completion bar: 具体落地页支持渠道观察。',
    ].join('\n')

    await expect(renderExpertTemplateFillForWrite({ file_path, content: withoutMarketOrLanes }))
      .rejects.toThrow('EXPERT_RESEARCH_BRIEF_ROUTE_PLAN_REQUIRED')

    const dualMarketPlan = [
      '# AI 老照片修复调研 Brief',
      '- Market scope: dual',
      '### Route: competitors',
      '- Owner report: 02-competitors.md',
      '- Goal: 核验竞品、价格和免费边界。',
      '- First route: 打开官网和价格页。',
      '- Fallback route: 打开另一竞品官方页。',
      '- Completion bar: 具体官方页面支持功能或价格判断。',
      '### Route: cn-users',
      '- Owner report: 03-user-needs.md',
      '- Source lane: cn-user',
      '- Goal: 核验中文用户任务、痛点与替代。',
      '- First route: 打开中文公开讨论。',
      '- Fallback route: 打开另一中文公开讨论。',
      '- Completion bar: 具体用户表达支持任务或替代观察。',
      '### Route: global-users',
      '- Owner report: 03-user-needs.md',
      '- Source lane: global-user',
      '- Goal: 核验海外用户任务、痛点与替代。',
      '- First route: 打开海外公开讨论。',
      '- Fallback route: 打开另一海外公开讨论。',
      '- Completion bar: 具体用户表达支持任务或替代观察。',
      '### Route: cn-channels',
      '- Owner report: 04-channels.md',
      '- Source lane: cn-channel',
      '- Goal: 核验中文发现与分发路径。',
      '- First route: 打开中文商店或内容页。',
      '- Fallback route: 打开另一中文公开入口。',
      '- Completion bar: 具体落地页支持渠道观察。',
      '### Route: global-channels',
      '- Owner report: 04-channels.md',
      '- Source lane: global-channel',
      '- Goal: 核验海外发现与分发路径。',
      '- First route: 打开海外商店或内容页。',
      '- Fallback route: 打开另一海外公开入口。',
      '- Completion bar: 具体落地页支持渠道观察。',
    ].join('\n')

    await expect(renderExpertTemplateFillForWrite({ file_path, content: dualMarketPlan })).resolves.toMatchObject({
      kind: 'research-artifact',
      filePath: path.resolve('C:/expert-session-output', file_path),
    })
  })

  test('accepts only the declared session Markdown research artifact without calling the renderer', async () => {
    enableTemplateFillSession()
    process.env.CC_JIANGXIA_EXPERT_RESEARCH_ARTIFACT_POLICY = JSON.stringify({
      mode: 'markdown-path-only',
      directory: 'commercialization-research',
      briefPath: 'commercialization-research/01-research-brief.md',
      researcherPaths: [
        'commercialization-research/02-competitors.md',
        'commercialization-research/03-user-needs.md',
        'commercialization-research/04-channels.md',
      ],
      reviewerPath: 'commercialization-research/05-evidence-review.md',
      auditPath: 'commercialization-research/06-browser-audit.md',
      maxCharacters: 90000,
    })
    let rendererCalled = false
    globalThis.fetch = async () => {
      rendererCalled = true
      return new Response('{}')
    }

    // Research workers use the ordinary Write shape. The runtime must derive
    // the internal artifact type from this session's declared path instead of
    // requiring the model to manufacture research_artifact.kind.
    await expect(renderExpertTemplateFillForWrite({
      file_path: 'commercialization-research/01-research-brief.md',
      content: `# 调研任务说明\n\n产品形态：桌面工具。`, 
    })).resolves.toEqual({
      kind: 'research-artifact',
      filePath: path.resolve('C:/expert-session-output', 'commercialization-research/01-research-brief.md'),
      content: `# 调研任务说明\n\n产品形态：桌面工具。`,
    })
    expect(rendererCalled).toBe(false)
    expect(isSessionResearchArtifactReadAllowed(
      'commercialization-research/01-research-brief.md',
      ['research-brief'],
    )).toBe(true)
    expect(isSessionResearchArtifactReadAllowed(
      'commercialization-research/02-competitors.md',
      ['research-brief'],
    )).toBe(false)
    // A read uses the same declared file whether the runtime supplies its
    // session-relative spelling or its canonical absolute spelling.
    expect(isSessionResearchArtifactReadAllowed(
      'C:/expert-session-output/commercialization-research/01-research-brief.md',
      ['research-brief'],
    )).toBe(true)

    await expect(renderExpertTemplateFillForWrite({
      file_path: 'commercialization-research/other.md',
      content: '# 不允许',
    })).rejects.toThrow('must exactly match a Markdown artifact declared')

    await expect(renderExpertTemplateFillForWrite({
      file_path: '../outside.md',
      content: '# 不允许',
    })).rejects.toThrow('must exactly match a Markdown artifact declared')

    await expect(renderExpertTemplateFillForWrite({
      file_path: 'commercialization-research/01-research-brief.md',
      content: '# 不允许',
      expert_output: { templateId: 'x', fields: {} },
    })).rejects.toThrow('Final Expert delivery must use one .html or .htm filename.')

  })

  test('requires complete parent absorption reading before final delivery and explains pagination recovery', async () => {
    enableTemplateFillSession()
    process.env.CC_JIANGXIA_EXPERT_RESEARCH_ARTIFACT_POLICY = JSON.stringify({
      mode: 'markdown-path-only',
      directory: 'commercialization-research',
      briefPath: 'commercialization-research/01-research-brief.md',
      researcherPaths: [
        'commercialization-research/02-competitors.md',
        'commercialization-research/03-user-needs.md',
        'commercialization-research/04-channels.md',
      ],
      reviewerPath: 'commercialization-research/05-evidence-review.md',
      auditPath: 'commercialization-research/06-browser-audit.md',
      absorptionPath: 'commercialization-research/07-report-field-absorption.md',
      maxCharacters: 90_000,
    })
    let rendererCalls = 0
    globalThis.fetch = async () => {
      rendererCalls++
      return new Response(JSON.stringify({ templateId: 'commercialization-report-v1', content: '<html>report</html>' }))
    }
    const finalWrite = {
      file_path: 'report.html',
      content: '',
      expert_output: { templateId: 'commercialization-report-v1', fields: {} },
    }

    await expect(renderExpertTemplateFillForWrite(finalWrite)).rejects.toThrow('EXPERT_TEMPLATE_FILL_REPORT_ABSORPTION_READ_REQUIRED')
    expect(rendererCalls).toBe(0)
    await expect(renderExpertTemplateFillForWrite(finalWrite)).rejects.toThrow('支持分页累计读取')
    await expect(renderExpertTemplateFillForWrite(finalWrite)).rejects.toThrow('offset=1')

    recordMainAgentReportFieldAbsorptionRead('C:/expert-session-output/commercialization-research/07-report-field-absorption.md')
    await expect(renderExpertTemplateFillForWrite(finalWrite)).resolves.toMatchObject({ kind: 'rendered-template-fill' })
    expect(rendererCalls).toBe(1)
  })

  test('requires a constrained rendered-output review before a patch or no-change finalize, and exposes only the same-session report path', async () => {
    enableTemplateFillSession()
    process.env.CC_JIANGXIA_EXPERT_RESEARCH_ARTIFACT_POLICY = JSON.stringify({
      mode: 'markdown-path-only',
      directory: 'commercialization-research',
      briefPath: 'commercialization-research/01-research-brief.md',
      researcherPaths: ['commercialization-research/02-competitors.md'],
      reviewerPath: 'commercialization-research/05-evidence-review.md',
      auditPath: 'commercialization-research/06-browser-audit.md',
      absorptionPath: 'commercialization-research/07-report-field-absorption.md',
      completionReviewPath: 'commercialization-research/08-report-completeness-review.md',
      maxCharacters: 90_000,
    })
    let calls = 0
    globalThis.fetch = async () => {
      calls++
      return new Response(JSON.stringify({ templateId: 'commercialization-report-v1', content: '<html>report</html>' }))
    }
    recordMainAgentReportFieldAbsorptionRead('C:/expert-session-output/commercialization-research/07-report-field-absorption.md')

    const initial = await renderExpertTemplateFillForWrite({
      file_path: 'old-photo-report.html', content: '',
      expert_output: { templateId: 'commercialization-report-v1', fields: { EXECUTIVE_SUMMARY: 'draft' } },
    })
    expect(currentExpertTemplateOutputReviewContext()).toBeUndefined()
    if (initial.kind !== 'rendered-template-fill') throw new Error('expected rendered write')
    await initial.confirmWrite()

    const review = currentExpertTemplateOutputReviewContext()
    expect(review).toEqual({
      briefPath: 'commercialization-research/01-research-brief.md',
      absorptionPath: 'commercialization-research/07-report-field-absorption.md',
      completionReviewPath: 'commercialization-research/08-report-completeness-review.md',
      reportPath: path.resolve('C:/expert-session-output', 'old-photo-report.html'),
    })
    expect(isCurrentExpertTemplateOutputReviewReportPath(review?.reportPath)).toBe(true)
    expect(isCurrentExpertTemplateOutputReviewReportPath('C:/expert-session-output/other.html')).toBe(false)
    expect(expertTemplateFillPostWriteNotice(review?.reportPath)).toContain('expert-evidence-output-reviewer')

    await expect(renderExpertTemplateFillForWrite({
      file_path: 'old-photo-report.html',
      content: '',
      expert_output: { templateId: 'commercialization-report-v1', mode: 'patch', fields: { EXECUTIVE_SUMMARY: 'patched' } },
    })).rejects.toThrow('EXPERT_TEMPLATE_FILL_OUTPUT_REVIEW_READ_REQUIRED')
    await expect(renderExpertTemplateFillForWrite({
      file_path: 'old-photo-report.html',
      content: '',
      expert_output: { templateId: 'commercialization-report-v1', mode: 'finalize', fields: {} },
    })).rejects.toThrow('otherwise mode="finalize"')
    expect(calls).toBe(1)

    recordMainAgentReportCompletenessReviewRead('C:/expert-session-output/commercialization-research/08-report-completeness-review.md')
    expect(expertTemplateFillPostWriteNotice(review?.reportPath)).toBeUndefined()
    const finalized = await renderExpertTemplateFillForWrite({
      file_path: 'old-photo-report.html', content: '',
      expert_output: { templateId: 'commercialization-report-v1', mode: 'finalize', fields: {} },
    })
    if (finalized.kind !== 'rendered-template-fill') throw new Error('expected rendered write')
    await finalized.confirmWrite()
    expect(calls).toBe(2)
    expect(currentExpertTemplateOutputReviewContext()).toBeUndefined()
  })

  test('keeps an initial candidate patch in output review when the server marks the first rendered draft', async () => {
    enableTemplateFillSession()
    process.env.CC_JIANGXIA_EXPERT_RESEARCH_ARTIFACT_POLICY = JSON.stringify({
      mode: 'markdown-path-only', directory: 'commercialization-research',
      briefPath: 'commercialization-research/01-research-brief.md',
      researcherPaths: ['commercialization-research/02-competitors.md'],
      reviewerPath: 'commercialization-research/05-evidence-review.md',
      auditPath: 'commercialization-research/06-browser-audit.md',
      absorptionPath: 'commercialization-research/07-report-field-absorption.md',
      completionReviewPath: 'commercialization-research/08-report-completeness-review.md',
      maxCharacters: 90_000,
    })
    recordMainAgentReportFieldAbsorptionRead('C:/expert-session-output/commercialization-research/07-report-field-absorption.md')
    globalThis.fetch = async () => new Response(JSON.stringify({
      templateId: 'commercialization-report-v1', content: '<html>first repaired draft</html>', completionReviewRequired: true,
    }))
    const initial = await renderExpertTemplateFillForWrite({
      file_path: 'repaired-report.html', content: '',
      expert_output: { templateId: 'commercialization-report-v1', mode: 'patch', fields: { SOURCE_ROWS: [['[1]', 'https://example.com/']] } },
    })
    expect(currentExpertTemplateOutputReviewContext()).toBeUndefined()
    if (initial.kind !== 'rendered-template-fill') throw new Error('expected rendered write')
    await initial.confirmWrite()
    const review = currentExpertTemplateOutputReviewContext()
    expect(review?.reportPath).toBe(path.resolve('C:/expert-session-output', 'repaired-report.html'))
    expect(expertTemplateFillPostWriteNotice(review?.reportPath)).toContain('expert-evidence-output-reviewer')
    await expect(renderExpertTemplateFillForWrite({
      file_path: 'repaired-report.html', content: '',
      expert_output: { templateId: 'commercialization-report-v1', mode: 'finalize', fields: {} },
    })).rejects.toThrow('EXPERT_TEMPLATE_FILL_OUTPUT_REVIEW_READ_REQUIRED')
    recordMainAgentReportCompletenessReviewRead('C:/expert-session-output/commercialization-research/08-report-completeness-review.md')
    globalThis.fetch = async () => new Response(JSON.stringify({
      templateId: 'commercialization-report-v1', content: '<html>reviewed final</html>', completionReviewRequired: false,
    }))
    const final = await renderExpertTemplateFillForWrite({
      file_path: 'repaired-report.html', content: '',
      expert_output: { templateId: 'commercialization-report-v1', mode: 'finalize', fields: {} },
    })
    if (final.kind !== 'rendered-template-fill') throw new Error('expected rendered write')
    await final.confirmWrite()
    expect(currentExpertTemplateOutputReviewContext()).toBeUndefined()
  })

  test('accepts the server-persisted same-session HTML path after in-process review state is gone', () => {
    resetMainAgentReportFieldAbsorptionReadsForTests()
    const reportPath = 'C:/expert-session-output/persisted-report.html'
    expect(isCurrentExpertTemplateOutputReviewReportPath(reportPath)).toBe(false)
    expect(isCurrentExpertTemplateOutputReviewReportPath(reportPath, reportPath)).toBe(true)
    expect(isCurrentExpertTemplateOutputReviewReportPath('C:/expert-session-output/other.html', reportPath)).toBe(false)
  })

  test('forwards a minimal patch to the same session renderer and returns fixed-template HTML', async () => {
    enableTemplateFillSession()
    const requests: Array<{ url: string; body: unknown }> = []
    globalThis.fetch = async (url, init) => {
      requests.push({ url: String(url), body: JSON.parse(String(init?.body)) })
      return new Response(JSON.stringify({ templateId: 'commercialization-report-v1', content: '<html>patched report</html>' }))
    }

    await expect(renderExpertTemplateFillForWrite({
      file_path: '产品-商业化调研报告.html',
      content: '',
      expert_output: {
        templateId: 'commercialization-report-v1',
        mode: 'patch',
        fields: { SOURCE_ROWS: [['[1]', 'https://example.com']], EXTRA_NOTE: null },
      },
    })).resolves.toEqual({
      kind: 'rendered-template-fill',
      confirmWrite: expect.any(Function),
      filePath: path.resolve('C:/expert-session-output', '产品-商业化调研报告.html'),
      content: '<html>patched report</html>',
      templateId: 'commercialization-report-v1',
    })

    expect(requests).toEqual([{
      url: 'http://127.0.0.1:3456/api/sessions/expert-session-1/expert/template-fill',
      body: {
        outputPath: path.resolve('C:/expert-session-output', '产品-商业化调研报告.html'),
        payload: {
          templateId: 'commercialization-report-v1',
          mode: 'patch',
          fields: { SOURCE_ROWS: [['[1]', 'https://example.com']], EXTRA_NOTE: null },
        },
      },
    }])
  })
})


test('saves a v2 brief with normal prose even when optional Route metadata is incomplete', async () => {
  enableTemplateFillSession()
  process.env.CC_JIANGXIA_EXPERT_RESEARCH_ARTIFACT_POLICY = JSON.stringify({
    mode: 'markdown-path-only', directory: 'commercialization-research',
    briefPath: 'commercialization-research/01-research-brief.md', researcherPaths: ['commercialization-research/02-competitors.md', 'commercialization-research/03-user-needs.md', 'commercialization-research/04-channels.md'],
    reviewerPath: 'commercialization-research/05-evidence-review.md', auditPath: 'commercialization-research/06-browser-audit.md', maxCharacters: 90000,
    routeCompletion: { mode: 'dynamic-route-status-v2', requireAttemptedRequiredRoutes: true },
  })
  const content = '# 用户问题\nB站、知乎、YouTube 具体内容取证\n### Route: incomplete-optional\n- Required route: yes'
  expect(await renderExpertTemplateFillForWrite({ file_path: 'commercialization-research/01-research-brief.md', content })).toMatchObject({ kind: 'research-artifact', content })
})


test('does not repeatedly send a deterministic write-confirmation error', async () => {
  enableTemplateFillSession()
  let commitCalls = 0
  globalThis.fetch = (async (url) => {
    if (String(url).endsWith('template-fill-commit')) {
      commitCalls++
      return new Response(JSON.stringify({ message: 'written content mismatch' }), { status: 409 })
    }
    return new Response(JSON.stringify({ content: '<html>draft</html>', templateId: 'commercialization-report-v1', writeReceipt: 'receipt', completionReviewRequired: true }))
  }) as typeof fetch
  const rendered = await renderExpertTemplateFillForWrite({ file_path: 'confirmed.html', content: '', expert_output: { templateId: 'commercialization-report-v1', fields: {} } })
  expect(commitCalls).toBe(0)
  if (rendered.kind !== 'rendered-template-fill') throw new Error('expected rendered write')
  await expect(rendered.confirmWrite()).rejects.toThrow('WRITE_CONFIRM_FAILED')
  expect(commitCalls).toBe(1)
  expect(currentExpertTemplateOutputReviewContext()).toBeUndefined()
})


test('saves oversized legacy Markdown and independent parts without invoking the HTML renderer', async () => {
  enableTemplateFillSession()
  process.env.CC_JIANGXIA_EXPERT_RESEARCH_ARTIFACT_POLICY = JSON.stringify({ mode: 'markdown-path-only', directory: 'commercialization-research', briefPath: 'commercialization-research/01-research-brief.md', researcherPaths: ['commercialization-research/02-competitors.md'], researcherParts: true, reviewerPath: 'commercialization-research/05-evidence-review.md', auditPath: 'commercialization-research/06-browser-audit.md', maxCharacters: 90000 })
  let calls = 0
  globalThis.fetch = Object.assign(async () => { calls++; throw new Error('must not render a research file') }, { preconnect: initialFetch.preconnect })
  const content = '# complete evidence\n' + '真实证据\n'.repeat(25000)
  for (const file_path of ['commercialization-research/02-competitors.md', 'commercialization-research/02-competitors.parts/worker-12.md']) {
    const output = await renderExpertTemplateFillForWrite({ file_path, content })
    expect(output).toMatchObject({ kind: 'research-artifact', content })
    expect(isSessionResearchArtifactReadAllowed(file_path, ['researcher-report'])).toBe(true)
  }
  expect(calls).toBe(0)
})
