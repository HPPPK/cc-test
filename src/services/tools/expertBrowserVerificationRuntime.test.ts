import { PlaywrightTool } from '../../tools/PlaywrightTool/PlaywrightTool.js'
import type { BrowserDiagnostics } from '../../tools/PlaywrightTool/browserDiagnostics.js'
import { withFetchPreconnect } from "../../server/__tests__/fixtureAssertions.js"
import { describe, expect, test } from 'bun:test'
import { buildExpertFallbackPlaywrightContinuation, buildExpertVerifiedPlaywrightContinuation, coordinateExpertBrowserVerification } from './expertBrowserVerificationRuntime.js'
import { ExpertHumanVerificationService } from '../../server/services/expertHumanVerificationService.js'


// Partial browser responses represent both the paused error and resumed page.
type VerificationFixtureData = {
  url?: string
  title?: string
  text?: string
  error?: string
  accessLimited?: boolean
  verificationGateId?: string
  sharedHumanVerificationBlocked?: boolean
  links?: Array<{ text: string; url: string }>
  steps?: Array<{ index: number; type: string; outcome: string; url?: string; error?: string }>
}

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
  test('preserves the original diagnostic snapshot in final history and ledger after verified and fallback continuations', async () => {
    const browserDiagnostics: BrowserDiagnostics = { observation: 'unactionable', observedAt: '2026-11-11T00:00:00Z', readyState: 'complete', widgetCount: 0, visibleControlCount: 0, inspectedFrames: 1, inspectionIncomplete: false, mainDocumentStatus: 429, events: [{ kind: 'requestfailed', resource: 'verification', code: 'ERR_BLOCKED_BY_CLIENT' }], droppedEvents: 0 }
    type Output = Parameters<typeof PlaywrightTool.mapToolResultToToolResultBlockParam>[0]
    for (const resolution of ['verification_completed', 'switch_public_entry'] as const) {
      const initial: Output = { ...captchaResult.data, text: '', links: [], durationMs: 1, truncated: false, accessLimited: true, browserDiagnostics, steps: [{ index: 0, type: 'navigate', outcome: 'success', url: captchaResult.data.url }] }
      const resumed: Output = { url: 'https://www.baidu.com/s?wd=mac+markdown+reader', title: 'Public results', text: 'Public evidence', links: [], steps: [{ index: 0, type: 'extract', outcome: 'success', url: 'https://www.baidu.com/s?wd=mac+markdown+reader' }], durationMs: 1, truncated: false, accessLimited: false }
      const result = await coordinateExpertBrowserVerification({
        toolName: 'Playwright', result: { data: initial },
        input: { actions: [{ type: 'navigate', url: captchaResult.data.url }, { type: 'extract' }] },
        resume: async () => ({ data: resumed }),
        env: { ...enabledEnv, CC_JIANGXIA_EXPERT_BROWSER_VERIFICATION_FALLBACK_ENGINES: JSON.stringify(['Google', '百度']) },
        fetchImpl: withFetchPreconnect(async () => Response.json({ resolution })),
      })
      expect(result.data.accessLimited).toBe(false)
      expect(result.data.browserDiagnostics).toBeUndefined()
      expect(result.data.verificationHistory).toEqual([expect.objectContaining({ browserDiagnostics })])
      const mapped = PlaywrightTool.mapToolResultToToolResultBlockParam(result.data, 'toolu-diagnostic-history')
      const encoded = String(mapped.content).match(/<playwright-action-ledger encoding="base64">([A-Za-z0-9+/=]+)<\/playwright-action-ledger>/)?.[1]
      const history = JSON.parse(Buffer.from(encoded!, 'base64').toString('utf8')).verificationHistory
      expect(history[0].browserDiagnostics).toEqual(browserDiagnostics)
      expect(JSON.stringify(history[0].browserDiagnostics)).not.toMatch(/https:|cookie|token|secret/)
    }
  })

  test('exposes the current released state before historical Google errors, and a later real gate remains pending', async () => {
    type Output = Parameters<typeof PlaywrightTool.mapToolResultToToolResultBlockParam>[0]
    const result = await coordinateExpertBrowserVerification({
      toolName: 'Playwright', result: { data: { ...captchaResult.data, text: '', accessLimited: true } },
      input: { actions: [{ type: 'navigate', url: captchaResult.data.url }, { type: 'extract' }] },
      resume: async () => ({ data: { url: 'https://www.baidu.com/s?wd=photo', text: 'saved public text', accessLimited: false } }),
      env: { ...enabledEnv, CC_JIANGXIA_EXPERT_BROWSER_VERIFICATION_FALLBACK_ENGINES: '["Google","百度"]' },
      fetchImpl: withFetchPreconnect(async () => Response.json({ resolution: 'switch_public_entry' })),
    })
    const output = { title: '', links: [], durationMs: 1, truncated: false, steps: [], ...result.data } as Output
    const mapped = PlaywrightTool.mapToolResultToToolResultBlockParam(output, 'released-call')
    const content = String(mapped.content)
    expect(content).toContain('Current human verification: released; requiresUserAction=false')
    expect(content.indexOf('requiresUserAction=false')).toBeLessThan(content.indexOf('<playwright-action-ledger'))
    const ledger = JSON.parse(Buffer.from(content.match(/encoding="base64">([^<]+)/)![1], 'base64').toString())
    expect(ledger.currentHumanVerification).toEqual({ state: 'released', requiresUserAction: false })
    expect(ledger.verificationHistory[0].detail).toContain('EXPERT_HUMAN_VERIFICATION_REQUIRED')
    const pending = String(PlaywrightTool.mapToolResultToToolResultBlockParam({ ...output, ...pendingCaptchaResult.data, accessLimited: true }, 'new-gate').content)
    expect(pending).toContain('Current human verification: pending; requiresUserAction=true')
    expect(pending).not.toContain('Current human verification: released')
  })

  test('marks only runtime-owned no-control observations in the existing handoff detail', async () => {
    for (const observation of ['unactionable', 'loading', 'unknown', 'actionable']) {
      let postedDetail: unknown
      await coordinateExpertBrowserVerification({
        toolName: 'Playwright',
        result: { data: { ...captchaResult.data, browserDiagnostics: { observation } } },
        input: { browserDiagnostics: { observation: 'unactionable' } },
        env: enabledEnv,
        fetchImpl: withFetchPreconnect(async (_input, init) => {
          postedDetail = JSON.parse(String(init?.body)).verification.detail
          return Response.json({ resolution: 'record_evidence_gap' })
        }),
      })
      expect(typeof postedDetail).toBe('string')
      expect(String(postedDetail).includes('VERIFICATION_CONTROLS_NOT_OBSERVED')).toBe(observation === 'unactionable')
      expect(postedDetail).toContain(captchaResult.data.error)
    }
  })

  test('retries the first failed original action before continuing extraction', () => {
    expect(buildExpertVerifiedPlaywrightContinuation({
      visible: true,
      actions: [
        { type: 'navigate', url: 'https://www.baidu.com/' },
        { type: 'fill', selector: 'input#kw:visible', text: 'markdown reader' },
        { type: 'press', selector: 'input#kw:visible', key: 'Enter' },
        { type: 'extract', selector: 'body' },
      ],
    }, {
      steps: [
        { index: 0, type: 'navigate', outcome: 'success', url: 'https://www.baidu.com/' },
        { index: 1, type: 'fill', outcome: 'failed', url: 'https://www.baidu.com/', detail: 'Timeout 35000ms exceeded.' },
      ],
    })).toEqual({
      visible: true,
      verification_resolution: 'verified',
      actions: [
        { type: 'fill', selector: 'input#kw:visible', text: 'markdown reader' },
        { type: 'press', selector: 'input#kw:visible', key: 'Enter' },
        { type: 'extract', selector: 'body' },
      ],
    })
  })

  test('leaves ordinary Playwright results untouched outside a package-scoped Expert handoff', async () => {
    const fetchImpl = async () => { throw new Error('must not fetch') }
    await expect(coordinateExpertBrowserVerification<VerificationFixtureData>({
      toolName: 'Playwright',
      result: captchaResult,
      env: {},
      fetchImpl: withFetchPreconnect(fetchImpl),
    })).resolves.toBe(captchaResult)
  })

  test('sends a server-generated verification context and returns same-page continuation guidance', async () => {
    const requests: Request[] = []
    const result = await coordinateExpertBrowserVerification<VerificationFixtureData>({
      toolName: 'Playwright',
      result: captchaResult,
      agentId: 'agent-seo',
      toolUseId: 'toolu_google',
      env: enabledEnv,
      fetchImpl: withFetchPreconnect(async (input, init) => {
        expect(init?.signal).toBeUndefined()
        requests.push(new Request(input, init))
        return Response.json({ resolution: 'verification_completed' })
      }),
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
    const result = await coordinateExpertBrowserVerification<VerificationFixtureData>({
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
      fetchImpl: withFetchPreconnect(async () => Response.json({ resolution: 'verification_completed' })),
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
      if (message.type === 'permission_request') {
        deliveries.push({ requestId: message.requestId, ...(message.toolUseId ? { toolUseId: message.toolUseId } : {}) })
      }
      return true
    })

    const result = await coordinateExpertBrowserVerification<VerificationFixtureData>({
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
      fetchImpl: withFetchPreconnect(async (_input, init) => {
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
      }),
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

  test('retries a sibling agent original action unchanged after the shared browser owner resolves verification', async () => {
    const requests: Request[] = []
    const resumedInputs: unknown[] = []
    const originalInput = {
      visible: true,
      actions: [
        { type: 'navigate', url: 'https://www.bing.com/search?q=old+photo+repair' },
        { type: 'wait_for_load_state', state: 'domcontentloaded' },
        { type: 'extract', selector: 'body' },
      ],
    }

    const result = await coordinateExpertBrowserVerification<VerificationFixtureData>({
      toolName: 'Playwright',
      result: {
        data: {
          url: 'https://www.bing.com/search?q=old+photo+repair',
          title: '',
          text: '',
          links: [],
          accessLimited: true,
          verificationGateId: 'gate-shared-owner',
          sharedHumanVerificationBlocked: true,
          error: 'EXPERT_HUMAN_VERIFICATION_PENDING: another research worker owns the shared browser verification page',
          steps: [],
        },
      },
      input: originalInput,
      resume: async (input) => {
        resumedInputs.push(input)
        return {
          data: {
            url: 'https://www.bing.com/search?q=old+photo+repair',
            title: 'Bing results',
            text: 'sibling result after owner verification',
            accessLimited: false,
            steps: [
              { index: 0, type: 'navigate', outcome: 'success', url: 'https://www.bing.com/search?q=old+photo+repair' },
              { index: 1, type: 'extract', outcome: 'success', url: 'https://www.bing.com/search?q=old+photo+repair' },
            ],
          },
        }
      },
      env: enabledEnv,
      fetchImpl: withFetchPreconnect(async (input, init) => {
        requests.push(new Request(input, init))
        return Response.json({ resolution: 'verification_completed' })
      }),
    })

    await expect(requests[0]!.json()).resolves.toEqual({
      sessionId: 'expert-session',
      verificationGateId: 'gate-shared-owner',
      joinExisting: true,
    })
    expect(resumedInputs).toEqual([{
      ...originalInput,
      verification_resolution: 'verified',
    }])
    expect(result.data).toMatchObject({
      accessLimited: false,
      text: 'sibling result after owner verification',
    })
  })
  test('joins an already-visible verification instead of exposing PENDING to the model or opening another modal', async () => {
    const requests: Request[] = []
    const result = await coordinateExpertBrowserVerification<VerificationFixtureData>({
      toolName: 'Playwright',
      result: pendingCaptchaResult,
      agentId: 'agent-demand',
      toolUseId: 'toolu_baidu',
      env: enabledEnv,
      fetchImpl: withFetchPreconnect(async (input, init) => {
        requests.push(new Request(input, init))
        return Response.json({ resolution: 'switch_public_entry' })
      }),
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
    const result = await coordinateExpertBrowserVerification<VerificationFixtureData>({
      toolName: 'Playwright',
      result: captchaResult,
      env: enabledEnv,
      fetchImpl: withFetchPreconnect(async () => Response.json({ resolution: 'switch_public_entry' })),
    })

    const error = (result.data as { error: string }).error
    expect(error).toContain('EXPERT_HUMAN_VERIFICATION_SWITCH_PUBLIC_ENTRY')
    expect(error).toContain('Do not mark the overall field as an evidence gap yet')
    expect(error).toContain('verification_resolution="switch_public_entry"')
  })
  test('automatically uses the next package-declared public search entry after an explicit refusal', async () => {
    const resumedInputs: unknown[] = []
    const result = await coordinateExpertBrowserVerification<VerificationFixtureData>({
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
      fetchImpl: withFetchPreconnect(async () => Response.json({ resolution: 'switch_public_entry' })),
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
      verificationHistory: [
        expect.objectContaining({ stepIndex: 0, url: captchaResult.data.url }),
      ],
      steps: expect.arrayContaining([
        expect.objectContaining({ index: 0, type: 'navigate', url: captchaResult.data.url }),
        expect.objectContaining({ index: 1, type: 'navigate', url: 'https://www.baidu.com/s?wd=mac%20markdown%20reader' }),
      ]),
    }))
  })

  test('keeps the original search query when a verification URL contains a provider challenge token', () => {
    const fallback = buildExpertFallbackPlaywrightContinuation(
      {
        visible: true,
        actions: [
          { type: 'navigate', url: 'https://www.google.com/search?q=restore%20old%20family%20photos' },
          { type: 'extract', selector: 'body' },
        ],
      },
      {
        url: 'https://www.google.com/sorry/index?continue=https%3A%2F%2Fwww.google.com%2Fsearch%3Fq%3Drestore%2520old%2520family%2520photos&q=EgRoHPdE-provider-challenge-token',
        title: 'Google verification',
        error: 'EXPERT_HUMAN_VERIFICATION_REQUIRED: Google security verification',
      },
      ['Google', '百度', 'Bing', '360'],
      new Set<never>(),
    )

    expect(fallback).toEqual({
      engine: '百度',
      input: expect.objectContaining({
        verification_resolution: 'switch_public_entry',
        actions: [
          { type: 'navigate', url: 'https://www.baidu.com/s?wd=restore%20old%20family%20photos' },
          { type: 'wait_for_load_state', state: 'domcontentloaded' },
          { type: 'extract', selector: 'body' },
        ],
      }),
    })
  })

  test('derives a public-search fallback from a direct official page after the user explicitly declines verification', async () => {
    const resumedInputs: unknown[] = []
    const result = await coordinateExpertBrowserVerification<VerificationFixtureData>({
      toolName: 'Playwright',
      result: {
        data: {
          url: 'https://www.u-tools.cn/docs/guide/faq.html',
          title: 'uTools 文档中心 | uTools 帮助中心',
          error: 'EXPERT_HUMAN_VERIFICATION_REQUIRED: login verification at https://www.u-tools.cn/docs/guide/faq.html',
          steps: [{ index: 0, type: 'navigate', outcome: 'success', url: 'https://www.u-tools.cn/docs/guide/faq.html' }],
        },
      },
      input: {
        visible: true,
        actions: [
          { type: 'navigate', url: 'https://www.u-tools.cn/docs/guide/faq.html' },
          { type: 'extract', selector: 'body' },
        ],
      },
      resume: async (input) => {
        resumedInputs.push(input)
        return {
          data: {
            url: 'https://www.google.com/search?q=u%20tools',
            title: 'Google results',
            text: 'fallback results for uTools',
            accessLimited: false,
            steps: [
              { index: 0, type: 'navigate', outcome: 'success', url: 'https://www.google.com/search?q=u%20tools' },
              { index: 1, type: 'wait_for_load_state', outcome: 'success', url: 'https://www.google.com/search?q=u%20tools' },
              { index: 2, type: 'extract', outcome: 'success', url: 'https://www.google.com/search?q=u%20tools' },
            ],
          },
        }
      },
      env: {
        ...enabledEnv,
        CC_JIANGXIA_EXPERT_BROWSER_VERIFICATION_FALLBACK_ENGINES: JSON.stringify(['Google', '百度', 'Bing', '360']),
      },
      fetchImpl: withFetchPreconnect(async () => Response.json({ resolution: 'switch_public_entry' })),
    })

    expect(resumedInputs).toEqual([{
      visible: true,
      verification_resolution: 'switch_public_entry',
      actions: [
        { type: 'navigate', url: 'https://www.google.com/search?q=u%20tools' },
        { type: 'wait_for_load_state', state: 'domcontentloaded' },
        { type: 'extract', selector: 'body' },
      ],
    }])
    expect(result.data).toEqual(expect.objectContaining({
      text: 'fallback results for uTools',
      accessLimited: false,
    }))
  })

  test('releases a declined verification instead of leaving the task blocked when no fallback query can be recovered', async () => {
    const resumedInputs: unknown[] = []
    const result = await coordinateExpertBrowserVerification<VerificationFixtureData>({
      toolName: 'Playwright',
      result: {
        data: {
          url: 'about:blank',
          error: 'EXPERT_HUMAN_VERIFICATION_REQUIRED: verification at about:blank',
          steps: [],
        },
      },
      input: {
        visible: true,
        actions: [{ type: 'wait', ms: 20 }],
      },
      resume: async (input) => {
        resumedInputs.push(input)
        return { data: { url: 'about:blank', accessLimited: true, error: 'released', steps: [] } }
      },
      env: {
        ...enabledEnv,
        CC_JIANGXIA_EXPERT_BROWSER_VERIFICATION_FALLBACK_ENGINES: JSON.stringify(['Google', '百度']),
      },
      fetchImpl: withFetchPreconnect(async () => Response.json({ resolution: 'switch_public_entry' })),
    })

    expect(resumedInputs).toEqual([{
      visible: true,
      actions: [],
      verification_resolution: 'record_evidence_gap',
    }])
    expect((result.data as { error: string }).error).toContain('EXPERT_HUMAN_VERIFICATION_FALLBACK_UNAVAILABLE')
  })

  test('opens another dedicated handoff if the automatic same-page continuation still reaches verification', async () => {
    const resumedInputs: unknown[] = []
    let handoffRequests = 0
    const result = await coordinateExpertBrowserVerification<VerificationFixtureData>({
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
      fetchImpl: withFetchPreconnect(async () => {
        handoffRequests += 1
        return Response.json({ resolution: 'verification_completed' })
      }),
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

  test('records the detected verification kind in final access-limited diagnostics', async () => {
    const result = await coordinateExpertBrowserVerification<VerificationFixtureData>({
      toolName: 'Playwright',
      result: {
        data: {
          url: 'https://www.google.com/sorry/index?continue=https://www.google.com/search?q=mac+markdown+reader',
          title: 'Unusual traffic',
          text: 'Our systems have detected unusual traffic from your computer network.',
          accessLimited: true,
          error: 'EXPERT_HUMAN_VERIFICATION_REQUIRED: Google security verification',
          steps: [],
        },
      },
      env: enabledEnv,
      fetchImpl: withFetchPreconnect(async () => { throw new Error('Desktop handoff unavailable') }),
      accessDiagnostics: {
        connectionKind: 'managed',
        searchEngine: 'Google',
        observedAt: '2026-08-13T12:30:00.000Z',
        pacingWaitedMs: 3000,
      },
    })

    expect(result.data).toEqual(expect.objectContaining({
      accessLimited: true,
      accessDiagnostics: expect.objectContaining({
        connectionKind: 'managed',
        searchEngine: 'Google',
        pacingWaitedMs: 3000,
        verificationKind: 'Google security verification',
      }),
    }))
  })

  test('releases the preserved page automatically when the user explicitly records an evidence gap', async () => {
    const resumedInputs: unknown[] = []
    const result = await coordinateExpertBrowserVerification<VerificationFixtureData>({
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
      fetchImpl: withFetchPreconnect(async () => Response.json({ resolution: 'record_evidence_gap' })),
    })

    expect(resumedInputs).toEqual([{
      visible: true,
      actions: [],
      verification_resolution: 'record_evidence_gap',
    }])
    expect((result.data as { error: string }).error).toContain('EXPERT_HUMAN_VERIFICATION_RECORDED_AS_GAP')
  })

})

test('a legacy deferred response rejoins the pending verification without releasing or resuming browser actions', async () => {
  const resumed: any[] = []
  let requests = 0
  const result = await coordinateExpertBrowserVerification<VerificationFixtureData>({ toolName: 'Playwright', result: captchaResult, env: enabledEnv,
    input: { visible: true, actions: [{ type: 'navigate', url: 'https://s.weibo.com/weibo?q=Quicker' }] },
    fetchImpl: withFetchPreconnect(async (_url, init) => {
      expect(init?.signal).toBeUndefined()
      requests += 1
      if (requests === 1) return Response.json({ resolution: 'verification_deferred' })
      expect(JSON.parse(String(init?.body)).joinExisting).toBe(true)
      expect(resumed).toHaveLength(0)
      return Response.json({ resolution: 'verification_completed' })
    }),
    resume: async input => { resumed.push(input); return { data: { url: 'https://example.com/results', title: 'Results', text: 'Public results', steps: [] } } },
  })
  expect(requests).toBe(2)
  expect(resumed).toHaveLength(1)
  expect(resumed[0].verification_resolution).toBe('verified')
  expect(result.data.text).toBe('Public results')
})

test('keeps successive replacement challenges gated until the actual page is healthy', async () => {
  let decisions = 0
  let continuations = 0
  const result = await coordinateExpertBrowserVerification<VerificationFixtureData>({
    toolName: 'Playwright', result: captchaResult, env: enabledEnv,
    input: { actions: [{ type: 'extract', selector: 'body' }] },
    fetchImpl: withFetchPreconnect(async () => { decisions += 1; return Response.json({ resolution: 'verification_completed' }) }),
    resume: async () => {
      continuations += 1
      return continuations < 10 ? captchaResult : { data: { text: 'Verified public results', url: 'https://example.com/results', steps: [] } }
    },
  })
  expect(decisions).toBe(10)
  expect(continuations).toBe(10)
  expect(result.data.text).toBe('Verified public results')
})
