import { api } from './client'

export type WorkflowTimelineEvent = {
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

export function getWorkflowTimeline(sessionId: string, before?: string) {
  const query = new URLSearchParams({ limit: '100' })
  if (before) query.set('before', before)
  return api.get<WorkflowTimelinePage>(`/api/sessions/${encodeURIComponent(sessionId)}/workflow/timeline?${query}`, { timeout: 15_000 })
}
