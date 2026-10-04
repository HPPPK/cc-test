import { describe, expect, test } from 'bun:test'
import { handleExpertHumanVerificationsApi } from './expert-human-verifications.js'
import { expertHumanVerificationService } from '../services/expertHumanVerificationService.js'
import { expertRuntimeSessionStore } from '../services/expertRuntimeSessionStore.js'

const activeExpert = {
  status: 'active',
  runtimeBinding: {
    active: true,
    researchBrowserPolicy: {
      sharePlaywrightSessionAcrossAgents: true,
      managedPresentationDefault: 'assistable_background',
      desktopHumanVerificationHandoff: true,
    },
  },
}

describe('Expert human verification API', () => {
  test('passes an exact verification gate to both followers and owners', async () => {
    const originalGet = expertRuntimeSessionStore.get
    const originalWait = expertHumanVerificationService.waitForActiveVerification
    const originalRequest = expertHumanVerificationService.requestVerification
    const calls: unknown[] = []
    try {
      expertRuntimeSessionStore.get = async () => activeExpert as never
      expertHumanVerificationService.waitForActiveVerification = async (sessionId, options) => {
        calls.push({ kind: 'join', sessionId, options })
        return {
          resolution: 'verification_completed',
          verificationGateId: options.verificationGateId,
          verification: { url: 'https://example.com/captcha', title: 'CAPTCHA', detail: 'required' },
        }
      }
      expertHumanVerificationService.requestVerification = async (request) => {
        calls.push({ kind: 'owner', request })
        return {
          resolution: 'verification_completed',
          verificationGateId: request.verificationGateId,
          verification: request.verification,
        }
      }

      const joinResponse = await handleExpertHumanVerificationsApi(new Request('http://localhost/api/expert-human-verifications', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: '12345678-abcd-1234-abcd-123456789abc',
          joinExisting: true,
          verificationGateId: 'gate-join',
        }),
      }), new URL('http://localhost'), ['api', 'expert-human-verifications'])
      await expect(joinResponse.json()).resolves.toMatchObject({ verificationGateId: 'gate-join' })

      const verification = { url: 'https://example.com/captcha', title: 'CAPTCHA', detail: 'required' }
      const ownerResponse = await handleExpertHumanVerificationsApi(new Request('http://localhost/api/expert-human-verifications', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: '12345678-abcd-1234-abcd-123456789abc',
          verificationGateId: 'gate-owner',
          verification,
        }),
      }), new URL('http://localhost'), ['api', 'expert-human-verifications'])
      await expect(ownerResponse.json()).resolves.toMatchObject({ verificationGateId: 'gate-owner' })

      expect(calls).toEqual([
        {
          kind: 'join',
          sessionId: '12345678-abcd-1234-abcd-123456789abc',
          options: { verificationGateId: 'gate-join' },
        },
        {
          kind: 'owner',
          request: {
            sessionId: '12345678-abcd-1234-abcd-123456789abc',
            verificationGateId: 'gate-owner',
            verification,
          },
        },
      ])
    } finally {
      expertRuntimeSessionStore.get = originalGet
      expertHumanVerificationService.waitForActiveVerification = originalWait
      expertHumanVerificationService.requestVerification = originalRequest
    }
  })
})
