import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import {
  executeWorkflowTemplateAuthoringOperation,
  workflowTemplateBasisHash,
  type WorkflowTemplateSummary,
} from './workflowTemplateAuthoringService.js'
import { resetWorkflowTemplateRegistryForTests } from './workflowTemplateRegistryService.js'
import { workflowTemplateAuthoringGuide } from './workflowTemplateAuthoringGuide.js'

type WorkflowTemplateAuthoringFixture = {
  schemaVersion: 1
  id: string
  version: string
  name: string
  description: string
  phases: WorkflowTemplatePhaseFixture[]
  [key: string]: unknown
}

type WorkflowTemplatePhaseFixture = {
  id: string
  name: string
  instructions: string
  objective: string
  requiredIntake: string[]
  handoffRules: string[]
  executionRules: string[]
  outputArtifact: {
    id: string
    name: string
    kind: string
    description: string
    required: true
    [key: string]: unknown
  }
  completionCriteria: {
    type: 'manual-checklist' | 'artifact-required' | 'agent-reported'
    description: string
    [key: string]: unknown
  }
  transition: {
    authority: 'auto' | 'user-confirmation'
    [key: string]: unknown
  }
  [key: string]: unknown
}

type WorkflowConfigFixture = {
  schemaVersion: 1
  templates: WorkflowTemplateAuthoringFixture[]
  [key: string]: unknown
}

type ConfigSnapshot = {
  workflowConfig: unknown
  protectedFiles: Record<string, unknown>
}

const protectedConfigRelativePaths = [
  'settings.json',
  path.join('projects', 'session.jsonl'),
  path.join('cc-jiangxia', 'settings.json'),
  path.join('cc-jiangxia', 'providers.json'),
  'adapter-sessions.json',
]

let tempConfigDir: string
let originalConfigDir: string | undefined

function workflowConfigPath(configDir = tempConfigDir): string {
  return path.join(configDir, 'cc-jiangxia', 'workflows.json')
}

async function setupIsolatedClaudeConfigDir(): Promise<void> {
  tempConfigDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'cc-jiangxia-workflow-authoring-'),
  )
  originalConfigDir = process.env.CLAUDE_CONFIG_DIR
  process.env.CLAUDE_CONFIG_DIR = tempConfigDir
  resetWorkflowTemplateRegistryForTests()
}

async function cleanupIsolatedClaudeConfigDir(): Promise<void> {
  resetWorkflowTemplateRegistryForTests()
  if (originalConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR
  } else {
    process.env.CLAUDE_CONFIG_DIR = originalConfigDir
  }
  await fs.rm(tempConfigDir, { recursive: true, force: true })
}

function validPhase(
  overrides: Partial<WorkflowTemplatePhaseFixture> = {},
): WorkflowTemplatePhaseFixture {
  return {
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
    ...overrides,
  }
}

function validTemplate(
  overrides: Partial<WorkflowTemplateAuthoringFixture> = {},
): WorkflowTemplateAuthoringFixture {
  return {
    schemaVersion: 1,
    id: 'custom-workflow',
    version: '1',
    name: 'Custom Workflow',
    description: 'A workflow template authored through tests.',
    phases: [validPhase()],
    ...overrides,
  }
}

function validWorkflowConfig(
  templates: WorkflowTemplateAuthoringFixture[] = [validTemplate()],
  overrides: Partial<WorkflowConfigFixture> = {},
): WorkflowConfigFixture {
  return {
    schemaVersion: 1,
    templates,
    ...overrides,
  }
}

async function writeWorkflowConfig(
  config: WorkflowConfigFixture,
  configDir = tempConfigDir,
): Promise<void> {
  const filePath = workflowConfigPath(configDir)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8')
  resetWorkflowTemplateRegistryForTests()
}

async function readJsonIfExists(filePath: string): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf-8'))
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

async function readWorkflowConfig(
  configDir = tempConfigDir,
): Promise<unknown> {
  return readJsonIfExists(workflowConfigPath(configDir))
}

async function snapshotConfig(configDir = tempConfigDir): Promise<ConfigSnapshot> {
  const protectedFiles = Object.fromEntries(
    await Promise.all(
      protectedConfigRelativePaths.map(async (relativePath) => [
        relativePath,
        await readJsonIfExists(path.join(configDir, relativePath)),
      ]),
    ),
  )

  return {
    workflowConfig: await readWorkflowConfig(configDir),
    protectedFiles,
  }
}

async function expectConfigUnchanged<T>(
  operation: () => Promise<T>,
  configDir = tempConfigDir,
): Promise<T> {
  const before = await snapshotConfig(configDir)
  const result = await operation()
  const after = await snapshotConfig(configDir)
  expect(after).toEqual(before)
  return result
}

describe('workflow template authoring service test helpers', () => {
  beforeEach(async () => {
    await setupIsolatedClaudeConfigDir()
  })

  afterEach(async () => {
    await cleanupIsolatedClaudeConfigDir()
  })

  test('sets up an isolated workflow config path under CLAUDE_CONFIG_DIR', async () => {
    expect(process.env.CLAUDE_CONFIG_DIR).toBe(tempConfigDir)
    expect(workflowConfigPath()).toBe(
      path.join(tempConfigDir, 'cc-jiangxia', 'workflows.json'),
    )
    expect(await readWorkflowConfig()).toBeUndefined()

    await writeWorkflowConfig(validWorkflowConfig([
      validTemplate({
        id: 'isolated-workflow',
        name: 'Isolated Workflow',
      }),
    ]))

    expect(await readWorkflowConfig()).toEqual({
      schemaVersion: 1,
      templates: [
        expect.objectContaining({
          id: 'isolated-workflow',
          phases: [expect.objectContaining({ id: 'draft' })],
        }),
      ],
    })
  })

  test('provides reusable no-write assertions for workflow config and protected files', async () => {
    await writeWorkflowConfig(validWorkflowConfig([
      validTemplate({ id: 'unchanged-workflow' }),
    ]))

    const result = await expectConfigUnchanged(async () => {
      expect(await readWorkflowConfig()).toEqual(
        expect.objectContaining({
          templates: [expect.objectContaining({ id: 'unchanged-workflow' })],
        }),
      )
      return { persisted: false, reason: 'helper-only-no-write' }
    })

    expect(result).toEqual({
      persisted: false,
      reason: 'helper-only-no-write',
    })
    expect(await readJsonIfExists(path.join(tempConfigDir, 'settings.json'))).toBeUndefined()
    expect(await readJsonIfExists(path.join(tempConfigDir, 'cc-jiangxia', 'providers.json'))).toBeUndefined()
  })
})

describe('workflow template authoring service read-only operations', () => {
  beforeEach(async () => {
    await setupIsolatedClaudeConfigDir()
  })

  afterEach(async () => {
    await cleanupIsolatedClaudeConfigDir()
  })

  test('returns deterministic guide envelope without writing config or protected state', async () => {
    const result = await expectConfigUnchanged(() =>
      executeWorkflowTemplateAuthoringOperation({ operation: 'guide' }),
    )

    expect(result).toEqual({
      operation: 'guide',
      status: 'succeeded',
      persisted: false,
      validation: {
        valid: true,
        issues: [],
      },
      guide: workflowTemplateAuthoringGuide,
      nextAction: 'none',
      message: 'Workflow template authoring guide returned.',
    })
  })

  test('lists builtin and user summaries with stable user basis hashes without writing', async () => {
    await writeWorkflowConfig(validWorkflowConfig([
      validTemplate({
        id: 'custom-workflow',
        name: 'Custom Workflow',
        version: '1.0.0',
      }),
    ]))

    const result = await expectConfigUnchanged(() =>
      executeWorkflowTemplateAuthoringOperation({ operation: 'list' }),
    )
    const userSummary = result.templates?.find((template) => template.source === 'user') as WorkflowTemplateSummary
    const builtinSummary = result.templates?.find((template) => template.source === 'builtin') as WorkflowTemplateSummary

    expect(result).toMatchObject({
      operation: 'list',
      status: 'succeeded',
      persisted: false,
      validation: {
        valid: true,
        issues: [],
      },
      invalidTemplates: [],
      nextAction: 'none',
      message: 'Workflow templates listed.',
    })
    expect(builtinSummary).toMatchObject({
      source: 'builtin',
      id: 'agent-development',
      editable: false,
      copyable: true,
    })
    expect(builtinSummary.basisHash).toBeUndefined()
    expect(userSummary).toMatchObject({
      source: 'user',
      id: 'custom-workflow',
      name: 'Custom Workflow',
      version: '1.0.0',
      phaseCount: 1,
      editable: true,
      copyable: true,
    })
    expect(userSummary.basisHash).toMatch(/^sha256:[a-f0-9]{64}$/)

    const repeat = await expectConfigUnchanged(() =>
      executeWorkflowTemplateAuthoringOperation({ operation: 'list' }),
    )
    const repeatedUserSummary = repeat.templates?.find((template) => template.source === 'user')
    expect(repeatedUserSummary?.basisHash).toBe(userSummary.basisHash)
  })

  test('lists invalid user template diagnostics without writing', async () => {
    await writeWorkflowConfig({
      schemaVersion: 1,
      templates: [
        validTemplate({ id: 'valid-workflow' }),
        {
          schemaVersion: 1,
          id: 'invalid-workflow',
          version: '1',
          name: 'Invalid Workflow',
          description: 'Missing phases.',
          phases: [],
        },
      ],
    } as WorkflowConfigFixture)

    const result = await expectConfigUnchanged(() =>
      executeWorkflowTemplateAuthoringOperation({ operation: 'list', source: 'user' }),
    )

    expect(result).toMatchObject({
      operation: 'list',
      status: 'succeeded',
      persisted: false,
      validation: {
        valid: false,
        issues: [
          expect.objectContaining({
            source: 'user-config',
            templateId: 'invalid-workflow',
            code: 'WORKFLOW_TEMPLATE_INVALID_PHASES',
          }),
        ],
      },
      invalidTemplates: [
        expect.objectContaining({
          templateId: 'invalid-workflow',
          code: 'WORKFLOW_TEMPLATE_INVALID_PHASES',
        }),
      ],
      nextAction: 'repair-and-validate',
    })
    expect(result.templates?.map((template) => template.id)).toEqual(['valid-workflow'])
  })

  test('inspects user template with editability metadata and basis hash without writing', async () => {
    await writeWorkflowConfig(validWorkflowConfig([
      validTemplate({
        id: 'inspectable-workflow',
        name: 'Inspectable Workflow',
        version: '2',
        customUnknownField: { preserved: true },
      }),
    ]))

    const result = await expectConfigUnchanged(() =>
      executeWorkflowTemplateAuthoringOperation({
        operation: 'inspect',
        selector: {
          source: 'user',
          id: 'inspectable-workflow',
        },
      }),
    )
    const affectedBasisHash = result.affectedTemplate?.basisHash
    const summaryBasisHash = result.beforeSummary?.basisHash
    const templateBasisHash = workflowTemplateBasisHash(result.template!)

    expect(result).toMatchObject({
      operation: 'inspect',
      status: 'succeeded',
      persisted: false,
      affectedTemplate: {
        source: 'user',
        id: 'inspectable-workflow',
        name: 'Inspectable Workflow',
        version: '2',
        basisHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      },
      beforeSummary: {
        source: 'user',
        id: 'inspectable-workflow',
        editable: true,
        copyable: true,
        basisHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      },
      validation: {
        valid: true,
        issues: [],
      },
      invalidTemplates: [],
      template: expect.objectContaining({
        source: 'user',
        id: 'inspectable-workflow',
        customUnknownField: { preserved: true },
      }),
      nextAction: 'none',
      message: 'Workflow template inspected.',
    })
    expect(affectedBasisHash).toBe(summaryBasisHash)
    expect(affectedBasisHash).toBe(templateBasisHash)
  })

  test('rejects missing inspect target without writing and gives inspect retry action', async () => {
    await writeWorkflowConfig(validWorkflowConfig([
      validTemplate({ id: 'existing-workflow' }),
    ]))

    const result = await expectConfigUnchanged(() =>
      executeWorkflowTemplateAuthoringOperation({
        operation: 'inspect',
        selector: {
          source: 'user',
          id: 'missing-workflow',
        },
      }),
    )

    expect(result).toEqual({
      operation: 'inspect',
      status: 'rejected',
      persisted: false,
      affectedTemplate: {
        source: 'user',
        id: 'missing-workflow',
      },
      validation: {
        valid: false,
        issues: [
          {
            source: 'authoring',
            path: '$.selector',
            code: 'WORKFLOW_TEMPLATE_TARGET_NOT_FOUND',
            message: 'No user workflow template was found for id "missing-workflow".',
            severity: 'error',
            templateId: 'missing-workflow',
          },
        ],
      },
      invalidTemplates: [],
      nextAction: 'inspect-and-retry',
      message: 'Workflow template target was not found.',
    })
  })

  test('validates candidates through shared validation without writing', async () => {
    await writeWorkflowConfig(validWorkflowConfig([
      validTemplate({ id: 'existing-workflow' }),
    ]))

    const validCandidate = validTemplate({
      id: 'new-workflow',
      name: 'New Workflow',
    })
    const result = await expectConfigUnchanged(() =>
      executeWorkflowTemplateAuthoringOperation({
        operation: 'validate',
        template: validCandidate,
      }),
    )

    expect(result).toMatchObject({
      operation: 'validate',
      status: 'validated',
      persisted: false,
      affectedTemplate: {
        source: 'user',
        id: 'new-workflow',
        name: 'New Workflow',
        version: '1',
      },
      validation: {
        valid: true,
        issues: [],
      },
      invalidTemplates: [],
      template: expect.objectContaining({
        source: 'user',
        id: 'new-workflow',
      }),
      nextAction: 'none',
      message: 'Workflow template candidate is valid.',
    })
  })

  test('rejects invalid validation candidates without writing config or protected state', async () => {
    await writeWorkflowConfig(validWorkflowConfig([
      validTemplate({ id: 'existing-workflow' }),
    ]))

    const result = await expectConfigUnchanged(() =>
      executeWorkflowTemplateAuthoringOperation({
        operation: 'validate',
        template: {
          schemaVersion: 1,
          id: 'existing-workflow',
          version: '1',
          name: 'Existing Workflow',
          description: 'Conflicts with existing user template and has no phases.',
          phases: [],
        },
      }),
    )

    expect(result).toMatchObject({
      operation: 'validate',
      status: 'rejected',
      persisted: false,
      validation: {
        valid: false,
        issues: expect.arrayContaining([
          expect.objectContaining({
            source: 'authoring',
            templateId: 'existing-workflow',
            code: 'WORKFLOW_TEMPLATE_CONFLICT',
          }),
          expect.objectContaining({
            source: 'authoring',
            templateId: 'existing-workflow',
            code: 'WORKFLOW_TEMPLATE_INVALID_PHASES',
          }),
        ]),
      },
      invalidTemplates: [],
      nextAction: 'repair-and-validate',
      message: 'Workflow template candidate is invalid.',
    })
  })
})

describe('workflow template authoring service create operation', () => {
  beforeEach(async () => {
    await setupIsolatedClaudeConfigDir()
  })

  afterEach(async () => {
    await cleanupIsolatedClaudeConfigDir()
  })

  test('persists a valid user template with an auditable create result', async () => {
    const candidate = validTemplate({
      id: 'conversation-workflow',
      name: 'Conversation Workflow',
      version: '1.0.0',
    })

    const result = await executeWorkflowTemplateAuthoringOperation({
      operation: 'create',
      template: candidate,
    })
    const affectedBasisHash = result.affectedTemplate?.basisHash
    const afterSummaryBasisHash = result.afterSummary?.basisHash

    expect(result).toMatchObject({
      operation: 'create',
      status: 'succeeded',
      persisted: true,
      affectedTemplate: {
        source: 'user',
        id: 'conversation-workflow',
        name: 'Conversation Workflow',
        version: '1.0.0',
        basisHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      },
      validation: {
        valid: true,
        issues: [],
      },
      afterSummary: {
        source: 'user',
        id: 'conversation-workflow',
        editable: true,
        copyable: true,
        basisHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      },
      invalidTemplates: [],
      nextAction: 'none',
      message: 'Workflow template created.',
    })
    expect(afterSummaryBasisHash).toBe(affectedBasisHash)
    expect(await readWorkflowConfig()).toEqual({
      schemaVersion: 1,
      templates: [
        expect.objectContaining({
          id: 'conversation-workflow',
          source: 'user',
          name: 'Conversation Workflow',
        }),
      ],
    })
  })

  test('rejects invalid create candidates without writing and returns repair diagnostics', async () => {
    const result = await expectConfigUnchanged(() =>
      executeWorkflowTemplateAuthoringOperation({
        operation: 'create',
        template: {
          ...validTemplate({ id: 'invalid-create-workflow' }),
          phases: [],
        },
      }),
    )

    expect(result).toMatchObject({
      operation: 'create',
      status: 'rejected',
      persisted: false,
      validation: {
        valid: false,
        issues: [
          expect.objectContaining({
            source: 'authoring',
            templateId: 'invalid-create-workflow',
            code: 'WORKFLOW_TEMPLATE_INVALID_PHASES',
          }),
        ],
      },
      invalidTemplates: [],
      nextAction: 'repair-and-validate',
      message: 'Workflow template candidate is invalid.',
    })
  })

  test('rejects create id conflicts without overwriting existing user templates', async () => {
    await writeWorkflowConfig(validWorkflowConfig([
      validTemplate({
        id: 'conversation-workflow',
        name: 'Existing Conversation Workflow',
      }),
    ]))

    const result = await expectConfigUnchanged(() =>
      executeWorkflowTemplateAuthoringOperation({
        operation: 'create',
        template: validTemplate({
          id: 'conversation-workflow',
          name: 'Replacement Conversation Workflow',
        }),
      }),
    )

    expect(result).toMatchObject({
      operation: 'create',
      status: 'rejected',
      persisted: false,
      affectedTemplate: {
        source: 'user',
        id: 'conversation-workflow',
      },
      validation: {
        valid: false,
        issues: [
          expect.objectContaining({
            source: 'authoring',
            templateId: 'conversation-workflow',
            code: 'WORKFLOW_TEMPLATE_CONFLICT',
          }),
        ],
      },
      nextAction: 'choose-unique-target',
      message: 'Workflow template id already exists.',
    })
  })

  test('lists a newly created template after refetch from the same registry store', async () => {
    const createResult = await executeWorkflowTemplateAuthoringOperation({
      operation: 'create',
      template: validTemplate({
        id: 'listed-after-create',
        name: 'Listed After Create',
      }),
    })
    const listResult = await executeWorkflowTemplateAuthoringOperation({
      operation: 'list',
      source: 'user',
    })

    expect(createResult).toMatchObject({
      operation: 'create',
      status: 'succeeded',
      persisted: true,
    })
    expect(listResult.templates).toContainEqual(expect.objectContaining({
      source: 'user',
      id: 'listed-after-create',
      name: 'Listed After Create',
      editable: true,
      copyable: true,
      basisHash: createResult.affectedTemplate?.basisHash,
    }))
  })
})

describe('workflow template authoring service runtime snapshot safety', () => {
  beforeEach(async () => {
    await setupIsolatedClaudeConfigDir()
  })

  afterEach(async () => {
    await cleanupIsolatedClaudeConfigDir()
  })

  test('mutating operations preserve protected session and transcript-like files while updating only workflow templates', async () => {
    await fs.mkdir(path.join(tempConfigDir, 'projects'), { recursive: true })
    await fs.writeFile(
      path.join(tempConfigDir, 'projects', 'session.jsonl'),
      '{"session":"keep"}\n',
      'utf-8',
    )
    await fs.writeFile(
      path.join(tempConfigDir, 'adapter-sessions.json'),
      JSON.stringify({ adapter: 'keep' }, null, 2),
      'utf-8',
    )

    await writeWorkflowConfig(validWorkflowConfig([
      validTemplate({
        id: 'runtime-safe-workflow',
        name: 'Runtime Safe Workflow',
        version: '1.0.0',
      }),
    ]))

    const initialSnapshot = await snapshotConfig()

    const createResult = await executeWorkflowTemplateAuthoringOperation({
      operation: 'create',
      template: validTemplate({
        id: 'runtime-safe-create',
        name: 'Runtime Safe Create',
      }),
    })
    const inspectResult = await executeWorkflowTemplateAuthoringOperation({
      operation: 'inspect',
      selector: {
        source: 'user',
        id: 'runtime-safe-workflow',
      },
    })
    const updateResult = await executeWorkflowTemplateAuthoringOperation({
      operation: 'update',
      selector: {
        source: 'user',
        id: 'runtime-safe-workflow',
      },
      basisHash: inspectResult.affectedTemplate?.basisHash,
      template: validTemplate({
        id: 'runtime-safe-workflow',
        name: 'Runtime Safe Workflow Updated',
        version: '1.0.1',
      }),
    })
    const duplicateResult = await executeWorkflowTemplateAuthoringOperation({
      operation: 'duplicate',
      selector: {
        source: 'builtin',
        id: 'agent-development',
      },
    })
    const deleteInspectResult = await executeWorkflowTemplateAuthoringOperation({
      operation: 'inspect',
      selector: {
        source: 'user',
        id: 'runtime-safe-create',
      },
    })
    const deleteResult = await executeWorkflowTemplateAuthoringOperation({
      operation: 'delete',
      selector: {
        source: 'user',
        id: 'runtime-safe-create',
      },
      basisHash: deleteInspectResult.affectedTemplate?.basisHash,
    })

    const finalSnapshot = await snapshotConfig()

    expect(createResult).toMatchObject({ operation: 'create', status: 'succeeded', persisted: true })
    expect(updateResult).toMatchObject({ operation: 'update', status: 'succeeded', persisted: true })
    expect(duplicateResult).toMatchObject({ operation: 'duplicate', status: 'succeeded', persisted: true })
    expect(deleteResult).toMatchObject({ operation: 'delete', status: 'succeeded', persisted: true })
    expect(finalSnapshot.protectedFiles).toEqual(initialSnapshot.protectedFiles)
    expect(finalSnapshot.protectedFiles).toEqual({
      'settings.json': undefined,
      [path.join('projects', 'session.jsonl')]: {
        session: 'keep',
      },
      [path.join('cc-jiangxia', 'settings.json')]: undefined,
      [path.join('cc-jiangxia', 'providers.json')]: undefined,
      [path.join('adapter-sessions.json')]: {
        adapter: 'keep',
      },
    })
    expect(finalSnapshot.workflowConfig).toMatchObject({
      schemaVersion: 1,
      templates: expect.arrayContaining([
        expect.objectContaining({ id: 'runtime-safe-workflow', name: 'Runtime Safe Workflow Updated' }),
        expect.objectContaining({ id: 'agent-development-custom', source: 'user' }),
      ]),
    })
    expect(finalSnapshot.workflowConfig).not.toEqual(initialSnapshot.workflowConfig)
  })
})

describe('workflow template authoring service update operation', () => {
  beforeEach(async () => {
    await setupIsolatedClaudeConfigDir()
  })

  afterEach(async () => {
    await cleanupIsolatedClaudeConfigDir()
  })

  test('updates a user template when selector source, template id, and basis hash match', async () => {
    await writeWorkflowConfig(validWorkflowConfig([
      validTemplate({
        id: 'editable-workflow',
        version: '1.0.0',
        name: 'Editable Workflow',
        ownerDefinedTemplateField: { keep: 'template' },
        phases: [
          validPhase({
            id: 'draft',
            ownerDefinedPhaseField: { keep: 'phase' },
            outputArtifact: {
              id: 'draft-output',
              name: 'Draft Output',
              kind: 'markdown',
              description: 'The draft artifact.',
              required: true,
              ownerDefinedArtifactField: 'keep-artifact',
            },
            completionCriteria: {
              type: 'artifact-required',
              description: 'The draft artifact is complete.',
              ownerDefinedCriteriaField: 'keep-criteria',
            },
            transition: {
              authority: 'user-confirmation',
              ownerDefinedTransitionField: 'keep-transition',
            },
          }),
        ],
      }),
    ], {
      ownerDefinedTopLevel: { keep: 'config' },
    }))

    const inspectResult = await executeWorkflowTemplateAuthoringOperation({
      operation: 'inspect',
      selector: {
        source: 'user',
        id: 'editable-workflow',
      },
    })
    const basisHash = inspectResult.affectedTemplate?.basisHash
    expect(basisHash).toMatch(/^sha256:[a-f0-9]{64}$/)

    const updatedTemplate = validTemplate({
      id: 'editable-workflow',
      version: '1.0.1',
      name: 'Editable Workflow Updated',
      description: 'Updated through the authoring service.',
      phases: [
        validPhase({
          id: 'draft',
          instructions: 'Draft the updated workflow output.',
          objective: 'Produce an updated structured draft.',
        }),
      ],
    })

    const validateResult = await executeWorkflowTemplateAuthoringOperation({
      operation: 'validate',
      allowExistingId: 'editable-workflow',
      template: updatedTemplate,
    })
    expect(validateResult).toMatchObject({
      operation: 'validate',
      status: 'validated',
      persisted: false,
      validation: {
        valid: true,
        issues: [],
      },
      nextAction: 'none',
    })

    const result = await executeWorkflowTemplateAuthoringOperation({
      operation: 'update',
      selector: {
        source: 'user',
        id: 'editable-workflow',
      },
      basisHash,
      template: updatedTemplate,
    })

    expect(result).toMatchObject({
      operation: 'update',
      status: 'succeeded',
      persisted: true,
      affectedTemplate: {
        source: 'user',
        id: 'editable-workflow',
        name: 'Editable Workflow Updated',
        version: '1.0.1',
        basisHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      },
      beforeSummary: {
        source: 'user',
        id: 'editable-workflow',
        name: 'Editable Workflow',
        version: '1.0.0',
        basisHash,
      },
      afterSummary: {
        source: 'user',
        id: 'editable-workflow',
        name: 'Editable Workflow Updated',
        version: '1.0.1',
        editable: true,
        copyable: true,
        basisHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      },
      validation: {
        valid: true,
        issues: [],
      },
      invalidTemplates: [],
      nextAction: 'none',
      message: 'Workflow template updated.',
    })
    expect(result.afterSummary?.basisHash).toBe(result.affectedTemplate?.basisHash)
    expect(result.afterSummary?.basisHash).not.toBe(basisHash)
    expect(await readWorkflowConfig()).toMatchObject({
      schemaVersion: 1,
      ownerDefinedTopLevel: { keep: 'config' },
      templates: [
        {
          id: 'editable-workflow',
          source: 'user',
          version: '1.0.1',
          name: 'Editable Workflow Updated',
          ownerDefinedTemplateField: { keep: 'template' },
          phases: [
            {
              id: 'draft',
              instructions: 'Draft the updated workflow output.',
              ownerDefinedPhaseField: { keep: 'phase' },
              outputArtifact: {
                ownerDefinedArtifactField: 'keep-artifact',
              },
              completionCriteria: {
                ownerDefinedCriteriaField: 'keep-criteria',
              },
              transition: {
                ownerDefinedTransitionField: 'keep-transition',
              },
            },
          ],
        },
      ],
    })
  })

  test('rejects stale user template updates without changing the manually edited config', async () => {
    await writeWorkflowConfig(validWorkflowConfig([
      validTemplate({
        id: 'stale-workflow',
        version: '1.0.0',
        name: 'Stale Workflow',
      }),
    ]))

    const inspectResult = await executeWorkflowTemplateAuthoringOperation({
      operation: 'inspect',
      selector: {
        source: 'user',
        id: 'stale-workflow',
      },
    })
    const oldBasisHash = inspectResult.affectedTemplate?.basisHash
    expect(oldBasisHash).toMatch(/^sha256:[a-f0-9]{64}$/)

    await writeWorkflowConfig(validWorkflowConfig([
      validTemplate({
        id: 'stale-workflow',
        version: '1.0.1',
        name: 'Stale Workflow Manually Edited',
      }),
    ]))
    const manuallyEditedConfig = await readWorkflowConfig()

    const result = await executeWorkflowTemplateAuthoringOperation({
      operation: 'update',
      selector: {
        source: 'user',
        id: 'stale-workflow',
      },
      basisHash: oldBasisHash,
      template: validTemplate({
        id: 'stale-workflow',
        version: '1.0.2',
        name: 'Stale Workflow Agent Update',
      }),
    })

    expect(result).toMatchObject({
      operation: 'update',
      status: 'rejected',
      persisted: false,
      affectedTemplate: {
        source: 'user',
        id: 'stale-workflow',
        name: 'Stale Workflow Manually Edited',
        version: '1.0.1',
        basisHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      },
      validation: {
        valid: false,
        issues: [
          expect.objectContaining({
            source: 'authoring',
            path: '$.basisHash',
            code: 'WORKFLOW_TEMPLATE_STALE_BASIS',
            templateId: 'stale-workflow',
          }),
        ],
      },
      nextAction: 'inspect-and-retry',
      message: 'Workflow template basis is stale; inspect the template and retry with the current basisHash.',
    })
    expect(result.affectedTemplate?.basisHash).not.toBe(oldBasisHash)
    expect(await readWorkflowConfig()).toEqual(manuallyEditedConfig)
  })

  test('rejects builtin template updates with copy guidance without writing config', async () => {
    const result = await expectConfigUnchanged(() =>
      executeWorkflowTemplateAuthoringOperation({
        operation: 'update',
        selector: {
          source: 'builtin',
          id: 'agent-development',
        },
        basisHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        template: validTemplate({
          id: 'agent-development',
          name: 'Edited Builtin',
        }),
      }),
    )

    expect(result).toMatchObject({
      operation: 'update',
      status: 'rejected',
      persisted: false,
      affectedTemplate: {
        source: 'builtin',
        id: 'agent-development',
      },
      validation: {
        valid: false,
        issues: [
          expect.objectContaining({
            source: 'authoring',
            path: '$.selector.source',
            code: 'WORKFLOW_TEMPLATE_BUILTIN_READONLY',
            templateId: 'agent-development',
          }),
        ],
      },
      nextAction: 'copy-builtin-first',
      message: 'Builtin workflow templates are read-only; duplicate the template before editing.',
    })
  })
})

describe('workflow template authoring service duplicate operation', () => {
  beforeEach(async () => {
    await setupIsolatedClaudeConfigDir()
  })

  afterEach(async () => {
    await cleanupIsolatedClaudeConfigDir()
  })

  test('duplicates builtin agent-development to the default user custom template without changing the builtin', async () => {
    const builtinBefore = await executeWorkflowTemplateAuthoringOperation({
      operation: 'inspect',
      selector: {
        source: 'builtin',
        id: 'agent-development',
      },
    })

    const result = await executeWorkflowTemplateAuthoringOperation({
      operation: 'duplicate',
      selector: {
        source: 'builtin',
        id: 'agent-development',
      },
    })

    expect(result).toMatchObject({
      operation: 'duplicate',
      status: 'succeeded',
      persisted: true,
      affectedTemplate: {
        source: 'user',
        id: 'agent-development-custom',
        name: 'Agent Development Custom',
        version: builtinBefore.affectedTemplate?.version,
        basisHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      },
      beforeSummary: {
        source: 'builtin',
        id: 'agent-development',
        name: 'Agent Development',
        editable: false,
        copyable: true,
      },
      afterSummary: {
        source: 'user',
        id: 'agent-development-custom',
        name: 'Agent Development Custom',
        editable: true,
        copyable: true,
        basisHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      },
      validation: {
        valid: true,
        issues: [],
      },
      invalidTemplates: [],
      nextAction: 'none',
      message: 'Workflow template duplicated.',
    })
    expect(result.afterSummary?.basisHash).toBe(result.affectedTemplate?.basisHash)

    const persistedConfig = await readWorkflowConfig()
    expect(persistedConfig).toEqual({
      schemaVersion: 1,
      templates: [
        expect.objectContaining({
          source: 'user',
          id: 'agent-development-custom',
          name: 'Agent Development Custom',
        }),
      ],
    })

    const builtinAfter = await executeWorkflowTemplateAuthoringOperation({
      operation: 'inspect',
      selector: {
        source: 'builtin',
        id: 'agent-development',
      },
    })
    expect(builtinAfter.template).toEqual(builtinBefore.template)
    expect(builtinAfter.affectedTemplate).toEqual(builtinBefore.affectedTemplate)
  })

  test('chooses incrementing default target suffixes when prior user copies exist', async () => {
    const first = await executeWorkflowTemplateAuthoringOperation({
      operation: 'duplicate',
      selector: {
        source: 'builtin',
        id: 'agent-development',
      },
    })
    const second = await executeWorkflowTemplateAuthoringOperation({
      operation: 'duplicate',
      selector: {
        source: 'builtin',
        id: 'agent-development',
      },
    })
    const third = await executeWorkflowTemplateAuthoringOperation({
      operation: 'duplicate',
      selector: {
        source: 'builtin',
        id: 'agent-development',
      },
    })

    expect(first.affectedTemplate).toMatchObject({
      source: 'user',
      id: 'agent-development-custom',
      name: 'Agent Development Custom',
    })
    expect(second.affectedTemplate).toMatchObject({
      source: 'user',
      id: 'agent-development-custom-2',
      name: 'Agent Development Custom',
    })
    expect(third.affectedTemplate).toMatchObject({
      source: 'user',
      id: 'agent-development-custom-3',
      name: 'Agent Development Custom',
    })
    expect(await readWorkflowConfig()).toMatchObject({
      templates: [
        expect.objectContaining({ id: 'agent-development-custom' }),
        expect.objectContaining({ id: 'agent-development-custom-2' }),
        expect.objectContaining({ id: 'agent-development-custom-3' }),
      ],
    })
  })

  test('honors requested non-conflicting target id and name for builtin copies', async () => {
    const result = await executeWorkflowTemplateAuthoringOperation({
      operation: 'duplicate',
      selector: {
        source: 'builtin',
        id: 'agent-development',
      },
      target: {
        id: 'agent-development-team-edition',
        name: 'Agent Development Team Edition',
      },
    })

    expect(result).toMatchObject({
      operation: 'duplicate',
      status: 'succeeded',
      persisted: true,
      affectedTemplate: {
        source: 'user',
        id: 'agent-development-team-edition',
        name: 'Agent Development Team Edition',
        basisHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      },
      afterSummary: {
        source: 'user',
        id: 'agent-development-team-edition',
        name: 'Agent Development Team Edition',
        editable: true,
        copyable: true,
      },
      nextAction: 'none',
    })
    expect(await readWorkflowConfig()).toMatchObject({
      templates: [
        expect.objectContaining({
          id: 'agent-development-team-edition',
          name: 'Agent Development Team Edition',
        }),
      ],
    })
  })

  test('rejects requested target ids that shadow builtins or conflict with existing user templates without writing', async () => {
    await writeWorkflowConfig(validWorkflowConfig([
      validTemplate({
        id: 'existing-copy',
        name: 'Existing Copy',
      }),
    ]))

    const builtinShadow = await expectConfigUnchanged(() =>
      executeWorkflowTemplateAuthoringOperation({
        operation: 'duplicate',
        selector: {
          source: 'builtin',
          id: 'agent-development',
        },
        target: {
          id: 'agent-development',
          name: 'Shadow Builtin',
        },
      }),
    )
    const userConflict = await expectConfigUnchanged(() =>
      executeWorkflowTemplateAuthoringOperation({
        operation: 'duplicate',
        selector: {
          source: 'builtin',
          id: 'agent-development',
        },
        target: {
          id: 'existing-copy',
          name: 'Overwrite Existing Copy',
        },
      }),
    )

    expect(builtinShadow).toMatchObject({
      operation: 'duplicate',
      status: 'rejected',
      persisted: false,
      affectedTemplate: {
        source: 'user',
        id: 'agent-development',
      },
      validation: {
        valid: false,
        issues: [
          expect.objectContaining({
            source: 'authoring',
            templateId: 'agent-development',
            code: 'WORKFLOW_TEMPLATE_BUILTIN_ID_CONFLICT',
          }),
        ],
      },
      nextAction: 'choose-unique-target',
    })
    expect(userConflict).toMatchObject({
      operation: 'duplicate',
      status: 'rejected',
      persisted: false,
      affectedTemplate: {
        source: 'user',
        id: 'existing-copy',
      },
      validation: {
        valid: false,
        issues: [
          expect.objectContaining({
            source: 'authoring',
            templateId: 'existing-copy',
            code: 'WORKFLOW_TEMPLATE_CONFLICT',
          }),
        ],
      },
      nextAction: 'choose-unique-target',
    })
  })
})

describe('workflow template authoring service delete operation', () => {
  beforeEach(async () => {
    await setupIsolatedClaudeConfigDir()
  })

  afterEach(async () => {
    await cleanupIsolatedClaudeConfigDir()
  })

  test('deletes a user template when selector source and basis hash match', async () => {
    await writeWorkflowConfig(validWorkflowConfig([
      validTemplate({
        id: 'deletable-workflow',
        version: '1.0.0',
        name: 'Deletable Workflow',
      }),
    ]))

    const inspectResult = await executeWorkflowTemplateAuthoringOperation({
      operation: 'inspect',
      selector: {
        source: 'user',
        id: 'deletable-workflow',
      },
    })
    const basisHash = inspectResult.affectedTemplate?.basisHash
    expect(basisHash).toMatch(/^sha256:[a-f0-9]{64}$/)

    const result = await executeWorkflowTemplateAuthoringOperation({
      operation: 'delete',
      selector: {
        source: 'user',
        id: 'deletable-workflow',
      },
      basisHash,
    })

    expect(result).toMatchObject({
      operation: 'delete',
      status: 'succeeded',
      persisted: true,
      affectedTemplate: {
        source: 'user',
        id: 'deletable-workflow',
        name: 'Deletable Workflow',
        version: '1.0.0',
        basisHash,
      },
      beforeSummary: {
        source: 'user',
        id: 'deletable-workflow',
        name: 'Deletable Workflow',
        version: '1.0.0',
        editable: true,
        copyable: true,
        basisHash,
      },
      validation: {
        valid: true,
        issues: [],
      },
      invalidTemplates: [],
      nextAction: 'none',
      message: 'Workflow template deleted.',
    })
    expect(result.templates).toContainEqual(expect.objectContaining({
      source: 'builtin',
      id: 'agent-development',
      editable: false,
    }))
    expect(result.templates?.some((template) => template.id === 'deletable-workflow')).toBe(false)
    expect(await readWorkflowConfig()).toEqual({
      schemaVersion: 1,
      templates: [],
    })
  })

  test('rejects builtin template deletes with copy guidance without writing config', async () => {
    const result = await expectConfigUnchanged(() =>
      executeWorkflowTemplateAuthoringOperation({
        operation: 'delete',
        selector: {
          source: 'builtin',
          id: 'agent-development',
        },
        basisHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      }),
    )

    expect(result).toMatchObject({
      operation: 'delete',
      status: 'rejected',
      persisted: false,
      affectedTemplate: {
        source: 'builtin',
        id: 'agent-development',
      },
      validation: {
        valid: false,
        issues: [
          expect.objectContaining({
            source: 'authoring',
            path: '$.selector.source',
            code: 'WORKFLOW_TEMPLATE_BUILTIN_READONLY',
            templateId: 'agent-development',
          }),
        ],
      },
      nextAction: 'copy-builtin-first',
      message: 'Builtin workflow templates are read-only; duplicate the template before editing.',
    })
  })

  test('rejects missing user delete targets without writing config', async () => {
    await writeWorkflowConfig(validWorkflowConfig([
      validTemplate({ id: 'existing-workflow' }),
    ]))

    const result = await expectConfigUnchanged(() =>
      executeWorkflowTemplateAuthoringOperation({
        operation: 'delete',
        selector: {
          source: 'user',
          id: 'missing-workflow',
        },
        basisHash: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      }),
    )

    expect(result).toMatchObject({
      operation: 'delete',
      status: 'rejected',
      persisted: false,
      affectedTemplate: {
        source: 'user',
        id: 'missing-workflow',
      },
      validation: {
        valid: false,
        issues: [
          expect.objectContaining({
            source: 'authoring',
            path: '$.selector',
            code: 'WORKFLOW_TEMPLATE_TARGET_NOT_FOUND',
            templateId: 'missing-workflow',
          }),
        ],
      },
      nextAction: 'inspect-and-retry',
      message: 'Workflow template target was not found.',
    })
  })

  test('rejects stale user template deletes without changing the manually edited config', async () => {
    await writeWorkflowConfig(validWorkflowConfig([
      validTemplate({
        id: 'stale-delete-workflow',
        version: '1.0.0',
        name: 'Stale Delete Workflow',
      }),
    ]))

    const inspectResult = await executeWorkflowTemplateAuthoringOperation({
      operation: 'inspect',
      selector: {
        source: 'user',
        id: 'stale-delete-workflow',
      },
    })
    const oldBasisHash = inspectResult.affectedTemplate?.basisHash
    expect(oldBasisHash).toMatch(/^sha256:[a-f0-9]{64}$/)

    await writeWorkflowConfig(validWorkflowConfig([
      validTemplate({
        id: 'stale-delete-workflow',
        version: '1.0.1',
        name: 'Stale Delete Workflow Manually Edited',
      }),
    ]))
    const manuallyEditedConfig = await readWorkflowConfig()

    const result = await executeWorkflowTemplateAuthoringOperation({
      operation: 'delete',
      selector: {
        source: 'user',
        id: 'stale-delete-workflow',
      },
      basisHash: oldBasisHash,
    })

    expect(result).toMatchObject({
      operation: 'delete',
      status: 'rejected',
      persisted: false,
      affectedTemplate: {
        source: 'user',
        id: 'stale-delete-workflow',
        name: 'Stale Delete Workflow Manually Edited',
        version: '1.0.1',
        basisHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      },
      validation: {
        valid: false,
        issues: [
          expect.objectContaining({
            source: 'authoring',
            path: '$.basisHash',
            code: 'WORKFLOW_TEMPLATE_STALE_BASIS',
            templateId: 'stale-delete-workflow',
          }),
        ],
      },
      nextAction: 'inspect-and-retry',
      message: 'Workflow template basis is stale; inspect the template and retry with the current basisHash.',
    })
    expect(result.affectedTemplate?.basisHash).not.toBe(oldBasisHash)
    expect(await readWorkflowConfig()).toEqual(manuallyEditedConfig)
  })
})
