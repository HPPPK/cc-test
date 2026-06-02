import type {
  WorkflowPhaseSkillCandidate,
  WorkflowPhaseSkillDiagnostic,
  WorkflowPhaseSkillProvenance,
  WorkflowPhaseSkillReference,
  WorkflowPhaseSkillResolution,
  WorkflowPhaseSkillResolvedSkill,
  WorkflowPhaseSkillSource,
} from './workflowTypes.js'

export type WorkflowPhaseSkillCatalogEntry = {
  name: string
  displayName?: string
  source: WorkflowPhaseSkillSource
  pluginName?: string
  pluginEnabled?: boolean
  namespace?: string
  version?: string
  contentHash?: string
  referenceId?: string
  sourcePath?: string
  installable?: boolean
}

export type ResolveWorkflowPhaseSkillsRequest = {
  cwd?: string
  templateId?: string
  phaseId?: string
  references: WorkflowPhaseSkillReference[]
  catalog: WorkflowPhaseSkillCatalogEntry[]
  supportedSources?: WorkflowPhaseSkillSource[]
  checkedAt?: string
}

export type ResolveWorkflowPhaseSkillsResponse = {
  schemaVersion: 1
  resolvedAt: string
  resolutions: WorkflowPhaseSkillResolution[]
}

const DEFAULT_SUPPORTED_SOURCES: WorkflowPhaseSkillSource[] = [
  'user',
  'project',
  'plugin',
  'managed',
  'bundled',
  'mcp',
  'unknown',
]

export async function resolveWorkflowPhaseSkills({
  references,
  catalog,
  supportedSources = DEFAULT_SUPPORTED_SOURCES,
  checkedAt = new Date().toISOString(),
}: ResolveWorkflowPhaseSkillsRequest): Promise<ResolveWorkflowPhaseSkillsResponse> {
  return {
    schemaVersion: 1,
    resolvedAt: checkedAt,
    resolutions: references.map((reference) => resolveWorkflowPhaseSkillReference(reference, catalog, supportedSources, checkedAt)),
  }
}

function resolveWorkflowPhaseSkillReference(
  reference: WorkflowPhaseSkillReference,
  catalog: WorkflowPhaseSkillCatalogEntry[],
  supportedSources: WorkflowPhaseSkillSource[],
  checkedAt: string,
): WorkflowPhaseSkillResolution {
  const normalizedReference = normalizeReference(reference)
  const invalidDiagnostic = validateReference(normalizedReference)

  if (invalidDiagnostic) {
    return {
      reference: normalizedReference,
      status: 'invalid-reference',
      checkedAt,
      diagnostic: invalidDiagnostic,
    }
  }

  if (normalizedReference.source && !supportedSources.includes(normalizedReference.source)) {
    return {
      reference: normalizedReference,
      status: 'unsupported-source',
      checkedAt,
      diagnostic: diagnostic(
        'WORKFLOW_PHASE_SKILL_UNSUPPORTED_SOURCE',
        'warning',
        `Recommended skill source "${normalizedReference.source}" is not supported in this environment.`,
      ),
    }
  }

  const candidates = catalog.filter((entry) => matchesReference(normalizedReference, entry))
  const installableCandidates = candidates.filter((entry) => entry.installable)
  const presentCandidates = candidates.filter((entry) => !entry.installable)

  if (presentCandidates.length === 0 && installableCandidates.length > 0) {
    const candidate = installableCandidates[0]

    return {
      reference: normalizedReference,
      status: 'installable',
      checkedAt,
      resolvedSkill: toResolvedSkill(candidate),
      provenance: toProvenance(candidate),
      diagnostic: diagnostic(
        'WORKFLOW_PHASE_SKILL_INSTALLABLE',
        'info',
        'Recommended skill is not installed but can be installed from a known source.',
      ),
    }
  }

  if (presentCandidates.length === 0) {
    return {
      reference: normalizedReference,
      status: 'missing',
      checkedAt,
      diagnostic: diagnostic(
        'WORKFLOW_PHASE_SKILL_MISSING',
        'warning',
        'Recommended skill is not available in this environment.',
      ),
    }
  }

  if (presentCandidates.length > 1) {
    return {
      reference: normalizedReference,
      status: 'ambiguous',
      checkedAt,
      candidates: presentCandidates.map(toCandidate),
      diagnostic: diagnostic(
        'WORKFLOW_PHASE_SKILL_AMBIGUOUS',
        'warning',
        'Recommended skill matches multiple catalog entries; add source, namespace, or plugin provenance to disambiguate.',
      ),
    }
  }

  const resolved = presentCandidates[0]

  if (resolved.source === 'plugin' && resolved.pluginEnabled === false) {
    return {
      reference: normalizedReference,
      status: 'plugin-disabled',
      checkedAt,
      resolvedSkill: toResolvedSkill(resolved),
      provenance: toProvenance(resolved),
      diagnostic: diagnostic(
        'WORKFLOW_PHASE_SKILL_PLUGIN_DISABLED',
        'warning',
        'Recommended skill is provided by a disabled or unavailable plugin.',
      ),
    }
  }

  return {
    reference: normalizedReference,
    status: 'available',
    checkedAt,
    resolvedSkill: toResolvedSkill(resolved),
    provenance: toProvenance(resolved),
  }
}

function normalizeReference(reference: WorkflowPhaseSkillReference): WorkflowPhaseSkillReference {
  const name = typeof reference.name === 'string' ? reference.name.trim() : reference.name

  return {
    ...reference,
    name,
    mode: reference.mode ?? 'recommended',
  }
}

function validateReference(reference: WorkflowPhaseSkillReference): WorkflowPhaseSkillDiagnostic | null {
  if (typeof reference.name !== 'string' || reference.name.length === 0) {
    return diagnostic('WORKFLOW_PHASE_SKILL_INVALID_REFERENCE', 'error', 'Workflow phase skill reference requires a non-empty name.')
  }

  if (reference.mode !== 'recommended') {
    return diagnostic(
      'WORKFLOW_PHASE_SKILL_INVALID_REFERENCE',
      'error',
      'Workflow phase skill reference mode must be "recommended".',
    )
  }

  return null
}

function matchesReference(reference: WorkflowPhaseSkillReference, entry: WorkflowPhaseSkillCatalogEntry): boolean {
  if (entry.name !== reference.name) {
    return false
  }

  if (reference.source && entry.source !== reference.source) {
    return false
  }

  if (reference.pluginName && entry.pluginName !== reference.pluginName) {
    return false
  }

  if (reference.namespace && entry.namespace !== reference.namespace) {
    return false
  }

  if (reference.referenceId && entry.referenceId !== reference.referenceId) {
    return false
  }

  if (reference.version && entry.version !== reference.version) {
    return false
  }

  if (reference.contentHash && entry.contentHash !== reference.contentHash) {
    return false
  }

  return true
}

function diagnostic(
  code: string,
  severity: WorkflowPhaseSkillDiagnostic['severity'],
  message: string,
): WorkflowPhaseSkillDiagnostic {
  return {
    code,
    severity,
    message,
  }
}

function toResolvedSkill(entry: WorkflowPhaseSkillCatalogEntry): WorkflowPhaseSkillResolvedSkill {
  return {
    name: entry.name,
    displayName: entry.displayName,
    source: entry.source,
    pluginName: entry.pluginName,
  }
}

function toCandidate(entry: WorkflowPhaseSkillCatalogEntry): WorkflowPhaseSkillCandidate {
  return {
    name: entry.name,
    displayName: entry.displayName,
    source: entry.source,
    pluginName: entry.pluginName,
    namespace: entry.namespace,
    referenceId: entry.referenceId,
  }
}

function toProvenance(entry: WorkflowPhaseSkillCatalogEntry): WorkflowPhaseSkillProvenance {
  return {
    sourcePath: entry.sourcePath,
    version: entry.version,
    contentHash: entry.contentHash,
    namespace: entry.namespace,
    referenceId: entry.referenceId,
  }
}
