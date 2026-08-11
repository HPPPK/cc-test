import { describe, expect, test } from 'bun:test'
import { normalizeLocalCdpEndpoint, resolveExpertResearchBrowserConnection, resolveExpertResearchBrowserPolicy, resolveExpertResearchBrowserPresentation } from './expertResearchBrowserPolicyService.js'

describe('resolveExpertResearchBrowserPolicy', () => {
  test('preserves legacy Expert behavior when a pack does not opt in', () => {
    expect(resolveExpertResearchBrowserPolicy('{"templateFieldGuide":{}}')).toBeUndefined()
  })

  test('reads a package-declared shared Playwright browser policy without an Expert ID special case', () => {
    expect(resolveExpertResearchBrowserPolicy(JSON.stringify({
      researchBrowser: { sharePlaywrightSessionAcrossAgents: true },
    }))).toEqual({ sharePlaywrightSessionAcrossAgents: true })
  })

  test('reads the optional user-authorized CDP and visible-browser declarations', () => {
    expect(resolveExpertResearchBrowserPolicy(JSON.stringify({
      researchBrowser: {
        sharePlaywrightSessionAcrossAgents: true,
        allowUserAuthorizedCdp: true,
        forceVisiblePlaywright: true,
      },
    }))).toEqual({
      sharePlaywrightSessionAcrossAgents: true,
      allowUserAuthorizedCdp: true,
      forceVisiblePlaywright: true,
    })
  })

  test('reads Desktop verification handoff, delegated-Ask isolation, and agent cleanup only when a package opts in', () => {
    expect(resolveExpertResearchBrowserPolicy(JSON.stringify({
      researchBrowser: {
        sharePlaywrightSessionAcrossAgents: true,
        forceVisiblePlaywright: true,
        desktopHumanVerificationHandoff: true,
        closePlaywrightWhenAgentDone: true,
        forbidSubagentAskUserQuestion: true,
      },
    }))).toEqual({
      sharePlaywrightSessionAcrossAgents: true,
      forceVisiblePlaywright: true,
      desktopHumanVerificationHandoff: true,
      closePlaywrightWhenAgentDone: true,
      forbidSubagentAskUserQuestion: true,
    })
  })

  test('rejects malformed package browser policies before they can affect a session', () => {
    expect(() => resolveExpertResearchBrowserPolicy(JSON.stringify({
      researchBrowser: { sharePlaywrightSessionAcrossAgents: 'yes' },
    }))).toThrow('researchBrowser.sharePlaywrightSessionAcrossAgents 必须是布尔值')
    expect(() => resolveExpertResearchBrowserPolicy(JSON.stringify({
      researchBrowser: { sharePlaywrightSessionAcrossAgents: true, allowUserAuthorizedCdp: 'yes' },
    }))).toThrow('researchBrowser.allowUserAuthorizedCdp 必须是布尔值')
    expect(() => resolveExpertResearchBrowserPolicy(JSON.stringify({
      researchBrowser: { sharePlaywrightSessionAcrossAgents: true, desktopHumanVerificationHandoff: 'yes' },
    }))).toThrow('researchBrowser.desktopHumanVerificationHandoff 必须是布尔值')
    expect(() => resolveExpertResearchBrowserPolicy(JSON.stringify({
      researchBrowser: { sharePlaywrightSessionAcrossAgents: true, closePlaywrightWhenAgentDone: 'yes' },
    }))).toThrow('researchBrowser.closePlaywrightWhenAgentDone 必须是布尔值')
    expect(() => resolveExpertResearchBrowserPolicy(JSON.stringify({
      researchBrowser: { sharePlaywrightSessionAcrossAgents: true, forbidSubagentAskUserQuestion: 'yes' },
    }))).toThrow('researchBrowser.forbidSubagentAskUserQuestion 必须是布尔值')
  })

  test('reads ordered public search fallbacks only from the package browser policy', () => {
    expect(resolveExpertResearchBrowserPolicy(JSON.stringify({
      researchBrowser: {
        sharePlaywrightSessionAcrossAgents: false,
        desktopHumanVerificationHandoff: true,
        verificationFallbackSearchEngines: ['Google', '百度', 'Bing', '360', 'Google'],
      },
    }))).toEqual({
      sharePlaywrightSessionAcrossAgents: false,
      desktopHumanVerificationHandoff: true,
      verificationFallbackSearchEngines: ['Google', '百度', 'Bing', '360'],
    })
  })

  test('rejects unknown or empty package-declared fallback search entries', () => {
    expect(() => resolveExpertResearchBrowserPolicy(JSON.stringify({
      researchBrowser: {
        sharePlaywrightSessionAcrossAgents: true,
        verificationFallbackSearchEngines: ['Google', 'DuckDuckGo'],
      },
    }))).toThrow('researchBrowser.verificationFallbackSearchEngines')
    expect(() => resolveExpertResearchBrowserPolicy(JSON.stringify({
      researchBrowser: {
        sharePlaywrightSessionAcrossAgents: true,
        verificationFallbackSearchEngines: [],
      },
    }))).toThrow('researchBrowser.verificationFallbackSearchEngines')
  })

  test('accepts only an explicitly authorized loopback CDP endpoint from an opted-in package', () => {
    const policy = { sharePlaywrightSessionAcrossAgents: true, allowUserAuthorizedCdp: true }
    expect(resolveExpertResearchBrowserConnection(policy, {
      kind: 'cdp',
      browser: 'chrome',
      endpoint: 'http://localhost:9222/',
      userAuthorized: true,
    }, '2026-08-04T00:00:00.000Z')).toEqual({
      kind: 'cdp',
      browser: 'chrome',
      endpoint: 'http://localhost:9222',
      userAuthorizedAt: '2026-08-04T00:00:00.000Z',
    })
    expect(normalizeLocalCdpEndpoint('http://127.0.0.1:9333')).toBe('http://127.0.0.1:9333')
  })

  test('rejects unapproved, remote, credentialed, and incomplete CDP connections', () => {
    const policy = { sharePlaywrightSessionAcrossAgents: true, allowUserAuthorizedCdp: true }
    expect(() => resolveExpertResearchBrowserConnection(undefined, { kind: 'cdp', browser: 'edge', endpoint: 'http://127.0.0.1:9222', userAuthorized: true }, '2026-08-04T00:00:00.000Z')).toThrow('没有声明')
    expect(() => resolveExpertResearchBrowserConnection(policy, { kind: 'cdp', browser: 'edge', endpoint: 'http://127.0.0.1:9222', userAuthorized: false }, '2026-08-04T00:00:00.000Z')).toThrow('请先确认')
    expect(() => normalizeLocalCdpEndpoint('http://example.com:9222')).toThrow('只允许连接本机')
    expect(() => normalizeLocalCdpEndpoint('http://user:pass@127.0.0.1:9222')).toThrow('无账号密码')
    expect(() => normalizeLocalCdpEndpoint('http://127.0.0.1')).toThrow('必须包含有效端口')
  })

  test('uses an assistable background default only for packages that explicitly opt in, while retaining legacy visible compatibility', () => {
    const current = resolveExpertResearchBrowserPolicy(JSON.stringify({
      researchBrowser: {
        sharePlaywrightSessionAcrossAgents: false,
        managedPresentationDefault: 'assistable_background',
        allowManagedPresentationChoice: true,
      },
    }))
    const legacy = resolveExpertResearchBrowserPolicy(JSON.stringify({
      researchBrowser: {
        sharePlaywrightSessionAcrossAgents: false,
        forceVisiblePlaywright: true,
      },
    }))

    expect(current).toMatchObject({
      managedPresentationDefault: 'assistable_background',
      allowManagedPresentationChoice: true,
    })
    expect(resolveExpertResearchBrowserPresentation(current, undefined, undefined)).toBe('assistable_background')
    expect(resolveExpertResearchBrowserPresentation(current, undefined, 'always_visible')).toBe('always_visible')
    expect(resolveExpertResearchBrowserPresentation(current, { kind: 'cdp', browser: 'chrome', endpoint: 'http://127.0.0.1:9222', userAuthorizedAt: '2026-08-07T00:00:00.000Z' }, 'always_visible')).toBeUndefined()
    expect(resolveExpertResearchBrowserPresentation(legacy, undefined, undefined)).toBe('always_visible')
  })

  test('rejects an invalid package-owned managed presentation instead of changing ordinary browser behavior', () => {
    expect(() => resolveExpertResearchBrowserPolicy(JSON.stringify({
      researchBrowser: {
        sharePlaywrightSessionAcrossAgents: false,
        managedPresentationDefault: 'headless',
      },
    }))).toThrow('managedPresentationDefault')
  })
})