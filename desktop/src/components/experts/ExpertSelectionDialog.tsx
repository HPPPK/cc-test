import { useEffect, useMemo, useRef, useState } from 'react'
import { ContentOverlay } from '../shared/ContentOverlay'
import { useExpertStore } from '../../stores/expertStore'
import { useSessionStore } from '../../stores/sessionStore'
import { useChatStore } from '../../stores/chatStore'
import { useCLITaskStore } from '../../stores/cliTaskStore'
import { resolveExpertCategoryId, type ExpertDefinition, type ExpertPackSummary, type ExpertResearchBrowserConnectionInput, type ExpertResearchBrowserPresentation, type ExpertToolManifest } from '../../api/experts'
import type { ExpertSessionSummary } from '../../types/session'

// Keep the alternative UI implementation dormant; the public entry uses managed background only.
const EXPERT_BROWSER_CHOICES_VISIBLE = false

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
  onEnterExpert?: (expert: ExpertDefinition, options?: { researchBrowserConnection?: ExpertResearchBrowserConnectionInput; researchBrowserPresentation?: ExpertResearchBrowserPresentation }) => Promise<void> | void
}

export function ExpertSelectionDialog({ open, onClose, projectRoot, sessionId, onEnterExpert }: ExpertSelectionDialogProps) {
  const experts = useExpertStore((state) => state.experts)
  const packs = useExpertStore((state) => state.packs)
  const categories = useExpertStore((state) => state.categories)
  const loading = useExpertStore((state) => state.loadingExperts)
  const error = useExpertStore((state) => state.expertsError)
  const loadExperts = useExpertStore((state) => state.loadExperts)
  const enterExpertMode = useExpertStore((state) => state.enterExpertMode)
  const exitExpertMode = useExpertStore((state) => state.exitExpertMode)
  const exportPack = useExpertStore((state) => state.exportPack)
  const sessionExpert = useSessionStore((state) => sessionId ? state.sessions.find((session) => session.id === sessionId)?.expert ?? null : null)
  const [activeCategoryId, setActiveCategoryId] = useState('all')
  const [expertQuery, setExpertQuery] = useState('')
  const [detailKey, setDetailKey] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [entering, setEntering] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [localMessage, setLocalMessage] = useState<string | null>(null)
  const [exportBusy, setExportBusy] = useState(false)
  const [pendingSwitchExpert, setPendingSwitchExpert] = useState<ExpertDefinition | null>(null)
  const [researchBrowserMode, setResearchBrowserMode] = useState<'managed' | 'cdp'>('managed')
  const [researchBrowserPresentation, setResearchBrowserPresentation] = useState<ExpertResearchBrowserPresentation>('assistable_background')
  const [researchBrowserEndpoint, setResearchBrowserEndpoint] = useState('http://127.0.0.1:9222')
  const [researchBrowserAuthorized, setResearchBrowserAuthorized] = useState(false)
  const loadedRef = useRef(false)

  useEffect(() => {
    if (!open || loadedRef.current) return
    loadedRef.current = true
    void loadExperts()
  }, [loadExperts, open])

  useEffect(() => {
    if (!open) setDetailOpen(false)
  }, [open])

  const visibleExperts = useMemo(() => {
    const query = expertQuery.trim().toLowerCase()
    return experts.filter((expert) => {
      const categoryMatches = activeCategoryId === 'all' || resolveExpertCategoryId(expert) === activeCategoryId
      const text = [expert.name, expert.description, expert.packName, ...(expert.tags ?? [])].join(' ').toLowerCase()
      return categoryMatches && (!query || text.includes(query))
    })
  }, [activeCategoryId, expertQuery, experts])

  useEffect(() => {
    if (detailKey && !experts.some((expert) => expertSelectionKey(expert) === detailKey)) {
      setDetailKey(null)
      setDetailOpen(false)
    }
  }, [detailKey, experts])

  if (!open) return null

  const selected = experts.find((expert) => expertSelectionKey(expert) === detailKey) ?? null
  const selectedPack = selected ? packs.find((pack) => pack.packId === selected.packId) : undefined

  const handleClose = () => {
    setDetailOpen(false)
    setPendingSwitchExpert(null)
    onClose()
  }

  const openDetail = (expert: ExpertDefinition) => {
    setDetailKey(expertSelectionKey(expert))
    setResearchBrowserMode('managed')
    setResearchBrowserPresentation('assistable_background')
    setResearchBrowserEndpoint('http://127.0.0.1:9222')
    setResearchBrowserAuthorized(false)
    setLocalError(null)
    setLocalMessage(null)
    setDetailOpen(true)
  }

  const selectedBrowserOptions = (expert: ExpertDefinition): { researchBrowserConnection?: ExpertResearchBrowserConnectionInput; researchBrowserPresentation?: ExpertResearchBrowserPresentation } => {
    if (EXPERT_BROWSER_CHOICES_VISIBLE && expert.researchBrowserPolicy?.allowUserAuthorizedCdp === true && researchBrowserMode === 'cdp') {
      if (!researchBrowserAuthorized) throw new Error('请先确认你授权本次专家会话读取和操作该调试浏览器。')
      return {
        researchBrowserConnection: {
          kind: 'cdp',
          endpoint: researchBrowserEndpoint,
          userAuthorized: true,
        },
      }
    }
    return {
      ...(expert.researchBrowserPolicy ? { researchBrowserConnection: { kind: 'managed' as const } } : {}),
      ...(expert.researchBrowserPolicy?.allowManagedPresentationChoice === true
        ? { researchBrowserPresentation: EXPERT_BROWSER_CHOICES_VISIBLE ? researchBrowserPresentation : 'assistable_background' as const }
        : {}),
    }
  }

  const enterSelectedExpert = async (expert: ExpertDefinition) => {
    const researchBrowserOptions = selectedBrowserOptions(expert)
    if (onEnterExpert) {
      if (Object.keys(researchBrowserOptions).length > 0) await onEnterExpert(expert, researchBrowserOptions)
      else await onEnterExpert(expert)
    } else if (sessionId) {
      const enteredExpert = await enterExpertMode(sessionId, expert.id, Object.keys(researchBrowserOptions).length > 0 ? researchBrowserOptions : undefined)
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
      if (exported) setLocalMessage(`已保存「${selectedPack?.name ?? selected.packName}」专家包。`)
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
      handleClose()
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
      handleClose()
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : '切换专家 Mode 失败')
    } finally {
      setEntering(false)
    }
  }

  return (
    <ContentOverlay className="bg-black/35" role="dialog" aria-modal="true" aria-label="专家广场" data-testid="expert-selection-dialog">
      <div className="flex h-[680px] max-h-full w-full max-w-[1150px] min-w-0 flex-col overflow-hidden rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--color-border)] px-6 py-4">
          <div className="min-w-0">
            {detailOpen ? (
              <button type="button" onClick={() => setDetailOpen(false)} className="inline-flex items-center gap-1 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]">
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">arrow_back</span>
                返回专家广场
              </button>
            ) : (
              <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">专家广场</h2>
            )}
            {detailOpen ? <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">查看专家能力与使用范围，然后添加到当前会话。</p> : projectRoot ? <p className="mt-1 truncate text-xs text-[var(--color-text-tertiary)]">当前项目：{projectRoot}</p> : null}
          </div>
          <button type="button" onClick={handleClose} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]" aria-label="关闭专家选择">
            <span className="material-symbols-outlined text-[19px]" aria-hidden="true">close</span>
          </button>
        </header>

        {detailOpen && selected ? (
          <ExpertDetail
            expert={selected}
            pack={selectedPack}
            entering={entering}
            exportBusy={exportBusy}
            message={localMessage}
            error={localError}
            researchBrowserMode={researchBrowserMode}
            researchBrowserPresentation={researchBrowserPresentation}
            researchBrowserEndpoint={researchBrowserEndpoint}
            researchBrowserAuthorized={researchBrowserAuthorized}
            onResearchBrowserModeChange={setResearchBrowserMode}
            onResearchBrowserPresentationChange={setResearchBrowserPresentation}
            onResearchBrowserEndpointChange={setResearchBrowserEndpoint}
            onResearchBrowserAuthorizedChange={setResearchBrowserAuthorized}
            onAdd={() => { void handleEnter() }}
            onShare={() => { void handleExportSelectedPack() }}
          />
        ) : (
          <section data-testid="expert-marketplace" className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto pb-1" role="tablist" aria-label="专家分类">
                <CategoryFilter label="全部" active={activeCategoryId === 'all'} onClick={() => setActiveCategoryId('all')} />
                {categories.map((category) => <CategoryFilter key={category.id} label={category.name} active={activeCategoryId === category.id} onClick={() => setActiveCategoryId(category.id)} />)}
              </div>
              <label className="relative block w-full shrink-0 lg:w-64">
                <span className="sr-only">搜索专家</span>
                <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[17px] text-[var(--color-text-tertiary)]" aria-hidden="true">search</span>
                <input value={expertQuery} onChange={(event) => setExpertQuery(event.target.value)} placeholder="搜索专家" className="h-10 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] pl-9 pr-3 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20" />
              </label>
            </div>

            {loading ? <p className="py-10 text-sm text-[var(--color-text-secondary)]">正在加载已安装专家…</p> : null}
            {error ? <p className="mt-5 rounded-[10px] border border-[var(--color-danger)]/40 bg-[var(--color-surface-container-low)] px-4 py-3 text-sm text-[var(--color-danger)]">{error}</p> : null}
            {!loading && !error && visibleExperts.length === 0 ? <p className="mt-8 rounded-[12px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-container-low)] px-4 py-8 text-center text-sm text-[var(--color-text-secondary)]">没有符合条件的专家。</p> : null}
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" role="region" aria-label="专家列表">
              {visibleExperts.map((expert) => <ExpertMarketCard key={expertSelectionKey(expert)} expert={expert} onOpen={() => openDetail(expert)} />)}
            </div>
          </section>
        )}
      </div>

      {pendingSwitchExpert && sessionExpert ? (
        <ExpertSwitchConfirmation
          currentExpertName={sessionExpert.expertName}
          currentStatusLabel={EXPERT_SWITCH_STATUS_LABEL[sessionExpert.status]}
          nextExpertName={pendingSwitchExpert.name}
          busy={entering}
          error={localError}
          onContinue={handleClose}
          onSwitch={() => { void handleSwitchExpert() }}
          onCancel={() => setPendingSwitchExpert(null)}
        />
      ) : null}
    </ContentOverlay>
  )
}

function CategoryFilter({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return <button type="button" aria-pressed={active} onClick={onClick} className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${active ? 'bg-[var(--color-surface-selected)] text-[var(--color-text-primary)]' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]'}`}>{label}</button>
}

function ExpertMarketCard({ expert, onOpen }: { expert: ExpertDefinition; onOpen: () => void }) {
  const category = resolveExpertCategoryId(expert)
  return (
    <button type="button" onClick={onOpen} className="group flex min-h-56 flex-col rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] p-4 text-left transition-[border-color,background-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-[var(--color-brand)] hover:bg-[var(--color-surface)] hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/40">
      <div className="flex items-start justify-between gap-3">
        <ExpertAvatar expert={expert} size="lg" />
        <span className="material-symbols-outlined text-[20px] text-[var(--color-text-tertiary)] opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true">arrow_outward</span>
      </div>
      <div className="mt-4 min-w-0">
        <h3 className="text-[15px] font-semibold text-[var(--color-text-primary)]">{expert.name}</h3>
        <p className="mt-2 line-clamp-3 text-sm leading-6 text-[var(--color-text-secondary)]">{expert.profile?.tagline || expert.description}</p>
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-xs text-[var(--color-text-tertiary)]">
        <span className="inline-flex min-w-0 items-center gap-1.5 truncate"><span className="material-symbols-outlined text-[15px]" aria-hidden="true">local_library</span>{expert.packName}</span>
        <span className="shrink-0 rounded-full bg-[var(--color-surface-container)] px-2 py-0.5 text-[11px] text-[var(--color-text-secondary)]">{category === 'uncategorized' ? expert.statusLabel : category}</span>
      </div>
    </button>
  )
}

function ExpertDetail({
  expert,
  pack,
  entering,
  exportBusy,
  message,
  error,
  researchBrowserMode,
  researchBrowserPresentation,
  researchBrowserEndpoint,
  researchBrowserAuthorized,
  onResearchBrowserModeChange,
  onResearchBrowserPresentationChange,
  onResearchBrowserEndpointChange,
  onResearchBrowserAuthorizedChange,
  onAdd,
  onShare,
}: {
  expert: ExpertDefinition
  pack?: ExpertPackSummary
  entering: boolean
  exportBusy: boolean
  message: string | null
  error: string | null
  researchBrowserMode: 'managed' | 'cdp'
  researchBrowserPresentation: ExpertResearchBrowserPresentation
  researchBrowserEndpoint: string
  researchBrowserAuthorized: boolean
  onResearchBrowserModeChange: (value: 'managed' | 'cdp') => void
  onResearchBrowserPresentationChange: (value: ExpertResearchBrowserPresentation) => void
  onResearchBrowserEndpointChange: (value: string) => void
  onResearchBrowserAuthorizedChange: (value: boolean) => void
  onAdd: () => void
  onShare: () => void
}) {
  const profile = expert.profile
  const skillLabels = safeArray(expert.skillIds)
  const toolLabels = getToolLabels([expert], pack?.tools)
  const permissionLabels = getPermissionLabels([expert], pack?.tools)
  const cdpSelectionIncomplete = EXPERT_BROWSER_CHOICES_VISIBLE && researchBrowserMode === 'cdp' && (!researchBrowserAuthorized || !researchBrowserEndpoint.trim())

  return (
    <div data-testid="expert-detail" className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_320px]">
      <main className="min-w-0 bg-[var(--color-surface)] px-6 py-6 lg:border-r lg:border-[var(--color-border)]">
        <section className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">Expert profile</p>
          <h2 className="mt-2 text-xl font-semibold text-[var(--color-text-primary)]">{expert.name}</h2>
          <p className="mt-3 text-sm leading-7 text-[var(--color-text-secondary)]">{profile?.tagline || expert.description}</p>
        </section>

        <section className="mt-6">
          <h3 className="text-base font-semibold text-[var(--color-text-primary)]">简介</h3>
          <p className="mt-3 text-sm leading-7 text-[var(--color-text-secondary)]">{profile?.soul?.whoIAm || expert.description}</p>
        </section>

        {profile?.starterPrompts?.length ? (
          <section className="mt-6 border-t border-[var(--color-border)] pt-6">
            <h3 className="text-base font-semibold text-[var(--color-text-primary)]">可以这样开始</h3>
            <div className="mt-3 space-y-2">
              {profile.starterPrompts.slice(0, 3).map((prompt) => <p key={prompt} className="rounded-[10px] bg-[var(--color-surface-container-low)] px-4 py-3 text-sm leading-6 text-[var(--color-text-secondary)]">{prompt}</p>)}
            </div>
          </section>
        ) : null}

        <section className="mt-6 border-t border-[var(--color-border)] pt-6">
          <h3 className="text-base font-semibold text-[var(--color-text-primary)]">能力与边界</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <DetailList title="技能" items={skillLabels.length ? skillLabels : ['此专家未声明额外技能']} />
            <DetailList title="可用工具" items={toolLabels.length ? toolLabels : ['向你提问、收集材料、整理输出']} />
            <DetailList title="授权说明" items={permissionLabels.length ? permissionLabels : ['仅在你确认后调用所需能力']} />
            <DetailList title="专家包" items={[`${pack?.name ?? expert.packName} · v${pack?.version ?? expert.packVersion}`, expert.portable ? '可随 ZIP 一起备份或迁移' : '在本机环境中使用']} />
          </div>
        </section>
      </main>

      <aside className="bg-[var(--color-surface-container-low)] px-5 py-6">
        <div className="flex items-center gap-3">
          <ExpertAvatar expert={expert} size="md" />
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-[var(--color-text-primary)]">{expert.name}</h3>
            <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{expert.statusLabel} · v{expert.packVersion}</p>
          </div>
        </div>

        {EXPERT_BROWSER_CHOICES_VISIBLE && expert.researchBrowserPolicy?.allowUserAuthorizedCdp === true ? (
          <section className="mt-5 rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] p-3" data-testid="expert-browser-connection-options">
            <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">网页调研浏览器</h4>
            <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs leading-5 text-[var(--color-text-secondary)]">
              <input type="radio" name="expert-browser-connection" checked={researchBrowserMode === 'managed'} onChange={() => onResearchBrowserModeChange('managed')} />
              <span><strong className="text-[var(--color-text-primary)]">软件自带 Chromium（默认，隔离 Profile）</strong><br />无需额外设置；不会带入你日常默认浏览器的登录状态、Cookie、扩展或“浏览器扩展型 VPN/代理”，因此 Google / 百度的表现可能与日常浏览器不同。</span>
            </label>
            {researchBrowserMode === 'managed' && expert.researchBrowserPolicy?.allowManagedPresentationChoice === true ? (
              <fieldset className="ml-5 mt-2 space-y-2 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-2.5 text-xs leading-5 text-[var(--color-text-secondary)]">
                <legend className="px-1 text-xs font-medium text-[var(--color-text-primary)]">显示方式</legend>
                <label className="flex cursor-pointer items-start gap-2">
                  <input type="radio" name="expert-managed-browser-presentation" checked={researchBrowserPresentation === 'assistable_background'} onChange={() => onResearchBrowserPresentationChange('assistable_background')} />
                  <span><strong className="text-[var(--color-text-primary)]">后台检索，需要时可打开（推荐）</strong><br />浏览器初始最小化；网站需要验证时会弹出提示，只有你点击查看或“打开验证浏览器”才恢复窗口。恢复后软件不再自动最小化或收回。</span>
                </label>
                <label className="flex cursor-pointer items-start gap-2">
                  <input type="radio" name="expert-managed-browser-presentation" checked={researchBrowserPresentation === 'always_visible'} onChange={() => onResearchBrowserPresentationChange('always_visible')} />
                  <span><strong className="text-[var(--color-text-primary)]">全程显示浏览器操作</strong><br />每一步网页调研都会在可见浏览器中进行。</span>
                </label>
              </fieldset>
            ) : null}
            <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs leading-5 text-[var(--color-text-secondary)]">
              <input type="radio" name="expert-browser-connection" checked={researchBrowserMode === 'cdp'} onChange={() => onResearchBrowserModeChange('cdp')} />
              <span><strong className="text-[var(--color-text-primary)]">连接我主动开启的系统默认浏览器（需支持 CDP）</strong><br />App 不限定浏览器品牌，只连接你明确提供的本机 CDP 调试端口；普通窗口不会被偷偷接管。</span>
            </label>
            {researchBrowserMode === 'cdp' ? (
              <div className="mt-3 space-y-3 border-t border-[var(--color-border)] pt-3 text-xs text-[var(--color-text-secondary)]">
                <p>请让系统默认浏览器以一个专门的调试窗口开放本机 CDP 端口，并在其中手动登录/验证。App 不会指定 Chrome，也不会复制你普通窗口的 Cookie。Chromium、Edge、Brave、Arc 等兼容 CDP 的浏览器可连接；Safari 和 Firefox 的普通窗口不提供 Playwright 所需的 CDP 接口，不能假装已经接入。不要把日常或敏感标签页放进该调试窗口。</p>
                <label className="block">本机调试地址
                  <input aria-label="本机浏览器调试地址" className="mt-1 block w-full rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-xs" value={researchBrowserEndpoint} onChange={(event) => onResearchBrowserEndpointChange(event.target.value)} placeholder="http://127.0.0.1:9222" />
                </label>
                <label className="flex cursor-pointer items-start gap-2 leading-5">
                  <input type="checkbox" checked={researchBrowserAuthorized} onChange={(event) => onResearchBrowserAuthorizedChange(event.target.checked)} />
                  <span>我确认：本次专家会话可以读取和操作这个<strong>专门开启的调试浏览器</strong>内的标签页；我已主动授权本次连接。</span>
                </label>
              </div>
            ) : null}
          </section>
        ) : null}

        {!EXPERT_BROWSER_CHOICES_VISIBLE && expert.researchBrowserPolicy ? <p className="mt-4 text-xs leading-5 text-[var(--color-text-secondary)]">网页调研使用软件自带 Chromium，在后台运行。需要登录或验证时会通知你，只有你点击打开浏览器才会显示窗口。</p> : null}

        {EXPERT_BROWSER_CHOICES_VISIBLE && expert.researchBrowserPolicy?.allowManagedPresentationChoice === true ? <p className="mt-4 text-xs leading-5 text-[var(--color-text-tertiary)]">调研开始后，软件会先提示正在检索；只有你选择全程显示，或网站需要你完成验证时，才会显示浏览器窗口。</p> : null}

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" onClick={onAdd} disabled={entering || cdpSelectionIncomplete} aria-label="进入专家 Mode" className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-[var(--color-brand)] px-3 text-sm font-semibold text-[var(--color-on-primary)] transition-colors hover:bg-[var(--color-brand-hover)] disabled:cursor-not-allowed disabled:opacity-60">
            <span className="material-symbols-outlined text-[17px]" aria-hidden="true">add</span>
            {entering ? '正在添加…' : '添加'}
          </button>
          <button type="button" onClick={onShare} disabled={exportBusy} aria-label="导出这个专家包" className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] px-3 text-sm font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-surface-hover)] disabled:cursor-not-allowed disabled:opacity-60">
            <span className="material-symbols-outlined text-[17px]" aria-hidden="true">ios_share</span>
            {exportBusy ? '准备中…' : '分享'}
          </button>
        </div>

        {message ? <p className="mt-4 rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] px-3 py-2 text-xs leading-5 text-[var(--color-text-secondary)]">{message}</p> : null}
        {error ? <p className="mt-4 rounded-[10px] border border-[var(--color-danger)]/40 bg-[var(--color-surface-container-lowest)] px-3 py-2 text-xs leading-5 text-[var(--color-danger)]">{error}</p> : null}

        <section className="mt-6 border-t border-[var(--color-border)] pt-5">
          <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">擅长处理</h4>
          <div className="mt-3 flex flex-wrap gap-2">
            {safeArray(expert.tags).length ? safeArray(expert.tags).map((tag) => <span key={tag} className="rounded-full bg-[var(--color-surface-container-high)] px-2.5 py-1 text-xs text-[var(--color-text-secondary)]">{tag}</span>) : <span className="text-xs text-[var(--color-text-tertiary)]">暂未设置标签</span>}
          </div>
        </section>

        <section className="mt-6 border-t border-[var(--color-border)] pt-5">
          <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">专家包信息</h4>
          <dl className="mt-3 space-y-3 text-sm">
            <div><dt className="text-xs text-[var(--color-text-tertiary)]">专家包</dt><dd className="mt-1 break-words text-[var(--color-text-secondary)]">{pack?.name ?? expert.packName}</dd></div>
            <div><dt className="text-xs text-[var(--color-text-tertiary)]">版本</dt><dd className="mt-1 text-[var(--color-text-secondary)]">{pack?.version ?? expert.packVersion}</dd></div>
            <div><dt className="text-xs text-[var(--color-text-tertiary)]">材料表单</dt><dd className="mt-1 text-[var(--color-text-secondary)]">{expert.formPaths.length} 项</dd></div>
          </dl>
        </section>
      </aside>
    </div>
  )
}

function ExpertAvatar({ expert, size }: { expert: ExpertDefinition; size: 'md' | 'lg' }) {
  const avatar = expert.profile?.avatar?.trim()
  const sizeClass = size === 'lg' ? 'h-12 w-12 text-xl' : 'h-11 w-11 text-lg'
  if (avatar && /^(https?:|data:image)/.test(avatar)) return <img src={avatar} alt="" className={`${sizeClass} shrink-0 rounded-[12px] border border-[var(--color-border)] object-cover`} />
  return <span className={`inline-flex ${sizeClass} shrink-0 items-center justify-center rounded-[12px] bg-[var(--color-surface-container-high)] text-[var(--color-brand)]`}>{avatar || <span className="material-symbols-outlined text-[22px]" aria-hidden="true">support_agent</span>}</span>
}

function DetailList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-3">
      <h4 className="text-xs font-semibold text-[var(--color-text-primary)]">{title}</h4>
      <ul className="mt-2 space-y-1.5 text-xs leading-5 text-[var(--color-text-secondary)]">{items.map((item) => <li key={item}>— {item}</li>)}</ul>
    </section>
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
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 px-4">
      <section role="alertdialog" aria-modal="true" aria-labelledby="expert-switch-confirmation-title" className="w-full max-w-lg rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-2xl" data-testid="expert-switch-confirmation">
        <h3 id="expert-switch-confirmation-title" className="text-base font-semibold text-[var(--color-text-primary)]">切换专家</h3>
        <p className="mt-3 text-sm leading-6 text-[var(--color-text-secondary)]">当前会话正在使用「{currentExpertName}」（{currentStatusLabel}）。切换到「{nextExpertName}」会先退出当前专家，但不会创建或改动工作流。</p>
        {error ? <p className="mt-3 rounded-[8px] border border-[var(--color-danger)]/40 bg-[var(--color-surface-container-low)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p> : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="rounded-[8px] px-3 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] disabled:opacity-60">取消</button>
          <button type="button" onClick={onContinue} disabled={busy} className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] px-3 py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] disabled:opacity-60">继续当前专家</button>
          <button type="button" onClick={onSwitch} disabled={busy} className="rounded-[8px] bg-[var(--color-brand)] px-3 py-2 text-sm font-semibold text-[var(--color-on-primary)] hover:bg-[var(--color-brand-hover)] disabled:opacity-60">{busy ? '正在切换…' : '退出并切换'}</button>
        </div>
      </section>
    </div>
  )
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
  if (id === 'AskUserQuestion') return '向你提问并等待选择'
  return purpose || name || id
}

function plainPackageToolLabel(tool: ExpertToolManifest): string {
  return tool.purpose || tool.name || tool.id
}

function uniqueNonEmpty(items: Array<string | null | undefined>): string[] {
  return [...new Set(items.map((item) => item?.trim()).filter((item): item is string => Boolean(item)))]
}
