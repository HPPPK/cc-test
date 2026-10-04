import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import type { ToolUseBlock } from '@anthropic-ai/sdk/resources/index.mjs'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { buildTool, getEmptyToolPermissionContext, type ToolUseContext } from '../../Tool.js'
import { z } from 'zod'
import type { CanUseToolFn } from '../../hooks/useCanUseTool.js'
import { FileEditTool } from '../../tools/FileEditTool/FileEditTool.js'
import { FileReadTool } from '../../tools/FileReadTool/FileReadTool.js'
import { FileWriteTool, getFileWriteToolForCurrentRuntime } from '../../tools/FileWriteTool/FileWriteTool.js'
import { AskUserQuestionTool } from '../../tools/AskUserQuestionTool/AskUserQuestionTool.js'
import { PlaywrightTool } from '../../tools/PlaywrightTool/PlaywrightTool.js'
import { SubmitPhaseCompletionTool } from '../../tools/SubmitPhaseCompletionTool/SubmitPhaseCompletionTool.js'
import { createFileStateCacheWithSizeLimit } from '../../utils/fileStateCache.js'
import { createAssistantMessage } from '../../utils/messages.js'
import { runToolUse } from './toolExecution.js'
import * as tokenEstimation from '../tokenEstimation.js'
import * as toolHooks from './toolHooks.js'
import { handleSessionsApi } from '../../server/api/sessions.js'
import { sessionService } from '../../server/services/sessionService.js'
import { ExpertSessionService } from '../../server/services/expertSessionService.js'
import { ExpertPackRegistryService, resetExpertPackRegistryForTests } from '../../server/services/expertPackRegistryService.js'
import { ZipPackAdapter } from '../../server/services/zipPackAdapter.js'


const templateFillAdapter = new ZipPackAdapter()

const AgentRunReceiptProbeTool = buildTool({
  name: 'AgentRunReceiptProbe',
  inputSchema: z.object({}).strict(),
  async description() { return 'Fast receipt probe' },
  async prompt() { return 'Fast receipt probe' },
  async call() {
    return { data: { screenshotPath: 'C:/workspace/output/receipt-proof.png' } }
  },
  mapToolResultToToolResultBlockParam(data, toolUseID) {
    return { type: 'tool_result', tool_use_id: toolUseID, content: JSON.stringify(data) }
  },
})
async function installInProcessTemplateFillExpert(configRoot: string) {
  process.env.CLAUDE_CONFIG_DIR = configRoot
  resetExpertPackRegistryForTests()
  await new ExpertPackRegistryService().importExpertPackZip(await templateFillAdapter.write({
    'manifest.json': JSON.stringify({
      packId: 'tool-execution-template-fill-pack',
      name: 'Tool Execution Template Fill Pack',
      version: '1.0.0',
      schemaVersion: 1,
      type: 'expert-pack',
      entrypoints: {
        experts: ['experts/template-fill/expert.json'],
        skills: ['session-skill'],
      },
    }),
    'experts/template-fill/expert.json': JSON.stringify({
      id: 'tool-execution-template-fill-expert',
      name: 'Tool Execution Template Fill Expert',
      description: 'In-process regression Expert for structured report delivery.',
      promptPaths: { system: 'experts/template-fill/system.md' },
      outputMode: 'template-fill',
      outputTemplatePath: 'experts/template-fill/templates/report.html',
      skillIds: ['session-skill'],
    }),
    'experts/template-fill/system.md': 'In-process template-fill regression prompt',
    'experts/template-fill/templates/report.html': '<html data-template-id="tool-execution-template-v1"><body><h1>{{REPORT_TITLE}}</h1><table><thead><tr><th>编号</th><th>链接（URL）</th></tr></thead><tbody><!-- SLOT: SOURCE_ROWS --></tbody></table></body></html>',
    'skills/session-skill/SKILL.md': 'In-process template-fill regression skill',
  }))
}

describe('runToolUse file edit recovery', () => {
  test('UIUX blocks unapproved browser research before Playwright.call', async () => {
    const previous = process.env.CC_JIANGXIA_UIUX_IMAGE_ONLY_DELIVERY
    process.env.CC_JIANGXIA_UIUX_IMAGE_ONLY_DELIVERY = '1'
    const called = spyOn(PlaywrightTool, 'call').mockImplementation(async () => { throw new Error('must not open browser') })
    try {
      const context = createContext()
      context.options.tools = [...context.options.tools, PlaywrightTool]
      const output = await runSingleToolUse({ type: 'tool_use', id: 'uiux-first-reference', name: 'Playwright', input: { actions: [{ type: 'navigate', url: 'https://example.com' }], include_screenshot: true } }, context)
      expect(JSON.stringify(output)).toContain('UIUX_INSPIRATION_REQUIRED')
      expect(called).not.toHaveBeenCalled()
    } finally {
      called.mockRestore()
      if (previous === undefined) delete process.env.CC_JIANGXIA_UIUX_IMAGE_ONLY_DELIVERY
      else process.env.CC_JIANGXIA_UIUX_IMAGE_ONLY_DELIVERY = previous
    }
  })

  test('UIUX blocks a paid image tool before tool.call, not at final delivery', async () => {
    const previous = process.env.CC_JIANGXIA_UIUX_IMAGE_ONLY_DELIVERY
    process.env.CC_JIANGXIA_UIUX_IMAGE_ONLY_DELIVERY = '1'
    const { ImageGenerationTool } = await import('../../tools/ImageGenerationTool/ImageGenerationTool.js')
    const called = spyOn(ImageGenerationTool, 'call').mockImplementation(async () => { throw new Error('must not call provider') })
    try {
      const context = createContext()
      context.options.tools = [...context.options.tools, ImageGenerationTool]
      const output = await runSingleToolUse({ type: 'tool_use', id: 'uiux-first-generate', name: 'image_generation', input: { operation: 'generate', prompt: 'test image' } }, context)
      expect(JSON.stringify(output)).toContain('UIUX_INSPIRATION_REQUIRED')
      expect(called).not.toHaveBeenCalled()
    } finally {
      called.mockRestore()
      if (previous === undefined) delete process.env.CC_JIANGXIA_UIUX_IMAGE_ONLY_DELIVERY
      else process.env.CC_JIANGXIA_UIUX_IMAGE_ONLY_DELIVERY = previous
    }
  })
  let tmpDir: string
  let restoreHooks: Array<() => void> = []

  beforeEach(async () => {
    // Exercise tool execution/renderer contracts, not the developer machine's
    // shell/network hooks. Hook behavior has its own focused test surface.
    const hooks = [
      spyOn(toolHooks, 'runPreToolUseHooks').mockImplementation(async function* () {}),
      spyOn(toolHooks, 'runPostToolUseHooks').mockImplementation(async function* () {}),
      spyOn(toolHooks, 'runPostToolUseFailureHooks').mockImplementation(async function* () {}),
    ]
    restoreHooks = hooks.map((hook) => () => hook.mockRestore())
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tool-execution-'))
  })

  afterEach(async () => {
    for (const restore of restoreHooks) restore()
    restoreHooks = []
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  test('auto-reads an existing file before retrying Write validation', async () => {
    const filePath = path.join(tmpDir, 'existing.txt')
    await fs.writeFile(filePath, 'old\n')
    const context = createContext()

    const messages = await runSingleToolUse(
      {
        type: 'tool_use',
        id: 'toolu_write',
        name: FileWriteTool.name,
        input: { file_path: filePath, content: 'new\n' },
      } as ToolUseBlock,
      context,
    )

    expect(await fs.readFile(filePath, 'utf8')).toBe('new\n')
    expect(context.readFileState.get(filePath)).toBeTruthy()
    expect(JSON.stringify(messages)).not.toContain('File has not been read yet')
    expect(JSON.stringify(messages)).not.toContain('<tool_use_error>')
  }, 20_000)

  test('rejects free-form HTML and temporary report JSON in a template-fill Expert session', async () => {
    const previous = {
      templateFillWrite: process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_WRITE,
      outputRoot: process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT,
    }
    process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_WRITE = '1'
    process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT = tmpDir

    try {
      const context = createContext()
      context.options.tools = [FileReadTool, getFileWriteToolForCurrentRuntime(), FileEditTool]
      const directHtml = await runSingleToolUse({
        type: 'tool_use',
        id: 'toolu_direct_html',
        name: FileWriteTool.name,
        input: {
          file_path: 'must-use-structured-write.html',
          content: '<!doctype html><html><body>Free-form report</body></html>',
        },
      } as ToolUseBlock, context)
      const temporaryJson = await runSingleToolUse({
        type: 'tool_use',
        id: 'toolu_fields_json',
        name: FileWriteTool.name,
        input: { file_path: 'report-fields.json', content: JSON.stringify({ templateId: 'classic-v1' }) },
      } as ToolUseBlock, context)

      expect(await fs.stat(path.join(tmpDir, 'must-use-structured-write.html')).catch(() => null)).toBeNull()
      expect(await fs.stat(path.join(tmpDir, 'report-fields.json')).catch(() => null)).toBeNull()
      expect(JSON.stringify(directHtml)).toContain('<tool_use_error>')
      expect(JSON.stringify(temporaryJson)).toContain('<tool_use_error>')
    } finally {
      if (previous.templateFillWrite === undefined) delete process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_WRITE
      else process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_WRITE = previous.templateFillWrite
      if (previous.outputRoot === undefined) delete process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT
      else process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT = previous.outputRoot
    }
  })

  test('returns repeated oversized Read errors as feedback without stopping continuation', async () => {
    // Keep this fixture in the workspace while exercising FileReadTool's token guard.
    const readDir = await fs.mkdtemp(path.join(process.cwd(), '.tmp-tool-execution-read-'))
    // This regression covers local Read error continuation, not a live token-count API.
    const tokenCount = spyOn(tokenEstimation, 'countTokensWithAPI').mockResolvedValue(40_000)
    try {
      const filePath = path.join(readDir, 'single-line-tool-result.json')
      await fs.writeFile(filePath, JSON.stringify({ payload: 'x'.repeat(160_000) }))
      const context = createContext()
      context.options.tools = [FileReadTool]
      const toolUse = {
        type: 'tool_use',
        name: FileReadTool.name,
        input: { file_path: filePath },
      } as ToolUseBlock

      const first = await runSingleToolUse({ ...toolUse, id: 'toolu_oversized_read_first' }, context)
      expect(JSON.stringify(first)).toContain('exceeds maximum allowed tokens')
      expect(JSON.stringify(first)).not.toContain('hook_stopped_continuation')

      const second = await runSingleToolUse({ ...toolUse, id: 'toolu_oversized_read_second' }, context)
      expect(JSON.stringify(second)).toContain('exceeds maximum allowed tokens')
      expect(JSON.stringify(second)).not.toContain('hook_stopped_continuation')
    } finally {
      tokenCount.mockRestore()
      if (path.dirname(path.resolve(readDir)) !== path.resolve(process.cwd())) throw new Error('Unexpected test fixture directory')
      await fs.rm(readDir, { recursive: true, force: true })
    }
  })

  test('renders structured Expert fields server-side and writes only the final HTML', async () => {
    const previous = {
      templateFillWrite: process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_WRITE,
      outputRoot: process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT,
      expertSessionId: process.env.CC_JIANGXIA_EXPERT_SESSION_ID,
      desktopServerUrl: process.env.CC_JIANGXIA_DESKTOP_SERVER_URL,
      fetch: globalThis.fetch,
    }
    process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_WRITE = '1'
    process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT = tmpDir
    process.env.CC_JIANGXIA_EXPERT_SESSION_ID = 'template-fill-session'
    process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = 'http://127.0.0.1:3456'
    globalThis.fetch = (async (url, init) => {
      expect(String(url)).toContain('/api/sessions/template-fill-session/expert/template-fill')
      expect(init?.method).toBe('POST')
      expect(JSON.parse(String(init?.body))).toEqual({
        outputPath: path.join(tmpDir, 'commercialization-report.html'),
        payload: {
          templateId: 'classic-v1',
          fields: { REPORT_TITLE: 'AI 视频翻译' },
        },
      })
      return new Response(JSON.stringify({ content: '<html><body>Rendered report</body></html>', templateId: 'classic-v1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch

    try {
      const context = createContext()
      context.options.tools = [FileReadTool, getFileWriteToolForCurrentRuntime(), FileEditTool]
      const messages = await runSingleToolUse({
        type: 'tool_use',
        id: 'toolu_structured_report',
        name: FileWriteTool.name,
        input: {
          file_path: 'commercialization-report.html',
          content: '',
          expert_output: {
            templateId: 'classic-v1',
            fields: { REPORT_TITLE: 'AI 视频翻译' },
          },
        },
      } as ToolUseBlock, context)

      expect(JSON.stringify(messages)).not.toContain('EXPERT_TEMPLATE_FILL_REJECTED')
      expect(JSON.stringify(messages)).not.toContain('<tool_use_error>')
      expect(await fs.readFile(path.join(tmpDir, 'commercialization-report.html'), 'utf8')).toBe('<html><body>Rendered report</body></html>')
    } finally {
      if (previous.templateFillWrite === undefined) delete process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_WRITE
      else process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_WRITE = previous.templateFillWrite
      if (previous.outputRoot === undefined) delete process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT
      else process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT = previous.outputRoot
      if (previous.expertSessionId === undefined) delete process.env.CC_JIANGXIA_EXPERT_SESSION_ID
      else process.env.CC_JIANGXIA_EXPERT_SESSION_ID = previous.expertSessionId
      if (previous.desktopServerUrl === undefined) delete process.env.CC_JIANGXIA_DESKTOP_SERVER_URL
      else process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = previous.desktopServerUrl
      globalThis.fetch = previous.fetch
    }
  }, 20_000)

  test('writes final HTML through the real structured Write -> session route -> renderer chain', async () => {
    const previous = {
      configDir: process.env.CLAUDE_CONFIG_DIR,
      templateFillWrite: process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_WRITE,
      outputRoot: process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT,
      expertSessionId: process.env.CC_JIANGXIA_EXPERT_SESSION_ID,
      desktopServerUrl: process.env.CC_JIANGXIA_DESKTOP_SERVER_URL,
      fetch: globalThis.fetch,
    }
    const configRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tool-execution-template-fill-config-'))
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tool-execution-template-fill-project-'))
    process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_WRITE = '1'
    process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT = projectRoot
    process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = 'http://127.0.0.1:3456'

    try {
      await installInProcessTemplateFillExpert(configRoot)
      const { sessionId } = await sessionService.createSession(projectRoot)
      await new ExpertSessionService().enterExpertMode(sessionId, 'tool-execution-template-fill-expert')
      process.env.CC_JIANGXIA_EXPERT_SESSION_ID = sessionId
      let acknowledgements = 0
      globalThis.fetch = (async (url, init) => {
        const requestUrl = new URL(String(url))
        const response = await handleSessionsApi(
          new Request(requestUrl, init),
          requestUrl,
          ['api', 'sessions', sessionId, 'expert', requestUrl.pathname.split('/').at(-1)!],
        )
        if (requestUrl.pathname.endsWith('template-fill-commit')) {
          acknowledgements++
          if (acknowledgements === 1) throw new Error('response lost after server committed')
        }
        return response
      }) as typeof fetch

      const context = createContext()
      context.options.tools = [FileReadTool, getFileWriteToolForCurrentRuntime(), FileEditTool]
      const writeReport = () => runSingleToolUse({
        type: 'tool_use',
        id: 'toolu_in_process_structured_report',
        name: FileWriteTool.name,
        input: {
          file_path: 'commercialization-report.html',
          content: '',
          expert_output: {
            templateId: 'tool-execution-template-v1',
            fields: {
              REPORT_TITLE: 'AI 字幕翻译',
              SOURCE_ROWS: [['[1]', 'https://example.com/source']],
            },
          },
        },
      } as ToolUseBlock, context)

      const reportPath = path.join(projectRoot, 'commercialization-report.html')
      await fs.mkdir(reportPath)
      const failed = await writeReport()
      expect(JSON.stringify(failed)).toContain('is_error')
      expect(acknowledgements).toBe(0)
      expect((await sessionService.getSession(sessionId))?.expert?.templateFillDelivery).toBeUndefined()
      await fs.rmdir(reportPath)
      const messages = await writeReport()
      expect(acknowledgements).toBe(2)
      expect(JSON.stringify(messages)).not.toContain('<tool_use_error>')
      const html = await fs.readFile(path.join(projectRoot, 'commercialization-report.html'), 'utf8')
      expect(html).toContain('<h1>AI 字幕翻译</h1>')
      expect(html).toContain('href="https://example.com/source"')
      expect((await sessionService.getSession(sessionId))?.expert?.templateFillDelivery).toMatchObject({ reportPath: path.join(projectRoot, 'commercialization-report.html') })
    } finally {
      process.env.CLAUDE_CONFIG_DIR = previous.configDir
      resetExpertPackRegistryForTests()
      if (previous.templateFillWrite === undefined) delete process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_WRITE
      else process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_WRITE = previous.templateFillWrite
      if (previous.outputRoot === undefined) delete process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT
      else process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT = previous.outputRoot
      if (previous.expertSessionId === undefined) delete process.env.CC_JIANGXIA_EXPERT_SESSION_ID
      else process.env.CC_JIANGXIA_EXPERT_SESSION_ID = previous.expertSessionId
      if (previous.desktopServerUrl === undefined) delete process.env.CC_JIANGXIA_DESKTOP_SERVER_URL
      else process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = previous.desktopServerUrl
      globalThis.fetch = previous.fetch
      await fs.rm(configRoot, { recursive: true, force: true })
      await fs.rm(projectRoot, { recursive: true, force: true })
    }
  })

  test('keeps structured template renderer errors available for another correction', async () => {
    const previous = {
      templateFillWrite: process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_WRITE,
      outputRoot: process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT,
      expertSessionId: process.env.CC_JIANGXIA_EXPERT_SESSION_ID,
      desktopServerUrl: process.env.CC_JIANGXIA_DESKTOP_SERVER_URL,
      fetch: globalThis.fetch,
    }
    process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_WRITE = '1'
    process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT = tmpDir
    process.env.CC_JIANGXIA_EXPERT_SESSION_ID = 'terminal-template-fill-session'
    process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = 'http://127.0.0.1:3456'
    globalThis.fetch = (async () => new Response(JSON.stringify({
      error: 'EXPERT_RESEARCH_EVIDENCE_ABSORPTION_REQUIRED',
      message: 'The cited source row needs a matching reviewed evidence record.',
    }), { status: 409, headers: { 'content-type': 'application/json' } })) as typeof fetch

    try {
      const context = createContext()
      context.options.tools = [FileReadTool, getFileWriteToolForCurrentRuntime(), FileEditTool]
      const messages = await runSingleToolUse({
        type: 'tool_use',
        id: 'toolu_terminal_structured_report',
        name: FileWriteTool.name,
        input: {
          file_path: 'commercialization-report.html',
          content: '',
          expert_output: { templateId: 'classic-v1', fields: { REPORT_TITLE: 'AI 视频翻译' } },
        },
      } as ToolUseBlock, context)

      expect(await fs.stat(path.join(tmpDir, 'commercialization-report.html')).catch(() => null)).toBeNull()
      expect(JSON.stringify(messages)).toContain('EXPERT_RESEARCH_EVIDENCE_ABSORPTION_REQUIRED')
      expect(messages).toHaveLength(1)
      expect(JSON.stringify(messages)).not.toContain('hook_stopped_continuation')
      expect(context.abortController.signal.aborted).toBe(false)
    } finally {
      if (previous.templateFillWrite === undefined) delete process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_WRITE
      else process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_WRITE = previous.templateFillWrite
      if (previous.outputRoot === undefined) delete process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT
      else process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT = previous.outputRoot
      if (previous.expertSessionId === undefined) delete process.env.CC_JIANGXIA_EXPERT_SESSION_ID
      else process.env.CC_JIANGXIA_EXPERT_SESSION_ID = previous.expertSessionId
      if (previous.desktopServerUrl === undefined) delete process.env.CC_JIANGXIA_DESKTOP_SERVER_URL
      else process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = previous.desktopServerUrl
      globalThis.fetch = previous.fetch
    }
  })

  test('returns a retryable contract error instead of sending an invalid scope-plan question card', async () => {
    const context = createContext()
    context.options.tools = [AskUserQuestionTool]
    context.getAppState = () => ({
      toolPermissionContext: { ...getEmptyToolPermissionContext(), mode: 'acceptEdits' },
      workflow: {
        mode: 'workflow',
        activePhaseId: 'scope-plan',
        workflowStatus: 'running',
        status: 'running',
        templateIdentity: { id: 'skills-development', source: 'user', version: '13' },
        templateSnapshot: {
          schemaVersion: 1,
          id: 'skills-development',
          source: 'user',
          version: '13',
          displayName: 'Skills development',
          description: 'Question contract test',
          phases: [{
            id: 'scope-plan',
            label: 'Scope plan',
            instructions: 'Ask structured decision cards.',
            requestedModel: null,
            skillDeclarations: [],
            requiredArtifacts: [],
            completionCriteria: [],
            transitionAuthority: 'user-confirmation',
            runtimeContract: {
              questionPolicy: {
                exactQuestionCount: 1,
                minChoices: 2,
                maxChoices: 3,
                firstChoiceLabelIncludes: '(Recommended)',
                requireChoiceDescriptions: true,
                disallowComputerUse: true,
              },
            },
          }],
        },
      },
      tasks: {},
      effortValue: undefined,
      sessionHooks: new Map(),
    }) as ReturnType<ToolUseContext['getAppState']>

    const messages = await runSingleToolUse({
      type: 'tool_use',
      id: 'toolu_invalid_scope_plan_question',
      name: AskUserQuestionTool.name,
      input: {
        questions: [{
          prompt: 'Which scope should we choose?',
          choices: [
            { label: 'Focused MVP', description: 'Deliver the smallest validated user path first.' },
            { label: 'Broader MVP', description: 'Include a secondary flow.' },
            { label: 'Everything now', description: 'Include all requests.' },
            { label: 'Custom', description: 'Define a separate scope.' },
          ],
        }],
      },
    } as ToolUseBlock, context)

    expect(JSON.stringify(messages)).toContain('WORKFLOW_QUESTION_CONTRACT_VIOLATION')
    expect(JSON.stringify(messages)).toContain('decision cards require exactly 2–3 choices')
    expect(messages).toHaveLength(1)

    const repeated = await runSingleToolUse({
      type: 'tool_use',
      id: 'toolu_repeated_invalid_scope_plan_question',
      name: AskUserQuestionTool.name,
      input: {
        questions: [{
          prompt: 'Which scope should we choose?',
          choices: [
            { label: 'Focused MVP', description: 'Deliver the smallest validated user path first.' },
            { label: 'Broader MVP', description: 'Include a secondary flow.' },
            { label: 'Everything now', description: 'Include all requests.' },
            { label: 'Custom', description: 'Define a separate scope.' },
          ],
        }],
      },
    } as ToolUseBlock, context)

    expect(repeated).toHaveLength(1)
    expect(JSON.stringify(repeated)).toContain('WORKFLOW_QUESTION_CONTRACT_VIOLATION')
    expect(JSON.stringify(repeated)).not.toContain('hook_stopped_continuation')
  })

  test('returns a structured workflow violation instead of executing a write tool before implementation', async () => {
    const filePath = path.join(tmpDir, 'workflow-denied.txt')
    const context = createContext()
    context.getAppState = () => ({
      toolPermissionContext: { ...getEmptyToolPermissionContext(), mode: 'acceptEdits' },
      workflow: {
        mode: 'workflow',
        activePhaseId: 'requirements-clarification',
        workflowStatus: 'running',
        status: 'running',
        templateSnapshot: {
          schemaVersion: 1,
          id: 'workflow-tool-test',
          source: 'user',
          version: '1',
          displayName: 'Workflow tool test',
          description: 'test',
          phases: [{
            id: 'requirements-clarification',
            label: 'Requirements',
            instructions: 'Clarify requirements.',
            requestedModel: null,
            skillDeclarations: [],
            requiredArtifacts: [],
            completionCriteria: [],
            transitionAuthority: 'user-confirmation',
          }],
        },
      },
      tasks: {},
      effortValue: undefined,
      sessionHooks: new Map(),
    }) as ReturnType<ToolUseContext['getAppState']>

    const messages = await runSingleToolUse({
      type: 'tool_use',
      id: 'toolu_workflow_denied_write',
      name: FileWriteTool.name,
      input: { file_path: filePath, content: 'must not write' },
    } as ToolUseBlock, context)

    expect(await fs.stat(filePath).catch(() => null)).toBeNull()
    expect(JSON.stringify(messages)).toContain('WORKFLOW_TOOL_FORBIDDEN')
  })

  test('blocks default development Stage 4 Leader production writes before tool execution', async () => {
    const originalServerUrl = process.env.CC_JIANGXIA_DESKTOP_SERVER_URL
    const originalWorkflowSessionId = process.env.CC_JIANGXIA_WORKFLOW_SESSION_ID
    delete process.env.CC_JIANGXIA_DESKTOP_SERVER_URL
    delete process.env.CC_JIANGXIA_WORKFLOW_SESSION_ID

    const filePath = path.join(tmpDir, 'src', 'leader.ts')
    const context = createContext()
    context.options.tools = [FileWriteTool]
    context.getAppState = () => ({
      toolPermissionContext: { ...getEmptyToolPermissionContext(), mode: 'acceptEdits' },
      workflow: {
        mode: 'workflow',
        activePhaseId: 'delegate-implement',
        workflowStatus: 'running',
        status: 'running',
        workspaceRoot: tmpDir,
        phases: [{ id: 'delegate-implement', status: 'running', artifactPointers: [] }],
        templateIdentity: {
          id: 'efficient-constrained-dev-debug-workflow-v5',
          source: 'user',
          version: '1',
        },
        templateSnapshot: {
          schemaVersion: 1,
          id: 'efficient-constrained-dev-debug-workflow-v5',
          source: 'user',
          version: '1',
          displayName: 'Workflow implementation guard',
          description: 'test',
          phases: [{
            id: 'delegate-implement',
            label: 'Implement',
            instructions: 'Implement the accepted delivery plan.',
            requestedModel: null,
            skillDeclarations: [],
            requiredArtifacts: [],
            completionCriteria: [],
            transitionAuthority: 'user-confirmation',
            toolPolicy: { allowedTools: ['Write'] },
          }],
        },
      },
      tasks: {},
      effortValue: undefined,
      sessionHooks: new Map(),
    }) as ReturnType<ToolUseContext['getAppState']>

    try {
      const messages = await runSingleToolUse({
        type: 'tool_use',
        id: 'toolu_development_leader_write',
        name: FileWriteTool.name,
        input: { file_path: filePath, content: 'leader must not implement' },
      } as ToolUseBlock, context)

      expect(await fs.stat(filePath).catch(() => null)).toBeNull()
      expect(JSON.stringify(messages)).toContain('WORKFLOW_DEVELOPMENT_LEADER_IMPLEMENTATION_FORBIDDEN')
    } finally {
      if (originalServerUrl === undefined) delete process.env.CC_JIANGXIA_DESKTOP_SERVER_URL
      else process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = originalServerUrl
      if (originalWorkflowSessionId === undefined) delete process.env.CC_JIANGXIA_WORKFLOW_SESSION_ID
      else process.env.CC_JIANGXIA_WORKFLOW_SESSION_ID = originalWorkflowSessionId
    }
  })

  test('uses the latest Desktop workflow phase instead of stale CLI state before a tool executes', async () => {
    const filePath = path.join(tmpDir, 'desktop-current-phase.txt')
    const context = createContext()
    const originalFetch = globalThis.fetch
    const originalServerUrl = process.env.CC_JIANGXIA_DESKTOP_SERVER_URL
    const originalSessionId = process.env.CC_JIANGXIA_WORKFLOW_SESSION_ID
    const localWorkflow = {
      mode: 'workflow',
      activePhaseId: 'delegate-implement',
      workflowStatus: 'running',
      status: 'running',
      phases: [{ id: 'delegate-implement', status: 'running', artifactPointers: [] }],
      templateSnapshot: {
        schemaVersion: 1,
        id: 'desktop-state-guard',
        source: 'user',
        version: '1',
        displayName: 'Desktop state guard',
        description: 'test',
        phases: [
          {
            id: 'requirements-clarification',
            label: 'Requirements',
            instructions: 'Clarify requirements.',
            requestedModel: null,
            skillDeclarations: [],
            requiredArtifacts: [],
            completionCriteria: [],
            transitionAuthority: 'user-confirmation',
          },
          {
            id: 'delegate-implement',
            label: 'Implement',
            instructions: 'Implement the approved change.',
            requestedModel: null,
            skillDeclarations: [],
            requiredArtifacts: [],
            completionCriteria: [],
            transitionAuthority: 'user-confirmation',
            toolPolicy: { allowedTools: ['Write'] },
          },
        ],
      },
    }
    const currentDesktopWorkflow = {
      ...localWorkflow,
      activePhaseId: 'requirements-clarification',
      phases: [{ id: 'requirements-clarification', status: 'running', artifactPointers: [] }],
    }
    context.options.tools = [FileWriteTool]
    context.getAppState = () => ({
      toolPermissionContext: { ...getEmptyToolPermissionContext(), mode: 'acceptEdits' },
      workflow: localWorkflow,
      tasks: {},
      effortValue: undefined,
      sessionHooks: new Map(),
    }) as ReturnType<ToolUseContext['getAppState']>
    process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = 'http://127.0.0.1:4567/'
    process.env.CC_JIANGXIA_WORKFLOW_SESSION_ID = 'workflow-current-phase'
    const calls: string[] = []
    globalThis.fetch = (async (input: string | URL | Request) => {
      calls.push(String(input))
      return new Response(JSON.stringify({ state: currentDesktopWorkflow }), { status: 200 })
    }) as typeof fetch

    try {
      const messages = await runSingleToolUse({
        type: 'tool_use',
        id: 'toolu_desktop_current_phase',
        name: FileWriteTool.name,
        input: { file_path: filePath, content: 'must not write' },
      } as ToolUseBlock, context)

      expect(await fs.stat(filePath).catch(() => null)).toBeNull()
      expect(JSON.stringify(messages)).toContain('WORKFLOW_TOOL_FORBIDDEN')
      expect(calls).toEqual([
        'http://127.0.0.1:4567/api/sessions/workflow-current-phase/workflow',
      ])
    } finally {
      globalThis.fetch = originalFetch
      if (originalServerUrl === undefined) delete process.env.CC_JIANGXIA_DESKTOP_SERVER_URL
      else process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = originalServerUrl
      if (originalSessionId === undefined) delete process.env.CC_JIANGXIA_WORKFLOW_SESSION_ID
      else process.env.CC_JIANGXIA_WORKFLOW_SESSION_ID = originalSessionId
    }
  })

  test('allows one silent correction retry for the rejected unavailable completion status', async () => {
    let appState: any = {
      workflow: {
        mode: 'workflow',
        sessionId: 'workflow-unavailable-status-recovery',
        workflowStatus: 'running',
        status: 'running',
        runStatus: 'active',
        activePhaseId: 'requirements',
        stateVersion: 3,
        phases: [{ id: 'requirements', status: 'running', artifactPointers: [] }],
        transitionHistory: [],
        artifactIndex: {},
      },
      toolPermissionContext: { ...getEmptyToolPermissionContext(), mode: 'acceptEdits' },
      tasks: {},
      effortValue: undefined,
      sessionHooks: new Map(),
    }
    const context = createContext()
    context.options.tools = [FileReadTool, FileWriteTool, FileEditTool, SubmitPhaseCompletionTool]
    context.getAppState = () => appState
    context.setAppState = (updater) => { appState = updater(appState) }

    const messages = await runSingleToolUse({
      type: 'tool_use',
      id: 'toolu_submit_unavailable',
      name: 'submit_phase_completion',
      input: {
        phaseId: 'requirements',
        stateVersion: 3,
        status: 'unavailable',
        handoff: { summary: 'The phase is ready.' },
        rationale: 'The phase is ready for review.',
        evidence: [],
      },
    } as ToolUseBlock, context)

    expect(JSON.stringify(messages)).toContain('WORKFLOW_SUBMIT_RETRY_ALLOWED')
    expect(JSON.stringify(messages)).toContain('Use the allowed completion status unable, not unavailable')
    expect(JSON.stringify(messages)).not.toContain('WORKFLOW_SUBMIT_BLOCKED')
    expect(appState.workflow.runStatus).toBe('active')
  })

  test('keeps repeated submit schema errors in the current phase for correction', async () => {
    let appState: any = {
      workflow: {
        mode: 'workflow',
        sessionId: 'workflow-submit-recovery',
        workflowStatus: 'running',
        status: 'running',
        runStatus: 'active',
        activePhaseId: 'requirements',
        stateVersion: 3,
        phases: [{ id: 'requirements', status: 'running', artifactPointers: [] }],
        transitionHistory: [],
        artifactIndex: {},
      },
      toolPermissionContext: { ...getEmptyToolPermissionContext(), mode: 'acceptEdits' },
      tasks: {},
      effortValue: undefined,
      sessionHooks: new Map(),
    }
    const context = createContext()
    context.options.tools = [FileReadTool, FileWriteTool, FileEditTool, SubmitPhaseCompletionTool]
    context.getAppState = () => appState
    context.setAppState = (updater) => { appState = updater(appState) }
    const toolUse = {
      type: 'tool_use',
      name: 'submit_phase_completion',
      input: { status: 'ready' },
    } as ToolUseBlock

    const first = await runSingleToolUse({ ...toolUse, id: 'toolu_submit_first' }, context)
    expect(JSON.stringify(first)).toContain('WORKFLOW_SUBMIT_RETRY_ALLOWED')
    expect(appState.workflow.runStatus).toBe('active')
    expect(first).toHaveLength(1)

    const second = await runSingleToolUse({ ...toolUse, id: 'toolu_submit_second' }, context)
    expect(JSON.stringify(second)).toContain('WORKFLOW_SUBMIT_RETRY_ALLOWED')
    expect(JSON.stringify(second)).not.toContain('WORKFLOW_SUBMIT_BLOCKED')
    expect(appState.workflow.runStatus).toBe('active')
    expect(second).toHaveLength(1)
    expect(JSON.stringify(second)).not.toContain('hook_stopped_continuation')
  })

  test('returns Playwright-specific recovery guidance when an action type is unsupported', async () => {
    const context = createContext()
    context.options.tools = [PlaywrightTool]

    const messages = await runSingleToolUse({
      type: 'tool_use',
      id: 'toolu_playwright_invalid_action',
      name: PlaywrightTool.name,
      input: {
        actions: [{ type: 'search', selector: '#kw', text: '坦克大战' }],
      },
    } as ToolUseBlock, context)

    const result = JSON.stringify(messages)
    const toolError = JSON.parse(result)[0].message.content[0].content as string
    expect(toolError).toContain('actions[0].type="search"')
    expect(toolError).toContain('Retry this Playwright call immediately')
    expect(toolError).toContain('a search first uses navigate')
    expect(toolError).toContain('Do not switch to Bash')
    expect(toolError).not.toContain('Invalid input for Playwright')
  })

  test('auto-reads an existing file before retrying Edit validation', async () => {
    const filePath = path.join(tmpDir, 'edit.txt')
    await fs.writeFile(filePath, 'hello world\n')

    const messages = await runSingleToolUse({
      type: 'tool_use',
      id: 'toolu_edit',
      name: FileEditTool.name,
      input: { file_path: filePath, old_string: 'hello', new_string: 'goodbye' },
    } as ToolUseBlock)

    expect(await fs.readFile(filePath, 'utf8')).toBe('goodbye world\n')
    expect(JSON.stringify(messages)).not.toContain('File has not been read yet')
    expect(JSON.stringify(messages)).not.toContain('<tool_use_error>')
  }, 20_000)
  test('emits fail-open generic agent-run receipts around a real tool call', async () => {
    const previousFetch = globalThis.fetch
    const previousServerUrl = process.env.CC_JIANGXIA_DESKTOP_SERVER_URL
    const previousEnabled = process.env.CC_JIANGXIA_AGENT_RUN_LEDGER_ENABLED
    const previousSessionId = process.env.CC_JIANGXIA_SESSION_ID
    const receipts: Array<Record<string, unknown>> = []
    try {
      process.env.CC_JIANGXIA_AGENT_RUN_LEDGER_ENABLED = '1'
      process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = 'http://127.0.0.1:3456'
      process.env.CC_JIANGXIA_SESSION_ID = 'ledger-session'
      globalThis.fetch = (async (_url, init) => {
        receipts.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
        return new Response('{}', { status: 200 })
      }) as typeof fetch
      const context = createContext()
      context.options.tools = [AgentRunReceiptProbeTool]
      context.queryTracking = { chainId: 'ledger-run', depth: 0 }
      await runSingleToolUse({
        type: 'tool_use', id: 'toolu_ledger_probe', name: AgentRunReceiptProbeTool.name, input: {},
      } as ToolUseBlock, context)

      expect(receipts.map((receipt) => receipt.eventType)).toEqual(['tool_started', 'tool_completed', 'artifact_recorded'])
      expect(receipts.every((receipt) => receipt.sessionId === 'ledger-session' && receipt.runId === 'ledger-run')).toBe(true)
      expect(receipts.every((receipt) => !('content' in receipt) && !('prompt' in receipt))).toBe(true)
    } finally {
      globalThis.fetch = previousFetch
      if (previousEnabled === undefined) delete process.env.CC_JIANGXIA_AGENT_RUN_LEDGER_ENABLED
      else process.env.CC_JIANGXIA_AGENT_RUN_LEDGER_ENABLED = previousEnabled
      if (previousServerUrl === undefined) delete process.env.CC_JIANGXIA_DESKTOP_SERVER_URL
      else process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = previousServerUrl
      if (previousSessionId === undefined) delete process.env.CC_JIANGXIA_SESSION_ID
      else process.env.CC_JIANGXIA_SESSION_ID = previousSessionId
    }
  })
})

async function runSingleToolUse(
  toolUse: ToolUseBlock,
  context: ToolUseContext = createContext(),
) {
  const messages = []
  const assistantMessage = createAssistantMessage({ content: 'run tool' })
  for await (const update of runToolUse(
    toolUse,
    assistantMessage,
    allowTool,
    context,
  )) {
    messages.push(update.message)
  }
  return messages
}

const allowTool = (async () => ({
  behavior: 'allow',
  decisionReason: { type: 'other', reason: 'test' },
})) as CanUseToolFn

function createContext(): ToolUseContext {
  return {
    options: {
      commands: [],
      debug: false,
      mainLoopModel: 'test-model',
      tools: [FileReadTool, FileWriteTool, FileEditTool],
      verbose: false,
      thinkingConfig: { type: 'disabled' },
      mcpClients: [],
      mcpResources: {},
      isNonInteractiveSession: true,
      agentDefinitions: {
        activeAgents: [],
        errors: [],
        warnings: [],
        metadata: {
          directories: [],
          loadedFromSettings: [],
        },
      },
    },
    abortController: new AbortController(),
    readFileState: createFileStateCacheWithSizeLimit(10),
    getAppState: () => ({
      toolPermissionContext: {
        ...getEmptyToolPermissionContext(),
        mode: 'acceptEdits',
      },
      tasks: {},
      effortValue: undefined,
      sessionHooks: new Map(),
    }) as ReturnType<ToolUseContext['getAppState']>,
    setAppState: () => {},
    setInProgressToolUseIDs: () => {},
    setResponseLength: () => {},
    updateFileHistoryState: () => {},
    updateAttributionState: () => {},
    messages: [],
  }
}


test('malformed tool input produces an explicit paired error without executing even a permissive tool', async () => {
  const context = createContext()
  const raw = '{"file_path":"secret-path","content":"sensitive-unterminated'
  const messages = await runSingleToolUse({ type: 'tool_use', id: 'invalid-json-call', name: FileWriteTool.name, input: raw } as unknown as ToolUseBlock, context)
  const serialized = JSON.stringify(messages)
  expect(serialized).toContain('TOOL_INPUT_JSON_INVALID')
  expect(serialized).toContain('invalid-json-call')
  expect(serialized).not.toContain('sensitive-unterminated')
})
