import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { createHash, randomUUID } from 'node:crypto'
import { getAppStoragePath } from '../../utils/appIdentity.js'
import type { WorkflowSessionState } from './workflowTypes.js'

export type WorkflowTimelineEvent = {
  schemaVersion: 1
  id: string
  at: string
  kind: 'phase' | 'task' | 'tool-start' | 'tool-result' | 'waiting' | 'error' | 'status'
  summary: string
  detail?: string
  status?: string
  phaseId?: string
  runId?: string
  toolUseId?: string
  toolName?: string
  parentToolUseId?: string
  source: 'live' | 'history'
}

export type WorkflowTimelinePage = {
  events: WorkflowTimelineEvent[]
  hasMore: boolean
  historySource: 'recorded' | 'reconstructed' | 'mixed'
  warnings: string[]
  updatedAt: string
}

type RecordValue = Record<string, unknown>
const object = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {}
const string = (value: unknown): string | undefined => typeof value === 'string' && value.length > 0 ? value : undefined
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24)
const relevantTypes = new Set(['content_start', 'tool_use_complete', 'tool_result', 'permission_request', 'permission_response_ack', 'computer_use_permission_request', 'error', 'status', 'task_update', 'system_notification'])
const eventKinds = new Set(['phase', 'task', 'tool-start', 'tool-result', 'waiting', 'error', 'status'])

/** Keep useful execution details without duplicating credentials or binary attachments. */
export function timelineDetail(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  const text = typeof value === 'string' ? value : JSON.stringify(value, (key, item) => {
    if (/api[-_]?key|token|password|secret|authorization|cookie|base64|image_url/i.test(key)) return '[REDACTED]'
    if (item && typeof item === 'object' && ['image', 'base64'].includes(item.type)) return '[IMAGE OMITTED]'
    return typeof item === 'string' ? redactText(item) : item
  })
  if (!text) return undefined
  return redactText(text).slice(0, 8_000)
}

function redactText(text: string): string {
  return text
    .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}/g, '[REDACTED]')
    .replace(/((?:api[-_]?key|(?:access[-_]?)?token|password|secret|authorization|cookie)["']?\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s&,;"']+)/gi,
      (_match, prefix: string) => `${prefix}${/["']\s*:/.test(prefix) ? '"[REDACTED]"' : '[REDACTED]'}`)
}

function messageEvent(message: RecordValue, at: string): WorkflowTimelineEvent | null {
  const toolUseId = string(message.toolUseId)
  const toolName = string(message.toolName)
  const common = { schemaVersion: 1 as const, at, source: 'live' as const, toolUseId, toolName, parentToolUseId: string(message.parentToolUseId) }
  const scopedToolId = `${common.parentToolUseId ? common.parentToolUseId + '/' : ''}${toolUseId}`
  if ((message.type === 'content_start' && message.blockType === 'tool_use' || message.type === 'tool_use_complete') && toolUseId) {
    return { ...common, id: `tool:${scopedToolId}:start`, kind: 'tool-start', summary: toolName ?? '工具调用', status: message.type === 'content_start' ? 'preparing' : 'running', detail: timelineDetail(message.input) }
  }
  if (message.type === 'tool_result' && toolUseId) {
    return { ...common, id: `tool:${scopedToolId}:result`, kind: 'tool-result', summary: message.isError ? '工具执行失败' : '工具返回结果', status: message.isError ? 'failed' : 'succeeded', detail: timelineDetail(message.content) }
  }
  if (message.type === 'permission_request') {
    return { ...common, id: `permission:${string(message.requestId) ?? randomUUID()}`, kind: 'waiting', summary: toolName === 'AskUserQuestion' ? '等待回答问题' : '等待工具执行授权', status: 'waiting', detail: timelineDetail({ description: message.description, input: message.input }) }
  }
  if (message.type === 'permission_response_ack') return { ...common, id: `permission:${message.requestId}:response`, kind: 'status', summary: `授权请求：${message.status}`, status: message.status === 'accepted' ? 'running' : 'waiting', detail: timelineDetail(message.message) }
  if (message.type === 'computer_use_permission_request') return { ...common, id: `permission:${message.requestId}`, kind: 'waiting', summary: '等待电脑操作授权', status: 'waiting', detail: timelineDetail(message.request) }
  if (message.type === 'task_update') return { ...common, id: `task:${hash(message)}`, kind: 'task', summary: `${message.taskId}: ${message.status}`, status: string(message.status), detail: timelineDetail(message.progress) }
  if (message.type === 'error') return { ...common, id: randomUUID(), kind: 'error', summary: string(message.code) ?? '执行错误', status: 'failed', detail: timelineDetail(message.message) }
  if (message.type === 'status') {
    const status = string(message.state) ?? 'unknown'
    const labels: Record<string, string> = { thinking: 'AI 正在处理', streaming: 'AI 正在输出', tool_executing: '正在执行工具', idle: '本轮执行结束', error: '执行异常', stopped: '执行已停止' }
    return { ...common, id: randomUUID(), kind: 'status', summary: timelineDetail(message.verb) ?? labels[status] ?? status, status }
  }
  if (message.type === 'system_notification' && ['task_started', 'task_notification', 'task_progress'].includes(String(message.subtype))) {
    const data = object(message.data)
    const fallback = message.subtype === 'task_started' ? '子 Agent 已启动' : message.subtype === 'task_progress' ? '子 Agent 执行进展' : '子 Agent 返回结果'
    return { ...common, id: `task:${hash([message.subtype, data])}`, kind: 'task', summary: timelineDetail(message.message ?? data.summary ?? data.description) ?? `${data.task_id ?? ''} ${fallback}`.trim(), status: string(data.status) ?? 'running', detail: timelineDetail(data), parentToolUseId: string(data.tool_use_id) ?? common.parentToolUseId }
  }
  return null
}

export function workflowStateTimeline(state: WorkflowSessionState): WorkflowTimelineEvent[] {
  const events: WorkflowTimelineEvent[] = []
  const phaseLabels = new Map((state.phases ?? []).map(phase => [phase.id, phase.label ?? phase.id]))
  const add = (id: string, at: string, kind: WorkflowTimelineEvent['kind'], summary: string, detail?: unknown, status?: string, phaseId?: string, runId?: string) => {
    events.push({ schemaVersion: 1, id, at, kind, summary: timelineDetail(summary) ?? '', detail: timelineDetail(detail), status, phaseId, runId, source: 'history' })
  }
  for (const transition of state.transitionHistory ?? []) {
    add(`phase:${transition.transitionId}`, transition.createdAt, 'phase', `${phaseLabels.get(transition.fromPhaseId ?? '') ?? transition.fromPhaseId ?? '开始'} → ${phaseLabels.get(transition.toPhaseId ?? '') ?? transition.toPhaseId ?? '结束'}`, transition, transition.decision ?? transition.result, transition.toPhaseId ?? undefined)
  }
  for (const run of state.workflowRuns ?? []) for (const event of run.history ?? []) {
    add(`run:${run.id}:${hash(event)}`, event.at, 'phase', event.summary, event, event.type, event.phaseId, run.id)
  }
  for (const audit of state.runtimeContract?.audit ?? []) {
    add(`audit:${hash(audit)}`, audit.at, 'phase', audit.summary, audit, audit.type, audit.phaseId)
  }
  for (const phase of Object.values(state.runtimeContract?.phaseStates ?? {})) {
    for (const task of phase.taskSnapshots ?? []) {
      add(`task:${hash([phase.phaseId, task])}`, task.updatedAt, 'task', `${task.taskId}: ${task.status}`, task, task.status, phase.phaseId, task.agentRunId)
    }
  }
  if (state.blockedReason) add(`blocked:${hash([state.activePhaseId, state.blockedReason])}`, state.updatedAt, 'waiting', '工作流被阻塞', state.blockedReason, 'blocked', state.activePhaseId ?? undefined)
  return events
}

/** Additive v1 JSONL journal. Existing state and transcripts are never rewritten. */
export class WorkflowTimelineService {
  private locks = new Map<string, Promise<void>>()
  private failures = new Set<string>()
  constructor(private options: { configDir?: string } = {}) {}

  getPath(sessionId: string): string {
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(sessionId)) throw new Error('Invalid workflow timeline session id')
    const configDir = this.options.configDir ?? process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude')
    return getAppStoragePath(configDir, 'workflow-sessions', sessionId, 'timeline.jsonl')
  }

  private enqueue(file: string, work: () => Promise<void>): Promise<void> {
    const next = (this.locks.get(file) ?? Promise.resolve()).catch(() => {}).then(work)
    this.locks.set(file, next)
    void next.finally(() => { if (this.locks.get(file) === next) this.locks.delete(file) }).catch(() => {})
    return next
  }

  async recordMessage(sessionId: string, message: RecordValue): Promise<void> {
    if (!relevantTypes.has(String(message.type))) return
    const event = messageEvent(message, new Date().toISOString())
    if (!event) return
    const file = this.getPath(sessionId)
    await this.enqueue(file, async () => {
      let state: WorkflowSessionState
      try { state = JSON.parse(await fs.readFile(path.join(path.dirname(file), 'state.json'), 'utf8')) } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
        throw error
      }
      if (state.mode !== 'workflow') return
      if (['completed', 'cancelled'].includes(state.workflowStatus) || state.runStatus === 'stopped') {
        // Retain late results of tools launched by this workflow, but do not journal
        // ordinary chat after the user exits it.
        if (event.kind !== 'tool-result') return
        const stored = await this.load(file)
        if (!stored.events.some(item => item.kind === 'tool-start' && item.toolUseId === event.toolUseId && item.parentToolUseId === event.parentToolUseId)) return
      }
      event.phaseId = state.activePhaseId ?? undefined
      event.runId = state.activeWorkflowRunId
      await this.append(file, [event])
    }).catch(error => {
      this.failures.add(file)
      throw error
    })
  }

  async recordState(state: WorkflowSessionState): Promise<void> {
    const events = workflowStateTimeline(state)
    if (!events.length) return
    const file = this.getPath(state.sessionId)
    await this.enqueue(file, async () => {
      const stored = await this.load(file)
      const ids = new Set(stored.events.map(event => event.id))
      await this.append(file, events.filter(event => !ids.has(event.id)))
    }).catch(error => {
      this.failures.add(file)
      throw error
    })
  }

  private async append(file: string, events: WorkflowTimelineEvent[]): Promise<void> {
    if (!events.length) return
    await fs.mkdir(path.dirname(file), { recursive: true })
    // Leading newline also isolates an interrupted final append on the next write.
    await fs.appendFile(file, '\n' + events.map(event => JSON.stringify(event)).join('\n') + '\n', 'utf8')
  }

  private async load(file: string): Promise<{ events: WorkflowTimelineEvent[]; warnings: string[] }> {
    let content: string
    try { content = await fs.readFile(file, 'utf8') } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { events: [], warnings: [] }
      throw error
    }
    const events: WorkflowTimelineEvent[] = []
    const warnings = new Set<string>()
    for (const line of content.split('\n')) {
      if (!line.trim()) continue
      try {
        const event = JSON.parse(line)
        if (event.schemaVersion !== 1) {
          warnings.add('部分日志版本暂不支持，原始文件已保留。')
          continue
        }
        if (typeof event.id !== 'string' || typeof event.at !== 'string' || !Number.isFinite(Date.parse(event.at)) || typeof event.summary !== 'string'
          || !eventKinds.has(event.kind) || !['live', 'history'].includes(event.source)
          || ['detail', 'status', 'phaseId', 'runId', 'toolUseId', 'toolName', 'parentToolUseId'].some(key => event[key] !== undefined && typeof event[key] !== 'string')) throw new Error('Invalid event')
        events.push(event)
      } catch { warnings.add('部分日志损坏或写入未完成，已跳过；其他记录仍可查看。') }
    }
    return { events, warnings: [...warnings] }
  }

  async read(sessionId: string, state: WorkflowSessionState, messages: unknown[], options: { limit?: number; before?: string } = {}): Promise<WorkflowTimelinePage> {
    const file = this.getPath(sessionId)
    await this.locks.get(file)?.catch(() => {})
    const stored = await this.load(file)
    const history = workflowStateTimeline(state)
    const terminal = ['completed', 'cancelled'].includes(state.workflowStatus) || state.runStatus === 'stopped'
    const cutoff = [...(state.transitionHistory ?? [])].reverse().find(item => ['completed', 'cancelled', 'stopped'].includes(item.decision ?? ''))?.createdAt ?? state.updatedAt
    const windows = state.workflowRuns?.length ? state.workflowRuns.map(run => ({
      from: Date.parse(run.createdAt),
      to: ['completed', 'cancelled', 'stopped'].includes(run.status) ? Date.parse(run.updatedAt) : Infinity,
    })) : [{ from: Date.parse(state.createdAt) || 0, to: terminal ? Date.parse(cutoff) : Infinity }]
    const permittedTools = new Set(stored.events.filter(event => event.kind === 'tool-start').map(event => `${event.parentToolUseId ?? ''}/${event.toolUseId}`))
    for (const raw of messages) {
      const message = object(raw)
      for (const block of Array.isArray(message.content) ? message.content : [message.content]) {
        const content = object(block)
        const type = content.type ?? message.type
        if (type !== 'tool_use' && type !== 'tool_result') continue
      // SessionService prefixes completed subagent transcript ids with parent/agent.
      // Live CLI events carry the raw tool id and parent separately.
        const rawToolId = string(type === 'tool_use' ? content.id : content.tool_use_id)
        const toolId = message.parentToolUseId && rawToolId?.includes('/') ? rawToolId.slice(rawToolId.lastIndexOf('/') + 1) : rawToolId
        const at = Date.parse(string(message.timestamp) ?? state.createdAt)
        const inWorkflow = windows.some(window => at >= window.from && at <= window.to)
        const scopedToolId = `${message.parentToolUseId ?? ''}/${toolId}`
        if (!inWorkflow && !(type === 'tool_result' && permittedTools.has(scopedToolId))) continue
        if (type === 'tool_use') permittedTools.add(scopedToolId)
        const event = messageEvent(type === 'tool_use'
          ? { type: 'tool_use_complete', toolUseId: toolId, toolName: content.name, input: content.input, parentToolUseId: message.parentToolUseId }
          : { type: 'tool_result', toolUseId: toolId, content: content.content, isError: content.is_error, parentToolUseId: message.parentToolUseId }, string(message.timestamp) ?? state.createdAt)
        if (event) history.push({ ...event, source: 'history' })
      }
    }
    const byId = new Map<string, WorkflowTimelineEvent>()
    for (const event of [...history, ...stored.events]) {
      const previous = byId.get(event.id)
      byId.set(event.id, { ...previous, ...event, at: previous?.at ?? event.at, detail: event.detail ?? previous?.detail })
    }
    for (const event of byId.values()) {
      if (event.kind !== 'tool-result') continue
      const scopedId = `${event.parentToolUseId ? event.parentToolUseId + '/' : ''}${event.toolUseId}`
      const start = byId.get(`tool:${scopedId}:start`)
      if (start) {
        event.toolName = start.toolName
        event.phaseId = start.phaseId
        event.runId = start.runId
      }
    }
    const events = [...byId.values()].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    const recordedIds = new Set(stored.events.map(event => event.id))
    const hasReconstructedHistory = history.some(event => !recordedIds.has(event.id))
    const beforeIndex = options.before ? events.findIndex(event => event.id === options.before) : events.length
    const end = beforeIndex < 0 ? 0 : beforeIndex
    const limit = Math.max(1, Math.min(options.limit ?? 100, 200))
    return {
      events: events.slice(Math.max(0, end - limit), end), hasMore: end > limit,
      historySource: hasReconstructedHistory ? stored.events.length ? 'mixed' : 'reconstructed' : 'recorded',
      warnings: [...stored.warnings, ...(this.failures.has(file) ? ['日志写入失败，部分实时事件可能缺失。'] : [])],
      updatedAt: new Date().toISOString(),
    }
  }
}

export const workflowTimelineService = new WorkflowTimelineService()
