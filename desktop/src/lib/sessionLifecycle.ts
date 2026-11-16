import type { ChatState } from '../types/chat'
import type { WorkflowSessionSummary } from '../types/session'

/** Product lifecycle only. Transport/tool states and persisted data stay unchanged. */
export type SessionLifecycle = {
  status: 'idle' | 'running' | 'waiting_for_user' | 'paused' | 'ended'
  run: number
  endReason?: 'completed' | 'failed' | 'stopped'
  announcedWaits: string[]
}

export type LifecycleWait = { key: string; body: string }
export type LifecycleInput = {
  signal: 'start' | 'progress' | 'wait' | 'settled' | 'failed' | 'stopped' | 'workflow' | 'snapshot' | 'reset'
  chatState: ChatState
  workflow?: WorkflowSessionSummary | null
  waits?: LifecycleWait[]
  now?: number
}
export type LifecycleNotice = LifecycleWait & { attention: boolean }

export function initialSessionLifecycle(chatState: ChatState = 'idle'): SessionLifecycle {
  return {
    status: chatState === 'idle' ? 'idle' : chatState === 'permission_pending' ? 'waiting_for_user' : 'running',
    run: chatState === 'idle' ? 0 : 1,
    announcedWaits: [],
  }
}

export function transitionSessionLifecycle(previous: SessionLifecycle, input: LifecycleInput): {
  lifecycle: SessionLifecycle
  notice?: LifecycleNotice
} {
  const { signal, workflow } = input
  if (signal === 'reset') return { lifecycle: initialSessionLifecycle() }
  if (signal === 'start') return { lifecycle: { status: 'running', run: previous.run + 1, announcedWaits: [] } }

  const end = (reason: NonNullable<SessionLifecycle['endReason']>, body: string) => {
    if (previous.status === 'ended') return { lifecycle: previous }
    const lifecycle: SessionLifecycle = { ...previous, status: 'ended', endReason: reason }
    // Loading an old transcript/snapshot must not generate a new completion.
    return {
      lifecycle,
      ...(previous.status !== 'idle' ? { notice: { key: `end:${previous.run}`, body, attention: false } } : {}),
    }
  }
  if (signal === 'stopped') return end('stopped', '执行已停止。')
  if (signal === 'failed') return end('failed', '执行失败，请查看会话中的错误信息。')
  // A trailing result/status must not turn a known failure/stop into success.
  if (previous.status === 'ended' && signal !== 'progress' && signal !== 'wait' && signal !== 'workflow') {
    return { lifecycle: previous }
  }

  const waits = [...(input.waits ?? [])]
  const wfStatus = workflow?.runStatus ?? workflow?.status
  if (workflow?.mode === 'workflow') {
    if (wfStatus === 'draft' && previous.status === 'idle' && input.chatState === 'idle') return { lifecycle: previous }
    if (wfStatus === 'paused') return { lifecycle: previous.status === 'paused' ? previous : { ...previous, status: 'paused' } }
    if (wfStatus === 'completed' && waits.length === 0 && signal !== 'progress' && signal !== 'wait') return end('completed', '工作流已完成。')
    if ((wfStatus === 'stopped' || wfStatus === 'cancelled') && waits.length === 0 && signal !== 'progress' && signal !== 'wait') return end('stopped', '工作流已停止。')
    const route = workflow.pendingRoute?.status === 'pending' ? workflow.pendingRoute : null
    if (route || workflow.pendingConfirmation || wfStatus === 'waiting_for_user' || wfStatus === 'pending-confirmation') {
      waits.push({
        key: `workflow:${route?.routeId ?? workflow.pendingConfirmationId ?? `${workflow.activePhaseId}:${workflow.stateVersion ?? 0}`}`,
        body: route ? '工作流需要你确认下一步操作。' : '工作流正在等待你确认或提供信息。',
      })
    } else if (wfStatus === 'blocked' || workflow.blockedReason || workflow.blockedStatus || wfStatus === 'failed') {
      const expiresAt = Date.parse(workflow.autoRecovery?.expiresAt ?? '')
      const recovering = Number.isFinite(expiresAt) && expiresAt > (input.now ?? Date.now())
      if (recovering && waits.length === 0) {
        return { lifecycle: previous.status === 'running' ? previous : { ...previous, status: 'running' } }
      }
      if (!recovering) waits.push({
        key: `workflow-blocked:${workflow.activePhaseId}:${workflow.blockedReason ?? workflow.blockedStatus ?? 'blocked'}`,
        body: `工作流需要你手动处理。${workflow.blockedReason ?? ''}`,
      })
    }
  }
  if (waits.length > 0) {
    const unseen = waits.find(wait => !previous.announcedWaits.includes(wait.key))
    if (!unseen && previous.status === 'waiting_for_user') return { lifecycle: previous }
    return {
      lifecycle: {
        ...previous,
        status: 'waiting_for_user',
        ...(unseen ? { announcedWaits: [...previous.announcedWaits, unseen.key] } : {}),
      },
      ...(unseen ? { notice: { ...unseen, attention: true } } : {}),
    }
  }
  if (signal === 'settled' || (signal === 'snapshot' && input.chatState === 'idle')) {
    if (workflow?.mode === 'workflow' && (wfStatus === 'active' || wfStatus === 'running')) {
      return { lifecycle: previous.status === 'running' ? previous : { ...previous, status: 'running' } }
    }
    if (previous.status === 'idle' || previous.status === 'paused') return { lifecycle: previous }
    return end('completed', '本轮执行已结束。')
  }
  if (signal === 'progress' || signal === 'workflow' || input.chatState !== 'idle') {
    const starting = previous.status === 'idle' || previous.status === 'ended'
    if (previous.status === 'running') return { lifecycle: previous }
    return { lifecycle: { status: 'running', run: starting ? previous.run + 1 : previous.run, announcedWaits: starting ? [] : previous.announcedWaits } }
  }
  return { lifecycle: previous }
}
