import { describe, expect, test } from 'bun:test'
import { coordinateExpertBrowserVerification } from './expertBrowserVerificationRuntime.js'
import { ExpertHumanVerificationService } from '../../server/services/expertHumanVerificationService.js'

const captchaResult = {
  data: {
    url: 'https://www.google.com/search?q=mac+markdown+reader',
    title: 'Google verification',
    error: 'EXPERT_HUMAN_VERIFICATION_REQUIRED: CAPTCHA at https://www.google.com/search?q=mac+markdown+reader',
  },
}

const pendingCaptchaResult = {
  data: {
    url: 'https://www.baidu.com/s?wd=markdown+reader',
    title: 'Baidu verification',
    error: 'EXPERT_HUMAN_VERIFICATION_PENDING: slider CAPTCHA at https://www.baidu.com/s?wd=markdown+reader',
  },
}

const enabledEnv = {
  CC_JIANGXIA_EXPERT_BROWSER_HUMAN_VERIFICATION_HANDOFF: '1',
  CC_JIANGXIA_DESKTOP_SERVER_URL: 'http://127.0.0.1:3456',
  CC_JIANGXIA_EXPERT_SESSION_ID: 'expert-session',
} as NodeJS.ProcessEnv

describe('coordinateExpertBrowserVerification', () => {
  test('leaves ordinary Playwright results untouched outside a package-scoped Expert handoff', async () => {
    const fetchImpl = async () => { throw new Error('must not fetch') }
    await expect(coordinateExpertBrowserVerification({
      toolName: 'Playwright',
      result: captchaResult,
      env: {},
      fetchImpl: fetchImpl as typeof fetch,
    })).resolves.toBe(captchaResult)
  })

  test('sends a server-generated verification context and returns same-page continuation guidance', async () => {
    const requests: Request[] = []
    const result = await coordinateExpertBrowserVerification({
      toolName: 'Playwright',
      result: captchaResult,
      agentId: 'agent-seo',
      toolUseId: 'toolu_google',
      env: enabledEnv,
      fetchImpl: async (input, init) => {
        requests.push(new Request(input, init))
        return Response.json({ resolution: 'verification_completed' })
      },
    })

    expect(requests).toHaveLength(1)
    expect(requests[0]!.url).toBe('http://127.0.0.1:3456/api/expert-human-verifications')
    await expect(requests[0]!.json()).resolves.toEqual({
      sessionId: 'expert-session',
      agentId: 'agent-seo',
      toolUseId: 'toolu_google',
      verification: expect.objectContaining({
        url: captchaResult.data.url,
        engine: 'Google',
      }),
    })
    expect((result.data as { error: string }).error).toContain('verification_resolution="verified"')
  })

  test('automatically resumes the same paused Playwright call after the user completes verification', async () => {
    const resumedInputs: unknown[] = []
    const result = await coordinateExpertBrowserVerification({
      toolName: 'Playwright',
      result: {
        data: {
          ...captchaResult.data,
          accessLimited: true,
          steps: [{ index: 0, type: 'navigate', outcome: 'success', url: captchaResult.data.url }],
        },
      },
      input: {
        visible: true,
        actions: [
          { type: 'navigate', url: captchaResult.data.url },
          { type: 'wait_for_load_state', state: 'domcontentloaded' },
          { type: 'extract', selector: 'body' },
          { type: 'navigate', url: 'https://example.com/should-not-run-first' },
        ],
      },
      resume: async (input) => {
        resumedInputs.push(input)
        return {
          data: {
            url: captchaResult.data.url,
            title: 'Google results',
            text: 'verified result body',
            accessLimited: false,
            steps: [
              { index: 0, type: 'wait_for_load_state', outcome: 'success', url: captchaResult.data.url },
              { index: 1, type: 'extract', outcome: 'success', url: captchaResult.data.url },
            ],
          },
        }
      },
      env: enabledEnv,
      fetchImpl: async () => Response.json({ resolution: 'verification_completed' }),
    })

    expect(resumedInputs).toEqual([{
      visible: true,
      verification_resolution: 'verified',
      actions: [
        { type: 'wait_for_load_state', state: 'domcontentloaded' },
        { type: 'extract', selector: 'body' },
      ],
    }])
    expect(result.data).toEqual(expect.objectContaining({
      accessLimited: false,
      text: 'verified result body',
      steps: [
        expect.objectContaining({ index: 0, type: 'navigate' }),
        expect.objectContaining({ index: 1, type: 'wait_for_load_state' }),
        expect.objectContaining({ index: 2, type: 'extract' }),
      ],
    }))
  })

  test('rejoins the same displayed verification after a transient handoff timeout, then resumes the paused browser actions', async () => {
    const requestBodies: Array<Record<string, unknown>> = []
    const resumedInputs: unknown[] = []
    const deliveries: Array<{ requestId: string; toolUseId?: string }> = []
    let service: ExpertHumanVerificationService
    let owner: Promise<unknown> | undefined
    service = new ExpertHumanVerificationService((_sessionId, message) => {
      deliveries.push({ requestId: message.requestId, ...(message.toolUseId ? { toolUseId: message.toolUseId } : {}) })
      return true
    })

    const result = await coordinateExpertBrowserVerification({
      toolName: 'Playwright',
      result: {
        data: {
          ...captchaResult.data,
          accessLimited: true,
          steps: [{ index: 0, type: 'navigate', outcome: 'success', url: captchaResult.data.url }],
        },
      },
      agentId: 'agent-seo',
      toolUseId: 'toolu_google',
      input: {
        visible: true,
        actions: [
          { type: 'navigate', url: captchaResult.data.url },
          { type: 'wait_for_load_state', state: 'domcontentloaded' },
          { type: 'extract', selector: 'body' },
        ],
      },
      resume: async (input) => {
        resumedInputs.push(input)
        return {
          data: {
            url: captchaResult.data.url,
            title: 'Google results',
            text: 'resumed after a handoff reconnect',
            accessLimited: false,
            steps: [
              { index: 0, type: 'wait_for_load_state', outcome: 'success', url: captchaResult.data.url },
              { index: 1, type: 'extract', outcome: 'success', url: captchaResult.data.url },
            ],
          },
        }
      },
      env: enabledEnv,
      fetchImpl: async (_input, init) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
        requestBodies.push(body)
        if (requestBodies.length === 1) {
          owner = service.requestVerification({
            sessionId: String(body.sessionId),
            agentId: String(body.agentId),
            toolUseId: String(body.toolUseId),
            verification: body.verification as Parameters<ExpertHumanVerificationService['requestVerification']>[0]['verification'],
          })
          throw new Error('The operation timed out.')
        }

        expect(body).toEqual({
          sessionId: 'expert-session',
          agentId: 'agent-seo',
          toolUseId: 'toolu_google',
          joinExisting: true,
        })
        const joined = service.waitForActiveVerification('expert-session')
        expect(deliveries).toEqual([{ requestId: expect.any(String), toolUseId: 'toolu_google' }])
        expect(service.resolveVerification(deliveries[0]!.requestId, true, {
          verificationResolution: 'verification_completed',
        })).toBe(true)
        return Response.json(await joined)
      },
    })

    await expect(owner).resolves.toEqual(expect.objectContaining({ resolution: 'verification_completed' }))
    expect(requestBodies).toHaveLength(2)
    expect(requestBodies[0]).toEqual(expect.objectContaining({
      sessionId: 'expert-session',
      verification: expect.objectContaining({ url: captchaResult.data.url }),
    }))
    expect(resumedInputs).toEqual([{
      visible: true,
      verification_resolution: 'verified',
      actions: [
        { type: 'wait_for_load_state', state: 'domcontentloaded' },
        { type: 'extract', selector: 'body' },
      ],
    }])
    expect(result.data).toEqual(expect.objectContaining({
      text: 'resumed after a handoff reconnect',
      accessLimited: false,
    }))
  })

  test('joins an already-visible verification instead of exposing PENDING to the model or opening another modal', async () => {
    const requests: Request[] = []
    const result = await coordinateExpertBrowserVerification({
      toolName: 'Playwright',
      result: pendingCaptchaResult,
      agentId: 'agent-demand',
      toolUseId: 'toolu_baidu',
      env: enabledEnv,
      fetchImpl: async (input, init) => {
        requests.push(new Request(input, init))
        return Response.json({ resolution: 'switch_public_entry' })
      },
    })

    expect(requests).toHaveLength(1)
    await expect(requests[0]!.json()).resolves.toEqual({
      sessionId: 'expert-session',
      agentId: 'agent-demand',
      toolUseId: 'toolu_baidu',
      joinExisting: true,
    })
    const error = (result.data as { error: string }).error
    expect(error).toContain('EXPERT_HUMAN_VERIFICATION_SWITCH_PUBLIC_ENTRY')
    expect(error).not.toContain('EXPERT_HUMAN_VERIFICATION_PENDING')
  })

  test('tells the subagent to try another configured entry after an explicit refusal', async () => {
    const result = await coordinateExpertBrowserVerification({
      toolName: 'Playwright',
      result: captchaResult,
      env: enabledEnv,
      fetchImpl: async () => Response.json({ resolution: 'switch_public_entry' }),
    })

    const error = (result.data as { error: string }).error
    expect(error).toContain('EXPERT_HUMAN_VERIFICATION_SWITCH_PUBLIC_ENTRY')
    expect(error).toContain('Do not mark the overall field as an evidence gap yet')
    expect(error).toContain('verification_resolution="switch_public_entry"')
  })
  test('automatically uses the next package-declared public search entry after an explicit refusal', async () => {
    const resumedInputs: unknown[] = []
    const result = await coordinateExpertBrowserVerification({
      toolName: 'Playwright',
      result: {
        data: {
          ...captchaResult.data,
          steps: [{ index: 0, type: 'navigate', outcome: 'success', url: captchaResult.data.url }],
        },
      },
      input: {
        visible: true,
        include_screenshot: false,
        actions: [
          { type: 'navigate', url: captchaResult.data.url },
          { type: 'extract', selector: 'body' },
        ],
      },
      resume: async (input) => {
        resumedInputs.push(input)
        return {
          data: {
            url: 'https://www.baidu.com/s?wd=mac%20markdown%20reader',
            title: 'Baidu results',
            text: 'fallback result body',
            accessLimited: false,
            steps: [
              { index: 0, type: 'navigate', outcome: 'success', url: 'https://www.baidu.com/s?wd=mac%20markdown%20reader' },
              { index: 1, type: 'wait_for_load_state', outcome: 'success', url: 'https://www.baidu.com/s?wd=mac%20markdown%20reader' },
              { index: 2, type: 'extract', outcome: 'success', url: 'https://www.baidu.com/s?wd=mac%20markdown%20reader' },
            ],
          },
        }
      },
      env: {
        ...enabledEnv,
        CC_JIANGXIA_EXPERT_BROWSER_VERIFICATION_FALLBACK_ENGINES: JSON.stringify(['Google', '百度', 'Bing', '360']),
      },
      fetchImpl: async () => Response.json({ resolution: 'switch_public_entry' }),
    })

    expect(resumedInputs).toEqual([{
      visible: true,
      include_screenshot: false,
      verification_resolution: 'switch_public_entry',
      actions: [
        { type: 'navigate', url: 'https://www.baidu.com/s?wd=mac%20markdown%20reader' },
        { type: 'wait_for_load_state', state: 'domcontentloaded' },
        { type: 'extract', selector: 'body' },
      ],
    }])
    expect(result.data).toEqual(expect.objectContaining({
      text: 'fallback result body',
      accessLimited: false,
      steps: expect.arrayContaining([
        expect.objectContaining({ index: 0, type: 'navigate', url: captchaResult.data.url }),
        expect.objectContaining({ index: 1, type: 'navigate', url: 'https://www.baidu.com/s?wd=mac%20markdown%20reader' }),
      ]),
    }))
  })

  test('opens another dedicated handoff if the automatic same-page continuation still reaches verification', async () => {
    const resumedInputs: unknown[] = []
    let handoffRequests = 0
    const result = await coordinateExpertBrowserVerification({
      toolName: 'Playwright',
      result: {
        data: {
          ...captchaResult.data,
          steps: [{ index: 0, type: 'navigate', outcome: 'success', url: captchaResult.data.url }],
        },
      },
      input: {
        visible: true,
        actions: [
          { type: 'navigate', url: captchaResult.data.url },
          { type: 'wait_for_load_state', state: 'domcontentloaded' },
          { type: 'extract', selector: 'body' },
        ],
      },
      resume: async (input) => {
        resumedInputs.push(input)
        if (resumedInputs.length === 1) {
          return {
            data: {
              ...captchaResult.data,
              steps: [
                { index: 0, type: 'wait_for_load_state', outcome: 'success', url: captchaResult.data.url },
                { index: 1, type: 'extract', outcome: 'success', url: captchaResult.data.url },
              ],
            },
          }
        }
        return {
          data: {
            url: 'https://www.google.com/search?q=mac+markdown+reader',
            title: 'Google results',
            text: 'verified after second handoff',
            accessLimited: false,
            steps: [
              { index: 0, type: 'wait_for_load_state', outcome: 'success', url: 'https://www.google.com/search?q=mac+markdown+reader' },
              { index: 1, type: 'extract', outcome: 'success', url: 'https://www.google.com/search?q=mac+markdown+reader' },
            ],
          },
        }
      },
      env: enabledEnv,
      fetchImpl: async () => {
        handoffRequests += 1
        return Response.json({ resolution: 'verification_completed' })
      },
    })

    expect(handoffRequests).toBe(2)
    expect(resumedInputs).toEqual([
      expect.objectContaining({
        verification_resolution: 'verified',
        actions: [
          { type: 'wait_for_load_state', state: 'domcontentloaded' },
          { type: 'extract', selector: 'body' },
        ],
      }),
      expect.objectContaining({
        verification_resolution: 'verified',
        actions: [
          { type: 'wait_for_load_state', state: 'domcontentloaded' },
          { type: 'extract', selector: 'body' },
        ],
      }),
    ])
    expect(result.data).toEqual(expect.objectContaining({ text: 'verified after second handoff', accessLimited: false }))
  })

  test('releases the preserved page automatically when the user explicitly records an evidence gap', async () => {
    const resumedInputs: unknown[] = []
    const result = await coordinateExpertBrowserVerification({
      toolName: 'Playwright',
      result: captchaResult,
      input: {
        visible: true,
        actions: [{ type: 'navigate', url: captchaResult.data.url }],
      },
      resume: async (input) => {
        resumedInputs.push(input)
        return {
          data: {
            ...captchaResult.data,
            error: 'EXPERT_HUMAN_VERIFICATION_RECORDED_AS_GAP: user declined',
            steps: [],
          },
        }
      },
      env: enabledEnv,
      fetchImpl: async () => Response.json({ resolution: 'record_evidence_gap' }),
    })

    expect(resumedInputs).toEqual([{
      visible: true,
      actions: [],
      verification_resolution: 'record_evidence_gap',
    }])
    expect((result.data as { error: string }).error).toContain('EXPERT_HUMAN_VERIFICATION_RECORDED_AS_GAP')
  })

})
