import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import type { Tool, ToolUseContext } from '../../Tool.js'
import { findToolByName, getEmptyToolPermissionContext } from '../../Tool.js'
import { getAllBaseTools, getTools } from '../../tools.js'
import { resetWorkflowTemplateRegistryForTests, WorkflowTemplateRegistryService } from '../../server/services/workflowTemplateRegistryService.js'
import { PackRegistryService } from '../../server/services/packRegistryService.js'
import { ZipPackAdapter } from '../../server/services/zipPackAdapter.js'
import { toolToAPISchema } from '../../utils/api.js'
import { clearToolSchemaCache } from '../../utils/toolSchemaCache.js'

const TOOL_NAME = 'workflow_template_authoring'
const originalConfigDir = process.env.CLAUDE_CONFIG_DIR
const originalDesktopServerUrl = process.env.CC_JIANGXIA_DESKTOP_SERVER_URL
const originalAnthropicApiKey = process.env.ANTHROPIC_API_KEY

let tempConfigDir: string

const editableDefaultTemplateIds = new Set([
  'efficient-constrained-dev-debug-workflow-v5',
  'feature-extension-workflow-v8',
  'debug-repair-workflow-v8',
])

const zipAdapter = new ZipPackAdapter()

beforeEach(async () => {
  tempConfigDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'cc-jiangxia-workflow-authoring-tool-'),
  )
  process.env.CLAUDE_CONFIG_DIR = tempConfigDir
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test-workflow-authoring-tool-pool'
  resetWorkflowTemplateRegistryForTests()
})

afterEach(async () => {
  resetWorkflowTemplateRegistryForTests()

  if (originalConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR
  else process.env.CLAUDE_CONFIG_DIR = originalConfigDir

  if (originalDesktopServerUrl === undefined) delete process.env.CC_JIANGXIA_DESKTOP_SERVER_URL
  else process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = originalDesktopServerUrl

  if (originalAnthropicApiKey === undefined) delete process.env.ANTHROPIC_API_KEY
  else process.env.ANTHROPIC_API_KEY = originalAnthropicApiKey

  await fs.rm(tempConfigDir, { recursive: true, force: true })
})

async function loadTool(): Promise<Tool> {
  const mod = await import('./WorkflowTemplateAuthoringTool.js') as {
    WorkflowTemplateAuthoringTool?: Tool
  }

  expect(mod.WorkflowTemplateAuthoringTool).toBeDefined()
  if (!mod.WorkflowTemplateAuthoringTool) {
    throw new Error('WorkflowTemplateAuthoringTool export is required')
  }
  return mod.WorkflowTemplateAuthoringTool
}

function validTemplate(id = 'conversation-workflow') {
  return {
    schemaVersion: 1,
    id,
    version: '1.0.0',
    name: 'Conversation Workflow',
    description: 'A workflow created from conversation.',
    phases: [
      {
        id: 'draft',
        name: 'Draft',
        instructions: 'Draft the requested workflow output.',
        objective: 'Produce a structured draft.',
        requiredIntake: ['Use the user request and prior workflow context.'],
        handoffRules: ['Summarize the draft output and next action.'],
        executionRules: ['Keep the phase inside the approved workflow contract.'],
        outputArtifact: {
          id: 'draft-output',
          name: 'Draft Output',
          kind: 'markdown',
          description: 'The draft artifact.',
          required: true,
        },
        completionCriteria: {
          type: 'artifact-required',
          description: 'The draft artifact is complete.',
        },
        transition: { authority: 'user-confirmation' },
      },
    ],
  }
}

function largeValidTemplate(id = 'large-conversation-workflow') {
  const template = validTemplate(id)
  template.description = `A workflow with a large authoring payload. ${'details '.repeat(8_000)}`
  template.phases[0]!.instructions = `Draft the requested workflow output. ${'Use the gathered context carefully. '.repeat(4_000)}`
  template.phases[0]!.requiredIntake = Array.from(
    { length: 80 },
    (_, index) => `Large intake item ${index + 1}: ${'context '.repeat(250)}`,
  )
  template.phases[0]!.handoffRules = Array.from(
    { length: 80 },
    (_, index) => `Large handoff rule ${index + 1}: ${'evidence '.repeat(250)}`,
  )
  return template
}

function contextFor(activePhaseId: string | null = null): ToolUseContext {
  return {
    options: {
      commands: [],
      debug: false,
      mainLoopModel: 'claude-sonnet-4',
      tools: [],
      verbose: false,
      thinkingConfig: {},
      mcpClients: [],
      mcpResources: {},
      isNonInteractiveSession: false,
      agentDefinitions: { activeAgents: [], inactiveAgents: [] },
    },
    abortController: new AbortController(),
    readFileState: {} as ToolUseContext['readFileState'],
    getAppState: () => ({
      workflow: activePhaseId
        ? {
            mode: 'workflow',
            activePhaseId,
            workflowStatus: 'running',
            status: 'running',
            stateVersion: 1,
          }
        : undefined,
      toolPermissionContext: getEmptyToolPermissionContext(),
    } as unknown as ReturnType<ToolUseContext['getAppState']>),
    setAppState: () => {},
    setInProgressToolUseIDs: () => {},
    setResponseLength: () => {},
    updateFileHistoryState: () => {},
    updateAttributionState: () => {},
    messages: [],
  }
}

async function readWorkflowConfig(): Promise<unknown> {
  const storedTemplates = await readStoredUserWorkflowTemplates()
  if (storedTemplates.length > 0 || await legacyMigrationMarkerExists()) {
    return {
      schemaVersion: 1,
      templates: storedTemplates,
    }
  }
  try {
    return JSON.parse(
      await fs.readFile(path.join(tempConfigDir, 'cc-jiangxia', 'workflows.json'), 'utf-8'),
    )
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return undefined
    }
    throw error
  }
}

async function legacyMigrationMarkerExists(): Promise<boolean> {
  try {
    await fs.access(path.join(tempConfigDir, 'cc-jiangxia', 'workflows', 'packs', '.legacy-workflows-json-migrated'))
    return true
  } catch {
    return false
  }
}

async function readStoredUserWorkflowTemplates(): Promise<Record<string, unknown>[]> {
  const packs = await new PackRegistryService().listStoredWorkflowPacks()
  const templates: Record<string, unknown>[] = []
  for (const pack of packs) {
    for (const workflow of pack.workflows) {
      if (editableDefaultTemplateIds.has(workflow.id)) continue
      const zip = await zipAdapter.read(new Uint8Array(await fs.readFile(pack.storage.path)))
      const template = await zip.readJson(workflow.entrypoint) as Record<string, unknown>
      templates.push({
        ...template,
        source: 'user',
      })
    }
  }
  return templates.sort((a, b) => String(a.id).localeCompare(String(b.id)))
}

async function writeWorkflowConfig(config: Record<string, unknown>): Promise<void> {
  const filePath = path.join(tempConfigDir, 'cc-jiangxia', 'workflows.json')
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8')
  resetWorkflowTemplateRegistryForTests()
  try {
    await new WorkflowTemplateRegistryService().writeTemplates(
      Array.isArray(config.templates) ? config.templates : [],
    )
  } catch {
    resetWorkflowTemplateRegistryForTests()
  }
}

function buildDesktopSuccessResult(input: Record<string, unknown>): Record<string, unknown> {
  const operation = input.operation as string
  const baseResult = {
    operation,
    status: 'succeeded',
    persisted: true,
    validation: {
      valid: true,
      issues: [],
    },
    nextAction: 'none',
    message: `desktop ${operation} succeeded`,
  }

  if (operation === 'create' && typeof input.template === 'object' && input.template && 'id' in input.template) {
    return {
      ...baseResult,
      affectedTemplate: {
        source: 'user',
        id: String((input.template as Record<string, unknown>).id),
      },
    }
  }

  if (operation === 'update' && typeof input.selector === 'object' && input.selector && 'id' in input.selector) {
    return {
      ...baseResult,
      affectedTemplate: {
        source: 'user',
        id: String((input.selector as Record<string, unknown>).id),
      },
    }
  }

  if (operation === 'duplicate' && typeof input.target === 'object' && input.target && 'id' in input.target) {
    return {
      ...baseResult,
      affectedTemplate: {
        source: 'user',
        id: String((input.target as Record<string, unknown>).id),
      },
    }
  }

  if (operation === 'delete' && typeof input.selector === 'object' && input.selector && 'id' in input.selector) {
    return {
      ...baseResult,
      affectedTemplate: {
        source: 'user',
        id: String((input.selector as Record<string, unknown>).id),
      },
    }
  }

  return baseResult
}

describe('WorkflowTemplateAuthoringTool', () => {
  test('exports the global workflow template authoring tool with the contracted name and search hint', async () => {
    const tool = await loadTool()

    expect(tool.name).toBe(TOOL_NAME)
    expect(tool.searchHint).toBe('workflow template authoring and validation')
    expect(tool.isConcurrencySafe({ operation: 'list' })).toBe(false)
    expect(tool.maxResultSizeChars).toBeGreaterThan(0)
  })

  test('exports an API-bound input schema with an object root', async () => {
    const tool = await loadTool()
    const schema = await toolToAPISchema(tool, {
      getToolPermissionContext: async () => getEmptyToolPermissionContext(),
      tools: [],
      agents: [],
    })

    const inputSchema = schema.input_schema as Record<string, unknown>
    const properties = inputSchema.properties as Record<string, unknown>

    expect(inputSchema.type).toBe('object')
    expect(inputSchema.required).toEqual(['operation'])
    const operation = properties.operation as Record<string, unknown>
    const template = properties.template as Record<string, unknown>
    expect(operation.enum).toEqual(['guide', 'skill_catalog', 'skill_create', 'list', 'inspect', 'validate', 'create', 'update', 'duplicate', 'delete'])
    expect(template.type).toBe('object')
    expect(template.additionalProperties).toBe(true)
  })

  test('requests eager input streaming for large template authoring payloads when supported', async () => {
    const originalDisableExperimentalBetas = process.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS
    const originalAnthropicBaseUrl = process.env.ANTHROPIC_BASE_URL
    const originalUseBedrock = process.env.CLAUDE_CODE_USE_BEDROCK
    const originalUseVertex = process.env.CLAUDE_CODE_USE_VERTEX
    const originalUseFoundry = process.env.CLAUDE_CODE_USE_FOUNDRY
    const originalUseAzureOpenAI = process.env.CLAUDE_CODE_USE_AZURE_OPENAI

    delete process.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS
    delete process.env.ANTHROPIC_BASE_URL
    delete process.env.CLAUDE_CODE_USE_BEDROCK
    delete process.env.CLAUDE_CODE_USE_VERTEX
    delete process.env.CLAUDE_CODE_USE_FOUNDRY
    delete process.env.CLAUDE_CODE_USE_AZURE_OPENAI
    clearToolSchemaCache()

    try {
      const tool = await loadTool()
      const schema = await toolToAPISchema(tool, {
        getToolPermissionContext: async () => getEmptyToolPermissionContext(),
        tools: [],
        agents: [],
      }) as { eager_input_streaming?: boolean }

      expect(schema.eager_input_streaming).toBe(true)
    } finally {
      if (originalDisableExperimentalBetas === undefined) delete process.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS
      else process.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS = originalDisableExperimentalBetas

      if (originalAnthropicBaseUrl === undefined) delete process.env.ANTHROPIC_BASE_URL
      else process.env.ANTHROPIC_BASE_URL = originalAnthropicBaseUrl

      if (originalUseBedrock === undefined) delete process.env.CLAUDE_CODE_USE_BEDROCK
      else process.env.CLAUDE_CODE_USE_BEDROCK = originalUseBedrock

      if (originalUseVertex === undefined) delete process.env.CLAUDE_CODE_USE_VERTEX
      else process.env.CLAUDE_CODE_USE_VERTEX = originalUseVertex

      if (originalUseFoundry === undefined) delete process.env.CLAUDE_CODE_USE_FOUNDRY
      else process.env.CLAUDE_CODE_USE_FOUNDRY = originalUseFoundry

      if (originalUseAzureOpenAI === undefined) delete process.env.CLAUDE_CODE_USE_AZURE_OPENAI
      else process.env.CLAUDE_CODE_USE_AZURE_OPENAI = originalUseAzureOpenAI

      clearToolSchemaCache()
    }
  })

  test('accepts a large workflow template payload for validation without writing config', async () => {
    delete process.env.CC_JIANGXIA_DESKTOP_SERVER_URL
    const template = largeValidTemplate()
    expect(JSON.stringify({ operation: 'validate', template }).length).toBeGreaterThan(100_000)

    const tool = await loadTool()
    const input = { operation: 'validate' as const, template }

    expect(tool.inputSchema.safeParse(input).success).toBe(true)

    const result = await tool.call(
      input,
      contextFor(),
      async () => ({ behavior: 'allow', updatedInput: {} }),
      {} as never,
    )

    expect(result.data).toMatchObject({
      operation: 'validate',
      status: 'validated',
      persisted: false,
      validation: {
        valid: true,
        issues: [],
      },
      nextAction: 'none',
    })
    expect(await readWorkflowConfig()).toBeUndefined()
  })

  test('is included in base and ordinary assembled tool pools', async () => {
    const exportedTool = await loadTool()
    const baseTool = findToolByName(getAllBaseTools(), TOOL_NAME)
    const assembledTool = findToolByName(
      getTools(getEmptyToolPermissionContext()),
      TOOL_NAME,
    )

    expect(baseTool).toBe(exportedTool)
    expect(assembledTool).toBe(exportedTool)
  })

  test.each(['guide', 'skill_catalog', 'list', 'inspect', 'validate'] as const)('marks %s as read-only and non-destructive', async (operation) => {
    const tool = await loadTool()
    const input = operation === 'inspect'
      ? { operation, selector: { source: 'user', id: 'conversation-workflow' } }
      : operation === 'validate'
        ? { operation, template: validTemplate() }
        : operation === 'skill_catalog'
          ? { operation, query: 'release', source: 'user', limit: 25 }
        : { operation }

    expect(tool.inputSchema.safeParse(input).success).toBe(true)
    expect(tool.isReadOnly(input)).toBe(true)
    expect(tool.isDestructive?.(input)).toBe(false)
  })

  test('calls the direct authoring service path for the read-only skill catalog', async () => {
    delete process.env.CC_JIANGXIA_DESKTOP_SERVER_URL
    const skillDir = path.join(tempConfigDir, 'skills', 'release-checklist')
    await fs.mkdir(skillDir, { recursive: true })
    await fs.writeFile(
      path.join(skillDir, 'SKILL.md'),
      [
        '---',
        'name: Release Checklist',
        'description: Release readiness checks',
        '---',
        'Use this skill for release readiness.',
        '',
      ].join('\n'),
      'utf-8',
    )

    const tool = await loadTool()
    const result = await tool.call(
      { operation: 'skill_catalog', query: 'release', source: 'user' },
      contextFor(),
      async () => ({ behavior: 'allow', updatedInput: {} }),
      {} as never,
    )
    const block = tool.mapToolResultToToolResultBlockParam(result.data, 'tool-use-skill-catalog')

    expect(result.data).toMatchObject({
      operation: 'skill_catalog',
      status: 'succeeded',
      persisted: false,
      skillCatalog: [
        expect.objectContaining({
          name: 'release-checklist',
          source: 'user',
          recommendedReference: {
            name: 'release-checklist',
            mode: 'recommended',
            source: 'user',
          },
        }),
      ],
    })
    expect(block.content).toContain('operation=skill_catalog')
    expect(block.content).toContain('persisted=false')
    expect(await readWorkflowConfig()).toBeUndefined()
  })

  test('calls the direct authoring service path for creating missing user skills', async () => {
    delete process.env.CC_JIANGXIA_DESKTOP_SERVER_URL
    const tool = await loadTool()
    const result = await tool.call(
      {
        operation: 'skill_create',
        name: 'workflow-helper',
        description: 'Use when a workflow phase needs helper guidance.',
        body: 'Use this skill for workflow helper phases.',
      },
      contextFor(),
      async () => ({ behavior: 'allow', updatedInput: {} }),
      {} as never,
    )
    const block = tool.mapToolResultToToolResultBlockParam(result.data, 'tool-use-skill-create')

    expect(result.data).toMatchObject({
      operation: 'skill_create',
      status: 'succeeded',
      persisted: true,
      createdSkill: {
        name: 'workflow-helper',
        source: 'user',
        skillRoot: path.join(tempConfigDir, 'skills', 'workflow-helper'),
        recommendedReference: {
          name: 'workflow-helper',
          mode: 'recommended',
          source: 'user',
        },
      },
      validation: {
        valid: true,
        issues: [],
      },
    })
    expect(block.content).toContain('operation=skill_create')
    expect(block.content).toContain('persisted=true')
    expect(await fs.readFile(path.join(tempConfigDir, 'skills', 'workflow-helper', 'SKILL.md'), 'utf-8'))
      .toContain('Use this skill for workflow helper phases.')
    expect(await readWorkflowConfig()).toBeUndefined()
  })

  test('guides agents to create missing skills instead of guessing phase skill names', async () => {
    const tool = await loadTool()
    const prompt = await tool.prompt?.({})

    expect(prompt).toContain('Use skill_catalog before assigning phases[].skills')
    expect(prompt).toContain('If the needed skill is missing, use skill_create first')
    expect(prompt).toContain('returned recommendedReference')
    expect(prompt).toContain('phases[].skills are auxiliary attention metadata')
    expect(prompt).toContain('not the workflow phase list or control flow')
    expect(prompt).toContain('Omit phases[].skills when no installed or created skill fits')
  })

  test.each(['skill_create', 'create', 'update', 'duplicate'] as const)('marks %s as mutating and non-destructive', async (operation) => {
    const tool = await loadTool()
    const input = operation === 'skill_create'
      ? {
          operation,
          name: 'workflow-helper',
          description: 'Use when a workflow phase needs helper guidance.',
        }
      : operation === 'create'
      ? { operation, template: validTemplate() }
      : operation === 'update'
        ? {
            operation,
            selector: { source: 'user', id: 'conversation-workflow' },
            basisHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            template: validTemplate(),
          }
        : {
            operation,
            selector: { source: 'builtin', id: 'agent-development' },
            target: { id: 'agent-development-custom', name: 'Agent Development Custom' },
          }

    expect(tool.inputSchema.safeParse(input).success).toBe(true)
    expect(tool.isReadOnly(input)).toBe(false)
    expect(tool.isDestructive?.(input)).toBe(false)
  })

  test('marks delete as mutating and destructive', async () => {
    const tool = await loadTool()
    const input = {
      operation: 'delete',
      selector: { source: 'user', id: 'conversation-workflow' },
      basisHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    }

    expect(tool.inputSchema.safeParse(input).success).toBe(true)
    expect(tool.isReadOnly(input)).toBe(false)
    expect(tool.isDestructive?.(input)).toBe(true)
  })

  test('calls the direct authoring service path for create and list when desktop server URL is absent', async () => {
    delete process.env.CC_JIANGXIA_DESKTOP_SERVER_URL
    const tool = await loadTool()
    const context = contextFor()

    const createResult = await tool.call(
      { operation: 'create', template: validTemplate('direct-created-workflow') },
      context,
      async () => ({ behavior: 'allow', updatedInput: {} }),
      {} as never,
    )
    const listResult = await tool.call(
      { operation: 'list', source: 'user' },
      context,
      async () => ({ behavior: 'allow', updatedInput: {} }),
      {} as never,
    )

    expect(createResult.data).toMatchObject({
      operation: 'create',
      status: 'succeeded',
      persisted: true,
      affectedTemplate: {
        source: 'user',
        id: 'direct-created-workflow',
      },
      validation: {
        valid: true,
        issues: [],
      },
      nextAction: 'none',
    })
    expect(listResult.data).toMatchObject({
      operation: 'list',
      status: 'succeeded',
      persisted: false,
      templates: expect.arrayContaining([
        expect.objectContaining({
          source: 'user',
          id: 'direct-created-workflow',
        }),
      ]),
    })
    expect(await readWorkflowConfig()).toMatchObject({
      schemaVersion: 1,
      templates: expect.arrayContaining([
        expect.objectContaining({
          id: 'direct-created-workflow',
          source: 'user',
        }),
      ]),
    })
  })

  test('calls the direct authoring service path for duplicate user workflow templates when desktop server URL is absent', async () => {
    delete process.env.CC_JIANGXIA_DESKTOP_SERVER_URL
    await writeWorkflowConfig({
      schemaVersion: 1,
      templates: [{ ...validTemplate('agent-development'), name: 'Agent Development' }],
    })
    const tool = await loadTool()
    const context = contextFor()

    const result = await tool.call(
      {
        operation: 'duplicate',
        selector: {
          source: 'user',
          id: 'agent-development',
        },
      },
      context,
      async () => ({ behavior: 'allow', updatedInput: {} }),
      {} as never,
    )
    const block = tool.mapToolResultToToolResultBlockParam(result.data, 'tool-use-duplicate')

    expect(result.data).toMatchObject({
      operation: 'duplicate',
      status: 'succeeded',
      persisted: true,
      beforeSummary: {
        source: 'user',
        id: 'agent-development',
        editable: true,
        copyable: true,
      },
      validation: {
        valid: true,
        issues: [],
      },
      nextAction: 'none',
    })
    expect(result.data.affectedTemplate).toMatchObject({
      source: 'user',
      id: 'agent-development-copy',
      name: 'Agent Development Copy',
      basisHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    })
    expect(result.data.afterSummary).toMatchObject({
      source: 'user',
      id: 'agent-development-copy',
      editable: true,
      copyable: true,
    })
    expect(block.content).toContain('operation=duplicate')
    expect(block.content).toContain('affected=user:agent-development-copy')
    expect(block.content).toContain('persisted=true')
    const workflowConfig = await readWorkflowConfig() as { templates?: unknown[] }
    expect(workflowConfig.templates).toContainEqual(expect.objectContaining({
      id: 'agent-development-copy',
      source: 'user',
      name: 'Agent Development Copy',
    }))
  })

  test('calls the direct authoring service path for delete and renders an auditable destructive result', async () => {
    delete process.env.CC_JIANGXIA_DESKTOP_SERVER_URL
    await writeWorkflowConfig({
      schemaVersion: 1,
      templates: [validTemplate('direct-deleted-workflow')],
    })
    const tool = await loadTool()
    const context = contextFor()

    const inspectResult = await tool.call(
      {
        operation: 'inspect',
        selector: {
          source: 'user',
          id: 'direct-deleted-workflow',
        },
      },
      context,
      async () => ({ behavior: 'allow', updatedInput: {} }),
      {} as never,
    )
    const basisHash = inspectResult.data.affectedTemplate?.basisHash
    expect(basisHash).toMatch(/^sha256:[a-f0-9]{64}$/)

    const deleteResult = await tool.call(
      {
        operation: 'delete',
        selector: {
          source: 'user',
          id: 'direct-deleted-workflow',
        },
        basisHash,
      },
      context,
      async () => ({ behavior: 'allow', updatedInput: {} }),
      {} as never,
    )
    const block = tool.mapToolResultToToolResultBlockParam(deleteResult.data, 'tool-use-delete')

    expect(deleteResult.data).toMatchObject({
      operation: 'delete',
      status: 'succeeded',
      persisted: true,
      affectedTemplate: {
        source: 'user',
        id: 'direct-deleted-workflow',
        basisHash,
      },
      beforeSummary: {
        source: 'user',
        id: 'direct-deleted-workflow',
        basisHash,
      },
      validation: {
        valid: true,
        issues: [],
      },
      nextAction: 'none',
      message: 'Workflow template deleted.',
    })
    expect(block.content).toContain('operation=delete')
    expect(block.content).toContain('status=succeeded')
    expect(block.content).toContain('persisted=true')
    expect(block.content).toContain('affected=user:direct-deleted-workflow')
    const updatedConfig = await readWorkflowConfig()
    expect(updatedConfig).toMatchObject({ schemaVersion: 1 })
    expect(updatedConfig.templates).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'direct-deleted-workflow' }),
    ]))
  })

  test('returns validation diagnostics without writing for invalid direct validate calls', async () => {
    const tool = await loadTool()
    const result = await tool.call(
      {
        operation: 'validate',
        template: {
          ...validTemplate('invalid-workflow'),
          phases: [],
        },
      },
      contextFor(),
      async () => ({ behavior: 'allow', updatedInput: {} }),
      {} as never,
    )

    expect(result.data).toMatchObject({
      operation: 'validate',
      status: 'rejected',
      persisted: false,
      validation: {
        valid: false,
        issues: [
          expect.objectContaining({
            code: 'WORKFLOW_TEMPLATE_INVALID_PHASES',
          }),
        ],
      },
      nextAction: 'repair-and-validate',
    })
    expect(await readWorkflowConfig()).toBeUndefined()
  })

  test('allows mutating operations during every workflow phase and leaves phase rules as prompt guidance', async () => {
    const tool = await loadTool()

    await expect(tool.validateInput?.(
      { operation: 'list' },
      contextFor('requirements-clarification'),
    )).resolves.toEqual({ result: true })

    await expect(tool.validateInput?.(
      { operation: 'create', template: validTemplate('unrestricted-workflow') },
      contextFor('requirements-clarification'),
    )).resolves.toEqual({ result: true })
  })

  test('posts mutating operations to the desktop authoring endpoint and returns server responses without direct writes', async () => {
    const requests: Array<{ method: string; url: string; body: Record<string, unknown> }> = []
    const server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      async fetch(req) {
        const url = new URL(req.url)
        const body = await req.json() as Record<string, unknown>
        requests.push({
          method: req.method,
          url: url.pathname,
          body,
        })
        return Response.json(buildDesktopSuccessResult(body))
      },
    })

    process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = `http://127.0.0.1:${server.port}`

    try {
      const tool = await loadTool()
      const cases = [
        {
          operation: 'skill_create' as const,
          input: {
            operation: 'skill_create' as const,
            name: 'desktop-skill',
            description: 'Desktop skill create request.',
            body: 'Desktop skill body.',
          },
        },
        {
          operation: 'create' as const,
          input: { operation: 'create' as const, template: validTemplate('desktop-create-workflow') },
        },
        {
          operation: 'update' as const,
          input: {
            operation: 'update' as const,
            selector: { source: 'user' as const, id: 'desktop-update-workflow' },
            basisHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            template: validTemplate('desktop-update-workflow'),
          },
        },
        {
          operation: 'duplicate' as const,
          input: {
            operation: 'duplicate' as const,
            selector: { source: 'builtin' as const, id: 'agent-development' },
            target: { id: 'agent-development-desktop-copy', name: 'Agent Development Desktop Copy' },
          },
        },
        {
          operation: 'delete' as const,
          input: {
            operation: 'delete' as const,
            selector: { source: 'user' as const, id: 'desktop-delete-workflow' },
            basisHash: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          },
        },
      ]

      for (const testCase of cases) {
        const result = await tool.call(
          testCase.input,
          contextFor(),
          async () => ({ behavior: 'allow', updatedInput: {} }),
          {} as never,
        )
        const block = tool.mapToolResultToToolResultBlockParam(result.data, `tool-use-${testCase.operation}`)

        expect(result.data).toMatchObject({
          operation: testCase.operation,
          status: 'succeeded',
          persisted: true,
          validation: {
            valid: true,
            issues: [],
          },
          nextAction: 'none',
        })
        expect(block.content).toContain(`operation=${testCase.operation}`)
        expect(block.content).toContain('persisted=true')
        expect(await readWorkflowConfig()).toBeUndefined()
      }

      expect(requests).toEqual([
        expect.objectContaining({
          method: 'POST',
          url: '/api/workflows/templates/authoring',
          body: expect.objectContaining({ operation: 'skill_create' }),
        }),
        expect.objectContaining({
          method: 'POST',
          url: '/api/workflows/templates/authoring',
          body: expect.objectContaining({ operation: 'create' }),
        }),
        expect.objectContaining({
          method: 'POST',
          url: '/api/workflows/templates/authoring',
          body: expect.objectContaining({ operation: 'update' }),
        }),
        expect.objectContaining({
          method: 'POST',
          url: '/api/workflows/templates/authoring',
          body: expect.objectContaining({ operation: 'duplicate' }),
        }),
        expect.objectContaining({
          method: 'POST',
          url: '/api/workflows/templates/authoring',
          body: expect.objectContaining({ operation: 'delete' }),
        }),
      ])
    } finally {
      server.stop(true)
    }
  })

  test('posts mutating operations to the desktop authoring endpoint and reports retry-after-server-available on failures without direct writes', async () => {
    const requests: Array<{ method: string; url: string; body: Record<string, unknown> }> = []
    const server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      async fetch(req) {
        const url = new URL(req.url)
        const body = await req.json() as Record<string, unknown>
        requests.push({
          method: req.method,
          url: url.pathname,
          body,
        })
        return Response.json({
          message: `${String(body.operation)} endpoint unavailable`,
        }, { status: 503 })
      },
    })

    process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = `http://127.0.0.1:${server.port}`

    try {
      const tool = await loadTool()
      const cases = [
        {
          operation: 'skill_create' as const,
          input: {
            operation: 'skill_create' as const,
            name: 'desktop-skill-failure',
            description: 'Desktop skill create failure.',
          },
        },
        {
          operation: 'create' as const,
          input: { operation: 'create' as const, template: validTemplate('desktop-create-failure') },
        },
        {
          operation: 'update' as const,
          input: {
            operation: 'update' as const,
            selector: { source: 'user' as const, id: 'desktop-update-failure' },
            basisHash: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
            template: validTemplate('desktop-update-failure'),
          },
        },
        {
          operation: 'duplicate' as const,
          input: {
            operation: 'duplicate' as const,
            selector: { source: 'builtin' as const, id: 'agent-development' },
          },
        },
        {
          operation: 'delete' as const,
          input: {
            operation: 'delete' as const,
            selector: { source: 'user' as const, id: 'desktop-delete-failure' },
            basisHash: 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
          },
        },
      ]

      for (const testCase of cases) {
        const result = await tool.call(
          testCase.input,
          contextFor(),
          async () => ({ behavior: 'allow', updatedInput: {} }),
          {} as never,
        )
        const block = tool.mapToolResultToToolResultBlockParam(result.data, `tool-use-${testCase.operation}`)

        expect(result.data).toMatchObject({
          operation: testCase.operation,
          status: 'failed',
          persisted: false,
          validation: {
            valid: false,
            issues: [
              expect.objectContaining({
                code: 'WORKFLOW_TEMPLATE_DESKTOP_SERVER_UNAVAILABLE',
                message: `${testCase.operation} endpoint unavailable`,
              }),
            ],
          },
          nextAction: 'retry-after-server-available',
        })
        expect(block.content).toContain(`operation=${testCase.operation}`)
        expect(block.content).toContain('persisted=false')
        expect(block.content).toContain('WORKFLOW_TEMPLATE_DESKTOP_SERVER_UNAVAILABLE')
        expect(await readWorkflowConfig()).toBeUndefined()
      }

      expect(requests).toEqual([
        expect.objectContaining({
          method: 'POST',
          url: '/api/workflows/templates/authoring',
          body: expect.objectContaining({ operation: 'skill_create' }),
        }),
        expect.objectContaining({
          method: 'POST',
          url: '/api/workflows/templates/authoring',
          body: expect.objectContaining({ operation: 'create' }),
        }),
        expect.objectContaining({
          method: 'POST',
          url: '/api/workflows/templates/authoring',
          body: expect.objectContaining({ operation: 'update' }),
        }),
        expect.objectContaining({
          method: 'POST',
          url: '/api/workflows/templates/authoring',
          body: expect.objectContaining({ operation: 'duplicate' }),
        }),
        expect.objectContaining({
          method: 'POST',
          url: '/api/workflows/templates/authoring',
          body: expect.objectContaining({ operation: 'delete' }),
        }),
      ])
    } finally {
      server.stop(true)
    }
  })
})
