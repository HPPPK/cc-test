/**
 * TeamWatcher -- monitors ~/.claude/teams/ for changes and pushes
 * real-time updates to all connected WebSocket clients.
 *
 * Uses polling (setInterval) rather than fs.watch for cross-platform reliability.
 * Detects three kinds of events:
 *   - team_created  : a new team directory with config.json appears
 *   - team_update   : an existing team's config.json content changes
 *   - team_deleted  : a previously-seen team directory disappears
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { sendToSession, getActiveSessionIds } from '../ws/handler.js'
import type { ServerMessage, TeamMemberStatus } from '../ws/events.js'

// ─── Helpers ──────────────────────────────────────────────────────────────

function getTeamsDir(): string {
  const configDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
  return path.join(configDir, 'teams')
}

function toMailboxName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '-')
}

function addNameVariants(names: Set<string>, name: unknown): void {
  if (typeof name !== 'string') return
  names.add(name)
  names.add(toMailboxName(name))
}

function resolveMemberRuntime(member: Record<string, unknown>): {
  providerId?: string | null
  modelId?: string
  runtime?: {
    providerId?: string | null
    modelId: string
  }
} {
  const rawRuntime = member.runtime
  const runtime =
    rawRuntime &&
    typeof rawRuntime === 'object' &&
    typeof (rawRuntime as Record<string, unknown>).modelId === 'string'
      ? {
          ...(((rawRuntime as Record<string, unknown>).providerId !== undefined)
            ? {
                providerId: (rawRuntime as Record<string, unknown>)
                  .providerId as string | null,
              }
            : {}),
          modelId: (rawRuntime as Record<string, unknown>).modelId as string,
        }
      : undefined
  const providerId =
    member.providerId !== undefined
      ? (member.providerId as string | null)
      : runtime?.providerId
  const modelId =
    typeof member.modelId === 'string'
      ? (member.modelId as string)
      : runtime?.modelId ?? (member.model as string | undefined)

  return {
    ...(providerId !== undefined ? { providerId } : {}),
    ...(modelId ? { modelId } : {}),
    ...(runtime ? { runtime } : {}),
  }
}

type TokenMetrics = {
  inputTokens: number
  outputTokens: number
}

// ─── TeamWatcher ──────────────────────────────────────────────────────────

export class TeamWatcher {
  private intervalId: ReturnType<typeof setInterval> | null = null
  private lastSnapshots = new Map<string, string>() // teamName -> raw JSON content

  /** Start polling for team changes. */
  start(intervalMs = 3000): void {
    if (this.intervalId) return // already running
    // Run an initial check immediately, then start the interval
    this.check()
    this.intervalId = setInterval(() => this.check(), intervalMs)
  }

  /** Stop polling. */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  /** Visible for testing -- force a single poll cycle. */
  checkNow(): void {
    this.check()
  }

  /** Clear internal snapshot state (useful in tests). */
  reset(): void {
    this.lastSnapshots.clear()
  }

  // ── Core polling logic ─────────────────────────────────────────────────

  private check(): void {
    const teamsDir = getTeamsDir()

    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(teamsDir, { withFileTypes: true })
    } catch {
      // teams directory doesn't exist yet -- nothing to watch
      // If we previously knew about teams, they are now all "deleted"
      for (const [name] of this.lastSnapshots) {
        this.broadcast({ type: 'team_deleted', teamName: name })
      }
      this.lastSnapshots.clear()
      return
    }

    const currentTeamNames = new Set<string>()

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const teamName = entry.name
      currentTeamNames.add(teamName)

      const configPath = path.join(teamsDir, teamName, 'config.json')
      let content: string
      try {
        content = fs.readFileSync(configPath, 'utf-8')
      } catch {
        // config.json not readable (missing / permissions) -- skip
        continue
      }

      const snapshot = this.buildTeamSnapshot(content)

      const lastContent = this.lastSnapshots.get(teamName)

      if (lastContent === undefined) {
        // New team detected
        this.lastSnapshots.set(teamName, snapshot)
        this.broadcast({ type: 'team_created', teamName })
      } else if (snapshot !== lastContent) {
        // Team config changed -- extract member statuses and broadcast
        this.lastSnapshots.set(teamName, snapshot)
        try {
          const config = JSON.parse(content)
          const members = this.extractMemberStatuses(config)
          // Merge inbox-discovered members that are missing from config
          const inboxMembers = this.discoverInboxMembers(teamsDir, teamName, config)
          const subagentMembers = this.discoverSubagentMembers(teamsDir, config)
          const allMembers = [...members, ...inboxMembers, ...subagentMembers]
          this.broadcast({ type: 'team_update', teamName, members: allMembers })
        } catch {
          // JSON parse failed (likely truncated write) — try to recover partial members
          const recovered = this.recoverPartialMembers(content)
          if (recovered.length > 0) {
            this.broadcast({ type: 'team_update', teamName, members: recovered })
          }
          // If nothing recoverable, skip broadcast entirely — don't send empty members
        }
      }
      // else: content unchanged, nothing to do
    }

    // Check for deleted teams (were in lastSnapshots but no longer on disk)
    for (const [name] of this.lastSnapshots) {
      if (!currentTeamNames.has(name)) {
        this.lastSnapshots.delete(name)
        this.broadcast({ type: 'team_deleted', teamName: name })
      }
    }
  }

  // ── Member status extraction ───────────────────────────────────────────

  private buildTeamSnapshot(content: string): string {
    try {
      const config = JSON.parse(content) as Record<string, unknown>
      const metrics = this.extractMemberStatuses(config).map((member) => ({
        agentId: member.agentId,
        model: member.model ?? null,
        providerId: member.providerId ?? null,
        modelId: member.modelId ?? null,
        runtime: member.runtime ?? null,
        inputTokens: member.inputTokens ?? null,
        outputTokens: member.outputTokens ?? null,
      }))
      return JSON.stringify({ content, metrics })
    } catch {
      return JSON.stringify({ content, metrics: [] })
    }
  }

  /**
   * Parse the TeamFile config and derive a TeamMemberStatus for each member.
   *
   * The raw config has:
   *   members: [{ agentId, name, agentType, isActive, sessionId, joinedAt, inputTokens, outputTokens, ... }]
   *
   * We map `isActive` to the status enum and use `agentType` / `name` as role.
   */
  extractMemberStatuses(config: Record<string, unknown>): TeamMemberStatus[] {
    const members = config.members
    if (!Array.isArray(members)) return []

    return members.map((m: Record<string, unknown>) => {
      const status = this.deriveStatus(m.isActive as boolean | undefined)

      // Extract joinedAt - convert number timestamp to ISO string if needed
      let joinedAt: string | undefined
      if (typeof m.joinedAt === 'number') {
        joinedAt = new Date(m.joinedAt as number).toISOString()
      } else if (typeof m.joinedAt === 'string') {
        joinedAt = m.joinedAt as string
      }

      const transcriptMetrics = this.getMemberTokenMetrics(config, m)
      const runtime = resolveMemberRuntime(m)

      return {
        agentId: (m.agentId as string) || '',
        role: (m.name as string) || (m.agentType as string) || 'member',
        status,
        currentTask: (m.currentTask as string) || undefined,
        model: (m.model as string) || undefined,
        ...runtime,
        joinedAt,
        inputTokens: typeof m.inputTokens === 'number'
          ? (m.inputTokens as number)
          : transcriptMetrics?.inputTokens,
        outputTokens: typeof m.outputTokens === 'number'
          ? (m.outputTokens as number)
          : transcriptMetrics?.outputTokens,
      }
    })
  }

  private deriveStatus(isActive: boolean | undefined): TeamMemberStatus['status'] {
    if (isActive === false) return 'idle'
    // isActive === true or undefined => running
    return 'running'
  }

  /**
   * Discover members from inboxes/ that aren't in config.json.
   * Fixes the race condition where concurrent writes to config.json lose members.
   */
  private discoverInboxMembers(
    teamsDir: string,
    teamName: string,
    config: Record<string, unknown>,
  ): TeamMemberStatus[] {
    const inboxDir = path.join(teamsDir, teamName, 'inboxes')
    const configMembers = Array.isArray(config.members) ? config.members : []
    const configNames = new Set<string>()
    for (const member of configMembers) {
      addNameVariants(configNames, (member as Record<string, unknown>).name)
    }

    try {
      const files = fs.readdirSync(inboxDir)
      const extra: TeamMemberStatus[] = []

      for (const file of files) {
        if (!file.endsWith('.json')) continue
        const name = file.replace(/\.json$/, '')
        if (
          name === 'team-lead' ||
          configNames.has(name) ||
          this.hasShutdownRequest(path.join(inboxDir, file))
        ) continue

        extra.push({
          agentId: `${name}@${teamName}`,
          role: name,
          status: 'running', // assume running — they have an inbox
        })
      }

      return extra
    } catch {
      return []
    }
  }

  private discoverSubagentMembers(
    teamsDir: string,
    config: Record<string, unknown>,
  ): TeamMemberStatus[] {
    const leadSessionId =
      typeof config.leadSessionId === 'string' ? config.leadSessionId : null
    const teamName = typeof config.name === 'string' ? config.name : 'team'
    if (!leadSessionId) return []

    const configMembers = Array.isArray(config.members) ? config.members : []
    const configNames = new Set<string>()
    for (const member of configMembers) {
      addNameVariants(configNames, (member as Record<string, unknown>).name)
    }
    const projectsDir = path.join(path.dirname(teamsDir), 'projects')

    try {
      const projectEntries = fs.readdirSync(projectsDir, { withFileTypes: true })
      const extra = new Map<string, TeamMemberStatus>()

      for (const entry of projectEntries) {
        if (!entry.isDirectory()) continue
        const subagentsDir = path.join(
          projectsDir,
          entry.name,
          leadSessionId,
          'subagents',
        )

        let files: string[]
        try {
          files = fs.readdirSync(subagentsDir)
        } catch {
          continue
        }

        for (const file of files) {
          if (!file.endsWith('.jsonl')) continue
          const inferredName = this.extractSubagentName(
            path.join(subagentsDir, file),
          )
          if (
            inferredName &&
            inferredName !== 'team-lead' &&
            !configNames.has(inferredName) &&
            !this.hasShutdownRequest(
              path.join(teamsDir, teamName, 'inboxes', `${toMailboxName(inferredName)}.json`),
            ) &&
            !extra.has(inferredName)
          ) {
            extra.set(inferredName, {
              agentId: `${inferredName}@${teamName}`,
              role: inferredName,
              status: 'running',
            })
          }
        }
      }

      return [...extra.values()]
    } catch {
      return []
    }
  }

  /**
   * Attempt to recover member data from truncated/corrupted JSON.
   * Extracts agentId values via regex and constructs minimal member statuses.
   */
  private recoverPartialMembers(rawContent: string): TeamMemberStatus[] {
    const members: TeamMemberStatus[] = []
    // Match complete member-like objects: find "agentId":"..." patterns
    const agentIdRegex = /"agentId"\s*:\s*"([^"]+)"/g
    const nameRegex = /"(?:agentType|name)"\s*:\s*"([^"]+)"/g
    const isActiveRegex = /"isActive"\s*:\s*(true|false)/g

    const agentIds: string[] = []
    const names: string[] = []
    const activeStates: (boolean | undefined)[] = []

    let match: RegExpExecArray | null
    while ((match = agentIdRegex.exec(rawContent)) !== null) {
      agentIds.push(match[1]!)
    }
    while ((match = nameRegex.exec(rawContent)) !== null) {
      names.push(match[1]!)
    }
    while ((match = isActiveRegex.exec(rawContent)) !== null) {
      activeStates.push(match[1] === 'true')
    }

    for (let i = 0; i < agentIds.length; i++) {
      members.push({
        agentId: agentIds[i]!,
        role: names[i] || 'member',
        status: this.deriveStatus(activeStates[i]),
      })
    }

    return members
  }

  private hasShutdownRequest(inboxPath: string): boolean {
    try {
      const raw = fs.readFileSync(inboxPath, 'utf-8')
      const messages = JSON.parse(raw) as Array<{ text?: unknown }>
      return messages.some((message) => {
        if (typeof message.text !== 'string') return false
        try {
          const parsed = JSON.parse(message.text) as { type?: unknown }
          return parsed.type === 'shutdown_request'
        } catch {
          return message.text.includes('"type":"shutdown_request"')
        }
      })
    } catch {
      return false
    }
  }

  private getMemberTokenMetrics(
    config: Record<string, unknown>,
    member: Record<string, unknown>,
  ): TokenMetrics | null {
    let transcriptPath: string | null = null
    if (typeof member.sessionId === 'string') {
      transcriptPath = this.findTranscriptFile(member.sessionId)
    }

    if (!transcriptPath && typeof config.leadSessionId === 'string' && typeof member.name === 'string') {
      transcriptPath = this.findSubagentTranscript(config.leadSessionId, member.name)
    }

    if (!transcriptPath) return null
    return this.parseTranscriptTokenMetrics(transcriptPath)
  }

  private findTranscriptFile(sessionId: string): string | null {
    const projectsDir = path.join(path.dirname(getTeamsDir()), 'projects')

    try {
      const entries = fs.readdirSync(projectsDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const candidate = path.join(projectsDir, entry.name, `${sessionId}.jsonl`)
        if (fs.existsSync(candidate)) return candidate
      }
    } catch {
      return null
    }

    return null
  }

  private findSubagentTranscript(
    leadSessionId: string,
    memberName: string,
  ): string | null {
    const projectsDir = path.join(path.dirname(getTeamsDir()), 'projects')

    try {
      const projectEntries = fs.readdirSync(projectsDir, { withFileTypes: true })
      let bestMatch: { path: string; mtime: number } | null = null

      for (const projEntry of projectEntries) {
        if (!projEntry.isDirectory()) continue
        const subagentsDir = path.join(
          projectsDir,
          projEntry.name,
          leadSessionId,
          'subagents',
        )

        let files: string[]
        try {
          files = fs.readdirSync(subagentsDir)
        } catch {
          continue
        }

        for (const file of files) {
          if (!file.endsWith('.jsonl')) continue
          const filePath = path.join(subagentsDir, file)
          const inferredName = this.extractSubagentName(filePath)
          if (inferredName !== memberName) continue

          const stat = fs.statSync(filePath)
          if (!bestMatch || stat.mtimeMs > bestMatch.mtime) {
            bestMatch = { path: filePath, mtime: stat.mtimeMs }
          }
        }
      }

      return bestMatch?.path ?? null
    } catch {
      return null
    }
  }

  private parseTranscriptTokenMetrics(filePath: string): TokenMetrics | null {
    let raw: string
    try {
      raw = fs.readFileSync(filePath, 'utf-8')
    } catch {
      return null
    }

    let inputTokens = 0
    let outputTokens = 0
    const lines = raw.split('\n').filter((line) => line.trim().length > 0)

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as Record<string, unknown>
        const message = entry.message
        const usage = message && typeof message === 'object'
          ? (message as Record<string, unknown>).usage
          : entry.usage
        if (!usage || typeof usage !== 'object') continue

        const record = usage as Record<string, unknown>
        inputTokens += this.numberField(record.input_tokens)
        inputTokens += this.numberField(record.cache_read_input_tokens)
        inputTokens += this.numberField(record.cache_creation_input_tokens)
        inputTokens += this.numberField(record.cache_read_tokens)
        inputTokens += this.numberField(record.cache_creation_tokens)
        outputTokens += this.numberField(record.output_tokens)
      } catch {
        // Skip malformed transcript lines.
      }
    }

    return inputTokens > 0 || outputTokens > 0
      ? { inputTokens, outputTokens }
      : null
  }

  private numberField(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0
  }

  private extractSubagentName(filePath: string): string | null {
    try {
      const head = fs.readFileSync(filePath, 'utf-8').slice(0, 8192)
      const lines = head.split('\n').filter((line) => line.trim().length > 0)

      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as Record<string, unknown>
          if (typeof entry.agentName === 'string' && entry.agentName.trim()) {
            return entry.agentName
          }
          if (typeof entry.agentId === 'string' && entry.agentId.includes('@')) {
            return entry.agentId.split('@')[0] ?? null
          }
        } catch {
          // Ignore malformed preview lines.
        }
      }

      const match =
        head.match(/"agentName"\s*:\s*"([^"]+)"/) ||
        head.match(/"name"\s*:\s*"([^"]+)"/) ||
        head.match(/\*\*([a-zA-Z0-9_-]+)\*\*/)

      return match?.[1] ?? null
    } catch {
      return null
    }
  }

  // ── Broadcasting ───────────────────────────────────────────────────────

  private broadcast(message: ServerMessage): void {
    const sessionIds = getActiveSessionIds()
    for (const id of sessionIds) {
      sendToSession(id, message)
    }
  }
}

export const teamWatcher = new TeamWatcher()
