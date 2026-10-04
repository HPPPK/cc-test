export type AgentRunRuntimeEventType = 'tool_started' | 'tool_completed' | 'tool_failed' | 'skill_invoked' | 'artifact_recorded'
export type AgentRunRuntimeStatus = 'running' | 'waiting_user' | 'blocked' | 'failed' | 'completed'
export type AgentRunRuntimeArtifactKind = 'image' | 'screenshot' | 'report' | 'html' | 'file' | 'other'

export type AgentRunRuntimeEvent = {
  runId: string
  eventType: AgentRunRuntimeEventType
  toolUseId?: string
  toolName?: string
  skillId?: string
  durationMs?: number
  errorCode?: string
  status?: AgentRunRuntimeStatus
  artifact?: { kind: AgentRunRuntimeArtifactKind; path: string; sourceTool?: string }
}

type RuntimeEnvironment = Record<string, string | undefined>
type RuntimeFetch = typeof fetch
const ARTIFACT_FIELDS = ['imagePath', 'screenshotPath', 'promptPath', 'reportPath', 'outputPath', 'artifactPath', 'filePath'] as const
const MAX_ARTIFACTS_PER_RESULT = 12

export function getAgentRunLedgerRuntimeConfig(environment: RuntimeEnvironment = process.env): { serverUrl: string; sessionId: string } | null {
  if ((environment.CC_JIANGXIA_AGENT_RUN_LEDGER_ENABLED ?? environment.CC_HAHA_AGENT_RUN_LEDGER_ENABLED ?? '').trim() !== '1') return null
  const serverUrl = (environment.CC_JIANGXIA_DESKTOP_SERVER_URL ?? environment.CC_HAHA_DESKTOP_SERVER_URL ?? '').trim()
  const sessionId = (environment.CC_JIANGXIA_SESSION_ID ?? environment.CC_HAHA_SESSION_ID ?? environment.CC_JIANGXIA_EXPERT_SESSION_ID ?? environment.CC_HAHA_EXPERT_SESSION_ID ?? '').trim()
  if (!serverUrl || !sessionId) return null
  try {
    const url = new URL(serverUrl)
    return url.protocol === 'http:' || url.protocol === 'https:' ? { serverUrl: url.toString(), sessionId } : null
  } catch { return null }
}

export function resolveAgentRunId(input: { chainId?: string; requestId?: string; toolUseId?: string }): string | null {
  const candidate = input.chainId ?? input.requestId ?? input.toolUseId
  return candidate && /^[A-Za-z0-9._:-]{1,160}$/.test(candidate) ? candidate : null
}

function classifyArtifact(artifactPath: string, field: string): AgentRunRuntimeArtifactKind {
  if (field === 'screenshotPath') return 'screenshot'
  const extension = artifactPath.split('?')[0].split('.').pop()?.toLowerCase()
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif'].includes(extension ?? '')) return 'image'
  if (extension === 'html' || extension === 'htm') return 'html'
  if (extension === 'md' || extension === 'pdf' || extension === 'docx' || extension === 'xlsx' || extension === 'pptx') return 'report'
  if (extension === 'json' || extension === 'txt' || extension === 'csv') return 'file'
  return 'other'
}
function safePath(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized && normalized.length <= 1_024 ? normalized : null
}

/** Reads only named output fields; it never recursively harvests arbitrary text. */
export function extractAgentRunArtifacts(data: unknown): Array<{ kind: AgentRunRuntimeArtifactKind; path: string }> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return []
  const record = data as Record<string, unknown>
  const candidates: Array<{ field: string; value: unknown }> = ARTIFACT_FIELDS.map((field) => ({ field, value: record[field] }))
  if (Array.isArray(record.steps)) for (const step of record.steps.slice(0, MAX_ARTIFACTS_PER_RESULT)) {
    if (step && typeof step === 'object' && !Array.isArray(step)) candidates.push({ field: 'screenshotPath', value: (step as Record<string, unknown>).screenshotPath })
  }
  const artifacts: Array<{ kind: AgentRunRuntimeArtifactKind; path: string }> = []
  for (const candidate of candidates) {
    const artifactPath = safePath(candidate.value)
    if (!artifactPath) continue
    const artifact = { kind: classifyArtifact(artifactPath, candidate.field), path: artifactPath }
    if (!artifacts.some((current) => current.kind === artifact.kind && current.path === artifact.path)) artifacts.push(artifact)
    if (artifacts.length >= MAX_ARTIFACTS_PER_RESULT) break
  }
  return artifacts
}

/** Best-effort: a receipt outage must never make the tool itself fail. */
export async function recordAgentRunEvent(event: AgentRunRuntimeEvent, options: { environment?: RuntimeEnvironment; fetchImpl?: RuntimeFetch; timeoutMs?: number } = {}): Promise<boolean> {
  const config = getAgentRunLedgerRuntimeConfig(options.environment)
  if (!config || !resolveAgentRunId({ chainId: event.runId })) return false
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') return false
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.max(100, Math.min(options.timeoutMs ?? 1_000, 5_000)))
  timeout.unref?.()
  try {
    const response = await fetchImpl(new URL('/api/agent-runs/events', config.serverUrl).toString(), {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...event, sessionId: config.sessionId }), signal: controller.signal,
    })
    return response.ok
  } catch { return false } finally { clearTimeout(timeout) }
}
