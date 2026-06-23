import {
  WorkflowTemplateAuthoringService,
  type WorkflowTemplateAuthoringOperationInput,
  type WorkflowTemplateAuthoringResult,
} from '../services/workflowTemplateAuthoringService.js'
import {
  WorkflowTemplateRegistryService,
  type WorkflowTemplateRegistryListResult,
  type WorkflowTemplateRegistryTemplate,
  type WorkflowTemplateValidationIssue,
  collectTemplateSkillCatalog,
} from '../services/workflowTemplateRegistryService.js'
import { resolveWorkflowPhaseSkills } from '../services/workflowPhaseSkillResolver.js'
import {
  isNonEmptyString,
  isRecord,
  normalizeStringList,
  validateAndNormalizeWorkflowTemplate,
} from '../services/workflowTemplateValidation.js'
import type {
  WorkflowImportDependencyDiagnostic,
  WorkflowPhaseSkillReference,
  WorkflowPhaseSkillResolution,
  WorkflowPhaseSkillResolutionStatus,
  WorkflowPhaseSkillSource,
} from '../services/workflowTypes.js'

type WorkflowTemplateSource = 'builtin' | 'user'
type ErrorStatus = 400 | 404 | 405 | 409
type ApiValidationIssue = Omit<WorkflowTemplateValidationIssue, 'source'> & {
  source: WorkflowTemplateValidationIssue['source'] | 'request' | 'import'
}

type ImportCandidate = {
  importId: string
  originalId: string
  proposedId: string
  name: string
  version: string
  phaseCount: number
  conflict: 'none' | 'builtin-template' | 'user-template'
  defaultResolution: 'add' | 'rename'
  selectable: boolean
  issues: ApiValidationIssue[]
  dependencyDiagnostics: WorkflowImportDependencyDiagnostic[]
  template: Record<string, unknown> | null
}

type WorkflowSkillDependency = {
  templateId: string
  phaseId: string
  reference: WorkflowPhaseSkillReference
  exportStatus: WorkflowPhaseSkillResolutionStatus
  resolvedSource?: WorkflowPhaseSkillSource
  pluginName?: string
  contentHash?: string
  diagnostic?: string
}

const registryService = new WorkflowTemplateRegistryService()
const VALID_SOURCES = new Set(['builtin', 'user'])

export async function handleWorkflowTemplatesApi(req: Request, url: URL, segments: string[]): Promise<Response> {
  try {
    const tail = segments.slice(3)

    if (tail.length === 0) {
      if (req.method === 'GET') return await listTemplates()
      if (req.method === 'POST') return await createTemplate(req)
      return methodNotAllowed(req.method)
    }

    if (tail.length === 1 && tail[0] === 'authoring') {
      if (req.method !== 'POST') return methodNotAllowed(req.method)
      return await executeAuthoringOperation(req)
    }

    if (tail.length === 1 && tail[0] === 'validate') {
      if (req.method !== 'POST') return methodNotAllowed(req.method)
      return await validateTemplate(req)
    }

    if (tail.length === 1 && tail[0] === 'duplicate') {
      if (req.method !== 'POST') return methodNotAllowed(req.method)
      return await duplicateTemplate(req)
    }

    if (tail.length === 1 && tail[0] === 'export') {
      if (req.method !== 'POST') return methodNotAllowed(req.method)
      return await exportTemplates(req)
    }

    if (tail[0] === 'import') {
      if (tail.length === 2 && tail[1] === 'preview') {
        if (req.method !== 'POST') return methodNotAllowed(req.method)
        return await previewImport(req)
      }
      if (tail.length === 1) {
        if (req.method !== 'POST') return methodNotAllowed(req.method)
        return await commitImport(req)
      }
      return methodNotAllowed(req.method)
    }

    if (tail.length === 2) {
      const [source, id] = tail
      if (!isWorkflowSource(source)) {
        return workflowError(400, 'WORKFLOW_TEMPLATE_INVALID_SOURCE', 'Workflow template source must be builtin or user')
      }

      if (req.method === 'GET') return await getTemplateDetail(source, decodeURIComponent(id))
      if (source === 'user' && req.method === 'PUT') return await updateTemplate(req, decodeURIComponent(id))
      if (source === 'user' && req.method === 'DELETE') return await deleteTemplate(decodeURIComponent(id))
      return methodNotAllowed(req.method)
    }

    return methodNotAllowed(req.method)
  } catch (error) {
    if (error instanceof WorkflowTemplateApiError) {
      return workflowError(error.status, error.code, error.message, error.details)
    }
    return workflowError(500, 'WORKFLOW_TEMPLATE_INTERNAL_ERROR', error instanceof Error ? error.message : String(error))
  }
}

async function executeAuthoringOperation(req: Request): Promise<Response> {
  const body = await parseJsonBody(req)
  if (!isAuthoringOperationInput(body)) {
    return workflowError(400, 'WORKFLOW_TEMPLATE_AUTHORING_INVALID_REQUEST', 'Request body must include a workflow template authoring operation')
  }

  const result = await new WorkflowTemplateAuthoringService(registryService).execute(body)
  return Response.json(result, {
    status: authoringStatusCode(result),
  })
}

async function listTemplates(): Promise<Response> {
  return Response.json(toListResponse(await registryService.listTemplates()))
}

async function getTemplateDetail(source: WorkflowTemplateSource, id: string): Promise<Response> {
  const registry = await registryService.listTemplates()
  const template = findTemplate(registry, source, id)
  if (!template) {
    return workflowError(404, 'WORKFLOW_TEMPLATE_NOT_FOUND', 'Workflow template not found')
  }

  return Response.json({
    template: decorateTemplate(template),
    invalidTemplates: registry.invalidTemplates,
  })
}

async function validateTemplate(req: Request): Promise<Response> {
  const body = await parseJsonBody(req)
  const template = isRecord(body) ? body.template : undefined
  const allowExistingId = isRecord(body) && isNonEmptyString(body.allowExistingId)
    ? body.allowExistingId
    : undefined
  const registry = await registryService.listTemplates()
  const result = validateUserTemplate(template, '$.template', 'request', registry, { allowExistingId })

  return Response.json({
    valid: result.issues.length === 0,
    template: result.issues.length === 0 ? result.template : null,
    issues: result.issues,
  })
}

async function createTemplate(req: Request): Promise<Response> {
  const body = await parseJsonBody(req)
  const template = isRecord(body) ? body.template : undefined
  const registry = await registryService.listTemplates()
  const validation = validateUserTemplate(template, '$.template', 'request', registry)
  if (validation.issues.length > 0 || !validation.template) {
    return validationErrorResponse(validation.issues)
  }
  if (registry.templates.some((candidate) => candidate.source === 'user' && candidate.id === validation.template!.id)) {
    return workflowError(409, 'WORKFLOW_TEMPLATE_CONFLICT', 'A user workflow template with this id already exists')
  }

  await writeUserTemplates([...userTemplates(registry), validation.template])
  const refreshed = await registryService.listTemplates()
  return Response.json({
    template: decorateTemplate(validation.template),
    ...toListResponse(refreshed),
  }, { status: 201 })
}

async function updateTemplate(req: Request, id: string): Promise<Response> {
  const body = await parseJsonBody(req)
  const template = isRecord(body) ? body.template : undefined
  const registry = await registryService.listTemplates()
  const existing = findTemplate(registry, 'user', id)
  if (!existing) {
    return workflowError(404, 'WORKFLOW_TEMPLATE_NOT_FOUND', 'Workflow template not found')
  }
  if (!isRecord(template) || template.id !== id) {
    return workflowError(409, 'WORKFLOW_TEMPLATE_CONFLICT', 'Template id must match the route id')
  }

  const validation = validateUserTemplate(template, '$.template', 'request', registry, { allowExistingId: id })
  if (validation.issues.length > 0 || !validation.template) {
    return validationErrorResponse(validation.issues)
  }

  await writeUserTemplates(userTemplates(registry).map((candidate) =>
    candidate.id === id ? validation.template! : candidate
  ))
  const refreshed = await registryService.listTemplates()
  return Response.json({
    template: decorateTemplate(validation.template),
    ...toListResponse(refreshed),
  })
}

async function deleteTemplate(id: string): Promise<Response> {
  const registry = await registryService.listTemplates()
  if (!findTemplate(registry, 'user', id)) {
    return workflowError(404, 'WORKFLOW_TEMPLATE_NOT_FOUND', 'Workflow template not found')
  }

  await writeUserTemplates(userTemplates(registry).filter((template) => template.id !== id))
  return Response.json(toListResponse(await registryService.listTemplates()))
}

async function duplicateTemplate(req: Request): Promise<Response> {
  const body = await parseJsonBody(req)
  if (!isRecord(body)) {
    return workflowError(400, 'WORKFLOW_TEMPLATE_INVALID', 'Request body must be an object')
  }
  if (!isWorkflowSource(body.source) || !isNonEmptyString(body.id) || !isNonEmptyString(body.targetId)) {
    return workflowError(400, 'WORKFLOW_TEMPLATE_INVALID', 'source, id, and targetId are required')
  }

  const registry = await registryService.listTemplates()
  const sourceTemplate = findTemplate(registry, body.source, body.id)
  if (!sourceTemplate) {
    return workflowError(404, 'WORKFLOW_TEMPLATE_NOT_FOUND', 'Workflow template not found')
  }

  const draft = templateDraftForDuplicate(sourceTemplate)
  draft.id = body.targetId
  draft.source = 'user'
  if (isNonEmptyString(body.targetName)) {
    draft.name = body.targetName
  }

  const validation = validateUserTemplate(draft, '$.template', 'request', registry)
  if (validation.issues.length > 0 || !validation.template) {
    return validationErrorResponse(validation.issues)
  }

  await writeUserTemplates([...userTemplates(registry), validation.template])
  const refreshed = await registryService.listTemplates()
  return Response.json({
    template: decorateTemplate(validation.template),
    ...toListResponse(refreshed),
  }, { status: 201 })
}

async function previewImport(req: Request): Promise<Response> {
  const body = await parseJsonBody(req)
  const payload = isRecord(body) ? body.payload : undefined
  const registry = await registryService.listTemplates()
  const candidates = await buildImportCandidates(payload, registry)

  return Response.json({
    schemaVersion: 1,
    candidates: candidates.map(publicImportCandidate),
    invalidTemplates: candidates.flatMap((candidate) => candidate.issues),
    canCommit: candidates.some((candidate) => candidate.selectable),
  })
}

async function commitImport(req: Request): Promise<Response> {
  const body = await parseJsonBody(req)
  if (!isRecord(body)) {
    return workflowError(400, 'WORKFLOW_TEMPLATE_INVALID', 'Request body must be an object')
  }
  if (!Array.isArray(body.selections)) {
    return workflowError(400, 'WORKFLOW_TEMPLATE_INVALID', 'selections must be an array')
  }

  const registry = await registryService.listTemplates()
  const candidates = await buildImportCandidates(body.payload, registry)
  const byImportId = new Map(candidates.map((candidate) => [candidate.importId, candidate]))
  const selectedTemplates: WorkflowTemplateRegistryTemplate[] = []

  for (const selection of body.selections) {
    if (!isRecord(selection) || !isNonEmptyString(selection.importId)) {
      return workflowError(400, 'WORKFLOW_TEMPLATE_INVALID', 'Each import selection requires an importId')
    }
    if (selection.resolution === 'overwrite') {
      return workflowError(409, 'WORKFLOW_TEMPLATE_CONFLICT', 'Overwrite import resolution is not supported')
    }
    if (selection.resolution !== 'add' && selection.resolution !== 'rename') {
      return workflowError(400, 'WORKFLOW_TEMPLATE_INVALID', 'Import resolution must be add or rename')
    }

    const candidate = byImportId.get(selection.importId)
    if (!candidate || !candidate.template) {
      return workflowError(400, 'WORKFLOW_TEMPLATE_INVALID', 'Selected import candidate is invalid')
    }

    const targetId = selection.resolution === 'rename'
      ? (isNonEmptyString(selection.targetId) ? selection.targetId : candidate.proposedId)
      : candidate.originalId
    const draft = { ...candidate.template, id: targetId, source: 'user' }
    const validation = validateUserTemplate(draft, '$.payload.templates', 'import', registry)
    if (validation.issues.length > 0 || !validation.template) {
      return validationErrorResponse(validation.issues, 'import')
    }
    selectedTemplates.push(validation.template)
  }

  const selectedIds = new Set<string>()
  for (const template of selectedTemplates) {
    if (selectedIds.has(template.id)) {
      return workflowError(409, 'WORKFLOW_TEMPLATE_CONFLICT', 'Import selections resolve to duplicate template ids')
    }
    selectedIds.add(template.id)
  }

  await writeUserTemplates([...userTemplates(registry), ...selectedTemplates])
  return Response.json(toListResponse(await registryService.listTemplates()))
}

async function exportTemplates(req: Request): Promise<Response> {
  const body = await parseJsonBody(req)
  if (!isRecord(body) || !Array.isArray(body.templates)) {
    return workflowError(400, 'WORKFLOW_TEMPLATE_INVALID', 'templates must be an array')
  }

  const registry = await registryService.listTemplates()
  const templates: Array<Record<string, unknown>> = []
  const dependencyTemplates: WorkflowTemplateRegistryTemplate[] = []
  for (const selector of body.templates) {
    if (!isRecord(selector) || !isWorkflowSource(selector.source) || !isNonEmptyString(selector.id)) {
      return workflowError(400, 'WORKFLOW_TEMPLATE_INVALID', 'Each export selector requires source and id')
    }
    const template = findTemplate(registry, selector.source, selector.id)
    if (!template) {
      return workflowError(404, 'WORKFLOW_TEMPLATE_NOT_FOUND', 'Workflow template not found')
    }
    templates.push(exportTemplateDraft(template))
    dependencyTemplates.push(template)
  }

  const exportedAt = new Date().toISOString()
  return Response.json({
    schemaVersion: 2,
    exportedAt,
    templates,
    dependencyManifest: await buildExportDependencyManifest(dependencyTemplates, exportedAt),
  })
}

async function buildImportCandidates(payload: unknown, registry: WorkflowTemplateRegistryListResult): Promise<ImportCandidate[]> {
  const importedTemplates = extractImportTemplates(payload)
  const dependencyManifest = extractDependencyManifest(payload)
  const catalog = await collectTemplateSkillCatalog()
  const candidates: ImportCandidate[] = []

  for (const [index, template] of importedTemplates.entries()) {
    const importId = `candidate-${index + 1}`
    const originalId = isRecord(template) && isNonEmptyString(template.id) ? template.id : importId
    const conflict = registry.templates.some((candidate) => candidate.source === 'user' && candidate.id === originalId)
      ? 'user-template'
      : 'none'
    const proposedId = conflict === 'none' ? originalId : nextAvailableId(`${originalId}-imported`, registry)
    const validationDraft = isRecord(template) ? { ...template, id: proposedId, source: 'user' } : template
    const validation = validateUserTemplate(validationDraft, `$.payload.templates[${index}]`, 'import', registry, {
      allowExistingId: conflict === 'user-template' ? proposedId : undefined,
    })
    const manifestDependencyDiagnostics = buildManifestDependencyDiagnostics(originalId, dependencyManifest)
    const resolvedDependencyDiagnostics = validation.template
      ? await buildImportDependencyDiagnostics(validation.template, dependencyManifest, catalog)
      : []
    const dependencyDiagnostics = uniqueDependencyDiagnostics([
      ...manifestDependencyDiagnostics,
      ...resolvedDependencyDiagnostics,
    ])
    const dependencyImportable = dependencyDiagnostics.every((diagnostic) => diagnostic.canImport)

    candidates.push({
      importId,
      originalId,
      proposedId,
      name: isRecord(template) && isNonEmptyString(template.name) ? template.name : originalId,
      version: isRecord(template) && isNonEmptyString(template.version) ? template.version : '1',
      phaseCount: isRecord(template) && Array.isArray(template.phases) ? template.phases.length : 0,
      conflict,
      defaultResolution: conflict === 'none' ? 'add' : 'rename',
      selectable: validation.issues.length === 0 && validation.template !== null && dependencyImportable,
      issues: validation.issues,
      dependencyDiagnostics,
      template: isRecord(template) ? template : null,
    })
  }

  return candidates
}

async function buildExportDependencyManifest(
  templates: WorkflowTemplateRegistryTemplate[],
  generatedAt: string,
): Promise<{
  schemaVersion: 1
  generatedAt: string
  dependencies: WorkflowSkillDependency[]
}> {
  const catalog = await collectTemplateSkillCatalog()
  const dependencies: WorkflowSkillDependency[] = []

  for (const template of templates) {
    for (const phase of template.phases) {
      if (phase.skills.length === 0) continue

      const result = await resolveWorkflowPhaseSkills({
        templateId: template.id,
        phaseId: phase.id,
        references: phase.skills,
        catalog,
      })

      dependencies.push(...result.resolutions.map((resolution) =>
        exportDependencyFromResolution(template.id, phase.id, resolution)
      ))
    }
  }

  return {
    schemaVersion: 1,
    generatedAt,
    dependencies,
  }
}

function exportDependencyFromResolution(
  templateId: string,
  phaseId: string,
  resolution: WorkflowPhaseSkillResolution,
): WorkflowSkillDependency {
  const dependency: WorkflowSkillDependency = {
    templateId,
    phaseId,
    reference: resolution.reference,
    exportStatus: resolution.status,
  }
  const resolvedSource = resolution.resolvedSkill?.source ?? resolution.reference.source
  const pluginName = resolution.resolvedSkill?.pluginName ?? resolution.reference.pluginName
  const contentHash = resolution.provenance?.contentHash ?? resolution.reference.contentHash

  if (resolvedSource) dependency.resolvedSource = resolvedSource
  if (pluginName) dependency.pluginName = pluginName
  if (contentHash) dependency.contentHash = contentHash
  if (resolution.diagnostic?.message) dependency.diagnostic = resolution.diagnostic.message

  return dependency
}

function extractImportTemplates(payload: unknown): unknown[] {
  if (isRecord(payload) && Array.isArray(payload.templates)) {
    return payload.templates
  }
  if (isRecord(payload) && isNonEmptyString(payload.id)) {
    return [payload]
  }
  return []
}

function extractDependencyManifest(payload: unknown): unknown[] {
  if (!isRecord(payload) || !isRecord(payload.dependencyManifest)) return []
  return Array.isArray(payload.dependencyManifest.dependencies)
    ? payload.dependencyManifest.dependencies
    : []
}

function buildManifestDependencyDiagnostics(
  templateId: string,
  dependencyManifest: unknown[],
): WorkflowImportDependencyDiagnostic[] {
  return dependencyManifest
    .filter(isRecord)
    .filter((dependency) => dependency.templateId === templateId)
    .map((dependency): WorkflowImportDependencyDiagnostic | null => {
      if (!isRecord(dependency.reference) || !isResolutionStatus(dependency.exportStatus)) {
        return null
      }
      const severity = dependency.exportStatus === 'invalid-reference'
        ? 'error'
        : dependency.exportStatus === 'available' || dependency.exportStatus === 'installable'
          ? 'info'
          : 'warning'
      const message = isNonEmptyString(dependency.diagnostic)
        ? dependency.diagnostic
        : importDependencyDiagnosticMessage(dependency.exportStatus)

      return {
        templateId,
        phaseId: isNonEmptyString(dependency.phaseId) ? dependency.phaseId : '',
        reference: normalizeImportedSkillReference(dependency.reference),
        status: dependency.exportStatus,
        severity,
        message,
        canImport: severity !== 'error',
      }
    })
    .filter((diagnostic): diagnostic is WorkflowImportDependencyDiagnostic => diagnostic !== null)
}

async function buildImportDependencyDiagnostics(
  template: WorkflowTemplateRegistryTemplate,
  dependencyManifest: unknown[],
  catalog: Awaited<ReturnType<typeof collectTemplateSkillCatalog>>,
): Promise<WorkflowImportDependencyDiagnostic[]> {
  const diagnostics: WorkflowImportDependencyDiagnostic[] = []
  const manifestReferences = dependencyManifest
    .filter(isRecord)
    .filter((dependency) => dependency.templateId === template.id)

  for (const phase of template.phases) {
    const manifestPhaseReferences = manifestReferences
      .filter((dependency) => dependency.phaseId === phase.id && isRecord(dependency.reference))
      .map((dependency) => dependency.reference as WorkflowTemplateRegistryTemplate['phases'][number]['skills'][number])
    const references = uniqueSkillReferences([...phase.skills, ...manifestPhaseReferences])
    if (references.length === 0) continue

    const result = await resolveWorkflowPhaseSkills({
      templateId: template.id,
      phaseId: phase.id,
      references,
      catalog,
    })

    result.resolutions.forEach((resolution) => {
      const severity = resolution.diagnostic?.severity ?? 'info'
      diagnostics.push({
        templateId: template.id,
        phaseId: phase.id,
        reference: resolution.reference,
        status: resolution.status,
        severity,
        message: resolution.diagnostic?.message ?? 'Recommended skill is available in this environment.',
        canImport: severity !== 'error',
      })
    })
  }

  return diagnostics
}

function uniqueSkillReferences(
  references: WorkflowTemplateRegistryTemplate['phases'][number]['skills'],
): WorkflowTemplateRegistryTemplate['phases'][number]['skills'] {
  const seen = new Set<string>()
  const uniqueReferences: WorkflowTemplateRegistryTemplate['phases'][number]['skills'] = []

  for (const reference of references) {
    const key = JSON.stringify({
      name: reference.name,
      mode: reference.mode ?? 'recommended',
      source: reference.source,
      pluginName: reference.pluginName,
      namespace: reference.namespace,
      version: reference.version,
      contentHash: reference.contentHash,
      referenceId: reference.referenceId,
    })
    if (seen.has(key)) continue
    seen.add(key)
    uniqueReferences.push(reference)
  }

  return uniqueReferences
}

function uniqueDependencyDiagnostics(
  diagnostics: WorkflowImportDependencyDiagnostic[],
): WorkflowImportDependencyDiagnostic[] {
  const seen = new Set<string>()
  const uniqueDiagnostics: WorkflowImportDependencyDiagnostic[] = []

  for (const diagnostic of diagnostics) {
    const key = JSON.stringify({
      templateId: diagnostic.templateId,
      phaseId: diagnostic.phaseId,
      reference: diagnostic.reference,
      status: diagnostic.status,
    })
    if (seen.has(key)) continue
    seen.add(key)
    uniqueDiagnostics.push(diagnostic)
  }

  return uniqueDiagnostics
}

function normalizeImportedSkillReference(reference: Record<string, unknown>): WorkflowPhaseSkillReference {
  const normalized = {
    ...reference,
    mode: reference.mode ?? 'recommended',
  }
  return normalized as WorkflowPhaseSkillReference
}

function importDependencyDiagnosticMessage(status: WorkflowPhaseSkillResolutionStatus): string {
  if (status === 'invalid-reference') return 'Workflow phase skill reference is invalid.'
  if (status === 'available') return 'Recommended skill is available in the source environment.'
  if (status === 'installable') return 'Recommended skill can be installed from a known source.'
  return 'Recommended skill may be unavailable or degraded in this environment.'
}

function isResolutionStatus(value: unknown): value is WorkflowPhaseSkillResolutionStatus {
  return value === 'available' ||
    value === 'missing' ||
    value === 'ambiguous' ||
    value === 'unsupported-source' ||
    value === 'plugin-disabled' ||
    value === 'invalid-reference' ||
    value === 'installable'
}

function validateUserTemplate(
  value: unknown,
  basePath: string,
  source: 'request' | 'import',
  registry: WorkflowTemplateRegistryListResult,
  options: { allowExistingId?: string } = {},
): { template: WorkflowTemplateRegistryTemplate | null; issues: ApiValidationIssue[] } {
  return validateAndNormalizeWorkflowTemplate(value, {
    basePath,
    source,
    registry,
    allowExistingId: options.allowExistingId,
  }) as { template: WorkflowTemplateRegistryTemplate | null; issues: ApiValidationIssue[] }
}

async function writeUserTemplates(templates: WorkflowTemplateRegistryTemplate[]): Promise<void> {
  try {
    await registryService.writeTemplates(templates)
  } catch (error) {
    throw new WorkflowTemplateApiError(400, 'WORKFLOW_TEMPLATE_INVALID', error instanceof Error ? error.message : String(error))
  }
}

function validationErrorResponse(issues: ApiValidationIssue[], fallbackSource: 'request' | 'import' = 'request'): Response {
  const firstCode = issues[0]?.code
  if (firstCode === 'WORKFLOW_TEMPLATE_CONFLICT') {
    return workflowError(409, firstCode, issues[0]?.message ?? 'Workflow template conflict.', { issues })
  }
  return workflowError(400, 'WORKFLOW_TEMPLATE_INVALID', `Workflow template ${fallbackSource} is invalid`, { issues })
}

async function parseJsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    throw new WorkflowTemplateApiError(400, 'WORKFLOW_TEMPLATE_INVALID_JSON', 'Request body must be valid JSON')
  }
}

function toListResponse(registry: WorkflowTemplateRegistryListResult): { templates: Array<ReturnType<typeof summarizeTemplate>>; invalidTemplates: WorkflowTemplateValidationIssue[] } {
  return {
    templates: registry.templates.map(summarizeTemplate),
    invalidTemplates: registry.invalidTemplates,
  }
}

function summarizeTemplate(template: WorkflowTemplateRegistryTemplate) {
  return {
    id: template.id,
    source: template.source,
    version: template.version,
    name: template.name,
    description: template.description,
    phaseCount: template.phases.length,
    firstPhaseId: template.phases[0]?.id ?? null,
    phaseNames: template.phases.map((phase) => phase.name),
    startable: template.phases.length > 0,
    editable: template.source === 'user',
    copyable: true,
  }
}

function decorateTemplate(template: WorkflowTemplateRegistryTemplate) {
  return {
    ...cloneTemplate(template),
    editable: template.source === 'user',
    copyable: true,
  }
}

function publicImportCandidate(candidate: ImportCandidate) {
  return {
    importId: candidate.importId,
    originalId: candidate.originalId,
    proposedId: candidate.proposedId,
    name: candidate.name,
    version: candidate.version,
    phaseCount: candidate.phaseCount,
    conflict: candidate.conflict,
    defaultResolution: candidate.defaultResolution,
    selectable: candidate.selectable,
    issues: candidate.issues,
    dependencyDiagnostics: candidate.dependencyDiagnostics,
  }
}

function findTemplate(registry: WorkflowTemplateRegistryListResult, source: WorkflowTemplateSource, id: string): WorkflowTemplateRegistryTemplate | undefined {
  return registry.templates.find((template) => template.source === source && template.id === id)
}

function templateDraftForDuplicate(template: WorkflowTemplateRegistryTemplate): Record<string, unknown> {
  const draft = cloneTemplate(template) as Record<string, unknown>
  draft.phases = template.phases.map((phase) => {
    const phasePrompt = phase.phasePrompt
    return {
      ...phase,
      requiredIntake: normalizeStringList(phase.requiredIntake).length > 0
        ? phase.requiredIntake
        : phasePrompt?.handoffInput ?? ['Use the previous workflow context.'],
      handoffRules: normalizeStringList(phase.handoffRules).length > 0
        ? phase.handoffRules
        : phasePrompt?.completionRules ?? ['Summarize the phase output and next action.'],
      outputArtifact: phase.outputArtifact ?? {
        id: `${phase.id}-output`,
        name: phasePrompt?.outputArtifact.name ?? `${phase.name} Output`,
        kind: 'markdown',
        description: `${phase.name} phase output.`,
        required: true,
        ...(phasePrompt?.outputArtifact.sections ? { sections: phasePrompt.outputArtifact.sections } : {}),
      },
    }
  })
  return draft
}

function exportTemplateDraft(template: WorkflowTemplateRegistryTemplate): Record<string, unknown> {
  const draft = template.source === 'builtin'
    ? templateDraftForDuplicate(template)
    : cloneTemplate(template) as Record<string, unknown>

  delete draft.source
  delete draft.editable
  delete draft.copyable
  return draft
}

function userTemplates(registry: WorkflowTemplateRegistryListResult): WorkflowTemplateRegistryTemplate[] {
  return registry.templates.filter((template) => template.source === 'user')
}

function nextAvailableId(baseId: string, registry: WorkflowTemplateRegistryListResult): string {
  const usedIds = new Set(registry.templates.map((template) => template.id))
  if (!usedIds.has(baseId)) return baseId
  for (let index = 2; ; index += 1) {
    const candidate = `${baseId}-${index}`
    if (!usedIds.has(candidate)) return candidate
  }
}

function cloneTemplate(template: WorkflowTemplateRegistryTemplate): WorkflowTemplateRegistryTemplate {
  return JSON.parse(JSON.stringify(template)) as WorkflowTemplateRegistryTemplate
}

function isWorkflowSource(value: unknown): value is WorkflowTemplateSource {
  return typeof value === 'string' && VALID_SOURCES.has(value)
}

function isAuthoringOperationInput(value: unknown): value is WorkflowTemplateAuthoringOperationInput {
  return isRecord(value) &&
    (
      value.operation === 'guide' ||
      value.operation === 'skill_catalog' ||
      value.operation === 'skill_create' ||
      value.operation === 'list' ||
      value.operation === 'inspect' ||
      value.operation === 'validate' ||
      value.operation === 'create' ||
      value.operation === 'update' ||
      value.operation === 'duplicate' ||
      value.operation === 'delete'
    )
}

function authoringStatusCode(result: WorkflowTemplateAuthoringResult): 200 | 201 {
  if (result.operation === 'create' && result.status === 'succeeded') return 201
  if (result.operation === 'duplicate' && result.status === 'succeeded') return 201
  return 200
}

function methodNotAllowed(method: string): Response {
  return workflowError(405, 'METHOD_NOT_ALLOWED', `Method ${method} not allowed`)
}

function workflowError(status: ErrorStatus | 500, code: string, message: string, details: Record<string, unknown> = {}): Response {
  return Response.json({ error: code, code, message, ...details }, { status })
}

class WorkflowTemplateApiError extends Error {
  constructor(
    public readonly status: ErrorStatus,
    public readonly code: string,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message)
  }
}
