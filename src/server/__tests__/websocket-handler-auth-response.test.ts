import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test'
import type { ServerWebSocket } from 'bun'
import { __resetWebSocketHandlerStateForTests, handleWebSocket, sendToSession, type WebSocketData } from '../ws/handler.js'
import { conversationService } from '../services/conversationService.js'
import { sessionService } from '../services/sessionService.js'
import { expertHumanVerificationService } from '../services/expertHumanVerificationService.js'

const verification = { url: 'https://example.com/login', title: 'Sign in', detail: 'Login verification required' }

function socket(sessionId: string) {
  const sent: Array<Record<string, unknown>> = []
  const ws = {
    data: { sessionId, connectedAt: Date.now(), channel: 'client', sdkToken: null, serverPort: 0, serverHost: '127.0.0.1' },
    send: (payload: string) => { sent.push(JSON.parse(payload)); return 1 },
    close: mock(() => {}),
  } as unknown as ServerWebSocket<WebSocketData>
  return { ws, sent }
}

async function settleHandlers() {
  for (let index = 0; index < 5; index += 1) await new Promise(resolve => setTimeout(resolve, 0))
}

afterEach(() => {
  __resetWebSocketHandlerStateForTests()
  expertHumanVerificationService.cancelSession('verification-response-owner')
  expertHumanVerificationService.resetForTests()
  expertHumanVerificationService.setDelivery(sendToSession)
  mock.restore()
})

describe('WebSocket human verification responses', () => {
  test('rejects malformed approval and preserves the pending verification without generic permission fallthrough', async () => {
    expertHumanVerificationService.setDelivery(() => true)
    const owner = expertHumanVerificationService.requestVerification({ sessionId: 'verification-response-owner', verification })
    const requestId = expertHumanVerificationService.getPendingRequest('verification-response-owner')!.requestId
    const generic = spyOn(conversationService, 'respondToPermission').mockReturnValue(true)
    spyOn(conversationService, 'getPendingPermissionRequests').mockReturnValue([])
    spyOn(conversationService, 'hasSession').mockReturnValue(true)
    const { ws, sent } = socket('verification-response-owner')

    handleWebSocket.message(ws, JSON.stringify({ type: 'permission_response', requestId, allowed: true }))
    await settleHandlers()

    expect(generic).not.toHaveBeenCalled()
    expect(sent).toContainEqual(expect.objectContaining({ type: 'permission_response_ack', requestId, status: 'rejected' }))
    expect(expertHumanVerificationService.getPendingRequest('verification-response-owner')?.requestId).toBe(requestId)
    handleWebSocket.message(ws, JSON.stringify({ type: 'permission_response', requestId, allowed: true, updatedInput: { verificationResolution: 'switch_public_entry' } }))
    await expect(owner).resolves.toMatchObject({ resolution: 'switch_public_entry' })
    await settleHandlers()
    expect(sent).toContainEqual(expect.objectContaining({ type: 'permission_response_ack', requestId, status: 'accepted' }))
    expect(generic).not.toHaveBeenCalled()
  })

  test('rejects stale verification identifiers without forwarding them to generic permissions', async () => {
    const generic = spyOn(conversationService, 'respondToPermission').mockReturnValue(true)
    spyOn(conversationService, 'getPendingPermissionRequests').mockReturnValue([])
    spyOn(conversationService, 'hasSession').mockReturnValue(true)
    const { ws, sent } = socket('verification-response-owner')
    const requestId = 'expert-human-verification:stale'
    handleWebSocket.message(ws, JSON.stringify({ type: 'permission_response', requestId, allowed: true, updatedInput: { verificationResolution: 'verification_completed' } }))
    await settleHandlers()
    expect(generic).not.toHaveBeenCalled()
    expect(sent).toContainEqual(expect.objectContaining({ type: 'permission_response_ack', requestId, status: 'rejected' }))
  })

  test('does not resolve another session verification even with a valid explicit choice', async () => {
    expertHumanVerificationService.setDelivery(() => true)
    const owner = expertHumanVerificationService.requestVerification({ sessionId: 'verification-response-owner', verification })
    const requestId = expertHumanVerificationService.getPendingRequest('verification-response-owner')!.requestId
    const generic = spyOn(conversationService, 'respondToPermission').mockReturnValue(true)
    const { ws, sent } = socket('unrelated-session')
    handleWebSocket.message(ws, JSON.stringify({ type: 'permission_response', requestId, allowed: true, updatedInput: { verificationResolution: 'verification_completed' } }))
    await settleHandlers()
    expect(expertHumanVerificationService.getPendingRequest('verification-response-owner')?.requestId).toBe(requestId)
    expect(generic).not.toHaveBeenCalled()
    expect(sent).toContainEqual(expect.objectContaining({ type: 'permission_response_ack', requestId, status: 'rejected' }))
    expertHumanVerificationService.resolveVerification(requestId, true, { verificationResolution: 'record_evidence_gap' })
    await owner
  })
})


describe('shared-session permission acknowledgements', () => {
  function connectClients() {
    spyOn(sessionService, 'getSession').mockResolvedValue(null)
    spyOn(conversationService, 'getPendingPermissionRequests').mockReturnValue([])
    spyOn(conversationService, 'hasSession').mockReturnValue(true)
    const controller = socket('verification-response-owner')
    const desktop = socket('verification-response-owner')
    handleWebSocket.open(controller.ws)
    handleWebSocket.open(desktop.ws)
    return { controller, desktop }
  }

  test('clears an ordinary permission in every connected UI when the controller answers it', async () => {
    const { controller, desktop } = connectClients()
    const generic = spyOn(conversationService, 'respondToPermission').mockReturnValue(true)
    const requestId = 'ordinary-permission-before-captcha'
    sendToSession('verification-response-owner', {
      type: 'permission_request', requestId, toolName: 'Playwright', input: { actions: [] }, description: 'Browser access',
    })
    handleWebSocket.message(controller.ws, JSON.stringify({ type: 'permission_response', requestId, allowed: true }))
    await settleHandlers()
    expect(generic).toHaveBeenCalledTimes(1)
    for (const client of [controller, desktop]) {
      expect(client.sent).toContainEqual(expect.objectContaining({ type: 'permission_request', requestId }))
      expect(client.sent).toContainEqual(expect.objectContaining({ type: 'permission_response_ack', requestId, status: 'accepted' }))
    }
  })

  test('broadcasts a valid human verification decision while keeping malformed replies local', async () => {
    const { controller, desktop } = connectClients()
    expertHumanVerificationService.setDelivery(sendToSession)
    const owner = expertHumanVerificationService.requestVerification({ sessionId: 'verification-response-owner', verification })
    const requestId = expertHumanVerificationService.getPendingRequest('verification-response-owner')!.requestId
    handleWebSocket.message(controller.ws, JSON.stringify({ type: 'permission_response', requestId, allowed: true }))
    await settleHandlers()
    expect(controller.sent).toContainEqual(expect.objectContaining({ type: 'permission_response_ack', requestId, status: 'rejected' }))
    expect(desktop.sent.some(message => message.type === 'permission_response_ack' && message.requestId === requestId)).toBe(false)
    expect(expertHumanVerificationService.getPendingRequest('verification-response-owner')?.requestId).toBe(requestId)
    handleWebSocket.message(controller.ws, JSON.stringify({ type: 'permission_response', requestId, allowed: true, updatedInput: { verificationResolution: 'switch_public_entry' } }))
    await expect(owner).resolves.toMatchObject({ resolution: 'switch_public_entry' })
    await settleHandlers()
    for (const client of [controller, desktop]) expect(client.sent).toContainEqual(expect.objectContaining({ type: 'permission_response_ack', requestId, status: 'accepted' }))
  })
})

test('replays an existing human verification to a newly connected Desktop without replacing its owner', async () => {
  spyOn(sessionService, 'getSession').mockResolvedValue(null)
  spyOn(conversationService, 'getPendingPermissionRequests').mockReturnValue([])
  spyOn(conversationService, 'hasSession').mockReturnValue(true)
  const controller = socket('verification-response-owner')
  handleWebSocket.open(controller.ws)
  expertHumanVerificationService.setDelivery(sendToSession)
  const owner = expertHumanVerificationService.requestVerification({ sessionId: 'verification-response-owner', toolUseId: 'original-owner', verification })
  const requestId = expertHumanVerificationService.getPendingRequest('verification-response-owner')!.requestId
  const original = controller.sent.find(message => message.type === 'permission_request' && message.requestId === requestId)
  const reconnectedDesktop = socket('verification-response-owner')
  handleWebSocket.open(reconnectedDesktop.ws)
  await settleHandlers()
  expect(reconnectedDesktop.sent.filter(message => message.type === 'permission_request' && message.requestId === requestId)).toEqual([original])
  expect(controller.sent.filter(message => message.type === 'permission_request' && message.requestId === requestId)).toHaveLength(1)
  expect(expertHumanVerificationService.getPendingRequest('verification-response-owner')?.requestId).toBe(requestId)
  handleWebSocket.message(reconnectedDesktop.ws, JSON.stringify({ type: 'permission_response', requestId, allowed: true, updatedInput: { verificationResolution: 'switch_public_entry' } }))
  await expect(owner).resolves.toMatchObject({ resolution: 'switch_public_entry' })
})
