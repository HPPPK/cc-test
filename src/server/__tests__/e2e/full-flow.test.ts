/**
 * E2E Test — 完整流程测试
 *
 * 启动真实服务器，模拟 UI 前端的完整操作流程。
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { installContractEnvironment, reserveContractPort, exchangeContractMessages } from '../fixtures/contract-environment.js'

let restoreEnvironment: () => Promise<void>

let server: ReturnType<typeof Bun.serve>
let baseUrl: string
let tmpDir: string

// Use dynamic import to avoid bundling issues
async function startTestServer() {
  restoreEnvironment = installContractEnvironment()
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-e2e-'))
  process.env.CLAUDE_CONFIG_DIR = tmpDir

  // Create required directories
  await fs.mkdir(path.join(tmpDir, 'projects'), { recursive: true })

  const { startServer } = await import('../../index.js')
  const port = reserveContractPort()
  server = startServer(port, '127.0.0.1')
  baseUrl = `http://127.0.0.1:${server.port}`
}

async function api(method: string, path: string, body?: unknown): Promise<{ status: number; data: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => null)
  return { status: res.status, data }
}

describe('E2E: Full Flow', () => {
  beforeAll(async () => {
    await startTestServer()
  })

  afterAll(async () => {
    server?.stop(true)
    await restoreEnvironment()
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  // =============================================
  // 1. Health & Status
  // =============================================

  it('should return healthy status', async () => {
    const res = await fetch(`${baseUrl}/health`)
    const data = await res.json()
    expect(data.status).toBe('ok')
  })

  it('should return server status', async () => {
    const { data } = await api('GET', '/api/status')
    expect(data.status).toBe('ok')
    expect(data.version).toBeDefined()
  })

  it('should return diagnostics', async () => {
    const { data } = await api('GET', '/api/status/diagnostics')
    expect(data.platform).toBe(process.platform)
    expect(data.configDir).toBe(tmpDir)
  })

  // =============================================
  // 2. Sessions CRUD
  // =============================================

  let sessionId: string

  it('should start with empty session list', async () => {
    const { data } = await api('GET', '/api/sessions')
    expect(data.sessions).toEqual([])
    expect(data.total).toBe(0)
  })

  it('should create a new session', async () => {
    const { status, data } = await api('POST', '/api/sessions', { workDir: tmpDir })
    expect(status).toBe(201)
    expect(data.sessionId).toBeDefined()
    expect(data.sessionId).toMatch(/^[0-9a-f-]{36}$/)
    sessionId = data.sessionId
  })

  it('should list the created session', async () => {
    const { data } = await api('GET', '/api/sessions')
    expect(data.sessions.length).toBe(1)
    expect(data.sessions[0].id).toBe(sessionId)
  })

  it('should get session detail', async () => {
    const { status, data } = await api('GET', `/api/sessions/${sessionId}`)
    expect(status).toBe(200)
    expect(data.id).toBe(sessionId)
  })

  it('should rename session', async () => {
    const { status } = await api('PATCH', `/api/sessions/${sessionId}`, { title: 'My Test Session' })
    expect(status).toBe(200)

    const { data } = await api('GET', `/api/sessions/${sessionId}`)
    expect(data.title).toBe('My Test Session')
  })

  it('should get session messages', async () => {
    const { status, data } = await api('GET', `/api/sessions/${sessionId}/messages`)
    expect(status).toBe(200)
    expect(Array.isArray(data.messages)).toBe(true)
  })

  it('should delete session', async () => {
    const { status } = await api('DELETE', `/api/sessions/${sessionId}`)
    expect(status).toBe(200)

    const { data } = await api('GET', '/api/sessions')
    expect(data.sessions.length).toBe(0)
  })

  // =============================================
  // 3. Settings
  // =============================================

  it('should get empty settings initially', async () => {
    const { data } = await api('GET', '/api/settings/user')
    expect(data).toEqual({})
  })

  it('should update and read user settings', async () => {
    await api('PUT', '/api/settings/user', { theme: 'dark', model: 'claude-sonnet-4-6' })

    const { data } = await api('GET', '/api/settings/user')
    expect(data.theme).toBe('dark')
    expect(data.model).toBe('claude-sonnet-4-6')
  })

  it('should get and set permission mode', async () => {
    await api('PUT', '/api/permissions/mode', { mode: 'plan' })

    const { data } = await api('GET', '/api/permissions/mode')
    expect(data.mode).toBe('plan')
  })

  it('should reject invalid permission mode', async () => {
    const { status } = await api('PUT', '/api/permissions/mode', { mode: 'invalid' })
    expect(status).toBe(400)
  })

  // =============================================
  // 4. Models
  // =============================================

  it('should list available models', async () => {
    const { data } = await api('GET', '/api/models')
    expect(data.models.map((model: any) => model.id)).toEqual([
      'claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5',
    ])
    expect(data.models[0].name).toBe('Opus 4.7')
  })

  it('should switch model', async () => {
    await api('PUT', '/api/models/current', { modelId: 'claude-haiku-4-5' })

    const { data } = await api('GET', '/api/models/current')
    expect(data.model.id).toBe('claude-haiku-4-5')
  })

  it('should get and set effort level', async () => {
    await api('PUT', '/api/effort', { level: 'high' })

    const { data } = await api('GET', '/api/effort')
    expect(data.level).toBe('high')
  })

  // =============================================
  // 5. Scheduled Tasks
  // =============================================

  let taskId: string

  it('should start with empty task list', async () => {
    const { data } = await api('GET', '/api/scheduled-tasks')
    expect(data.tasks).toEqual([])
  })

  it('should create a scheduled task', async () => {
    const { status, data } = await api('POST', '/api/scheduled-tasks', {
      cron: '0 9 * * *',
      prompt: 'Review commits from last 24h',
      recurring: true,
      name: 'daily-review',
      description: 'Daily code review',
    })
    expect(status).toBe(201)
    expect(data.task.id).toBeDefined()
    expect(data.task.cron).toBe('0 9 * * *')
    taskId = data.task.id
  })

  it('should list the created task', async () => {
    const { data } = await api('GET', '/api/scheduled-tasks')
    expect(data.tasks.length).toBe(1)
    expect(data.tasks[0].id).toBe(taskId)
  })

  it('should update a task', async () => {
    const { status, data } = await api('PUT', `/api/scheduled-tasks/${taskId}`, {
      cron: '0 10 * * 1-5',
    })
    expect(status).toBe(200)
    expect(data.task.cron).toBe('0 10 * * 1-5')
  })

  it('should delete a task', async () => {
    const { status } = await api('DELETE', `/api/scheduled-tasks/${taskId}`)
    expect([200, 204]).toContain(status)

    const { data } = await api('GET', '/api/scheduled-tasks')
    expect(data.tasks).toEqual([])
  })

  // =============================================
  // 6. Search
  // =============================================

  it('should search workspace', async () => {
    // Create a test file to search
    await fs.writeFile(path.join(tmpDir, 'test-search.txt'), 'Hello World\nFoo Bar Baz\n')

    const { status, data } = await api('POST', '/api/search', {
      query: 'Hello',
      cwd: tmpDir,
    })
    expect(status).toBe(200)
    expect(data.results.length).toBeGreaterThan(0)
    expect(data.results[0].text).toContain('Hello')
  })

  // =============================================
  // 7. Agents
  // =============================================

  it('should start with shared active/all agent payload', async () => {
    const { data } = await api('GET', '/api/agents')
    expect(Array.isArray(data.activeAgents)).toBe(true)
    expect(Array.isArray(data.allAgents)).toBe(true)
    expect(data.activeAgents.length).toBeGreaterThan(0)
    expect(data.activeAgents.some((agent: any) => agent.source === 'built-in')).toBe(true)
  })

  it('should create an agent', async () => {
    const { status } = await api('POST', '/api/agents', {
      name: 'test-agent',
      description: 'A test agent',
      model: 'claude-sonnet-4-6',
    })
    expect(status).toBe(201)
  })

  it('should expose shared active/all agent payload independent of CRUD storage', async () => {
    const { data } = await api('GET', '/api/agents')
    expect(Array.isArray(data.activeAgents)).toBe(true)
    expect(Array.isArray(data.allAgents)).toBe(true)
    expect(data.activeAgents.length).toBeGreaterThan(0)
    expect(data.activeAgents.some((agent: any) => agent.source === 'built-in')).toBe(true)
    expect(data.activeAgents.some((agent: any) => agent.agentType === 'test-agent')).toBe(false)
  })

  it('should delete an agent', async () => {
    const { status } = await api('DELETE', '/api/agents/test-agent')
    expect([200, 204]).toContain(status)
  })

  // =============================================
  // 8. WebSocket Chat
  // =============================================

  it('should complete a local SDK chat over WebSocket', async () => {
    const { status, data: created } = await api('POST', '/api/sessions', { workDir: tmpDir })
    expect(status).toBe(201)
    const messages = await exchangeContractMessages(`${baseUrl.replace('http://', 'ws://')}/ws/${created.sessionId}`,
      { type: 'user_message', content: 'Hello' },
      messages => messages.some(message => message.type === 'message_complete'))
    expect(messages[0]).toMatchObject({ type: 'connected', sessionId: created.sessionId })
    expect(messages.filter(message => message.type === 'content_delta').map(message => message.text).join('')).toContain('Echo: Hello')
    expect(messages.filter(message => message.type === 'message_complete')).toHaveLength(1)
  }, 15000)

  // =============================================
  // 9. Conversation Status
  // =============================================

  it('should get chat status', async () => {
    // Create a session first
    const { data: created } = await api('POST', '/api/sessions', { workDir: tmpDir })

    const { status, data } = await api('GET', `/api/sessions/${created.sessionId}/chat/status`)
    expect(status).toBe(200)
    expect(data.state).toBe('idle')

    // Cleanup
    await api('DELETE', `/api/sessions/${created.sessionId}`)
  })

  // =============================================
  // 10. CORS
  // =============================================

  it('should handle CORS preflight', async () => {
    const res = await fetch(`${baseUrl}/api/status`, {
      method: 'OPTIONS',
      headers: { 'Origin': 'http://localhost:3000' },
    })
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000')
  })

  // =============================================
  // 11. Error Handling
  // =============================================

  it('should return 404 for unknown API', async () => {
    const { status } = await api('GET', '/api/nonexistent')
    expect(status).toBe(404)
  })

  it('should return 404 for unknown session', async () => {
    const { status } = await api('GET', '/api/sessions/00000000-0000-0000-0000-000000000000')
    expect(status).toBe(404)
  })
})
