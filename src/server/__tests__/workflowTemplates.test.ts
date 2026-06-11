import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import { resetWorkflowTemplateRegistryForTests } from '../services/workflowTemplateRegistryService.js'

type WorkflowTemplateSummary = {
  id: string
  source: string
  version: string
  name: string
  description?: string
  phaseCount: number
  firstPhaseId: string | null
  phaseNames?: string[]
  startable?: boolean
  editable?: boolean
  copyable?: boolean
}

type ErrorBody = {
  error?: unknown
  code?: unknown
  message?: unknown
  issues?: Array<{ code?: unknown }>
}

let tmpDir: string
let originalClaudeConfigDir: string | undefined
let baseUrl: string
let server: ReturnType<typeof Bun.serve> | null = null

async function setupTmpConfigDir(): Promise<void> {
  tmpDir = path.join(os.tmpdir(), `workflow-template-api-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  await fs.mkdir(tmpDir, { recursive: true })
  originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR
  process.env.CLAUDE_CONFIG_DIR = tmpDir
  resetWorkflowTemplateRegistryForTests()
}

async function cleanupTmpConfigDir(): Promise<void> {
  resetWorkflowTemplateRegistryForTests()
  if (server) {
    server.stop(true)
    server = null
  }
  if (tmpDir) {
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
  if (originalClaudeConfigDir !== undefined) {
    process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir
  } else {
    delete process.env.CLAUDE_CONFIG_DIR
  }
}

async function startTestServer(): Promise<void> {
  const { handleApiRequest } = await import('../router.js')

  server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    async fetch(req) {
      const url = new URL(req.url)
      if (url.pathname.split('/').filter(Boolean)[0] === 'api') {
        return handleApiRequest(req, url)
      }
      return new Response('Not Found', { status: 404 })
    },
  })
  baseUrl = `http://127.0.0.1:${server.port}`
}

function workflowConfigPath(): string {
  return path.join(tmpDir, 'cc-jiangxia', 'workflows.json')
}

async function writeWorkflowConfig(config: Record<string, unknown>): Promise<void> {
  const filePath = workflowConfigPath()
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8')
  resetWorkflowTemplateRegistryForTests()
}

async function writeUserSkill(name: string): Promise<void> {
  const skillDir = path.join(tmpDir, 'skills', name)
  await fs.mkdir(skillDir, { recursive: true })
  await fs.writeFile(
    path.join(skillDir, 'SKILL.md'),
    [
      '---',
      `name: ${name}`,
      'description: Workflow authoring skill fixture',
      '---',
      'Use this skill when the current phase matches.',
      '',
    ].join('\n'),
    'utf-8',
  )
}

async function readWorkflowConfig(): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await fs.readFile(workflowConfigPath(), 'utf-8')) as Record<string, unknown>
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null
    }
    throw error
  }
}

function expectWorkflowError(body: ErrorBody, expectedCode: string): void {
  expect(body.error ?? body.code).toBe(expectedCode)
  expect(typeof body.message).toBe('string')
}

async function requestJson(
  pathValue: string,
  init: RequestInit = {},
): Promise<{ res: Response; body: Record<string, unknown> }> {
  const res = await fetch(`${baseUrl}${pathValue}`, {
    ...init,
    headers: {
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...init.headers,
    },
  })
  const body = await res.json() as Record<string, unknown>
  return { res, body }
}

function validTemplate(id = 'custom-workflow'): Record<string, unknown> {
  return {
    schemaVersion: 1,
    id,
    version: '1',
    name: 'Custom Workflow',
    description: 'A user workflow template',
    phases: [
      {
        id: 'draft',
        name: 'Draft',
        instructions: 'Draft the requested artifact.',
        requiredIntake: ['Use the user request and prior workflow context.'],
        handoffRules: ['Summarize the draft output and next action.'],
        outputArtifact: {
          id: 'draft-output',
          name: 'Draft output',
          kind: 'markdown',
          description: 'The draft artifact.',
          required: true,
        },
        completionCriteria: {
          type: 'artifact-required',
          description: 'The draft artifact is complete.',
        },
        transition: { authority: 'user-confirmation' },
        handoffRules: ['Summarize the draft and next action.'],
      },
    ],
  }
}

function invalidPromptOnlyTemplate(id = 'prompt-only-workflow'): Record<string, unknown> {
  const template = validTemplate(id)
  const [phase] = template.phases as Array<Record<string, unknown>>
  delete phase.outputArtifact
  delete phase.handoffRules
  return template
}

async function expectConfigUnchanged<T>(operation: () => Promise<T>): Promise<T> {
  const before = await readWorkflowConfig()
  const result = await operation()
  const after = await readWorkflowConfig()
  expect(after).toEqual(before)
  return result
}

describe('Workflow template API contract', () => {
  beforeEach(async () => {
    await setupTmpConfigDir()
    await startTestServer()
  })

  afterEach(async () => {
    await cleanupTmpConfigDir()
  })

  it('GET /api/workflows/templates remains compatible with builtin list and invalid user diagnostics', async () => {
    await writeWorkflowConfig({
      schemaVersion: 1,
      templates: [
        {
          id: 'invalid-user-template',
          version: '1',
          name: 'Invalid user template',
          phases: [],
        },
      ],
    })

    const { res, body } = await requestJson('/api/workflows/templates')

    expect(res.status).toBe(200)
    expect(body.templates).toContainEqual(expect.objectContaining({
      id: 'agent-development',
      source: 'builtin',
      version: '1',
      name: 'Agent Development',
      description: expect.any(String),
      phaseCount: 5,
      firstPhaseId: 'discussion',
      phaseNames: [
        'Discussion',
        'Specify',
        'Plan',
        'Tasks',
        'Implement',
      ],
    }))
    expect((body.templates as WorkflowTemplateSummary[]).some((template) => template.id === 'invalid-user-template')).toBe(false)
    expect(body.invalidTemplates).toContainEqual(expect.objectContaining({
      source: 'user-config',
      templateId: 'invalid-user-template',
      path: '$.templates[0].phases',
      code: 'WORKFLOW_TEMPLATE_INVALID_PHASES',
      severity: 'error',
    }))
  })

  it('GET /api/workflows/templates/:source/:id returns builtin detail as read-only and copyable', async () => {
    const { res, body } = await requestJson('/api/workflows/templates/builtin/agent-development')

    expect(res.status).toBe(200)
    expect(body.template).toEqual(expect.objectContaining({
      id: 'agent-development',
      source: 'builtin',
      version: '1',
      name: 'Agent Development',
      editable: false,
      copyable: true,
    }))
    expect(body.invalidTemplates).toEqual([])
  })

  it('GET /api/workflows/templates/:source/:id returns stable invalid source errors', async () => {
    const { res, body } = await requestJson('/api/workflows/templates/project/agent-development')

    expect(res.status).toBe(400)
    expectWorkflowError(body, 'WORKFLOW_TEMPLATE_INVALID_SOURCE')
  })

  it('GET /api/workflows/templates/:source/:id returns stable not found errors', async () => {
    const { res, body } = await requestJson('/api/workflows/templates/user/missing-template')

    expect(res.status).toBe(404)
    expectWorkflowError(body, 'WORKFLOW_TEMPLATE_NOT_FOUND')
  })

  it('POST /api/workflows/templates/validate rejects prompt-only phases without writing', async () => {
    const { res, body } = await expectConfigUnchanged(() => requestJson('/api/workflows/templates/validate', {
      method: 'POST',
      body: JSON.stringify({ template: invalidPromptOnlyTemplate() }),
    }))

    expect(res.status).toBe(200)
    expect(body.valid).toBe(false)
    expect(body.template).toBe(null)
    expect(body.issues).toContainEqual(expect.objectContaining({
      source: 'request',
      code: 'WORKFLOW_PHASE_OUTPUT_ARTIFACT_REQUIRED',
      severity: 'error',
    }))
    expect(body.issues).toContainEqual(expect.objectContaining({
      source: 'request',
      code: 'WORKFLOW_PHASE_HANDOFF_REQUIRED',
      severity: 'error',
    }))
  })

  it('POST /api/workflows/templates/validate accepts legacy phase skills and preserves reason plus unknown fields', async () => {
    const template = validTemplate('legacy-phase-skills')
    const [phase] = template.phases as Array<Record<string, unknown>>
    phase.skills = [
      {
        name: 'tdd-workflow',
        reason: 'Legacy advisory text only.',
        ownerDefinedSkillField: 'keep-skill-field',
      },
    ]

    const { res, body } = await expectConfigUnchanged(() => requestJson('/api/workflows/templates/validate', {
      method: 'POST',
      body: JSON.stringify({ template }),
    }))

    expect(res.status).toBe(200)
    expect(body.valid).toBe(true)
    expect(body.issues).toEqual([])
    expect(body.template).toMatchObject({
      phases: [
        {
          skills: [
            {
              name: 'tdd-workflow',
              mode: 'recommended',
              reason: 'Legacy advisory text only.',
              ownerDefinedSkillField: 'keep-skill-field',
            },
          ],
        },
      ],
    })
  })

  it('POST /api/workflows/templates/validate returns errors for malformed phase skill references', async () => {
    const template = validTemplate('invalid-phase-skill-reference')
    const [phase] = template.phases as Array<Record<string, unknown>>
    phase.skills = [{ name: '' }]

    const { res, body } = await expectConfigUnchanged(() => requestJson('/api/workflows/templates/validate', {
      method: 'POST',
      body: JSON.stringify({ template }),
    }))

    expect(res.status).toBe(200)
    expect(body.valid).toBe(false)
    expect(body.template).toBe(null)
    expect(body.issues).toContainEqual(expect.objectContaining({
      source: 'request',
      templateId: 'invalid-phase-skill-reference',
      path: '$.template.phases[0].skills[0]',
      code: 'WORKFLOW_PHASE_SKILL_INVALID_REFERENCE',
      severity: 'error',
    }))
  })

  it('POST /api/workflows/templates/import/preview keeps missing recommended skills selectable with dependency warnings', async () => {
    const template = validTemplate('missing-phase-skill-import')
    const [phase] = template.phases as Array<Record<string, unknown>>
    phase.skills = [{ name: 'missing-skill' }]

    const { res, body } = await expectConfigUnchanged(() => requestJson('/api/workflows/templates/import/preview', {
      method: 'POST',
      body: JSON.stringify({
        payload: {
          schemaVersion: 2,
          templates: [template],
          dependencyManifest: {
            schemaVersion: 1,
            generatedAt: '2026-05-29T00:00:00.000Z',
            dependencies: [
              {
                templateId: 'missing-phase-skill-import',
                phaseId: 'draft',
                reference: { name: 'missing-skill' },
                exportStatus: 'missing',
              },
            ],
          },
        },
      }),
    }))

    expect(res.status).toBe(200)
    expect(body.canCommit).toBe(true)
    expect(body.candidates).toContainEqual(expect.objectContaining({
      originalId: 'missing-phase-skill-import',
      selectable: true,
      dependencyDiagnostics: [
        expect.objectContaining({
          status: 'missing',
          severity: 'warning',
          canImport: true,
          reference: {
            name: 'missing-skill',
            mode: 'recommended',
          },
        }),
      ],
    }))
  })

  it('POST /api/workflows/templates/import/preview keeps invalid references unselectable with dependency errors', async () => {
    const template = validTemplate('invalid-phase-skill-preview')
    const [phase] = template.phases as Array<Record<string, unknown>>
    phase.skills = [{ name: '   ' }]

    const { res, body } = await expectConfigUnchanged(() => requestJson('/api/workflows/templates/import/preview', {
      method: 'POST',
      body: JSON.stringify({
        payload: {
          schemaVersion: 2,
          templates: [template],
          dependencyManifest: {
            schemaVersion: 1,
            generatedAt: '2026-05-29T00:00:00.000Z',
            dependencies: [
              {
                templateId: 'invalid-phase-skill-preview',
                phaseId: 'draft',
                reference: { name: '   ' },
                exportStatus: 'invalid-reference',
                diagnostic: 'Skill reference name is required.',
              },
            ],
          },
        },
      }),
    }))

    expect(res.status).toBe(200)
    expect(body.canCommit).toBe(false)
    expect(body.candidates).toContainEqual(expect.objectContaining({
      originalId: 'invalid-phase-skill-preview',
      selectable: false,
      dependencyDiagnostics: [
        expect.objectContaining({
          status: 'invalid-reference',
          severity: 'error',
          canImport: false,
          reference: expect.objectContaining({
            name: '   ',
          }),
        }),
      ],
    }))
  })

  it('POST /api/workflows/templates/import rejects malformed phase skill references without writing', async () => {
    const template = validTemplate('malformed-phase-skill-import')
    const [phase] = template.phases as Array<Record<string, unknown>>
    phase.skills = [{ name: '   ' }]

    const { res, body } = await expectConfigUnchanged(() => requestJson('/api/workflows/templates/import', {
      method: 'POST',
      body: JSON.stringify({
        payload: {
          schemaVersion: 1,
          templates: [template],
        },
        selections: [
          {
            importId: 'candidate-1',
            resolution: 'add',
          },
        ],
      }),
    }))

    expect(res.status).toBe(400)
    expectWorkflowError(body, 'WORKFLOW_TEMPLATE_INVALID')
    expect(body.issues).toContainEqual(expect.objectContaining({
      source: 'import',
      templateId: 'malformed-phase-skill-import',
      path: '$.payload.templates.phases[0].skills[0]',
      code: 'WORKFLOW_PHASE_SKILL_INVALID_REFERENCE',
      severity: 'error',
    }))
  })

  it('POST /api/workflows/templates/validate rejects builtin id shadowing without writing', async () => {
    const { res, body } = await expectConfigUnchanged(() => requestJson('/api/workflows/templates/validate', {
      method: 'POST',
      body: JSON.stringify({ template: validTemplate('agent-development') }),
    }))

    expect(res.status).toBe(200)
    expect(body.valid).toBe(false)
    expect(body.issues).toContainEqual(expect.objectContaining({
      source: 'request',
      templateId: 'agent-development',
      code: 'WORKFLOW_TEMPLATE_BUILTIN_ID_CONFLICT',
      severity: 'error',
    }))
  })

  it('POST /api/workflows/templates creates a user template and returns refreshed list metadata', async () => {
    const { res, body } = await requestJson('/api/workflows/templates', {
      method: 'POST',
      body: JSON.stringify({ template: validTemplate('custom-workflow') }),
    })

    expect(res.status).toBe(201)
    expect(body.template).toEqual(expect.objectContaining({
      id: 'custom-workflow',
      source: 'user',
      version: '1',
      name: 'Custom Workflow',
    }))
    expect(body.templates).toContainEqual(expect.objectContaining({
      id: 'custom-workflow',
      source: 'user',
      phaseCount: 1,
      editable: true,
    }))
    expect(body.invalidTemplates).toEqual([])
  })

  it('POST /api/workflows/templates/authoring creates through the operation union and refetches from the same store', async () => {
    const { res, body } = await requestJson('/api/workflows/templates/authoring', {
      method: 'POST',
      body: JSON.stringify({
        operation: 'create',
        template: validTemplate('conversation-workflow'),
      }),
    })

    expect(res.status).toBe(201)
    expect(body).toMatchObject({
      operation: 'create',
      status: 'succeeded',
      persisted: true,
      affectedTemplate: {
        source: 'user',
        id: 'conversation-workflow',
        name: 'Custom Workflow',
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

    const { res: listRes, body: listBody } = await requestJson('/api/workflows/templates')
    expect(listRes.status).toBe(200)
    expect(listBody.templates).toContainEqual(expect.objectContaining({
      id: 'conversation-workflow',
      source: 'user',
      editable: true,
    }))
  })

  it('POST /api/workflows/templates/authoring lists selectable phase skill references for agents', async () => {
    await writeUserSkill('release-checklist')

    const { res, body } = await requestJson('/api/workflows/templates/authoring', {
      method: 'POST',
      body: JSON.stringify({
        operation: 'skill_catalog',
        query: 'release',
        source: 'user',
      }),
    })

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      operation: 'skill_catalog',
      status: 'succeeded',
      persisted: false,
      validation: {
        valid: true,
        issues: [],
      },
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
      nextAction: 'none',
    })
    expect(await readWorkflowConfig()).toBeNull()
  })

  it('POST /api/workflows/templates/authoring creates missing user skills for workflow phase references', async () => {
    const { res, body } = await requestJson('/api/workflows/templates/authoring', {
      method: 'POST',
      body: JSON.stringify({
        operation: 'skill_create',
        name: 'superpowers-dev',
        description: 'Use when running Superpowers workflow phases.',
        body: 'Use this skill for Superpowers workflow phase guidance.',
      }),
    })

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      operation: 'skill_create',
      status: 'succeeded',
      persisted: true,
      createdSkill: {
        name: 'superpowers-dev',
        source: 'user',
        skillRoot: path.join(tmpDir, 'skills', 'superpowers-dev'),
        skillFile: path.join(tmpDir, 'skills', 'superpowers-dev', 'SKILL.md'),
        recommendedReference: {
          name: 'superpowers-dev',
          mode: 'recommended',
          source: 'user',
        },
      },
      validation: {
        valid: true,
        issues: [],
      },
      nextAction: 'none',
    })
    expect(await fs.readFile(path.join(tmpDir, 'skills', 'superpowers-dev', 'SKILL.md'), 'utf-8'))
      .toContain('Use this skill for Superpowers workflow phase guidance.')

    const installedSkills = await requestJson('/api/skills')
    expect(installedSkills.res.status).toBe(200)
    expect(installedSkills.body.skills).toContainEqual(expect.objectContaining({
      name: 'superpowers-dev',
      source: 'user',
      description: 'Use when running Superpowers workflow phases.',
    }))

    const installedSkillDetail = await requestJson('/api/skills/detail?source=user&name=superpowers-dev')
    expect(installedSkillDetail.res.status).toBe(200)
    expect(installedSkillDetail.body.detail).toMatchObject({
      meta: {
        name: 'superpowers-dev',
        source: 'user',
        description: 'Use when running Superpowers workflow phases.',
      },
      skillRoot: path.join(tmpDir, 'skills', 'superpowers-dev'),
      files: expect.arrayContaining([
        expect.objectContaining({
          path: 'SKILL.md',
          isEntry: true,
          frontmatter: expect.objectContaining({
            description: 'Use when running Superpowers workflow phases.',
          }),
          body: expect.stringContaining('Use this skill for Superpowers workflow phase guidance.'),
        }),
      ]),
    })

    const catalog = await requestJson('/api/workflows/templates/authoring', {
      method: 'POST',
      body: JSON.stringify({
        operation: 'skill_catalog',
        query: 'superpowers',
        source: 'user',
      }),
    })
    expect(catalog.body.skillCatalog).toContainEqual(expect.objectContaining({
      name: 'superpowers-dev',
      recommendedReference: {
        name: 'superpowers-dev',
        mode: 'recommended',
        source: 'user',
      },
    }))
  })

  it('POST /api/workflows/templates/authoring refuses to overwrite existing user skills', async () => {
    await writeUserSkill('existing-workflow-skill')
    const skillFile = path.join(tmpDir, 'skills', 'existing-workflow-skill', 'SKILL.md')
    const before = await fs.readFile(skillFile, 'utf-8')

    const { res, body } = await requestJson('/api/workflows/templates/authoring', {
      method: 'POST',
      body: JSON.stringify({
        operation: 'skill_create',
        name: 'existing-workflow-skill',
        description: 'Attempt to replace an installed skill.',
        body: 'This content must not be written.',
      }),
    })

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      operation: 'skill_create',
      status: 'rejected',
      persisted: false,
      validation: {
        valid: false,
        issues: [
          expect.objectContaining({
            code: 'WORKFLOW_PHASE_SKILL_ALREADY_EXISTS',
          }),
        ],
      },
      nextAction: 'repair-and-validate',
    })
    expect(await fs.readFile(skillFile, 'utf-8')).toBe(before)
  })

  it('POST /api/workflows/templates/authoring uses existing installed skills without requesting creation', async () => {
    await writeUserSkill('installed-authoring-skill')
    const template = validTemplate('installed-authoring-skill-workflow')
    const [phase] = template.phases as Array<Record<string, unknown>>
    phase.skills = [
      {
        name: 'installed-authoring-skill',
        mode: 'recommended',
        source: 'user',
      },
    ]

    const { res, body } = await requestJson('/api/workflows/templates/authoring', {
      method: 'POST',
      body: JSON.stringify({
        operation: 'create',
        template,
      }),
    })

    expect(res.status).toBe(201)
    expect(body).toMatchObject({
      operation: 'create',
      status: 'succeeded',
      persisted: true,
      validation: {
        valid: true,
        issues: [],
      },
      nextAction: 'none',
    })
    expect(body.skillRepairGuidance).toBeUndefined()
  })

  it('POST /api/workflows/templates/authoring updates a user template and makes the refreshed list reflect the change', async () => {
    await writeWorkflowConfig({
      schemaVersion: 1,
      templates: [{
        ...validTemplate('editable-workflow'),
        name: 'Editable Workflow',
        version: '1.0.0',
      }],
    })

    const { body: inspectBody } = await requestJson('/api/workflows/templates/authoring', {
      method: 'POST',
      body: JSON.stringify({
        operation: 'inspect',
        selector: {
          source: 'user',
          id: 'editable-workflow',
        },
      }),
    })

    const basisHash = (inspectBody.affectedTemplate as Record<string, unknown> | undefined)?.basisHash
    expect(basisHash).toMatch(/^sha256:[a-f0-9]{64}$/)

    const { res, body } = await requestJson('/api/workflows/templates/authoring', {
      method: 'POST',
      body: JSON.stringify({
        operation: 'update',
        selector: {
          source: 'user',
          id: 'editable-workflow',
        },
        basisHash,
        template: {
          ...validTemplate('editable-workflow'),
          name: 'Editable Workflow Updated',
          version: '1.0.1',
        },
      }),
    })

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
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

    const { res: listRes, body: listBody } = await requestJson('/api/workflows/templates')
    expect(listRes.status).toBe(200)
    expect(listBody.templates).toContainEqual(expect.objectContaining({
      id: 'editable-workflow',
      source: 'user',
      name: 'Editable Workflow Updated',
      version: '1.0.1',
      editable: true,
    }))
  })

  it('POST /api/workflows/templates/authoring rejects invalid create without writing', async () => {
    const { res, body } = await expectConfigUnchanged(() => requestJson('/api/workflows/templates/authoring', {
      method: 'POST',
      body: JSON.stringify({
        operation: 'create',
        template: invalidPromptOnlyTemplate('invalid-authoring-create'),
      }),
    }))

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      operation: 'create',
      status: 'rejected',
      persisted: false,
      validation: {
        valid: false,
        issues: expect.arrayContaining([
          expect.objectContaining({
            source: 'authoring',
            templateId: 'invalid-authoring-create',
            code: 'WORKFLOW_PHASE_OUTPUT_ARTIFACT_REQUIRED',
          }),
          expect.objectContaining({
            source: 'authoring',
            templateId: 'invalid-authoring-create',
            code: 'WORKFLOW_PHASE_HANDOFF_REQUIRED',
          }),
        ]),
      },
      nextAction: 'repair-and-validate',
    })
  })

  it('POST /api/workflows/templates/authoring rejects create templates with missing phase skills before writing', async () => {
    const template = validTemplate('missing-authoring-skill')
    const [phase] = template.phases as Array<Record<string, unknown>>
    phase.skills = [
      {
        name: 'missing-authoring-skill',
        mode: 'recommended',
        source: 'user',
      },
    ]

    const { res, body } = await expectConfigUnchanged(() => requestJson('/api/workflows/templates/authoring', {
      method: 'POST',
      body: JSON.stringify({
        operation: 'create',
        template,
      }),
    }))

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      operation: 'create',
      status: 'rejected',
      persisted: false,
      validation: {
        valid: false,
        issues: [
          expect.objectContaining({
            source: 'authoring',
            templateId: 'missing-authoring-skill',
            path: '$.template.phases[0].skills[0]',
            code: 'WORKFLOW_PHASE_SKILL_MISSING',
            message: expect.stringContaining('skill_create'),
          }),
        ],
      },
      nextAction: 'repair-and-validate',
    })
    expect(body.skillRepairGuidance).toEqual([
      expect.objectContaining({
        templateId: 'missing-authoring-skill',
        phaseId: 'draft',
        skillName: 'missing-authoring-skill',
        reference: {
          name: 'missing-authoring-skill',
          mode: 'recommended',
          source: 'user',
        },
        diagnostic: expect.objectContaining({
          code: 'WORKFLOW_PHASE_SKILL_MISSING',
        }),
        actions: [
          {
            operation: 'skill_catalog',
            input: {
              operation: 'skill_catalog',
              query: 'missing-authoring-skill',
              source: 'all',
            },
          },
          {
            operation: 'skill_create',
            input: {
              operation: 'skill_create',
              name: 'missing-authoring-skill',
              description: 'Use when workflow phases need Missing Authoring Skill guidance.',
            },
          },
        ],
      }),
    ])
  })

  it('POST /api/workflows/templates/authoring rejects create id conflicts without writing', async () => {
    await writeWorkflowConfig({
      schemaVersion: 1,
      templates: [{ ...validTemplate('conversation-workflow'), name: 'Existing Workflow' }],
    })

    const { res, body } = await expectConfigUnchanged(() => requestJson('/api/workflows/templates/authoring', {
      method: 'POST',
      body: JSON.stringify({
        operation: 'create',
        template: { ...validTemplate('conversation-workflow'), name: 'Replacement Attempt' },
      }),
    }))

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
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
    })
  })

  it('POST /api/workflows/templates/authoring duplicates builtin templates with default copy naming', async () => {
    const { res, body } = await requestJson('/api/workflows/templates/authoring', {
      method: 'POST',
      body: JSON.stringify({
        operation: 'duplicate',
        selector: {
          source: 'builtin',
          id: 'agent-development',
        },
      }),
    })

    expect(res.status).toBe(201)
    expect(body).toMatchObject({
      operation: 'duplicate',
      status: 'succeeded',
      persisted: true,
      affectedTemplate: {
        source: 'user',
        id: 'agent-development-custom',
        name: 'Agent Development Custom',
        basisHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      },
      beforeSummary: {
        source: 'builtin',
        id: 'agent-development',
        editable: false,
        copyable: true,
      },
      afterSummary: {
        source: 'user',
        id: 'agent-development-custom',
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

    const { body: listBody } = await requestJson('/api/workflows/templates')
    expect(listBody.templates).toContainEqual(expect.objectContaining({
      source: 'builtin',
      id: 'agent-development',
      editable: false,
    }))
    expect(listBody.templates).toContainEqual(expect.objectContaining({
      source: 'user',
      id: 'agent-development-custom',
      name: 'Agent Development Custom',
      editable: true,
    }))
  })

  it('POST /api/workflows/templates/authoring rejects duplicate target conflicts without writing', async () => {
    await writeWorkflowConfig({
      schemaVersion: 1,
      templates: [{ ...validTemplate('existing-copy'), name: 'Existing Copy' }],
    })

    const { res, body } = await expectConfigUnchanged(() => requestJson('/api/workflows/templates/authoring', {
      method: 'POST',
      body: JSON.stringify({
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
    }))

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
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

  it('POST /api/workflows/templates/authoring deletes a fresh user template and returns refreshed list metadata', async () => {
    await writeWorkflowConfig({
      schemaVersion: 1,
      templates: [{ ...validTemplate('deletable-workflow'), name: 'Deletable Workflow' }],
    })

    const { body: inspectBody } = await requestJson('/api/workflows/templates/authoring', {
      method: 'POST',
      body: JSON.stringify({
        operation: 'inspect',
        selector: {
          source: 'user',
          id: 'deletable-workflow',
        },
      }),
    })
    const basisHash = (inspectBody.affectedTemplate as Record<string, unknown> | undefined)?.basisHash
    expect(basisHash).toMatch(/^sha256:[a-f0-9]{64}$/)

    const { res, body } = await requestJson('/api/workflows/templates/authoring', {
      method: 'POST',
      body: JSON.stringify({
        operation: 'delete',
        selector: {
          source: 'user',
          id: 'deletable-workflow',
        },
        basisHash,
      }),
    })

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      operation: 'delete',
      status: 'succeeded',
      persisted: true,
      affectedTemplate: {
        source: 'user',
        id: 'deletable-workflow',
        name: 'Deletable Workflow',
        basisHash,
      },
      beforeSummary: {
        source: 'user',
        id: 'deletable-workflow',
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
    expect(body.templates).toContainEqual(expect.objectContaining({
      source: 'builtin',
      id: 'agent-development',
      editable: false,
    }))
    expect((body.templates as WorkflowTemplateSummary[]).some((template) => template.id === 'deletable-workflow')).toBe(false)
    expect(await readWorkflowConfig()).toEqual({
      schemaVersion: 1,
      templates: [],
    })
  })

  it('POST /api/workflows/templates/authoring rejects stale delete without writing', async () => {
    await writeWorkflowConfig({
      schemaVersion: 1,
      templates: [{ ...validTemplate('stale-delete-workflow'), name: 'Stale Delete Workflow' }],
    })

    const { body: inspectBody } = await requestJson('/api/workflows/templates/authoring', {
      method: 'POST',
      body: JSON.stringify({
        operation: 'inspect',
        selector: {
          source: 'user',
          id: 'stale-delete-workflow',
        },
      }),
    })
    const oldBasisHash = (inspectBody.affectedTemplate as Record<string, unknown> | undefined)?.basisHash
    expect(oldBasisHash).toMatch(/^sha256:[a-f0-9]{64}$/)

    await writeWorkflowConfig({
      schemaVersion: 1,
      templates: [{ ...validTemplate('stale-delete-workflow'), version: '2', name: 'Manual Edit' }],
    })

    const { res, body } = await expectConfigUnchanged(() => requestJson('/api/workflows/templates/authoring', {
      method: 'POST',
      body: JSON.stringify({
        operation: 'delete',
        selector: {
          source: 'user',
          id: 'stale-delete-workflow',
        },
        basisHash: oldBasisHash,
      }),
    }))

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      operation: 'delete',
      status: 'rejected',
      persisted: false,
      affectedTemplate: {
        source: 'user',
        id: 'stale-delete-workflow',
        name: 'Manual Edit',
        version: '2',
        basisHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      },
      validation: {
        valid: false,
        issues: [
          expect.objectContaining({
            source: 'authoring',
            code: 'WORKFLOW_TEMPLATE_STALE_BASIS',
            templateId: 'stale-delete-workflow',
          }),
        ],
      },
      nextAction: 'inspect-and-retry',
    })
    expect((body.affectedTemplate as Record<string, unknown>).basisHash).not.toBe(oldBasisHash)
  })

  it('POST /api/workflows/templates/authoring rejects builtin and missing deletes without writing', async () => {
    await writeWorkflowConfig({
      schemaVersion: 1,
      templates: [validTemplate('existing-workflow')],
    })

    const builtinResult = await expectConfigUnchanged(() => requestJson('/api/workflows/templates/authoring', {
      method: 'POST',
      body: JSON.stringify({
        operation: 'delete',
        selector: {
          source: 'builtin',
          id: 'agent-development',
        },
        basisHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      }),
    }))
    const missingResult = await expectConfigUnchanged(() => requestJson('/api/workflows/templates/authoring', {
      method: 'POST',
      body: JSON.stringify({
        operation: 'delete',
        selector: {
          source: 'user',
          id: 'missing-workflow',
        },
        basisHash: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      }),
    }))

    expect(builtinResult.res.status).toBe(200)
    expect(builtinResult.body).toMatchObject({
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
            code: 'WORKFLOW_TEMPLATE_BUILTIN_READONLY',
            templateId: 'agent-development',
          }),
        ],
      },
      nextAction: 'copy-builtin-first',
    })
    expect(missingResult.res.status).toBe(200)
    expect(missingResult.body).toMatchObject({
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
            code: 'WORKFLOW_TEMPLATE_TARGET_NOT_FOUND',
            templateId: 'missing-workflow',
          }),
        ],
      },
      nextAction: 'inspect-and-retry',
    })
  })

  it('POST /api/workflows/templates rejects builtin id create without writing', async () => {
    const { res, body } = await expectConfigUnchanged(() => requestJson('/api/workflows/templates', {
      method: 'POST',
      body: JSON.stringify({ template: validTemplate('agent-development') }),
    }))

    expect(res.status).toBe(400)
    expectWorkflowError(body, 'WORKFLOW_TEMPLATE_BUILTIN_ID_CONFLICT')
  })

  it('POST /api/workflows/templates rejects existing user id conflicts without overwriting', async () => {
    await writeWorkflowConfig({
      schemaVersion: 1,
      templates: [{ ...validTemplate('custom-workflow'), name: 'Existing Workflow' }],
    })

    const { res, body } = await expectConfigUnchanged(() => requestJson('/api/workflows/templates', {
      method: 'POST',
      body: JSON.stringify({ template: { ...validTemplate('custom-workflow'), name: 'Replacement Attempt' } }),
    }))

    expect(res.status).toBe(409)
    expectWorkflowError(body, 'WORKFLOW_TEMPLATE_CONFLICT')
  })

  it('PUT /api/workflows/templates/user/:id updates only matching user templates', async () => {
    await writeWorkflowConfig({
      schemaVersion: 1,
      preservedTopLevel: 'keep-me',
      templates: [{ ...validTemplate('custom-workflow'), unknownTemplateField: 'keep-template' }],
    })

    const { res, body } = await requestJson('/api/workflows/templates/user/custom-workflow', {
      method: 'PUT',
      body: JSON.stringify({
        template: { ...validTemplate('custom-workflow'), version: '2', name: 'Updated Workflow' },
      }),
    })

    expect(res.status).toBe(200)
    expect(body.template).toEqual(expect.objectContaining({
      id: 'custom-workflow',
      source: 'user',
      version: '2',
      name: 'Updated Workflow',
    }))
    expect(await readWorkflowConfig()).toEqual(expect.objectContaining({
      preservedTopLevel: 'keep-me',
      templates: [expect.objectContaining({ unknownTemplateField: 'keep-template' })],
    }))
  })

  it('PUT /api/workflows/templates/user/:id rejects id mismatch without writing', async () => {
    await writeWorkflowConfig({
      schemaVersion: 1,
      templates: [validTemplate('custom-workflow')],
    })

    const { res, body } = await expectConfigUnchanged(() => requestJson('/api/workflows/templates/user/custom-workflow', {
      method: 'PUT',
      body: JSON.stringify({ template: validTemplate('renamed-workflow') }),
    }))

    expect(res.status).toBe(409)
    expectWorkflowError(body, 'WORKFLOW_TEMPLATE_CONFLICT')
  })

  it('PUT /api/workflows/templates/builtin/:id rejects builtin mutation without writing', async () => {
    const { res, body } = await expectConfigUnchanged(() => requestJson('/api/workflows/templates/builtin/agent-development', {
      method: 'PUT',
      body: JSON.stringify({ template: validTemplate('agent-development') }),
    }))

    expect(res.status).toBe(405)
    expectWorkflowError(body, 'METHOD_NOT_ALLOWED')
  })

  it('DELETE /api/workflows/templates/user/:id deletes user templates without touching builtin availability', async () => {
    await writeWorkflowConfig({
      schemaVersion: 1,
      templates: [validTemplate('custom-workflow')],
    })

    const { res, body } = await requestJson('/api/workflows/templates/user/custom-workflow', {
      method: 'DELETE',
    })

    expect(res.status).toBe(200)
    expect(body.templates).toContainEqual(expect.objectContaining({
      id: 'agent-development',
      source: 'builtin',
    }))
    expect((body.templates as WorkflowTemplateSummary[]).some((template) => template.id === 'custom-workflow')).toBe(false)
  })

  it('DELETE /api/workflows/templates/builtin/:id rejects builtin deletion without writing', async () => {
    const { res, body } = await expectConfigUnchanged(() => requestJson('/api/workflows/templates/builtin/agent-development', {
      method: 'DELETE',
    }))

    expect(res.status).toBe(405)
    expectWorkflowError(body, 'METHOD_NOT_ALLOWED')
  })

  it('POST /api/workflows/templates/duplicate copies builtin templates to user templates with a safe target id', async () => {
    const { res, body } = await requestJson('/api/workflows/templates/duplicate', {
      method: 'POST',
      body: JSON.stringify({
        source: 'builtin',
        id: 'agent-development',
        targetId: 'agent-development-copy',
        targetName: 'Agent Development Copy',
      }),
    })

    expect(res.status).toBe(201)
    expect(body.template).toEqual(expect.objectContaining({
      id: 'agent-development-copy',
      source: 'user',
      name: 'Agent Development Copy',
    }))
  })

  it('POST /api/workflows/templates/duplicate rejects target ids that shadow builtins without writing', async () => {
    const { res, body } = await expectConfigUnchanged(() => requestJson('/api/workflows/templates/duplicate', {
      method: 'POST',
      body: JSON.stringify({
        source: 'builtin',
        id: 'agent-development',
        targetId: 'agent-development',
      }),
    }))

    expect(res.status).toBe(400)
    expectWorkflowError(body, 'WORKFLOW_TEMPLATE_BUILTIN_ID_CONFLICT')
  })

  it('POST /api/workflows/templates/import/preview proposes rename for builtin conflicts and does not write', async () => {
    const { res, body } = await expectConfigUnchanged(() => requestJson('/api/workflows/templates/import/preview', {
      method: 'POST',
      body: JSON.stringify({
        payload: {
          schemaVersion: 1,
          templates: [validTemplate('agent-development')],
        },
      }),
    }))

    expect(res.status).toBe(200)
    expect(body.schemaVersion).toBe(1)
    expect(body.candidates).toContainEqual(expect.objectContaining({
      originalId: 'agent-development',
      proposedId: expect.stringMatching(/^agent-development-/),
      conflict: 'builtin-template',
      defaultResolution: 'rename',
      selectable: true,
    }))
    expect(body.canCommit).toBe(true)
  })

  it('POST /api/workflows/templates/import/preview proposes rename for user conflicts instead of overwrite', async () => {
    await writeWorkflowConfig({
      schemaVersion: 1,
      templates: [validTemplate('custom-workflow')],
    })

    const { res, body } = await expectConfigUnchanged(() => requestJson('/api/workflows/templates/import/preview', {
      method: 'POST',
      body: JSON.stringify({
        payload: {
          schemaVersion: 1,
          templates: [validTemplate('custom-workflow')],
        },
      }),
    }))

    expect(res.status).toBe(200)
    expect(body.candidates).toContainEqual(expect.objectContaining({
      originalId: 'custom-workflow',
      conflict: 'user-template',
      defaultResolution: 'rename',
      selectable: true,
    }))
  })

  it('POST /api/workflows/templates/import/preview proposes an available rename when imported ids collide with existing rename targets', async () => {
    await writeWorkflowConfig({
      schemaVersion: 1,
      templates: [
        validTemplate('custom-workflow'),
        validTemplate('custom-workflow-imported'),
      ],
    })

    const { res, body } = await expectConfigUnchanged(() => requestJson('/api/workflows/templates/import/preview', {
      method: 'POST',
      body: JSON.stringify({
        payload: {
          schemaVersion: 1,
          templates: [validTemplate('custom-workflow')],
        },
      }),
    }))

    expect(res.status).toBe(200)
    expect(body.candidates).toContainEqual(expect.objectContaining({
      originalId: 'custom-workflow',
      proposedId: 'custom-workflow-imported-2',
      conflict: 'user-template',
      defaultResolution: 'rename',
      selectable: true,
    }))
  })

  it('POST /api/workflows/templates/import recomputes validation and rejects stale preview selections without writing', async () => {
    const { res, body } = await expectConfigUnchanged(() => requestJson('/api/workflows/templates/import', {
      method: 'POST',
      body: JSON.stringify({
        payload: {
          schemaVersion: 1,
          templates: [invalidPromptOnlyTemplate('stale-preview-template')],
        },
        selections: [
          {
            importId: 'candidate-1',
            resolution: 'add',
            targetId: 'stale-preview-template',
          },
        ],
      }),
    }))

    expect(res.status).toBe(400)
    expectWorkflowError(body, 'WORKFLOW_TEMPLATE_INVALID')
    expect(body.issues).toContainEqual(expect.objectContaining({
      source: 'import',
      code: 'WORKFLOW_PHASE_OUTPUT_ARTIFACT_REQUIRED',
      severity: 'error',
    }))
  })

  it('POST /api/workflows/templates/import rejects stale add selections that now conflict with existing user templates without writing', async () => {
    await writeWorkflowConfig({
      schemaVersion: 1,
      templates: [validTemplate('new-template')],
    })

    const { res, body } = await expectConfigUnchanged(() => requestJson('/api/workflows/templates/import', {
      method: 'POST',
      body: JSON.stringify({
        payload: { schemaVersion: 1, templates: [validTemplate('new-template')] },
        selections: [
          {
            importId: 'candidate-1',
            resolution: 'add',
          },
        ],
      }),
    }))

    expect(res.status).toBe(409)
    expectWorkflowError(body, 'WORKFLOW_TEMPLATE_CONFLICT')
  })

  it('POST /api/workflows/templates/import rejects duplicate selected target ids atomically', async () => {
    const { res, body } = await expectConfigUnchanged(() => requestJson('/api/workflows/templates/import', {
      method: 'POST',
      body: JSON.stringify({
        payload: {
          schemaVersion: 1,
          templates: [
            validTemplate('first-template'),
            validTemplate('second-template'),
          ],
        },
        selections: [
          { importId: 'candidate-1', resolution: 'rename', targetId: 'same-target' },
          { importId: 'candidate-2', resolution: 'rename', targetId: 'same-target' },
        ],
      }),
    }))

    expect(res.status).toBe(409)
    expectWorkflowError(body, 'WORKFLOW_TEMPLATE_CONFLICT')
  })

  it('POST /api/workflows/templates/import commits only selected templates with rename resolution', async () => {
    const selected = validTemplate('selected-template')
    const skipped = validTemplate('skipped-template')

    const { res, body } = await requestJson('/api/workflows/templates/import', {
      method: 'POST',
      body: JSON.stringify({
        payload: { schemaVersion: 1, templates: [selected, skipped] },
        selections: [
          {
            importId: 'candidate-1',
            resolution: 'rename',
            targetId: 'selected-template-imported',
          },
        ],
      }),
    })

    expect(res.status).toBe(200)
    expect(body.templates).toContainEqual(expect.objectContaining({
      id: 'selected-template-imported',
      source: 'user',
    }))
    expect((body.templates as WorkflowTemplateSummary[]).some((template) => template.id === 'skipped-template')).toBe(false)
  })

  it('POST /api/workflows/templates/import rejects overwrite resolution by default without writing', async () => {
    await writeWorkflowConfig({
      schemaVersion: 1,
      templates: [validTemplate('custom-workflow')],
    })

    const { res, body } = await expectConfigUnchanged(() => requestJson('/api/workflows/templates/import', {
      method: 'POST',
      body: JSON.stringify({
        payload: { schemaVersion: 1, templates: [validTemplate('custom-workflow')] },
        selections: [{ importId: 'candidate-1', resolution: 'overwrite', targetId: 'custom-workflow' }],
      }),
    }))

    expect(res.status).toBe(409)
    expectWorkflowError(body, 'WORKFLOW_TEMPLATE_CONFLICT')
  })

  it('POST /api/workflows/templates/import preserves unresolved recommended skill references when committed', async () => {
    const template = validTemplate('preserve-missing-phase-skill-import')
    const [phase] = template.phases as Array<Record<string, unknown>>
    phase.skills = [{
      name: 'missing-skill',
      mode: 'recommended',
      source: 'plugin',
      pluginName: 'offline-plugin',
      referenceId: 'ref-missing-skill',
      ownerDefinedSkillField: 'keep-skill-field',
    }]

    const { res, body } = await requestJson('/api/workflows/templates/import', {
      method: 'POST',
      body: JSON.stringify({
        payload: {
          schemaVersion: 2,
          templates: [template],
          dependencyManifest: {
            schemaVersion: 1,
            generatedAt: '2026-05-29T00:00:00.000Z',
            dependencies: [
              {
                templateId: 'preserve-missing-phase-skill-import',
                phaseId: 'draft',
                reference: {
                  name: 'missing-skill',
                  mode: 'recommended',
                  source: 'plugin',
                  pluginName: 'offline-plugin',
                  referenceId: 'ref-missing-skill',
                  ownerDefinedSkillField: 'keep-skill-field',
                },
                exportStatus: 'missing',
                resolvedSource: 'plugin',
                pluginName: 'offline-plugin',
                diagnostic: 'Skill is not installed in this environment.',
              },
            ],
          },
        },
        selections: [
          {
            importId: 'candidate-1',
            resolution: 'add',
          },
        ],
      }),
    })

    expect(res.status).toBe(200)
    const persisted = await readWorkflowConfig()
    expect(persisted).toMatchObject({
      templates: [
        {
          id: 'preserve-missing-phase-skill-import',
          phases: [
            {
              id: 'draft',
              skills: [
                {
                  name: 'missing-skill',
                  mode: 'recommended',
                  source: 'plugin',
                  pluginName: 'offline-plugin',
                  referenceId: 'ref-missing-skill',
                  ownerDefinedSkillField: 'keep-skill-field',
                },
              ],
            },
          ],
        },
      ],
    })
    expect(body.templates).toContainEqual(expect.objectContaining({
      id: 'preserve-missing-phase-skill-import',
      source: 'user',
    }))
  })

  it('POST /api/workflows/templates/export returns selected template JSON without writing', async () => {
    await writeWorkflowConfig({
      schemaVersion: 1,
      unrelatedUserState: 'must-not-export',
      templates: [validTemplate('custom-workflow')],
    })

    const { res, body } = await expectConfigUnchanged(() => requestJson('/api/workflows/templates/export', {
      method: 'POST',
      body: JSON.stringify({
        templates: [
          { source: 'user', id: 'custom-workflow' },
          { source: 'builtin', id: 'agent-development' },
        ],
        mode: 'selected',
      }),
    }))

    expect(res.status).toBe(200)
    expect(body.schemaVersion).toBe(2)
    expect(body.exportedAt).toEqual(expect.any(String))
    expect(body.templates).toEqual([
      expect.objectContaining({ id: 'custom-workflow' }),
      expect.objectContaining({ id: 'agent-development' }),
    ])
    expect(body.templates).toEqual([
      expect.not.objectContaining({ source: expect.anything() }),
      expect.not.objectContaining({ source: expect.anything() }),
    ])
    expect(body.templates).toEqual([
      expect.not.objectContaining({ editable: expect.anything() }),
      expect.not.objectContaining({ editable: expect.anything() }),
    ])
    expect(JSON.stringify(body)).not.toContain('unrelatedUserState')
    expect(JSON.stringify(body)).not.toContain(tmpDir)
  })

  it('POST /api/workflows/templates/export includes a dependency manifest for every phase skill reference', async () => {
    const template = validTemplate('dependency-manifest-workflow')
    const [draftPhase] = template.phases as Array<Record<string, unknown>>
    draftPhase.skills = [{
      name: 'tdd-workflow',
      mode: 'recommended',
      source: 'project',
      contentHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    }]
    ;(template.phases as Array<Record<string, unknown>>).push({
      id: 'review',
      name: 'Review',
      instructions: 'Review the requested artifact.',
      requiredIntake: ['Use the draft artifact.'],
      handoffRules: ['Summarize review findings.'],
      outputArtifact: {
        id: 'review-output',
        name: 'Review output',
        kind: 'markdown',
        description: 'The review artifact.',
        required: true,
      },
      completionCriteria: {
        type: 'artifact-required',
        description: 'The review artifact is complete.',
      },
      transition: { authority: 'user-confirmation' },
      skills: [
        {
          name: 'missing-review-skill',
          mode: 'recommended',
          source: 'plugin',
          pluginName: 'disabled-review-plugin',
          referenceId: 'review-skill-ref',
        },
      ],
    })

    await writeWorkflowConfig({
      schemaVersion: 1,
      templates: [template],
    })

    const { res, body } = await expectConfigUnchanged(() => requestJson('/api/workflows/templates/export', {
      method: 'POST',
      body: JSON.stringify({
        templates: [{ source: 'user', id: 'dependency-manifest-workflow' }],
        mode: 'selected',
      }),
    }))

    expect(res.status).toBe(200)
    expect(body.schemaVersion).toBe(2)
    const dependencies = (body.dependencyManifest as { dependencies: unknown[] }).dependencies
    expect(dependencies).toHaveLength(2)
    expect(body.dependencyManifest).toMatchObject({
      schemaVersion: 1,
      generatedAt: expect.any(String),
      dependencies: expect.arrayContaining([
        expect.objectContaining({
          templateId: 'dependency-manifest-workflow',
          phaseId: 'draft',
          reference: expect.objectContaining({
            name: 'tdd-workflow',
            mode: 'recommended',
            source: 'project',
          }),
          exportStatus: expect.any(String),
          resolvedSource: expect.any(String),
          contentHash: expect.any(String),
        }),
        expect.objectContaining({
          templateId: 'dependency-manifest-workflow',
          phaseId: 'review',
          reference: expect.objectContaining({
            name: 'missing-review-skill',
            mode: 'recommended',
            source: 'plugin',
            pluginName: 'disabled-review-plugin',
            referenceId: 'review-skill-ref',
          }),
          exportStatus: expect.any(String),
          pluginName: 'disabled-review-plugin',
          diagnostic: expect.any(String),
        }),
      ]),
    })
  })

  it('POST /api/workflows/templates/export does not include skill package contents by default', async () => {
    const template = validTemplate('no-skill-bundle-export')
    const [phase] = template.phases as Array<Record<string, unknown>>
    phase.skills = [{ name: 'tdd-workflow', mode: 'recommended' }]

    await writeWorkflowConfig({
      schemaVersion: 1,
      templates: [template],
    })

    const { res, body } = await expectConfigUnchanged(() => requestJson('/api/workflows/templates/export', {
      method: 'POST',
      body: JSON.stringify({
        templates: [{ source: 'user', id: 'no-skill-bundle-export' }],
        mode: 'selected',
      }),
    }))

    const serialized = JSON.stringify(body)
    expect(res.status).toBe(200)
    expect(body.dependencyManifest).toBeDefined()
    expect(body).not.toEqual(expect.objectContaining({
      skills: expect.anything(),
      skillPackages: expect.anything(),
      bundledSkills: expect.anything(),
    }))
    expect(serialized).not.toContain('Core Principles')
    expect(serialized).not.toContain('Test-Driven Development Workflow')
    expect(serialized).not.toContain('agents/openai.yaml')
  })

  it('POST /api/workflows/templates/export returns builtin templates as reusable import payloads', async () => {
    const { res: exportRes, body: exportBody } = await expectConfigUnchanged(() => requestJson('/api/workflows/templates/export', {
      method: 'POST',
      body: JSON.stringify({
        templates: [{ source: 'builtin', id: 'agent-development' }],
        mode: 'selected',
      }),
    }))

    expect(exportRes.status).toBe(200)
    const exportedTemplates = exportBody.templates as Array<Record<string, unknown>>

    const { res: previewRes, body: previewBody } = await expectConfigUnchanged(() => requestJson('/api/workflows/templates/import/preview', {
      method: 'POST',
      body: JSON.stringify({
        payload: {
          schemaVersion: 1,
          templates: exportedTemplates,
        },
      }),
    }))

    expect(previewRes.status).toBe(200)
    expect(previewBody.candidates).toContainEqual(expect.objectContaining({
      originalId: 'agent-development',
      conflict: 'builtin-template',
      defaultResolution: 'rename',
      selectable: true,
      issues: [],
    }))
  })

  it('unsupported methods return 405 with stable METHOD_NOT_ALLOWED error code', async () => {
    const cases = [
      { method: 'PATCH', path: '/api/workflows/templates' },
      { method: 'POST', path: '/api/workflows/templates/user/custom-workflow' },
      { method: 'PATCH', path: '/api/workflows/templates/import/preview' },
      { method: 'GET', path: '/api/workflows/templates/export' },
    ]

    for (const testCase of cases) {
      const { res, body } = await requestJson(testCase.path, { method: testCase.method })
      expect(res.status, `${testCase.method} ${testCase.path}`).toBe(405)
      expectWorkflowError(body, 'METHOD_NOT_ALLOWED')
    }
  })

  it('malformed JSON request bodies return stable WORKFLOW_TEMPLATE_INVALID_JSON errors', async () => {
    const { res, body } = await requestJson('/api/workflows/templates/validate', {
      method: 'POST',
      body: '{"template":',
    })

    expect(res.status).toBe(400)
    expectWorkflowError(body, 'WORKFLOW_TEMPLATE_INVALID_JSON')
  })
})
