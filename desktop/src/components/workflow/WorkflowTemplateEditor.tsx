import { useEffect, useState } from 'react'
import { sessionsApi } from '../../api/sessions'
import { useTranslation } from '../../i18n'
import type {
  WorkflowTemplateCompletionCriteria,
  WorkflowTemplateDetail,
  WorkflowTemplateDraft,
  WorkflowTemplateSource,
  WorkflowTemplateOutputArtifact,
  WorkflowTemplatePhase,
  WorkflowTemplateSkillDeclaration,
  WorkflowTemplateTransitionPolicy,
  WorkflowTemplateValidationIssue,
} from '../../types/session'

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
  skills: string
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
  skills: '',
}

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
  const selectedPhase = draft.phases[selectedPhaseIndex] ?? draft.phases[0] ?? DEFAULT_PHASE
  const editorMode = mode ?? (template?.source === 'user' ? 'edit' : 'create')
  const originalSource = source ?? template?.source
  const canEditTemplate = originalSource !== 'builtin'

  useEffect(() => {
    setDraft(toEditorDraft(template))
    setErrors([])
    setSelectedPhaseIndex(0)
  }, [template])

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
      const validation = await sessionsApi.validateWorkflowTemplate({ template: templateDraft })
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
            <TextField id="workflow-phase-role" label={t('settings.workflows.editor.role')} value={selectedPhase.role} onChange={(value) => updatePhase('role', value)} />
            <TextField id="workflow-phase-objective" label={t('settings.workflows.editor.objective')} value={selectedPhase.objective} onChange={(value) => updatePhase('objective', value)} />
          </div>

          <div className="mt-3 grid min-w-0 gap-3">
            <TextArea id="workflow-phase-instructions" label={t('settings.workflows.editor.instructions')} value={selectedPhase.instructions} onChange={(value) => updatePhase('instructions', value)} rows={4} />
            <TextArea id="workflow-phase-intake" label={t('settings.workflows.editor.intake')} value={selectedPhase.intake} onChange={(value) => updatePhase('intake', value)} rows={2} />
          </div>

          <div className="mt-3 grid min-w-0 gap-3 md:grid-cols-2">
            <TextField id="workflow-output-artifact-name" label={t('settings.workflows.editor.outputArtifactName')} value={selectedPhase.outputArtifactName} onChange={(value) => updatePhase('outputArtifactName', value)} />
            <TextField id="workflow-output-artifact-kind" label={t('settings.workflows.editor.outputArtifactKind')} value={selectedPhase.outputArtifactKind} onChange={(value) => updatePhase('outputArtifactKind', value)} />
          </div>
          <div className="mt-3">
            <TextArea id="workflow-output-artifact-description" label={t('settings.workflows.editor.outputArtifactDescription')} value={selectedPhase.outputArtifactDescription} onChange={(value) => updatePhase('outputArtifactDescription', value)} rows={2} />
          </div>

          <div className="mt-3 grid min-w-0 gap-3">
            <TextArea id="workflow-phase-handoff" label={t('settings.workflows.editor.handoff')} value={selectedPhase.handoff} onChange={(value) => updatePhase('handoff', value)} rows={3} />
            <TextArea id="workflow-phase-execution-rules" label={t('settings.workflows.editor.executionRules')} value={selectedPhase.executionRules} onChange={(value) => updatePhase('executionRules', value)} rows={2} />
            <TextArea id="workflow-phase-completion-criteria" label={t('settings.workflows.editor.completionCriteria')} value={selectedPhase.completionCriteriaDescription} onChange={(value) => updatePhase('completionCriteriaDescription', value)} rows={2} />
            <SelectField id="workflow-phase-transition-authority" label={t('settings.workflows.editor.transitionAuthority')} value={selectedPhase.transitionAuthority} onChange={(value) => updatePhase('transitionAuthority', value)} options={[
              { value: 'user-confirmation', label: t('settings.workflows.editor.transitionAuthority.user') },
              { value: 'auto', label: t('settings.workflows.editor.transitionAuthority.auto') },
            ]} />
          </div>

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
                <TextArea id="workflow-phase-skills" label={t('settings.workflows.editor.skills')} value={selectedPhase.skills} onChange={(value) => updatePhase('skills', value)} rows={3} />
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
  const outputArtifact = phase.outputArtifact
  const firstRequiredArtifact = phase.requiredArtifacts?.find((artifact) => artifact.required) ?? phase.requiredArtifacts?.[0]
  const artifactId = outputArtifact?.id ?? firstRequiredArtifact?.id ?? ''
  const artifactName = outputArtifact?.name ?? firstRequiredArtifact?.name ?? artifactId

  return {
    id: phase.id,
    name: phase.name,
    role: typeof phase.role === 'string' ? phase.role : '',
    instructions: phase.instructions,
    objective: phase.objective ?? '',
    intake: toLinesText(phase.requiredIntake),
    outputArtifactId: artifactId,
    outputArtifactName: artifactName,
    outputArtifactKind: outputArtifact?.kind ?? 'markdown',
    outputArtifactDescription: outputArtifact?.description ?? firstRequiredArtifact?.description ?? '',
    handoff: toLinesText(phase.handoffRules),
    executionRules: toLinesText(phase.executionRules),
    completionCriteriaType: phase.completionCriteria?.type ?? 'artifact-required',
    completionCriteriaDescription: phase.completionCriteria?.description ?? '',
    transitionAuthority: phase.transition?.authority ?? 'user-confirmation',
    requestedModel: typeof phase.requestedModel === 'string' ? phase.requestedModel : '',
    skills: toSkillsText(phase.skills),
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

  return {
    ...(original ?? {}),
    id: draft.id.trim(),
    name: draft.name.trim(),
    role: draft.role.trim() || undefined,
    instructions: draft.instructions.trim(),
    objective: draft.objective.trim() || undefined,
    requiredIntake: toLines(draft.intake),
    handoffRules: toLines(draft.handoff),
    executionRules: toLines(draft.executionRules),
    outputArtifact,
    requiredArtifacts: [
      {
        ...(original?.requiredArtifacts?.[0] ?? {}),
        id: outputArtifact.id,
        name: outputArtifact.name,
        description: outputArtifact.description,
        required: true,
      },
    ],
    completionCriteria,
    transition,
    requestedModel: draft.requestedModel.trim() || undefined,
    skills: toSkills(draft.skills),
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

function toLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function toLinesText(value?: string[]) {
  return Array.isArray(value) ? value.join('\n') : ''
}

function toSkills(value: string): WorkflowTemplateSkillDeclaration[] | undefined {
  const skills = toLines(value).flatMap((line) => {
    const [name, reason] = line.split('|').map((part) => part.trim())
    if (!name) return []
    return reason ? [{ name, reason }] : [{ name }]
  })

  return skills.length > 0 ? skills : undefined
}

function toSkillsText(value?: WorkflowTemplateSkillDeclaration[]) {
  if (!Array.isArray(value)) return ''

  return value
    .map((skill) => skill.reason ? `${skill.name} | ${skill.reason}` : skill.name)
    .join('\n')
}

function slugFromText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
