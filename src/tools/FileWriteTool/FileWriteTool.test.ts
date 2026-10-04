import { z } from 'zod/v4'
import * as path from 'node:path'
import { afterEach, describe, expect, test } from 'bun:test'
import { getEmptyToolPermissionContext, type ToolUseContext } from '../../Tool.js'
import { ExpertTemplateFillWriteTool, FileWriteTool } from './FileWriteTool.js'
import {
  recordMainAgentReportFieldAbsorptionRead,
  renderExpertTemplateFillForWrite,
  resetMainAgentReportFieldAbsorptionReadsForTests,
} from '../../services/tools/expertTemplateFillRuntime.js'

const outputReviewEnvKeys = [
  'CC_JIANGXIA_EXPERT_TEMPLATE_FILL_WRITE',
  'CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT',
  'CC_JIANGXIA_EXPERT_SESSION_ID',
  'CC_JIANGXIA_DESKTOP_SERVER_URL',
  'CC_JIANGXIA_EXPERT_RESEARCH_ARTIFACT_POLICY',
] as const
const initialOutputReviewEnv = new Map(outputReviewEnvKeys.map((key) => [key, process.env[key]]))
const initialFetch = globalThis.fetch

afterEach(() => {
  for (const key of outputReviewEnvKeys) {
    const value = initialOutputReviewEnv.get(key)
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  globalThis.fetch = initialFetch
  resetMainAgentReportFieldAbsorptionReadsForTests()
})

describe('FileWriteTool stays generic', () => {
  test('accepts ordinary HTML without any Expert-specific template policy', async () => {
    const result = await FileWriteTool.validateInput(
      { file_path: 'C:/tmp/commercial-report.html', content: '<html><body>draft</body></html>' },
      {
        getAppState: () => ({ toolPermissionContext: { ...getEmptyToolPermissionContext(), mode: 'acceptEdits' } }),
        readFileState: new Map(),
      } as unknown as ToolUseContext,
    )

    expect(result).toEqual({ result: true })
  })

  test('adds the deterministic post-render review instruction only for an opted-in initial report draft', async () => {
    process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_WRITE = '1'
    process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT = 'C:/expert-session-output'
    process.env.CC_JIANGXIA_EXPERT_SESSION_ID = 'expert-session-1'
    process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = 'http://127.0.0.1:3456'
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
    globalThis.fetch = async () => new Response(JSON.stringify({
      templateId: 'commercialization-report-v1', content: '<html>draft</html>',
    }))
    recordMainAgentReportFieldAbsorptionRead('C:/expert-session-output/commercialization-research/07-report-field-absorption.md')
    const rendered = await renderExpertTemplateFillForWrite({
      file_path: 'draft.html', content: '',
      expert_output: { templateId: 'commercialization-report-v1', fields: { EXECUTIVE_SUMMARY: 'draft' } },
    })

    // Rendering alone must not announce review readiness; the write acknowledgement does.
    expect(FileWriteTool.mapToolResultToToolResultBlockParam({ type: 'create', filePath: path.resolve('C:/expert-session-output/draft.html') } as never, 'before_save').content).not.toContain('expert-evidence-output-reviewer')
    if (rendered.kind !== 'rendered-template-fill') throw new Error('Expected rendered template')
    await rendered.confirmWrite()
    const result = FileWriteTool.mapToolResultToToolResultBlockParam({
      type: 'create', filePath: path.resolve('C:/expert-session-output/draft.html'),
    } as never, 'toolu_draft')
    expect(result.content).toContain('expert-evidence-output-reviewer')

    const ordinary = FileWriteTool.mapToolResultToToolResultBlockParam({
      type: 'create', filePath: 'C:/tmp/ordinary.html',
    } as never, 'toolu_ordinary')
    expect(ordinary.content).not.toContain('expert-evidence-output-reviewer')
  })

  test('does not expose internal research_artifact metadata to the template-fill Expert model', () => {
    const schema = ExpertTemplateFillWriteTool.inputSchema
    const validMarkdownWrite = schema.safeParse({
      file_path: 'commercialization-research/02-competitors.md',
      content: '# 竞品台账',
    })
    const leakedInternalMetadata = schema.safeParse({
      file_path: 'commercialization-research/02-competitors.md',
      content: '# 竞品台账',
      research_artifact: { kind: 'researcher-report' },
    })

    expect(validMarkdownWrite.success).toBe(true)
    expect(leakedInternalMetadata.success).toBe(false)
  })
})


test('Expert Write describes pre-render patch recovery as well as reviewed-draft patching', () => {
  const schema = ExpertTemplateFillWriteTool.inputSchema
  expect(schema.safeParse({ file_path: 'report.html', content: '', expert_output: { templateId: 'demo', mode: 'patch', fields: { EXTRA_NOTE: null } } }).success).toBe(true)
  const schemaDescription = JSON.stringify(z.toJSONSchema(schema))
  expect(schemaDescription).toContain('Before the first successful render')
  expect(schemaDescription).toContain('undeclared field can be explicitly removed with null')
})
