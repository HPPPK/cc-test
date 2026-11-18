import { useEffect, useRef, useState } from 'react'
import { getWorkflowTimeline, type WorkflowTimelineEvent, type WorkflowTimelinePage } from '../../api/workflowTimeline'
import { Modal } from '../shared/Modal'

type Props = {
  sessionId: string
  workflowStatus?: string
  blockedReason?: string
  pendingConfirmation?: boolean
  chatState?: string
}
const labels: Record<WorkflowTimelineEvent['kind'], string> = { phase: '阶段', task: '子任务', 'tool-start': '调用工具', 'tool-result': '工具结果', waiting: '等待', error: '错误', status: '进度' }
const statusLabels: Record<string, string> = { preparing: '准备调用', running: '执行中', succeeded: '成功', failed: '失败', completed: '已完成', waiting: '等待中', blocked: '被阻塞', interrupted: '已中断', cancelled: '已取消', idle: '本轮结束', thinking: '处理中', needs_fix: '需要修复', waiting_dependency: '等待依赖', waiting_user: '等待用户' }
const buttonClass = 'rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] disabled:opacity-50'

export function WorkflowTimeline({ sessionId, workflowStatus, blockedReason, pendingConfirmation, chatState }: Props) {
  const [open, setOpen] = useState(false)
  const [events, setEvents] = useState<WorkflowTimelineEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState<WorkflowTimelinePage | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('all')
  const [refresh, setRefresh] = useState(0)
  const [follow, setFollow] = useState(true)
  const [now, setNow] = useState(Date.now())
  const generation = useRef(0)
  const scope = useRef('')
  const latestId = useRef<string | undefined>(undefined)
  const olderBusy = useRef(false)
  const following = useRef(true)
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const version = ++generation.current
    const reset = scope.current !== `${sessionId}:${open}`
    scope.current = `${sessionId}:${open}`
    if (reset) {
      setEvents([])
      setPage(null)
      setError(null)
      setHasMore(false)
      latestId.current = undefined
      following.current = true
      setFollow(true)
    }
    olderBusy.current = false
    if (!open) return
    let timer: ReturnType<typeof setTimeout>
    let first = reset || !page
    const load = async () => {
      setLoading(true)
      try {
        const response = await getWorkflowTimeline(sessionId)
        if (generation.current !== version) return
        const incoming = [...response.events]
        let older = response
        // Catch up through any burst larger than one page, so polling cannot leave gaps.
        while (latestId.current && older.hasMore && older.events.length && !older.events.some(event => event.id === latestId.current)) {
          older = await getWorkflowTimeline(sessionId, older.events[0]!.id)
          if (generation.current !== version) return
          incoming.push(...older.events)
        }
        latestId.current = response.events[response.events.length - 1]?.id
        setEvents(previous => mergeEvents(previous, incoming))
        setPage(response)
        setError(null)
        setNow(Date.now())
        if (first) {
          setHasMore(response.hasMore)
          first = false
        }
      } catch (cause) {
        if (generation.current === version) setError(cause instanceof Error ? cause.message : '时间线加载失败')
      } finally {
        if (generation.current === version) {
          setLoading(false)
          timer = setTimeout(() => void load(), 2_000)
        }
      }
    }
    void load()
    return () => {
      generation.current++
      clearTimeout(timer)
    }
  }, [sessionId, open, refresh])

  const latestEventId = events[events.length - 1]?.id
  useEffect(() => { if (following.current) end.current?.scrollIntoView?.({ block: 'nearest' }) }, [latestEventId])

  async function loadOlder() {
    if (olderBusy.current || !events.length) return
    olderBusy.current = true
    following.current = false
    setFollow(false)
    const version = generation.current
    try {
      const response = await getWorkflowTimeline(sessionId, events[0]!.id)
      if (version !== generation.current) return
      setEvents(previous => mergeEvents(previous, response.events))
      setHasMore(response.hasMore)
      setError(null)
    } catch (cause) {
      if (version === generation.current) setError(cause instanceof Error ? cause.message : '历史记录加载失败')
    } finally { if (version === generation.current) olderBusy.current = false }
  }

  const last = events[events.length - 1]
  const elapsed = last ? Math.max(0, Math.floor((now - Date.parse(last.at)) / 1000)) : 0
  const banner = blockedReason ? `被阻塞：${blockedReason}`
    : pendingConfirmation ? '等待你确认当前阶段'
    : chatState === 'permission_pending' ? '等待你的回答或授权'
    : workflowStatus === 'completed' ? '工作流已完成，可回看执行记录'
    : workflowStatus === 'cancelled' || workflowStatus === 'stopped' ? '工作流已停止，可回看执行记录'
    : last?.kind === 'error' || last?.status === 'failed' ? `执行异常：${last.summary}`
    : elapsed >= 60 && chatState && chatState !== 'idle' ? `已有 ${elapsed} 秒没有新执行事件；可能仍在等待工具或模型响应`
    : last ? `最近进展：${last.summary}` : '等待执行事件'
  const visible = events.filter(event => filter === 'all'
    || filter === 'tools' && (event.kind === 'tool-start' || event.kind === 'tool-result')
    || filter === 'phases' && (event.kind === 'phase' || event.kind === 'task')
    || filter === 'problems' && (event.kind === 'error' || event.kind === 'waiting' || ['failed', 'blocked', 'needs_fix'].includes(event.status ?? '')))
  const toolStarts = new Map(events.filter(event => event.kind === 'tool-start').map(event => [toolKey(event), event]))
  const toolResults = new Map(events.filter(event => event.kind === 'tool-result').map(event => [toolKey(event), event]))

  return <>
    <button type="button" className={`${buttonClass} inline-flex w-fit items-center gap-1.5`} onClick={() => setOpen(true)}>
      <span className="material-symbols-outlined text-[16px]" aria-hidden="true">history</span>执行时间线
    </button>
    <Modal open={open} onClose={() => setOpen(false)} title="工作流执行时间线" width={860}>
      <div className="space-y-3 text-sm">
        <div role="status" className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-container)] px-3 py-2">
          <p className="font-medium text-[var(--color-text-primary)]">{banner}</p>
          <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">每 2 秒更新 · 输入与结果显示脱敏摘要，最多 8,000 字符</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="筛选执行事件" value={filter} onChange={event => setFilter(event.target.value)} className={`${buttonClass} bg-[var(--color-surface)]`}>
            <option value="all">全部事件</option><option value="tools">工具调用</option><option value="phases">阶段与子任务</option><option value="problems">错误与等待</option>
          </select>
          <button type="button" className={buttonClass} onClick={() => setRefresh(value => value + 1)}>刷新</button>
          <label className="flex items-center gap-1 text-xs text-[var(--color-text-secondary)]"><input type="checkbox" checked={follow} onChange={event => {
            following.current = event.target.checked
            setFollow(event.target.checked)
          }} />跟随最新</label>
          {loading && <span className="text-xs text-[var(--color-text-tertiary)]">更新中…</span>}
        </div>
        {error && <p role="alert" className="text-[var(--color-error)]">{error}；自动重试中，已有记录仍保留。</p>}
        {page?.warnings.map(warning => <p key={warning} role="alert" className="text-[var(--color-error)]">{warning}</p>)}
        {page?.historySource !== 'recorded' && page && <p className="text-xs text-[var(--color-text-tertiary)]">部分历史从已有会话存档恢复；旧版本未保存的实时进度无法补录。</p>}
        <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1" aria-label="执行事件列表" onScroll={event => {
          const list = event.currentTarget
          if (list.scrollHeight - list.scrollTop - list.clientHeight > 48 && following.current) {
            following.current = false
            setFollow(false)
          }
        }}>
          {hasMore && <button type="button" className={buttonClass} onClick={() => void loadOlder()}>加载更早记录</button>}
          {!visible.length && !loading && <p className="py-6 text-center text-[var(--color-text-tertiary)]">暂无符合条件的执行记录</p>}
          {visible.map(event => {
            const start = event.toolUseId ? toolStarts.get(toolKey(event)) : undefined
            const finished = event.kind === 'tool-start' ? toolResults.get(toolKey(event)) : undefined
            const ended = ['completed', 'cancelled', 'stopped', 'failed'].includes(workflowStatus ?? '')
            const status = finished?.status ?? (ended && event.kind === 'tool-start' ? 'interrupted' : event.status)
            const duration = start && event.kind === 'tool-result' ? Math.max(0, Date.parse(event.at) - Date.parse(start.at)) : undefined
            return <article key={event.id} className={`rounded-lg border border-[var(--color-border)] p-3 ${status === 'failed' ? 'bg-[var(--color-error)]/5' : 'bg-[var(--color-surface)]'}`}>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-[var(--color-text-tertiary)]">
                <time dateTime={event.at}>{new Date(event.at).toLocaleString()}</time><span>{labels[event.kind]}</span>
                {event.phaseId && <span>阶段：{event.phaseId}</span>}
                {event.parentToolUseId && <span title={event.parentToolUseId}>子 Agent</span>}
                {status && <span className={status === 'failed' ? 'text-[var(--color-error)]' : ''}>{statusLabels[status] ?? status}</span>}
                {duration !== undefined && <span>{(duration / 1000).toFixed(1)} 秒</span>}
              </div>
              <p className="mt-1 break-words font-medium text-[var(--color-text-primary)]">{event.kind === 'tool-result' && (start?.toolName ?? event.toolName) ? `${start?.toolName ?? event.toolName} · ` : ''}{event.summary}</p>
              {event.runId && <p className="mt-1 break-all text-xs text-[var(--color-text-tertiary)]">执行：{event.runId}</p>}
              {event.detail && <details className="mt-2 text-xs"><summary className="cursor-pointer text-[var(--color-text-secondary)]">{event.kind === 'tool-start' ? '查看调用参数' : event.kind === 'tool-result' ? '查看返回结果' : '查看详情'}</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[var(--color-surface-container)] p-2 text-[var(--color-text-secondary)]">{event.detail}</pre></details>}
            </article>
          })}
          <div ref={end} />
        </div>
      </div>
    </Modal>
  </>
}

function mergeEvents(previous: WorkflowTimelineEvent[], incoming: WorkflowTimelineEvent[]) {
  const merged = new Map(previous.map(event => [event.id, event]))
  for (const event of incoming) merged.set(event.id, event)
  return [...merged.values()].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
}

function toolKey(event: WorkflowTimelineEvent) {
  return `${event.parentToolUseId ?? ''}/${event.toolUseId ?? ''}`
}
