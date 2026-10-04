import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { getAppStoragePath } from '../../utils/appIdentity.js'

export type AgentRunStatus = 'running' | 'waiting_user' | 'blocked' | 'failed' | 'completed'
export type AgentRunEventType = 'run_started' | 'tool_started' | 'tool_completed' | 'tool_failed' | 'skill_invoked' | 'artifact_recorded' | 'status_changed'
export type AgentRunArtifactKind = 'image' | 'screenshot' | 'report' | 'html' | 'file' | 'other'

export type AgentRunArtifact = {
  id: string
  kind: AgentRunArtifactKind
  path: string
  sourceTool?: string
  recordedAt: string
}

export type AgentRunEvent = {
  id: string
  type: AgentRunEventType
  recordedAt: string
  toolUseId?: string
  toolName?: string
  skillId?: string
  durationMs?: number
  errorCode?: string
  status?: AgentRunStatus
  artifact?: AgentRunArtifact
  /** Internal duplicate-delivery guard; omitted from API reads. */
  idempotencyKey?: string
}

export type AgentRunLedger = {
  schemaVersion: 1
  runId: string
  sessionId: string
  status: AgentRunStatus
  startedAt: string
  updatedAt: string
  events: AgentRunEvent[]
  artifacts: AgentRunArtifact[]
}

export type AgentRunEventInput = {
  sessionId: string
  runId: string
  eventType: Exclude<AgentRunEventType, 'run_started'>
  toolUseId?: string
  toolName?: string
  skillId?: string
  durationMs?: number
  errorCode?: string
  status?: AgentRunStatus
  artifact?: { kind: AgentRunArtifactKind; path: string; sourceTool?: string }
}

export type AgentRunSummary = Pick<AgentRunLedger, 'runId' | 'sessionId' | 'status' | 'startedAt' | 'updatedAt'> & {
  eventCount: number
  artifactCount: number
}

type StoredLedger = AgentRunLedger & Record<string, unknown>
type Options = { configDir?: string; now?: () => Date }

const MAX_EVENTS = 400
const MAX_ARTIFACTS = 40
const MAX_ID_LENGTH = 160
const MAX_TEXT_LENGTH = 512
const MAX_ARTIFACT_PATH_LENGTH = 1_024
const STATUSES = new Set<AgentRunStatus>(['running', 'waiting_user', 'blocked', 'failed', 'completed'])
const EVENT_TYPES = new Set<AgentRunEventType>(['run_started', 'tool_started', 'tool_completed', 'tool_failed', 'skill_invoked', 'artifact_recorded', 'status_changed'])
const ARTIFACT_KINDS = new Set<AgentRunArtifactKind>(['image', 'screenshot', 'report', 'html', 'file', 'other'])

function safeId(value: string, label: string): string {
  const normalized = value.trim()
  if (!normalized || normalized.length > MAX_ID_LENGTH || !/^[A-Za-z0-9._:-]+$/.test(normalized)) throw new Error(`Invalid Agent Run ${label}.`)
  return normalized
}

function safeText(value: string | undefined, limit = MAX_TEXT_LENGTH): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized ? normalized.slice(0, limit) : undefined
}

function safeDuration(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.min(Math.round(value), 86_400_000) : undefined
}

function defaultStatus(eventType: AgentRunEventType): AgentRunStatus | undefined {
  if (eventType === 'run_started' || eventType === 'tool_started') return 'running'
  if (eventType === 'tool_failed') return 'failed'
  return undefined
}

function idempotencyKey(input: AgentRunEventInput): string | undefined {
  if (!input.toolUseId) return undefined
  return [input.toolUseId, input.eventType, input.skillId ?? '', input.artifact?.path ?? ''].join(':')
}

/** Durable, app-wide receipts that never store prompts, inputs, outputs or secrets. */
export class AgentRunLedgerService {
  private static writeLocks = new Map<string, Promise<unknown>>()
  private readonly configDir: string
  private readonly now: () => Date

  constructor(options: Options = {}) {
    this.configDir = options.configDir ?? process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude')
    this.now = options.now ?? (() => new Date())
  }

  getStorageDir(): string {
    return getAppStoragePath(this.configDir, 'agent-runs')
  }

  getRunPath(sessionId: string, runId: string): string {
    return path.join(this.getStorageDir(), safeId(sessionId, 'session id'), safeId(runId, 'run id') + '.json')
  }

  async appendEvent(input: AgentRunEventInput): Promise<AgentRunLedger> {
    const sessionId = safeId(input.sessionId, 'session id')
    const runId = safeId(input.runId, 'run id')
    if (!EVENT_TYPES.has(input.eventType)) throw new Error('Invalid Agent Run event type.')
    if (input.status && !STATUSES.has(input.status)) throw new Error('Invalid Agent Run status.')
    if (input.artifact && !ARTIFACT_KINDS.has(input.artifact.kind)) throw new Error('Invalid Agent Run artifact kind.')

    const filePath = this.getRunPath(sessionId, runId)
    return this.withWriteLock(filePath, async () => {
      const now = this.now().toISOString()
      const ledger: StoredLedger = await this.readStoredRun(filePath) ?? {
        schemaVersion: 1,
        runId,
        sessionId,
        status: 'running',
        startedAt: now,
        updatedAt: now,
        events: [{ id: crypto.randomUUID(), type: 'run_started', recordedAt: now, status: 'running' }],
        artifacts: [],
      }
      const dedupeKey = idempotencyKey(input)
      if (dedupeKey && ledger.events.some((event) => event.idempotencyKey === dedupeKey)) return this.publicLedger(ledger)

      const artifact = input.artifact ? this.createArtifact(input.artifact, now) : undefined
      const status = input.status ?? defaultStatus(input.eventType)
      const event: AgentRunEvent = {
        id: crypto.randomUUID(),
        type: input.eventType,
        recordedAt: now,
        ...(safeText(input.toolUseId, MAX_ID_LENGTH) ? { toolUseId: safeText(input.toolUseId, MAX_ID_LENGTH) } : {}),
        ...(safeText(input.toolName) ? { toolName: safeText(input.toolName) } : {}),
        ...(safeText(input.skillId, MAX_ID_LENGTH) ? { skillId: safeText(input.skillId, MAX_ID_LENGTH) } : {}),
        ...(safeDuration(input.durationMs) !== undefined ? { durationMs: safeDuration(input.durationMs) } : {}),
        ...(safeText(input.errorCode, 128) ? { errorCode: safeText(input.errorCode, 128) } : {}),
        ...(status ? { status } : {}),
        ...(artifact ? { artifact } : {}),
        ...(dedupeKey ? { idempotencyKey: dedupeKey } : {}),
      }
      ledger.events = [...ledger.events, event].slice(-MAX_EVENTS)
      if (artifact) {
        ledger.artifacts = [...ledger.artifacts, artifact]
          .filter((candidate, index, all) => all.findIndex((other) => other.path === candidate.path && other.kind === candidate.kind) === index)
          .slice(-MAX_ARTIFACTS)
      }
      ledger.status = status ?? ledger.status
      ledger.updatedAt = now
      await this.writeStoredRun(filePath, ledger)
      return this.publicLedger(ledger)
    })
  }

  async getRun(sessionId: string, runId: string): Promise<AgentRunLedger | null> {
    const ledger = await this.readStoredRun(this.getRunPath(sessionId, runId))
    return ledger ? this.publicLedger(ledger) : null
  }

  async listRuns(sessionId: string, limit = 20): Promise<AgentRunSummary[]> {
    const directory = path.join(this.getStorageDir(), safeId(sessionId, 'session id'))
    const max = Math.max(1, Math.min(Math.floor(limit) || 20, 100))
    let entries: Array<{ name: string; isFile(): boolean }>
    try {
      entries = await fs.readdir(directory, { withFileTypes: true })
    } catch (error: any) {
      if (error?.code === 'ENOENT') return []
      throw error
    }
    const ledgers = await Promise.all(entries.filter((entry) => entry.isFile() && entry.name.endsWith('.json')).map((entry) => this.readStoredRun(path.join(directory, entry.name))))
    return ledgers
      .filter((ledger): ledger is StoredLedger => ledger !== null)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, max)
      .map((ledger) => ({ runId: ledger.runId, sessionId: ledger.sessionId, status: ledger.status, startedAt: ledger.startedAt, updatedAt: ledger.updatedAt, eventCount: ledger.events.length, artifactCount: ledger.artifacts.length }))
  }

  private async withWriteLock<T>(key: string, work: () => Promise<T>): Promise<T> {
    const previous = AgentRunLedgerService.writeLocks.get(key) ?? Promise.resolve()
    const next = previous.catch(() => undefined).then(work)
    AgentRunLedgerService.writeLocks.set(key, next)
    try {
      return await next
    } finally {
      if (AgentRunLedgerService.writeLocks.get(key) === next) AgentRunLedgerService.writeLocks.delete(key)
    }
  }

  private createArtifact(input: NonNullable<AgentRunEventInput['artifact']>, recordedAt: string): AgentRunArtifact {
    const artifactPath = safeText(input.path, MAX_ARTIFACT_PATH_LENGTH)
    if (!artifactPath) throw new Error('Invalid Agent Run artifact path.')
    return {
      id: crypto.randomUUID(),
      kind: input.kind,
      path: artifactPath,
      ...(safeText(input.sourceTool) ? { sourceTool: safeText(input.sourceTool) } : {}),
      recordedAt,
    }
  }

  private async readStoredRun(filePath: string): Promise<StoredLedger | null> {
    try {
      const parsed: unknown = JSON.parse(await fs.readFile(filePath, 'utf-8'))
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
      const ledger = parsed as Partial<StoredLedger>
      if (ledger.schemaVersion !== 1 || typeof ledger.sessionId !== 'string' || typeof ledger.runId !== 'string' || !STATUSES.has(ledger.status as AgentRunStatus) || !Array.isArray(ledger.events) || !Array.isArray(ledger.artifacts) || typeof ledger.startedAt !== 'string' || typeof ledger.updatedAt !== 'string') return null
      return ledger as StoredLedger
    } catch (error: any) {
      if (error?.code === 'ENOENT') return null
      throw error
    }
  }

  private async writeStoredRun(filePath: string, ledger: StoredLedger): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 })
    const temporaryPath = filePath + '.tmp.' + crypto.randomUUID()
    try {
      await fs.writeFile(temporaryPath, JSON.stringify(ledger, null, 2) + '\n', { encoding: 'utf-8', mode: 0o600 })
      await fs.rename(temporaryPath, filePath)
      await fs.chmod(filePath, 0o600).catch(() => undefined)
    } finally {
      await fs.rm(temporaryPath, { force: true }).catch(() => undefined)
    }
  }

  private publicLedger(ledger: StoredLedger): AgentRunLedger {
    return {
      schemaVersion: 1,
      runId: ledger.runId,
      sessionId: ledger.sessionId,
      status: ledger.status,
      startedAt: ledger.startedAt,
      updatedAt: ledger.updatedAt,
      events: ledger.events.map(({ idempotencyKey: _private, ...event }) => event),
      artifacts: ledger.artifacts.map((artifact) => ({ ...artifact })),
    }
  }
}

export const agentRunLedgerService = new AgentRunLedgerService()
