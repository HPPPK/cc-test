import { useEffect, useRef, useState } from 'react'
import { sessionsApi } from '../../api/sessions'
import { useTranslation } from '../../i18n'
import { Modal } from '../shared/Modal'
import { useSessionStore } from '../../stores/sessionStore'
import { useUIStore } from '../../stores/uiStore'
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
  WorkflowTemplateTransitionPolicy,
  WorkflowTemplateValidationIssue,
  WorkflowLabel,
  WorkflowEffortMode,
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
  transitionAuthority: 'auto' | 'user-confirmation' | 'artifact-gate' | 'user-choice'
  requestedModel: string
  appliesTo: string
  skipLabels: string
  skipEfforts: string
  modePolicyLight: string
  modePolicyStandard: string
  modePolicyHeavy: string
  skillBindings: string
  runtimeContract: string
  outputArtifacts: string
  skillReferences: WorkflowTemplateSkillDeclaration[]
}

type TemplateEditorDraft = {
  id: string
  version: string
  name: string
  description: string
  labels: string
  routingPolicy: string
  stopConditions: string
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
  appliesTo: '',
  skipLabels: '',
  skipEfforts: '',
  modePolicyLight: '',
  modePolicyStandard: '',
  modePolicyHeavy: '',
  skillBindings: '',
  runtimeContract: '',
  outputArtifacts: '',
  skillReferences: [],
}

export function WorkflowTemplateEditor({
  template,
  mode,
  onSave,
  onSaved,
  onCancel,
}: WorkflowTemplateEditorProps) {
  const t = useTranslation()
  const addToast = useUIStore((state) => state.addToast)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [selectedPhaseIndex, setSelectedPhaseIndex] = useState(0)
  const [errors, setErrors] = useState<ValidationError[]>([])
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<TemplateEditorDraft>(() => toEditorDraft(template))
  const templateIdentityRef = useRef(templateIdentity(template))
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
  const canEditTemplate = true

  useEffect(() => {
    const nextIdentity = templateIdentity(template)
    if (templateIdentityRef.current === nextIdentity) return
    templateIdentityRef.current = nextIdentity
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
      phases: current.phases.map((phase, index) => {
        if (index !== selectedPhaseIndex) return phase
        if (field === 'skillBindings') {
          return {
            ...phase,
            skillBindings: value,
            skillReferences: skillReferencesFromSkillBindingsText(value, phase.skillReferences),
          }
        }
        return { ...phase, [field]: value }
      }),
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
          skillBindings: JSON.stringify(skillBindingsFromReferences(skillReferences, phase.skillBindings), null, 2),
        }
      }),
    }))
  }

  const replacePhaseSkillBindings = (references: WorkflowTemplateSkillDeclaration[]) => {
    updatePhaseSkillReferences(() => references)
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
    const liveDraft = mergeLiveEditorValues(draft, selectedPhaseIndex)
    const nextErrors = validateDraft(liveDraft, t)
    setErrors(nextErrors)
    if (nextErrors.length > 0) {
      addToast({ type: 'error', message: t('settings.workflows.editor.validationTitle') })
      return
    }

    const templateDraft = toTemplateDraft(template, liveDraft)

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
        addToast({ type: 'error', message: t('settings.workflows.editor.validationTitle') })
        return
      }

      const requestTemplate = validation.template ?? templateDraft
      const response = editorMode === 'edit'
        ? await sessionsApi.updateWorkflowTemplate(templateDraft.id, { template: requestTemplate })
        : await sessionsApi.createWorkflowTemplate({ template: requestTemplate })
      setErrors([])
      addToast({
        type: 'success',
        message: t('settings.workflows.editor.saveSuccess', { name: response.template.name }),
      })

      onSaved?.(response.template)
    } catch (error) {
      const validationError = errorToValidationError(error)
      setErrors([validationError])
      addToast({ type: 'error', message: validationError.message })
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
                { value: 'artifact-gate', label: 'Artifact gate' },
                { value: 'user-choice', label: 'User choice' },
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

          <PhaseSkillBindingsSelector
            phaseName={selectedPhase.name || selectedPhase.id || t('settings.workflows.editor.untitledPhase')}
            catalog={skillCatalog}
            selectedReferences={selectedPhase.skillReferences}
            loading={isCatalogLoading || isSkillListLoading}
            error={skillCatalogError}
            onChange={replacePhaseSkillBindings}
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
                <TextField id="workflow-template-labels" label="Workflow labels" value={draft.labels} onChange={(value) => updateTemplate('labels', value)} />
                <TextArea id="workflow-template-routing-policy" label="Routing policy JSON" value={draft.routingPolicy} onChange={(value) => updateTemplate('routingPolicy', value)} rows={3} />
                <TextArea id="workflow-template-stop-conditions" label="Stop conditions" value={draft.stopConditions} onChange={(value) => updateTemplate('stopConditions', value)} rows={2} />
                <TextField id="workflow-phase-requested-model" label={t('settings.workflows.editor.requestedModel')} value={selectedPhase.requestedModel} onChange={(value) => updatePhase('requestedModel', value)} />
                <TextField id="workflow-phase-applies-to" label="Phase applies to labels" value={selectedPhase.appliesTo} onChange={(value) => updatePhase('appliesTo', value)} />
                <TextField id="workflow-phase-skip-labels" label="Skip when labels" value={selectedPhase.skipLabels} onChange={(value) => updatePhase('skipLabels', value)} />
                <TextField id="workflow-phase-skip-efforts" label="Skip when efforts" value={selectedPhase.skipEfforts} onChange={(value) => updatePhase('skipEfforts', value)} />
                <TextArea id="workflow-phase-mode-policy-light" label="Light mode policy" value={selectedPhase.modePolicyLight} onChange={(value) => updatePhase('modePolicyLight', value)} rows={2} />
                <TextArea id="workflow-phase-mode-policy-standard" label="Standard mode policy" value={selectedPhase.modePolicyStandard} onChange={(value) => updatePhase('modePolicyStandard', value)} rows={2} />
                <TextArea id="workflow-phase-mode-policy-heavy" label="Heavy mode policy" value={selectedPhase.modePolicyHeavy} onChange={(value) => updatePhase('modePolicyHeavy', value)} rows={2} />
                <TextArea id="workflow-phase-skill-bindings" label="Skill bindings JSON" value={selectedPhase.skillBindings} onChange={(value) => updatePhase('skillBindings', value)} rows={3} />
                <TextArea id="workflow-phase-runtime-contract" label="Runtime contract JSON" value={selectedPhase.runtimeContract} onChange={(value) => updatePhase('runtimeContract', value)} rows={4} />
                <TextArea id="workflow-phase-output-artifacts" label="Output artifacts JSON" value={selectedPhase.outputArtifacts} onChange={(value) => updatePhase('outputArtifacts', value)} rows={4} />
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
    labels: toCommaText(source.labels),
    routingPolicy: source.routingPolicy ? JSON.stringify(source.routingPolicy, null, 2) : '',
    stopConditions: toLinesText(source.stopConditions),
    phases: source.phases.length > 0
      ? source.phases.map(toPhaseDraft)
      : [DEFAULT_PHASE],
  }
}

function templateIdentity(template?: WorkflowTemplateDraft | null): string {
  if (!template) return 'new'
  return `${template.source ?? 'user'}:${template.id}:${template.version}`
}

function mergeLiveEditorValues(draft: TemplateEditorDraft, selectedPhaseIndex: number): TemplateEditorDraft {
  const phases = draft.phases.map((phase, index) => {
    if (index !== selectedPhaseIndex) return phase
    return {
      ...phase,
      id: liveFieldValue('workflow-phase-id', phase.id),
      name: liveFieldValue('workflow-phase-name', phase.name),
      role: liveFieldValue('workflow-phase-role', phase.role),
      objective: liveFieldValue('workflow-phase-objective', phase.objective),
      intake: liveFieldValue('workflow-phase-intake', phase.intake),
      instructions: liveFieldValue('workflow-phase-instructions', phase.instructions),
      executionRules: liveFieldValue('workflow-phase-execution-rules', phase.executionRules),
      transitionAuthority: liveFieldValue('workflow-phase-transition-authority', phase.transitionAuthority) as PhaseDraft['transitionAuthority'],
      outputArtifactName: liveFieldValue('workflow-output-artifact-name', phase.outputArtifactName),
      outputArtifactKind: liveFieldValue('workflow-output-artifact-kind', phase.outputArtifactKind),
      outputArtifactDescription: liveFieldValue('workflow-output-artifact-description', phase.outputArtifactDescription),
      handoff: liveFieldValue('workflow-phase-handoff', phase.handoff),
      completionCriteriaDescription: liveFieldValue('workflow-phase-completion-criteria', phase.completionCriteriaDescription),
      requestedModel: liveFieldValue('workflow-phase-requested-model', phase.requestedModel),
      appliesTo: liveFieldValue('workflow-phase-applies-to', phase.appliesTo),
      skipLabels: liveFieldValue('workflow-phase-skip-labels', phase.skipLabels),
      skipEfforts: liveFieldValue('workflow-phase-skip-efforts', phase.skipEfforts),
      modePolicyLight: liveFieldValue('workflow-phase-mode-policy-light', phase.modePolicyLight),
      modePolicyStandard: liveFieldValue('workflow-phase-mode-policy-standard', phase.modePolicyStandard),
      modePolicyHeavy: liveFieldValue('workflow-phase-mode-policy-heavy', phase.modePolicyHeavy),
      skillBindings: liveFieldValue('workflow-phase-skill-bindings', phase.skillBindings),
      runtimeContract: liveFieldValue('workflow-phase-runtime-contract', phase.runtimeContract),
      outputArtifacts: liveFieldValue('workflow-phase-output-artifacts', phase.outputArtifacts),
    }
  })

  return {
    ...draft,
    id: liveFieldValue('workflow-template-id', draft.id),
    name: liveFieldValue('workflow-template-name', draft.name),
    description: liveFieldValue('workflow-template-description', draft.description),
    labels: liveFieldValue('workflow-template-labels', draft.labels),
    routingPolicy: liveFieldValue('workflow-template-routing-policy', draft.routingPolicy),
    stopConditions: liveFieldValue('workflow-template-stop-conditions', draft.stopConditions),
    phases,
  }
}

function liveFieldValue(id: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const element = document.getElementById(id)
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    return element.value
  }
  return fallback
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
  const skillReferences = phaseSkillReferences(phase)
  const skillBindings = Array.isArray(phase.skillBindings)
    ? phase.skillBindings
    : skillBindingsFromReferences(skillReferences, '')
  const transitionAuthority = contract.transitionAuthority === 'auto' ||
    contract.transitionAuthority === 'user-confirmation' ||
    contract.transitionAuthority === 'artifact-gate' ||
    contract.transitionAuthority === 'user-choice'
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
    appliesTo: toCommaText(phase.appliesTo),
    skipLabels: toCommaText(phase.skipWhen?.labels),
    skipEfforts: toCommaText(phase.skipWhen?.efforts),
    modePolicyLight: phase.modePolicy?.light ?? '',
    modePolicyStandard: phase.modePolicy?.standard ?? '',
    modePolicyHeavy: phase.modePolicy?.heavy ?? '',
    skillBindings: skillBindings.length > 0 ? JSON.stringify(skillBindings, null, 2) : '',
    runtimeContract: phase.runtimeContract ? JSON.stringify(phase.runtimeContract, null, 2) : '',
    outputArtifacts: phase.outputArtifacts ? JSON.stringify(phase.outputArtifacts, null, 2) : '',
    skillReferences,
  }
}

function toTemplateDraft(original: WorkflowTemplateDraft | null | undefined, draft: TemplateEditorDraft): WorkflowTemplateDraft {
  return {
    ...(original ?? {}),
    schemaVersion: original?.schemaVersion === 2 ? 2 : 1,
    id: draft.id.trim(),
    version: draft.version.trim() || '1',
    name: draft.name.trim(),
    description: draft.description.trim() || undefined,
    labels: normalizeWorkflowLabelsFromText(draft.labels),
    routingPolicy: parseJsonObject(draft.routingPolicy),
    stopConditions: toLines(draft.stopConditions),
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
  // Legacy tool policies remain in the template unchanged for import/export compatibility.
  // Workflow tool availability is no longer configurable or hard-enforced by phase.
  const baseContract: Record<string, unknown> = isRecord(originalContract) ? { ...originalContract } : {}
  const contract = {
    ...baseContract,
    instructions: draft.instructions.trim(),
    executionRules: toLines(draft.executionRules),
    actionPolicy,
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
    appliesTo: normalizeWorkflowLabelsFromText(draft.appliesTo),
    skipWhen: normalizeSkipWhenDraft(draft),
    modePolicy: normalizeModePolicyDraft(draft),
    skillBindings: parseJsonArray(draft.skillBindings) as WorkflowTemplatePhase['skillBindings'],
    runtimeContract: parseJsonObject(draft.runtimeContract),
    outputArtifacts: parseJsonArray(draft.outputArtifacts) as WorkflowTemplatePhase['outputArtifacts'],
    requestedModel: draft.requestedModel.trim() || undefined,
    skills: undefined,
  }
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
  onChange: (value: PhaseDraft['transitionAuthority']) => void
  options: Array<{ value: PhaseDraft['transitionAuthority']; label: string }>
}) {
  return (
    <label className="block min-w-0 text-xs font-medium text-[var(--color-text-secondary)]" htmlFor={id}>
      {label}
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as PhaseDraft['transitionAuthority'])}
        className="mt-1 h-9 w-full min-w-0 rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] px-2.5 text-sm text-[var(--color-text-primary)] outline-none transition-colors focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  )
}

function PhaseSkillBindingsSelector({
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
      displayName: catalogItem?.displayName ?? reference.name,
      source: reference.source ?? catalogItem?.source ?? 'unknown',
    }
  })

  return (
    <section
      role="group"
      aria-label={t('settings.workflows.editor.phaseSkillBindingsLabel', { phase: phaseName })}
      className="mt-3 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] p-3"
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h5 className="text-xs font-semibold text-[var(--color-text-primary)]">
            {t('settings.workflows.editor.phaseSkillBindings')}
          </h5>
          <p className="mt-0.5 text-[11px] leading-4 text-[var(--color-text-tertiary)]">
            {t('settings.workflows.editor.phaseSkillBindingsHint')}
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
              {t('settings.workflows.editor.noPhaseSkillBindings')}
            </p>
          )}
        </div>
        <button
          type="button"
          aria-label={t('settings.workflows.editor.choosePhaseSkillBindingsLabel', { phase: phaseName })}
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
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const [query, setQuery] = useState('')
  const [draftKeys, setDraftKeys] = useState<Set<string>>(() => (
    new Set(selectedReferences.map((reference) => skillReferenceSelectionKey(reference, catalog)))
  ))

  useEffect(() => {
    if (!open) return
    setQuery('')
    setDraftKeys(new Set(selectedReferences.map((reference) => skillReferenceSelectionKey(reference, catalog))))
  }, [catalog, open, selectedReferences])

  useEffect(() => {
    if (!open) return
    const input = searchInputRef.current
    if (!input) return

    const syncQuery = () => setQuery(input.value)
    input.addEventListener('change', syncQuery)
    input.addEventListener('input', syncQuery)
    return () => {
      input.removeEventListener('change', syncQuery)
      input.removeEventListener('input', syncQuery)
    }
  }, [open])

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
        displayName: catalogItem?.displayName ?? name,
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
      title={t('settings.workflows.editor.choosePhaseSkillBindingsLabel', { phase: phaseName })}
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
              ref={searchInputRef}
              type="text"
              role="searchbox"
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
              {t('settings.workflows.editor.noPhaseSkillBindings')}
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

function toCommaText(value?: string[]) {
  return Array.isArray(value) ? value.join(', ') : ''
}

function toCommaList(value: string) {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeWorkflowLabelsFromText(value: string): WorkflowLabel[] | undefined {
  const labels = toCommaList(value) as WorkflowLabel[]
  return labels.length ? labels : undefined
}

function normalizeEffortsFromText(value: string): WorkflowEffortMode[] | undefined {
  const efforts = toCommaList(value) as WorkflowEffortMode[]
  return efforts.length ? efforts : undefined
}

function normalizeSkipWhenDraft(draft: PhaseDraft): WorkflowTemplatePhase['skipWhen'] | undefined {
  const labels = normalizeWorkflowLabelsFromText(draft.skipLabels)
  const efforts = normalizeEffortsFromText(draft.skipEfforts)
  if (!labels?.length && !efforts?.length) return undefined
  return {
    ...(labels?.length ? { labels } : {}),
    ...(efforts?.length ? { efforts } : {}),
  }
}

function normalizeModePolicyDraft(draft: PhaseDraft): WorkflowTemplatePhase['modePolicy'] | undefined {
  const policy = {
    ...(draft.modePolicyLight.trim() ? { light: draft.modePolicyLight.trim() } : {}),
    ...(draft.modePolicyStandard.trim() ? { standard: draft.modePolicyStandard.trim() } : {}),
    ...(draft.modePolicyHeavy.trim() ? { heavy: draft.modePolicyHeavy.trim() } : {}),
  }
  return Object.keys(policy).length ? policy : undefined
}

function parseJsonObject(value: string): Record<string, unknown> | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  try {
    const parsed = JSON.parse(trimmed) as unknown
    return isRecord(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function parseJsonArray(value: string): unknown[] | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  try {
    const parsed = JSON.parse(trimmed) as unknown
    return Array.isArray(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
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


function phaseSkillReferences(phase: WorkflowTemplatePhase): WorkflowTemplateSkillDeclaration[] {
  const bindingReferences = skillBindingReferencesFromBindings(phase.skillBindings)
  if (bindingReferences.length > 0 || (Array.isArray(phase.skillBindings) && phase.skillBindings.length === 0)) {
    return bindingReferences
  }
  return Array.isArray(phase.skills) ? phase.skills : []
}

function skillReferencesFromSkillBindingsText(
  value: string,
  fallback: WorkflowTemplateSkillDeclaration[],
): WorkflowTemplateSkillDeclaration[] {
  if (!value.trim()) return []
  const parsed = parseJsonArray(value)
  if (!parsed) return fallback
  return skillBindingReferencesFromBindings(parsed as WorkflowTemplatePhase['skillBindings'])
}

function skillBindingReferencesFromBindings(
  bindings: WorkflowTemplatePhase['skillBindings'] | unknown,
): WorkflowTemplateSkillDeclaration[] {
  if (!Array.isArray(bindings)) return []
  const references: WorkflowTemplateSkillDeclaration[] = []
  for (const binding of bindings) {
    const id = skillBindingId(binding)
    if (!id) continue
    const source = skillSourceFromBindingId(id)
    references.push({
      name: id,
      ...(source ? { source } : {}),
      referenceId: id,
    })
  }
  return references
}

function skillBindingsFromReferences(
  references: WorkflowTemplateSkillDeclaration[],
  existingBindingsText: string,
): NonNullable<WorkflowTemplatePhase['skillBindings']> {
  const existingBindings = parseJsonArray(existingBindingsText) ?? []
  const existingById = new Map<string, string | { id: string; mode?: 'native-if-installed' | 'fallback-contract' | 'native-if-installed-else-fallback-contract' | 'disabled' }>()
  for (const binding of existingBindings) {
    const id = skillBindingId(binding)
    if (id && (typeof binding === 'string' || isSkillBindingObject(binding))) {
      existingById.set(id, binding)
    }
  }
  return references
    .map((reference) => {
      const id = skillBindingIdFromReference(reference)
      if (!id) return null
      return existingById.get(id) ?? id
    })
    .filter((binding): binding is NonNullable<WorkflowTemplatePhase['skillBindings']>[number] => binding !== null)
}

function skillBindingId(binding: unknown): string | null {
  if (typeof binding === 'string') return binding.trim() || null
  if (isSkillBindingObject(binding)) return binding.id.trim() || null
  return null
}

function isSkillBindingObject(value: unknown): value is { id: string; mode?: 'native-if-installed' | 'fallback-contract' | 'native-if-installed-else-fallback-contract' | 'disabled' } {
  return isRecord(value) && typeof value.id === 'string'
}

function skillBindingIdFromReference(reference: WorkflowTemplateSkillDeclaration): string {
  const referenceId = typeof reference.referenceId === 'string' ? reference.referenceId.trim() : ''
  if (referenceId) return referenceId
  const name = reference.name.trim()
  if (!name) return ''
  if (name.includes(':')) return name
  return reference.source ? `${reference.source}:${name}` : name
}

function skillBindingIdFromCatalog(skill: SkillCatalogItem): string {
  const referenceId = skill.referenceId?.trim() || skill.provenance?.referenceId?.trim()
  if (referenceId) return referenceId
  if (skill.name.includes(':')) return skill.name
  return `${skill.source}:${skill.name}`
}

function skillSourceFromBindingId(id: string): WorkflowTemplateSkillDeclaration['source'] | undefined {
  const source = id.split(':', 1)[0]
  if (
    source === 'workflow' ||
    source === 'fallback' ||
    source === 'superpowers' ||
    source === 'spec-kit-plus' ||
    source === 'codex' ||
    source === 'claude-code' ||
    source === 'user' ||
    source === 'project' ||
    source === 'plugin' ||
    source === 'mcp' ||
    source === 'bundled'
  ) {
    return source
  }
  return undefined
}

function skillToRecommendedReference(skill: SkillCatalogItem): WorkflowTemplateSkillDeclaration {
  const bindingId = skillBindingIdFromCatalog(skill)
  return {
    name: bindingId,
    mode: 'recommended',
    source: skill.source,
    ...(skill.pluginName ? { pluginName: skill.pluginName } : {}),
    ...(skill.namespace ? { namespace: skill.namespace } : {}),
    ...(skill.version ? { version: skill.version } : {}),
    ...(skill.contentHash ? { contentHash: skill.contentHash } : {}),
    referenceId: bindingId,
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
  const bindingId = skillBindingIdFromReference(reference)
  return (
    skill.name === reference.name ||
    skill.referenceId === reference.referenceId ||
    skill.provenance?.referenceId === reference.referenceId ||
    skillBindingIdFromCatalog(skill) === bindingId
  ) &&
    (!reference.source || skill.source === reference.source) &&
    (!reference.pluginName || skill.pluginName === reference.pluginName) &&
    (!reference.namespace || skill.namespace === reference.namespace) &&
    (!reference.version || skill.version === reference.version) &&
    (!reference.contentHash || skill.contentHash === reference.contentHash)
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
