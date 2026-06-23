import { useEffect, useState } from 'react'
import { sessionsApi } from '../../api/sessions'
import { useTranslation } from '../../i18n'
import { Modal } from '../shared/Modal'
import { useSessionStore } from '../../stores/sessionStore'
import { useSkillStore } from '../../stores/skillStore'
import type {
  WorkflowTemplateCompletionCriteria,
  WorkflowTemplateDetail,
  WorkflowTemplateDraft,
  WorkflowTemplatePhaseActionPolicy,
  WorkflowTemplateRequiredArtifact,
  WorkflowTemplateSource,
  WorkflowTemplateOutputArtifact,
  WorkflowTemplatePhase,
  WorkflowTemplateSkillDeclaration,
  WorkflowTemplatePhaseToolPolicy,
  WorkflowTemplateTransitionPolicy,
  WorkflowTemplateValidationIssue,
} from '../../types/session'
import type { SkillCatalogItem } from '../../types/skill'

type WorkflowTemplateEditorProps = {
  template?: WorkflowTemplateDetail | WorkflowTemplateDraft | null
  mode?: 'create' | 'edit'
  source?: WorkflowTemplateSource
  onSave?: (template: WorkflowTemplateDraft) => void | Promise<void>
  onSaved?: (template: WorkflowTemplateDetail) => void
  onCancel: () => void
}

type PhaseDraft = {
  id: string
  name: string
  role: string
  instructions: string
  objective: string
  intake: string
  outputArtifactId: string
  outputArtifactName: string
  outputArtifactKind: string
  outputArtifactDescription: string
  handoff: string
  executionRules: string
  completionCriteriaType: string
  completionCriteriaDescription: string
  transitionAuthority: 'auto' | 'user-confirmation'
  requestedModel: string
  skillReferences: WorkflowTemplateSkillDeclaration[]
  allowedTools: string[]
  hasCustomToolPolicy: boolean
}

type TemplateEditorDraft = {
  id: string
  version: string
  name: string
  description: string
  phases: PhaseDraft[]
}

type ValidationError = {
  key: string
  message: string
  code?: string
  path?: string
}

const DEFAULT_PHASE: PhaseDraft = {
  id: 'phase-1',
  name: 'Phase 1',
  role: '',
  instructions: '',
  objective: '',
  intake: '',
  outputArtifactId: '',
  outputArtifactName: '',
  outputArtifactKind: 'markdown',
  outputArtifactDescription: '',
  handoff: '',
  executionRules: '',
  completionCriteriaType: 'artifact-required',
  completionCriteriaDescription: '',
  transitionAuthority: 'user-confirmation',
  requestedModel: '',
  skillReferences: [],
  allowedTools: [
    'workflow_template_authoring',
    'submit_phase_completion',
  ],
  hasCustomToolPolicy: false,
}

const WORKFLOW_TOOL_OPTIONS = [
  { name: 'Write', labelKey: 'settings.workflows.editor.tool.write', groupKey: 'settings.workflows.editor.runtimeTools' },
  { name: 'Edit', labelKey: 'settings.workflows.editor.tool.edit', groupKey: 'settings.workflows.editor.runtimeTools' },
  { name: 'MultiEdit', labelKey: 'settings.workflows.editor.tool.multiEdit', groupKey: 'settings.workflows.editor.runtimeTools' },
  { name: 'NotebookEdit', labelKey: 'settings.workflows.editor.tool.notebookEdit', groupKey: 'settings.workflows.editor.runtimeTools' },
  { name: 'Bash', labelKey: 'settings.workflows.editor.tool.bash', groupKey: 'settings.workflows.editor.runtimeTools' },
  { name: 'PowerShell', labelKey: 'settings.workflows.editor.tool.powerShell', groupKey: 'settings.workflows.editor.runtimeTools' },
  { name: 'Agent', labelKey: 'settings.workflows.editor.tool.agent', groupKey: 'settings.workflows.editor.runtimeTools' },
  { name: 'workflow_template_authoring', labelKey: 'settings.workflows.editor.tool.workflowTemplateAuthoring', groupKey: 'settings.workflows.editor.workflowTools' },
  { name: 'submit_phase_completion', labelKey: 'settings.workflows.editor.tool.submitPhaseCompletion', groupKey: 'settings.workflows.editor.workflowTools' },
] as const

const WORKFLOW_TOOL_NAMES = WORKFLOW_TOOL_OPTIONS.map((tool) => tool.name)
const WORKFLOW_TOOL_NAME_SET = new Set<string>(WORKFLOW_TOOL_NAMES)
const DEFAULT_NON_IMPLEMENTATION_ALLOWED_TOOLS = [
  'workflow_template_authoring',
  'submit_phase_completion',
]
const DEFAULT_IMPLEMENTATION_ALLOWED_TOOLS = [...WORKFLOW_TOOL_NAMES]
const DEFAULT_VERIFICATION_ALLOWED_TOOLS = [
  'Bash',
  'PowerShell',
  'workflow_template_authoring',
  'submit_phase_completion',
]

export function WorkflowTemplateEditor({
  template,
  mode,
  source,
  onSave,
  onSaved,
  onCancel,
}: WorkflowTemplateEditorProps) {
  const t = useTranslation()
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [selectedPhaseIndex, setSelectedPhaseIndex] = useState(0)
  const [errors, setErrors] = useState<ValidationError[]>([])
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<TemplateEditorDraft>(() => toEditorDraft(template))
  const {
    catalog,
    skills: skillList,
    isCatalogLoading,
    isLoading: isSkillListLoading,
    error: skillCatalogError,
    fetchCatalog,
  } = useSkillStore()
  const sessions = useSessionStore((state) => state.sessions)
  const activeSessionId = useSessionStore((state) => state.activeSessionId)
  const activeSession = sessions.find((session) => session.id === activeSessionId)
  const currentWorkDir = activeSession?.workDir || undefined
  const selectedPhase = draft.phases[selectedPhaseIndex] ?? draft.phases[0] ?? DEFAULT_PHASE
  const skillCatalog = catalog.length > 0 ? catalog : skillList
  const editorMode = mode ?? (template?.source === 'user' ? 'edit' : 'create')
  const originalSource = source ?? template?.source
  const canEditTemplate = originalSource !== 'builtin'

  useEffect(() => {
    setDraft(toEditorDraft(template))
    setErrors([])
    setSelectedPhaseIndex(0)
  }, [template])

  useEffect(() => {
    void fetchCatalog(currentWorkDir)
  }, [fetchCatalog, currentWorkDir])

  const updateTemplate = (field: keyof TemplateEditorDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  const updatePhase = (field: keyof PhaseDraft, value: string) => {
    setDraft((current) => ({
      ...current,
      phases: current.phases.map((phase, index) => (
        index === selectedPhaseIndex ? { ...phase, [field]: value } : phase
      )),
    }))
  }

  const updatePhaseSkillReferences = (
    updater: (references: WorkflowTemplateSkillDeclaration[]) => WorkflowTemplateSkillDeclaration[],
  ) => {
    setDraft((current) => ({
      ...current,
      phases: current.phases.map((phase, index) => {
        if (index !== selectedPhaseIndex) return phase
        const skillReferences = updater(phase.skillReferences)
        return {
          ...phase,
          skillReferences,
        }
      }),
    }))
  }

  const replaceRecommendedSkills = (references: WorkflowTemplateSkillDeclaration[]) => {
    updatePhaseSkillReferences(() => references)
  }

  const togglePhaseTool = (toolName: string) => {
    setDraft((current) => ({
      ...current,
      phases: current.phases.map((phase, index) => {
        if (index !== selectedPhaseIndex) return phase
        const allowedTools = new Set(phase.allowedTools)
        if (allowedTools.has(toolName)) allowedTools.delete(toolName)
        else allowedTools.add(toolName)
        return {
          ...phase,
          allowedTools: WORKFLOW_TOOL_NAMES.filter((name) => allowedTools.has(name)),
          hasCustomToolPolicy: true,
        }
      }),
    }))
  }

  const addPhase = () => {
    setDraft((current) => {
      const nextIndex = current.phases.length + 1
      return {
        ...current,
        phases: [
          ...current.phases,
          {
            ...DEFAULT_PHASE,
            id: `phase-${nextIndex}`,
            name: t('settings.workflows.editor.newPhaseName', { count: nextIndex }),
            skillReferences: [],
          },
        ],
      }
    })
    setSelectedPhaseIndex(draft.phases.length)
  }

  const removePhase = () => {
    if (draft.phases.length <= 1) return
    setDraft((current) => ({
      ...current,
      phases: current.phases.filter((_, index) => index !== selectedPhaseIndex),
    }))
    setSelectedPhaseIndex((current) => Math.max(0, current - 1))
  }

  const handleSave = async () => {
    if (!canEditTemplate || saving) return
    const nextErrors = validateDraft(draft, t)
    setErrors(nextErrors)
    if (nextErrors.length > 0) return

    const templateDraft = toTemplateDraft(template, draft)

    if (onSave) {
      await onSave(templateDraft)
      return
    }

    setSaving(true)
    try {
      const validation = await sessionsApi.validateWorkflowTemplate({
        template: templateDraft,
        ...(editorMode === 'edit' && template?.id ? { allowExistingId: template.id } : {}),
      })
      if (!validation.valid || validation.issues.some((issue) => issue.severity === 'error')) {
        setErrors(validationIssuesToErrors(validation.issues))
        return
      }

      const requestTemplate = validation.template ?? templateDraft
      const response = editorMode === 'edit'
        ? await sessionsApi.updateWorkflowTemplate(templateDraft.id, { template: requestTemplate })
        : await sessionsApi.createWorkflowTemplate({ template: requestTemplate })
      setErrors([])
      onSaved?.(response.template)
    } catch (error) {
      setErrors([errorToValidationError(error)])
    } finally {
      setSaving(false)
    }
  }

  return (
    <section
      data-testid="workflow-template-editor"
      className="flex w-full min-w-0 flex-col gap-3 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] p-3"
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
            {t('settings.workflows.editor.title')}
          </h3>
          <p className="mt-0.5 text-xs leading-5 text-[var(--color-text-tertiary)]">
            {t('settings.workflows.editor.description')}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-8 items-center justify-center rounded-[7px] border border-[var(--color-border)] px-3 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/35"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canEditTemplate || saving}
            className="inline-flex h-8 items-center gap-1.5 rounded-[7px] bg-[var(--color-brand)] px-3 text-xs font-medium text-white transition-colors hover:bg-[var(--color-brand-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/35"
          >
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">save</span>
            {t('common.save')}
          </button>
        </div>
      </div>

      {errors.length > 0 && (
        <div
          data-testid="workflow-template-editor-errors"
          className="rounded-[8px] border border-[var(--color-error)]/30 bg-[var(--color-error)]/8 px-3 py-2 text-xs text-[var(--color-error)]"
        >
          <div className="flex items-center gap-2 font-semibold">
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">error</span>
            {t('settings.workflows.editor.validationTitle')}
          </div>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {errors.map((error) => (
              <li key={error.key}>
                {error.message}
                {(error.code || error.path) && (
                  <span className="ml-1 font-mono text-[var(--color-error)]/80">
                    {[error.code, error.path].filter(Boolean).join(' ')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid min-w-0 gap-3 md:grid-cols-2">
        <TextField
          id="workflow-template-id"
          label={t('settings.workflows.editor.templateId')}
          value={draft.id}
          onChange={(value) => updateTemplate('id', value)}
          disabled={editorMode === 'edit'}
          mono
        />
        <TextField
          id="workflow-template-name"
          label={t('settings.workflows.editor.templateName')}
          value={draft.name}
          onChange={(value) => updateTemplate('name', value)}
        />
      </div>

      <div className="grid min-w-0 gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
        <section
          aria-label={t('settings.workflows.editor.phaseList')}
          className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] p-2"
        >
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold uppercase text-[var(--color-text-tertiary)]">
              {t('settings.workflows.editor.phases')}
            </h4>
            <button
              type="button"
              aria-label={t('settings.workflows.editor.addPhase')}
              onClick={addPhase}
              className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/35"
            >
              <span className="material-symbols-outlined text-[17px]" aria-hidden="true">add</span>
            </button>
          </div>
          <div className="mt-2 flex flex-col gap-1">
            {draft.phases.map((phase, index) => (
              <button
                key={`${phase.id}:${index}`}
                type="button"
                aria-pressed={index === selectedPhaseIndex}
                onClick={() => setSelectedPhaseIndex(index)}
                className={`min-w-0 rounded-[7px] border px-2 py-2 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/35 ${
                  index === selectedPhaseIndex
                    ? 'border-[var(--color-brand)]/45 bg-[var(--color-brand)]/8 text-[var(--color-text-primary)]'
                    : 'border-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
                }`}
              >
                <span className="block truncate font-medium">{phase.name || phase.id || t('settings.workflows.editor.untitledPhase')}</span>
                <span className="mt-0.5 block truncate font-mono text-[11px] text-[var(--color-text-tertiary)]">
                  {phase.id || t('settings.workflows.editor.missingId')}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="min-w-0 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold uppercase text-[var(--color-text-tertiary)]">
              {t('settings.workflows.editor.phaseContract')}
            </h4>
            <button
              type="button"
              onClick={removePhase}
              disabled={draft.phases.length <= 1}
              className="inline-flex h-7 items-center gap-1 rounded-[6px] px-2 text-xs font-medium text-[var(--color-error)] transition-colors hover:bg-[var(--color-error)]/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/35 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <span className="material-symbols-outlined text-[15px]" aria-hidden="true">delete</span>
              {t('settings.workflows.editor.removePhase')}
            </button>
          </div>

          <div className="mt-3 grid min-w-0 gap-3 md:grid-cols-2">
            <TextField id="workflow-phase-id" label={t('settings.workflows.editor.phaseId')} value={selectedPhase.id} onChange={(value) => updatePhase('id', value)} mono />
            <TextField id="workflow-phase-name" label={t('settings.workflows.editor.phaseName')} value={selectedPhase.name} onChange={(value) => updatePhase('name', value)} />
          </div>

          <section
            role="group"
            aria-label={t('settings.workflows.editor.intentGroup')}
            className="mt-3 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] p-3"
          >
            <h5 className="text-xs font-semibold text-[var(--color-text-primary)]">
              {t('settings.workflows.editor.intentGroup')}
            </h5>
            <div className="mt-3 grid min-w-0 gap-3 md:grid-cols-2">
              <TextField id="workflow-phase-role" label={t('settings.workflows.editor.role')} value={selectedPhase.role} onChange={(value) => updatePhase('role', value)} />
              <TextField id="workflow-phase-objective" label={t('settings.workflows.editor.objective')} value={selectedPhase.objective} onChange={(value) => updatePhase('objective', value)} />
            </div>
            <div className="mt-3 grid min-w-0 gap-3">
              <TextArea id="workflow-phase-intake" label={t('settings.workflows.editor.intake')} value={selectedPhase.intake} onChange={(value) => updatePhase('intake', value)} rows={2} />
            </div>
          </section>

          <section
            role="group"
            aria-label={t('settings.workflows.editor.contractGroup')}
            className="mt-3 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] p-3"
          >
            <h5 className="text-xs font-semibold text-[var(--color-text-primary)]">
              {t('settings.workflows.editor.contractGroup')}
            </h5>
            <div className="mt-3 grid min-w-0 gap-3">
              <TextArea id="workflow-phase-instructions" label={t('settings.workflows.editor.instructions')} value={selectedPhase.instructions} onChange={(value) => updatePhase('instructions', value)} rows={4} />
              <TextArea id="workflow-phase-execution-rules" label={t('settings.workflows.editor.executionRules')} value={selectedPhase.executionRules} onChange={(value) => updatePhase('executionRules', value)} rows={2} />
              <SelectField id="workflow-phase-transition-authority" label={t('settings.workflows.editor.transitionAuthority')} value={selectedPhase.transitionAuthority} onChange={(value) => updatePhase('transitionAuthority', value)} options={[
                { value: 'user-confirmation', label: t('settings.workflows.editor.transitionAuthority.user') },
                { value: 'auto', label: t('settings.workflows.editor.transitionAuthority.auto') },
              ]} />
            </div>
          </section>

          <section
            role="group"
            aria-label={t('settings.workflows.editor.evidencePolicyGroup')}
            className="mt-3 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] p-3"
          >
            <h5 className="text-xs font-semibold text-[var(--color-text-primary)]">
              {t('settings.workflows.editor.evidencePolicyGroup')}
            </h5>
            <div className="mt-3 grid min-w-0 gap-3 md:grid-cols-2">
              <TextField id="workflow-output-artifact-name" label={t('settings.workflows.editor.outputArtifactName')} value={selectedPhase.outputArtifactName} onChange={(value) => updatePhase('outputArtifactName', value)} />
              <TextField id="workflow-output-artifact-kind" label={t('settings.workflows.editor.outputArtifactKind')} value={selectedPhase.outputArtifactKind} onChange={(value) => updatePhase('outputArtifactKind', value)} />
            </div>
            <div className="mt-3 grid min-w-0 gap-3">
              <TextArea id="workflow-output-artifact-description" label={t('settings.workflows.editor.outputArtifactDescription')} value={selectedPhase.outputArtifactDescription} onChange={(value) => updatePhase('outputArtifactDescription', value)} rows={2} />
              <TextArea id="workflow-phase-handoff" label={t('settings.workflows.editor.handoff')} value={selectedPhase.handoff} onChange={(value) => updatePhase('handoff', value)} rows={3} />
              <TextArea id="workflow-phase-completion-criteria" label={t('settings.workflows.editor.completionCriteria')} value={selectedPhase.completionCriteriaDescription} onChange={(value) => updatePhase('completionCriteriaDescription', value)} rows={2} />
            </div>
          </section>

          <RecommendedSkillsSelector
            phaseName={selectedPhase.name || selectedPhase.id || t('settings.workflows.editor.untitledPhase')}
            catalog={skillCatalog}
            selectedReferences={selectedPhase.skillReferences}
            loading={isCatalogLoading || isSkillListLoading}
            error={skillCatalogError}
            onChange={replaceRecommendedSkills}
          />

          <PhaseToolAccessEditor
            phaseName={selectedPhase.name || selectedPhase.id || t('settings.workflows.editor.untitledPhase')}
            allowedTools={selectedPhase.allowedTools}
            onToggle={togglePhaseTool}
          />

          <div className="mt-3 border-t border-[var(--color-border)] pt-3">
            <button
              type="button"
              aria-expanded={advancedOpen}
              onClick={() => setAdvancedOpen((open) => !open)}
              className="inline-flex items-center gap-1.5 rounded-[7px] px-2 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/35"
            >
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                {advancedOpen ? 'expand_less' : 'expand_more'}
              </span>
              {t('settings.workflows.editor.advancedFields')}
            </button>

            {advancedOpen && (
              <div className="mt-3 grid min-w-0 gap-3">
                <TextArea id="workflow-template-description" label={t('settings.workflows.editor.templateDescription')} value={draft.description} onChange={(value) => updateTemplate('description', value)} rows={2} />
                <TextField id="workflow-phase-requested-model" label={t('settings.workflows.editor.requestedModel')} value={selectedPhase.requestedModel} onChange={(value) => updatePhase('requestedModel', value)} />
              </div>
            )}
          </div>
        </section>
      </div>
    </section>
  )
}

function toEditorDraft(template?: WorkflowTemplateDraft | null): TemplateEditorDraft {
  const source: WorkflowTemplateDraft = template ?? {
    schemaVersion: 1,
    id: '',
    version: '1',
    name: '',
    phases: [],
  }

  return {
    id: source.id,
    version: source.version || '1',
    name: source.name,
    description: source.description ?? '',
    phases: source.phases.length > 0
      ? source.phases.map(toPhaseDraft)
      : [DEFAULT_PHASE],
  }
}

function toPhaseDraft(phase: WorkflowTemplatePhase): PhaseDraft {
  const intent: Record<string, unknown> = isRecord(phase.intent) ? phase.intent : {}
  const contract: Record<string, unknown> = isRecord(phase.contract) ? phase.contract : {}
  const evidencePolicy: Record<string, unknown> = isRecord(phase.evidencePolicy) ? phase.evidencePolicy : {}
  const evidenceOutputArtifact = isOutputArtifact(evidencePolicy.outputArtifact) ? evidencePolicy.outputArtifact : undefined
  const evidenceRequiredArtifacts = Array.isArray(evidencePolicy.requiredArtifacts)
    ? evidencePolicy.requiredArtifacts.filter(isRequiredArtifact)
    : undefined
  const evidenceCompletionCriteria = isCompletionCriteria(evidencePolicy.completionCriteria) ? evidencePolicy.completionCriteria : undefined
  const outputArtifact = evidenceOutputArtifact ?? phase.outputArtifact
  const requiredArtifacts = evidenceRequiredArtifacts ?? phase.requiredArtifacts
  const firstRequiredArtifact = requiredArtifacts?.find((artifact) => artifact.required) ?? requiredArtifacts?.[0]
  const artifactId = outputArtifact?.id ?? firstRequiredArtifact?.id ?? ''
  const artifactName = outputArtifact?.name ?? firstRequiredArtifact?.name ?? artifactId
  const skillReferences = Array.isArray(phase.skills) ? phase.skills : []
  const toolPolicy = isToolPolicy(phase.toolPolicy)
    ? phase.toolPolicy
    : isRecord(contract.toolPolicy) && Array.isArray(contract.toolPolicy.allowedTools)
      ? contract.toolPolicy as WorkflowTemplatePhaseToolPolicy
      : undefined
  const allowedTools = toolPolicy
    ? normalizeToolNames(toolPolicy.allowedTools)
    : defaultAllowedToolsForPhase(phase.id)
  const hasCustomToolPolicy = Boolean(toolPolicy)
  const transitionAuthority = contract.transitionAuthority === 'auto' || contract.transitionAuthority === 'user-confirmation'
    ? contract.transitionAuthority
    : phase.transition?.authority ?? 'user-confirmation'

  return {
    id: phase.id,
    name: phase.name,
    role: typeof intent.role === 'string' ? intent.role : typeof phase.role === 'string' ? phase.role : '',
    instructions: typeof contract.instructions === 'string' ? contract.instructions : phase.instructions,
    objective: typeof intent.objective === 'string' ? intent.objective : phase.objective ?? '',
    intake: toLinesText(Array.isArray(intent.intake) ? intent.intake.filter(isString) : phase.requiredIntake),
    outputArtifactId: artifactId,
    outputArtifactName: artifactName,
    outputArtifactKind: outputArtifact?.kind ?? 'markdown',
    outputArtifactDescription: outputArtifact?.description ?? firstRequiredArtifact?.description ?? '',
    handoff: toLinesText(Array.isArray(evidencePolicy.handoffRules) ? evidencePolicy.handoffRules.filter(isString) : phase.handoffRules),
    executionRules: toLinesText(Array.isArray(contract.executionRules) ? contract.executionRules.filter(isString) : phase.executionRules),
    completionCriteriaType: evidenceCompletionCriteria?.type ?? phase.completionCriteria?.type ?? 'artifact-required',
    completionCriteriaDescription: evidenceCompletionCriteria?.description ?? phase.completionCriteria?.description ?? '',
    transitionAuthority,
    requestedModel: typeof phase.requestedModel === 'string' ? phase.requestedModel : '',
    skillReferences,
    allowedTools,
    hasCustomToolPolicy,
  }
}

function toTemplateDraft(original: WorkflowTemplateDraft | null | undefined, draft: TemplateEditorDraft): WorkflowTemplateDraft {
  return {
    ...(original ?? {}),
    schemaVersion: 1,
    id: draft.id.trim(),
    version: draft.version.trim() || '1',
    name: draft.name.trim(),
    description: draft.description.trim() || undefined,
    phases: draft.phases.map((phase, index) => toWorkflowPhase(original?.phases[index], phase)),
  }
}

function toWorkflowPhase(original: WorkflowTemplatePhase | undefined, draft: PhaseDraft): WorkflowTemplatePhase {
  const {
    runtimeState: _runtimeState,
    intent: originalIntent,
    contract: originalContract,
    evidencePolicy: originalEvidencePolicy,
    actionPolicy: originalActionPolicy,
    toolPolicy: originalToolPolicy,
    ...originalWithoutRuntimeState
  } = original ?? {}
  const outputArtifactId = draft.outputArtifactId.trim() || slugFromText(draft.outputArtifactName) || `${draft.id.trim()}-artifact`
  const outputArtifact: WorkflowTemplateOutputArtifact = {
    ...(original?.outputArtifact ?? {}),
    id: outputArtifactId,
    name: draft.outputArtifactName.trim(),
    kind: draft.outputArtifactKind.trim() || 'markdown',
    description: draft.outputArtifactDescription.trim(),
    required: true,
  }
  const completionCriteria: WorkflowTemplateCompletionCriteria = {
    ...(original?.completionCriteria ?? {}),
    type: draft.completionCriteriaType.trim() || 'artifact-required',
    description: draft.completionCriteriaDescription.trim(),
  }
  const transition: WorkflowTemplateTransitionPolicy = {
    ...(original?.transition ?? {}),
    authority: draft.transitionAuthority,
  }
  const requiredArtifacts = [
    {
      ...(original?.requiredArtifacts?.[0] ?? {}),
      id: outputArtifact.id,
      name: outputArtifact.name,
      description: outputArtifact.description,
      required: true,
    },
  ]
  const intent = {
    ...(isRecord(originalIntent) ? originalIntent : {}),
    objective: draft.objective.trim(),
    role: draft.role.trim(),
    intake: toLines(draft.intake),
  }
  const actionPolicy: WorkflowTemplatePhaseActionPolicy = {
    ...(isRecord(originalActionPolicy) ? originalActionPolicy : {}),
    ...(isRecord(originalContract) && isRecord(originalContract.actionPolicy) ? originalContract.actionPolicy : {}),
    allowedActions: normalizeStringArray(
      isRecord(originalContract) && isRecord(originalContract.actionPolicy)
        ? originalContract.actionPolicy.allowedActions
        : isRecord(originalActionPolicy)
          ? originalActionPolicy.allowedActions
          : undefined,
    ),
    forbiddenActions: toLines(draft.executionRules),
  }
  const baseContract: Record<string, unknown> = isRecord(originalContract) ? { ...originalContract } : {}
  if (!draft.hasCustomToolPolicy) {
    delete baseContract.toolPolicy
  }
  const toolPolicy: WorkflowTemplatePhaseToolPolicy | undefined = draft.hasCustomToolPolicy
    ? {
        ...(isRecord(originalToolPolicy) ? originalToolPolicy : {}),
        ...(isRecord(originalContract) && isRecord(originalContract.toolPolicy) ? originalContract.toolPolicy : {}),
        allowedTools: normalizeToolNames(draft.allowedTools),
      }
    : undefined
  const contract = {
    ...baseContract,
    instructions: draft.instructions.trim(),
    executionRules: toLines(draft.executionRules),
    actionPolicy,
    ...(toolPolicy ? { toolPolicy } : {}),
    transitionAuthority: draft.transitionAuthority,
  }
  const evidencePolicy = {
    ...(isRecord(originalEvidencePolicy) ? originalEvidencePolicy : {}),
    outputArtifact,
    requiredArtifacts,
    completionCriteria,
    handoffRules: toLines(draft.handoff),
  }

  return {
    ...originalWithoutRuntimeState,
    id: draft.id.trim(),
    name: draft.name.trim(),
    role: draft.role.trim() || undefined,
    instructions: draft.instructions.trim(),
    objective: draft.objective.trim() || undefined,
    requiredIntake: toLines(draft.intake),
    handoffRules: toLines(draft.handoff),
    executionRules: toLines(draft.executionRules),
    outputArtifact,
    requiredArtifacts,
    completionCriteria,
    transition,
    intent,
    contract,
    evidencePolicy,
    actionPolicy,
    ...(toolPolicy ? { toolPolicy } : {}),
    requestedModel: draft.requestedModel.trim() || undefined,
    skills: draft.skillReferences.length > 0 ? draft.skillReferences : undefined,
  }
}

function defaultAllowedToolsForPhase(phaseId: string): string[] {
  const normalized = phaseId.trim().toLowerCase().replace(/[\s_]+/g, '-')
  if (normalized === 'verification') return [...DEFAULT_VERIFICATION_ALLOWED_TOOLS]
  if (
    normalized === 'implementation' ||
    normalized === 'implement' ||
    normalized === 'sp-implementation' ||
    normalized === 'sp-implement'
  ) {
    return [...DEFAULT_IMPLEMENTATION_ALLOWED_TOOLS]
  }
  return [...DEFAULT_NON_IMPLEMENTATION_ALLOWED_TOOLS]
}

function normalizeToolNames(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const selected = new Set(
    value
      .filter((tool): tool is string => typeof tool === 'string')
      .map((tool) => tool.trim())
      .filter((tool) => WORKFLOW_TOOL_NAME_SET.has(tool)),
  )
  return WORKFLOW_TOOL_NAMES.filter((tool) => selected.has(tool))
}

function isToolPolicy(value: unknown): value is WorkflowTemplatePhaseToolPolicy {
  return isRecord(value) && Array.isArray(value.allowedTools)
}

function validateDraft(draft: TemplateEditorDraft, t: ReturnType<typeof useTranslation>) {
  const errors: ValidationError[] = []
  if (!draft.id.trim()) errors.push({ key: 'template.id', message: t('settings.workflows.editor.error.templateIdRequired') })
  if (!draft.name.trim()) errors.push({ key: 'template.name', message: t('settings.workflows.editor.error.templateNameRequired') })

  draft.phases.forEach((phase, index) => {
    if (!phase.id.trim()) errors.push({ key: `phase.${index}.id`, message: t('settings.workflows.editor.error.phaseIdRequired') })
    if (!phase.name.trim()) errors.push({ key: `phase.${index}.name`, message: t('settings.workflows.editor.error.phaseNameRequired') })
    if (!phase.instructions.trim()) errors.push({ key: `phase.${index}.instructions`, message: t('settings.workflows.editor.error.instructionsRequired') })
    if (!phase.outputArtifactName.trim() || !phase.outputArtifactDescription.trim()) {
      errors.push({ key: `phase.${index}.outputArtifact`, message: t('settings.workflows.editor.error.outputArtifactRequired') })
    }
    if (!phase.handoff.trim()) {
      errors.push({ key: `phase.${index}.handoff`, message: t('settings.workflows.editor.error.handoffRequired') })
    }
    if (!phase.completionCriteriaDescription.trim()) {
      errors.push({ key: `phase.${index}.completionCriteria`, message: t('settings.workflows.editor.error.completionRequired') })
    }
  })

  return errors
}

function validationIssuesToErrors(issues: WorkflowTemplateValidationIssue[]): ValidationError[] {
  return issues.map((issue, index) => ({
    key: `${issue.path}:${issue.code}:${index}`,
    message: issue.message,
    code: issue.code,
    path: issue.path,
  }))
}

function errorToValidationError(error: unknown): ValidationError {
  return {
    key: 'server',
    message: error instanceof Error ? error.message : String(error),
  }
}

function TextField({
  id,
  label,
  value,
  onChange,
  mono = false,
  disabled = false,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  mono?: boolean
  disabled?: boolean
}) {
  return (
    <label className="block min-w-0 text-xs font-medium text-[var(--color-text-secondary)]" htmlFor={id}>
      {label}
      <input
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={`mt-1 h-9 w-full min-w-0 rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] px-2.5 text-sm text-[var(--color-text-primary)] outline-none transition-colors focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20 ${mono ? 'font-mono' : ''}`}
      />
    </label>
  )
}

function TextArea({
  id,
  label,
  value,
  onChange,
  rows,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  rows: number
}) {
  return (
    <label className="block min-w-0 text-xs font-medium text-[var(--color-text-secondary)]" htmlFor={id}>
      {label}
      <textarea
        id={id}
        value={value}
        rows={rows}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full min-w-0 resize-y rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] px-2.5 py-2 text-sm leading-5 text-[var(--color-text-primary)] outline-none transition-colors focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
      />
    </label>
  )
}

function SelectField({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string
  label: string
  value: string
  onChange: (value: 'auto' | 'user-confirmation') => void
  options: Array<{ value: 'auto' | 'user-confirmation'; label: string }>
}) {
  return (
    <label className="block min-w-0 text-xs font-medium text-[var(--color-text-secondary)]" htmlFor={id}>
      {label}
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as 'auto' | 'user-confirmation')}
        className="mt-1 h-9 w-full min-w-0 rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] px-2.5 text-sm text-[var(--color-text-primary)] outline-none transition-colors focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  )
}

function PhaseToolAccessEditor({
  phaseName,
  allowedTools,
  onToggle,
}: {
  phaseName: string
  allowedTools: string[]
  onToggle: (toolName: string) => void
}) {
  const t = useTranslation()
  const allowedToolSet = new Set(allowedTools)
  const runtimeTools = WORKFLOW_TOOL_OPTIONS.filter((tool) =>
    tool.groupKey === 'settings.workflows.editor.runtimeTools'
  )
  const workflowTools = WORKFLOW_TOOL_OPTIONS.filter((tool) =>
    tool.groupKey === 'settings.workflows.editor.workflowTools'
  )
  const completionToolDisabled = !allowedToolSet.has('submit_phase_completion')

  return (
    <section
      role="group"
      aria-label={t('settings.workflows.editor.toolAccessLabel', { phase: phaseName })}
      className="mt-3 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] p-3"
    >
      <div className="min-w-0">
        <h5 className="text-xs font-semibold text-[var(--color-text-primary)]">
          {t('settings.workflows.editor.toolAccess')}
        </h5>
        <p className="mt-0.5 text-[11px] leading-4 text-[var(--color-text-tertiary)]">
          {t('settings.workflows.editor.toolAccessHint')}
        </p>
      </div>
      <div className="mt-3 grid min-w-0 gap-3 md:grid-cols-2">
        <ToolCheckboxGroup
          title={t('settings.workflows.editor.runtimeTools')}
          tools={runtimeTools}
          allowedToolSet={allowedToolSet}
          onToggle={onToggle}
        />
        <ToolCheckboxGroup
          title={t('settings.workflows.editor.workflowTools')}
          tools={workflowTools}
          allowedToolSet={allowedToolSet}
          onToggle={onToggle}
        />
      </div>
      {completionToolDisabled && (
        <p className="mt-3 rounded-[7px] border border-[var(--color-warning)]/35 bg-[var(--color-warning)]/10 px-2.5 py-2 text-xs leading-5 text-[var(--color-warning)]">
          {t('settings.workflows.editor.submitCompletionDisabledWarning')}
        </p>
      )}
    </section>
  )
}

function ToolCheckboxGroup({
  title,
  tools,
  allowedToolSet,
  onToggle,
}: {
  title: string
  tools: typeof WORKFLOW_TOOL_OPTIONS[number][]
  allowedToolSet: Set<string>
  onToggle: (toolName: string) => void
}) {
  const t = useTranslation()

  return (
    <div className="min-w-0 rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
      <h6 className="text-[11px] font-semibold uppercase text-[var(--color-text-tertiary)]">
        {title}
      </h6>
      <div className="mt-2 grid min-w-0 gap-1.5">
        {tools.map((tool) => (
          <label
            key={tool.name}
            className="flex min-w-0 items-center gap-2 rounded-[6px] px-2 py-1.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
          >
            <input
              type="checkbox"
              checked={allowedToolSet.has(tool.name)}
              onChange={() => onToggle(tool.name)}
              className="h-3.5 w-3.5 shrink-0 accent-[var(--color-brand)]"
            />
            <span className="min-w-0 truncate">{t(tool.labelKey)}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

function RecommendedSkillsSelector({
  phaseName,
  catalog,
  selectedReferences,
  loading,
  error,
  onChange,
}: {
  phaseName: string
  catalog: SkillCatalogItem[]
  selectedReferences: WorkflowTemplateSkillDeclaration[]
  loading: boolean
  error: string | null
  onChange: (references: WorkflowTemplateSkillDeclaration[]) => void
}) {
  const t = useTranslation()
  const [pickerOpen, setPickerOpen] = useState(false)
  const recommendedReferences = selectedReferences.filter(isRecommendedSkillReference)
  const selectedCatalogItems = recommendedReferences.map((reference) => {
    const catalogItem = catalog.find((skill) => skillMatchesReference(skill, reference))
    return {
      reference,
      displayName: catalogItem?.displayName ?? displayNameFromSkillName(reference.name),
      source: reference.source ?? catalogItem?.source ?? 'unknown',
    }
  })

  return (
    <section
      role="group"
      aria-label={t('settings.workflows.editor.recommendedSkillsLabel', { phase: phaseName })}
      className="mt-3 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] p-3"
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h5 className="text-xs font-semibold text-[var(--color-text-primary)]">
            {t('settings.workflows.editor.recommendedSkills')}
          </h5>
          <p className="mt-0.5 text-[11px] leading-4 text-[var(--color-text-tertiary)]">
            {t('settings.workflows.editor.recommendedSkillsHint')}
          </p>
        </div>
        {loading && (
          <span className="text-[11px] text-[var(--color-text-tertiary)]">
            {t('settings.workflows.editor.skillCatalogLoading')}
          </span>
        )}
      </div>

      {error && (
        <p className="mt-2 text-[11px] leading-4 text-[var(--color-error)]">{error}</p>
      )}

      <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase text-[var(--color-text-tertiary)]">
            {t('settings.workflows.editor.selected')}
          </div>
          {selectedCatalogItems.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {selectedCatalogItems.map(({ reference, displayName, source }) => (
                <span
                  key={skillReferenceIdentity(reference)}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text-secondary)]"
                >
                  <span className="min-w-0 truncate font-medium text-[var(--color-text-primary)]">{displayName}</span>
                  <span className="shrink-0 text-[11px] text-[var(--color-text-tertiary)]">{source}</span>
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">
              {t('settings.workflows.editor.noRecommendedSkills')}
            </p>
          )}
        </div>
        <button
          type="button"
          aria-label={t('settings.workflows.editor.chooseRecommendedSkillsLabel', { phase: phaseName })}
          onClick={() => setPickerOpen(true)}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/35"
        >
          <span className="material-symbols-outlined text-[15px]" aria-hidden="true">playlist_add</span>
          {t('settings.workflows.editor.chooseSkills')}
        </button>
      </div>

      <SkillPickerModal
        open={pickerOpen}
        phaseName={phaseName}
        catalog={catalog}
        selectedReferences={recommendedReferences}
        onClose={() => setPickerOpen(false)}
        onApply={(references) => {
          onChange(references)
          setPickerOpen(false)
        }}
      />
    </section>
  )
}

function SkillPickerModal({
  open,
  phaseName,
  catalog,
  selectedReferences,
  onClose,
  onApply,
}: {
  open: boolean
  phaseName: string
  catalog: SkillCatalogItem[]
  selectedReferences: WorkflowTemplateSkillDeclaration[]
  onClose: () => void
  onApply: (references: WorkflowTemplateSkillDeclaration[]) => void
}) {
  const t = useTranslation()
  const [query, setQuery] = useState('')
  const [draftKeys, setDraftKeys] = useState<Set<string>>(() => (
    new Set(selectedReferences.map((reference) => skillReferenceSelectionKey(reference, catalog)))
  ))

  useEffect(() => {
    if (!open) return
    setQuery('')
    setDraftKeys(new Set(selectedReferences.map((reference) => skillReferenceSelectionKey(reference, catalog))))
  }, [catalog, open, selectedReferences])

  const normalizedQuery = query.trim().toLowerCase()
  const visibleSkills = normalizedQuery
    ? catalog.filter((skill) => {
      const displayName = skill.displayName ?? displayNameFromSkillName(skill.name)
      return [
        skill.name,
        displayName,
        skill.description,
        skill.source,
        skill.pluginName ?? '',
      ].some((value) => value.toLowerCase().includes(normalizedQuery))
    })
    : catalog

  const selectedSkillSummaries = Array.from(draftKeys)
    .map((key) => {
      const catalogItem = catalog.find((skill) => skillCatalogIdentity(skill) === key)
      const existingReference = selectedReferences.find((reference) => skillReferenceSelectionKey(reference, catalog) === key)
      const name = catalogItem?.name ?? existingReference?.name ?? key
      return {
        key,
        name,
        displayName: catalogItem?.displayName ?? displayNameFromSkillName(name),
        source: catalogItem?.source ?? existingReference?.source ?? 'unknown',
        pluginName: catalogItem?.pluginName ?? existingReference?.pluginName,
        unavailable: !catalogItem,
      }
    })
    .sort((left, right) => left.displayName.localeCompare(right.displayName))

  const toggleSkill = (key: string) => {
    setDraftKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const selectedReferencesForApply = () => {
    const existingByKey = new Map(selectedReferences.map((reference) => [skillReferenceSelectionKey(reference, catalog), reference]))
    const selectedCatalog = catalog.filter((skill) => draftKeys.has(skillCatalogIdentity(skill)))
    const selectedCatalogKeys = new Set(selectedCatalog.map(skillCatalogIdentity))
    const catalogReferences = selectedCatalog.map((skill) => ({
      ...(existingByKey.get(skillCatalogIdentity(skill)) ?? {}),
      ...skillToRecommendedReference(skill),
    }))
    const unresolvedReferences = selectedReferences.filter((reference) => (
      draftKeys.has(skillReferenceSelectionKey(reference, catalog)) &&
      !selectedCatalogKeys.has(skillReferenceSelectionKey(reference, catalog))
    ))
    return [
      ...catalogReferences,
      ...unresolvedReferences,
    ]
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('settings.workflows.editor.chooseRecommendedSkillsLabel', { phase: phaseName })}
      width={760}
      footer={(
        <>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 items-center justify-center rounded-[7px] border border-[var(--color-border)] px-3 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/35"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => onApply(selectedReferencesForApply())}
            className="inline-flex h-8 items-center justify-center rounded-[7px] bg-[var(--color-brand)] px-3 text-xs font-medium text-white transition-colors hover:bg-[var(--color-brand-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/35"
          >
            {t('settings.workflows.editor.applySelectedSkills')}
          </button>
        </>
      )}
    >
      <div className="min-w-0">
        <label className="block text-xs font-medium text-[var(--color-text-secondary)]" htmlFor="workflow-skill-picker-search">
          {t('settings.workflows.editor.searchSkills')}
          <div className="mt-1 flex h-9 min-w-0 items-center gap-2 rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] px-2.5 focus-within:border-[var(--color-brand)] focus-within:ring-2 focus-within:ring-[var(--color-brand)]/20">
            <span className="material-symbols-outlined text-[16px] text-[var(--color-text-tertiary)]" aria-hidden="true">search</span>
            <input
              id="workflow-skill-picker-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-full min-w-0 flex-1 bg-transparent text-sm text-[var(--color-text-primary)] outline-none"
            />
          </div>
        </label>

        <div
          role="group"
          aria-label={t('settings.workflows.editor.selectedSkills')}
          className="mt-3 min-w-0 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] p-3"
        >
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div className="text-[11px] font-medium uppercase text-[var(--color-text-tertiary)]">
              {t('settings.workflows.editor.selectedSkills')}
            </div>
            <span className="shrink-0 text-[11px] text-[var(--color-text-tertiary)]">
              {t('settings.workflows.editor.selectedSkillCount', { count: selectedSkillSummaries.length })}
            </span>
          </div>
          {selectedSkillSummaries.length > 0 ? (
            <div className="mt-2 flex max-h-24 min-w-0 flex-wrap gap-2 overflow-y-auto pr-1">
              {selectedSkillSummaries.map((skill) => (
                <span
                  key={skill.key}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text-secondary)]"
                >
                  <span className="min-w-0 truncate font-medium text-[var(--color-text-primary)]">{skill.displayName}</span>
                  <span className="shrink-0 text-[11px] text-[var(--color-text-tertiary)]">{skill.source}</span>
                  {skill.pluginName && (
                    <span className="shrink-0 text-[11px] text-[var(--color-text-tertiary)]">{skill.pluginName}</span>
                  )}
                  {skill.unavailable && (
                    <span className="shrink-0 text-[11px] text-[var(--color-warning)]">
                      {t('settings.workflows.editor.unresolvedSkill')}
                    </span>
                  )}
                  <button
                    type="button"
                    aria-label={t('settings.workflows.editor.removeSkillLabel', { skill: skill.displayName })}
                    onClick={() => toggleSkill(skill.key)}
                    className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/35"
                  >
                    <span className="material-symbols-outlined text-[14px]" aria-hidden="true">close</span>
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">
              {t('settings.workflows.editor.noRecommendedSkills')}
            </p>
          )}
        </div>

        <div className="mt-3 text-[11px] text-[var(--color-text-tertiary)]">
          {t('settings.workflows.editor.skillsShown', { count: visibleSkills.length })}
        </div>

        <div className="mt-3 grid max-h-[48vh] min-w-0 gap-2 overflow-y-auto pr-1">
          {visibleSkills.map((skill) => {
            const displayName = skill.displayName ?? displayNameFromSkillName(skill.name)
            const skillKey = skillCatalogIdentity(skill)
            const selected = draftKeys.has(skillKey)
            return (
              <label
                key={skillKey}
                className={`grid min-w-0 cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-[8px] border px-3 py-2 transition-colors ${
                  selected
                    ? 'border-[var(--color-brand)]/45 bg-[var(--color-brand)]/8'
                    : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggleSkill(skillKey)}
                  aria-label={t('settings.workflows.editor.selectSkillLabel', {
                    skill: displayName,
                    source: skill.source,
                  })}
                  className="mt-1 h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-brand)]"
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-[var(--color-text-primary)]">{displayName}</span>
                  <span className="mt-1 block text-xs leading-5 text-[var(--color-text-secondary)]">{skill.description}</span>
                  <span className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-[11px] text-[var(--color-text-tertiary)]">
                    <span>{skill.source}</span>
                    {skill.pluginName && <span>{skill.pluginName}</span>}
                    {skill.version && <span>v{skill.version}</span>}
                  </span>
                </span>
              </label>
            )
          })}
        </div>

        {visibleSkills.length === 0 && (
          <div className="mt-3 rounded-[8px] border border-dashed border-[var(--color-border)] px-3 py-6 text-center text-sm text-[var(--color-text-tertiary)]">
            {t('settings.workflows.editor.noSkillMatches')}
          </div>
        )}
      </div>
    </Modal>
  )
}

function toLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function toLinesText(value?: string[]) {
  return Array.isArray(value) ? value.join('\n') : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isOutputArtifact(value: unknown): value is WorkflowTemplateOutputArtifact {
  return isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.kind === 'string' &&
    typeof value.description === 'string'
}

function isRequiredArtifact(value: unknown): value is WorkflowTemplateRequiredArtifact {
  return isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.required === 'boolean'
}

function isCompletionCriteria(value: unknown): value is WorkflowTemplateCompletionCriteria {
  return isRecord(value) && typeof value.description === 'string'
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter(isString) : []
}

function skillToRecommendedReference(skill: SkillCatalogItem): WorkflowTemplateSkillDeclaration {
  return {
    name: skill.name,
    mode: 'recommended',
    source: skill.source,
    ...(skill.pluginName ? { pluginName: skill.pluginName } : {}),
    ...(skill.namespace ? { namespace: skill.namespace } : {}),
    ...(skill.version ? { version: skill.version } : {}),
    ...(skill.contentHash ? { contentHash: skill.contentHash } : {}),
    ...(skill.referenceId ? { referenceId: skill.referenceId } : {}),
  }
}

function skillCatalogIdentity(skill: SkillCatalogItem) {
  return skillReferenceIdentity(skillToRecommendedReference(skill))
}

function skillReferenceSelectionKey(reference: WorkflowTemplateSkillDeclaration, catalog: SkillCatalogItem[]) {
  const catalogItem = catalog.find((skill) => skillMatchesReference(skill, reference))
  return catalogItem ? skillCatalogIdentity(catalogItem) : skillReferenceIdentity(reference)
}

function skillReferenceIdentity(reference: WorkflowTemplateSkillDeclaration) {
  return JSON.stringify({
    name: reference.name,
    source: reference.source,
    pluginName: reference.pluginName,
    namespace: reference.namespace,
    version: reference.version,
    contentHash: reference.contentHash,
    referenceId: reference.referenceId,
  })
}

function skillMatchesReference(skill: SkillCatalogItem, reference: WorkflowTemplateSkillDeclaration) {
  return skill.name === reference.name &&
    (!reference.source || skill.source === reference.source) &&
    (!reference.pluginName || skill.pluginName === reference.pluginName) &&
    (!reference.namespace || skill.namespace === reference.namespace) &&
    (!reference.version || skill.version === reference.version) &&
    (!reference.contentHash || skill.contentHash === reference.contentHash) &&
    (!reference.referenceId || skill.referenceId === reference.referenceId)
}

function isRecommendedSkillReference(reference: WorkflowTemplateSkillDeclaration) {
  return reference.mode === undefined || reference.mode === 'recommended'
}

function displayNameFromSkillName(name: string) {
  return name
    .split(/[-_:.\s]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ') || name
}

function slugFromText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
