import { useEffect, useMemo, useState } from 'react'
import { expertsApi, type ExpertPackCreateInput, type ExpertPackSummary, type ExpertPackUpdateInput } from '../../api/experts'
import { useTranslation } from '../../i18n'
import { useUIStore } from '../../stores/uiStore'
import { Button } from '../shared/Button'
import { ConfirmDialog } from '../shared/ConfirmDialog'
import { ExpertImportExportDialog } from './ExpertImportExportDialog'
import { ExpertPackEditor } from './ExpertPackEditor'

export function ExpertPackManager() {
  const t = useTranslation()
  const addToast = useUIStore((state) => state.addToast)
  const [packs, setPacks] = useState<ExpertPackSummary[]>([])
  const [selectedPackIds, setSelectedPackIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busyPackId, setBusyPackId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create')
  const [editorPack, setEditorPack] = useState<ExpertPackSummary | null>(null)
  const [dialogMode, setDialogMode] = useState<'import' | 'export' | null>(null)
  const [pendingDelete, setPendingDelete] = useState<ExpertPackSummary | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const loadPacks = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await expertsApi.listPacks()
      setPacks(response.packs)
      setSelectedPackIds((current) => {
        const available = new Set(response.packs.map((pack) => pack.packId))
        const next = current.filter((packId) => available.has(packId))
        return next.length > 0 || response.packs.length === 0 ? next : response.packs.map((pack) => pack.packId)
      })
    } catch (cause) {
      setError(errorMessage(cause))
      setPacks([])
      setSelectedPackIds([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadPacks()
  }, [])

  const sortedPacks = useMemo(() => [...packs].sort((a, b) => a.name.localeCompare(b.name)), [packs])
  const selectedSet = useMemo(() => new Set(selectedPackIds), [selectedPackIds])

  const openCreateEditor = () => {
    setActionError(null)
    setEditorPack(null)
    setEditorMode('create')
    setEditorOpen(true)
  }

  const openEditEditor = (pack: ExpertPackSummary) => {
    if (pack.experts.length !== 1) {
      setActionError('Only Expert ZIP packages containing exactly one expert can be edited.')
      return
    }
    setActionError(null)
    setEditorPack(pack)
    setEditorMode('edit')
    setEditorOpen(true)
  }

  const handleCopy = async (pack: ExpertPackSummary) => {
    setBusyPackId(pack.packId)
    setActionError(null)
    try {
      const result = await expertsApi.copyPack(pack.packId)
      await loadPacks()
      setEditorPack(result.pack)
      setEditorMode('edit')
      setEditorOpen(true)
      const message = t('settings.experts.manager.copySuccess', { name: result.pack.name })
      addToast({ type: 'success', message })
    } catch (cause) {
      const message = errorMessage(cause)
      setActionError(message)
      addToast({ type: 'error', message })
    } finally {
      setBusyPackId(null)
    }
  }

  const handleSave = async (input: ExpertPackUpdateInput | ExpertPackCreateInput) => {
    setSaving(true)
    setActionError(null)
    try {
      const result = editorMode === 'create'
        ? await expertsApi.createPack(input as ExpertPackCreateInput)
        : await expertsApi.updatePack(editorPack?.packId ?? '', input as ExpertPackUpdateInput)
      await loadPacks()
      setEditorOpen(false)
      const name = 'pack' in result ? result.pack.name : result.name
      addToast({ type: 'success', message: t('settings.experts.editor.saveSuccess', { name }) })
    } catch (cause) {
      const message = errorMessage(cause)
      setActionError(message)
      addToast({ type: 'error', message })
      throw cause
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!pendingDelete) return
    setDeleteLoading(true)
    try {
      const name = pendingDelete.name
      await expertsApi.deletePack(pendingDelete.packId)
      setPendingDelete(null)
      await loadPacks()
      addToast({ type: 'success', message: t('settings.experts.manager.deleteSuccess', { name }) })
    } catch (cause) {
      const message = errorMessage(cause)
      setActionError(message)
      addToast({ type: 'error', message })
    } finally {
      setDeleteLoading(false)
    }
  }

  const toggleSelected = (packId: string) => {
    setSelectedPackIds((current) => current.includes(packId) ? current.filter((id) => id !== packId) : [...current, packId])
  }

  return (
    <section data-testid="expert-pack-manager" aria-hidden={editorOpen || dialogMode !== null || pendingDelete !== null ? true : undefined} className="flex w-full min-w-0 flex-col gap-3">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{t('settings.experts.manager.title')}</h3>
          <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{t('settings.experts.manager.description')}</p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => void loadPacks()} disabled={loading || saving}>{t('settings.experts.manager.refresh')}</Button>
          <Button variant="secondary" onClick={() => { setActionError(null); setDialogMode('import') }} disabled={loading || saving}>{t('settings.experts.manager.import')}</Button>
          <Button variant="secondary" onClick={() => { setActionError(null); setDialogMode('export') }} disabled={loading || saving || selectedPackIds.length === 0}>{t('settings.experts.manager.exportSelected')}</Button>
          <Button onClick={openCreateEditor} disabled={loading || saving}>{t('settings.experts.manager.new')}</Button>
        </div>
      </div>

      {error ? <p role="alert" className="rounded-[7px] border border-[var(--color-error)]/30 bg-[var(--color-error)]/8 px-3 py-2 text-xs text-[var(--color-error)]">{error}</p> : null}
      {actionError ? <p role="alert" className="rounded-[7px] border border-[var(--color-error)]/30 bg-[var(--color-error)]/8 px-3 py-2 text-xs text-[var(--color-error)]">{actionError}</p> : null}
      {loading ? <p className="rounded-[8px] border border-[var(--color-border)] px-3 py-4 text-sm text-[var(--color-text-tertiary)]">{t('settings.experts.manager.loading')}</p> : null}
      {!loading && sortedPacks.length === 0 ? <p className="rounded-[8px] border border-dashed border-[var(--color-border)] px-3 py-6 text-center text-sm text-[var(--color-text-tertiary)]">{t('settings.experts.manager.empty')}</p> : null}

      {!loading && sortedPacks.length > 0 ? (
        <div className="divide-y divide-[var(--color-border)] overflow-hidden rounded-[8px] border border-[var(--color-border)]">
          {sortedPacks.map((pack) => (
            <article key={pack.packId} data-testid={`expert-pack-row-${pack.packId}`} className="grid min-w-0 gap-3 px-3 py-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <div className="flex min-w-0 items-start gap-3">
                <input
                  type="checkbox"
                  aria-label={`Select ${pack.name}`}
                  checked={selectedSet.has(pack.packId)}
                  onChange={() => toggleSelected(pack.packId)}
                  className="mt-1 h-4 w-4 accent-[var(--color-brand)]"
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{pack.name}</h4>
                    <span className="rounded-[5px] border border-[var(--color-border)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-tertiary)]">{pack.version}</span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{pack.description || '—'}</p>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--color-text-tertiary)]">
                    <span>{t('settings.experts.manager.id')} {pack.packId}</span>
                    <span>{t('settings.experts.manager.expertCount', { count: pack.experts.length })}</span>
                    <span>{pack.storage.path}</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-start justify-end gap-2">
                <ActionButton label={t('settings.experts.manager.copy')} ariaLabel={t('settings.experts.manager.copyPack', { name: pack.name })} onClick={() => void handleCopy(pack)} disabled={busyPackId === pack.packId || saving} />
                <ActionButton label={t('settings.experts.manager.edit')} ariaLabel={t('settings.experts.manager.editPack', { name: pack.name })} onClick={() => openEditEditor(pack)} disabled={busyPackId === pack.packId || saving} />
                <ActionButton label={t('settings.experts.manager.export')} ariaLabel={t('settings.experts.manager.exportPack', { name: pack.name })} onClick={() => { setSelectedPackIds([pack.packId]); setDialogMode('export') }} disabled={busyPackId === pack.packId || saving} />
                <ActionButton label={t('settings.experts.manager.delete')} ariaLabel={t('settings.experts.manager.deletePack', { name: pack.name })} onClick={() => setPendingDelete(pack)} disabled={busyPackId === pack.packId || saving} danger />
              </div>
            </article>
          ))}
        </div>
      ) : null}

      <ExpertPackEditor open={editorOpen} mode={editorMode} pack={editorPack} saving={saving} onSave={handleSave} onClose={() => setEditorOpen(false)} />
      <ExpertImportExportDialog
        open={dialogMode !== null}
        mode={dialogMode ?? 'import'}
        packs={packs}
        initialSelectedPackIds={selectedPackIds}
        onClose={() => setDialogMode(null)}
        onImported={async () => { setDialogMode(null); await loadPacks() }}
      />
      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={handleDelete}
        title={t('settings.experts.manager.deleteConfirmTitle')}
        body={pendingDelete ? t('settings.experts.manager.deleteConfirmBody', { name: pendingDelete.name }) : ''}
        confirmLabel={t('settings.experts.manager.delete')}
        cancelLabel={t('common.cancel')}
        loading={deleteLoading}
      />
    </section>
  )
}

function ActionButton({ label, ariaLabel, danger = false, disabled = false, onClick }: { label: string; ariaLabel: string; danger?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-1 rounded-[7px] border px-2 text-xs font-medium ${danger ? 'border-[var(--color-error)]/25 text-[var(--color-error)] hover:bg-[var(--color-error)]/8' : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'}`}
    >
      <span>{label}</span>
    </button>
  )
}

function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause)
}


