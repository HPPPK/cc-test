import { createHash } from 'node:crypto'
import { PackRegistryService } from './packRegistryService.js'
import type { WorkflowTemplateRegistryPhase, WorkflowTemplateRegistryTemplate } from './workflowTemplateValidation.js'
import type {
  WorkflowPhaseSkillReference,
  WorkflowSessionState,
  WorkflowTemplate,
} from './workflowTypes.js'

let testLoaderOverride: ((state: WorkflowSessionState) => Promise<WorkflowTemplate | null>) | null = null

/** Test-only dependency seam; production always uses the canonical stored ZIP loader. */
export function setWorkflowRuntimeTemplateLoaderForTests(
  loader: ((state: WorkflowSessionState) => Promise<WorkflowTemplate | null>) | null,
): void {
  testLoaderOverride = loader
}


const PINNED_WORKFLOW_IDS = new Set([
  'efficient-constrained-dev-debug-workflow-v5',
  'feature-extension-workflow-v8',
  'debug-repair-workflow-v8',
])

export function workflowTemplateSnapshotHash(template: WorkflowTemplate): string {
  return 'sha256-' + createHash('sha256').update(JSON.stringify(template)).digest('hex')
}

export function resolveWorkflowTemplateForRun(
  state: Pick<WorkflowSessionState, 'templateIdentity' | 'template' | 'templateSnapshot' | 'templateSnapshotHash' | 'sourceTemplateStatus'>,
  installedTemplate: WorkflowTemplate | null,
): WorkflowTemplate | null {
  const expectedId = state.templateIdentity?.id
    ?? (state.template && typeof state.template === 'object' && 'id' in state.template ? state.template.id : undefined)
  const expectedVersion = String(state.templateIdentity?.version ?? '')
  const snapshot = state.templateSnapshot

  if (snapshot) {
    const snapshotHash = workflowTemplateSnapshotHash(snapshot)
    const matchesIdentity = snapshot.id === expectedId && String(snapshot.version) === expectedVersion
    const matchesRecordedHash = !state.templateSnapshotHash || state.templateSnapshotHash === snapshotHash
    if (!matchesIdentity || !matchesRecordedHash) {
      state.sourceTemplateStatus = 'stale-template'
      return null
    }
    state.templateSnapshotHash = snapshotHash
    return snapshot
  }

  if (!installedTemplate || installedTemplate.id !== expectedId || String(installedTemplate.version) !== expectedVersion) {
    state.sourceTemplateStatus = installedTemplate ? 'stale-template' : 'missing-template'
    return null
  }

  const installedHash = workflowTemplateSnapshotHash(installedTemplate)
  const expectedHash = state.templateIdentity?.contentHash
  if (!expectedHash || (expectedHash !== installedHash && expectedHash !== installedTemplate.contentHash)) {
    state.sourceTemplateStatus = 'stale-template'
    return null
  }

  state.templateSnapshot = installedTemplate
  state.templateSnapshotHash = installedHash
  state.sourceTemplateStatus = 'current'
  return installedTemplate
}

export async function loadCurrentWorkflowTemplate(
  state: Pick<WorkflowSessionState, 'templateIdentity' | 'template' | 'templateSnapshot' | 'templateSnapshotHash' | 'sourceTemplateStatus'>,
): Promise<WorkflowTemplate | null> {
  const workflowId = state.templateIdentity?.id
    ?? (state.template && typeof state.template === 'object' && 'id' in state.template ? state.template.id : undefined)
  if (!workflowId) return null

  if (PINNED_WORKFLOW_IDS.has(workflowId) && state.templateSnapshot) {
    return resolveWorkflowTemplateForRun(state, null)
  }

  let installed: WorkflowTemplate | null = null
  if (testLoaderOverride) {
    installed = await testLoaderOverride(state as WorkflowSessionState)
  } else {
    try {
      const template = await new PackRegistryService().loadStoredWorkflowTemplate(workflowId)
      installed = toWorkflowTemplate(template)
    } catch {
      installed = null
    }
  }

  return PINNED_WORKFLOW_IDS.has(workflowId)
    ? resolveWorkflowTemplateForRun(state, installed)
    : installed
}

export function toWorkflowTemplate(
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
    phases: phases.map((phase) => ({
      id: phase.id,
      label: phase.name,
      instructions: phase.instructions,
      ...(phase.appliesTo ? { appliesTo: phase.appliesTo } : {}),
      ...(phase.skipWhen ? { skipWhen: phase.skipWhen } : {}),
      ...(phase.modePolicy ? { modePolicy: phase.modePolicy } : {}),
      requestedModel: typeof phase.requestedModel === 'string' ? phase.requestedModel : null,
      skills: phase.skills as WorkflowPhaseSkillReference[],
      ...(phase.skillBindings ? { skillBindings: phase.skillBindings } : {}),
      skillDeclarations: phase.skills.map((skill) => ({
        ...skill,
        source: 'template' as const,
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
      ...(phase.intent ? { intent: phase.intent } : {}),
      ...(phase.contract ? { contract: phase.contract } : {}),
      ...(phase.evidencePolicy ? { evidencePolicy: phase.evidencePolicy } : {}),
      ...(phase.phasePrompt ? { phasePrompt: phase.phasePrompt } : {}),
      ...(phase.runtimeContract ? { runtimeContract: phase.runtimeContract } : {}),
      ...(phase.outputArtifacts ? { outputArtifacts: phase.outputArtifacts } : {}),
    })),
    registryKey: `${template.source}:${template.id}`,
    ...(template.contentHash ? { contentHash: template.contentHash } : {}),
    ...(typeof template.packId === 'string' ? { packId: template.packId } : {}),
    ...(typeof template.packName === 'string' ? { packName: template.packName } : {}),
    ...(typeof template.packVersion === 'string' ? { packVersion: template.packVersion } : {}),
    ...(typeof template.packEntrypoint === 'string' ? { packEntrypoint: template.packEntrypoint } : {}),
  }
}
