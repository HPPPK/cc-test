import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  WorkflowTemplateRegistryService,
  collectTemplateSkillCatalog,
  resetWorkflowTemplateRegistryForTests,
} from './workflowTemplateRegistryService.js'
import { getWorkflowPackStorageDir } from './packRegistryService.js'
import { ZipPackAdapter } from './zipPackAdapter.js'

type WorkflowTemplateFixture = {
  schemaVersion: 1 | 2
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
let originalAppRoot: string | undefined
let originalCallerDir: string | undefined
let originalSkillsDir: string | undefined
let originalBundledSkillsDir: string | undefined

const editableDefaultTemplateIds = new Set([
  'efficient-constrained-dev-debug-workflow-v5',
  'feature-extension-workflow-v8',
  'debug-repair-workflow-v8',
])

function userAuthoredTemplates(result: Awaited<ReturnType<WorkflowTemplateRegistryService['listTemplates']>>) {
  return result.templates.filter((template) =>
    template.source === 'user' && !editableDefaultTemplateIds.has(template.id)
  )
}

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

function restoreEnvVar(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = value
  }
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

async function readStoredWorkflowFromZip(workflowId: string): Promise<WorkflowTemplateFixture['templates'][number]> {
  const zipPath = path.join(getWorkflowPackStorageDir(), `${workflowId}.zip`)
  const zipData = new Uint8Array(await fs.readFile(zipPath))
  const zip = await new ZipPackAdapter().read(zipData)
  return zip.readJson(`workflows/${workflowId}.workflow.json`) as Promise<WorkflowTemplateFixture['templates'][number]>
}

function issueCodes(result: { invalidTemplates: Array<{ code: string }> }) {
  return result.invalidTemplates.map((issue) => issue.code)
}

function expectShortPolicyActions(actions: unknown[] | undefined) {
  for (const action of actions ?? []) {
    expect(typeof action).toBe('string')
    const value = action as string
    expect(value.length).toBeLessThanOrEqual(48)
    expect(value).not.toMatch(/^(Do not|Read,|Ask |If |Stage \d|Bash\/PowerShell)/)
    expect(value).not.toMatch(/[.!?]$/)
  }
}

function expectWorkflowPoliciesAreStructured(template: { phases?: Array<Record<string, any>> }) {
  for (const phase of template.phases ?? []) {
    expectShortPolicyActions(phase.actionPolicy?.allowedActions)
    expectShortPolicyActions(phase.actionPolicy?.forbiddenActions)
    expectShortPolicyActions(phase.contract?.actionPolicy?.allowedActions)
    expectShortPolicyActions(phase.contract?.actionPolicy?.forbiddenActions)
    expectShortPolicyActions(phase.runtimeContract?.allowedActions)
    expectShortPolicyActions(phase.runtimeContract?.forbiddenActions)
  }
}

function expectExactTools(actual: unknown[] | undefined, expected: string[]) {
  expect(actual).toEqual(expected)
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
    originalAppRoot = process.env.CLAUDE_APP_ROOT
    originalCallerDir = process.env.CALLER_DIR
    originalSkillsDir = process.env.CLAUDE_SKILLS_DIR
    originalBundledSkillsDir = process.env.CLAUDE_BUNDLED_SKILLS_DIR
    process.env.CLAUDE_CONFIG_DIR = tempConfigDir
    delete process.env.CLAUDE_APP_ROOT
    delete process.env.CALLER_DIR
    delete process.env.CLAUDE_SKILLS_DIR
    delete process.env.CLAUDE_BUNDLED_SKILLS_DIR
    resetWorkflowTemplateRegistryForTests()
  })

  afterEach(async () => {
    resetWorkflowTemplateRegistryForTests()
    restoreEnvVar('CLAUDE_CONFIG_DIR', originalConfigDir)
    restoreEnvVar('CLAUDE_APP_ROOT', originalAppRoot)
    restoreEnvVar('CALLER_DIR', originalCallerDir)
    restoreEnvVar('CLAUDE_SKILLS_DIR', originalSkillsDir)
    restoreEnvVar('CLAUDE_BUNDLED_SKILLS_DIR', originalBundledSkillsDir)
    await fs.rm(tempConfigDir, { recursive: true, force: true })
  })

  test('returns editable user workflow templates when user config is missing', async () => {
    const result = await new WorkflowTemplateRegistryService().listTemplates()

    expect(result.invalidTemplates).toEqual([])
    expect(result.templates.every((template) => template.source === 'user')).toBe(true)
    expect(result.templates.find((template) => template.id === 'guided-product-builder')).toBeUndefined()
    expect(result.templates).toContainEqual(expect.objectContaining({
      id: 'efficient-constrained-dev-debug-workflow-v5',
      source: 'user',
      schemaVersion: 2,
      version: '10',
      name: expect.any(String),
      labels: expect.arrayContaining(['new-product', 'enhancement', 'ux-copy', 'error-handling']),
      phases: expect.arrayContaining([
        expect.objectContaining({ id: 'route-context' }),
      ]),
    }))
    expect(result.templates).toContainEqual(expect.objectContaining({
      id: 'feature-extension-workflow-v8',
      source: 'user',
      schemaVersion: 2,
      version: '8',
      phases: [
        expect.objectContaining({ id: 'feature-memory-plan' }),
        expect.objectContaining({ id: 'feature-implement' }),
        expect.objectContaining({ id: 'feature-quality-preview' }),
        expect.objectContaining({ id: 'feature-finish-memory' }),
      ],
    }))
    expect(result.templates).toContainEqual(expect.objectContaining({
      id: 'debug-repair-workflow-v8',
      source: 'user',
      schemaVersion: 2,
      version: '8',
      phases: [
        expect.objectContaining({ id: 'debug-memory-intake' }),
        expect.objectContaining({ id: 'debug-investigate' }),
        expect.objectContaining({ id: 'debug-fix' }),
        expect.objectContaining({ id: 'debug-quality-preview' }),
        expect.objectContaining({ id: 'debug-finish-memory' }),
      ],
    }))
    expect(result.templates.find((template) => template.id === 'agent-development')).toBeUndefined()

    const developmentTemplate = result.templates.find((template) => template.id === 'efficient-constrained-dev-debug-workflow-v5')
    expect(developmentTemplate?.labels).not.toContain('bug')
    expect(developmentTemplate?.stopConditions.join('\n')).not.toContain('problem-investigation')
    expect(developmentTemplate?.stopConditions.join('\n')).not.toContain('Bug routes')
    const developmentRouteContext = developmentTemplate?.phases.find((phase) => phase.id === 'route-context')
    const developmentScopePlan = developmentTemplate?.phases.find((phase) => phase.id === 'scope-plan')
    const developmentDeliveryPlan = developmentTemplate?.phases.find((phase) => phase.id === 'delivery-plan')
    const developmentImplement = developmentTemplate?.phases.find((phase) => phase.id === 'delegate-implement')
    const developmentValidation = developmentTemplate?.phases.find((phase) => phase.id === 'scenario-review')
    const developmentPreview = developmentTemplate?.phases.find((phase) => phase.id === 'local-preview')
    const developmentFinish = developmentTemplate?.phases.find((phase) => phase.id === 'finish-memory')
    expectWorkflowPoliciesAreStructured(developmentTemplate ?? {})
    expect(developmentTemplate?.phases.map((phase) => phase.name)).toHaveLength(7)
    for (const phase of developmentTemplate?.phases ?? []) {
      expect(phase.appliesTo ?? []).not.toContain('bug')
    }
    const stagePlanningTools = ['Read', 'Glob', 'Grep', 'LS', 'AskUserQuestion', 'workflow_template_authoring', 'submit_phase_completion']
    const stagePlanningDisallowedTools = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'PowerShell', 'Agent']
    expect(developmentRouteContext).toMatchObject({
      name: expect.any(String),
      objective: expect.stringContaining('Confirm the general application framing'),
      outputArtifact: expect.objectContaining({
        id: 'route-context',
        name: 'App Framing',
        description: expect.stringContaining('.workflow/project-context.md'),
      }),
      outputArtifacts: expect.arrayContaining([
        expect.objectContaining({ id: 'project-context', filename: '.workflow/project-context.md' }),
        expect.objectContaining({ id: 'work-order', filename: '.workflow/work-order.md' }),
        expect.objectContaining({ id: 'app-framing', filename: '.workflow/runs/<runId>/app-framing.md' }),
      ]),
      runtimeContract: expect.objectContaining({
        allowedActions: ['read', 'artifact', 'question', 'workspace-validation', 'source-material-identification', 'app-framing'],
        forbiddenActions: ['production edits', 'source file creation', 'dependency installs', 'database init', 'migrations', 'seed overwrite', 'deletes', 'deploy', 'detailed feature design', 'ui detail design', 'implementation planning', 'subagent coding'],
        toolAccess: expect.objectContaining({
          allowed: expect.arrayContaining(['Read', 'Glob', 'Grep', 'LS', 'AskUserQuestion', 'workflow_template_authoring', 'submit_phase_completion']),
          forbidden: expect.arrayContaining(['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'PowerShell', 'Agent']),
          requiresExplicitUserConfirmation: expect.arrayContaining(['installDependencies', 'databaseInit', 'migrations', 'seedOverwrite', 'delete', 'network', 'deploy']),
        }),
      }),
    })
    expectExactTools(developmentRouteContext?.toolPolicy?.allowedTools, stagePlanningTools)
    expectExactTools(developmentRouteContext?.toolPolicy?.disallowedTools, stagePlanningDisallowedTools)
    expect(developmentRouteContext?.instructions).toContain('application framing')
    expect(developmentRouteContext?.instructions).toContain('sourceMaterialType')
    expect(developmentRouteContext?.instructions).toContain('sourceMaterialAccessStatus')
    expect(developmentRouteContext?.instructions).toContain('sourceMaterialHandlingHint')
    expect(developmentRouteContext?.instructions).toContain('uiDirectionNeeded')
    expect(developmentRouteContext?.instructions).toContain("Work dynamically from the user's request")
    expect(developmentRouteContext?.instructions).toContain('Do not use a fixed question sequence')
    expect(developmentRouteContext?.instructions).toContain('Each question is part of the current stage work')
    expect(developmentRouteContext?.instructions).toContain('Do not begin detailed product discovery or UI/UX work')
    expect(developmentRouteContext?.instructions).toContain("Update the current stage's progress/artifact")
    expect(developmentRouteContext?.instructions).toContain('all blocking stage issues are explicitly processed')
    expect(developmentRouteContext?.instructions).not.toContain('微信定时发送任务小程序')
    expect(developmentRouteContext?.instructions).not.toContain('fixed low-randomness app-framing checklist')
    expect(developmentRouteContext?.executionRules.join('\n')).toContain('Do not discuss detailed product feature modules')
    expect(developmentRouteContext?.executionRules.join('\n')).toContain('while still allowing the user to adjust fields one by one')
    expect(developmentRouteContext?.handoffRules.join('\n')).toContain('Do not proceed to detailed feature brainstorming until appFraming is confirmed')
    expect(developmentRouteContext?.completionCriteria).toMatchObject({
      description: expect.stringContaining('final app-framing summary includes all eight fields'),
    })
    expect(developmentScopePlan).toMatchObject({
      name: expect.any(String),
      objective: expect.stringContaining('Lock the first-version product scope'),
      outputArtifact: expect.objectContaining({
        id: 'work-order',
        name: 'Product Scope / Work Order',
        description: expect.stringContaining('user-facing copy requirements'),
      }),
      outputArtifacts: expect.arrayContaining([
        expect.objectContaining({ id: 'work-order', filename: '.workflow/work-order.md' }),
        expect.objectContaining({ id: 'scope-lock', filename: '.workflow/runs/<runId>/scope-lock.md' }),
      ]),
      runtimeContract: expect.objectContaining({
        allowedActions: ['read', 'artifact', 'question', 'product-discovery', 'scope-lock', 'source-material-analysis', 'ui-ux-direction'],
        forbiddenActions: ['production edits', 'source file creation', 'dependency installs', 'database init', 'migrations', 'seed overwrite', 'deletes', 'deploy', 'implementation planning', 'target file planning', 'database schema design', 'api route design', 'component structure design', 'css implementation planning', 'subagent coding'],
        toolAccess: expect.objectContaining({
          allowed: expect.arrayContaining(['Read', 'Glob', 'Grep', 'LS', 'AskUserQuestion', 'workflow_template_authoring', 'submit_phase_completion']),
          forbidden: expect.arrayContaining(['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'PowerShell', 'Agent']),
          requiresExplicitUserConfirmation: expect.arrayContaining(['installDependencies', 'databaseInit', 'migrations', 'seedOverwrite', 'delete', 'network', 'deploy']),
        }),
      }),
    })
    expectExactTools(developmentScopePlan?.toolPolicy?.allowedTools, stagePlanningTools)
    expectExactTools(developmentScopePlan?.toolPolicy?.disallowedTools, stagePlanningDisallowedTools)
    expect(developmentScopePlan?.requiredIntake).toEqual(expect.arrayContaining([
      '.workflow/project-context.md',
      '.workflow/work-order.md',
      '.workflow/runs/<runId>/app-framing.md when available.',
    ]))
    expect(developmentScopePlan?.instructions).toContain('Do not re-ask Stage 1 appFraming decisions')
    expect(developmentScopePlan?.instructions).toContain('brainstormingMode = on')
    expect(developmentScopePlan?.instructions).toContain('brainstormingMode = off')
    expect(developmentScopePlan?.instructions).toContain('brainstormingMode = auto')
    expect(developmentScopePlan?.instructions).toContain('Product Scope / User Roles / Core User Flows / MVP Features / Non-goals / Acceptance Criteria / Scenario Cases / User-facing Copy Requirements')
    expect(developmentScopePlan?.instructions).toContain('sourceMaterialSummary')
    expect(developmentScopePlan?.instructions).toContain('sourceMaterialFindings')
    expect(developmentScopePlan?.instructions).toContain('uiUxDirection')
    expect(developmentScopePlan?.instructions).toContain('referencePolicy')
    expect(developmentScopePlan?.executionRules.join('\n')).toContain('Do not create implementation batches')
    expect(developmentScopePlan?.executionRules.join('\n')).toContain('Do not plan target files, database schema, API routes, or component structure')
    expect(developmentScopePlan?.handoffRules.join('\n')).toContain('Coder Subagent must not be invoked until after the delivery plan phase')
    expect(developmentScopePlan?.completionCriteria).toMatchObject({
      description: expect.stringContaining('Stage 2 can complete only when'),
    })
    expect(developmentScopePlan?.modePolicy).toMatchObject({
      light: 'Capture minimal product scope, roles, MVP features, non-goals, and one or two scenario cases.',
      standard: 'Capture product scope, roles, core flows, MVP features, non-goals, acceptance criteria, scenario cases, and user-facing copy requirements.',
      heavy: 'Include fuller product exploration, scenario matrix, edge cases, user-role boundaries, and product risks, but do not create technical plan or implementation batches.',
    })
    expect(developmentDeliveryPlan).toMatchObject({
      name: expect.any(String),
      appliesTo: ['new-product', 'enhancement', 'refactor', 'test', 'help-wanted', 'good-first-issue', 'ux-copy', 'error-handling'],
      objective: expect.stringContaining('technical approach and executable delivery plan'),
      outputArtifact: expect.objectContaining({
        id: 'delivery-plan',
        name: 'Delivery Plan',
        description: expect.stringContaining('subagent task packets'),
      }),
      outputArtifacts: expect.arrayContaining([
        expect.objectContaining({ id: 'work-order', filename: '.workflow/work-order.md' }),
        expect.objectContaining({ id: 'delivery-plan', filename: '.workflow/runs/<runId>/delivery-plan.md' }),
      ]),
      runtimeContract: expect.objectContaining({
        allowedActions: ['read', 'artifact', 'question', 'technical-approach', 'delivery-planning', 'subagent-task-design', 'ui-implementation-planning', 'visual-validation-planning'],
        forbiddenActions: ['production edits', 'source file creation', 'dependency installs', 'database init', 'migrations', 'seed overwrite', 'deletes', 'deploy', 'implementation execution', 'subagent coding', 'changing confirmed product scope', 'adding non-goals back to MVP'],
        toolAccess: expect.objectContaining({
          allowed: expect.arrayContaining(['Read', 'Glob', 'Grep', 'LS', 'AskUserQuestion', 'workflow_template_authoring', 'submit_phase_completion']),
          forbidden: expect.arrayContaining(['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'PowerShell', 'Agent']),
          requiresExplicitUserConfirmation: expect.arrayContaining(['installDependencies', 'databaseInit', 'migrations', 'seedOverwrite', 'delete', 'network', 'deploy']),
        }),
      }),
    })
    expectExactTools(developmentDeliveryPlan?.toolPolicy?.allowedTools, stagePlanningTools)
    expectExactTools(developmentDeliveryPlan?.toolPolicy?.disallowedTools, stagePlanningDisallowedTools)
    expect(developmentDeliveryPlan?.requiredIntake).toEqual(expect.arrayContaining([
      '.workflow/project-context.md',
      '.workflow/work-order.md',
      '.workflow/runs/<runId>/app-framing.md when available.',
      '.workflow/runs/<runId>/scope-lock.md when available.',
    ]))
    expect(developmentDeliveryPlan?.instructions).toContain('Do not re-discuss or expand the confirmed product scope')
    expect(developmentDeliveryPlan?.instructions).toContain('implementationBatches')
    expect(developmentDeliveryPlan?.instructions).toContain('subagentTaskPackets')
    expect(developmentDeliveryPlan?.instructions).toContain('coderReturnFormat')
    expect(developmentDeliveryPlan?.instructions).toContain('uiImplementationPlan')
    expect(developmentDeliveryPlan?.instructions).toContain('pageRoutePlan')
    expect(developmentDeliveryPlan?.instructions).toContain('componentPlan')
    expect(developmentDeliveryPlan?.instructions).toContain('styleSystemPlan')
    expect(developmentDeliveryPlan?.instructions).toContain('visualValidationPlan')
    expect(developmentDeliveryPlan?.instructions).toContain('changedFiles, completedItems, skippedItems, testsRun, testResults, blockers, risks, summary, readyForReview')
    expect(developmentDeliveryPlan?.executionRules.join('\n')).toContain('Do not invoke Coder Subagent')
    expect(developmentDeliveryPlan?.executionRules.join('\n')).toContain('Do not modify Stage 2 confirmed product scope')
    expect(developmentDeliveryPlan?.handoffRules.join('\n')).toContain('Coder Subagent may only execute batches listed in .workflow/work-order.md')
    expect(developmentDeliveryPlan?.completionCriteria).toMatchObject({
      description: expect.stringContaining('Stage 3 can complete only when'),
    })
    const developmentImplementCompletionRequires = developmentImplement?.runtimeContract?.completionRequires?.join('\n') ?? ''
    expect(developmentImplementCompletionRequires).toContain('Reviewer result matching reviewerRequiredReturn')
    expect(developmentImplementCompletionRequires).not.toContain('reviewerReturnFormat')
    expect(developmentImplement).toMatchObject({
      name: expect.any(String),
      outputArtifact: expect.objectContaining({
        id: 'implementation-log',
        name: 'Implementation Log',
        description: expect.stringContaining('Coder results, Reviewer results'),
      }),
      outputArtifacts: expect.arrayContaining([
        expect.objectContaining({ id: 'implementation-log', filename: '.workflow/runs/<runId>/implementation-log.md' }),
        expect.objectContaining({ id: 'run-report', filename: '.workflow/run-report.md' }),
      ]),
      runtimeContract: expect.objectContaining({
        allowedActions: expect.arrayContaining(['read', 'search', 'edit-within-plan', 'targeted-test', 'artifact', 'question', 'subagent-coder', 'subagent-reviewer']),
        forbiddenActions: expect.arrayContaining(['out-of-plan edits', 'changing confirmed product scope', 'skipping reviewer', 'continuing with critical review issues']),
        toolAccess: expect.objectContaining({
          allowed: expect.arrayContaining(['Read', 'Glob', 'Grep', 'LS', 'Write', 'Edit', 'MultiEdit', 'Bash', 'PowerShell', 'Agent', 'AskUserQuestion', 'workflow_template_authoring', 'submit_phase_completion']),
          requiresExplicitUserConfirmation: expect.arrayContaining(['installDependencies', 'databaseInit', 'migrations', 'seedOverwrite', 'delete', 'network', 'deploy', 'broad refactor', 'changing product scope', 'adding new feature not in work-order']),
        }),
      }),
      subagentPolicy: expect.objectContaining({
        allowedRoles: expect.arrayContaining(['coder', 'reviewer']),
        sequence: ['coder', 'reviewer'],
        maxParallel: 1,
        contextPolicy: 'brief-only',
        reviewerReadOnly: true,
        coderRequiredReturn: ['changedFiles', 'completedItems', 'skippedItems', 'testsRun', 'testResults', 'blockers', 'risks', 'summary', 'readyForReview'],
        reviewerRequiredReturn: ['reviewStatus', 'scopeCompliance', 'changedFilesCheck', 'testsCheck', 'userFacingCopyCheck', 'riskLevel', 'issues', 'requiredFixes', 'optionalImprovements', 'summary', 'readyForNextBatch'],
      }),
    })
    expect(developmentImplement?.requiredIntake).toEqual(expect.arrayContaining([
      'Confirmed .workflow/work-order.md containing technicalApproach, implementationBatches, subagentTaskPackets, coderReturnFormat, validationPlan, and dangerousActionsNeedingConfirmation.',
      '.workflow/project-context.md',
      '.workflow/runs/<runId>/delivery-plan.md when available.',
    ]))
    expect(developmentImplement?.instructions).toContain('Leader -> Coder Subagent -> Reviewer Subagent -> Leader Decision')
    expect(developmentImplement?.instructions).toContain('Leader -> Coder Subagent task packet must include exactly these fields')
    expect(developmentImplement?.instructions).toContain('Coder must return exactly these fields')
    expect(developmentImplement?.instructions).toContain('Reviewer must return exactly these fields')
    expect(developmentImplement?.instructions).toContain('Leader must never silently skip Reviewer')
    expect(developmentImplement?.instructions).toContain('fallback-contract behavior')
    expect(developmentImplement?.handoffRules.join('\n')).toContain('Scenario Validation must use the scenarioCases and validationPlan from .workflow/work-order.md')
    expect(developmentImplement?.executionRules.join('\n')).toContain('Do not start long-running app preview servers')
    expect(developmentImplement?.completionCriteria).toMatchObject({
      description: expect.stringContaining('Stage 4 can complete only when'),
    })
    expect(developmentValidation).toMatchObject({
      name: expect.any(String),
      outputArtifacts: expect.arrayContaining([
        expect.objectContaining({ id: 'quality-report', filename: '.workflow/runs/<runId>/quality-report.md' }),
        expect.objectContaining({ id: 'acceptance-review', filename: '.workflow/runs/<runId>/acceptance-review.md' }),
        expect.objectContaining({ id: 'run-report', filename: '.workflow/run-report.md' }),
      ]),
      runtimeContract: expect.objectContaining({
        allowedActions: expect.arrayContaining(['bounded-test', 'subagent-qa', 'subagent-acceptance-reviewer']),
        forbiddenActions: expect.arrayContaining(['production edits', 'Coder Subagent repair', 'skipping QA', 'skipping Acceptance Reviewer']),
        toolAccess: expect.objectContaining({
          allowed: expect.arrayContaining(['Read', 'Glob', 'Grep', 'LS', 'Bash', 'PowerShell', 'Agent', 'AskUserQuestion', 'workflow_template_authoring', 'submit_phase_completion']),
          requiresExplicitUserConfirmation: expect.arrayContaining(['installDependencies', 'databaseInit', 'migrations', 'seedOverwrite', 'delete', 'network', 'deploy']),
        }),
      }),
      toolPolicy: expect.objectContaining({
        disallowedTools: expect.arrayContaining(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']),
      }),
      subagentPolicy: expect.objectContaining({
        allowedRoles: expect.arrayContaining(['qa', 'acceptance-reviewer']),
        sequence: ['qa', 'acceptance-reviewer'],
        maxParallel: 1,
        reviewerReadOnly: true,
        qaRequiredReturn: ['qaStatus', 'scenarioResults', 'commandsRun', 'failedCommands', 'notRunScenarios', 'blockers', 'risks', 'summary', 'readyForAcceptanceReview'],
        acceptanceReviewerRequiredReturn: ['reviewStatus', 'acceptanceCoverage', 'scenarioCoverage', 'userFacingCopyStatus', 'permissionDataRiskStatus', 'nonGoalCompliance', 'hiddenFailureRisk', 'riskLevel', 'issues', 'requiredFixes', 'optionalImprovements', 'readyForPreview', 'summary'],
      }),
    })
    expect(developmentValidation?.instructions).toContain('Stage 5 is product-level scenario QA and acceptance review')
    expect(developmentValidation?.instructions).toContain('QA Subagent task packet must include exactly')
    expect(developmentValidation?.instructions).toContain('Acceptance Reviewer must return exactly')
    expect(developmentValidation?.executionRules.join('\n')).toContain('Do not write production code')
    expect(developmentValidation?.completionCriteria.description).toContain('readyForPreview is recorded')
    expect(developmentValidation?.skillBindings).toContain('codex:test-generation')
    expect(developmentValidation?.skillBindings).not.toContain('codex:edit-and-test')
    expect(developmentPreview).toMatchObject({
      outputArtifacts: expect.arrayContaining([
        expect.objectContaining({ id: 'run-preview', filename: '.workflow/runs/<runId>/run-preview.md' }),
        expect.objectContaining({ id: 'run-report', filename: '.workflow/run-report.md' }),
      ]),
      runtimeContract: expect.objectContaining({
        allowedActions: expect.arrayContaining(['read', 'artifact', 'question', 'preview-start', 'preview-stop', 'bounded-log-read']),
        forbiddenActions: expect.arrayContaining(['production edits', 'Coder Subagent repair', 'auto-fixing preview failures', 'finish without preview confirmation']),
        toolAccess: expect.objectContaining({
          allowed: expect.arrayContaining(['Read', 'Glob', 'Grep', 'LS', 'Bash', 'PowerShell', 'AskUserQuestion', 'workflow_template_authoring', 'submit_phase_completion']),
          requiresExplicitUserConfirmation: expect.arrayContaining(['installDependencies', 'databaseInit', 'migrations', 'seedOverwrite', 'delete', 'network', 'deploy']),
        }),
      }),
      toolPolicy: expect.objectContaining({
        disallowedTools: expect.arrayContaining(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']),
      }),
    })
    expect(developmentPreview?.instructions).toContain('Stage 6 is local preview and user acceptance only')
    expect(developmentPreview?.instructions).toContain('Do not repair in Stage 6')
    expect(developmentPreview?.completionCriteria.description).toContain('Stop App is available')

    expect(developmentFinish).toMatchObject({
      name: expect.any(String),
      outputArtifacts: expect.arrayContaining([
        expect.objectContaining({ id: 'handoff', filename: '.workflow/runs/<runId>/handoff.md' }),
        expect.objectContaining({ id: 'run-report', filename: '.workflow/run-report.md' }),
        expect.objectContaining({ id: 'project-context', filename: '.workflow/project-context.md' }),
        expect.objectContaining({ id: 'work-order', filename: '.workflow/work-order.md' }),
      ]),
      runtimeContract: expect.objectContaining({
        allowedActions: expect.arrayContaining(['read', 'artifact', 'handoff', 'memory-update', 'question']),
        forbiddenActions: expect.arrayContaining(['production edits', 'running tests', 'starting preview server', 'auto-start follow-up workflow']),
        toolAccess: expect.objectContaining({
          allowed: expect.arrayContaining(['Read', 'Glob', 'Grep', 'LS', 'AskUserQuestion', 'workflow_template_authoring', 'submit_phase_completion']),
          forbidden: expect.arrayContaining(['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'PowerShell', 'Agent']),
        }),
      }),
      toolPolicy: expect.objectContaining({
        disallowedTools: expect.arrayContaining(['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'PowerShell', 'Agent']),
      }),
      skillBindings: expect.arrayContaining(['superpowers:finishing-a-development-branch', 'workflow:memory-update']),
    })
    expect(developmentFinish?.instructions).toContain('Ask exactly one structured next-step question')
    expect(developmentFinish?.completionCriteria.description).toContain('no production files were edited')

    const featureTemplate = result.templates.find((template) => template.id === 'feature-extension-workflow-v8')
    const featureImplement = featureTemplate?.phases.find((phase) => phase.id === 'feature-implement')
    const featureValidation = featureTemplate?.phases.find((phase) => phase.id === 'feature-quality-preview')
    expect(featureImplement).toMatchObject({
      name: 'Implement + Reviewer Subagents',
      runtimeContract: expect.objectContaining({
        allowedActions: expect.arrayContaining(['subagent-coder', 'subagent-reviewer']),
      }),
    })
    expect(featureImplement?.executionRules.join('\n')).toContain('Do not ask the user to manually run commands or view the app')
    expect(featureValidation).toMatchObject({
      name: 'Scenario Validation + Repair + Start / Stop Preview',
      runtimeContract: expect.objectContaining({
        allowedActions: expect.arrayContaining(['bounded-repair', 'preview-start', 'preview-stop', 'subagent-qa']),
      }),
    })
    expect(featureValidation?.executionRules.join('\n')).toContain('Run multiple scenario cases')

    const debugTemplate = result.templates.find((template) => template.id === 'debug-repair-workflow-v8')
    const debugFix = debugTemplate?.phases.find((phase) => phase.id === 'debug-fix')
    const debugValidation = debugTemplate?.phases.find((phase) => phase.id === 'debug-quality-preview')
    const debugFinish = debugTemplate?.phases.find((phase) => phase.id === 'debug-finish-memory')
    expect(debugFix).toMatchObject({
      runtimeContract: expect.objectContaining({
        allowedActions: expect.arrayContaining(['subagent-coder']),
      }),
    })
    expect(debugValidation).toMatchObject({
      runtimeContract: expect.objectContaining({
        allowedActions: expect.arrayContaining(['bounded-repair', 'preview-start', 'preview-stop', 'subagent-qa']),
      }),
    })
    expect(debugFinish).toMatchObject({
      runtimeContract: expect.objectContaining({
        allowedActions: expect.arrayContaining(['read', 'artifact', 'handoff', 'question']),
        forbiddenActions: expect.arrayContaining(['production edits', 'auto-start follow-up workflow']),
      }),
    })
    expect(debugFinish?.executionRules.join('\n')).toContain('Do not perform production repair in this phase')
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

  test('refreshes stale seeded editable default template display metadata from builtins', async () => {
    await writeWorkflowConfig(tempConfigDir, {
      schemaVersion: 1,
      seededEditableDefaultTemplateIds: [
        'efficient-constrained-dev-debug-workflow-v5',
        'feature-extension-workflow-v8',
        'debug-repair-workflow-v8',
      ],
      templates: [
        validWorkflowConfigTemplate({
          id: 'debug-repair-workflow-v8',
          version: '8',
          name: 'Debug Repair Workflow',
          description: 'Focused workflow for reproducing, fixing, validating, previewing, and closing bugs.',
          phases: [validPhase({ id: 'debug-memory-intake', name: 'Inherit Context + Debug Intake' })],
        }),
        validWorkflowConfigTemplate({
          id: 'feature-extension-workflow-v8',
          version: '8',
          name: 'Feature Extension Workflow',
          description: 'Lightweight follow-up workflow for extending an existing project with inherited .workflow memory.',
          phases: [validPhase({ id: 'feature-memory-plan', name: 'Inherit Context + Mini Scope' })],
        }),
      ],
    })

    const result = await new WorkflowTemplateRegistryService().listTemplates()

    expect(result.invalidTemplates).toEqual([])
    expect(result.templates).toContainEqual(expect.objectContaining({
      id: 'debug-repair-workflow-v8',
      source: 'user',
      name: expect.any(String),
      description: 'Focused workflow for reproducing, fixing, validating, previewing, and closing bugs.',
    }))
    expect(result.templates).toContainEqual(expect.objectContaining({
      id: 'feature-extension-workflow-v8',
      source: 'user',
      name: expect.any(String),
      description: 'Lightweight follow-up workflow for extending an existing project with inherited .workflow memory.',
    }))
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

    const persisted = await readStoredWorkflowFromZip(expectedTemplate.id)
    expect(persisted).toMatchObject({
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

    const persisted = await readStoredWorkflowFromZip(expectedTemplate.id)

    expect(persisted).toMatchObject({
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
    })
    expect(persisted.phases[0]).not.toHaveProperty('runtimeState')
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
      }))
      expect(catalog.find((entry) => entry.name === 'project-phase-helper')?.sourcePath.replace(/\\/g, '/'))
        .toMatch(/\.claude\/skills\/project-phase-helper\/SKILL\.md$/)
    } finally {
      process.chdir(originalCwd)
      await fs.rm(tempProjectDir, { recursive: true, force: true })
    }
  })

  test('collects skills from CLAUDE_APP_ROOT when current working directory is outside the repo', async () => {
    const originalCwd = process.cwd()
    const tempAppRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), 'cc-jiangxia-workflow-app-root-'),
    )
    const tempOutsideCwd = await fs.mkdtemp(
      path.join(os.tmpdir(), 'cc-jiangxia-workflow-outside-cwd-'),
    )
    try {
      const bundledSkillDir = path.join(tempAppRoot, 'src', 'skills', 'bundled', 'app-root-helper')
      const managedSkillDir = path.join(tempAppRoot, '.codex', 'skills', 'managed-helper')
      await fs.mkdir(bundledSkillDir, { recursive: true })
      await fs.mkdir(managedSkillDir, { recursive: true })
      await fs.writeFile(
        path.join(bundledSkillDir, 'SKILL.md'),
        [
          '---',
          'name: app-root-helper',
          'description: Bundled app-root helper',
          '---',
          'Use this bundled helper for workflow phases.',
          '',
        ].join('\n'),
        'utf-8',
      )
      await fs.writeFile(
        path.join(managedSkillDir, 'SKILL.md'),
        [
          '---',
          'name: managed-helper',
          'description: Managed helper',
          '---',
          'Use this managed helper for workflow phases.',
          '',
        ].join('\n'),
        'utf-8',
      )
      process.env.CLAUDE_APP_ROOT = tempAppRoot
      process.chdir(tempOutsideCwd)

      const catalog = await collectTemplateSkillCatalog()

      expect(catalog).toContainEqual(expect.objectContaining({
        name: 'app-root-helper',
        source: 'bundled',
      }))
      expect(catalog).toContainEqual(expect.objectContaining({
        name: 'managed-helper',
        source: 'managed',
      }))
      expect(catalog.find((entry) => entry.name === 'app-root-helper')?.sourcePath.replace(/\\/g, '/'))
        .toMatch(/src\/skills\/bundled\/app-root-helper\/SKILL\.md$/)
    } finally {
      process.chdir(originalCwd)
      await fs.rm(tempAppRoot, { recursive: true, force: true })
      await fs.rm(tempOutsideCwd, { recursive: true, force: true })
    }
  })



  test('discovers imported pack-installed skills through aliases and reference mappings', async () => {
    const skillDir = path.join(tempConfigDir, 'skills', 'pack-installed-helper')
    await fs.mkdir(skillDir, { recursive: true })
    await fs.writeFile(
      path.join(skillDir, 'SKILL.md'),
      [
        '---',
        'name: pack-installed-helper',
        'referenceId: pack-installed-helper',
        '---',
        'Use the pack installed helper.',
        '',
      ].join('\\n'),
      'utf-8',
    )
    await fs.writeFile(
      path.join(skillDir, '.cc-jiangxia-pack.json'),
      `${JSON.stringify({
        schemaVersion: 1,
        packId: 'pack-aliases',
        originalSkillId: 'workflow:pack-helper',
        aliases: ['workflow:pack-helper', 'pack-helper-alias'],
        referenceMappings: [
          {
            workflowId: 'pack-alias-skill-template',
            phaseId: 'draft',
            field: 'skills',
            reference: 'workflow:pack-helper',
            name: 'pack-helper',
            namespace: 'workflow',
            referenceId: 'workflow:pack-helper',
          },
          {
            workflowId: 'pack-alias-skill-template',
            phaseId: 'draft',
            field: 'skillBindings',
            reference: 'workflow:pack-helper',
            name: 'workflow:pack-helper',
            namespace: 'workflow',
            referenceId: 'workflow:pack-helper',
          },
        ],
      }, null, 2)}
`,
      'utf-8',
    )
    await writeWorkflowConfig(tempConfigDir, {
      schemaVersion: 1,
      templates: [
        validWorkflowConfigTemplate({
          id: 'pack-alias-skill-template',
          version: '1',
          name: 'Pack Alias Skill Template',
          phases: [
            validPhase({
              id: 'draft',
              name: 'Draft',
              skills: [
                {
                  name: 'pack-helper',
                  source: 'user',
                  namespace: 'workflow',
                  referenceId: 'workflow:pack-helper',
                },
              ],
              skillBindings: ['workflow:pack-helper'],
            }),
          ],
        }),
      ],
    })

    const catalog = await collectTemplateSkillCatalog()
    expect(catalog).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'pack-helper',
        source: 'user',
        namespace: 'workflow',
        referenceId: 'workflow:pack-helper',
        packId: 'pack-aliases',
        packSkillIdentity: 'workflow:pack-helper',
      }),
      expect.objectContaining({
        name: 'workflow:pack-helper',
        source: 'user',
        namespace: 'workflow',
        referenceId: 'workflow:pack-helper',
        packId: 'pack-aliases',
      }),
    ]))

    const result = await new WorkflowTemplateRegistryService().listTemplates()

    expect(result.templates.map((template) => template.id)).toContain('pack-alias-skill-template')
    expect(result.invalidTemplates).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        templateId: 'pack-alias-skill-template',
        code: 'WORKFLOW_PHASE_SKILL_MISSING',
      }),
    ]))
  })

  test('collects installed Superpowers plugin skills with workflow-prefixed ids', async () => {
    const skillDir = path.join(
      tempConfigDir,
      'plugins',
      'cache',
      'openai-curated-remote',
      'superpowers',
      '5.1.4',
      'skills',
      'brainstorming',
    )
    await fs.mkdir(skillDir, { recursive: true })
    await fs.writeFile(
      path.join(skillDir, 'SKILL.md'),
      [
        '---',
        'name: brainstorming',
        'description: Superpowers brainstorming',
        '---',
        'Use brainstorming before creative work.',
        '',
      ].join('\n'),
      'utf-8',
    )

    const catalog = await collectTemplateSkillCatalog()

    expect(catalog).toContainEqual(expect.objectContaining({
      name: 'superpowers:brainstorming',
      source: 'superpowers',
      pluginName: 'superpowers',
      namespace: 'superpowers',
      referenceId: 'superpowers:brainstorming',
    }))
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

      expect(userAuthoredTemplates(result).map((template) => template.id)).toEqual([
        'extended-agent-development',
      ])
      expect(result.templates.map((template) => template.id)).not.toContain(
        'template-from-other-profile',
      )
    } finally {
      await fs.rm(otherProfile, { recursive: true, force: true })
    }
  })

  test('reports malformed workflow config without adding user templates', async () => {
    await installFixture('malformed-workflows.json')

    const result = await new WorkflowTemplateRegistryService().listTemplates()

    expect(userAuthoredTemplates(result)).toEqual([])
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

    await new WorkflowTemplateRegistryService().writeTemplates([validTemplate()])

    expect(await fs.readFile(configPath, 'utf-8')).toBe(originalMalformedContent)
    expect(await readStoredWorkflowFromZip('draft-workflow')).toMatchObject({
      id: 'draft-workflow',
    })
  })

  test('excludes missing config fields, empty phase arrays, and duplicate phase ids', async () => {
    await installFixture('invalid-user-workflows.json')

    const result = await new WorkflowTemplateRegistryService().listTemplates()

    expect(userAuthoredTemplates(result)).toEqual([])
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

    expect(userAuthoredTemplates(result)).toEqual([])
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

    expect(userAuthoredTemplates(result)).toEqual([])
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
    expect(await readJsonIfExists(path.join(tempConfigDir, 'cc-jiangxia', 'workflows.json'))).toBeUndefined()
    expect(await readStoredWorkflowFromZip('agent-development')).toMatchObject({
      id: 'agent-development',
      name: 'User Owned Agent Development',
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

    expect(userAuthoredTemplates(result)).toEqual([])
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

    expect(userAuthoredTemplates(result)).toEqual([])
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

    expect(userAuthoredTemplates(result)).toEqual([])
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
    expect(userAuthoredTemplates(await service.listTemplates())).toEqual([])

    await service.writeTemplates([validTemplate()])

    expect(userAuthoredTemplates(await service.listTemplates()).map((template) => template.id)).toEqual([
      'draft-workflow',
    ])
  })
})
