import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { type ExpertDefinition, type ExpertPackCreateInput, type ExpertPackSummary, type ExpertPackUpdateInput, type ExpertToolManifest } from '../../api/experts'
import { useTranslation } from '../../i18n'
import { useSkillStore } from '../../stores/skillStore'
import { Button } from '../shared/Button'
import { Modal } from '../shared/Modal'
import type { SkillCatalogItem } from '../../types/skill'

type ExpertPackEditorProps = {
  open: boolean
  mode: 'create' | 'edit'
  pack: ExpertPackSummary | null
  saving?: boolean
  onSave?: (input: ExpertPackUpdateInput | ExpertPackCreateInput) => Promise<void>
  onClose: () => void
}

type ExpertHostTool = ExpertDefinition['hostTools'][number]
type ExpertPermission = ExpertDefinition['permissions'][number]
type ExpertIntakeFlow = NonNullable<ExpertDefinition['intakeFlow']>
type ExpertIntakeStep = ExpertIntakeFlow['steps'][number]

type EditorDraft = {
  packId: string
  name: string
  version: string
  description: string
  minHostVersion: string
  compatibilityJson: string
  selfContained: boolean
  portabilityNotes: string
  expertId: string
  expertName: string
  expertDescription: string
  statusLabel: string
  systemPromptContent: string
  skillIds: string[]
  hostTools: ExpertHostTool[]
  permissions: ExpertPermission[]
  intakeFlow: ExpertIntakeFlow
  outputProtocolContent: string
  tools: ExpertToolManifest[]
}

const RUNTIME_TOOLS = [
  { id: 'Read', name: 'Read', purpose: 'Read workspace files.' },
  { id: 'Write', name: 'Write', purpose: 'Create workspace files.' },
  { id: 'Edit', name: 'Edit', purpose: 'Edit workspace files.' },
  { id: 'MultiEdit', name: 'MultiEdit', purpose: 'Apply multiple file edits.' },
  { id: 'NotebookEdit', name: 'NotebookEdit', purpose: 'Edit notebook cells.' },
  { id: 'Bash', name: 'Bash', purpose: 'Run shell commands.' },
  { id: 'PowerShell', name: 'PowerShell', purpose: 'Run PowerShell commands.' },
  { id: 'Glob', name: 'Glob', purpose: 'Find files by pattern.' },
  { id: 'Grep', name: 'Grep', purpose: 'Search workspace content.' },
  { id: 'WebSearch', name: 'WebSearch', purpose: 'Search the web.' },
  { id: 'WebFetch', name: 'WebFetch', purpose: 'Fetch web content.' },
] as const

const DEFAULT_INTAKE_FLOW: ExpertIntakeFlow = { version: 1, steps: [] }

export function ExpertPackEditor({ open, mode, pack, saving = false, onSave, onClose }: ExpertPackEditorProps) {
  const t = useTranslation()
  const { catalog, skills, isCatalogLoading, isLoading: isSkillListLoading, error: skillError, fetchCatalog } = useSkillStore()
  const [draft, setDraft] = useState<EditorDraft>(() => toEditorDraft(pack, mode))
  const [skillPickerOpen, setSkillPickerOpen] = useState(false)
  const [skillQuery, setSkillQuery] = useState('')
  const [toolArchiveNames, setToolArchiveNames] = useState<string[]>([])
  const [toolArchivesBase64, setToolArchivesBase64] = useState<string[]>([])
  const [removeToolIds, setRemoveToolIds] = useState<string[]>([])
  const [validationError, setValidationError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setDraft(toEditorDraft(pack, mode))
    setSkillPickerOpen(false)
    setSkillQuery('')
    setToolArchiveNames([])
    setToolArchivesBase64([])
    setRemoveToolIds([])
    setValidationError(null)
    void fetchCatalog()
  }, [fetchCatalog, mode, open, pack])

  const skillCatalog = catalog.length > 0 ? catalog : skills
  const visibleSkills = useMemo(() => {
    const query = skillQuery.trim().toLowerCase()
    if (!query) return skillCatalog
    return skillCatalog.filter((skill) => `${skill.displayName ?? skill.name} ${skill.description} ${skill.source}`.toLowerCase().includes(query))
  }, [skillCatalog, skillQuery])

  const update = <K extends keyof EditorDraft>(field: K, value: EditorDraft[K]) => {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  const toggleHostTool = (tool: typeof RUNTIME_TOOLS[number]) => {
    setDraft((current) => {
      const exists = current.hostTools.some((item) => item.id === tool.id)
      return {
        ...current,
        hostTools: exists ? current.hostTools.filter((item) => item.id !== tool.id) : [...current.hostTools, tool],
      }
    })
  }

  const toggleSkill = (skill: SkillCatalogItem) => {
    const id = skillBindingId(skill)
    update('skillIds', draft.skillIds.includes(id) ? draft.skillIds.filter((value) => value !== id) : [...draft.skillIds, id])
  }

  const removeLocalTool = (tool: ExpertToolManifest) => {
    update('tools', draft.tools.filter((item) => item.id !== tool.id))
    setRemoveToolIds((current) => current.includes(tool.id) ? current : [...current, tool.id])
  }

  const handleToolArchiveChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length === 0) return
    try {
      const encoded = await Promise.all(files.map(fileToBase64))
      setToolArchiveNames((current) => [...current, ...files.map((file) => file.name)])
      setToolArchivesBase64((current) => [...current, ...encoded])
      setValidationError(null)
    } catch (cause) {
      setValidationError(errorMessage(cause))
    }
  }

  const handleSave = async () => {
    if (!onSave) return
    const normalizedPackId = draft.packId.trim()
    const normalizedExpertId = draft.expertId.trim()
    if (!normalizedPackId || !normalizedExpertId || !draft.name.trim() || !draft.expertName.trim()) {
      setValidationError(t('settings.experts.editor.requiredFields'))
      return
    }
    const compatibility = parseCompatibility(draft.compatibilityJson, setValidationError, t)
    if (draft.compatibilityJson.trim() && !compatibility) return
    setValidationError(null)
    const expert = {
      id: normalizedExpertId,
      name: draft.expertName.trim(),
      description: draft.expertDescription,
      statusLabel: draft.statusLabel,
      systemPromptContent: draft.systemPromptContent,
      skillIds: draft.skillIds,
      intakeFlow: draft.intakeFlow,
      outputProtocolContent: draft.outputProtocolContent,
    }
    const shared = {
      name: draft.name.trim(),
      version: draft.version.trim(),
      description: draft.description,
      minHostVersion: draft.minHostVersion.trim() || '',
      compatibility,
      portability: { selfContained: draft.selfContained, notes: draft.portabilityNotes.trim() || undefined },
      hostTools: draft.hostTools,
      permissions: draft.permissions,
      expert,
      tools: draft.tools,
      removeToolIds,
      toolArchivesBase64,
    }
    if (mode === 'create') {
      await onSave({ ...shared, packId: normalizedPackId, expert: { ...expert, id: normalizedExpertId, name: draft.expertName.trim() } })
    } else {
      await onSave(shared)
    }
  }

  const title = mode === 'create'
    ? t('settings.experts.editor.createTitle')
    : t('settings.experts.editor.editTitle', { name: pack?.name ?? pack?.experts[0]?.name ?? '' })

  return (
    <Modal
      open={open}
      onClose={saving ? () => {} : onClose}
      title={title}
      width={1060}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
          <Button onClick={() => void handleSave()} loading={saving} disabled={saving}>{t('settings.experts.editor.save')}</Button>
        </>
      )}
    >
      <div data-testid="expert-pack-editor" className="space-y-4">
        <div className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] px-4 py-3">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{t('settings.experts.editor.frameworkTitle')}</h3>
          <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">{t('settings.experts.editor.frameworkHint')}</p>
        </div>

        {validationError ? <div className="rounded-[8px] border border-[var(--color-error)]/30 bg-[var(--color-error)]/8 px-3 py-2 text-sm text-[var(--color-error)]">{validationError}</div> : null}

        <section className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] p-4">
          <SectionTitle title={t('settings.experts.editor.basicGroup')} />
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <TextField id="expert-pack-id" label={t('settings.experts.editor.packId')} value={draft.packId} onChange={(value) => update('packId', value)} disabled={mode === 'edit'} mono />
            <TextField id="expert-version" label={t('settings.experts.editor.version')} value={draft.version} onChange={(value) => update('version', value)} />
            <TextField id="expert-pack-name" label={t('settings.experts.editor.packName')} value={draft.name} onChange={(value) => update('name', value)} />
            <TextField id="expert-name" label={t('settings.experts.editor.expertName')} value={draft.expertName} onChange={(value) => update('expertName', value)} />
            <TextField id="expert-status-label" label={t('settings.experts.editor.statusLabel')} value={draft.statusLabel} onChange={(value) => update('statusLabel', value)} />
            <TextField id="expert-min-host-version" label={t('settings.experts.editor.minHostVersion')} value={draft.minHostVersion} onChange={(value) => update('minHostVersion', value)} />
            <TextField id="expert-portability-notes" label={t('settings.experts.editor.portabilityNotes')} value={draft.portabilityNotes} onChange={(value) => update('portabilityNotes', value)} />
            <TextField id="expert-id" label={t('settings.experts.editor.expertId')} value={draft.expertId} onChange={(value) => update('expertId', value)} disabled={mode === 'edit'} mono />
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <TextArea id="expert-compatibility" label={t('settings.experts.editor.compatibilityJson')} value={draft.compatibilityJson} onChange={(value) => update('compatibilityJson', value)} rows={4} mono />
             <label className="flex items-center gap-2 self-end pb-2 text-xs text-[var(--color-text-secondary)]"><input type="checkbox" checked={draft.selfContained} onChange={(event) => update('selfContained', event.target.checked)} />{t('settings.experts.editor.selfContained')}</label>
             <TextArea id="expert-pack-description" label={t('settings.experts.editor.packDescription')} value={draft.description} onChange={(value) => update('description', value)} rows={3} />
            <TextArea id="expert-description" label={t('settings.experts.editor.expertDescription')} value={draft.expertDescription} onChange={(value) => update('expertDescription', value)} rows={3} />
          </div>
        </section>

        <section className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] p-4">
          <SectionTitle title={t('settings.experts.editor.promptGroup')} />
          <div className="mt-3"><TextArea id="expert-system-prompt" label={t('settings.experts.editor.systemPrompt')} value={draft.systemPromptContent} onChange={(value) => update('systemPromptContent', value)} rows={9} mono /></div>
        </section>

        <SkillBindingEditor
          catalog={visibleSkills}
          selectedIds={draft.skillIds}
          pickerOpen={skillPickerOpen}
          query={skillQuery}
          loading={isCatalogLoading || isSkillListLoading}
          error={skillError}
          onQueryChange={setSkillQuery}
          onTogglePicker={() => setSkillPickerOpen((value) => !value)}
          onToggle={toggleSkill}
          onRemove={(id) => update('skillIds', draft.skillIds.filter((value) => value !== id))}
          allCatalog={skillCatalog}
        />

        <ToolAccessEditor hostTools={draft.hostTools} tools={draft.tools} onToggle={toggleHostTool} onRemove={removeLocalTool} onToolArchiveChange={handleToolArchiveChange} archiveNames={toolArchiveNames} />

        <IntakeEditor flow={draft.intakeFlow} onChange={(flow) => update('intakeFlow', flow)} />

        <section className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] p-4">
          <SectionTitle title={t('settings.experts.editor.outputProtocol')} />
          <div className="mt-3"><TextArea id="expert-output-protocol" label={t('settings.experts.editor.outputProtocolContent')} value={draft.outputProtocolContent} onChange={(value) => update('outputProtocolContent', value)} rows={6} mono /></div>
        </section>

        <PermissionEditor permissions={draft.permissions} onChange={(permissions) => update('permissions', permissions)} />
      </div>
    </Modal>
  )
}

function SectionTitle({ title }: { title: string }) {
  return <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">{title}</h4>
}

function TextField({ id, label, value, onChange, disabled = false, mono = false }: { id: string; label: string; value: string; onChange: (value: string) => void; disabled?: boolean; mono?: boolean }) {
  return <label className="block text-xs font-medium text-[var(--color-text-secondary)]" htmlFor={id}>{label}<input id={id} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className={`mt-1 h-9 w-full rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20 disabled:cursor-not-allowed disabled:opacity-60 ${mono ? 'font-mono' : ''}`} /></label>
}

function TextArea({ id, label, value, onChange, rows, mono = false }: { id: string; label: string; value: string; onChange: (value: string) => void; rows: number; mono?: boolean }) {
  return <label className="block text-xs font-medium text-[var(--color-text-secondary)]" htmlFor={id}>{label}<textarea id={id} value={value} rows={rows} onChange={(event) => onChange(event.target.value)} className={`mt-1 w-full resize-y rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-2 text-sm leading-5 text-[var(--color-text-primary)] outline-none focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20 ${mono ? 'font-mono' : ''}`} /></label>
}

function SkillBindingEditor({ catalog, allCatalog, selectedIds, pickerOpen, query, loading, error, onQueryChange, onTogglePicker, onToggle, onRemove }: { catalog: SkillCatalogItem[]; allCatalog: SkillCatalogItem[]; selectedIds: string[]; pickerOpen: boolean; query: string; loading: boolean; error: string | null; onQueryChange: (value: string) => void; onTogglePicker: () => void; onToggle: (skill: SkillCatalogItem) => void; onRemove: (id: string) => void }) {
  const t = useTranslation()
  const selected = selectedIds.map((id) => allCatalog.find((skill) => skillBindingId(skill) === id) ?? ({ name: id, displayName: id, source: 'user', description: '', userInvocable: false, contentLength: 0, hasDirectory: false } as SkillCatalogItem))
  return <section role="group" aria-label={t('settings.experts.editor.skills')} className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] p-4">
    <div className="flex items-start justify-between gap-3"><div><SectionTitle title={t('settings.experts.editor.skills')} /><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{t('settings.experts.editor.skillsHint')}</p></div><button type="button" onClick={onTogglePicker} className="rounded-[7px] bg-[var(--color-brand)] px-3 py-1.5 text-xs font-medium text-white">{t('settings.experts.editor.chooseSkills')}</button></div>
    <div className="mt-3 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">{selected.length ? <div className="flex flex-wrap gap-2">{selected.map((skill) => <span key={skillBindingId(skill)} className="inline-flex items-center gap-1.5 rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] px-2 py-1 text-xs"><span className="font-medium text-[var(--color-text-primary)]">{skill.displayName ?? skill.name}</span><span className="text-[var(--color-text-tertiary)]">{skill.source}</span><button type="button" aria-label={t('settings.experts.editor.removeSkill', { skill: skill.displayName ?? skill.name })} onClick={() => onRemove(skillBindingId(skill))} className="text-[var(--color-text-tertiary)] hover:text-[var(--color-error)]"></button></span>)}</div> : <p className="text-xs text-[var(--color-text-tertiary)]">{t('settings.experts.editor.noSkills')}</p>}</div>
    {pickerOpen ? <div className="mt-3 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] p-3"><input aria-label={t('settings.experts.editor.searchSkills')} value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder={t('settings.experts.editor.searchSkills')} className="h-9 w-full rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] px-2.5 text-sm outline-none" />{loading ? <p className="mt-3 text-xs text-[var(--color-text-tertiary)]">{t('settings.experts.editor.loadingSkills')}</p> : error ? <p className="mt-3 text-xs text-[var(--color-error)]">{error}</p> : <div className="mt-3 grid max-h-52 gap-1.5 overflow-y-auto">{catalog.map((skill) => <label key={skillBindingId(skill)} className="flex items-center gap-2 rounded-[6px] px-2 py-1.5 text-xs hover:bg-[var(--color-surface-hover)]"><input type="checkbox" checked={selectedIds.includes(skillBindingId(skill))} onChange={() => onToggle(skill)} /><span className="min-w-0 flex-1 truncate">{skill.displayName ?? skill.name}</span><span className="text-[var(--color-text-tertiary)]">{skill.source}</span></label>)}</div>}</div> : null}
  </section>
}

function ToolAccessEditor({ hostTools, tools, onToggle, onRemove, onToolArchiveChange, archiveNames }: { hostTools: ExpertHostTool[]; tools: ExpertToolManifest[]; onToggle: (tool: typeof RUNTIME_TOOLS[number]) => void; onRemove: (tool: ExpertToolManifest) => void; onToolArchiveChange: (event: ChangeEvent<HTMLInputElement>) => void; archiveNames: string[] }) {
  const t = useTranslation()
  const ids = new Set(hostTools.map((tool) => tool.id))
  return <section role="group" aria-label={t('settings.experts.editor.tools')} className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] p-4"><div className="flex items-start justify-between gap-3"><div><SectionTitle title={t('settings.experts.editor.tools')} /><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{t('settings.experts.editor.toolsHint')}</p></div><label className="cursor-pointer rounded-[7px] border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--color-surface-hover)]">{t('settings.experts.editor.addToolZip')}<input type="file" accept=".zip,application/zip" multiple className="sr-only" onChange={onToolArchiveChange} /></label></div><div className="mt-3 grid gap-3 md:grid-cols-2"><div className="rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface)] p-3"><h5 className="text-[11px] font-semibold uppercase text-[var(--color-text-tertiary)]">{t('settings.experts.editor.commonTools')}</h5><div className="mt-2 grid gap-1.5">{RUNTIME_TOOLS.map((tool) => <label key={tool.id} className="flex items-center gap-2 rounded-[6px] px-2 py-1.5 text-xs hover:bg-[var(--color-surface-hover)]"><input type="checkbox" checked={ids.has(tool.id)} onChange={() => onToggle(tool)} /><span>{tool.name}</span></label>)}</div></div><div className="rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface)] p-3"><h5 className="text-[11px] font-semibold uppercase text-[var(--color-text-tertiary)]">{t('settings.experts.editor.zipTools')}</h5>{tools.length ? <div className="space-y-2">{tools.map((tool) => <div key={tool.id} className="flex items-start justify-between gap-2 rounded-[6px] border border-[var(--color-border)] px-2 py-2"><div className="min-w-0"><div className="truncate text-xs font-medium">{tool.name}</div><div className="mt-0.5 text-[11px] text-[var(--color-text-tertiary)]">{tool.purpose}</div><div className="mt-0.5 font-mono text-[10px] text-[var(--color-text-tertiary)]">{tool.type}</div></div><button type="button" onClick={() => onRemove(tool)} className="shrink-0 text-xs text-[var(--color-error)]">{t('settings.experts.editor.removeTool')}</button></div>)}</div> : <p className="text-xs text-[var(--color-text-tertiary)]">{t('settings.experts.editor.noZipTools')}</p>}{archiveNames.length ? <div className="mt-3 border-t border-[var(--color-border)] pt-2 text-[11px] text-[var(--color-text-tertiary)]">{t('settings.experts.editor.pendingToolArchives')}: {archiveNames.join(', ')}</div> : null}</div></div></section>
}

function IntakeEditor({ flow, onChange }: { flow: ExpertIntakeFlow; onChange: (flow: ExpertIntakeFlow) => void }) {
  const t = useTranslation()
  const updateStep = (index: number, patch: Partial<ExpertIntakeStep>) => onChange({ ...flow, steps: flow.steps.map((step, stepIndex) => stepIndex === index ? { ...step, ...patch } as ExpertIntakeStep : step) })
  const addStep = () => onChange({ ...flow, steps: [...flow.steps, { type: 'message', id: `step-${flow.steps.length + 1}`, markdown: '' }] })
  return <section className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] p-4"><div className="flex items-start justify-between gap-3"><div><SectionTitle title={t('settings.experts.editor.intake')} /><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{t('settings.experts.editor.intakeHint')}</p></div><button type="button" onClick={addStep} className="rounded-[7px] bg-[var(--color-brand)] px-3 py-1.5 text-xs font-medium text-white">{t('settings.experts.editor.addIntakeStep')}</button></div><div className="mt-3 space-y-3">{flow.steps.map((step, index) => <div key={step.id} className="rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface)] p-3"><div className="grid gap-3 md:grid-cols-[1fr_180px_auto]"><TextField id={`expert-intake-id-${index}`} label={t('settings.experts.editor.stepId')} value={step.id} onChange={(value) => updateStep(index, { id: value })} /><label className="block text-xs font-medium text-[var(--color-text-secondary)]">{t('settings.experts.editor.stepType')}<select value={step.type} onChange={(event) => updateStep(index, { type: event.target.value as ExpertIntakeStep['type'] })} className="mt-1 h-9 w-full rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] px-2 text-sm"><option value="message">Message</option><option value="question">Question</option><option value="form">Form</option></select></label><button type="button" onClick={() => onChange({ ...flow, steps: flow.steps.filter((_, stepIndex) => stepIndex !== index) })} className="mt-5 text-xs text-[var(--color-error)]">{t('settings.experts.editor.removeIntakeStep')}</button></div>{step.type === 'message' ? <div className="mt-3"><TextArea id={`expert-intake-message-${index}`} label={t('settings.experts.editor.messageMarkdown')} value={step.markdown} onChange={(value) => updateStep(index, { markdown: value })} rows={3} /></div> : step.type === 'question' ? <div className="mt-3"><TextArea id={`expert-intake-question-${index}`} label={t('settings.experts.editor.question')} value={step.question} onChange={(value) => updateStep(index, { question: value })} rows={2} /><TextArea id={`expert-intake-options-${index}`} label={t('settings.experts.editor.questionOptionsJson')} value={JSON.stringify(step.options, null, 2)} onChange={(value) => { try { const options = JSON.parse(value); if (Array.isArray(options)) updateStep(index, { options }) } catch { /* keep the last valid value */ } }} rows={4} mono /></div> : <div className="mt-3"><TextField id={`expert-intake-form-title-${index}`} label={t('settings.experts.editor.formTitle')} value={step.title} onChange={(value) => updateStep(index, { title: value })} /><TextArea id={`expert-intake-form-fields-${index}`} label={t('settings.experts.editor.formFieldsJson')} value={JSON.stringify(step.fields, null, 2)} onChange={(value) => { try { const fields = JSON.parse(value); if (Array.isArray(fields)) updateStep(index, { fields }) } catch { /* keep the last valid value */ } }} rows={6} mono /></div>}</div>)}</div>{flow.steps.length === 0 ? <p className="mt-3 text-xs text-[var(--color-text-tertiary)]">{t('settings.experts.editor.noIntakeSteps')}</p> : null}</section>
}

function PermissionEditor({ permissions, onChange }: { permissions: ExpertPermission[]; onChange: (permissions: ExpertPermission[]) => void }) {
  const t = useTranslation()
  const update = (index: number, field: keyof ExpertPermission, value: string) => onChange(permissions.map((permission, permissionIndex) => permissionIndex === index ? { ...permission, [field]: value } : permission))
  return <section className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] p-4"><div className="flex items-center justify-between gap-2"><SectionTitle title={t('settings.experts.editor.permissions')} /><button type="button" onClick={() => onChange([...permissions, { id: `permission-${permissions.length + 1}`, description: '' }])} className="rounded-[7px] border border-[var(--color-border)] px-3 py-1.5 text-xs hover:bg-[var(--color-surface-hover)]">{t('settings.experts.editor.addPermission')}</button></div><div className="mt-3 space-y-2">{permissions.map((permission, index) => <div key={`${permission.id}-${index}`} className="grid gap-2 md:grid-cols-[220px_1fr_auto]"><TextField id={`expert-permission-id-${index}`} label={t('settings.experts.editor.permissionId')} value={permission.id} onChange={(value) => update(index, 'id', value)} /><TextField id={`expert-permission-description-${index}`} label={t('settings.experts.editor.permissionDescription')} value={permission.description} onChange={(value) => update(index, 'description', value)} /><button type="button" onClick={() => onChange(permissions.filter((_, permissionIndex) => permissionIndex !== index))} className="mt-5 text-xs text-[var(--color-error)]">{t('settings.experts.editor.removePermission')}</button></div>)}</div></section>
}

function toEditorDraft(pack: ExpertPackSummary | null, mode: 'create' | 'edit'): EditorDraft {
  const expert = pack?.experts[0]
  const baseId = expert?.id ?? pack?.packId ?? ''
  return {
    packId: pack?.packId ?? '',
    name: pack?.name ?? '',
    version: pack?.version ?? '1.0.0',
    description: pack?.description ?? '',
    minHostVersion: pack?.manifest?.minHostVersion ?? '',
    compatibilityJson: JSON.stringify(pack?.manifest?.compatibility ?? {}, null, 2),
    selfContained: pack?.manifest?.portability?.selfContained ?? expert?.portable ?? true,
    portabilityNotes: pack?.manifest?.portability?.notes ?? '',
    expertId: baseId,
    expertName: expert?.name ?? (mode === 'create' ? '' : pack?.name ?? ''),
    expertDescription: expert?.description ?? '',
    statusLabel: expert?.statusLabel ?? '',
    systemPromptContent: expert?.systemPromptContent ?? '',
    skillIds: [...(expert?.skillIds ?? [])],
    hostTools: [...(expert?.hostTools ?? [])],
    permissions: [...(expert?.permissions ?? [])],
    intakeFlow: expert?.intakeFlow ?? DEFAULT_INTAKE_FLOW,
    outputProtocolContent: expert?.outputProtocolContent ?? '',
    tools: [...(expert?.tools ?? pack?.tools ?? [])],
  }
}

function parseCompatibility(value: string, setError: (message: string | null) => void, t: ReturnType<typeof useTranslation>): Record<string, unknown> | undefined {
  if (!value.trim()) {
    setError(null)
    return undefined
  }
  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Compatibility must be a JSON object.')
    setError(null)
    return parsed as Record<string, unknown>
  } catch {
    setError(t('settings.experts.editor.invalidCompatibility'))
    return undefined
  }
}

function skillBindingId(skill: SkillCatalogItem): string {
  return skill.referenceId?.trim() || skill.provenance?.referenceId?.trim() || (skill.name.includes(':') ? skill.name : `${skill.source}:${skill.name}`)
}

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}




