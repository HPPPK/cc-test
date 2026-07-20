import { useEffect, useMemo, useRef, useState } from 'react'
import { useExpertStore } from '../../stores/expertStore'
import { useSessionStore } from '../../stores/sessionStore'
import { useChatStore } from '../../stores/chatStore'
import { useCLITaskStore } from '../../stores/cliTaskStore'
import { expertsApi, type ExpertDefinition, type ExpertPackImportPreview, type ExpertPackSummary, type ExpertToolManifest } from '../../api/experts'
import type { ExpertSessionSummary } from '../../types/session'


const EXPERT_SWITCH_CONFIRMATION_STATUSES: ExpertSessionSummary['status'][] = ['active', 'collecting', 'running']

const EXPERT_SWITCH_STATUS_LABEL: Record<ExpertSessionSummary['status'], string> = {
  active: '进行中',
  collecting: '正在收集材料',
  running: '正在运行',
  completed: '已完成',
  exited: '已退出',
  failed: '失败',
}

function expertSelectionKey(expert: Pick<ExpertDefinition, 'id' | 'packId'>): string {
  return `${expert.packId}\u0000${expert.id}`
}

function needsExpertSwitchConfirmation(current: ExpertSessionSummary | null | undefined, next: ExpertDefinition | null) {
  if (!current || !next) return false
  if (!EXPERT_SWITCH_CONFIRMATION_STATUSES.includes(current.status)) return false
  return current.expertId !== next.id || current.packId !== next.packId
}

function writeSessionExpertSummary(sessionId: string | null | undefined, expert: ExpertSessionSummary) {
  if (!sessionId) return
  useSessionStore.setState((state) => ({
    sessions: state.sessions.map((session) => session.id === sessionId
      ? { ...session, expert, modifiedAt: new Date().toISOString() }
      : session),
  }))
}

type ExpertSelectionDialogProps = {
  open: boolean
  onClose: () => void
  projectRoot: string
  sessionId?: string | null
  onEnterExpert?: (expert: ExpertDefinition) => Promise<void> | void
}

export function ExpertSelectionDialog({ open, onClose, projectRoot, sessionId, onEnterExpert }: ExpertSelectionDialogProps) {
  const experts = useExpertStore((state) => state.experts)
  const packs = useExpertStore((state) => state.packs)
  const loading = useExpertStore((state) => state.loadingExperts)
  const error = useExpertStore((state) => state.expertsError)
  const loadExperts = useExpertStore((state) => state.loadExperts)
  const enterExpertMode = useExpertStore((state) => state.enterExpertMode)
  const exitExpertMode = useExpertStore((state) => state.exitExpertMode)
  const exportPack = useExpertStore((state) => state.exportPack)
  const sessionExpert = useSessionStore((state) => sessionId ? state.sessions.find((session) => session.id === sessionId)?.expert ?? null : null)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [entering, setEntering] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [importPreview, setImportPreview] = useState<ExpertPackImportPreview | null>(null)
  const [importDataBase64, setImportDataBase64] = useState<string | null>(null)
  const [importBusy, setImportBusy] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [localMessage, setLocalMessage] = useState<string | null>(null)
  const [exportBusy, setExportBusy] = useState(false)
  const [pendingSwitchExpert, setPendingSwitchExpert] = useState<ExpertDefinition | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const loadedRef = useRef(false)

  useEffect(() => {
    if (!open || loadedRef.current) return
    loadedRef.current = true
    void loadExperts()
  }, [loadExperts, open])

  useEffect(() => {
    if (experts.length === 0) {
      if (selectedKey) setSelectedKey(null)
      return
    }
    if (!selectedKey || !experts.some((expert) => expertSelectionKey(expert) === selectedKey)) {
      setSelectedKey(expertSelectionKey(experts[0]!))
    }
  }, [experts, selectedKey])

  if (!open) return null

  const selected = experts.find((expert) => expertSelectionKey(expert) === selectedKey) ?? experts[0] ?? null
  const selectedPack = selected ? packs.find((pack) => pack.packId === selected.packId) : null

  const handleSelectImportFile = async (file: File | null) => {
    if (!file) return
    setImportBusy(true)
    setImportError(null)
    setLocalError(null)
    setLocalMessage(null)
    setImportPreview(null)
    setImportDataBase64(null)
    try {
      const dataBase64 = await readFileAsBase64(file)
      const preview = await expertsApi.previewImport(dataBase64)
      setImportPreview(preview)
      setImportDataBase64(dataBase64)
    } catch (error) {
      setImportError(toUserImportError(error, '专家包预览失败，请确认选择的是 ZIP 文件。'))
    } finally {
      setImportBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleConfirmImport = async () => {
    if (!importDataBase64 || importBusy) return
    setImportBusy(true)
    setImportError(null)
    setLocalError(null)
    setLocalMessage(null)
    try {
      const result = await expertsApi.importPack(importDataBase64)
      await loadExperts()
      setImportPreview(null)
      setImportDataBase64(null)
      setLocalMessage(`已导入「${result.pack.name}」，现在可以在列表里选择。`)
    } catch (error) {
      setImportError(toUserImportError(error, '导入专家包失败，请换一个由江夏导出的 ZIP 文件。'))
    } finally {
      setImportBusy(false)
    }
  }

  const enterSelectedExpert = async (expert: ExpertDefinition) => {
    if (onEnterExpert) {
      await onEnterExpert(expert)
    } else if (sessionId) {
      const enteredExpert = await enterExpertMode(sessionId, expert.id)
      writeSessionExpertSummary(sessionId, enteredExpert)
    } else {
      throw new Error('请先打开或创建一个聊天会话，再进入专家 Mode。')
    }
  }


  const handleExportSelectedPack = async () => {
    if (!selected || exportBusy) return
    setExportBusy(true)
    setLocalError(null)
    setLocalMessage(null)
    try {
      const exported = await exportPack(selected.packId)
      if (exported) {
        setLocalMessage(`已保存「${selectedPack?.name ?? selected.packName}」专家包。`)
      }
    } catch (error) {
      setLocalError(error instanceof Error ? `导出专家包失败：${error.message}` : '导出专家包失败，请稍后再试。')
    } finally {
      setExportBusy(false)
    }
  }

  const handleEnter = async () => {
    if (!selected || entering) return
    if (needsExpertSwitchConfirmation(sessionExpert, selected)) {
      setLocalError(null)
      setPendingSwitchExpert(selected)
      return
    }

    setEntering(true)
    setLocalError(null)
    try {
      await enterSelectedExpert(selected)
      onClose()
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : '进入专家 Mode 失败')
    } finally {
      setEntering(false)
    }
  }

  const handleSwitchExpert = async () => {
    if (!pendingSwitchExpert || !sessionId || entering) return
    setEntering(true)
    setLocalError(null)
    try {
      const exitedExpert = await exitExpertMode(sessionId)
      useChatStore.getState().settleSessionIdle(sessionId)
      useCLITaskStore.getState().clearTasks(sessionId)
      writeSessionExpertSummary(sessionId, exitedExpert)
      await enterSelectedExpert(pendingSwitchExpert)
      setPendingSwitchExpert(null)
      onClose()
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : '切换专家 Mode 失败')
    } finally {
      setEntering(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/35 px-4 py-6" role="dialog" aria-modal="true" aria-label="专家" data-testid="expert-selection-dialog">
      <div className="max-h-[88vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-[#eadfd7] bg-[#fffaf4] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#eadfd7] px-6 py-5">
          <div>
            <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">专家</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--color-text-secondary)]">
              选择一个专家来帮你整理材料、分析项目或生成参考报告。专家不会自动改代码，也不会自动启动工作流。导入或查看专家包也不会运行包内代码。
            </p>
            {projectRoot ? <p className="mt-1 break-all text-xs text-[var(--color-text-tertiary)]">当前项目：{projectRoot}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-[var(--color-text-tertiary)] transition-colors hover:bg-white hover:text-[var(--color-text-primary)]" aria-label="关闭专家选择">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="grid max-h-[calc(88vh-112px)] grid-cols-1 overflow-y-auto lg:grid-cols-[320px_1fr]">
          <aside className="border-b border-[#eadfd7] p-4 lg:border-b-0 lg:border-r">
            <div className="mb-4 rounded-xl border border-[#eadfd7] bg-white/70 p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">专家包</h3>
                  <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">选择 ZIP 文件后会先预览，确认前不会导入，也不会运行里面的内容。</p>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importBusy}
                  className="rounded-lg border border-[#eadfd7] bg-white px-3 py-1.5 text-xs font-medium text-[#8a4a28] transition-colors hover:bg-[#fff7ee] disabled:opacity-60"
                >
                  {importBusy ? '处理中…' : '导入专家包'}
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip,application/zip,application/x-zip-compressed"
                className="hidden"
                onChange={(event) => { void handleSelectImportFile(event.target.files?.[0] ?? null) }}
              />
              {importPreview ? (
                <ImportPreviewCard
                  preview={importPreview}
                  busy={importBusy}
                  onConfirm={handleConfirmImport}
                  onCancel={() => { setImportPreview(null); setImportDataBase64(null) }}
                />
              ) : null}
              {importError ? <p className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">{importError}</p> : null}
            </div>
            {loading ? <p className="px-2 py-4 text-sm text-[var(--color-text-secondary)]">正在加载已安装专家…</p> : null}
            {error ? <p className="px-2 py-4 text-sm text-[var(--color-danger)]">{error}</p> : null}
            <div className="space-y-2" role="region" aria-label="专家列表">
              {experts.map((expert) => (
                <ExpertCard
                  key={expertSelectionKey(expert)}
                  expert={expert}
                  selected={selected ? expertSelectionKey(expert) === expertSelectionKey(selected) : false}
                  onSelect={() => setSelectedKey(expertSelectionKey(expert))}
                />
              ))}
            </div>
          </aside>

          <main className="p-6">
            {selected ? (
              <div className="space-y-5">
                <section>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">{selected.name}</h3>
                    <span className="rounded-full bg-[#f4eadf] px-2.5 py-1 text-xs font-medium text-[#8a4a28]">{selected.statusLabel}</span>
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-[var(--color-text-secondary)]">专家 Mode</span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--color-text-secondary)]">{selected.description}</p>
                </section>



                <PackageDetails expert={selected} pack={selectedPack ?? undefined} />

                {localMessage ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{localMessage}</p> : null}

                {localError ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{localError}</p> : null}

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eadfd7] pt-4">
                  <button
                    type="button"
                    onClick={() => void handleExportSelectedPack()}
                    disabled={exportBusy}
                    className="rounded-lg border border-[#eadfd7] bg-white px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[#fff7ee] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {exportBusy ? '正在准备下载…' : '导出这个专家包'}
                  </button>
                  <div className="flex gap-2">
                    <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-white">取消</button>
                    <button
                      type="button"
                      onClick={handleEnter}
                      disabled={entering}
                      className="rounded-lg bg-[#9a542f] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#7d4325] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {entering ? '正在进入…' : '进入专家 Mode'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-[var(--color-text-secondary)]">还没有安装可用专家。</p>
            )}
          </main>
        </div>
      </div>

      {pendingSwitchExpert && sessionExpert ? (
        <ExpertSwitchConfirmation
          currentExpertName={sessionExpert.expertName}
          currentStatusLabel={EXPERT_SWITCH_STATUS_LABEL[sessionExpert.status]}
          nextExpertName={pendingSwitchExpert.name}
          busy={entering}
          error={localError}
          onContinue={() => {
            setPendingSwitchExpert(null)
            onClose()
          }}
          onSwitch={() => { void handleSwitchExpert() }}
          onCancel={() => setPendingSwitchExpert(null)}
        />
      ) : null}
    </div>
  )
}

function ExpertSwitchConfirmation({
  currentExpertName,
  currentStatusLabel,
  nextExpertName,
  busy,
  error,
  onContinue,
  onSwitch,
  onCancel,
}: {
  currentExpertName: string
  currentStatusLabel: string
  nextExpertName: string
  busy: boolean
  error: string | null
  onContinue: () => void
  onSwitch: () => void
  onCancel: () => void
}) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30 px-4">
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="expert-switch-confirmation-title"
        className="w-full max-w-lg rounded-2xl border border-[#eadfd7] bg-[#fffaf4] p-5 shadow-2xl"
        data-testid="expert-switch-confirmation"
      >
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined mt-0.5 text-[#9a542f]" aria-hidden="true">published_with_changes</span>
          <div>
            <h3 id="expert-switch-confirmation-title" className="text-base font-semibold text-[var(--color-text-primary)]">切换专家 Mode？</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">
              当前会话正在使用「{currentExpertName}」专家（{currentStatusLabel}）。如果切换到「{nextExpertName}」，会先退出当前专家，再进入新专家。
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">
              这只会切换专家 Mode，不会创建 workflow，也不会改动 workflow state。
            </p>
          </div>
        </div>
        {error ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onContinue}
            disabled={busy}
            className="rounded-lg border border-[#eadfd7] bg-white px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[#fff7ee] disabled:cursor-not-allowed disabled:opacity-60"
          >
            继续当前专家
          </button>
          <button
            type="button"
            onClick={onSwitch}
            disabled={busy}
            className="rounded-lg bg-[#9a542f] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#7d4325] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? '切换中…' : '退出并切换'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            取消
          </button>
        </div>
      </section>
    </div>
  )
}

function ExpertCard({ expert, selected, onSelect }: { expert: ExpertDefinition; selected: boolean; onSelect: () => void }) {
  return (
    <button className={`w-full rounded-xl border p-4 text-left transition ${selected ? 'border-[#9a542f] bg-white shadow-sm' : 'border-[#eadfd7] bg-white/70 hover:bg-white'}`} type="button" onClick={onSelect}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-[var(--color-text-primary)]">{expert.name}</h3>
        <span className="rounded-full bg-[#f4eadf] px-2 py-0.5 text-xs text-[#8a4a28]">{expert.statusLabel}</span>
      </div>
      <p className="mt-2 line-clamp-3 text-sm leading-6 text-[var(--color-text-secondary)]">{expert.description}</p>
    </button>
  )
}

function ImportPreviewCard({ preview, busy, onConfirm, onCancel }: { preview: ExpertPackImportPreview; busy: boolean; onConfirm: () => void; onCancel: () => void }) {
  const metrics = getPackMetrics(preview.pack, preview.experts)
  const toolLabels = getToolLabels(preview.experts, preview.pack.tools)
  const permissionLabels = getPermissionLabels(preview.experts, preview.pack.tools)

  return (
    <div className="mt-3 rounded-lg border border-[#eadfd7] bg-[#fffaf4] p-3 text-xs leading-5 text-[var(--color-text-secondary)]">
      <p className="font-semibold text-[var(--color-text-primary)]">准备导入：{preview.pack.name}</p>
      {preview.pack.packId ? <p>专家 ID：{preview.pack.packId}</p> : null}
      <p>这个文件包含 {metrics.expertCount} 个专家、{metrics.skillCount} 项技能和 {metrics.formCount} 个材料表单。</p>
      <p>{metrics.portable ? '可移植：可随 ZIP 一起备份或迁移。' : '可移植性：需要在这台电脑上额外确认。'}</p>
      <p>工具和权限：{toolLabels.slice(0, 3).join('；') || '向你提问、收集材料、保存专家报告'}。</p>
      {permissionLabels.length ? <p>授权说明：{permissionLabels.slice(0, 3).join('；')}。</p> : null}
      <p className="font-medium text-[var(--color-text-primary)]">导入和查看只会保存说明文件，第一阶段不会运行包内代码。</p>
      {preview.overwrite ? (
        <p className="mt-1 font-semibold text-[#92400e]">⚠ 已存在同名专家（ID: {preview.expertId || preview.pack.packId}），导入将覆盖旧版本。</p>
      ) : null}
      {preview.warnings.length ? <p className="text-[#92400e]">{preview.warnings.map(toPlainWarning).join('；')}</p> : null}
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={onConfirm} disabled={busy || !preview.canImport} className="rounded bg-[#9a542f] px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-60">{preview.canImport ? (preview.overwrite ? '确认覆盖' : '确认导入') : '暂不能导入'}</button>
        <button type="button" onClick={onCancel} className="rounded border border-[#eadfd7] bg-white px-2.5 py-1 text-xs">取消</button>
      </div>
    </div>
  )
}

function PackageDetails({ expert, pack }: { expert: ExpertDefinition; pack?: ExpertPackSummary }) {
  const packExperts = useMemo(() => (pack?.experts.length ? pack.experts : [expert]), [expert, pack?.experts])
  const metrics = useMemo(() => getPackMetrics(pack, packExperts), [pack, packExperts])
  const toolLabels = useMemo(() => getToolLabels(packExperts, pack?.tools), [packExperts, pack?.tools])
  const permissionLabels = useMemo(() => getPermissionLabels(packExperts, pack?.tools), [packExperts, pack?.tools])
  const packageName = pack?.name || expert.packName

  return (
    <section className="rounded-xl border border-[#eadfd7] bg-white/75 p-4">
      <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">已安装专家包详情</h4>
      <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">
        「{packageName}」包含 {metrics.expertCount} 个专家、{metrics.skillCount} 项技能和 {metrics.formCount} 个材料表单。
      </p>
      <div className="mt-3 grid gap-3 text-sm text-[var(--color-text-secondary)] md:grid-cols-2">
        <InfoList title="包信息" items={[`版本 ${expert.packVersion}`, metrics.portable ? '可移植：可随 ZIP 一起备份或迁移' : '可移植性：需要在这台电脑上额外确认']} />
        <InfoList title="专家和技能" items={[`${metrics.expertCount} 个专家`, `${metrics.skillCount} 项技能`]} />
        <InfoList title="工具和权限" items={toolLabels.length ? toolLabels : ['向你提问、收集材料、保存专家报告']} />
        <InfoList title="授权说明" items={permissionLabels.length ? permissionLabels : ['仅在你确认后使用专家所需的基础功能']} />
      </div>
      <p className="mt-3 rounded-lg bg-[#fff7ee] px-3 py-2 text-xs leading-5 text-[var(--color-text-secondary)]">
        导入、导出和查看详情只处理专家包说明文件；第一阶段不会运行包内代码。
      </p>
    </section>
  )
}

function InfoList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg bg-[#fffaf4] px-3 py-2">
      <h5 className="text-xs font-semibold text-[var(--color-text-primary)]">{title}</h5>
      <ul className="mt-1 space-y-1 text-xs leading-5 text-[var(--color-text-secondary)]">
        {items.map((item) => <li key={item}>- {item}</li>)}
      </ul>
    </div>
  )
}

function getPackMetrics(pack: ExpertPackSummary | undefined, experts: ExpertDefinition[]) {
  const expertList = experts.length ? experts : pack?.experts ?? []
  const skillCount = new Set(expertList.flatMap((candidate) => safeArray(candidate.skillIds))).size
  const formCount = expertList.reduce((count, candidate) => count + safeArray(candidate.formPaths).length + (candidate.intakeFlow?.steps.filter((step) => step.type === 'form').length ?? 0), 0)
  const portable = expertList.length > 0 ? expertList.every((candidate) => candidate.portable) : true
  return { expertCount: expertList.length, skillCount, formCount, portable }
}

function getToolLabels(experts: ExpertDefinition[], packTools: ExpertToolManifest[] = []): string[] {
  return uniqueNonEmpty([
    ...experts.flatMap((expert) => safeArray(expert.hostTools).map((tool) => plainHostToolLabel(tool.id, tool.name, tool.purpose))),
    ...experts.flatMap((expert) => safeArray(expert.tools).map(plainPackageToolLabel)),
    ...safeArray(packTools).map(plainPackageToolLabel),
  ])
}

function getPermissionLabels(experts: ExpertDefinition[], packTools: ExpertToolManifest[] = []): string[] {
  return uniqueNonEmpty([
    ...experts.flatMap((expert) => safeArray(expert.permissions).map((permission) => permission.description)),
    ...experts.flatMap((expert) => safeArray(expert.tools).flatMap((tool) => safeArray(tool.permissions).map((permission) => permission.description))),
    ...safeArray(packTools).flatMap((tool) => safeArray(tool.permissions).map((permission) => permission.description)),
  ])
}

function safeArray<T>(items: T[] | null | undefined): T[] {
  return Array.isArray(items) ? items : []
}

function plainHostToolLabel(id: string, name: string, purpose: string): string {
  const known: Record<string, string> = {
    AskUserQuestion: '向你提问并等待选择',
    ExpertIntakeForm: '显示材料收集表单',
    ExpertMaterialWriter: '保存专家生成的材料',
    FilePicker: '让你手动选择文件或文件夹',
  }
  return ((known[id] ?? known[name] ?? purpose) || name)
}

function plainPackageToolLabel(tool: ExpertToolManifest): string {
  if (tool.hostToolId) return plainHostToolLabel(tool.hostToolId, tool.name, tool.purpose)
  if (tool.type === 'packageLocalExecutable') return `包内可运行工具：${tool.purpose || '需要你确认后才会运行'}`
  if (tool.type === 'packageLocalDeclarative') return `包内说明工具：${tool.purpose || '提供专家处理说明'}`
  return tool.purpose || tool.name
}

function uniqueNonEmpty(items: string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))]
}

function toPlainWarning(warning: string): string {
  return warning
    .replace(/schemaVersion|schema|manifest|registry|adapter|capability/gi, '文件说明')
    .replace(/host tool|hostTool|tool/gi, '工具')
}

function toUserImportError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback
  if (/schema|manifest|registry|adapter|capability/i.test(error.message)) return fallback
  return error.message || fallback
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const [, base64 = ''] = result.split(',')
      if (!base64) reject(new Error('无法读取这个专家包文件。'))
      else resolve(base64)
    }
    reader.onerror = () => reject(reader.error ?? new Error('读取专家包文件失败。'))
    reader.readAsDataURL(file)
  })
}
