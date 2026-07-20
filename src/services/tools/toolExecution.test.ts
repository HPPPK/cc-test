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
