import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  WorkflowTemplateRegistryService,
  resetWorkflowTemplateRegistryForTests,
} from './workflowTemplateRegistryService.js'

type WorkflowTemplateFixture = {
  schemaVersion: 1
  templates: Array<{
    id: string
    version: string
    name: string
    description?: string
    phases: Array<{
      id: string
      name: string
      instructions: string
      completionCriteria: {
        type: string
        description: string
      }
      transition: {
        authority: string
      }
      [key: string]: unknown
    }>
    [key: string]: unknown
  }>
  [key: string]: unknown
}

const fixtureDir = path.join(
  import.meta.dir,
  '__fixtures__',
  'workflow-templates',
)

const agentDevelopmentPhaseIds = [
  'discussion',
  'specify',
  'plan',
  'tasks',
  'implement',
]

let tempConfigDir: string
let originalConfigDir: string | undefined

async function readFixture(fileName: string): Promise<WorkflowTemplateFixture> {
  return JSON.parse(
    await fs.readFile(path.join(fixtureDir, fileName), 'utf-8'),
  ) as WorkflowTemplateFixture
}

async function installFixture(fileName: string) {
  const ccHahaDir = path.join(tempConfigDir, 'cc-haha')
  await fs.mkdir(ccHahaDir, { recursive: true })
  await fs.copyFile(
    path.join(fixtureDir, fileName),
    path.join(ccHahaDir, 'workflows.json'),
  )
}

async function writeWorkflowConfig(configDir: string, config: unknown) {
  const ccHahaDir = path.join(configDir, 'cc-haha')
  await fs.mkdir(ccHahaDir, { recursive: true })
  await fs.writeFile(
    path.join(ccHahaDir, 'workflows.json'),
    `${JSON.stringify(config, null, 2)}\n`,
    'utf-8',
  )
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

function issueCodes(result: { invalidTemplates: Array<{ code: string }> }) {
  return result.invalidTemplates.map((issue) => issue.code)
}

describe('workflow template registry service', () => {
  beforeEach(async () => {
    tempConfigDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'cc-haha-workflow-templates-'),
    )
    originalConfigDir = process.env.CLAUDE_CONFIG_DIR
    process.env.CLAUDE_CONFIG_DIR = tempConfigDir
    resetWorkflowTemplateRegistryForTests()
  })

  afterEach(async () => {
    resetWorkflowTemplateRegistryForTests()
    if (originalConfigDir === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR
    } else {
      process.env.CLAUDE_CONFIG_DIR = originalConfigDir
    }
    await fs.rm(tempConfigDir, { recursive: true, force: true })
  })

  test('returns the refreshed builtin Agent Development preset when user config is missing', async () => {
    const expectedPreset = (await readFixture('agent-development.json')).templates[0]

    const result = await new WorkflowTemplateRegistryService().listTemplates()

    expect(result.invalidTemplates).toEqual([])
    expect(result.templates.map((template) => template.id)).toEqual([
      'agent-development',
    ])

    const builtin = result.templates[0]
    expect(builtin).toMatchObject({
      id: 'agent-development',
      source: 'builtin',
      version: expectedPreset.version,
      name: expectedPreset.name,
      description: expectedPreset.description,
    })
    expect(builtin.phases.map((phase) => phase.id)).toEqual(agentDevelopmentPhaseIds)
    expect(builtin.phases.map((phase) => phase.name)).toEqual(
      expectedPreset.phases.map((phase) => phase.name),
    )
    expect(builtin.phases).toHaveLength(expectedPreset.phases.length)
    expect(builtin.phases[0]).toMatchObject({
      id: 'discussion',
      completionCriteria: {
        type: 'manual-checklist',
      },
      transition: {
        authority: 'user-confirmation',
      },
    })
    expect(builtin.phases.at(-1)).toMatchObject({
      id: 'implement',
      completionCriteria: {
        type: 'agent-reported',
      },
    })
  })

  test('keeps a valid linear user template with more than five phases startable', async () => {
    await installFixture('more-than-five-linear-workflow.json')

    const result = await new WorkflowTemplateRegistryService().listTemplates()

    expect(result.invalidTemplates).toEqual([])
    const userTemplate = result.templates.find(
      (template) => template.id === 'extended-agent-development',
    )
    const expectedTemplate = (await readFixture('more-than-five-linear-workflow.json')).templates[0]

    expect(userTemplate?.source).toBe('user')
    expect(userTemplate?.phases.map((phase) => phase.id)).toEqual(
      expectedTemplate.phases.map((phase) => phase.id),
    )
    expect(userTemplate?.phases.length).toBeGreaterThan(5)
    expect(userTemplate?.phases.at(-1)?.id).toBe('retro')
  })

  test('preserves unknown workflow config, template, phase, skill, and transition fields when writing templates', async () => {
    await installFixture('user-template-with-unknown-fields.json')
    const expectedTemplate = (await readFixture('user-template-with-unknown-fields.json')).templates[0]

    const service = new WorkflowTemplateRegistryService()
    await service.writeTemplates([
      {
        schemaVersion: 1,
        id: expectedTemplate.id,
        version: '2',
        name: 'User Template With Unknown Fields Updated',
        phases: [
          {
            id: expectedTemplate.phases[0].id,
            name: expectedTemplate.phases[0].name,
            instructions: 'Updated instructions while preserving unknown fields.',
            completionCriteria: {
              type: 'manual-checklist',
              description: 'Unknown fields survive the write.',
            },
            transition: { authority: 'auto' },
          },
        ],
      },
    ])

    expect(
      await readJsonIfExists(path.join(tempConfigDir, 'cc-haha', 'workflows.json')),
    ).toMatchObject({
      schemaVersion: 1,
      ownerDefinedTopLevel: {
        keep: true,
      },
      templates: [
        {
          id: expectedTemplate.id,
          version: '2',
          ownerDefinedTemplateField: 'keep-template-field',
          phases: [
            {
              id: expectedTemplate.phases[0].id,
              ownerDefinedPhaseField: {
                keep: 'phase-field',
              },
              skills: [
                {
                  ownerDefinedSkillField: 'keep-skill-field',
                },
              ],
              transition: {
                ownerDefinedTransitionField: 'keep-transition-field',
              },
            },
          ],
        },
      ],
    })
  })

  test('reads workflow config only from cc-haha-owned storage and does not write protected Claude files', async () => {
    await installFixture('user-template-with-unknown-fields.json')

    const result = await new WorkflowTemplateRegistryService().listTemplates()

    expect(result.templates.map((template) => template.id)).toContain(
      'unknown-field-user-template',
    )
    expect(
      await readJsonIfExists(path.join(tempConfigDir, 'settings.json')),
    ).toBeUndefined()
    expect(
      await readJsonIfExists(path.join(tempConfigDir, 'projects', 'session.jsonl')),
    ).toBeUndefined()
    expect(
      await readJsonIfExists(path.join(tempConfigDir, 'cc-haha', 'settings.json')),
    ).toBeUndefined()
    expect(
      await readJsonIfExists(path.join(tempConfigDir, 'cc-haha', 'providers.json')),
    ).toBeUndefined()
    expect(
      await readJsonIfExists(path.join(tempConfigDir, 'adapter-sessions.json')),
    ).toBeUndefined()
    expect(
      await readJsonIfExists(path.join(tempConfigDir, 'cc-haha', 'workflows.json')),
    ).toMatchObject({
      schemaVersion: 1,
      ownerDefinedTopLevel: {
        keep: true,
      },
    })
  })

  test('uses only the isolated workflow config profile for user templates', async () => {
    const otherProfile = await fs.mkdtemp(
      path.join(os.tmpdir(), 'cc-haha-workflow-templates-other-'),
    )
    try {
      await writeWorkflowConfig(otherProfile, {
        schemaVersion: 1,
        templates: [
          {
            schemaVersion: 1,
            id: 'template-from-other-profile',
            version: '1',
            name: 'Template From Other Profile',
            phases: [
              {
                id: 'other',
                name: 'Other',
                instructions: 'This template belongs to a different profile.',
                completionCriteria: {
                  type: 'manual-checklist',
                  description: 'Should not be visible.',
                },
                transition: { authority: 'auto' },
              },
            ],
          },
        ],
      })
      await installFixture('more-than-five-linear-workflow.json')

      const result = await new WorkflowTemplateRegistryService().listTemplates()

      expect(result.templates.map((template) => template.id)).toEqual([
        'agent-development',
        'extended-agent-development',
      ])
      expect(result.templates.map((template) => template.id)).not.toContain(
        'template-from-other-profile',
      )
    } finally {
      await fs.rm(otherProfile, { recursive: true, force: true })
    }
  })

  test('reports malformed workflow config but keeps the builtin preset startable', async () => {
    await installFixture('malformed-workflows.json')

    const result = await new WorkflowTemplateRegistryService().listTemplates()

    expect(result.templates.map((template) => template.id)).toEqual([
      'agent-development',
    ])
    expect(issueCodes(result)).toContain('WORKFLOW_CONFIG_MALFORMED')
    expect(result.invalidTemplates[0]).toMatchObject({
      source: 'user-config',
      path: '$',
      severity: 'error',
    })
  })

  test('excludes missing config fields, empty phase arrays, and duplicate phase ids', async () => {
    await installFixture('invalid-user-workflows.json')

    const result = await new WorkflowTemplateRegistryService().listTemplates()

    expect(result.templates.map((template) => template.id)).toEqual([
      'agent-development',
    ])
    expect(issueCodes(result)).toEqual(
      expect.arrayContaining([
        'WORKFLOW_TEMPLATE_MISSING_REQUIRED_FIELD',
        'WORKFLOW_TEMPLATE_INVALID_PHASES',
        'WORKFLOW_PHASE_DUPLICATE_ID',
      ]),
    )
    expect(result.invalidTemplates.map((issue) => issue.templateId)).toEqual(
      expect.arrayContaining([
        'missing-name-template',
        'empty-phases-template',
        'duplicate-phase-template',
      ]),
    )
  })

  test('rejects duplicate user template ids so no duplicate user template is startable', async () => {
    await installFixture('duplicate-template-ids.json')

    const result = await new WorkflowTemplateRegistryService().listTemplates()

    expect(result.templates.map((template) => template.id)).toEqual([
      'agent-development',
    ])
    expect(issueCodes(result)).toContain('WORKFLOW_TEMPLATE_DUPLICATE_ID')
    expect(
      result.invalidTemplates.filter(
        (issue) => issue.templateId === 'duplicate-user-template',
      ),
    ).not.toEqual([])
  })

  test('rejects branching, loop, parallel, and nested workflow definitions for the linear first release', async () => {
    await installFixture('non-linear-workflows.json')

    const result = await new WorkflowTemplateRegistryService().listTemplates()

    expect(result.templates.map((template) => template.id)).toEqual([
      'agent-development',
    ])
    expect(issueCodes(result)).toEqual(
      expect.arrayContaining([
        'WORKFLOW_TEMPLATE_BRANCHING_UNSUPPORTED',
        'WORKFLOW_TEMPLATE_LOOP_UNSUPPORTED',
        'WORKFLOW_TEMPLATE_PARALLEL_UNSUPPORTED',
        'WORKFLOW_TEMPLATE_NESTED_UNSUPPORTED',
      ]),
    )
    expect(result.invalidTemplates.map((issue) => issue.templateId)).toEqual(
      expect.arrayContaining([
        'branching-template',
        'loop-template',
        'parallel-template',
        'nested-workflow-template',
      ]),
    )
  })

  test('prevents user templates from shadowing the builtin Agent Development preset id', async () => {
    await installFixture('builtin-id-conflict.json')

    const result = await new WorkflowTemplateRegistryService().listTemplates()

    expect(result.templates.map((template) => `${template.source}:${template.id}`)).toEqual([
      'builtin:agent-development',
    ])
    expect(result.templates[0]?.phases.map((phase) => phase.id)).toEqual(
      agentDevelopmentPhaseIds,
    )
    expect(issueCodes(result)).toContain('WORKFLOW_TEMPLATE_BUILTIN_ID_CONFLICT')
    expect(result.invalidTemplates).toContainEqual(
      expect.objectContaining({
        source: 'user-config',
        templateId: 'agent-development',
        severity: 'error',
      }),
    )
  })
})
