import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import { ApiError } from '../middleware/errorHandler.js'
import { sanitizePath as sanitizePortablePath } from '../../utils/sessionStoragePortable.js'
import {
  WorkflowTemplateRegistryService,
  type WorkflowTemplateRegistryTemplate,
} from './workflowTemplateRegistryService.js'
import { WorkflowSessionStateService } from './workflowSessionStateService.js'
import type {
  WorkflowSessionCreateOptions,
  WorkflowSessionMetadata,
  WorkflowSessionState,
  WorkflowSessionSummary,
  WorkflowTemplate,
} from './workflowTypes.js'
import {
  stateToWorkflowMetadata,
  workflowSummaryFromMetadata,
} from './workflowSummary.js'

const WORKFLOW_CREATE_KEYS = new Set(['templateId', 'templateSource', 'initialPhaseId'])

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
      workflow.templateSource !== 'user'
    ) {
      throw workflowError(400, 'WORKFLOW_TEMPLATE_INVALID', 'workflow.templateSource must be builtin or user')
    }

    if (
      workflow.initialPhaseId !== undefined &&
      (typeof workflow.initialPhaseId !== 'string' || workflow.initialPhaseId.trim().length === 0)
    ) {
      throw workflowError(400, 'WORKFLOW_TRANSITION_INVALID', 'workflow.initialPhaseId must be a non-empty string')
    }

    const registry = await this.registryService.listTemplates()
    const candidates = registry.templates.filter((template) =>
      template.id === workflow.templateId &&
      (workflow.templateSource === undefined || template.source === workflow.templateSource)
    )

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
  ): Promise<WorkflowSessionSummary> {
    const now = new Date().toISOString()
    const templateSnapshot = this.toWorkflowTemplate(registryTemplate)
    const templateSnapshotId = `${registryTemplate.id}-v${registryTemplate.version}`
    const phases = registryTemplate.phases.map((phase, index) => ({
      id: phase.id,
      index,
      status: 'created' as const,
      artifactPointers: [],
    }))
    const phaseRuns = registryTemplate.phases.map((phase, index) => ({
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
    const state = {
      schemaVersion: 1,
      sessionId,
      mode: 'workflow',
      template: {
        id: registryTemplate.id,
        version: registryTemplate.version,
        source: registryTemplate.source,
        snapshotId: templateSnapshotId,
        sourceState: 'current',
      },
      templateSnapshot,
      templateIdentity: {
        id: registryTemplate.id,
        source: registryTemplate.source,
        version: registryTemplate.version,
        registryKey: `${registryTemplate.source}:${registryTemplate.id}`,
      },
      sourceTemplateStatus: 'current',
      status: 'created',
      workflowStatus: 'created',
      activePhaseId: registryTemplate.phases[0]?.id ?? null,
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
    } satisfies WorkflowSessionState

    const { pointer } = await this.stateService.writeState(sessionId, state)
    const metadata = stateToWorkflowMetadata(state, pointer)
    await this.appendWorkflowMetadata(sessionId, workDir, metadata)
    return workflowSummaryFromMetadata(metadata)
  }

  private toWorkflowTemplate(template: WorkflowTemplateRegistryTemplate): WorkflowTemplate {
    return {
      schemaVersion: template.schemaVersion,
      id: template.id,
      source: template.source,
      version: template.version,
      displayName: template.name,
      description: template.description,
      phases: template.phases.map((phase) => ({
        id: phase.id,
        label: phase.name,
        instructions: phase.instructions,
        requestedModel: typeof phase.requestedModel === 'string' ? phase.requestedModel : null,
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
        ...(phase.phasePrompt ? { phasePrompt: phase.phasePrompt } : {}),
      })),
      registryKey: `${template.source}:${template.id}`,
    }
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
