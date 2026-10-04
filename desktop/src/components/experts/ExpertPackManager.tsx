import { useEffect, useMemo, useState } from 'react'
import { expertsApi, fallbackExpertCategories, resolveExpertCategoryId, type ExpertCategory, type ExpertPackCreateInput, type ExpertPackSummary, type ExpertPackUpdateInput } from '../../api/experts'
import { useTranslation } from '../../i18n'
import { useUIStore } from '../../stores/uiStore'
import { Button } from '../shared/Button'
import { ConfirmDialog } from '../shared/ConfirmDialog'
import { ExpertImportExportDialog } from './ExpertImportExportDialog'
import { ExpertPackEditor } from './ExpertPackEditor'
import { SkillDiscoveryDialog } from './SkillDiscoveryDialog'

export function ExpertPackManager() {
  const t = useTranslation()
  const addToast = useUIStore((state) => state.addToast)
  const [packs, setPacks] = useState<ExpertPackSummary[]>([])
  const [categories, setCategories] = useState<ExpertCategory[]>([])
  const [activeCategoryId, setActiveCategoryId] = useState('all')
  const [query, setQuery] = useState('')
  const [categoryEditorOpen, setCategoryEditorOpen] = useState(false)
  const [categoryDraft, setCategoryDraft] = useState<ExpertCategory[]>([])
  const [newCategoryName, setNewCategoryName] = useState('')
  const [categorySaving, setCategorySaving] = useState(false)
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
  const [skillDiscoveryOpen, setSkillDiscoveryOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<ExpertPackSummary | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [pendingBundledUpdate, setPendingBundledUpdate] = useState<ExpertPackSummary | null>(null)
  const [bundledUpdateLoading, setBundledUpdateLoading] = useState(false)

  const loadPacks = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await expertsApi.listPacks()
      const categoryResponse = await expertsApi.listCategories().catch(() => ({ categories: fallbackExpertCategories }))
      setPacks(response.packs)
      setCategories(categoryResponse.categories)
      setPendingBundledUpdate((current) => current ?? response.packs.find((pack) => pack.bundledUpdate) ?? null)
      setSelectedPackIds((current) => {
        const available = new Set(response.packs.map((pack) => pack.packId))
        const next = current.filter((packId) => available.has(packId))
        return next.length > 0 || response.packs.length === 0 ? next : response.packs.map((pack) => pack.packId)
      })
    } catch (cause) {
      setError(errorMessage(cause))
      setPacks([])
      setCategories([])
      setSelectedPackIds([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadPacks()
  }, [])

  const sortedPacks = useMemo(() => [...packs].filter((pack) => {
    const expert = pack.experts[0]
    const categoryMatches = activeCategoryId === 'all' || resolveExpertCategoryId(expert) === activeCategoryId
    const normalizedQuery = query.trim().toLowerCase()
    const text = [pack.name, pack.description, expert?.name ?? '', expert?.description ?? '', ...(expert?.tags ?? [])].join(' ').toLowerCase()
    return categoryMatches && (!normalizedQuery || text.includes(normalizedQuery))
  }).sort((a, b) => a.name.localeCompare(b.name)), [activeCategoryId, packs, query])
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

  const handleBundledUpdate = async () => {
    if (!pendingBundledUpdate) return
    setBundledUpdateLoading(true)
    setActionError(null)
    try {
      const result = await expertsApi.applyBundledUpdate(pendingBundledUpdate.packId)
      setPendingBundledUpdate(null)
      await loadPacks()
      addToast({ type: 'success', message: `已更新“${result.pack.name}”，原 ZIP 已备份为 ${result.backupFilename}。` })
    } catch (cause) {
      const message = errorMessage(cause)
      setActionError(message)
      addToast({ type: 'error', message })
    } finally {
      setBundledUpdateLoading(false)
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

  const openCategoryEditor = () => {
    setCategoryDraft(categories)
    setNewCategoryName('')
    setCategoryEditorOpen(true)
  }

  const addCategory = () => {
    const name = newCategoryName.trim()
    if (!name) return
    const base = name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'category'
    let id = base
    let suffix = 2
    while (categoryDraft.some((category) => category.id === id)) id = base + '-' + suffix++
    setCategoryDraft((current) => [...current, { id, name }])
    setNewCategoryName('')
  }

  const saveCategories = async () => {
    setCategorySaving(true)
    setActionError(null)
    try {
      const response = await expertsApi.updateCategories(categoryDraft)
      setCategories(response.categories)
      setCategoryEditorOpen(false)
    } catch (cause) {
      setActionError(errorMessage(cause))
    } finally {
      setCategorySaving(false)
    }
  }
  const toggleSelected = (packId: string) => {
    setSelectedPackIds((current) => current.includes(packId) ? current.filter((id) => id !== packId) : [...current, packId])
  }

  return (
    <section data-testid="expert-pack-manager" aria-hidden={editorOpen || dialogMode !== null || pendingDelete !== null || pendingBundledUpdate !== null || skillDiscoveryOpen ? true : undefined} className="flex w-full min-w-0 flex-col gap-3">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{t('settings.experts.manager.title')}</h3>
          <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{t('settings.experts.manager.description')}</p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={openCategoryEditor} disabled={loading || saving}>管理分类</Button>
          <Button variant="secondary" onClick={() => setSkillDiscoveryOpen(true)} disabled={loading || saving}>搜索在线 Skill</Button>
          <Button variant="secondary" onClick={() => void loadPacks()} disabled={loading || saving}>{t('settings.experts.manager.refresh')}</Button>
          <Button variant="secondary" onClick={() => { setActionError(null); setDialogMode('import') }} disabled={loading || saving}>{t('settings.experts.manager.import')}</Button>
          <Button variant="secondary" onClick={() => { setActionError(null); setDialogMode('export') }} disabled={loading || saving || selectedPackIds.length === 0}>{t('settings.experts.manager.exportSelected')}</Button>
          <Button onClick={openCreateEditor} disabled={loading || saving}>{t('settings.experts.manager.new')}</Button>
        </div>
      </div>

      <div className="rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-3">
        <div className="flex flex-wrap gap-2" aria-label="专家分类">
          <SettingsCategoryFilter label="全部" active={activeCategoryId === 'all'} onClick={() => setActiveCategoryId('all')} />
          {categories.map((category) => <SettingsCategoryFilter key={category.id} label={category.name} active={activeCategoryId === category.id} onClick={() => setActiveCategoryId(category.id)} />)}
        </div>
        <label className="relative mt-3 block max-w-md">
          <span className="sr-only">搜索专家包</span>
          <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[17px] text-[var(--color-text-tertiary)]" aria-hidden="true">search</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索专家、专家包或标签" className="h-9 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] pl-9 pr-3 text-sm outline-none focus:border-[var(--color-brand)]" />
        </label>
      </div>

      {categoryEditorOpen ? <section className="rounded-[10px] border border-[#d8c1b1] bg-[#fffaf4] p-4" aria-label="管理专家分类">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="text-sm font-semibold text-[var(--color-text-primary)]">管理专家分类</h4><p className="mt-1 text-xs text-[var(--color-text-secondary)]">分类名称、顺序和空分类会保存为本地专家目录；ZIP 仍只保存稳定的分类 ID。</p></div><div className="flex gap-2"><Button variant="secondary" onClick={() => setCategoryEditorOpen(false)} disabled={categorySaving}>取消</Button><Button onClick={() => void saveCategories()} loading={categorySaving} disabled={categorySaving}>保存分类</Button></div></div>
        <div className="mt-3 space-y-2">{categoryDraft.map((category, index) => <div key={category.id} className="grid gap-2 rounded-lg border border-[#eadfd7] bg-white p-2 sm:grid-cols-[auto_minmax(0,1fr)_auto]"><div className="flex gap-1"><button type="button" aria-label={'上移 ' + category.name} disabled={index === 0} onClick={() => setCategoryDraft((current) => current.map((item, itemIndex) => itemIndex === index ? current[index - 1]! : itemIndex === index - 1 ? current[index]! : item))} className="rounded border border-[#eadfd7] px-2 disabled:opacity-40">↑</button><button type="button" aria-label={'下移 ' + category.name} disabled={index === categoryDraft.length - 1} onClick={() => setCategoryDraft((current) => current.map((item, itemIndex) => itemIndex === index ? current[index + 1]! : itemIndex === index + 1 ? current[index]! : item))} className="rounded border border-[#eadfd7] px-2 disabled:opacity-40">↓</button></div><label className="min-w-0 text-xs text-[var(--color-text-secondary)]"><span className="sr-only">{category.id} 分类名称</span><input value={category.name} onChange={(event) => setCategoryDraft((current) => current.map((item) => item.id === category.id ? { ...item, name: event.target.value } : item))} className="h-8 w-full rounded border border-[#eadfd7] px-2 text-sm text-[var(--color-text-primary)]" /></label><div className="flex items-center gap-2"><code className="text-[11px] text-[var(--color-text-tertiary)]">{category.id}</code>{category.id !== 'uncategorized' ? <button type="button" onClick={() => setCategoryDraft((current) => current.filter((item) => item.id !== category.id))} className="text-xs text-[var(--color-error)]">移除</button> : null}</div></div>)}</div>
        <div className="mt-3 flex max-w-md gap-2"><input value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addCategory() } }} placeholder="新增一个分类，例如：运营" className="h-9 min-w-0 flex-1 rounded-lg border border-[#eadfd7] bg-white px-3 text-sm" /><Button variant="secondary" onClick={addCategory}>新增分类</Button></div>
      </section> : null}
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
                {pack.bundledUpdate ? <ActionButton label="更新" ariaLabel={`更新 ${pack.name}`} onClick={() => setPendingBundledUpdate(pack)} disabled={busyPackId === pack.packId || saving} /> : null}
                <ActionButton label={t('settings.experts.manager.copy')} ariaLabel={t('settings.experts.manager.copyPack', { name: pack.name })} onClick={() => void handleCopy(pack)} disabled={busyPackId === pack.packId || saving} />
                <ActionButton label={t('settings.experts.manager.edit')} ariaLabel={t('settings.experts.manager.editPack', { name: pack.name })} onClick={() => openEditEditor(pack)} disabled={busyPackId === pack.packId || saving} />
                <ActionButton label={t('settings.experts.manager.export')} ariaLabel={t('settings.experts.manager.exportPack', { name: pack.name })} onClick={() => { setSelectedPackIds([pack.packId]); setDialogMode('export') }} disabled={busyPackId === pack.packId || saving} />
                <ActionButton label={t('settings.experts.manager.delete')} ariaLabel={t('settings.experts.manager.deletePack', { name: pack.name })} onClick={() => setPendingDelete(pack)} disabled={busyPackId === pack.packId || saving} danger />
              </div>
            </article>
          ))}
        </div>
      ) : null}

      <SkillDiscoveryDialog open={skillDiscoveryOpen} onClose={() => setSkillDiscoveryOpen(false)} />
      <ExpertPackEditor open={editorOpen} mode={editorMode} pack={editorPack} categories={categories} saving={saving} onSave={handleSave} onClose={() => setEditorOpen(false)} />
      <ExpertImportExportDialog
        open={dialogMode !== null}
        mode={dialogMode ?? 'import'}
        packs={packs}
        initialSelectedPackIds={selectedPackIds}
        onClose={() => setDialogMode(null)}
        onImported={async () => { setDialogMode(null); await loadPacks() }}
      />
      <ConfirmDialog
        open={pendingBundledUpdate !== null}
        onClose={() => setPendingBundledUpdate(null)}
        onConfirm={handleBundledUpdate}
        title="发现专家包官方更新"
        body={pendingBundledUpdate ? <>“{pendingBundledUpdate.name}”的官方 ZIP 已从 {pendingBundledUpdate.bundledUpdate?.localVersion} 更新到 {pendingBundledUpdate.bundledUpdate?.bundledVersion}。更新会先备份你当前的本地 ZIP，再用新版官方包覆盖；不会更换包 ID。</> : ''}
        confirmLabel="更新并备份"
        cancelLabel={t('common.cancel')}
        confirmVariant="primary"
        loading={bundledUpdateLoading}
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

function SettingsCategoryFilter({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`rounded-full px-3 py-1 text-xs font-medium transition ${active ? 'bg-[var(--color-brand)] text-white' : 'bg-[var(--color-surface-container-lowest)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'}`}>{label}</button>
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


