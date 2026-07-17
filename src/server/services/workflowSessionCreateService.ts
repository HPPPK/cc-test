import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import { ApiError } from '../middleware/errorHandler.js'
import { sanitizePath as sanitizePortablePath } from '../../utils/sessionStoragePortable.js'
import {
  collectTemplateSkillCatalog,
  WorkflowTemplateRegistryService,
  type WorkflowTemplateRegistryTemplate,
  type WorkflowTemplateRegistryPhase,
} from './workflowTemplateRegistryService.js'
import { resolveWorkflowPhaseSkills } from './workflowPhaseSkillResolver.js'
import { WorkflowSessionStateService } from './workflowSessionStateService.js'
import type {
  EffortMode,
  WorkflowLabel,
  WorkflowBrainstormingMode,
  WorkflowArtifactPointer,
  WorkflowPhaseSkillReference,
  WorkflowPhaseSkillSnapshot,
  WorkflowRoutingMode,
  WorkflowSessionCreateOptions,
  WorkflowSessionMetadata,
  WorkflowSessionState,
  WorkflowSessionSummary,
  WorkflowTemplate,
} from './workflowTypes.js'
import {
  WORKFLOW_EFFORT_MODES,
  WORKFLOW_BRAINSTORMING_MODES,
  WORKFLOW_LABELS,
} from './workflowTypes.js'
import {
  stateToWorkflowMetadata,
  workflowSummaryFromMetadata,
} from './workflowSummary.js'
import {
  phaseAppliesToRoute,
  routeWorkflowTask,
} from './workflowTaskRouter.js'
import {
  ensureMandatoryWorkflowArtifacts,
} from './workflowRuntimeEnforcement.js'
import {
  resolveWorkflowSkillBindings,
} from './workflowSkillRegistry.js'
import { validateWorkflowWorkspaceRoot } from './workflowWorkspacePolicy.js'
import {
  collectWorkflowExpertMaterials,
  EXPERT_MATERIALS_ARTIFACT_ID,
  makeWorkflowExpertMaterialsStartupPrompt,
} from './workflowExpertMaterialService.js'

const WORKFLOW_CREATE_KEYS = new Set([
  'templateId',
  'templateSource',
  'initialPhaseId',
  'request',
  'selectedFiles',
  'repoMetadata',
  'errors',
  'logs',
  'testOutput',
  'labels',
  'effort',
  'routingMode',
  'brainstormingMode',
])
const WORKFLOW_PHASE_SKILL_RESOLVER_VERSION = 'workflow-phase-skill-resolver-v1'
const BUILTIN_AGENT_DEVELOPMENT_PHASE_SKILLS: Record<string, WorkflowPhaseSkillReference[]> = {
  discussion: [{ name: 'sp-discussion', mode: 'recommended', source: 'managed' }],
  specify: [{ name: 'sp-specify', mode: 'recommended', source: 'managed' }],
  plan: [{ name: 'sp-plan', mode: 'recommended', source: 'managed' }],
  tasks: [{ name: 'sp-tasks', mode: 'recommended', source: 'managed' }],
  implement: [{ name: 'sp-implement', mode: 'recommended', source: 'managed' }],
}

class WorkflowSessionCreateError extends ApiError {
  constructor(statusCode: number, code: string, message: string) {
    super(statusCode, message, code)
  }
}

type WorkflowSessionCreateServiceOptions = {
  registryService?: WorkflowTemplateRegistryService
  stateService?: WorkflowSessionStateService
}

function configDir(): string {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
}

function workflowError(statusCode: number, code: string, message: string): WorkflowSessionCreateError {
  return new WorkflowSessionCreateError(statusCode, code, message)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isWorkflowLabelArray(value: unknown): value is WorkflowLabel[] {
  return Array.isArray(value) &&
    value.every((item) => typeof item === 'string' && (WORKFLOW_LABELS as readonly string[]).includes(item))
}

function appendArtifactPointer(
  state: WorkflowSessionState,
  pointer: WorkflowArtifactPointer,
): WorkflowSessionState['artifactIndex'] {
  if (Array.isArray(state.artifactIndex)) {
    return state.artifactIndex.some((item) => item.artifactId === pointer.artifactId)
      ? state.artifactIndex
      : [...state.artifactIndex, pointer]
  }
  return {
    ...(state.artifactIndex ?? {}),
    [pointer.artifactId]: pointer,
  }
}

function appendActivePhaseInputRef(
  state: WorkflowSessionState,
  pointer: WorkflowArtifactPointer,
): WorkflowSessionState['phaseRuns'] {
  return state.phaseRuns.map((phaseRun) => {
    if (phaseRun.phaseId !== state.activePhaseId) return phaseRun
    if (phaseRun.inputArtifactRefs.some((ref) => ref.artifactId === pointer.artifactId)) return phaseRun
    return {
      ...phaseRun,
      inputArtifactRefs: [...phaseRun.inputArtifactRefs, pointer],
    }
  })
}

function shouldRouteWorkflow(
  template: WorkflowTemplateRegistryTemplate,
  workflowOptions?: WorkflowSessionCreateOptions,
): boolean {
  return template.schemaVersion === 2 ||
    Boolean(
      workflowOptions?.request ||
      workflowOptions?.labels?.length ||
      workflowOptions?.effort ||
      workflowOptions?.routingMode,
    )
}

function resolveWorkflowRoute(
  template: WorkflowTemplateRegistryTemplate,
  workflowOptions?: WorkflowSessionCreateOptions,
): {
  labels: WorkflowLabel[]
  secondaryLabels: WorkflowLabel[]
  effort?: EffortMode
  routingMode?: WorkflowRoutingMode
  brainstormingMode?: WorkflowBrainstormingMode
  router?: ReturnType<typeof routeWorkflowTask>
  applicablePhases: WorkflowTemplateRegistryPhase[]
  skippedPhases: Array<{ phaseId: string; reason: string }>
} {
  if (!shouldRouteWorkflow(template, workflowOptions)) {
    return {
      labels: [],
      secondaryLabels: [],
      applicablePhases: template.phases,
      skippedPhases: [],
    }
  }

  const requestedLabels = Array.isArray(workflowOptions?.labels) ? workflowOptions.labels : []
  const request = workflowOptions?.request ?? ''
  const baseRouter = routeWorkflowTask({
    request,
    selectedFiles: workflowOptions?.selectedFiles,
    repoMetadata: workflowOptions?.repoMetadata,
    errors: workflowOptions?.errors,
    logs: workflowOptions?.logs,
    testOutput: workflowOptions?.testOutput,
    forcedLabel: requestedLabels[0],
  })
  const labels = Array.from(new Set([
    ...(requestedLabels.length ? requestedLabels : [baseRouter.primaryLabel]),
    ...baseRouter.secondaryLabels,
  ]))
  const secondaryLabels = labels.filter((label) => label !== labels[0])
  const effort = workflowOptions?.effort ?? baseRouter.effort
  const routingMode = workflowOptions?.routingMode ?? 'manual'
  const brainstormingMode = workflowOptions?.brainstormingMode ?? 'auto'
  const skippedPhases: Array<{ phaseId: string; reason: string }> = []
  const applicablePhases = template.phases.filter((phase) => {
    const result = phaseAppliesToRoute({
      phase,
      labels,
      effort,
    })
    if (!result.applies) {
      skippedPhases.push({ phaseId: phase.id, reason: result.reason ?? 'Skipped by workflow route.' })
    }
    return result.applies
  })
  const router = template.routingPolicy?.router
    ? {
        ...baseRouter,
        effort,
        suggestedPath: applicablePhases.map((phase) => phase.id),
      }
    : baseRouter

  return {
    labels,
    secondaryLabels,
    effort,
    routingMode,
    brainstormingMode,
    router,
    applicablePhases,
    skippedPhases,
  }
}

export class WorkflowSessionCreateService {
  private readonly registryService: WorkflowTemplateRegistryService
  private readonly stateService: WorkflowSessionStateService

  constructor(options: WorkflowSessionCreateServiceOptions = {}) {
    this.registryService = options.registryService ?? new WorkflowTemplateRegistryService()
    this.stateService = options.stateService ?? new WorkflowSessionStateService()
  }

  async resolveTemplate(
    workflow: WorkflowSessionCreateOptions,
  ): Promise<WorkflowTemplateRegistryTemplate> {
    if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow)) {
      throw workflowError(400, 'WORKFLOW_TEMPLATE_INVALID', 'workflow must be an object')
    }

    for (const key of Object.keys(workflow)) {
      if (!WORKFLOW_CREATE_KEYS.has(key)) {
        throw workflowError(400, 'WORKFLOW_TEMPLATE_INVALID', `Unsupported workflow field: ${key}`)
      }
    }

    if (typeof workflow.templateId !== 'string' || workflow.templateId.trim().length === 0) {
      throw workflowError(400, 'WORKFLOW_TEMPLATE_INVALID', 'workflow.templateId is required')
    }

    if (
      workflow.templateSource !== undefined &&
      workflow.templateSource !== 'builtin' &&
      workflow.templateSource !== 'user' &&
      workflow.templateSource !== 'pack'
    ) {
      throw workflowError(400, 'WORKFLOW_TEMPLATE_INVALID', 'workflow.templateSource must be builtin, user, or pack')
    }

    if (
      workflow.initialPhaseId !== undefined &&
      (typeof workflow.initialPhaseId !== 'string' || workflow.initialPhaseId.trim().length === 0)
    ) {
      throw workflowError(400, 'WORKFLOW_TRANSITION_INVALID', 'workflow.initialPhaseId must be a non-empty string')
    }
    if (workflow.request !== undefined && typeof workflow.request !== 'string') {
      throw workflowError(400, 'WORKFLOW_TEMPLATE_INVALID', 'workflow.request must be a string')
    }
    if (workflow.selectedFiles !== undefined && !isStringArray(workflow.selectedFiles)) {
      throw workflowError(400, 'WORKFLOW_TEMPLATE_INVALID', 'workflow.selectedFiles must be an array of strings')
    }
    if (workflow.labels !== undefined && !isWorkflowLabelArray(workflow.labels)) {
      throw workflowError(400, 'WORKFLOW_TEMPLATE_INVALID', 'workflow.labels contains an unsupported label')
    }
    if (workflow.effort !== undefined && !(WORKFLOW_EFFORT_MODES as readonly string[]).includes(workflow.effort)) {
      throw workflowError(400, 'WORKFLOW_TEMPLATE_INVALID', 'workflow.effort must be auto, light, standard, or heavy')
    }
    if (
      workflow.routingMode !== undefined &&
      workflow.routingMode !== 'manual' &&
      workflow.routingMode !== 'auto-confirm' &&
      workflow.routingMode !== 'auto'
    ) {
      throw workflowError(400, 'WORKFLOW_TEMPLATE_INVALID', 'workflow.routingMode must be manual, auto-confirm, or auto')
    }
    if (
      workflow.brainstormingMode !== undefined &&
      !(WORKFLOW_BRAINSTORMING_MODES as readonly string[]).includes(workflow.brainstormingMode)
    ) {
      throw workflowError(400, 'WORKFLOW_TEMPLATE_INVALID', 'workflow.brainstormingMode must be auto, on, or off')
    }

    const registry = await this.registryService.listTemplates()
    let candidates = registry.templates.filter((template) =>
      template.id === workflow.templateId &&
      (workflow.templateSource === undefined || template.source === workflow.templateSource)
    )

    if (candidates.length === 0 && workflow.templateSource === 'builtin') {
      candidates = registry.templates.filter((template) =>
        template.id === workflow.templateId && (template.source === 'user' || template.source === 'pack')
      )
    }

    if (candidates.length === 0) {
      throw workflowError(400, 'WORKFLOW_TEMPLATE_NOT_FOUND', 'Workflow template not found')
    }
    if (candidates.length > 1) {
      throw workflowError(400, 'WORKFLOW_TEMPLATE_CONFLICT', 'Workflow template resolution is ambiguous')
    }

    const template = candidates[0]!
    const firstPhaseId = template.phases[0]?.id
    if (!firstPhaseId) {
      throw workflowError(400, 'WORKFLOW_TEMPLATE_INVALID', 'Workflow template has no startable phases')
    }
    if (workflow.initialPhaseId !== undefined && workflow.initialPhaseId !== firstPhaseId) {
      throw workflowError(400, 'WORKFLOW_TRANSITION_INVALID', 'initialPhaseId must name the first workflow phase')
    }

    return template
  }

  async createWorkflowSessionMetadata(
    sessionId: string,
    workDir: string,
    registryTemplate: WorkflowTemplateRegistryTemplate,
    workflowOptions?: WorkflowSessionCreateOptions,
  ): Promise<WorkflowSessionSummary> {
    const workspaceValidation = validateWorkflowWorkspaceRoot(workDir)
    if (!workspaceValidation.valid) {
      throw workflowError(400, 'WORKFLOW_WORKSPACE_INVALID', workspaceValidation.message)
    }

    const now = new Date().toISOString()
    const route = resolveWorkflowRoute(registryTemplate, workflowOptions)
    const templatePhases = route.applicablePhases.length ? route.applicablePhases : registryTemplate.phases
    const runtimeTemplate = this.toWorkflowTemplate(registryTemplate, templatePhases)
    const templateVersionId = `${registryTemplate.id}-v${registryTemplate.version}`
    const phaseSkillSnapshots = await this.createPhaseSkillSnapshots(runtimeTemplate, now)
    const phases = templatePhases.map((phase, index) => ({
      id: phase.id,
      label: phase.name,
      transitionAuthority: phase.transition.authority,
      index,
      status: 'created' as const,
      artifactPointers: [],
    }))
    const phaseRuns = templatePhases.map((phase, index) => ({
      phaseId: phase.id,
      index,
      status: 'created' as const,
      startedAt: null,
      completedAt: null,
      instructionsProvenance: {
        templateId: registryTemplate.id,
        templateVersion: registryTemplate.version,
        phaseId: phase.id,
      },
      inputArtifactRefs: [],
      outputArtifactRefs: [],
      completionChecks: [],
      modelResolution: null,
      skillProvenance: [],
      blockedReason: null,
    }))
    const firstRunId = `${sessionId}-run-1`
    const installedSkillIds = await installedWorkflowSkillIdsForCreate()
    const initialSkillBindingStatus = resolveWorkflowSkillBindings(runtimeTemplate.phases[0]?.skillBindings, {
      installedSkillIds,
      allowFallbackContracts: runtimeTemplate.source !== 'pack',
    })
    const initialState = {
      schemaVersion: 1,
      sessionId,
      mode: 'workflow',
      templateSnapshot: runtimeTemplate,
      template: {
        id: registryTemplate.id,
        version: registryTemplate.version,
        source: registryTemplate.source,
        snapshotId: templateVersionId,
        sourceState: 'current',
      },
      templateIdentity: {
        id: registryTemplate.id,
        source: registryTemplate.source,
        version: registryTemplate.version,
        registryKey: `${registryTemplate.source}:${registryTemplate.id}`,
      },
      sourceTemplateStatus: 'current',
      status: 'created',
      workflowStatus: 'created',
      runStatus: 'draft',
      activePhaseId: templatePhases[0]?.id ?? null,
      workspaceRoot: workDir,
      activeWorkflowRunId: firstRunId,
      ...(route.labels.length ? { labels: route.labels } : {}),
      ...(route.secondaryLabels.length ? { secondaryLabels: route.secondaryLabels } : {}),
      ...(route.effort ? { effort: route.effort } : {}),
      ...(route.routingMode ? { routingMode: route.routingMode } : {}),
      ...(route.brainstormingMode ? { brainstormingMode: route.brainstormingMode } : {}),
      ...(route.router ? { router: route.router } : {}),
      ...(route.skippedPhases.length ? { skippedPhases: route.skippedPhases } : {}),
      phases,
      phaseRuns,
      transitionHistory: [],
      artifactIndex: [],
      finalReportRef: null,
      stateVersion: 1,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      pendingConfirmation: null,
      ...(phaseSkillSnapshots.length ? { phaseSkillSnapshots } : {}),
      ...(initialSkillBindingStatus.length ? { skillBindingStatus: initialSkillBindingStatus } : {}),
      workflowRuns: [
        {
          id: firstRunId,
          templateId: registryTemplate.id,
          status: 'draft',
          ...(route.labels[0] ? { primaryLabel: route.labels[0] } : {}),
          ...(route.secondaryLabels.length ? { secondaryLabels: route.secondaryLabels } : {}),
          ...(route.effort ? { effort: route.effort } : {}),
          workspaceRoot: workDir,
          currentPhaseId: templatePhases[0]?.id ?? undefined,
          artifacts: [],
          history: [
            {
              type: 'created',
              at: now,
              summary: 'Workflow run created.',
            },
          ],
          createdAt: now,
          updatedAt: now,
        },
      ],
    } satisfies WorkflowSessionState
    const state = ensureMandatoryWorkflowArtifacts(initialState, {
      request: workflowOptions?.request ?? '',
      selectedFiles: workflowOptions?.selectedFiles,
      repoMetadata: workflowOptions?.repoMetadata,
      errors: workflowOptions?.errors,
      logs: workflowOptions?.logs,
      testOutput: workflowOptions?.testOutput,
      now,
    })

    let persisted = await this.stateService.writeState(sessionId, state)
    const expertMaterials = await collectWorkflowExpertMaterials(
      workDir,
      workflowOptions?.repoMetadata,
    ).catch((error) => {
      throw workflowError(
        400,
        'WORKFLOW_TEMPLATE_INVALID',
        error instanceof Error ? error.message : String(error),
      )
    })

    if (expertMaterials) {
      const artifact = await this.stateService.writePhaseArtifact(sessionId, {
        schemaVersion: 1,
        sessionId,
        phaseId: 'startup',
        artifactId: EXPERT_MATERIALS_ARTIFACT_ID,
        lifecycleStatus: 'accepted',
        type: 'text-summary',
        createdAt: now,
        title: 'Selected expert materials',
        content: expertMaterials,
        provenance: {
          messageId: 'expert-materials:' + expertMaterials.materials.map((material) => material.runId).join(','),
        },
      })
      const expertStartupPrompt = makeWorkflowExpertMaterialsStartupPrompt(expertMaterials)
      persisted = await this.stateService.updateState(sessionId, (current) => ({
        ...current,
        startupPrompt: [current.startupPrompt, expertStartupPrompt].filter(Boolean).join('\n\n'),
        artifactIndex: appendArtifactPointer(current, artifact.pointer),
        phaseRuns: appendActivePhaseInputRef(current, artifact.pointer),
        updatedAt: now,
      }))
    }

    const metadata = stateToWorkflowMetadata(persisted.state, persisted.pointer)
    await this.appendWorkflowMetadata(sessionId, workDir, metadata)
    return workflowSummaryFromMetadata(metadata)
  }

  private toWorkflowTemplate(
    template: WorkflowTemplateRegistryTemplate,
    phases: WorkflowTemplateRegistryPhase[] = template.phases,
  ): WorkflowTemplate {
    return {
      schemaVersion: template.schemaVersion,
      id: template.id,
      source: template.source,
      version: template.version,
      displayName: template.name,
      description: template.description,
      ...(template.labels ? { labels: template.labels } : {}),
      ...(template.routingPolicy ? { routingPolicy: template.routingPolicy } : {}),
      ...(template.stopConditions ? { stopConditions: template.stopConditions } : {}),
      phases: phases.map((phase) => {
        const skills = this.phaseSkillReferences(template, phase.id, phase.skills)
        return {
          id: phase.id,
          label: phase.name,
          instructions: phase.instructions,
          ...(phase.appliesTo ? { appliesTo: phase.appliesTo } : {}),
          ...(phase.skipWhen ? { skipWhen: phase.skipWhen } : {}),
          ...(phase.modePolicy ? { modePolicy: phase.modePolicy } : {}),
          requestedModel: typeof phase.requestedModel === 'string' ? phase.requestedModel : null,
          skills,
          ...(phase.skillBindings ? { skillBindings: phase.skillBindings } : {}),
          skillDeclarations: phase.skills.map((skill) => ({
            ...skill,
            source: 'template',
            guidance: skill.reason || '',
          })),
          requiredArtifacts: phase.requiredArtifacts.map((artifact) => ({
            ...artifact,
            kind: 'json',
            description: artifact.description || artifact.name || artifact.id,
          })),
          completionCriteria: phase.completionCriteria,
          transitionAuthority: phase.transition.authority,
          ...(phase.actionPolicy ? { actionPolicy: phase.actionPolicy } : {}),
          ...(phase.toolPolicy ? { toolPolicy: phase.toolPolicy } : {}),
          ...(phase.intent ? { intent: phase.intent } : {}),
          ...(phase.contract ? { contract: phase.contract } : {}),
          ...(phase.evidencePolicy ? { evidencePolicy: phase.evidencePolicy } : {}),
          ...(phase.phasePrompt ? { phasePrompt: phase.phasePrompt } : {}),
          ...(phase.runtimeContract ? { runtimeContract: phase.runtimeContract } : {}),
          ...(phase.outputArtifacts ? { outputArtifacts: phase.outputArtifacts } : {}),
        }
      }),
      registryKey: `${template.source}:${template.id}`,
      ...(template.contentHash ? { contentHash: template.contentHash } : {}),
      ...(typeof template.packId === 'string' ? { packId: template.packId } : {}),
      ...(typeof template.packName === 'string' ? { packName: template.packName } : {}),
      ...(typeof template.packVersion === 'string' ? { packVersion: template.packVersion } : {}),
      ...(typeof template.packEntrypoint === 'string' ? { packEntrypoint: template.packEntrypoint } : {}),
    }
  }

  private phaseSkillReferences(
    template: WorkflowTemplateRegistryTemplate,
    phaseId: string,
    skills: WorkflowPhaseSkillReference[],
  ): WorkflowPhaseSkillReference[] {
    if (skills.length > 0) return skills
    if (template.id !== 'agent-development' || template.source !== 'builtin') return []
    return BUILTIN_AGENT_DEVELOPMENT_PHASE_SKILLS[phaseId] ?? []
  }

  private async createPhaseSkillSnapshots(
    template: WorkflowTemplate,
    snapshottedAt: string,
  ): Promise<WorkflowPhaseSkillSnapshot[]> {
    const phasesWithSkills = template.phases.filter((phase) => phase.skills?.length)
    if (phasesWithSkills.length === 0) return []

    const catalog = await collectTemplateSkillCatalog()
    const snapshots: WorkflowPhaseSkillSnapshot[] = []
    for (const phase of phasesWithSkills) {
      const references = phase.skills ?? []
      const result = await resolveWorkflowPhaseSkills({
        templateId: template.id,
        phaseId: phase.id,
        references,
        catalog,
        requiredPackId: template.source === 'pack' ? template.packId : undefined,
        checkedAt: snapshottedAt,
      })
      snapshots.push({
        phaseId: phase.id,
        references: result.resolutions.map((resolution) => resolution.reference),
        resolutions: result.resolutions,
        snapshottedAt,
        ...(template.contentHash ? { templateContentHash: template.contentHash } : {}),
        resolverVersion: WORKFLOW_PHASE_SKILL_RESOLVER_VERSION,
      })
    }
    return snapshots
  }

  async appendWorkflowMetadata(
    sessionId: string,
    workDir: string,
    workflow: WorkflowSessionMetadata,
  ): Promise<void> {
    const projectDir = sanitizePortablePath(workDir)
    const filePath = path.join(configDir(), 'projects', projectDir, `${sessionId}.jsonl`)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.appendFile(
      filePath,
      `${JSON.stringify({
        type: 'session-meta',
        isMeta: true,
        workDir,
        workflow,
        timestamp: workflow.updatedAt,
      })}\n`,
      'utf-8',
    )
  }
}


async function installedWorkflowSkillIdsForCreate(): Promise<Set<string>> {
  const catalog = await collectTemplateSkillCatalog()
  const ids = new Set<string>()
  for (const entry of catalog) {
    ids.add(entry.name)
    if (entry.referenceId) ids.add(entry.referenceId)
    for (const alias of entry.aliases ?? []) ids.add(alias)
  }
  return ids
}
