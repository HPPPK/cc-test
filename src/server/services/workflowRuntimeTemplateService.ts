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


export async function loadCurrentWorkflowTemplate(
  state: Pick<WorkflowSessionState, 'templateIdentity' | 'template'>,
): Promise<WorkflowTemplate | null> {
  if (testLoaderOverride) return testLoaderOverride(state)

  const workflowId = state.templateIdentity?.id
    ?? (state.template && typeof state.template === 'object' && 'id' in state.template ? state.template.id : undefined)
  if (!workflowId) return null

  try {
    const template = await new PackRegistryService().loadStoredWorkflowTemplate(workflowId)
    return toWorkflowTemplate(template)
  } catch {
    return null
  }
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
