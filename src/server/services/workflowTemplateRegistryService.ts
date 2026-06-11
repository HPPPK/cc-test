import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { getAppStoragePath } from '../../utils/appIdentity.js'
import { getProjectDirsUpToHome } from '../../utils/markdownConfigLoader.js'

import {
  BUILTIN_WORKFLOW_PHASE_ACTION_POLICIES,
} from './workflowToolPolicy.js'
import {
  WORKFLOW_TEMPLATE_BUILTIN_ID,
  WORKFLOW_TEMPLATE_SCHEMA_VERSION,
  isNonEmptyString,
  isRecord,
  validateAndNormalizeUserConfigTemplate,
  workflowTemplateValidationWarning,
  type WorkflowTemplateRegistryPhase,
  type WorkflowTemplateRegistryTemplate,
  type WorkflowTemplateValidationIssue,
} from './workflowTemplateValidation.js'
import {
  resolveWorkflowPhaseSkills,
  type WorkflowPhaseSkillCatalogEntry,
} from './workflowPhaseSkillResolver.js'
import type {
  WorkflowPhaseActionPolicy,
  WorkflowPhasePrompt,
  WorkflowPhaseSkillSource,
} from './workflowTypes.js'

export type {
  WorkflowTemplateRegistryCompletionCriteria,
  WorkflowTemplateRegistryOutputArtifact,
  WorkflowTemplateRegistryPhase,
  WorkflowTemplateRegistryRequiredArtifact,
  WorkflowTemplateRegistrySkillDeclaration,
  WorkflowTemplateRegistryTemplate,
  WorkflowTemplateRegistryTransitionPolicy,
  WorkflowTemplateValidationIssue,
} from './workflowTemplateValidation.js'

export type WorkflowTemplateRegistryListResult = {
  templates: WorkflowTemplateRegistryTemplate[]
  invalidTemplates: WorkflowTemplateValidationIssue[]
}

type WorkflowConfigFile = {
  schemaVersion: 1
  templates?: unknown[]
  [key: string]: unknown
}

const BUILTIN_TEMPLATE_ID = WORKFLOW_TEMPLATE_BUILTIN_ID
const USER_CONFIG_SCHEMA_VERSION = WORKFLOW_TEMPLATE_SCHEMA_VERSION
const TEMPLATE_VALIDATION_SUPPORTED_SKILL_SOURCES: WorkflowPhaseSkillSource[] = [
  'user',
  'project',
  'plugin',
  'managed',
  'bundled',
  'unknown',
]

const BUILTIN_WORKFLOW_PHASE_PROMPTS: Record<string, WorkflowPhasePrompt> = {
  discussion: {
    objective: 'Clarify and freeze the requested outcome before technical design.',
    handoffInput: [
      'Use the user request and conversation context as the initial input.',
      'If required decisions are missing, ask concise clarification questions before producing the handoff.',
    ],
    executionRules: [
      'Discuss requirements, constraints, preferences, acceptance criteria, assumptions, and out-of-scope items only.',
      'Record explicit assumptions when the user asks the agent to decide.',
      'Do not design architecture, split implementation tasks, or write implementation code.',
    ],
    outputArtifact: {
      name: 'Requirements Brief',
      sections: [
        'User Goal',
        'Confirmed Requirements',
        'User Choices',
        'Assumptions',
        'Acceptance Criteria',
        'Out of Scope',
        'Open Questions',
      ],
    },
    completionRules: [
      'Output the discussion brief and stop.',
      'State that the discussion phase is ready to complete.',
      'Do not enter specify until the workflow transition is explicitly confirmed.',
    ],
  },
  specify: {
    objective: 'Convert the confirmed discussion outcome into planning-ready requirements.',
    handoffInput: [
      'Start by validating the discussion brief from the previous phase.',
      'If the brief is missing, contradictory, or has unresolved open questions, stop and request correction before specifying.',
    ],
    executionRules: [
      'Write explicit requirements, acceptance criteria, constraints, assumptions, and non-goals.',
      'Keep requirements testable and inside the accepted discussion decisions.',
      'Do not design architecture, split implementation tasks, edit files, or start implementation.',
    ],
    outputArtifact: {
      name: 'Specification Brief',
      sections: [
        'User Goal',
        'Requirements',
        'Acceptance Criteria',
        'Constraints',
        'Assumptions',
        'Non-Goals',
        'Open Questions',
      ],
    },
    completionRules: [
      'Output the Specification Brief and stop.',
      'State that the specify phase is ready to complete.',
      'Do not enter plan until the workflow transition is explicitly confirmed.',
    ],
  },
  plan: {
    objective: 'Design the implementation approach, ownership boundaries, risks, and validation strategy.',
    handoffInput: [
      'Start by validating the Specification Brief from the previous phase.',
      'If the specification is not specific enough to design against, stop and request correction before planning.',
    ],
    executionRules: [
      'Use read-only code inspection to identify existing patterns, affected modules, state surfaces, risks, and validation routes.',
      'Compare alternatives when useful and recommend one approach.',
      'Do not create an implementation task list, edit files, or start implementation.',
    ],
    outputArtifact: {
      name: 'Technical Plan',
      sections: [
        'Specification Basis',
        'Recommended Approach',
        'Affected Areas',
        'Data / State / API Changes',
        'Key Risks',
        'Validation Strategy',
        'Rejected Alternatives',
      ],
    },
    completionRules: [
      'Output the Technical Plan and stop.',
      'State that the plan phase is ready to complete.',
      'Do not enter tasks until the workflow transition is explicitly confirmed.',
    ],
  },
  tasks: {
    objective: 'Turn the approved technical plan into dependency-aware implementation tasks.',
    handoffInput: [
      'Start by validating the Technical Plan from the previous phase.',
      'If the plan is not specific enough to name files, tests, validation commands, and dependencies, stop and request correction before tasking.',
    ],
    executionRules: [
      'Break the approved plan into ordered implementation tasks with file scope, tests, validation, dependencies, and completion criteria.',
      'Keep tasks inside the approved requirements and plan.',
      'Do not create, edit, or delete project files and do not start implementation.',
    ],
    outputArtifact: {
      name: 'Task Breakdown',
      sections: [
        'Ordered Tasks',
        'File Scope',
        'Tests Required',
        'Validation Commands',
        'Dependencies',
        'Completion Criteria',
        'Do Not Change',
      ],
    },
    completionRules: [
      'Output the Task Breakdown and stop.',
      'State that the tasks phase is ready to complete.',
      'Do not enter implement until the workflow transition is explicitly confirmed.',
    ],
  },
  implement: {
    objective: 'Execute the approved implementation plan with scoped code, tests, and validation evidence.',
    handoffInput: [
      'Start by validating the Task Breakdown from the previous phase.',
      'If the plan is missing, ambiguous, or conflicts with the repository, stop and request a return to Phase 2 or Phase 3 before changing scope.',
    ],
    executionRules: [
      'Create, edit, or delete only files directly required by the approved plan.',
      'Write same-area tests for changed behavior and run focused verification while implementing.',
      'Fix defects found inside the approved scope; do not add new product scope or unrelated refactors.',
    ],
    outputArtifact: {
      name: 'Implementation Report',
      sections: [
        'Completed Tasks',
        'Changed Files',
        'Tests Added / Updated',
        'Commands Run',
        'Results',
        'Deviations From Plan',
        'Known Risks',
      ],
    },
    completionRules: [
      'Output the Implementation Report and stop.',
      'State that the implement phase is ready to complete when focused validation evidence exists.',
    ],
  },
}

const BUILTIN_AGENT_DEVELOPMENT_PHASE_ACTION_POLICIES: Record<string, WorkflowPhaseActionPolicy> = {
  discussion: BUILTIN_WORKFLOW_PHASE_ACTION_POLICIES['requirements-clarification'],
  specify: BUILTIN_WORKFLOW_PHASE_ACTION_POLICIES['requirements-clarification'],
  plan: BUILTIN_WORKFLOW_PHASE_ACTION_POLICIES['technical-design'],
  tasks: BUILTIN_WORKFLOW_PHASE_ACTION_POLICIES['implementation-planning'],
  implement: BUILTIN_WORKFLOW_PHASE_ACTION_POLICIES.implementation,
}

const builtinTemplate: WorkflowTemplateRegistryTemplate = {
  schemaVersion: 1,
  id: BUILTIN_TEMPLATE_ID,
  source: 'builtin',
  version: '1',
  name: 'Agent Development',
  description: 'Discussion to implementation workflow',
  phases: [
    {
      id: 'discussion',
      name: 'Discussion',
      instructions: 'Explore goals, constraints, options, non-goals, and decisions before formal specification.',
      skills: [],
      requiredArtifacts: [],
      completionCriteria: {
        type: 'manual-checklist',
        description: 'The user goal, constraints, accepted decisions, and open questions are captured.',
      },
      transition: { authority: 'user-confirmation' },
      actionPolicy: BUILTIN_AGENT_DEVELOPMENT_PHASE_ACTION_POLICIES.discussion,
      phasePrompt: BUILTIN_WORKFLOW_PHASE_PROMPTS.discussion,
    },
    {
      id: 'specify',
      name: 'Specify',
      instructions: 'Convert the discussion outcome into planning-ready requirements and acceptance criteria.',
      skills: [],
      requiredArtifacts: [],
      completionCriteria: {
        type: 'manual-checklist',
        description: 'Requirements are explicit, testable, and ready for planning.',
      },
      transition: { authority: 'user-confirmation' },
      actionPolicy: BUILTIN_AGENT_DEVELOPMENT_PHASE_ACTION_POLICIES.specify,
      phasePrompt: BUILTIN_WORKFLOW_PHASE_PROMPTS.specify,
    },
    {
      id: 'plan',
      name: 'Plan',
      instructions: 'Design the implementation approach, ownership boundaries, data contracts, risks, and validation strategy.',
      skills: [],
      requiredArtifacts: [],
      completionCriteria: {
        type: 'manual-checklist',
        description: 'The technical plan names affected surfaces, risks, and verification routes.',
      },
      transition: { authority: 'user-confirmation' },
      actionPolicy: BUILTIN_AGENT_DEVELOPMENT_PHASE_ACTION_POLICIES.plan,
      phasePrompt: BUILTIN_WORKFLOW_PHASE_PROMPTS.plan,
    },
    {
      id: 'tasks',
      name: 'Tasks',
      instructions: 'Break the approved plan into dependency-aware implementation tasks with write scopes and validation.',
      skills: [],
      requiredArtifacts: [],
      completionCriteria: {
        type: 'manual-checklist',
        description: 'Tasks are independently executable, scoped, and ordered.',
      },
      transition: { authority: 'user-confirmation' },
      actionPolicy: BUILTIN_AGENT_DEVELOPMENT_PHASE_ACTION_POLICIES.tasks,
      phasePrompt: BUILTIN_WORKFLOW_PHASE_PROMPTS.tasks,
    },
    {
      id: 'implement',
      name: 'Implement',
      instructions: 'Execute the approved tasks with tests, validation evidence, and scoped handoff.',
      skills: [],
      requiredArtifacts: [],
      completionCriteria: {
        type: 'agent-reported',
        description: 'Implementation work is complete with changed files, validation evidence, and remaining risk recorded.',
      },
      transition: { authority: 'user-confirmation' },
      actionPolicy: BUILTIN_AGENT_DEVELOPMENT_PHASE_ACTION_POLICIES.implement,
      phasePrompt: BUILTIN_WORKFLOW_PHASE_PROMPTS.implement,
    },
  ],
}

function cloneTemplate(template: WorkflowTemplateRegistryTemplate): WorkflowTemplateRegistryTemplate {
  return JSON.parse(JSON.stringify(template)) as WorkflowTemplateRegistryTemplate
}

function getConfigDir(): string {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
}

function getWorkflowConfigPath(): string {
  return getAppStoragePath(getConfigDir(), 'workflows.json')
}

function errnoCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined
}

function parseUserConfig(raw: string, filePath: string): {
  config: WorkflowConfigFile | null
  issues: WorkflowTemplateValidationIssue[]
} {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    return {
      config: null,
      issues: [
        {
          source: 'user-config',
          path: '$',
          code: 'WORKFLOW_CONFIG_MALFORMED',
          message: `Workflow config is malformed JSON: ${error instanceof Error ? error.message : String(error)}`,
          severity: 'error',
        },
      ],
    }
  }

  if (!isRecord(parsed)) {
    return {
      config: null,
      issues: [
        {
          source: 'user-config',
          path: '$',
          code: 'WORKFLOW_CONFIG_MALFORMED',
          message: `Workflow config at ${filePath} must be a JSON object.`,
          severity: 'error',
        },
      ],
    }
  }

  if (parsed.schemaVersion !== USER_CONFIG_SCHEMA_VERSION) {
    return {
      config: null,
      issues: [
        {
          source: 'user-config',
          path: '$.schemaVersion',
          code: 'WORKFLOW_CONFIG_MALFORMED',
          message: 'Workflow config schemaVersion must be 1.',
          severity: 'error',
        },
      ],
    }
  }

  if ('templates' in parsed && !Array.isArray(parsed.templates)) {
    return {
      config: null,
      issues: [
        {
          source: 'user-config',
          path: '$.templates',
          code: 'WORKFLOW_CONFIG_MALFORMED',
          message: 'Workflow config templates must be an array when present.',
          severity: 'error',
        },
      ],
    }
  }

  return {
    config: {
      ...parsed,
      schemaVersion: USER_CONFIG_SCHEMA_VERSION,
      templates: Array.isArray(parsed.templates) ? parsed.templates : [],
    },
    issues: [],
  }
}

async function readUserConfig(configPath: string): Promise<{
  config: WorkflowConfigFile | null
  issues: WorkflowTemplateValidationIssue[]
  missing: boolean
}> {
  let raw: string
  try {
    raw = await fs.readFile(configPath, 'utf-8')
  } catch (error) {
    if (errnoCode(error) === 'ENOENT') {
      return { config: null, issues: [], missing: true }
    }
    throw error
  }

  return { ...parseUserConfig(raw, configPath), missing: false }
}

function assertValidWritePayload(
  templates: unknown[],
  existingIssues: WorkflowTemplateValidationIssue[],
): void {
  if (existingIssues.length > 0) {
    throw new Error(`Workflow config is invalid and cannot be overwritten: ${existingIssues[0]?.code ?? 'WORKFLOW_CONFIG_INVALID'}`)
  }

  const validationResults = templates.map((template, index) =>
    validateAndNormalizeUserConfigTemplate(template, index),
  )
  const issues = validationResults.flatMap((result) => result.issues)
  const ids = new Map<string, number>()
  validationResults.forEach(({ template }) => {
    if (!template) return
    ids.set(template.id, (ids.get(template.id) ?? 0) + 1)
  })
  for (const [id, count] of ids) {
    if (count <= 1) continue
    issues.push({
      source: 'user-config',
      path: '$.templates',
      code: 'WORKFLOW_TEMPLATE_DUPLICATE_ID',
      message: 'User template ids must be unique.',
      templateId: id,
      severity: 'error',
    })
  }

  if (issues.length > 0) {
    throw new Error(`Workflow template payload is invalid: ${issues[0]?.code ?? 'WORKFLOW_TEMPLATE_INVALID'}`)
  }
}

function mergePhaseUnknownFields(
  nextPhase: unknown,
  existingPhase: unknown,
): unknown {
  if (!isRecord(nextPhase) || !isRecord(existingPhase)) return nextPhase

  const existingSkills = Array.isArray(existingPhase.skills) ? existingPhase.skills : []
  const nextSkills = Array.isArray(nextPhase.skills)
    ? nextPhase.skills.map((skill, skillIndex) => {
        const existingSkill = isRecord(skill) && isNonEmptyString(skill.name)
          ? existingSkills.find((candidate) => isRecord(candidate) && candidate.name === skill.name)
          : existingSkills[skillIndex]
        return isRecord(skill) && isRecord(existingSkill)
          ? { ...existingSkill, ...skill }
          : skill
      })
    : existingPhase.skills

  const existingArtifacts = Array.isArray(existingPhase.requiredArtifacts)
    ? existingPhase.requiredArtifacts
    : []
  const nextArtifacts = Array.isArray(nextPhase.requiredArtifacts)
    ? nextPhase.requiredArtifacts.map((artifact, artifactIndex) => {
        const existingArtifact = isRecord(artifact) && isNonEmptyString(artifact.id)
          ? existingArtifacts.find((candidate) => isRecord(candidate) && candidate.id === artifact.id)
          : existingArtifacts[artifactIndex]
        return isRecord(artifact) && isRecord(existingArtifact)
          ? { ...existingArtifact, ...artifact }
          : artifact
      })
    : existingPhase.requiredArtifacts

  return {
    ...existingPhase,
    ...nextPhase,
    ...(isRecord(existingPhase.completionCriteria) && isRecord(nextPhase.completionCriteria)
      ? { completionCriteria: { ...existingPhase.completionCriteria, ...nextPhase.completionCriteria } }
      : {}),
    ...(isRecord(existingPhase.transition) && isRecord(nextPhase.transition)
      ? { transition: { ...existingPhase.transition, ...nextPhase.transition } }
      : {}),
    skills: nextSkills,
    requiredArtifacts: nextArtifacts,
  }
}

function mergeTemplateUnknownFields(
  nextTemplate: unknown,
  existingTemplate: unknown,
): unknown {
  if (!isRecord(nextTemplate) || !isRecord(existingTemplate)) return nextTemplate

  const existingPhases = Array.isArray(existingTemplate.phases)
    ? existingTemplate.phases
    : []
  const nextPhases = Array.isArray(nextTemplate.phases)
    ? nextTemplate.phases.map((phase) => {
        if (!isRecord(phase) || !isNonEmptyString(phase.id)) return phase
        const existingPhase = existingPhases.find((candidate) =>
          isRecord(candidate) && candidate.id === phase.id
        )
        return mergePhaseUnknownFields(phase, existingPhase)
      })
    : nextTemplate.phases

  return {
    ...existingTemplate,
    ...nextTemplate,
    phases: nextPhases,
  }
}

let cachedRegistry: WorkflowTemplateRegistryListResult | null = null
let cachedConfigPath: string | null = null

export function resetWorkflowTemplateRegistryForTests(): void {
  cachedRegistry = null
  cachedConfigPath = null
}

export class WorkflowTemplateRegistryService {
  async listTemplates(): Promise<WorkflowTemplateRegistryListResult> {
    const configPath = getWorkflowConfigPath()
    if (cachedRegistry && cachedConfigPath === configPath) {
      return {
        templates: cachedRegistry.templates.map(cloneTemplate),
        invalidTemplates: cachedRegistry.invalidTemplates.map((templateIssue) => ({ ...templateIssue })),
      }
    }

    const result = await this.loadTemplates(configPath)
    cachedRegistry = {
      templates: result.templates.map(cloneTemplate),
      invalidTemplates: result.invalidTemplates.map((templateIssue) => ({ ...templateIssue })),
    }
    cachedConfigPath = configPath

    return result
  }

  async writeTemplates(templates: unknown[]): Promise<void> {
    const configPath = getWorkflowConfigPath()
    const { config, issues } = await readUserConfig(configPath)
    assertValidWritePayload(templates, issues)
    const existingConfig: WorkflowConfigFile = config ?? {
      schemaVersion: USER_CONFIG_SCHEMA_VERSION,
      templates: [],
    }
    const existingTemplates = Array.isArray(existingConfig.templates)
      ? existingConfig.templates
      : []

    const nextTemplates = templates.map((template) => {
      if (!isRecord(template) || !isNonEmptyString(template.id)) return template
      const existingTemplate = existingTemplates.find((candidate) =>
        isRecord(candidate) && candidate.id === template.id
      )
      return mergeTemplateUnknownFields(template, existingTemplate)
    })

    const nextConfig: WorkflowConfigFile = {
      ...existingConfig,
      schemaVersion: USER_CONFIG_SCHEMA_VERSION,
      templates: nextTemplates,
    }

    await fs.mkdir(path.dirname(configPath), { recursive: true })
    await fs.writeFile(configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, 'utf-8')

    resetWorkflowTemplateRegistryForTests()
  }

  private async loadTemplates(configPath: string): Promise<WorkflowTemplateRegistryListResult> {
    const templates = [cloneTemplate(builtinTemplate)]
    const invalidTemplates: WorkflowTemplateValidationIssue[] = []

    const { config, issues, missing } = await readUserConfig(configPath)
    if (missing) {
      return { templates, invalidTemplates }
    }
    invalidTemplates.push(...issues)
    if (!config) {
      return { templates, invalidTemplates }
    }

    const byId = new Map<string, WorkflowTemplateRegistryTemplate[]>()
    const validationResults = config.templates?.map((template, index) =>
      validateAndNormalizeUserConfigTemplate(template, index),
    ) ?? []

    for (const [index, { template, issues: templateIssues }] of validationResults.entries()) {
      invalidTemplates.push(...templateIssues)
      if (!template || templateIssues.length > 0) continue
      invalidTemplates.push(...await resolveTemplatePhaseSkillIssues(template, index))
      const existing = byId.get(template.id) ?? []
      existing.push(template)
      byId.set(template.id, existing)
    }

    for (const [id, matchingTemplates] of byId) {
      if (matchingTemplates.length <= 1) continue
      invalidTemplates.push({
        source: 'user-config',
        path: '$.templates',
        code: 'WORKFLOW_TEMPLATE_DUPLICATE_ID',
        message: 'User template ids must be unique.',
        templateId: id,
        severity: 'error',
      })
    }

    for (const [id, matchingTemplates] of byId) {
      if (matchingTemplates.length === 1 && id !== BUILTIN_TEMPLATE_ID) {
        templates.push(matchingTemplates[0])
      }
    }

    return { templates, invalidTemplates }
  }
}

async function resolveTemplatePhaseSkillIssues(
  template: WorkflowTemplateRegistryTemplate,
  templateIndex: number,
): Promise<WorkflowTemplateValidationIssue[]> {
  const issues: WorkflowTemplateValidationIssue[] = []
  const catalog = await collectTemplateSkillCatalog()

  for (const [phaseIndex, phase] of template.phases.entries()) {
    if (phase.skills.length === 0) continue

    const result = await resolveWorkflowPhaseSkills({
      templateId: template.id,
      phaseId: phase.id,
      references: phase.skills,
      catalog,
      supportedSources: TEMPLATE_VALIDATION_SUPPORTED_SKILL_SOURCES,
    })

    result.resolutions.forEach((resolution, skillIndex) => {
      const diagnostic = resolution.diagnostic
      if (!diagnostic || diagnostic.severity === 'info') return
      issues.push(workflowTemplateValidationWarning(
        'user-config',
        `$.templates[${templateIndex}].phases[${phaseIndex}].skills[${skillIndex}]`,
        diagnostic.code,
        diagnostic.message,
        template.id,
      ))
    })
  }

  return issues
}

export async function collectTemplateSkillCatalog(): Promise<WorkflowPhaseSkillCatalogEntry[]> {
  const catalog: WorkflowPhaseSkillCatalogEntry[] = []
  const seen = new Set<string>()
  const roots: Array<{ path: string; source: WorkflowPhaseSkillSource }> = [
    { path: path.join(process.cwd(), '.codex', 'skills'), source: 'managed' },
    { path: path.join(process.cwd(), '.agents', 'skills'), source: 'managed' },
    { path: path.join(process.cwd(), 'src', 'skills', 'bundled'), source: 'bundled' },
    { path: path.join(getConfigDir(), 'skills'), source: 'user' },
    ...getProjectDirsUpToHome('skills', process.cwd()).map((skillsPath) => ({
      path: skillsPath,
      source: 'project' as const,
    })),
  ]

  for (const root of roots) {
    let entries: import('node:fs').Dirent[]
    try {
      entries = await fs.readdir(root.path, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      if ((!entry.isDirectory() && !entry.isSymbolicLink()) || entry.name.startsWith('.')) {
        continue
      }
      const skillFile = path.join(root.path, entry.name, 'SKILL.md')
      try {
        const stat = await fs.stat(skillFile)
        if (!stat.isFile()) continue
      } catch {
        continue
      }

      const key = `${root.source}:${entry.name}`
      if (seen.has(key)) continue
      seen.add(key)
      catalog.push({
        name: entry.name,
        source: root.source,
        sourcePath: skillFile,
      })
    }
  }

  return catalog
}
