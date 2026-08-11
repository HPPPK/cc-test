import { describe, expect, test } from 'bun:test'
import { PlaywrightTool, resolveExpertCdpConnection, resolveExpertManagedPlaywrightPresentation, resolvePlaywrightSessionKey, shouldPreserveExpertHumanVerificationPage } from './PlaywrightTool.js'

describe('PlaywrightTool', () => {
  test('exposes explicit observable actions rather than a research query or retry black box', () => {
    const schema = PlaywrightTool.inputSchema
    const value = schema.parse({ actions: [{ type: 'navigate', url: 'https://example.com' }, { type: 'extract' }] })
    expect(value.visible).toBe(true)
    expect(value.slow_mo_ms).toBe(350)
    expect(Object.keys(value)).toEqual(['actions', 'visible', 'slow_mo_ms', 'include_screenshot'])
  })

  test('places the compact machine-readable action ledger before large page text', () => {
    const result = PlaywrightTool.mapToolResultToToolResultBlockParam({
      url: 'https://example.com/pricing',
      title: 'Example pricing',
      text: 'x'.repeat(40_000),
      links: [],
      durationMs: 12,
      accessLimited: false,
      truncated: true,
      steps: [{ index: 0, type: 'navigate', outcome: 'success', url: 'https://example.com/pricing' }],
    } as never, 'toolu_large_page')
    const content = String(result.content)

    expect(content.indexOf('<playwright-action-ledger')).toBeGreaterThan(-1)
    expect(content.indexOf('<playwright-action-ledger')).toBeLessThan(content.indexOf('Rendered visible text:'))
  })

  test('accepts an Expert-only resolution after the user handles a visible verification page', () => {
    const value = PlaywrightTool.inputSchema.parse({
      actions: [{ type: 'wait', ms: 500 }, { type: 'extract', selector: 'body' }],
      verification_resolution: 'verified',
    })

    expect(value.verification_resolution).toBe('verified')
  })

  test('allows an empty action list only when the user records the paused verification path as an evidence gap', () => {
    expect(PlaywrightTool.inputSchema.parse({
      actions: [],
      verification_resolution: 'record_evidence_gap',
    }).actions).toEqual([])

    expect(() => PlaywrightTool.inputSchema.parse({ actions: [] })).toThrow('actions must contain at least one browser action')
  })

  test('returns a direct recovery instruction for unsupported action aliases', () => {
    const message = PlaywrightTool.formatInputValidationError?.({
      actions: [{ type: 'search', selector: '#kw', text: '坦克大战' }],
    })

    expect(message).toContain('actions[0].type="search"')
    expect(message).toContain('navigate, reload, go_back, go_forward')
    expect(message).toContain('type, clear, click, double_click')
    expect(message).toContain('get_attribute, get_html, count')
    expect(message).toContain('Retry this Playwright call immediately')
    expect(message).toContain('a search uses navigate')
    expect(message).toContain('Do not switch to Bash')
  })

  test('accepts the expanded normal browser action surface', () => {
    const value = PlaywrightTool.inputSchema.parse({
      actions: [
        { type: 'new_tab', url: 'https://example.com/' },
        { type: 'type', selector: '#query', text: 'research', delay_ms: 40 },
        { type: 'hover', selector: '#menu' },
        { type: 'double_click', selector: '#row' },
        { type: 'select_option', selector: '#sort', value: 'recent' },
        { type: 'check', selector: '#include-archived' },
        { type: 'drag_to', source_selector: '#source', target_selector: '#target' },
        { type: 'wait_for_selector', selector: '#results', state: 'visible' },
        { type: 'wait_for_load_state', state: 'networkidle' },
        { type: 'scroll_into_view', selector: '#footer' },
        { type: 'get_attribute', selector: '#official-link', attribute: 'href' },
        { type: 'switch_tab', tab_index: 0 },
        { type: 'list_tabs' },
        { type: 'script', script: `return { links: await page.locator('a').count() }` },
      ],
    })

    expect(value.actions).toHaveLength(14)
    expect(value.actions.map(action => action.type)).toContain('get_attribute')
    expect(value.actions.map(action => action.type)).toContain('list_tabs')
    expect(value.actions.map(action => action.type)).toContain('script')
  })

  test('derives a navigation target safely when a malformed intermediate action is present', async () => {
    const input = {
      actions: [undefined, { type: 'navigate', url: 'https://www.baidu.com/' }],
      visible: true,
      slow_mo_ms: 350,
      include_screenshot: false,
    } as never

    await expect(PlaywrightTool.description(input)).resolves.toContain('baidu.com')
    expect(PlaywrightTool.toAutoClassifierInput(input)).toBe('https://www.baidu.com/')
    await expect(PlaywrightTool.checkPermissions(input)).resolves.toMatchObject({ behavior: 'ask' })
  })

  test('returns a Promise ToolResult instead of an unconsumed async generator', () => {
    expect(PlaywrightTool.call.constructor.name).toBe('AsyncFunction')
  })

  test('directs page interactions back to Playwright instead of Computer Use', async () => {
    const prompt = await PlaywrightTool.prompt()
    expect(prompt).toContain('Consecutive Playwright calls in the same chat/session keep the same managed Chromium page')
    expect(prompt).toContain('mcp__computer-use__*')
    expect(prompt).toContain('Always pass one "actions" array')
    expect(prompt).toContain('Never send top-level "action" or "url" fields')
    const namedExample = prompt.match(/Named-action example JSON: (\{.*?\})\. Raw API/)
    expect(namedExample?.[1]).toBeDefined()
    const parsedNamedExample = JSON.parse(namedExample![1])
    expect(parsedNamedExample.visible).toBe(true)
    expect(parsedNamedExample.actions[0]).toMatchObject({ type: 'navigate', url: 'https://www.baidu.com/' })
    expect(parsedNamedExample.actions.map((action: { type: string }) => action.type)).toContain('type')
    const rawExample = prompt.match(/Raw API example: (\{.*\})\. Never/)
    expect(rawExample?.[1]).toBeDefined()
    const parsedRawExample = JSON.parse(rawExample![1])
    expect(parsedRawExample.actions[0]).toMatchObject({ type: 'script' })
    expect(parsedRawExample.actions[0].script).toContain('context.newPage')
  })

  test('accepts only loopback CDP injected for an authorized Expert session', () => {
    expect(resolveExpertCdpConnection({ CC_JIANGXIA_EXPERT_PLAYWRIGHT_CDP_ENDPOINT: 'http://127.0.0.1:9222' }).connection).toEqual({ kind: 'cdp', endpoint: 'http://127.0.0.1:9222' })
    expect(resolveExpertCdpConnection({ CC_JIANGXIA_EXPERT_PLAYWRIGHT_CDP_ENDPOINT: 'http://example.com:9222' }).error).toContain('not a permitted local CDP endpoint')
    expect(resolveExpertCdpConnection({ CC_JIANGXIA_EXPERT_PLAYWRIGHT_CDP_ENDPOINT: 'http://user:pass@127.0.0.1:9222' }).error).toContain('not a permitted local CDP endpoint')
  })

  test('keeps a visible CAPTCHA page open whenever the Expert handoff is enabled, even without browser sharing', () => {
    expect(shouldPreserveExpertHumanVerificationPage({
      CC_JIANGXIA_EXPERT_BROWSER_HUMAN_VERIFICATION_HANDOFF: '1',
    })).toBe(true)
    expect(shouldPreserveExpertHumanVerificationPage({})).toBe(false)
  })

  test('shares a browser context across agents only when an Expert session explicitly opts in', () => {
    expect(resolvePlaywrightSessionKey(
      { agentId: 'subagent-product' },
      { rootSessionId: 'conversation-1', expertSessionId: 'expert-1', shareAcrossAgents: true },
    )).toBe('expert:expert-1')

    expect(resolvePlaywrightSessionKey(
      { agentId: 'subagent-product' },
      { rootSessionId: 'conversation-1', expertSessionId: 'expert-1', shareAcrossAgents: false },
    )).toBe('conversation-1:subagent-product')

    expect(resolvePlaywrightSessionKey(
      { agentId: 'subagent-product' },
      { rootSessionId: 'conversation-1', shareAcrossAgents: true },
    )).toBe('conversation-1:subagent-product')
  })


  test('reads the managed presentation only from Expert runtime environment, never from Playwright model input', () => {
    expect(resolveExpertManagedPlaywrightPresentation({
      CC_JIANGXIA_EXPERT_MANAGED_PLAYWRIGHT_PRESENTATION: 'assistable_background',
    })).toBe('assistable_background')
    expect(resolveExpertManagedPlaywrightPresentation({
      CC_JIANGXIA_EXPERT_MANAGED_PLAYWRIGHT_PRESENTATION: 'always_visible',
    })).toBe('always_visible')
    expect(resolveExpertManagedPlaywrightPresentation({
      CC_JIANGXIA_EXPERT_MANAGED_PLAYWRIGHT_PRESENTATION: 'headless',
    })).toBeUndefined()
    expect(Object.keys(PlaywrightTool.inputSchema.parse({ actions: [{ type: 'extract', selector: 'body' }] }))).not.toContain('presentation')
  })
})
