import { describe, expect, test } from 'bun:test'
import {
  ExpertHumanVerificationService,
  type ExpertHumanVerificationDelivery,
} from './expertHumanVerificationService.js'

const verification = {
  url: 'https://www.bing.com/search?q=markdown+reader',
  title: 'Bing verification',
  engine: 'Bing',
  detail: 'EXPERT_HUMAN_VERIFICATION_REQUIRED: CAPTCHA',
}

describe('ExpertHumanVerificationService', () => {
  test('delivers a dedicated Playwright verification request and returns the explicit Desktop choice', async () => {
    const sent: Array<{ sessionId: string; message: unknown }> = []
    const deliver: ExpertHumanVerificationDelivery = (sessionId, message) => {
      sent.push({ sessionId, message })
      return true
    }
    const service = new ExpertHumanVerificationService(deliver)

    const pending = service.requestVerification({
      sessionId: 'expert-session',
      agentId: 'research-agent',
      toolUseId: 'tool-1',
      browserSessionKey: 'expert-session:research-agent',
      verification,
    })
    expect(sent).toHaveLength(1)
    const request = sent[0]!.message as {
      requestId: string
      toolName: string
      input: { kind: string; verification: unknown; queue: { remaining: number } }
    }
    expect(request.toolName).toBe('Playwright')
    expect(request.input).toEqual({
      kind: 'expert-playwright-verification',
      verification,
      queue: { remaining: 0 },
    })
    expect(JSON.stringify(request.input)).not.toContain('expert-session:research-agent')
    expect(service.resolveVerification(request.requestId, true, {
      verificationResolution: 'verification_completed',
    })).toBe(true)

    await expect(pending).resolves.toEqual({
      resolution: 'verification_completed',
      verification,
    })
  })

  test('keeps the request pending until the user explicitly chooses a resolution', async () => {
    let requestId = ''
    const service = new ExpertHumanVerificationService((_sessionId, message) => {
      requestId = message.requestId
      return true
    })
    let settled = false
    const pending = service.requestVerification({ sessionId: 'waiting-session', verification })
      .finally(() => { settled = true })

    await Promise.resolve()
    expect(requestId).not.toBe('')
    expect(settled).toBe(false)

    expect(service.resolveVerification(requestId, true, {
      verificationResolution: 'switch_public_entry',
    })).toBe(true)
    await expect(pending).resolves.toMatchObject({ resolution: 'switch_public_entry' })
  })

  test('lets a PENDING worker join the active verification without emitting a second Desktop modal', async () => {
    const deliveries: Array<{ requestId: string; toolUseId?: string }> = []
    const service = new ExpertHumanVerificationService((_sessionId, message) => {
      if (message.type === 'permission_request') {
        deliveries.push({ requestId: message.requestId, ...(message.toolUseId ? { toolUseId: message.toolUseId } : {}) })
      }
      return true
    })

    const owner = service.requestVerification({
      sessionId: 'same-session',
      agentId: 'product-agent',
      toolUseId: 'tool-product',
      verification,
    })
    const joined = service.waitForActiveVerification('same-session')

    expect(deliveries).toHaveLength(1)
    expect(service.resolveVerification(deliveries[0]!.requestId, true, {
      verificationResolution: 'switch_public_entry',
    })).toBe(true)

    await expect(owner).resolves.toEqual({ resolution: 'switch_public_entry', verification })
    await expect(joined).resolves.toEqual({ resolution: 'switch_public_entry', verification })
    expect(deliveries).toHaveLength(1)
  })

  test('handles a short PENDING-before-owner race by attaching the waiter to the first dedicated modal', async () => {
    const deliveries: Array<{ requestId: string }> = []
    const service = new ExpertHumanVerificationService((_sessionId, message) => {
      deliveries.push({ requestId: message.requestId })
      return true
    })

    const joined = service.waitForActiveVerification('race-session')
    const owner = service.requestVerification({ sessionId: 'race-session', verification })
    expect(deliveries).toHaveLength(1)

    expect(service.resolveVerification(deliveries[0]!.requestId, true, {
      verificationResolution: 'verification_completed',
    })).toBe(true)
    await expect(owner).resolves.toEqual({ resolution: 'verification_completed', verification })
    await expect(joined).resolves.toEqual({ resolution: 'verification_completed', verification })
  })

  test('joins only the matching gate when a different verification is already queued first', async () => {
    const deliveries: Array<{ requestId: string }> = []
    const service = new ExpertHumanVerificationService((_sessionId, message) => {
      if (message.type === 'permission_request') deliveries.push({ requestId: message.requestId })
      return true
    })

    let joinedSettled = false
    const joined = service.waitForActiveVerification('exact-gate-session', { verificationGateId: 'gate-a' })
      .finally(() => { joinedSettled = true })
    const otherOwner = service.requestVerification({
      sessionId: 'exact-gate-session',
      verificationGateId: 'gate-b',
      verification: { ...verification, url: 'https://example.com/gate-b' },
    })
    const matchingOwner = service.requestVerification({
      sessionId: 'exact-gate-session',
      verificationGateId: 'gate-a',
      verification,
    })

    expect(deliveries).toHaveLength(1)
    expect(service.resolveVerification(deliveries[0]!.requestId, true, {
      verificationResolution: 'verification_completed',
    })).toBe(true)
    await otherOwner
    await Promise.resolve()
    expect(joinedSettled).toBe(false)
    expect(deliveries).toHaveLength(2)

    expect(service.resolveVerification(deliveries[1]!.requestId, true, {
      verificationResolution: 'switch_public_entry',
    })).toBe(true)
    await expect(matchingOwner).resolves.toMatchObject({
      resolution: 'switch_public_entry',
      verificationGateId: 'gate-a',
    })
    await expect(joined).resolves.toMatchObject({
      resolution: 'switch_public_entry',
      verificationGateId: 'gate-a',
    })
  })

  test('returns the cached decision to a late follower for the same exact gate', async () => {
    let requestId = ''
    const service = new ExpertHumanVerificationService((_sessionId, message) => {
      requestId = message.requestId
      return true
    })
    const owner = service.requestVerification({
      sessionId: 'late-follower-session',
      verificationGateId: 'gate-late',
      verification,
    })
    expect(service.resolveVerification(requestId, true, {
      verificationResolution: 'verification_completed',
    })).toBe(true)
    await owner

    await expect(service.waitForActiveVerification('late-follower-session', {
      verificationGateId: 'gate-late',
    })).resolves.toEqual({
      resolution: 'verification_completed',
      verificationGateId: 'gate-late',
      verification,
    })
  })

  test('cancels an exact-gate waiter that arrived before its owner', async () => {
    const service = new ExpertHumanVerificationService(() => true)
    const joined = service.waitForActiveVerification('cancel-gate-session', { verificationGateId: 'gate-cancelled' })
    service.cancelSession('cancel-gate-session', 'session cancelled')
    await expect(joined).rejects.toThrow('session cancelled')
  })

  test('keeps distinct CAPTCHA pages queued when they are separate browser gates', async () => {
    const deliveries: Array<{
      requestId: string
      toolUseId?: string
      verification: Parameters<ExpertHumanVerificationService['requestVerification']>[0]['verification']
    }> = []
    const secondVerification = {
      ...verification,
      url: 'https://www.google.com/search?q=markdown+reader',
      engine: 'Google',
    }
    const service = new ExpertHumanVerificationService((_sessionId, message) => {
      if (message.type === 'permission_request') {
        deliveries.push({
          requestId: message.requestId,
          ...(message.toolUseId ? { toolUseId: message.toolUseId } : {}),
          verification: message.input.verification,
        })
      }
      return true
    })

    const first = service.requestVerification({
      sessionId: 'same-session',
      agentId: 'product-agent',
      toolUseId: 'tool-product',
      verification,
    })
    const second = service.requestVerification({
      sessionId: 'same-session',
      agentId: 'demand-agent',
      toolUseId: 'tool-demand',
      verification: secondVerification,
    })

    expect(deliveries).toHaveLength(1)
    expect(deliveries[0]).toMatchObject({ toolUseId: 'tool-product', verification })
    expect(service.getPendingRequest('same-session')).toMatchObject({
      requestId: deliveries[0]!.requestId,
      verification,
    })

    expect(service.resolveVerification(deliveries[0]!.requestId, true, {
      verificationResolution: 'switch_public_entry',
    })).toBe(true)
    await expect(first).resolves.toMatchObject({
      resolution: 'switch_public_entry',
      verification,
    })

    await Promise.resolve()
    expect(deliveries).toHaveLength(2)
    expect(deliveries[1]).toMatchObject({ toolUseId: 'tool-demand', verification: secondVerification })
    expect(deliveries[1]!.requestId).not.toBe(deliveries[0]!.requestId)
    expect(service.resolveVerification(deliveries[1]!.requestId, true, {
      verificationResolution: 'verification_completed',
    })).toBe(true)
    await expect(second).resolves.toMatchObject({
      resolution: 'verification_completed',
      verification: secondVerification,
    })
  })

  test('auto-resolves a queued healthy browser page without later opening a stale modal', async () => {
    const deliveries: Array<{ requestId: string; type: string; toolUseId?: string }> = []
    const service = new ExpertHumanVerificationService((_sessionId, message) => {
      deliveries.push({
        requestId: message.requestId,
        type: message.type,
        ...(message.type === 'permission_request' && message.toolUseId ? { toolUseId: message.toolUseId } : {}),
      })
      return true
    })
    const firstVerification = { ...verification, url: 'https://wappass.baidu.com/static/captcha', engine: '百度' }
    const queuedVerification = { ...verification, url: 'https://www.bing.com/search?q=Quicker+alternatives', engine: 'Bing' }

    const first = service.requestVerification({
      sessionId: 'queued-auto-session',
      toolUseId: 'tool-baidu',
      browserSessionKey: 'browser-baidu',
      verification: firstVerification,
    })
    const queued = service.requestVerification({
      sessionId: 'queued-auto-session',
      toolUseId: 'tool-bing',
      browserSessionKey: 'browser-bing',
      verification: queuedVerification,
    })

    expect(deliveries).toEqual([
      expect.objectContaining({ type: 'permission_request', toolUseId: 'tool-baidu' }),
    ])

    // Bing recovered while Baidu was the visible queue head. It must be removed
    // by its browser key now, rather than later becoming a stale Bing modal.
    expect(service.resolveAutoDetectedVerification('queued-auto-session', 'browser-bing')).toBe(true)
    await expect(queued).resolves.toEqual({ resolution: 'verification_completed', verification: queuedVerification })
    expect(service.getPendingRequest('queued-auto-session')).toMatchObject({ verification: firstVerification })
    expect(deliveries).toHaveLength(1)

    expect(service.resolveVerification(deliveries[0]!.requestId, true, {
      verificationResolution: 'verification_completed',
    })).toBe(true)
    await expect(first).resolves.toEqual({ resolution: 'verification_completed', verification: firstVerification })
    await Promise.resolve()
    expect(deliveries).toHaveLength(1)
  })

  test('auto-resolves only a verification that owns the exact browser session', async () => {
    const deliveries: Array<{ requestId: string; type: string; status?: string }> = []
    const service = new ExpertHumanVerificationService((_sessionId, message) => {
      deliveries.push({
        requestId: message.requestId,
        type: message.type,
        ...(message.type === 'permission_response_ack' ? { status: message.status } : {}),
      })
      return true
    })

    const pending = service.requestVerification({
      sessionId: 'auto-session',
      browserSessionKey: 'browser-owner',
      verification,
    })
    expect(service.getActiveBrowserSessionKey('auto-session')).toBe('browser-owner')
    expect(service.resolveAutoDetectedVerification('auto-session', 'another-browser')).toBe(false)
    expect(service.getActiveBrowserSessionKey('auto-session')).toBe('browser-owner')

    expect(service.resolveAutoDetectedVerification('auto-session', 'browser-owner')).toBe(true)
    await expect(pending).resolves.toEqual({ resolution: 'verification_completed', verification })
    expect(service.getActiveBrowserSessionKey('auto-session')).toBeNull()
    expect(service.resolveAutoDetectedVerification('auto-session', 'browser-owner')).toBe(false)
    expect(deliveries).toEqual([
      { requestId: deliveries[0]!.requestId, type: 'permission_request' },
      { requestId: deliveries[0]!.requestId, type: 'permission_response_ack', status: 'accepted' },
    ])
  })

test('delivers a verification reminder immediately without requesting browser foreground control', async () => {
    const deliveries: Array<{ requestId: string; input: { verification: Record<string, unknown> } }> = []
    const service = new ExpertHumanVerificationService((_sessionId, message) => {
      if (message.type === 'permission_request') {
        deliveries.push({
          requestId: message.requestId,
          input: { verification: message.input.verification as Record<string, unknown> },
        })
      }
      return true
    })

    const pending = service.requestVerification({
      sessionId: 'presentation-session',
      browserSessionKey: 'browser-owner',
      verification,
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(deliveries).toHaveLength(1)
    expect(deliveries[0]!.input.verification).toEqual(verification)

    expect(service.resolveVerification(deliveries[0]!.requestId, true, {
      verificationResolution: 'verification_completed',
    })).toBe(true)
    await expect(pending).resolves.toMatchObject({ resolution: 'verification_completed' })
  })

})

test('defers an unanswered verification once and releases owner and followers within a bounded wait', async () => {
  const delivered: any[] = []
  const service = new ExpertHumanVerificationService((_session, message) => { delivered.push(message); return true }, 15)
  const verification = { url: 'https://s.weibo.com/weibo?q=Quicker', title: 'Login', detail: 'login required' }
  const owner = service.requestVerification({ sessionId: 'bounded-session', verificationGateId: 'same-gate', verification })
  const sibling = service.waitForActiveVerification('bounded-session', { verificationGateId: 'same-gate' })
  const first = await Promise.race([owner, new Promise(resolve => setTimeout(() => resolve({ resolution: 'still_waiting' }), 80))])
  expect(first).toMatchObject({ resolution: 'verification_deferred', verificationGateId: 'same-gate' })
  expect(await sibling).toMatchObject({ resolution: 'verification_deferred' })
  expect(await service.waitForActiveVerification('bounded-session', { verificationGateId: 'same-gate' })).toMatchObject({ resolution: 'verification_deferred' })
  expect(delivered.filter(x => x.type === 'permission_request')).toHaveLength(1)
  expect(delivered.filter(x => x.type === 'permission_response_ack')).toHaveLength(1)
})


test('bounds orphan followers when the owning verification never arrives', async () => {
  const service = new ExpertHumanVerificationService(() => true, 15)
  const exact = service.waitForActiveVerification('orphan', { verificationGateId: 'lost-gate' })
  const session = service.waitForActiveVerification('orphan')
  const outcomes = await Promise.allSettled([exact, session])
  for (const outcome of outcomes) {
    expect(outcome.status).toBe('rejected')
    if (outcome.status === 'rejected') expect(outcome.reason.message).toContain('owner did not arrive')
  }
  expect(service.getPendingRequest('orphan')).toBeNull()
  service.cancelSession('orphan')
})
