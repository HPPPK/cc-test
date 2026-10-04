import { expect, test, spyOn } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

// Real loopback WebSockets and production handlers; only model/CLI output is a fixture.
// Never attaches to a user session or launches a provider request.
test('concurrent AskUserQuestion requests survive out-of-order answers and reconnect through real WebSockets', async () => {
  const configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jiangxia-question-queue-'))
  const oldConfigDir = process.env.CLAUDE_CONFIG_DIR
  process.env.CLAUDE_CONFIG_DIR = configDir
  const { handleWebSocket, __resetWebSocketHandlerStateForTests } = await import('../ws/handler.js')
  const { conversationService } = await import('../services/conversationService.js')
  const { sessionService } = await import('../services/sessionService.js')
  const id = 'question-queue-' + crypto.randomUUID()
  const token = crypto.randomUUID()
  const sessions = (conversationService as any).sessions as Map<string, any>
  sessions.set(id, {
    proc: { kill() {}, exited: new Promise(() => {}) }, outputCallbacks: [], workDir: configDir,
    permissionMode: 'default', sdkToken: token, sdkSocket: null, pendingOutbound: [],
    startupPending: false, startupExitCode: null, stdoutLines: [], stderrLines: [],
    outputDrain: Promise.resolve(), sdkMessages: [], initMessage: null, pendingPermissionRequests: new Map(),
  })
  const getSession = spyOn(sessionService, 'getSession').mockResolvedValue({ id, workDir: configDir } as any)
  const getTitle = spyOn(sessionService, 'getCustomTitle').mockResolvedValue(null)
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    fetch(req, server) {
      const sdk = new URL(req.url).pathname === '/sdk'
      if (server.upgrade(req, { data: { sessionId: id, channel: sdk ? 'sdk' : 'client', sdkToken: sdk ? token : null, connectedAt: Date.now(), serverPort: server.port, serverHost: '127.0.0.1' } })) return
      return new Response('upgrade required', { status: 400 })
    },
    websocket: handleWebSocket,
  })
  const sockets: WebSocket[] = []
  const connect = async (route: string) => {
    const socket = new WebSocket('ws://127.0.0.1:' + server.port + route)
    const messages: any[] = []
    socket.addEventListener('message', e => messages.push(JSON.parse(String(e.data))))
    sockets.push(socket)
    await new Promise<void>((resolve, reject) => { socket.addEventListener('open', () => resolve(), { once: true }); socket.addEventListener('error', reject, { once: true }) })
    return { socket, messages }
  }
  const wait = async (predicate: () => boolean) => {
    const deadline = Date.now() + 5000
    while (!predicate()) { if (Date.now() > deadline) throw new Error('Question fixture timed out'); await Bun.sleep(10) }
  }
  try {
    const client = await connect('/client')
    const sdk = await connect('/sdk')
    for (const n of [1, 2]) sdk.socket.send(JSON.stringify({ type: 'control_request', request_id: 'request-' + n,
      request: { subtype: 'can_use_tool', tool_name: 'AskUserQuestion', tool_use_id: 'tool-' + n,
        input: { questions: [{ question: 'Question ' + n, options: [{ label: 'Yes' }, { label: 'No' }] }] } },
    }))
    await wait(() => client.messages.filter(m => m.type === 'permission_request').length === 2)
    expect(conversationService.getPendingPermissionRequests(id).map(r => r.requestId)).toEqual(['request-1', 'request-2'])
    client.socket.send(JSON.stringify({ type: 'permission_response', requestId: 'request-2', allowed: true, updatedInput: { answers: { 'Question 2': 'Yes' } } }))
    await wait(() => sdk.messages.some(m => m.response?.request_id === 'request-2'))
    expect(conversationService.getPendingPermissionRequests(id).map(r => r.requestId)).toEqual(['request-1'])
    await new Promise<void>(resolve => {
      client.socket.addEventListener('close', () => resolve(), { once: true })
      client.socket.close()
    })
    const reconnected = await connect('/client')
    await wait(() => reconnected.messages.some(m => m.type === 'permission_request'))
    expect(reconnected.messages.filter(m => m.type === 'permission_request').map(m => m.requestId)).toEqual(['request-1'])
    reconnected.socket.send(JSON.stringify({ type: 'permission_response', requestId: 'request-1', allowed: true, updatedInput: { answers: { 'Question 1': 'Yes' } } }))
    await wait(() => sdk.messages.some(m => m.response?.request_id === 'request-1'))
    expect(conversationService.getPendingPermissionRequests(id)).toEqual([])
    expect(sdk.messages.filter(m => m.type === 'control_response').map(m => m.response.request_id)).toEqual(['request-2', 'request-1'])
    for (const n of [1, 2]) sdk.socket.send(JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tool-' + n, content: 'User has answered your questions: Yes' }] } }))
    sdk.socket.send(JSON.stringify({ type: 'result', subtype: 'success', result: 'Question fixture complete', usage: { input_tokens: 0, output_tokens: 0 } }))
    await wait(() => reconnected.messages.some(m => m.type === 'message_complete'))
    expect(reconnected.messages.filter(m => m.type === 'tool_result').map(m => m.toolUseId)).toEqual(['tool-1', 'tool-2'])
  } finally {
    for (const socket of sockets) socket.close()
    await Bun.sleep(20)
    __resetWebSocketHandlerStateForTests()
    sessions.delete(id)
    server.stop(true)
    getSession.mockRestore()
    getTitle.mockRestore()
    if (oldConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR
    else process.env.CLAUDE_CONFIG_DIR = oldConfigDir
  }
}, 30000)
