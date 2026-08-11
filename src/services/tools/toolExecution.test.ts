import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import type { ToolUseBlock } from '@anthropic-ai/sdk/resources/index.mjs'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { getEmptyToolPermissionContext, type ToolUseContext } from '../../Tool.js'
import type { CanUseToolFn } from '../../hooks/useCanUseTool.js'
import { FileEditTool } from '../../tools/FileEditTool/FileEditTool.js'
import { FileReadTool } from '../../tools/FileReadTool/FileReadTool.js'
import { FileWriteTool } from '../../tools/FileWriteTool/FileWriteTool.js'
import { AskUserQuestionTool } from '../../tools/AskUserQuestionTool/AskUserQuestionTool.js'
import { PlaywrightTool } from '../../tools/PlaywrightTool/PlaywrightTool.js'
import { SubmitPhaseCompletionTool } from '../../tools/SubmitPhaseCompletionTool/SubmitPhaseCompletionTool.js'
import { createFileStateCacheWithSizeLimit } from '../../utils/fileStateCache.js'
import { createAssistantMessage } from '../../utils/messages.js'
import { runToolUse } from './toolExecution.js'

describe('runToolUse file edit recovery', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tool-execution-'))
  })

  afterEach(async () => {
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

  test('rejects direct HTML delivery in a template-fill Expert session before Write creates the file', async () => {
    const filePath = path.join(tmpDir, 'must-use-cli.html')
    const previousTemplateFillWrite = process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_WRITE
    process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_WRITE = '1'

    try {
      const context = createContext()
      context.options.tools = [FileReadTool, FileWriteTool, FileEditTool]
      const messages = await runSingleToolUse({
        type: 'tool_use',
        id: 'toolu_direct_html',
        name: FileWriteTool.name,
        input: {
          file_path: filePath,
          content: '<!doctype html><html><body>Free-form report</body></html>',
        },
      } as ToolUseBlock, context)

      expect(await fs.stat(filePath).catch(() => null)).toBeNull()
      expect(JSON.stringify(messages)).toContain('EXPERT_TEMPLATE_FILL_REJECTED')
      expect(JSON.stringify(messages)).toContain('expert-template-fill')
    } finally {
      if (previousTemplateFillWrite === undefined) delete process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_WRITE
      else process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_WRITE = previousTemplateFillWrite
    }
  })

  test('keeps compact report-fields JSON writable for the CLI in a template-fill Expert session', async () => {
    const filePath = path.join(tmpDir, 'report-fields.json')
    const previousTemplateFillWrite = process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_WRITE
    process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_WRITE = '1'

    try {
      const context = createContext()
      context.options.tools = [FileReadTool, FileWriteTool, FileEditTool]
      const content = JSON.stringify({ templateId: 'classic-v1', fields: { REPORT_TITLE: 'AI 视频翻译' } })
      const messages = await runSingleToolUse({
        type: 'tool_use',
        id: 'toolu_fields_json',
        name: FileWriteTool.name,
        input: { file_path: filePath, content },
      } as ToolUseBlock, context)

      expect(await fs.readFile(filePath, 'utf8')).toBe(content)
      expect(JSON.stringify(messages)).not.toContain('EXPERT_TEMPLATE_FILL_REJECTED')
    } finally {
      if (previousTemplateFillWrite === undefined) delete process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_WRITE
      else process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_WRITE = previousTemplateFillWrite
    }
  }, 20_000)

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

  test('returns one retryable submit schema error then blocks the phase on the second failure', async () => {
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

    const second = await runSingleToolUse({ ...toolUse, id: 'toolu_submit_second' }, context)
    expect(JSON.stringify(second)).toContain('WORKFLOW_SUBMIT_BLOCKED')
    expect(appState.workflow.runStatus).toBe('blocked')
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
    expect(toolError).toContain('a search uses navigate')
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
