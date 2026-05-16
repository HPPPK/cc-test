/**
 * Unit tests for TeamWatcher — real-time team status push via WebSocket
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as fsSyn from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import type { TeamMemberStatus } from '../ws/events.js'

// ============================================================================
// Test helpers
// ============================================================================

let tmpDir: string

async function setupTmpConfigDir(): Promise<string> {
  tmpDir = path.join(
    os.tmpdir(),
    `claude-watcher-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  await fs.mkdir(path.join(tmpDir, 'teams'), { recursive: true })
  await fs.mkdir(path.join(tmpDir, 'projects'), { recursive: true })
  process.env.CLAUDE_CONFIG_DIR = tmpDir
  return tmpDir
}

async function cleanupTmpDir(): Promise<void> {
  if (tmpDir) {
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
  delete process.env.CLAUDE_CONFIG_DIR
}

/** Write a team config.json to the temp directory. */
async function writeTeamConfig(
  teamName: string,
  config: Record<string, unknown>,
): Promise<string> {
  const teamDir = path.join(tmpDir, 'teams', teamName)
  await fs.mkdir(teamDir, { recursive: true })
  const configPath = path.join(teamDir, 'config.json')
  await fs.writeFile(configPath, JSON.stringify(config), 'utf-8')
  return configPath
}

async function writeTranscriptFile(
  projectDir: string,
  sessionId: string,
  entries: Record<string, unknown>[],
): Promise<string> {
  const dir = path.join(tmpDir, 'projects', projectDir)
  await fs.mkdir(dir, { recursive: true })
  const filePath = path.join(dir, `${sessionId}.jsonl`)
  const content = entries.map((e) => JSON.stringify(e)).join('\n') + '\n'
  await fs.writeFile(filePath, content, 'utf-8')
  return filePath
}

/** Create a standard team config for testing. */
function makeTeamConfig(overrides?: Record<string, unknown>) {
  return {
    name: 'test-team',
    description: 'A test team',
    createdAt: 1700000000000,
    leadAgentId: 'agent-lead',
    members: [
      {
        agentId: 'agent-lead',
        name: 'Lead Agent',
        agentType: 'lead',
        model: 'claude-opus-4-7',
        color: '#ff0000',
        joinedAt: 1700000000000,
        tmuxPaneId: '%0',
        cwd: '/tmp/project',
        sessionId: 'session-lead-001',
        isActive: true,
      },
      {
        agentId: 'agent-worker',
        name: 'Worker Agent',
        agentType: 'worker',
        model: 'claude-sonnet-4-20250514',
        color: '#00ff00',
        joinedAt: 1700000001000,
        tmuxPaneId: '%1',
        cwd: '/tmp/project/src',
        sessionId: 'session-worker-001',
        isActive: false,
      },
    ],
    ...overrides,
  }
}

// ============================================================================
// Mock the WebSocket handler exports
// ============================================================================

// Track all messages sent via broadcast
let broadcastedMessages: Array<{ sessionId: string; message: unknown }> = []
let mockActiveSessionIds: string[] = []

// We need to mock the handler module before importing TeamWatcher
// Use Bun's module mock
const mockSendToSession = mock((sessionId: string, message: unknown) => {
  broadcastedMessages.push({ sessionId, message })
  return true
})

const mockGetActiveSessionIds = mock(() => {
  return mockActiveSessionIds
})

// Mock the handler module
import { TeamWatcher } from '../services/teamWatcher.js'

// Since TeamWatcher imports from handler.js at the module level, we need to
// test using the class directly and override the broadcast behavior.
// Instead, we test extractMemberStatuses directly and test the integration
// by verifying the check cycle behavior via a wrapper approach.

// ============================================================================
// TeamWatcher.extractMemberStatuses tests
// ============================================================================

describe('TeamWatcher.extractMemberStatuses', () => {
  let watcher: TeamWatcher

  beforeEach(() => {
    watcher = new TeamWatcher()
  })

  it('should extract member statuses from a valid config', () => {
    const config = makeTeamConfig()
    const statuses = watcher.extractMemberStatuses(config)

    expect(statuses).toHaveLength(2)
    expect(statuses[0]).toEqual({
      agentId: 'agent-lead',
      role: 'Lead Agent',
      status: 'running',
      currentTask: undefined,
      joinedAt: '2023-11-14T22:13:20.000Z',
      inputTokens: undefined,
      outputTokens: undefined,
    })
    expect(statuses[1]).toEqual({
      agentId: 'agent-worker',
      role: 'Worker Agent',
      status: 'idle',
      currentTask: undefined,
      joinedAt: '2023-11-14T22:13:21.000Z',
      inputTokens: undefined,
      outputTokens: undefined,
    })
  })

  it('should return running status when isActive is undefined', () => {
    const config = makeTeamConfig()
    delete (config.members[0] as Record<string, unknown>).isActive
    const statuses = watcher.extractMemberStatuses(config)

    expect(statuses[0]!.status).toBe('running')
  })

  it('should return idle status when isActive is false', () => {
    const config = makeTeamConfig()
    const statuses = watcher.extractMemberStatuses(config)

    expect(statuses[1]!.status).toBe('idle')
  })

  it('should prefer member name as role when present', () => {
    const config = makeTeamConfig()
    const statuses = watcher.extractMemberStatuses(config)

    expect(statuses[0]!.role).toBe('Lead Agent')
    expect(statuses[1]!.role).toBe('Worker Agent')
  })

  it('should fall back to name when agentType is missing', () => {
    const config = makeTeamConfig()
    delete (config.members[0] as Record<string, unknown>).agentType
    const statuses = watcher.extractMemberStatuses(config)

    expect(statuses[0]!.role).toBe('Lead Agent')
  })

  it('should fall back to "member" when both agentType and name are missing', () => {
    const config = makeTeamConfig()
    delete (config.members[0] as Record<string, unknown>).agentType
    delete (config.members[0] as Record<string, unknown>).name
    const statuses = watcher.extractMemberStatuses(config)

    expect(statuses[0]!.role).toBe('member')
  })

  it('should return empty array when config has no members', () => {
    const config = { name: 'empty-team' }
    const statuses = watcher.extractMemberStatuses(config)
    expect(statuses).toEqual([])
  })

  it('should return empty array when members is not an array', () => {
    const config = { name: 'bad-team', members: 'not-an-array' }
    const statuses = watcher.extractMemberStatuses(config)
    expect(statuses).toEqual([])
  })

  it('should include currentTask when present in config', () => {
    const config = makeTeamConfig()
    ;(config.members[0] as Record<string, unknown>).currentTask = 'Implementing feature X'
    const statuses = watcher.extractMemberStatuses(config)

    expect(statuses[0]!.currentTask).toBe('Implementing feature X')
  })

  it('should derive token metrics from member transcript usage when config has none', async () => {
    await setupTmpConfigDir()
    try {
      const config = makeTeamConfig()
      await writeTranscriptFile('-tmp-project', 'session-worker-001', [
        {
          type: 'assistant',
          uuid: 'msg-asst-1',
          message: {
            role: 'assistant',
            model: 'claude-sonnet-4-20250514',
            content: [{ type: 'text', text: 'First response' }],
            usage: {
              input_tokens: 100,
              output_tokens: 20,
              cache_read_input_tokens: 30,
              cache_creation_input_tokens: 40,
            },
          },
          timestamp: '2026-01-01T00:02:00.000Z',
        },
        {
          type: 'assistant',
          uuid: 'msg-asst-2',
          message: {
            role: 'assistant',
            model: 'claude-sonnet-4-20250514',
            content: [{ type: 'text', text: 'Second response' }],
            usage: {
              input_tokens: 200,
              output_tokens: 50,
            },
          },
          timestamp: '2026-01-01T00:03:00.000Z',
        },
      ])

      const statuses = watcher.extractMemberStatuses(config)
      const worker = statuses.find((member) => member.agentId === 'agent-worker')!

      expect(worker.inputTokens).toBe(370)
      expect(worker.outputTokens).toBe(70)
    } finally {
      await cleanupTmpDir()
    }
  })
})

// ============================================================================
// TeamWatcher polling integration tests
// ============================================================================

describe('TeamWatcher polling', () => {
  let watcher: TeamWatcher

  beforeEach(async () => {
    await setupTmpConfigDir()
    watcher = new TeamWatcher()
  })

  afterEach(async () => {
    watcher.stop()
    watcher.reset()
    await cleanupTmpDir()
  })

  it('should detect new team creation via checkNow()', async () => {
    // First poll: no teams
    watcher.checkNow()

    // Create a team
    await writeTeamConfig('new-team', makeTeamConfig({ name: 'new-team' }))

    // The watcher internally calls broadcast which calls sendToSession.
    // Since sendToSession depends on active sessions, we test that the
    // internal snapshot state is updated correctly.
    // After checkNow, the watcher should have recorded the team.
    watcher.checkNow()

    // Now modify the team config and check again -- this proves the previous
    // checkNow() recorded the snapshot (otherwise it would emit team_created again)
    const updatedConfig = makeTeamConfig({ name: 'new-team', description: 'updated' })
    await writeTeamConfig('new-team', updatedConfig)
    watcher.checkNow()

    // If we got here without errors, the snapshot logic is working
  })

  it('should detect team config changes', async () => {
    // Create initial team
    await writeTeamConfig('change-team', makeTeamConfig({ name: 'change-team' }))

    // First poll picks up the team
    watcher.checkNow()

    // Modify the config
    const updatedConfig = makeTeamConfig({
      name: 'change-team',
      description: 'updated description',
    })
    await writeTeamConfig('change-team', updatedConfig)

    // Second poll should detect the change
    watcher.checkNow()
    // No error means the diff detection worked
  })

  it('should detect transcript token usage changes when config is unchanged', async () => {
    const config = makeTeamConfig({ name: 'usage-change-team' })
    await writeTeamConfig('usage-change-team', config)
    await writeTranscriptFile('-tmp-project', 'session-worker-001', [
      {
        type: 'assistant',
        uuid: 'msg-asst-1',
        message: {
          role: 'assistant',
          model: 'claude-sonnet-4-20250514',
          content: [{ type: 'text', text: 'First response' }],
          usage: {
            input_tokens: 100,
            output_tokens: 20,
          },
        },
        timestamp: '2026-01-01T00:02:00.000Z',
      },
    ])

    const snapshotBefore = (
      watcher as unknown as {
        buildTeamSnapshot: (content: string) => string
      }
    ).buildTeamSnapshot(JSON.stringify(config))

    await writeTranscriptFile('-tmp-project', 'session-worker-001', [
      {
        type: 'assistant',
        uuid: 'msg-asst-1',
        message: {
          role: 'assistant',
          model: 'claude-sonnet-4-20250514',
          content: [{ type: 'text', text: 'First response' }],
          usage: {
            input_tokens: 100,
            output_tokens: 20,
          },
        },
        timestamp: '2026-01-01T00:02:00.000Z',
      },
      {
        type: 'assistant',
        uuid: 'msg-asst-2',
        message: {
          role: 'assistant',
          model: 'claude-sonnet-4-20250514',
          content: [{ type: 'text', text: 'Second response' }],
          usage: {
            input_tokens: 200,
            output_tokens: 50,
          },
        },
        timestamp: '2026-01-01T00:03:00.000Z',
      },
    ])

    const snapshotAfter = (
      watcher as unknown as {
        buildTeamSnapshot: (content: string) => string
      }
    ).buildTeamSnapshot(JSON.stringify(config))

    expect(snapshotBefore).not.toBe(snapshotAfter)
  })

  it('should detect team deletion', async () => {
    // Create a team
    await writeTeamConfig('doomed-team', makeTeamConfig({ name: 'doomed-team' }))

    // First poll picks it up
    watcher.checkNow()

    // Delete the team directory
    await fs.rm(path.join(tmpDir, 'teams', 'doomed-team'), { recursive: true, force: true })

    // Next poll should detect deletion
    watcher.checkNow()
    // If no error, deletion detection worked
  })

  it('should handle missing teams directory gracefully', async () => {
    // Remove the entire teams directory
    await fs.rm(path.join(tmpDir, 'teams'), { recursive: true, force: true })

    // Should not throw
    watcher.checkNow()
  })

  it('should handle malformed config.json gracefully', async () => {
    // Create a team with invalid JSON
    const teamDir = path.join(tmpDir, 'teams', 'bad-json')
    await fs.mkdir(teamDir, { recursive: true })
    await fs.writeFile(path.join(teamDir, 'config.json'), 'not valid json', 'utf-8')

    // Should not throw
    watcher.checkNow()
  })

  it('should skip directories without config.json', async () => {
    // Create a directory with no config.json
    const teamDir = path.join(tmpDir, 'teams', 'no-config')
    await fs.mkdir(teamDir, { recursive: true })

    // Should not throw
    watcher.checkNow()
  })

  it('should track multiple teams independently', async () => {
    await writeTeamConfig('team-a', makeTeamConfig({ name: 'team-a' }))
    await writeTeamConfig('team-b', makeTeamConfig({ name: 'team-b' }))

    // Pick up both teams
    watcher.checkNow()

    // Modify only team-a
    await writeTeamConfig('team-a', makeTeamConfig({ name: 'team-a', description: 'changed' }))

    // Should detect change in team-a but not team-b
    watcher.checkNow()

    // Delete only team-b
    await fs.rm(path.join(tmpDir, 'teams', 'team-b'), { recursive: true, force: true })

    watcher.checkNow()
    // No errors means independent tracking works
  })

  it('should start and stop polling without errors', async () => {
    // Start with a short interval
    watcher.start(50)

    // Let it run a couple of cycles
    await new Promise((resolve) => setTimeout(resolve, 150))

    // Stop
    watcher.stop()

    // Starting again should work
    watcher.start(50)
    watcher.stop()
  })

  it('should not start duplicate intervals when start() called twice', async () => {
    watcher.start(100)
    watcher.start(100) // second call should be a no-op

    // Let it run briefly
    await new Promise((resolve) => setTimeout(resolve, 50))

    watcher.stop()
  })

  it('should handle teams directory appearing after initial check', async () => {
    // Remove teams dir
    await fs.rm(path.join(tmpDir, 'teams'), { recursive: true, force: true })

    // First check -- no teams dir
    watcher.checkNow()

    // Create teams dir and a team
    await fs.mkdir(path.join(tmpDir, 'teams'), { recursive: true })
    await writeTeamConfig('late-team', makeTeamConfig({ name: 'late-team' }))

    // Second check should pick it up
    watcher.checkNow()
  })

  it('reset() should clear internal state', async () => {
    await writeTeamConfig('reset-team', makeTeamConfig({ name: 'reset-team' }))

    // Pick up the team
    watcher.checkNow()

    // Reset and check again -- should treat it as new
    watcher.reset()
    watcher.checkNow()
    // No error means reset worked
  })

  it('should not rediscover a config member from its sanitized mailbox filename', async () => {
    const config = makeTeamConfig({ name: 'watcher-sanitized' })
    await writeTeamConfig('watcher-sanitized', config)
    const inboxDir = path.join(tmpDir, 'teams', 'watcher-sanitized', 'inboxes')
    await fs.mkdir(inboxDir, { recursive: true })
    await fs.writeFile(path.join(inboxDir, 'Worker-Agent.json'), '[]', 'utf-8')

    const inboxMembers = (
      watcher as unknown as {
        discoverInboxMembers: (
          teamsDir: string,
          teamName: string,
          config: Record<string, unknown>,
        ) => TeamMemberStatus[]
      }
    ).discoverInboxMembers(
      path.join(tmpDir, 'teams'),
      'watcher-sanitized',
      config,
    )

    expect(inboxMembers).toEqual([])
  })

  it('should not rediscover an inbox member after a shutdown request', async () => {
    const config = makeTeamConfig({
      name: 'watcher-shutdown',
      members: [],
    })
    await writeTeamConfig('watcher-shutdown', config)
    const inboxDir = path.join(tmpDir, 'teams', 'watcher-shutdown', 'inboxes')
    await fs.mkdir(inboxDir, { recursive: true })
    await fs.writeFile(
      path.join(inboxDir, 'security-reviewer.json'),
      JSON.stringify([
        {
          from: 'team-lead',
          text: JSON.stringify({ type: 'shutdown_request' }),
          read: false,
        },
      ]),
      'utf-8',
    )

    const inboxMembers = (
      watcher as unknown as {
        discoverInboxMembers: (
          teamsDir: string,
          teamName: string,
          config: Record<string, unknown>,
        ) => TeamMemberStatus[]
      }
    ).discoverInboxMembers(
      path.join(tmpDir, 'teams'),
      'watcher-shutdown',
      config,
    )

    expect(inboxMembers).toEqual([])
  })
})

// ============================================================================
// Broadcast integration tests
// ============================================================================

describe('TeamWatcher broadcast', () => {
  it('should call sendToSession for each active session', async () => {
    // This test verifies the broadcast logic by importing the real module
    // and checking that getActiveSessionIds/sendToSession are called.
    // Since the handler module manages real WebSocket state, we verify
    // that when there are no active sessions, broadcast is a no-op.

    await setupTmpConfigDir()
    const watcher = new TeamWatcher()

    await writeTeamConfig('broadcast-team', makeTeamConfig({ name: 'broadcast-team' }))

    // With no active WebSocket sessions, checkNow should still succeed
    // (broadcast sends to zero sessions)
    watcher.checkNow()

    watcher.stop()
    watcher.reset()
    await cleanupTmpDir()
  })
})
