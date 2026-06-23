import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  WorkflowTemplateRegistryService,
  collectTemplateSkillCatalog,
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

let tempConfigDir: string
let originalConfigDir: string | undefined

async function readFixture(fileName: string): Promise<WorkflowTemplateFixture> {
  return JSON.parse(
    await fs.readFile(path.join(fixtureDir, fileName), 'utf-8'),
  ) as WorkflowTemplateFixture
}

async function installFixture(fileName: string) {
  const ccJiangxiaDir = path.join(tempConfigDir, 'cc-jiangxia')
  await fs.mkdir(ccJiangxiaDir, { recursive: true })
  await fs.copyFile(
    path.join(fixtureDir, fileName),
    path.join(ccJiangxiaDir, 'workflows.json'),
  )
}

async function writeWorkflowConfig(configDir: string, config: unknown) {
  const ccJiangxiaDir = path.join(configDir, 'cc-jiangxia')
  await fs.mkdir(ccJiangxiaDir, { recursive: true })
  await fs.writeFile(
    path.join(ccJiangxiaDir, 'workflows.json'),
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

function validPhase(overrides: Record<string, unknown> = {}) {
  return {
    id: 'draft',
    name: 'Draft',
    instructions: 'Draft the phase output and handoff.',
    objective: 'Produce a structured draft.',
    requiredIntake: ['Use the previous phase output.'],
    handoffRules: ['Summarize output, evidence, and next-phase readiness.'],
    executionRules: ['Keep the phase inside the approved workflow contract.'],
    outputArtifact: {
      id: 'draft-output',
      name: 'Draft Output',
      kind: 'markdown',
      description: 'A structured phase output.',
      required: true,
    },
    completionCriteria: {
      type: 'manual-checklist',
      description: 'The output and handoff are complete.',
    },
    transition: { authority: 'auto' },
    ...overrides,
  }
}

function validTemplate(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    id: 'draft-workflow',
    version: '1',
    name: 'Draft Workflow',
    phases: [validPhase()],
    ...overrides,
  }
}

function validWorkflowConfigTemplate(
  overrides: Record<string, unknown> = {},
  phaseOverrides: Record<string, unknown> = {},
) {
  const template = validTemplate(overrides)
  const phases = Array.isArray(template.phases) ? template.phases : []

  return {
    ...template,
    phases: phases.map((phase) => ({
      ...validPhase({ id: undefined }),
      ...phase,
      ...phaseOverrides,
    })),
  }
}

describe('workflow template registry service', () => {
  beforeEach(async () => {
    tempConfigDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'cc-jiangxia-workflow-templates-'),
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

  test('returns no default templates when user config is missing', async () => {
    const result = await new WorkflowTemplateRegistryService().listTemplates()

    expect(result.invalidTemplates).toEqual([])
    expect(result.templates).toEqual([])
  })

  test('keeps a valid linear user template with more than five phases startable', async () => {
    const fixture = await readFixture('more-than-five-linear-workflow.json')
    await writeWorkflowConfig(tempConfigDir, {
      ...fixture,
      templates: fixture.templates.map((template) => validWorkflowConfigTemplate(template)),
    })

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
    const fixture = await readFixture('user-template-with-unknown-fields.json')
    const expectedTemplate = fixture.templates[0]
    await writeWorkflowConfig(tempConfigDir, {
      ...fixture,
      templates: fixture.templates.map((template) => validWorkflowConfigTemplate(template)),
    })

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
            objective: 'Preserve unknown fields.',
            requiredIntake: ['Existing phase metadata.'],
            handoffRules: ['Keep matching unknown fields during persistence.'],
            outputArtifact: {
              id: 'preserved-output',
              name: 'Preserved Output',
              kind: 'markdown',
              description: 'Updated output with preserved unknown fields.',
              required: true,
            },
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
      await readJsonIfExists(path.join(tempConfigDir, 'cc-jiangxia', 'workflows.json')),
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

  test('keeps legacy phase skills with name and reason compatible when listing templates', async () => {
    const skillDir = path.join(tempConfigDir, 'skills', 'legacy-compatible-skill')
    await fs.mkdir(skillDir, { recursive: true })
    await fs.writeFile(
      path.join(skillDir, 'SKILL.md'),
      [
        '---',
        'name: Legacy Compatible Skill',
        'description: Legacy phase skill compatibility fixture',
        '---',
        'Use this skill for legacy compatibility tests.',
        '',
      ].join('\n'),
      'utf-8',
    )
    await writeWorkflowConfig(tempConfigDir, {
      schemaVersion: 1,
      templates: [
        validWorkflowConfigTemplate({
          id: 'legacy-skills-template',
          version: '1',
          name: 'Legacy Skills Template',
          phases: [
            validPhase({
              id: 'draft',
              name: 'Draft',
              skills: [
                {
                  name: 'legacy-compatible-skill',
                  source: 'user',
                  reason: 'Use this when changing behavior.',
                  ownerDefinedSkillField: 'keep-skill-field',
                },
              ],
            }),
          ],
        }),
      ],
    })

    const result = await new WorkflowTemplateRegistryService().listTemplates()

    expect(result.invalidTemplates).toEqual([])
    expect(result.templates.find((template) => template.id === 'legacy-skills-template'))
      .toMatchObject({
        phases: [
          {
            skills: [
              {
                name: 'legacy-compatible-skill',
                source: 'user',
                mode: 'recommended',
                reason: 'Use this when changing behavior.',
                ownerDefinedSkillField: 'keep-skill-field',
              },
            ],
          },
        ],
      })
  })

  test('reports malformed phase skill references as validation errors', async () => {
    await writeWorkflowConfig(tempConfigDir, {
      schemaVersion: 1,
      templates: [
        validWorkflowConfigTemplate({
          id: 'invalid-skill-reference-template',
          version: '1',
          name: 'Invalid Skill Reference Template',
          phases: [
            validPhase({
              id: 'draft',
              name: 'Draft',
              skills: [
                {
                  name: '   ',
                },
              ],
            }),
          ],
        }),
      ],
    })

    const result = await new WorkflowTemplateRegistryService().listTemplates()

    expect(result.templates.map((template) => template.id)).not.toContain(
      'invalid-skill-reference-template',
    )
    expect(result.invalidTemplates).toContainEqual(expect.objectContaining({
      source: 'user-config',
      templateId: 'invalid-skill-reference-template',
      path: '$.templates[0].phases[0].skills[0]',
      code: 'WORKFLOW_PHASE_SKILL_INVALID_REFERENCE',
      severity: 'error',
    }))
  })

  test('keeps templates startable when recommended phase skills are missing or unsupported warnings', async () => {
    await writeWorkflowConfig(tempConfigDir, {
      schemaVersion: 1,
      templates: [
        validWorkflowConfigTemplate({
          id: 'missing-recommended-skills-template',
          version: '1',
          name: 'Missing Recommended Skills Template',
          phases: [
            validPhase({
              id: 'draft',
              name: 'Draft',
              skills: [
                { name: 'missing-skill' },
                { name: 'remote-skill', source: 'mcp' },
              ],
            }),
          ],
        }),
      ],
    })

    const result = await new WorkflowTemplateRegistryService().listTemplates()

    expect(result.templates.map((template) => template.id)).toContain(
      'missing-recommended-skills-template',
    )
    expect(result.invalidTemplates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        templateId: 'missing-recommended-skills-template',
        code: 'WORKFLOW_PHASE_SKILL_MISSING',
        severity: 'warning',
      }),
      expect.objectContaining({
        templateId: 'missing-recommended-skills-template',
        code: 'WORKFLOW_PHASE_SKILL_UNSUPPORTED_SOURCE',
        severity: 'warning',
      }),
    ]))
  })

  test('projects legacy flat phase fields into grouped phase contract sections when listing templates', async () => {
    await installFixture('legacy-flat-phase-contract.json')

    const result = await new WorkflowTemplateRegistryService().listTemplates()

    expect(result.invalidTemplates).toEqual([])
    expect(result.templates.find((template) => template.id === 'legacy-flat-phase-contract'))
      .toMatchObject({
        phases: [
          {
            id: 'specify',
            intent: {
              objective: 'Produce a planning-ready specification.',
              role: 'Specify',
              intake: ['Use the accepted discussion brief.'],
            },
            contract: {
              instructions: 'Convert the discussion brief into explicit requirements.',
              executionRules: ['Do not design implementation architecture.'],
              actionPolicy: {
                allowedActions: ['read discussion artifacts'],
                forbiddenActions: ['edit production source'],
                ownerDefinedActionPolicyField: 'keep-action-policy',
              },
              transitionAuthority: 'user-confirmation',
            },
            evidencePolicy: {
              outputArtifact: {
                id: 'specification-brief',
                ownerDefinedOutputField: 'keep-output',
              },
              requiredArtifacts: [
                {
                  id: 'discussion-brief',
                  ownerDefinedArtifactField: 'keep-artifact',
                },
              ],
              completionCriteria: {
                type: 'manual-checklist',
                ownerDefinedCriteriaField: 'keep-criteria',
              },
              handoffRules: [
                'Summarize requirements, acceptance criteria, and open questions.',
              ],
            },
            ownerDefinedPhaseField: {
              keep: true,
            },
          },
        ],
      })
  })

  test('accepts grouped-only phase contracts without requiring duplicate flat authoring fields', async () => {
    await writeWorkflowConfig(tempConfigDir, {
      schemaVersion: 1,
      templates: [
        {
          schemaVersion: 1,
          id: 'grouped-only-contract',
          version: '1',
          name: 'Grouped Only Contract',
          phases: [
            {
              id: 'contract',
              intent: {
                objective: 'State the phase goal.',
                role: 'Contract Author',
                intake: ['Use the previous phase artifact.'],
              },
              contract: {
                instructions: 'Execute only the approved phase contract.',
                executionRules: ['Stay inside the workflow scope.'],
                actionPolicy: {
                  allowedActions: ['read workflow artifacts'],
                  forbiddenActions: ['write runtime session state into templates'],
                },
                transitionAuthority: 'auto',
              },
              evidencePolicy: {
                outputArtifact: {
                  id: 'contract-output',
                  name: 'Contract Output',
                  kind: 'markdown',
                  description: 'The phase contract output.',
                  required: true,
                },
                requiredArtifacts: [],
                completionCriteria: {
                  type: 'artifact-required',
                  description: 'The required output artifact exists.',
                },
                handoffRules: ['Record evidence and next-step readiness.'],
              },
            },
          ],
        },
      ],
    })

    const result = await new WorkflowTemplateRegistryService().listTemplates()

    expect(result.invalidTemplates).toEqual([])
    expect(result.templates.find((template) => template.id === 'grouped-only-contract'))
      .toMatchObject({
        phases: [
          {
            id: 'contract',
            name: 'Contract Author',
            instructions: 'Execute only the approved phase contract.',
            transition: { authority: 'auto' },
            outputArtifact: {
              id: 'contract-output',
              required: true,
            },
          },
        ],
      })
  })

  test('normalizes per-phase tool policy from flat and grouped workflow templates', async () => {
    await writeWorkflowConfig(tempConfigDir, {
      schemaVersion: 1,
      templates: [
        {
          schemaVersion: 1,
          id: 'phase-tool-policy',
          version: '1',
          name: 'Phase Tool Policy',
          phases: [
            {
              id: 'build',
              name: 'Build',
              instructions: 'Build with selected tools.',
              objective: 'Implement the approved task.',
              requiredIntake: ['Approved task packet.'],
              handoffRules: ['Summarize changed files and checks.'],
              executionRules: ['Stay in scope.'],
              toolPolicy: {
                allowedTools: ['Bash', 'Write', 'submit_phase_completion'],
              },
              outputArtifact: {
                id: 'build-output',
                name: 'Build Output',
                kind: 'markdown',
                description: 'Implementation notes.',
                required: true,
              },
              completionCriteria: {
                type: 'artifact-required',
                description: 'Implementation notes are complete.',
              },
              transition: { authority: 'user-confirmation' },
            },
            {
              id: 'author',
              intent: {
                objective: 'Author workflow changes.',
                role: 'Author',
                intake: ['Workflow request.'],
              },
              contract: {
                instructions: 'Edit the workflow template.',
                executionRules: ['Keep schema valid.'],
                toolPolicy: {
                  allowedTools: ['workflow_template_authoring', 'submit_phase_completion'],
                },
                transitionAuthority: 'auto',
              },
              evidencePolicy: {
                outputArtifact: {
                  id: 'author-output',
                  name: 'Author Output',
                  kind: 'markdown',
                  description: 'Authoring evidence.',
                  required: true,
                },
                requiredArtifacts: [],
                completionCriteria: {
                  type: 'artifact-required',
                  description: 'Authoring evidence is complete.',
                },
                handoffRules: ['Record template update evidence.'],
              },
            },
          ],
        },
      ],
    })

    const result = await new WorkflowTemplateRegistryService().listTemplates()

    expect(result.invalidTemplates).toEqual([])
    expect(result.templates.find((template) => template.id === 'phase-tool-policy'))
      .toMatchObject({
        phases: [
          {
            id: 'build',
            toolPolicy: {
              allowedTools: ['Bash', 'Write', 'submit_phase_completion'],
            },
          },
          {
            id: 'author',
            toolPolicy: {
              allowedTools: ['workflow_template_authoring', 'submit_phase_completion'],
            },
            contract: {
              toolPolicy: {
                allowedTools: ['workflow_template_authoring', 'submit_phase_completion'],
              },
            },
          },
        ],
      })
  })

  test('rejects per-phase tool policies with unknown tools', async () => {
    await writeWorkflowConfig(tempConfigDir, {
      schemaVersion: 1,
      templates: [
        validWorkflowConfigTemplate({
          id: 'invalid-phase-tool-policy',
          version: '1',
          name: 'Invalid Phase Tool Policy',
          phases: [
            validPhase({
              id: 'invalid-tools',
              name: 'Invalid Tools',
              toolPolicy: {
                allowedTools: ['Bash', 'rm_everything'],
              },
            }),
          ],
        }),
      ],
    })

    const result = await new WorkflowTemplateRegistryService().listTemplates()

    expect(result.templates.map((template) => template.id)).not.toContain(
      'invalid-phase-tool-policy',
    )
    expect(result.invalidTemplates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        templateId: 'invalid-phase-tool-policy',
        code: 'WORKFLOW_PHASE_TOOL_POLICY_UNKNOWN_TOOL',
        severity: 'error',
      }),
    ]))
  })

  test('rejects grouped phase contracts with invalid constraint strengths and skill provenance', async () => {
    await writeWorkflowConfig(tempConfigDir, {
      schemaVersion: 1,
      templates: [
        validWorkflowConfigTemplate({
          id: 'invalid-grouped-contract',
          version: '1',
          name: 'Invalid Grouped Contract',
          phases: [
            validPhase({
              id: 'invalid-contract',
              name: 'Invalid Contract',
              intent: {
                objective: 'This objective tries to become a hard gate.',
                role: 'Invalid Role',
                intake: ['Previous artifact.'],
                strength: 'gate',
              },
              contract: {
                instructions: 'Invalid grouped contract.',
                executionRules: [
                  {
                    text: 'Execution rules are policy constraints.',
                    strength: 'evidence',
                  },
                ],
                actionPolicy: {
                  allowedActions: ['read artifacts'],
                  forbiddenActions: ['edit runtime state'],
                },
                transitionAuthority: 'auto',
              },
              evidencePolicy: {
                outputArtifact: {
                  id: 'invalid-output',
                  name: 'Invalid Output',
                  kind: 'markdown',
                  description: 'Invalid strength metadata.',
                  required: true,
                  strength: 'guidance',
                },
                requiredArtifacts: [],
                completionCriteria: {
                  type: 'manual-checklist',
                  description: 'Invalid criteria strength.',
                  strength: 'policy',
                },
                handoffRules: ['Handoff rule.'],
              },
              skills: [
                {
                  name: 'tdd-workflow',
                  mode: 'recommended',
                  source: 'plugin',
                  pluginName: '',
                  referenceId: '',
                },
              ],
            }),
          ],
        }),
      ],
    })

    const result = await new WorkflowTemplateRegistryService().listTemplates()

    expect(result.templates.map((template) => template.id)).not.toContain(
      'invalid-grouped-contract',
    )
    expect(result.invalidTemplates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        templateId: 'invalid-grouped-contract',
        code: 'WORKFLOW_PHASE_CONSTRAINT_STRENGTH_INVALID',
        severity: 'error',
      }),
      expect.objectContaining({
        templateId: 'invalid-grouped-contract',
        code: 'WORKFLOW_PHASE_SKILL_INVALID_PROVENANCE',
        severity: 'error',
      }),
    ]))
  })

  test('strips session-owned runtime state while preserving unknown template fields when writing templates', async () => {
    const fixture = await readFixture('legacy-flat-phase-contract.json')
    const expectedTemplate = fixture.templates[0]
    await writeWorkflowConfig(tempConfigDir, fixture)

    await new WorkflowTemplateRegistryService().writeTemplates([
      {
        schemaVersion: 1,
        id: expectedTemplate.id,
        version: '2',
        name: expectedTemplate.name,
        ownerDefinedTemplateField: 'updated-template-field',
        phases: [
          {
            id: expectedTemplate.phases[0].id,
            name: expectedTemplate.phases[0].name,
            instructions: expectedTemplate.phases[0].instructions,
            objective: expectedTemplate.phases[0].objective,
            requiredIntake: expectedTemplate.phases[0].requiredIntake,
            handoffRules: expectedTemplate.phases[0].handoffRules,
            executionRules: expectedTemplate.phases[0].executionRules,
            actionPolicy: expectedTemplate.phases[0].actionPolicy,
            outputArtifact: expectedTemplate.phases[0].outputArtifact,
            requiredArtifacts: expectedTemplate.phases[0].requiredArtifacts,
            completionCriteria: expectedTemplate.phases[0].completionCriteria,
            transition: expectedTemplate.phases[0].transition,
            runtimeState: {
              status: 'running',
              pendingConfirmation: true,
              stateVersion: 42,
            },
          },
        ],
      },
    ])

    const persisted = await readJsonIfExists(
      path.join(tempConfigDir, 'cc-jiangxia', 'workflows.json'),
    )

    expect(persisted).toMatchObject({
      ownerDefinedTopLevel: {
        keep: true,
      },
      templates: [
        {
          id: expectedTemplate.id,
          ownerDefinedTemplateField: 'updated-template-field',
          phases: [
            {
              id: expectedTemplate.phases[0].id,
              ownerDefinedPhaseField: {
                keep: true,
              },
              outputArtifact: {
                ownerDefinedOutputField: 'keep-output',
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
    expect(
      (persisted as WorkflowTemplateFixture).templates[0].phases[0],
    ).not.toHaveProperty('runtimeState')
  })

  test('collects project .claude skills so workflow phase skill validation matches the installed skills page', async () => {
    const originalCwd = process.cwd()
    const tempProjectDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'cc-jiangxia-workflow-project-skills-'),
    )
    try {
      const skillDir = path.join(tempProjectDir, '.claude', 'skills', 'project-phase-helper')
      await fs.mkdir(skillDir, { recursive: true })
      await fs.writeFile(
        path.join(skillDir, 'SKILL.md'),
        [
          '---',
          'name: Project Phase Helper',
          'description: Project-local workflow phase helper',
          '---',
          'Use this project skill for workflow phases.',
          '',
        ].join('\n'),
        'utf-8',
      )
      process.chdir(tempProjectDir)

      const catalog = await collectTemplateSkillCatalog()

      expect(catalog).toContainEqual(expect.objectContaining({
        name: 'project-phase-helper',
        source: 'project',
        sourcePath: path.join(skillDir, 'SKILL.md'),
      }))
    } finally {
      process.chdir(originalCwd)
      await fs.rm(tempProjectDir, { recursive: true, force: true })
    }
  })

  test('reads workflow config only from cc-jiangxia-owned storage and does not write protected Claude files', async () => {
    const fixture = await readFixture('user-template-with-unknown-fields.json')
    await writeWorkflowConfig(tempConfigDir, {
      ...fixture,
      templates: fixture.templates.map((template) => validWorkflowConfigTemplate(template)),
    })

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
      await readJsonIfExists(path.join(tempConfigDir, 'cc-jiangxia', 'settings.json')),
    ).toBeUndefined()
    expect(
      await readJsonIfExists(path.join(tempConfigDir, 'cc-jiangxia', 'providers.json')),
    ).toBeUndefined()
    expect(
      await readJsonIfExists(path.join(tempConfigDir, 'adapter-sessions.json')),
    ).toBeUndefined()
    expect(
      await readJsonIfExists(path.join(tempConfigDir, 'cc-jiangxia', 'workflows.json')),
    ).toMatchObject({
      schemaVersion: 1,
      ownerDefinedTopLevel: {
        keep: true,
      },
    })
  })

  test('uses only the isolated workflow config profile for user templates', async () => {
    const otherProfile = await fs.mkdtemp(
      path.join(os.tmpdir(), 'cc-jiangxia-workflow-templates-other-'),
    )
    try {
      await writeWorkflowConfig(otherProfile, {
        schemaVersion: 1,
        templates: [
          validWorkflowConfigTemplate({
            id: 'template-from-other-profile',
            version: '1',
            name: 'Template From Other Profile',
            phases: [
              validPhase({
                id: 'other',
                name: 'Other',
                instructions: 'This template belongs to a different profile.',
                completionCriteria: {
                  type: 'manual-checklist',
                  description: 'Should not be visible.',
                },
                transition: { authority: 'auto' },
              }),
            ],
          }),
        ],
      })
      const fixture = await readFixture('more-than-five-linear-workflow.json')
      await writeWorkflowConfig(tempConfigDir, {
        ...fixture,
        templates: fixture.templates.map((template) => validWorkflowConfigTemplate(template)),
      })

      const result = await new WorkflowTemplateRegistryService().listTemplates()

      expect(result.templates.map((template) => template.id)).toEqual([
        'extended-agent-development',
      ])
      expect(result.templates.map((template) => template.id)).not.toContain(
        'template-from-other-profile',
      )
    } finally {
      await fs.rm(otherProfile, { recursive: true, force: true })
    }
  })

  test('reports malformed workflow config without adding default builtin templates', async () => {
    await installFixture('malformed-workflows.json')

    const result = await new WorkflowTemplateRegistryService().listTemplates()

    expect(result.templates).toEqual([])
    expect(issueCodes(result)).toContain('WORKFLOW_CONFIG_MALFORMED')
    expect(result.invalidTemplates[0]).toMatchObject({
      source: 'user-config',
      path: '$',
      severity: 'error',
    })
  })

  test('does not overwrite malformed workflow config when saving templates', async () => {
    await installFixture('malformed-workflows.json')
    const configPath = path.join(tempConfigDir, 'cc-jiangxia', 'workflows.json')
    const originalMalformedContent = await fs.readFile(configPath, 'utf-8')

    await expect(
      new WorkflowTemplateRegistryService().writeTemplates([validTemplate()]),
    ).rejects.toThrow()

    expect(await fs.readFile(configPath, 'utf-8')).toBe(originalMalformedContent)
  })

  test('excludes missing config fields, empty phase arrays, and duplicate phase ids', async () => {
    await installFixture('invalid-user-workflows.json')

    const result = await new WorkflowTemplateRegistryService().listTemplates()

    expect(result.templates).toEqual([])
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
    const fixture = await readFixture('duplicate-template-ids.json')
    await writeWorkflowConfig(tempConfigDir, {
      ...fixture,
      templates: fixture.templates.map((template) => validWorkflowConfigTemplate(template)),
    })

    const result = await new WorkflowTemplateRegistryService().listTemplates()

    expect(result.templates).toEqual([])
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

    expect(result.templates).toEqual([])
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

  test('loads user templates that use the former builtin template id without registering a preset', async () => {
    await writeWorkflowConfig(tempConfigDir, {
      schemaVersion: 1,
      templates: [
        validTemplate({
          id: 'agent-development',
          name: 'User Agent Development',
        }),
      ],
    })

    const result = await new WorkflowTemplateRegistryService().listTemplates()

    expect(result.templates).toContainEqual(expect.objectContaining({
      id: 'agent-development',
      source: 'user',
      name: 'User Agent Development',
    }))
    expect(issueCodes(result)).not.toContain('WORKFLOW_TEMPLATE_BUILTIN_ID_CONFLICT')
    expect(result.invalidTemplates).toEqual([])
  })

  test('persists templates that use the former builtin template id as user templates', async () => {
    const service = new WorkflowTemplateRegistryService()

    await service.writeTemplates([
      validTemplate({
        id: 'agent-development',
        name: 'User Owned Agent Development',
      }),
    ])

    const result = await service.listTemplates()
    expect(result.templates).toContainEqual(expect.objectContaining({
      id: 'agent-development',
      source: 'user',
      name: 'User Owned Agent Development',
    }))
    expect(
      await readJsonIfExists(path.join(tempConfigDir, 'cc-jiangxia', 'workflows.json')),
    ).toMatchObject({
      schemaVersion: 1,
      templates: [
        expect.objectContaining({
          id: 'agent-development',
          name: 'User Owned Agent Development',
        }),
      ],
    })
  })

  test('rejects prompt-only phases that omit required output artifact semantics', async () => {
    await writeWorkflowConfig(tempConfigDir, {
      schemaVersion: 1,
      templates: [
        validTemplate({
          id: 'prompt-only-template',
          name: 'Prompt Only Template',
          phases: [
            validPhase({
              id: 'prompt',
              name: 'Prompt',
              instructions: 'This phase has prose but no first-class output contract.',
              outputArtifact: undefined,
            }),
          ],
        }),
      ],
    })

    const result = await new WorkflowTemplateRegistryService().listTemplates()

    expect(result.templates).toEqual([])
    expect(issueCodes(result)).toContain('WORKFLOW_PHASE_OUTPUT_ARTIFACT_REQUIRED')
    expect(result.invalidTemplates).toContainEqual(
      expect.objectContaining({
        templateId: 'prompt-only-template',
        path: '$.templates[0].phases[0].outputArtifact',
        severity: 'error',
      }),
    )
  })

  test('does not write payloads that omit required output artifact semantics', async () => {
    const service = new WorkflowTemplateRegistryService()

    await expect(
      service.writeTemplates([
        validTemplate({
          id: 'missing-output-on-write',
          phases: [
            validPhase({
              outputArtifact: undefined,
            }),
          ],
        }),
      ]),
    ).rejects.toThrow('WORKFLOW_PHASE_OUTPUT_ARTIFACT_REQUIRED')

    expect(
      await readJsonIfExists(path.join(tempConfigDir, 'cc-jiangxia', 'workflows.json')),
    ).toBeUndefined()
  })

  test('rejects user phases with only legacy prompt metadata and no output artifact', async () => {
    await writeWorkflowConfig(tempConfigDir, {
      schemaVersion: 1,
      templates: [
        {
          schemaVersion: 1,
          id: 'legacy-prompt-template',
          version: '1',
          name: 'Legacy Prompt Template',
          phases: [
            {
              id: 'prompt',
              name: 'Prompt',
              instructions: 'This phase is only instructions plus legacy prompt metadata.',
              phasePrompt: {
                objective: 'Draft output.',
                handoffInput: ['Previous context.'],
                executionRules: ['Write clearly.'],
                outputArtifact: {
                  name: 'Legacy Prompt Output',
                  sections: ['Summary'],
                },
                completionRules: ['Stop after output.'],
              },
              completionCriteria: {
                type: 'manual-checklist',
                description: 'Prompt output is complete.',
              },
              transition: { authority: 'auto' },
            },
          ],
        },
      ],
    })

    const result = await new WorkflowTemplateRegistryService().listTemplates()

    expect(result.templates).toEqual([])
    expect(issueCodes(result)).toEqual(
      expect.arrayContaining([
        'WORKFLOW_PHASE_OUTPUT_ARTIFACT_REQUIRED',
        'WORKFLOW_PHASE_HANDOFF_REQUIRED',
      ]),
    )
  })

  test('rejects phases that omit first-class handoff contract semantics', async () => {
    await writeWorkflowConfig(tempConfigDir, {
      schemaVersion: 1,
      templates: [
        validTemplate({
          id: 'missing-handoff-template',
          name: 'Missing Handoff Template',
          phases: [
            validPhase({
              id: 'handoff',
              name: 'Handoff',
              instructions: 'This phase has prose but no first-class handoff contract.',
              requiredIntake: undefined,
              handoffRules: undefined,
            }),
          ],
        }),
      ],
    })

    const result = await new WorkflowTemplateRegistryService().listTemplates()

    expect(result.templates).toEqual([])
    expect(issueCodes(result)).toContain('WORKFLOW_PHASE_HANDOFF_REQUIRED')
    expect(result.invalidTemplates).toContainEqual(
      expect.objectContaining({
        templateId: 'missing-handoff-template',
        path: '$.templates[0].phases[0]',
        severity: 'error',
      }),
    )
  })

  test('does not write payloads that omit first-class handoff contract semantics', async () => {
    const service = new WorkflowTemplateRegistryService()

    await expect(
      service.writeTemplates([
        validTemplate({
          id: 'missing-handoff-on-write',
          phases: [
            validPhase({
              requiredIntake: undefined,
              handoffRules: undefined,
            }),
          ],
        }),
      ]),
    ).rejects.toThrow('WORKFLOW_PHASE_HANDOFF_REQUIRED')

    expect(
      await readJsonIfExists(path.join(tempConfigDir, 'cc-jiangxia', 'workflows.json')),
    ).toBeUndefined()
  })

  test('preserves unknown required artifact and completion fields when writing templates', async () => {
    const fixture = await readFixture('user-template-with-unknown-fields.json')
    const expectedTemplate = fixture.templates[0]
    await writeWorkflowConfig(tempConfigDir, {
      ...fixture,
      templates: fixture.templates.map((template) => validWorkflowConfigTemplate(template)),
    })

    await new WorkflowTemplateRegistryService().writeTemplates([
      {
        schemaVersion: 1,
        id: expectedTemplate.id,
        version: '2',
        name: expectedTemplate.name,
        phases: [
          {
            id: expectedTemplate.phases[0].id,
            name: expectedTemplate.phases[0].name,
            instructions: expectedTemplate.phases[0].instructions,
            objective: 'Preserve nested unknown fields.',
            requiredIntake: ['Existing phase metadata.'],
            handoffRules: ['Keep matching artifact and completion metadata.'],
            outputArtifact: {
              id: 'future-output',
              name: 'Future Output',
              kind: 'markdown',
              description: 'Updated output with preserved nested fields.',
              required: true,
            },
            requiredArtifacts: [
              {
                id: 'future-artifact',
                name: 'Future Artifact Updated',
                required: true,
              },
            ],
            completionCriteria: {
              type: 'manual-checklist',
              description: 'Updated criteria.',
            },
            transition: { authority: 'auto' },
          },
        ],
      },
    ])

    expect(
      await readJsonIfExists(path.join(tempConfigDir, 'cc-jiangxia', 'workflows.json')),
    ).toMatchObject({
      templates: [
        {
          id: expectedTemplate.id,
          phases: [
            {
              requiredArtifacts: [
                {
                  id: 'future-artifact',
                  ownerDefinedArtifactField: 'keep-artifact-field',
                },
              ],
              completionCriteria: {
                ownerDefinedCriteriaField: 'keep-criteria-field',
              },
            },
          ],
        },
      ],
    })
  })

  test('resets the registry cache after creating a workflow config from missing storage', async () => {
    const service = new WorkflowTemplateRegistryService()
    expect((await service.listTemplates()).templates).toEqual([])

    await service.writeTemplates([validTemplate()])

    expect((await service.listTemplates()).templates.map((template) => template.id)).toEqual([
      'draft-workflow',
    ])
  })
})
