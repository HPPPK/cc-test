/**
 * TeamService — 读取 CLI 生成的 Agent Teams 配置
 *
 * Team 配置存储在 ~/.claude/teams/{name}/config.json
 * 成员 transcript 存储为 JSONL 文件:
 *   - 有 sessionId 的成员: ~/.claude/projects/{project}/{sessionId}.jsonl
 *   - in-process 成员 (无 sessionId): ~/.claude/projects/{project}/{leadSessionId}/subagents/agent-*.jsonl
 * 成员发现: config.json + inboxes/ 目录 (解决并发写入丢失成员的问题)
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { ApiError } from '../middleware/errorHandler.js'
import { writeToMailbox, sendShutdownRequestToMailbox } from '../../utils/teammateMailbox.js'

// ─── Types ─────────────────────────────────────────────────────────────────

/** Check if a member name is valid (not a CLI flag, API method, or empty string) */
function isValidMemberName(name: string): boolean {
  if (!name || name.trim() === '') return false
  // Filter out CLI flags like `--`, `-h`, `--help`, etc.
  if (name.startsWith('-')) return false
  // Filter out API method names and CLI tokens that might be mistakenly used as member names
  const invalidNames = new Set([
    'null', 'undefined',
    // API methods
    'SendMessage', 'TeamCreate', 'TeamDelete', 'TeamUpdate', 'TeamList',
    // CLI tokens
    'Agent', 'Team', 'Create', 'Delete', 'Update', 'List', 'Get', 'Set',
    // Common commands
    'help', 'version', 'init', 'start', 'stop', 'run', 'build', 'test'
  ])
  if (invalidNames.has(name)) return false
  return true
}

function toMailboxName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '-')
}

function addNameVariants(names: Set<string>, name: string): void {
  names.add(name)
  names.add(toMailboxName(name))
}
export type TeamMember = {
  agentId: string
  name: string
  agentType?: string
  model?: string
  color?: string
  backendType?: string
  status: 'running' | 'completed' | 'idle' | 'failed'
  joinedAt: number
  cwd: string
  sessionId?: string
  /** Cumulative input token count */
  inputTokens?: number
  /** Cumulative output token count */
  outputTokens?: number
}

export type TeamSummary = {
  name: string
  description?: string
  createdAt: number
  memberCount: number
  activeMemberCount: number
}

export type TeamDetail = TeamSummary & {
  leadAgentId: string
  leadSessionId?: string
  members: TeamMember[]
}

export type TranscriptMessage = {
  id: string
  type: 'user' | 'assistant' | 'system' | 'tool_use' | 'tool_result'
  content: unknown
  timestamp: string
  model?: string
  parentToolUseId?: string
}

/** Raw config.json structure written by CLI */
type TeamFileRaw = {
  name: string
  description?: string
  createdAt: number
  leadAgentId: string
  leadSessionId?: string
  members: Array<{
    agentId: string
    name: string
    agentType?: string
    model?: string
    prompt?: string
    color?: string
    joinedAt: number
    tmuxPaneId: string
    cwd: string
    worktreePath?: string
    sessionId?: string
    backendType?: string
    isActive?: boolean
    mode?: string
    inputTokens?: number
    outputTokens?: number
  }>
}

type TokenMetrics = {
  inputTokens: number
  outputTokens: number
}

// ─── Service ───────────────────────────────────────────────────────────────

export class TeamService {
  private getConfigDir(): string {
    return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
  }

  private getTeamsDir(): string {
    return path.join(this.getConfigDir(), 'teams')
  }

  private getProjectsDir(): string {
    return path.join(this.getConfigDir(), 'projects')
  }

  // ── List all teams ──────────────────────────────────────────────────────

  async listTeams(): Promise<TeamSummary[]> {
    const teamsDir = this.getTeamsDir()

    try {
      await fs.access(teamsDir)
    } catch {
      return []
    }

    const entries = await fs.readdir(teamsDir, { withFileTypes: true })
    const teams: TeamSummary[] = []

    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      try {
        const config = await this.loadTeamConfig(entry.name)
        // Include inbox-discovered members in the count
        const inboxNames = await this.discoverInboxMembers(entry.name)
        let extraCount = 0
        for (const inboxName of inboxNames) {
          if (
            !this.isConfigMemberName(config, inboxName) &&
            !(await this.hasShutdownRequest(entry.name, inboxName))
          ) {
            extraCount++
          }
        }
        const summary = this.toSummary(config)
        summary.memberCount += extraCount
        summary.activeMemberCount += extraCount // assume running if newly discovered
        teams.push(summary)
      } catch {
        // Skip malformed team directories
      }
    }

    return teams
  }

  // ── Get team detail ─────────────────────────────────────────────────────

  async getTeam(name: string): Promise<TeamDetail> {
    const config = await this.loadTeamConfig(name)

    const members: TeamMember[] = await Promise.all(
      config.members.map(async (m) => {
        const needsTranscriptMetrics =
          typeof m.inputTokens !== 'number' ||
          typeof m.outputTokens !== 'number'
        const transcriptMetrics = needsTranscriptMetrics
          ? await this.getMemberTokenMetrics(config, m)
          : null
        return {
          agentId: m.agentId,
          name: m.name,
          agentType: m.agentType,
          model: m.model,
          color: m.color,
          backendType: m.backendType,
          status: this.deriveStatus(m.isActive),
          joinedAt: m.joinedAt,
          cwd: m.cwd,
          sessionId: m.sessionId,
          inputTokens: m.inputTokens ?? transcriptMetrics?.inputTokens,
          outputTokens: m.outputTokens ?? transcriptMetrics?.outputTokens,
        }
      }),
    )

    // Discover members from inboxes/ that aren't in config.json (race condition fix)
    const inboxNames = await this.discoverInboxMembers(name)

    for (const inboxName of inboxNames) {
      if (
        !this.isConfigMemberName(config, inboxName) &&
        !(await this.hasShutdownRequest(name, inboxName))
      ) {
        members.push({
          agentId: `${inboxName}@${name}`,
          name: inboxName,
          agentType: 'general-purpose',
          status: 'running', // assume running since we can see their inbox
          joinedAt: config.createdAt,
          cwd: config.members[0]?.cwd || '',
        })
      }
    }

    if (config.leadSessionId) {
      const subagentNames = await this.discoverSubagentMembers(
        config.leadSessionId,
      )
      for (const subagentName of subagentNames) {
        if (
          !this.isConfigMemberName(config, subagentName) &&
          !(await this.hasShutdownRequest(name, subagentName)) &&
          !members.some((member) => member.name === subagentName)
        ) {
          members.push({
            agentId: `${subagentName}@${name}`,
            name: subagentName,
            status: 'running',
            joinedAt: config.createdAt,
            cwd: config.members[0]?.cwd || '',
          })
        }
      }
    }

    return {
      ...this.toSummary(config),
      leadAgentId: config.leadAgentId,
      leadSessionId: config.leadSessionId,
      memberCount: members.length,
      activeMemberCount: members.filter(
        (m) => m.status === 'running',
      ).length,
      members,
    }
  }

  // ── Get member transcript ───────────────────────────────────────────────

  async getMemberTranscript(
    teamName: string,
    agentId: string,
  ): Promise<TranscriptMessage[]> {
    const config = await this.loadTeamConfig(teamName)
    const memberName = await this.resolveMemberName(config, teamName, agentId)
    if (!memberName) {
      throw ApiError.notFound(
        `Team member not found: ${agentId} in team ${teamName}`,
      )
    }

    // Try config.json member with sessionId first
    const member = config.members.find((m) => m.agentId === agentId)
    if (member?.sessionId) {
      const jsonlPath = await this.findTranscriptFile(member.sessionId)
      if (jsonlPath) {
        return this.parseTranscriptFile(jsonlPath)
      }
    }

    // Fallback: search subagents directory for this member's transcript
    if (config.leadSessionId) {
      const subagentPath = await this.findSubagentTranscript(
        config.leadSessionId,
        memberName,
      )
      if (subagentPath) {
        return this.parseTranscriptFile(subagentPath)
      }
    }

    return []
  }

  async sendMemberMessage(
    teamName: string,
    agentId: string,
    content: string,
  ): Promise<void> {
    const text = content.trim()
    if (!text) {
      throw ApiError.badRequest('content (string) is required in request body')
    }

    const config = await this.loadTeamConfig(teamName)
    const recipientName = await this.resolveMemberName(
      config,
      teamName,
      agentId,
    )

    if (!recipientName) {
      throw ApiError.notFound(
        `Team member not found: ${agentId} in team ${teamName}`,
      )
    }

    await writeToMailbox(
      recipientName,
      {
        from: 'user',
        text,
        timestamp: new Date().toISOString(),
      },
      teamName,
    )
  }

  // ── Delete team ─────────────────────────────────────────────────────────

  async deleteTeam(name: string, force: boolean = false): Promise<void> {
    const config = await this.loadTeamConfig(name)

    if (!force) {
      // Check config.json members
      const hasActiveInConfig = config.members.some(
        (m) => m.isActive === undefined || m.isActive === true,
      )
      if (hasActiveInConfig) {
        throw ApiError.conflict(
          `Cannot delete team "${name}": has active members`,
        )
      }

      // Check inbox-discovered members (they're assumed running)
      const inboxNames = await this.discoverInboxMembers(name)
      const activeInboxMembers = []
      for (const inboxName of inboxNames) {
        if (
          !this.isConfigMemberName(config, inboxName) &&
          !(await this.hasShutdownRequest(name, inboxName))
        ) {
          activeInboxMembers.push(inboxName)
        }
      }
      if (activeInboxMembers.length > 0) {
        throw ApiError.conflict(
          `Cannot delete team "${name}": has active members`,
        )
      }

      // Check subagent-discovered members
      if (config.leadSessionId) {
        const subagentNames = await this.discoverSubagentMembers(config.leadSessionId)
        const activeSubagentMembers = []
        for (const subagentName of subagentNames) {
          if (
            !this.isConfigMemberName(config, subagentName) &&
            !(await this.hasShutdownRequest(name, subagentName)) &&
            !activeInboxMembers.includes(subagentName)
          ) {
            activeSubagentMembers.push(subagentName)
          }
        }
        if (activeSubagentMembers.length > 0) {
          throw ApiError.conflict(
            `Cannot delete team "${name}": has active members`,
          )
        }
      }
    } else {
      // Force mode: send shutdown requests to all active members first
      const activeMembers = config.members.filter(
        (m) => m.isActive === undefined || m.isActive === true,
      )
      for (const member of activeMembers) {
        await sendShutdownRequestToMailbox(
          member.name,
          name,
          'Team is being deleted',
        )
      }

      // Also shutdown inbox-discovered members
      const inboxNames = await this.discoverInboxMembers(name)
      for (const inboxName of inboxNames) {
        if (
          !this.isConfigMemberName(config, inboxName) &&
          !(await this.hasShutdownRequest(name, inboxName))
        ) {
          await sendShutdownRequestToMailbox(
            inboxName,
            name,
            'Team is being deleted',
          )
        }
      }
    }

    const teamDir = path.join(this.getTeamsDir(), name)
    await fs.rm(teamDir, { recursive: true, force: true })
  }

  // ── Delete team member ──────────────────────────────────────────────────

  async deleteMember(teamName: string, agentId: string): Promise<void> {
    const config = await this.loadTeamConfig(teamName)

    // Try to resolve member name (handles both real and synthetic agentIds)
    const memberName = await this.resolveMemberName(config, teamName, agentId)

    if (!memberName) {
      throw ApiError.notFound(`Team member not found: ${agentId}`)
    }

    // Find the member in config.json (may not exist for inbox-discovered members)
    const member = config.members.find((m) => m.agentId === agentId)

    // Send shutdown request via mailbox
    await sendShutdownRequestToMailbox(
      memberName,
      teamName,
      'Removed by team leader',
    )

    if (member) {
      config.members = config.members.filter((m) => m.agentId !== agentId)
    }
    await this.saveTeamConfig(teamName, config)
  }

  // ── Stop team member (send shutdown request without deleting) ────────────

  async stopMember(teamName: string, agentId: string): Promise<void> {
    const config = await this.loadTeamConfig(teamName)

    // Try to resolve member name (handles both real and synthetic agentIds)
    const memberName = await this.resolveMemberName(config, teamName, agentId)

    if (!memberName) {
      throw ApiError.notFound(`Team member not found: ${agentId}`)
    }

    // Send shutdown request via mailbox
    await sendShutdownRequestToMailbox(
      memberName,
      teamName,
      'Stopped by team leader',
    )

    // Update config.json to mark member as inactive (if member exists in config)
    // This allows immediate deletion without waiting for CLI to respond
    const member = config.members.find((m) => m.agentId === agentId)
    if (member) {
      await this.updateMemberActiveStatus(teamName, agentId, false)
    }
  }

  // ── Update member active status ────────────────────────────────────────────

  private async updateMemberActiveStatus(
    teamName: string,
    agentId: string,
    isActive: boolean,
  ): Promise<void> {
    const configPath = path.join(this.getTeamsDir(), teamName, 'config.json')

    try {
      const raw = await fs.readFile(configPath, 'utf-8')
      const config = JSON.parse(raw) as TeamFileRaw

      const memberIndex = config.members.findIndex((m) => m.agentId === agentId)
      if (memberIndex === -1) return

      config.members[memberIndex]!.isActive = isActive

      await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
    } catch {
      // If we can't update the config, that's okay - the shutdown request was sent
    }
  }

  // ── Internal helpers ────────────────────────────────────────────────────

  private async loadTeamConfig(name: string): Promise<TeamFileRaw> {
    const configPath = path.join(this.getTeamsDir(), name, 'config.json')

    try {
      const raw = await fs.readFile(configPath, 'utf-8')
      return JSON.parse(raw) as TeamFileRaw
    } catch {
      throw ApiError.notFound(`Team not found: ${name}`)
    }
  }

  private async saveTeamConfig(name: string, config: TeamFileRaw): Promise<void> {
    const configPath = path.join(this.getTeamsDir(), name, 'config.json')
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
  }

  private getConfigMemberNames(config: TeamFileRaw): Set<string> {
    const names = new Set<string>()
    for (const member of config.members) {
      addNameVariants(names, member.name)
    }
    return names
  }

  private isConfigMemberName(config: TeamFileRaw, name: string): boolean {
    return this.getConfigMemberNames(config).has(name)
  }

  /**
   * Discover member names from the inboxes/ directory.
   * Each file `{name}.json` in inboxes/ represents a team member.
   * Excludes the team-lead inbox and invalid names (like `--` from CLI args).
   */
  private async discoverInboxMembers(teamName: string): Promise<string[]> {
    const inboxDir = path.join(this.getTeamsDir(), teamName, 'inboxes')

    try {
      const files = await fs.readdir(inboxDir)
      return files
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace(/\.json$/, ''))
        .filter((name) => name !== 'team-lead' && isValidMemberName(name))
    } catch {
      return []
    }
  }

  private async hasShutdownRequest(
    teamName: string,
    memberName: string,
  ): Promise<boolean> {
    const inboxPath = path.join(
      this.getTeamsDir(),
      teamName,
      'inboxes',
      `${toMailboxName(memberName)}.json`,
    )

    try {
      const raw = await fs.readFile(inboxPath, 'utf-8')
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

  private toSummary(config: TeamFileRaw): TeamSummary {
    const activeMemberCount = config.members.filter(
      (m) => m.isActive === undefined || m.isActive === true,
    ).length

    return {
      name: config.name,
      description: config.description,
      createdAt: config.createdAt,
      memberCount: config.members.length,
      activeMemberCount,
    }
  }

  private deriveStatus(
    isActive: boolean | undefined,
  ): 'running' | 'completed' | 'idle' | 'failed' {
    if (isActive === false) return 'idle'
    // isActive === undefined || isActive === true
    return 'running'
  }

  private async resolveMemberName(
    config: TeamFileRaw,
    teamName: string,
    agentId: string,
  ): Promise<string | null> {
    const configMember = config.members.find((m) => m.agentId === agentId)
    if (configMember?.name) {
      return configMember.name
    }

    const parsedName = agentId.includes('@') ? agentId.split('@')[0]! : agentId
    const inboxNames = await this.discoverInboxMembers(teamName)
    if (
      inboxNames.includes(parsedName) &&
      !(await this.hasShutdownRequest(teamName, parsedName))
    ) {
      return parsedName
    }

    if (config.leadSessionId) {
      const subagentNames = await this.discoverSubagentMembers(
        config.leadSessionId,
      )
      if (
        subagentNames.includes(parsedName) &&
        !(await this.hasShutdownRequest(teamName, parsedName))
      ) {
        return parsedName
      }
    }

    return null
  }

  private async discoverSubagentMembers(leadSessionId: string): Promise<string[]> {
    const projectsDir = this.getProjectsDir()

    try {
      await fs.access(projectsDir)
    } catch {
      return []
    }

    const discovered = new Set<string>()
    const projectEntries = await fs.readdir(projectsDir, {
      withFileTypes: true,
    })

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
        files = await fs.readdir(subagentsDir)
      } catch {
        continue
      }

      for (const file of files) {
        if (!file.endsWith('.jsonl')) continue
        const discoveredName = await this.extractSubagentName(
          path.join(subagentsDir, file),
        )
        if (discoveredName && discoveredName !== 'team-lead') {
          discovered.add(discoveredName)
        }
      }
    }

    return [...discovered]
  }

  /** Search ~/.claude/projects/ for a JSONL file matching the sessionId. */
  private async findTranscriptFile(
    sessionId: string,
  ): Promise<string | null> {
    const projectsDir = this.getProjectsDir()

    try {
      await fs.access(projectsDir)
    } catch {
      return null
    }

    const projectEntries = await fs.readdir(projectsDir, {
      withFileTypes: true,
    })

    for (const entry of projectEntries) {
      if (!entry.isDirectory()) continue

      const candidate = path.join(projectsDir, entry.name, `${sessionId}.jsonl`)
      try {
        await fs.access(candidate)
        return candidate
      } catch {
        // Not in this project directory
      }
    }

    return null
  }

  private async getMemberTokenMetrics(
    config: TeamFileRaw,
    member: TeamFileRaw['members'][number],
  ): Promise<TokenMetrics | null> {
    let transcriptPath: string | null = null

    if (member.sessionId) {
      transcriptPath = await this.findTranscriptFile(member.sessionId)
    }

    if (!transcriptPath && config.leadSessionId) {
      transcriptPath = await this.findSubagentTranscript(
        config.leadSessionId,
        member.name,
      )
    }

    if (!transcriptPath) return null
    return this.parseTranscriptTokenMetrics(transcriptPath)
  }

  private async parseTranscriptTokenMetrics(
    filePath: string,
  ): Promise<TokenMetrics | null> {
    let raw: string
    try {
      raw = await fs.readFile(filePath, 'utf-8')
    } catch {
      return null
    }

    const lines = raw.split('\n').filter((line) => line.trim().length > 0)
    let inputTokens = 0
    let outputTokens = 0

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

  /**
   * Search subagents directory for a specific member's transcript.
   * Path: ~/.claude/projects/{project}/{leadSessionId}/subagents/agent-*.jsonl
   *
   * Matches by reading the first user message and checking for the member name
   * in the `<teammate-message>` content (e.g., "你是 **security-reviewer**").
   */
  private async findSubagentTranscript(
    leadSessionId: string,
    memberName: string,
  ): Promise<string | null> {
    const projectsDir = this.getProjectsDir()

    try {
      await fs.access(projectsDir)
    } catch {
      return null
    }

    const projectEntries = await fs.readdir(projectsDir, {
      withFileTypes: true,
    })

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
        files = await fs.readdir(subagentsDir)
      } catch {
        continue
      }

      // Check each subagent file — find the one matching this member
      // Use the most recent file if multiple match (handles retries)
      let bestMatch: { path: string; mtime: number } | null = null

      for (const file of files) {
        if (!file.endsWith('.jsonl')) continue

        const filePath = path.join(subagentsDir, file)

        try {
          const head = await this.readTranscriptHead(filePath)
          if (
            head.includes(`"${memberName}"`) ||
            head.includes(`**${memberName}**`) ||
            head.includes(`name":"${memberName}`) ||
            (await this.extractSubagentName(filePath)) === memberName
          ) {
            const stat = await fs.stat(filePath)
            if (!bestMatch || stat.mtimeMs > bestMatch.mtime) {
              bestMatch = { path: filePath, mtime: stat.mtimeMs }
            }
          }
        } catch {
          // Skip unreadable files
        }
      }

      if (bestMatch) {
        return bestMatch.path
      }
    }

    return null
  }

  private async readTranscriptHead(filePath: string): Promise<string> {
    const fd = await fs.open(filePath, 'r')
    try {
      const buf = Buffer.alloc(8192)
      const { bytesRead } = await fd.read(buf, 0, 8192, 0)
      return buf.toString('utf-8', 0, bytesRead)
    } finally {
      await fd.close()
    }
  }

  private async extractSubagentName(filePath: string): Promise<string | null> {
    try {
      const head = await this.readTranscriptHead(filePath)
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
          // Ignore partial or non-JSON lines in the preview window.
        }
      }

      const nameMatch =
        head.match(/"agentName"\s*:\s*"([^"]+)"/) ||
        head.match(/"name"\s*:\s*"([^"]+)"/) ||
        head.match(/\*\*([a-zA-Z0-9_-]+)\*\*/)

      return nameMatch?.[1] ?? null
    } catch {
      return null
    }
  }

  /** Parse a JSONL transcript file into messages. */
  private async parseTranscriptFile(
    filePath: string,
  ): Promise<TranscriptMessage[]> {
    const raw = await fs.readFile(filePath, 'utf-8')
    const lines = raw.split('\n').filter((line) => line.trim().length > 0)

    const messages: TranscriptMessage[] = []

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as Record<string, unknown>

        // Skip non-message entries (snapshots, meta, etc.)
        const entryType = entry.type as string | undefined
        if (
          entryType !== 'user' &&
          entryType !== 'assistant' &&
          entryType !== 'system' &&
          entryType !== 'tool_use' &&
          entryType !== 'tool_result'
        ) {
          continue
        }

        // Skip meta entries
        if (entry.isMeta) continue

        // Extract content from entry.message or entry.content
        // JSONL format: entry.message can be {role, content} object or direct content
        let content: unknown = null
        if (entry.message && typeof entry.message === 'object') {
          // entry.message is {role, content} format - extract the content field
          const msgObj = entry.message as Record<string, unknown>
          content = msgObj.content ?? entry.content
        } else {
          // Direct content or fallback
          content = entry.message ?? entry.content ?? null
        }

        // Extract model from entry.message.model (for assistant messages) or entry.model
        const modelValue =
          (typeof entry.model === 'string' ? entry.model : undefined) ??
          (entry.message && typeof entry.message === 'object'
            ? (entry.message as Record<string, unknown>).model
            : undefined) ??
          undefined

        const message: TranscriptMessage = {
          id: (entry.uuid as string) || crypto.randomUUID(),
          type: entryType as TranscriptMessage['type'],
          content,
          timestamp:
            (entry.timestamp as string) || new Date().toISOString(),
          ...(typeof entry.parentToolUseId === 'string' ? { parentToolUseId: entry.parentToolUseId } : {}),
          ...(typeof modelValue === 'string' ? { model: modelValue } : {}),
        }

        messages.push(message)
      } catch {
        // Skip unparseable lines
      }
    }

    return messages
  }
}

export const teamService = new TeamService()
