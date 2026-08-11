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
    const shownBrowsers: Array<{ sessionId: string; browserKey?: string }> = []
    const service = new ExpertHumanVerificationService(deliver, {
      requestShow(sessionId, browserKey) {
        shownBrowsers.push({ sessionId, ...(browserKey ? { browserKey } : {}) })
      },
    })

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
    expect(shownBrowsers).toEqual([{
      sessionId: 'expert-session',
      browserKey: 'expert-session:research-agent',
    }])

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
      deliveries.push({ requestId: message.requestId, ...(message.toolUseId ? { toolUseId: message.toolUseId } : {}) })
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

  test('keeps distinct CAPTCHA pages queued when they are separate browser gates', async () => {
    const deliveries: Array<{ requestId: string; toolUseId?: string; verification: typeof verification }> = []
    const secondVerification = {
      ...verification,
      url: 'https://www.google.com/search?q=markdown+reader',
      engine: 'Google',
    }
    const service = new ExpertHumanVerificationService((_sessionId, message) => {
      deliveries.push({
        requestId: message.requestId,
        ...(message.toolUseId ? { toolUseId: message.toolUseId } : {}),
        verification: message.input.verification,
      })
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
})
