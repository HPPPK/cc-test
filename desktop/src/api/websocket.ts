import type { ClientMessage, ServerMessage } from '../types/chat'
import { getAuthToken, getBaseUrl } from './client'

type MessageHandler = (msg: ServerMessage) => void

export type WebSocketConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'
type ConnectionStateHandler = (state: WebSocketConnectionState) => void

type WorkflowTransitionAction = Extract<ClientMessage, { type: 'workflow_transition' }>['action']

export function createWorkflowTransitionId(
  phaseId: string,
  stateVersion: number | undefined,
  action: WorkflowTransitionAction,
  confirmationId?: string,
): string {
  const base = `workflow-transition:${phaseId}:${typeof stateVersion === 'number' ? stateVersion : 'unknown'}:${action}`
  return confirmationId ? `${base}:${encodeURIComponent(confirmationId)}` : base
}

type Connection = {
  ws: WebSocket
  handlers: Set<MessageHandler>
  openWaiters: Set<() => void>
  reconnectTimer: ReturnType<typeof setTimeout> | null
  reconnectAttempt: number
  pingInterval: ReturnType<typeof setInterval> | null
  intentionalClose: boolean
  pendingMessages: ClientMessage[]
}

class WebSocketManager {
  private connections = new Map<string, Connection>()
  private connectionStateHandlers = new Map<string, Set<ConnectionStateHandler>>()

  private emitConnectionState(sessionId: string, state: WebSocketConnectionState) {
    for (const handler of this.connectionStateHandlers.get(sessionId) ?? []) handler(state)
  }

  isConnected(sessionId: string): boolean {
    const conn = this.connections.get(sessionId)
    return conn?.ws.readyState === WebSocket.OPEN
  }

  getConnectedSessionIds(): string[] {
    return [...this.connections.keys()]
  }

  connect(sessionId: string) {
    const existing = this.connections.get(sessionId)
    if (
      existing &&
      !existing.intentionalClose &&
      (
        existing.ws.readyState === WebSocket.OPEN ||
        existing.ws.readyState === WebSocket.CONNECTING ||
        existing.reconnectTimer !== null
      )
    ) {
      return
    }

    const ws = new WebSocket(buildSessionWebSocketUrl(sessionId))

    const conn: Connection = {
      ws,
      handlers: existing?.handlers ?? new Set(),
      openWaiters: existing?.openWaiters ?? new Set(),
      reconnectTimer: null,
      reconnectAttempt: existing?.reconnectAttempt ?? 0,
      pingInterval: null,
      intentionalClose: false,
      pendingMessages: existing?.pendingMessages ?? [],
    }
    this.connections.set(sessionId, conn)
    this.emitConnectionState(sessionId, 'connecting')

    ws.onopen = () => {
      conn.reconnectAttempt = 0
      this.emitConnectionState(sessionId, 'connected')
      this.startPingLoop(sessionId)
      for (const waiter of conn.openWaiters) waiter()
      while (conn.pendingMessages.length > 0) {
        const msg = conn.pendingMessages.shift()!
        ws.send(JSON.stringify(msg))
      }
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as ServerMessage
        for (const handler of conn.handlers) {
          handler(msg)
        }
      } catch {
        // Ignore malformed messages
      }
    }

    ws.onclose = () => {
      this.stopPingLoop(sessionId)
      if (!conn.intentionalClose && this.connections.get(sessionId) === conn) {
        this.emitConnectionState(sessionId, 'reconnecting')
        this.scheduleReconnect(sessionId, conn)
      } else {
        this.emitConnectionState(sessionId, 'disconnected')
      }
    }

    ws.onerror = () => {
      // onclose will fire after onerror
    }
  }

  disconnect(sessionId: string) {
    const conn = this.connections.get(sessionId)
    if (!conn) return

    conn.intentionalClose = true
    this.stopPingLoop(sessionId)
    if (conn.reconnectTimer) {
      clearTimeout(conn.reconnectTimer)
      conn.reconnectTimer = null
    }
    conn.pendingMessages = []
    this.emitConnectionState(sessionId, 'disconnected')

    conn.ws.close()
    this.connections.delete(sessionId)
    this.connectionStateHandlers.delete(sessionId)
  }

  disconnectAll() {
    for (const sessionId of [...this.connections.keys()]) {
      this.disconnect(sessionId)
    }
  }

  /**
   * Workflow transitions are concurrency-sensitive protocol actions. Unlike ordinary
   * chat messages, they must never be added to the unbounded reconnect queue: after
   * a delayed reconnect, an old confirm/reject could mutate a newer workflow state.
   */
  async sendWorkflowTransition(
    sessionId: string,
    message: Extract<ClientMessage, { type: 'workflow_transition' }>,
    options: { timeoutMs?: number } = {},
  ): Promise<'sent' | 'unavailable'> {
    const conn = await this.waitForOpen(sessionId, options.timeoutMs ?? 5_000)
    if (!conn) return 'unavailable'

    try {
      conn.ws.send(JSON.stringify(message))
      return 'sent'
    } catch {
      return 'unavailable'
    }
  }

  private waitForOpen(sessionId: string, timeoutMs: number): Promise<Connection | null> {
    let conn = this.connections.get(sessionId)
    if (!conn) {
      this.connect(sessionId)
      conn = this.connections.get(sessionId)
    }
    if (!conn) return Promise.resolve(null)
    if (conn.ws.readyState === WebSocket.OPEN) return Promise.resolve(conn)

    if (conn.ws.readyState === WebSocket.CLOSED || conn.ws.readyState === WebSocket.CLOSING) {
      if (!conn.intentionalClose && !conn.reconnectTimer) {
        this.scheduleReconnect(sessionId, conn)
      }
    }

    return new Promise((resolve) => {
      let settled = false
      const finish = (value: Connection | null) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        const current = this.connections.get(sessionId)
        current?.openWaiters.delete(onOpen)
        resolve(value)
      }
      const onOpen = () => {
        const current = this.connections.get(sessionId)
        finish(current?.ws.readyState === WebSocket.OPEN ? current : null)
      }
      const timeout = setTimeout(() => finish(null), timeoutMs)
      conn.openWaiters.add(onOpen)
    })
  }

  send(sessionId: string, message: ClientMessage) {
    let conn = this.connections.get(sessionId)
    if (!conn) {
      this.connect(sessionId)
      conn = this.connections.get(sessionId)
      if (!conn) return
    }

    if (conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(JSON.stringify(message))
      return
    }

    conn.pendingMessages.push(message)

    if (
      conn.ws.readyState === WebSocket.CLOSED ||
      conn.ws.readyState === WebSocket.CLOSING
    ) {
      if (!conn.intentionalClose && !conn.reconnectTimer) {
        this.scheduleReconnect(sessionId, conn)
      }
    }
  }

  onConnectionState(sessionId: string, handler: ConnectionStateHandler): () => void {
    const handlers = this.connectionStateHandlers.get(sessionId) ?? new Set<ConnectionStateHandler>()
    handlers.add(handler)
    this.connectionStateHandlers.set(sessionId, handlers)
    return () => {
      handlers.delete(handler)
      if (handlers.size === 0) this.connectionStateHandlers.delete(sessionId)
    }
  }

  clearConnectionStateHandlers(sessionId: string) {
    this.connectionStateHandlers.delete(sessionId)
  }

  onMessage(sessionId: string, handler: MessageHandler): () => void {
    const conn = this.connections.get(sessionId)
    if (!conn) return () => {}
    conn.handlers.add(handler)
    return () => { conn.handlers.delete(handler) }
  }

  clearHandlers(sessionId: string) {
    const conn = this.connections.get(sessionId)
    if (conn) conn.handlers.clear()
  }

  private startPingLoop(sessionId: string) {
    this.stopPingLoop(sessionId)
    const conn = this.connections.get(sessionId)
    if (!conn) return
    conn.pingInterval = setInterval(() => {
      this.send(sessionId, { type: 'ping' })
    }, 30_000)
  }

  private stopPingLoop(sessionId: string) {
    const conn = this.connections.get(sessionId)
    if (conn?.pingInterval) {
      clearInterval(conn.pingInterval)
      conn.pingInterval = null
    }
  }

  private scheduleReconnect(sessionId: string, conn: Connection) {
    if (conn.reconnectTimer) {
      clearTimeout(conn.reconnectTimer)
    }

    const delay = Math.min(1000 * 2 ** conn.reconnectAttempt, 30_000)
    conn.reconnectAttempt++

    conn.reconnectTimer = setTimeout(() => {
      if (this.connections.get(sessionId) === conn && !conn.intentionalClose) {
        conn.reconnectTimer = null
        this.connect(sessionId)
      }
    }, delay)
  }
}

export function buildSessionWebSocketUrl(sessionId: string) {
  const url = new URL(getBaseUrl())
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  const basePath = url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '')
  url.pathname = `${basePath}/ws/${encodeURIComponent(sessionId)}`

  const token = getAuthToken()
  if (token) {
    url.searchParams.set('token', token)
  } else {
    url.searchParams.delete('token')
  }

  return url.toString()
}

export const wsManager = new WebSocketManager()
