import { spyOn } from 'bun:test'
import { fileURLToPath } from 'node:url'
import * as launcher from '../../services/desktopCliLauncherService.js'
import * as auth from '../../../utils/auth.js'
import * as hostTools from '../../../tools.js'
import { cronScheduler } from '../../services/cronScheduler.js'
import { teamWatcher } from '../../services/teamWatcher.js'
import { conversationService } from '../../services/conversationService.js'

/** Real HTTP/WS + local SDK fixture; never discover user providers or install launchers. */
export function installContractEnvironment() {
  const keys = ['CLAUDE_CONFIG_DIR', 'CLAUDE_CLI_PATH', ...Object.keys(process.env).filter(key => key.startsWith('ANTHROPIC_') || key.startsWith('MOCK_SDK_'))]
  const env = new Map(keys.map(key => [key, process.env[key]]))
  for (const key of keys) if (key !== 'CLAUDE_CONFIG_DIR') delete process.env[key]
  process.env.CLAUDE_CLI_PATH = fileURLToPath(new URL('./mock-sdk-cli.ts', import.meta.url))
  const blockedRequests: string[] = []
  const originalFetch = globalThis.fetch
  const spies = [
    spyOn(auth, 'hasOpenAIAuthLogin').mockReturnValue(false),
    spyOn(hostTools, 'getToolsForDefaultPreset').mockReturnValue(['Read', 'Write', 'Bash']),
    spyOn(launcher, 'ensureDesktopCliLauncherInstalled').mockResolvedValue({ supported: false } as any),
    spyOn(cronScheduler, 'start').mockImplementation(() => {}),
    spyOn(teamWatcher, 'start').mockImplementation(() => {}),
    spyOn(globalThis, 'fetch').mockImplementation(((input: any, init: any) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
      if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost' && url.hostname !== '[::1]') {
        blockedRequests.push(url.origin)
        throw new Error(`External network forbidden in contract test: ${url.origin}`)
      }
      return originalFetch(input, init)
    }) as typeof fetch),
  ]
  return async () => {
    try {
      await Promise.all(conversationService.getActiveSessions().map(id => conversationService.stopSessionAndWait(id)))
    } finally {
      for (const spy of spies.reverse()) spy.mockRestore()
      for (const [key, value] of env) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }
    if (blockedRequests.length) throw new Error(`Unexpected external requests: ${blockedRequests.join(', ')}`)
  }
}

export function reserveContractPort(): number {
  const reservation = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response() })
  const port = reservation.port!
  reservation.stop(true)
  return port
}

/** Reject failures/timeouts, clear deadline, and close the socket on every exit. */
export function exchangeContractMessages(url: string, send: unknown | undefined,
  done: (messages: any[]) => boolean, timeoutMs = 10000): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const messages: any[] = []
    const socket = new WebSocket(url)
    let settled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.close()
      if (error) reject(error)
      else resolve(messages)
    }
    const timer = setTimeout(() => finish(new Error(`WebSocket deadline exceeded: ${JSON.stringify(messages)}`)), timeoutMs)
    socket.onerror = () => finish(new Error('WebSocket transport failed'))
    socket.onclose = () => { if (!settled) finish(new Error('WebSocket closed before expected messages')) }
    socket.onmessage = event => {
      try {
        const message = JSON.parse(String(event.data))
        messages.push(message)
        if (message.type === 'connected' && send !== undefined) {
          socket.send(typeof send === 'string' ? send : JSON.stringify(send))
        }
        if (done(messages)) finish()
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)))
      }
    }
  })
}
