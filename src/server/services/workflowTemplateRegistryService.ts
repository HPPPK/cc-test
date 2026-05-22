import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import {
  BUILTIN_WORKFLOW_PHASE_ACTION_POLICIES,
} from './workflowToolPolicy.js'
import type {
  WorkflowPhaseActionPolicy,
  WorkflowPhasePrompt,
  WorkflowTemplateSource,
} from './workflowTypes.js'

export type WorkflowTemplateValidationIssue = {
  source: 'user-config' | 'builtin'
  templateId?: string
  path: string
  code: string
  message: string
  severity: 'error' | 'warning'
}

export type WorkflowTemplateRegistrySkillDeclaration = {
  name: string
  source?: 'user' | 'project' | 'builtin' | 'unknown'
  reason?: string
  [key: string]: unknown
}

export type WorkflowTemplateRegistryRequiredArtifact = {
  id: string
  name?: string
  description?: string
  required: boolean
  [key: string]: unknown
}

export type WorkflowTemplateRegistryCompletionCriteria = {
  type: 'manual-checklist' | 'artifact-required' | 'agent-reported'
  description: string
  [key: string]: unknown
}

export type WorkflowTemplateRegistryTransitionPolicy = {
  authority: 'auto' | 'user-confirmation'
  [key: string]: unknown
}

export type WorkflowTemplateRegistryPhase = {
  id: string
  name: string
  instructions: string
  requestedModel?: unknown
  skills: WorkflowTemplateRegistrySkillDeclaration[]
  requiredArtifacts: WorkflowTemplateRegistryRequiredArtifact[]
  completionCriteria: WorkflowTemplateRegistryCompletionCriteria
  transition: WorkflowTemplateRegistryTransitionPolicy
  actionPolicy?: WorkflowPhaseActionPolicy
  phasePrompt?: WorkflowPhasePrompt
  [key: string]: unknown
}

export type WorkflowTemplateRegistryTemplate = {
  schemaVersion: 1
  id: string
  source: WorkflowTemplateSource
  version: string
  name: string
  description: string
  phases: WorkflowTemplateRegistryPhase[]
  [key: string]: unknown
}

export type WorkflowTemplateRegistryListResult = {
  templates: WorkflowTemplateRegistryTemplate[]
  invalidTemplates: WorkflowTemplateValidationIssue[]
}

type WorkflowConfigFile = {
  schemaVersion: 1
  templates?: unknown[]
  [key: string]: unknown
}

const BUILTIN_TEMPLATE_ID = 'agent-development'
const USER_CONFIG_SCHEMA_VERSION = 1

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
  return path.join(getConfigDir(), 'cc-haha', 'workflows.json')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function errnoCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined
}

function issue(
  pathValue: string,
  code: string,
  message: string,
  templateId?: string,
): WorkflowTemplateValidationIssue {
  return {
    source: 'user-config',
    templateId,
    path: pathValue,
    code,
    message,
    severity: 'error',
  }
}

function normalizeRequiredArtifacts(value: unknown): WorkflowTemplateRegistryRequiredArtifact[] {
  if (!Array.isArray(value)) return []

  return value
    .filter(isRecord)
    .filter((artifact) => isNonEmptyString(artifact.id))
    .map((artifact) => ({
      ...artifact,
      id: artifact.id as string,
      name: isNonEmptyString(artifact.name) ? artifact.name : undefined,
      description: isNonEmptyString(artifact.description) ? artifact.description : undefined,
      required: typeof artifact.required === 'boolean' ? artifact.required : false,
    }))
}

function normalizeSkills(value: unknown): WorkflowTemplateRegistrySkillDeclaration[] {
  if (!Array.isArray(value)) return []

  return value
    .filter(isRecord)
    .filter((skill) => isNonEmptyString(skill.name))
    .map((skill) => ({
      ...skill,
      name: skill.name as string,
      source:
        skill.source === 'user' ||
        skill.source === 'project' ||
        skill.source === 'builtin' ||
        skill.source === 'unknown'
          ? skill.source
          : undefined,
      reason: isNonEmptyString(skill.reason) ? skill.reason : undefined,
    }))
}

function normalizeCompletionCriteria(value: unknown): WorkflowTemplateRegistryCompletionCriteria | null {
  if (!isRecord(value)) return null
  if (
    value.type !== 'manual-checklist' &&
    value.type !== 'artifact-required' &&
    value.type !== 'agent-reported'
  ) {
    return null
  }
  if (!isNonEmptyString(value.description)) return null

  return {
    ...value,
    type: value.type,
    description: value.description,
  }
}

function normalizeTransition(value: unknown): WorkflowTemplateRegistryTransitionPolicy | null {
  if (!isRecord(value)) return null
  if (value.authority !== 'auto' && value.authority !== 'user-confirmation') return null

  return {
    ...value,
    authority: value.authority,
  }
}

function normalizeActionPolicy(value: unknown): WorkflowPhaseActionPolicy | undefined {
  if (!isRecord(value)) return undefined
  const allowedActions = Array.isArray(value.allowedActions)
    ? value.allowedActions.filter(isNonEmptyString)
    : []
  const forbiddenActions = Array.isArray(value.forbiddenActions)
    ? value.forbiddenActions.filter(isNonEmptyString)
    : []

  if (allowedActions.length === 0 && forbiddenActions.length === 0) return undefined
  return {
    allowedActions,
    forbiddenActions,
  }
}

function normalizeStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(isNonEmptyString) : []
}

function normalizePhasePrompt(value: unknown): WorkflowPhasePrompt | undefined {
  if (!isRecord(value)) return undefined
  if (!isNonEmptyString(value.objective)) return undefined
  if (!isRecord(value.outputArtifact)) return undefined
  if (!isNonEmptyString(value.outputArtifact.name)) return undefined

  const handoffInput = normalizeStringList(value.handoffInput)
  const executionRules = normalizeStringList(value.executionRules)
  const sections = normalizeStringList(value.outputArtifact.sections)
  const completionRules = normalizeStringList(value.completionRules)

  if (
    handoffInput.length === 0 &&
    executionRules.length === 0 &&
    sections.length === 0 &&
    completionRules.length === 0
  ) {
    return undefined
  }

  return {
    objective: value.objective,
    handoffInput,
    executionRules,
    outputArtifact: {
      name: value.outputArtifact.name,
      sections,
    },
    completionRules,
  }
}

function validateLinearOnly(
  template: Record<string, unknown>,
  templatePath: string,
  templateId: string | undefined,
): WorkflowTemplateValidationIssue[] {
  const issues: WorkflowTemplateValidationIssue[] = []

  if ('parallelPhases' in template || 'parallel' in template) {
    issues.push(issue(
      templatePath,
      'WORKFLOW_TEMPLATE_PARALLEL_UNSUPPORTED',
      'Parallel workflow definitions are not supported in the first release.',
      templateId,
    ))
  }

  if ('workflows' in template || 'nestedWorkflows' in template || 'childWorkflows' in template) {
    issues.push(issue(
      templatePath,
      'WORKFLOW_TEMPLATE_NESTED_UNSUPPORTED',
      'Nested workflow definitions are not supported in the first release.',
      templateId,
    ))
  }

  const phases = Array.isArray(template.phases) ? template.phases : []
  phases.forEach((phase, phaseIndex) => {
    if (!isRecord(phase)) return
    const transition = isRecord(phase.transition) ? phase.transition : {}
    if ('branches' in transition || 'branch' in transition || 'next' in transition || 'edges' in transition) {
      issues.push(issue(
        `${templatePath}.phases[${phaseIndex}].transition`,
        'WORKFLOW_TEMPLATE_BRANCHING_UNSUPPORTED',
        'Branching workflow definitions are not supported in the first release.',
        templateId,
      ))
    }
    if ('loop' in transition || 'repeat' in transition || 'until' in transition) {
      issues.push(issue(
        `${templatePath}.phases[${phaseIndex}].transition`,
        'WORKFLOW_TEMPLATE_LOOP_UNSUPPORTED',
        'Loop workflow definitions are not supported in the first release.',
        templateId,
      ))
    }
  })

  return issues
}

function validateAndNormalizeUserTemplate(
  value: unknown,
  index: number,
): { template: WorkflowTemplateRegistryTemplate | null, issues: WorkflowTemplateValidationIssue[] } {
  const templatePath = `$.templates[${index}]`
  if (!isRecord(value)) {
    return {
      template: null,
      issues: [issue(templatePath, 'WORKFLOW_TEMPLATE_MISSING_REQUIRED_FIELD', 'Template must be an object.')],
    }
  }

  const templateId = isNonEmptyString(value.id) ? value.id : undefined
  const issues: WorkflowTemplateValidationIssue[] = []

  if (
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.version) ||
    !isNonEmptyString(value.name) ||
    !Array.isArray(value.phases)
  ) {
    issues.push(issue(
      templatePath,
      'WORKFLOW_TEMPLATE_MISSING_REQUIRED_FIELD',
      'Template requires id, version, name, and phases fields.',
      templateId,
    ))
  }

  if (isNonEmptyString(value.id) && /[\\/]/.test(value.id)) {
    issues.push(issue(
      `${templatePath}.id`,
      'WORKFLOW_TEMPLATE_INVALID_ID',
      'Template id must be a stable slug and cannot contain path separators.',
      templateId,
    ))
  }

  if (value.id === BUILTIN_TEMPLATE_ID) {
    issues.push(issue(
      `${templatePath}.id`,
      'WORKFLOW_TEMPLATE_BUILTIN_ID_CONFLICT',
      'User templates cannot shadow builtin template ids.',
      templateId,
    ))
  }

  if (!Array.isArray(value.phases) || value.phases.length === 0) {
    issues.push(issue(
      `${templatePath}.phases`,
      'WORKFLOW_TEMPLATE_INVALID_PHASES',
      'Template phases must be a non-empty ordered array.',
      templateId,
    ))
  }

  issues.push(...validateLinearOnly(value, templatePath, templateId))

  const normalizedPhases: WorkflowTemplateRegistryPhase[] = []
  const phaseIds = new Set<string>()
  if (Array.isArray(value.phases)) {
    value.phases.forEach((phase, phaseIndex) => {
      const phasePath = `${templatePath}.phases[${phaseIndex}]`
      if (!isRecord(phase)) {
        issues.push(issue(
          phasePath,
          'WORKFLOW_TEMPLATE_INVALID_PHASES',
          'Phase must be an object.',
          templateId,
        ))
        return
      }

      if (!isNonEmptyString(phase.id)) {
        issues.push(issue(
          `${phasePath}.id`,
          'WORKFLOW_TEMPLATE_MISSING_REQUIRED_FIELD',
          'Phase requires an id.',
          templateId,
        ))
      } else if (phaseIds.has(phase.id)) {
        issues.push(issue(
          `${phasePath}.id`,
          'WORKFLOW_PHASE_DUPLICATE_ID',
          'Phase ids must be unique within a template.',
          templateId,
        ))
      } else {
        phaseIds.add(phase.id)
      }

      if (!isNonEmptyString(phase.name) || !isNonEmptyString(phase.instructions)) {
        issues.push(issue(
          phasePath,
          'WORKFLOW_TEMPLATE_MISSING_REQUIRED_FIELD',
          'Phase requires name and instructions fields.',
          templateId,
        ))
      }

      const completionCriteria = normalizeCompletionCriteria(phase.completionCriteria)
      if (!completionCriteria) {
        issues.push(issue(
          `${phasePath}.completionCriteria`,
          'WORKFLOW_TEMPLATE_MISSING_REQUIRED_FIELD',
          'Phase requires valid completion criteria.',
          templateId,
        ))
      }

      const transition = normalizeTransition(phase.transition)
      if (!transition) {
        issues.push(issue(
          `${phasePath}.transition`,
          'WORKFLOW_TEMPLATE_MISSING_REQUIRED_FIELD',
          'Phase requires a valid transition authority.',
          templateId,
        ))
      }

      if (
        isNonEmptyString(phase.id) &&
        isNonEmptyString(phase.name) &&
        isNonEmptyString(phase.instructions) &&
        completionCriteria &&
        transition
      ) {
        const actionPolicy = normalizeActionPolicy(phase.actionPolicy)
        const phasePrompt = normalizePhasePrompt(phase.phasePrompt)
        normalizedPhases.push({
          ...phase,
          id: phase.id,
          name: phase.name,
          instructions: phase.instructions,
          skills: normalizeSkills(phase.skills),
          requiredArtifacts: normalizeRequiredArtifacts(phase.requiredArtifacts),
          completionCriteria,
          transition,
          ...(actionPolicy ? { actionPolicy } : {}),
          ...(phasePrompt ? { phasePrompt } : {}),
        })
      }
    })
  }

  if (issues.length > 0 || !templateId || !isNonEmptyString(value.version) || !isNonEmptyString(value.name)) {
    return { template: null, issues }
  }

  return {
    issues,
    template: {
      ...value,
      schemaVersion: USER_CONFIG_SCHEMA_VERSION,
      id: templateId,
      source: 'user',
      version: value.version,
      name: value.name,
      description: isNonEmptyString(value.description) ? value.description : '',
      phases: normalizedPhases,
    },
  }
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
    const { config, missing } = await readUserConfig(configPath)
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

    if (!missing || cachedConfigPath === configPath) {
      resetWorkflowTemplateRegistryForTests()
    }
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
      validateAndNormalizeUserTemplate(template, index),
    ) ?? []

    validationResults.forEach(({ template, issues: templateIssues }) => {
      invalidTemplates.push(...templateIssues)
      if (!template || templateIssues.length > 0) return
      const existing = byId.get(template.id) ?? []
      existing.push(template)
      byId.set(template.id, existing)
    })

    for (const [id, matchingTemplates] of byId) {
      if (matchingTemplates.length <= 1) continue
      invalidTemplates.push(issue(
        '$.templates',
        'WORKFLOW_TEMPLATE_DUPLICATE_ID',
        'User template ids must be unique.',
        id,
      ))
    }

    for (const [id, matchingTemplates] of byId) {
      if (matchingTemplates.length === 1 && id !== BUILTIN_TEMPLATE_ID) {
        templates.push(matchingTemplates[0])
      }
    }

    return { templates, invalidTemplates }
  }
}
