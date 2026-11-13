import '../toolFixtures.test.js'
import { expect, test } from 'bun:test'
import type { Message } from '../../types/message.js'
import { createAssistantMessage, createUserMessage } from '../../utils/messages.js'
import { buildPlaywrightAudit } from './agentToolUtils.js'

function audit(target: string, ledger: Record<string, unknown>) {
  return buildPlaywrightAudit([
    createAssistantMessage({ content: [{ type: 'tool_use', id: 'browser-recovery', name: 'Playwright', input: {
      actions: [{ type: 'navigate', url: target }, { type: 'wait', ms: 700 }, { type: 'extract', selector: 'body' }],
    } }] }) as Message,
    createUserMessage({ content: [{ type: 'tool_result', tool_use_id: 'browser-recovery', content:
      '<playwright-action-ledger encoding="base64">' + Buffer.from(JSON.stringify(ledger)).toString('base64') + '</playwright-action-ledger>',
    }] }) as Message,
  ])
}

for (const [target, blocked] of [
  ['https://trends.google.com/trends/explore?date=today%205-y&q=middle%20mouse%20button%20shortcut', 'https://www.google.com/sorry/index'],
  ['https://www.baidu.com/s?wd=mouse%20shortcut', 'https://wappass.baidu.com/static/captcha/tuxing_v2.html'],
]) test('recovered final body supersedes the historical challenge: ' + target, () => {
  const finalUrl = target.includes('baidu') ? target + '&p_timestamp=123' : target
  const entries = audit(target, { url: finalUrl, textExtracted: true, accessLimited: false,
    verificationHistory: [{ stepIndex: 0, url: blocked, detail: 'Human verification required' }], steps: [
      { index: 0, type: 'navigate', outcome: 'success', url: blocked, title: 'Security verification' },
      { index: 1, type: 'wait', outcome: 'success', url: finalUrl, title: 'Results' },
      { index: 2, type: 'extract', outcome: 'success', url: finalUrl, detail: 'extracted text from body: Observed query content and relative data.' },
    ] })
  expect(entries).toHaveLength(1)
  expect(entries[0]).toMatchObject({ status: 'opened', finalUrl, actionTypes: ['navigate', 'wait', 'extract'] })
  expect(entries[0]!.detail).toContain('verification')
  if (target.includes('baidu')) expect(entries[0]!.searchResultStatus).toBe('results_observed')
})

test('runtime-injected fallback has its own engine, query and successful receipt', () => {
  const original = 'https://www.google.com/search?q=mouse+shortcut'
  const fallback = 'https://www.baidu.com/s?wd=mouse%20shortcut'
  const entries = audit(original, { url: fallback, textExtracted: true, accessLimited: false,
    verificationHistory: [{ stepIndex: 0, url: 'https://www.google.com/sorry/index', detail: 'Google verification' }], steps: [
      { index: 0, type: 'navigate', outcome: 'success', url: 'https://www.google.com/sorry/index' },
      { index: 1, type: 'navigate', outcome: 'success', url: fallback },
      { index: 2, type: 'wait', outcome: 'success', url: fallback },
      { index: 3, type: 'extract', outcome: 'success', url: fallback, detail: 'extracted text from body: A relevant public result.' },
    ] })
  expect(entries).toHaveLength(2)
  expect(entries[0]).toMatchObject({ searchEngine: 'Google', status: 'access_limited' })
  expect(entries[1]).toMatchObject({ searchEngine: '百度', query: 'mouse shortcut', searchUrl: fallback, finalUrl: fallback, status: 'opened', searchResultStatus: 'results_observed' })
  expect(new Set(entries.map(entry => entry.auditId)).size).toBe(2)
})

test.each([
  ['https://sspai.com/whoops?q=mouse', '少数派', '抱歉，您要查看的页面不存在或已被删除。', 'failed'],
  ['https://www.v2ex.com/?__cf_chl_rt_tk=test', 'Just a moment...', '', 'access_limited'],
])('navigation does not certify usable content for %s', (target, title, body, status) => {
  expect(audit(target, { url: target, accessLimited: false, textExtracted: Boolean(body), steps: [
    { index: 0, type: 'navigate', outcome: 'success', url: target, title },
    { index: 1, type: 'wait', outcome: 'success', url: target, title },
    { index: 2, type: 'extract', outcome: 'success', url: target, title, detail: 'extracted text from body: ' + body },
  ] })[0]).toMatchObject({ status })
})

test('a still-blocked page, failed extraction and article mentioning verification cannot create false recovery', () => {
  const target = 'https://example.com/article'
  for (const extra of [{ accessLimited: true }, { error: 'extract timed out' }, { textExtracted: false }]) {
    const rows = audit(target, { url: target, textExtracted: true, accessLimited: false, ...extra,
      verificationHistory: [{ stepIndex: 0, url: 'https://www.google.com/sorry/', detail: 'verification' }],
      steps: [{ index: 0, type: 'navigate', outcome: 'success', url: 'https://www.google.com/sorry/' }],
    })
    expect(rows[0]!.status).not.toBe('opened')
  }
  const rows = audit(target, { url: target, textExtracted: true, accessLimited: false, steps: [
    { index: 0, type: 'navigate', outcome: 'success', url: target, title: 'Why CAPTCHA pages exist' },
    { index: 1, type: 'extract', outcome: 'success', url: target, detail: 'extracted text from body: An article about 404 errors and verification.' },
  ] })
  expect(rows[0]!.status).toBe('opened')
  expect(audit(target, { url: target, textExtracted: true, accessLimited: false, steps: [
    { index: 0, type: 'navigate', outcome: 'success', url: target, title: '404 errors explained' },
    { index: 1, type: 'extract', outcome: 'success', url: target, title: '404 errors explained', detail: 'extracted text from body: A troubleshooting article, not a missing page.' },
  ] })[0]!.status).toBe('opened')
})

test('recovery in an earlier action group is not lost when the call later opens another page', () => {
  const target = 'https://trends.google.com/trends/explore?q=mouse'
  const later = 'https://example.com/product'
  const ledger = { url: later, textExtracted: true, accessLimited: false,
    verificationHistory: [{ stepIndex: 0, url: 'https://www.google.com/sorry/', detail: 'verification' }], steps: [
      { index: 0, type: 'navigate', outcome: 'success', url: 'https://www.google.com/sorry/' },
      { index: 1, type: 'extract', outcome: 'success', url: target, detail: 'extracted text from body: observed query data' },
      { index: 2, type: 'navigate', outcome: 'success', url: later },
      { index: 3, type: 'extract', outcome: 'success', url: later, detail: 'extracted text from body: product details' },
    ] }
  const input = createAssistantMessage({ content: [{ type: 'tool_use', id: 'multi-recovery', name: 'Playwright', input: { actions: [
    { type: 'navigate', url: target }, { type: 'extract', selector: 'body' },
    { type: 'navigate', url: later }, { type: 'extract', selector: 'body' },
  ] } }] }) as Message
  const output = createUserMessage({ content: [{ type: 'tool_result', tool_use_id: 'multi-recovery', content:
    '<playwright-action-ledger encoding="base64">' + Buffer.from(JSON.stringify(ledger)).toString('base64') + '</playwright-action-ledger>',
  }] }) as Message
  expect(buildPlaywrightAudit([input, output])).toEqual([
    expect.objectContaining({ target, finalUrl: target, status: 'opened' }),
    expect.objectContaining({ target: later, finalUrl: later, status: 'opened' }),
  ])
})

test('opening a search URL without obtaining its body is entry-only evidence', () => {
  const url = 'https://www.bing.com/search?q=desktop+shortcut'
  const rows = audit(url, { url, accessLimited: false, textExtracted: false,
    steps: [{ index: 0, type: 'navigate', outcome: 'success', url }],
  })
  expect(rows[0]).toMatchObject({ status: 'opened', searchResultStatus: 'entry_opened', actionTypes: ['navigate'] })
})

test('earlier extraction cannot certify recovery when the final page is still a challenge', () => {
  const target = 'https://trends.google.com/trends/explore?q=mouse'
  const blocked = 'https://www.google.com/sorry/'
  expect(audit(target, { url: blocked, textExtracted: true, accessLimited: false,
    verificationHistory: [{ stepIndex: 0, url: blocked, detail: 'verification required' }], steps: [
      { index: 0, type: 'navigate', outcome: 'success', url: blocked },
      { index: 1, type: 'extract', outcome: 'success', url: target },
      { index: 2, type: 'wait', outcome: 'success', url: blocked },
    ] })[0]!.status).toBe('access_limited')
})

test('an injected fallback does not shift the next declared page onto the wrong audit group', () => {
  const google = 'https://www.google.com/search?q=shortcut'
  const baidu = 'https://www.baidu.com/s?wd=shortcut'
  const product = 'https://example.com/product'
  const ledger = { url: product, textExtracted: true, accessLimited: false,
    verificationHistory: [{ stepIndex: 0, url: 'https://www.google.com/sorry/', detail: 'verification' }], steps: [
      { index: 0, type: 'navigate', outcome: 'success', url: 'https://www.google.com/sorry/' },
      { index: 1, type: 'navigate', outcome: 'success', url: baidu },
      { index: 2, type: 'wait', outcome: 'success', url: baidu },
      { index: 3, type: 'extract', outcome: 'success', url: baidu },
      { index: 4, type: 'navigate', outcome: 'success', url: product },
      { index: 5, type: 'extract', outcome: 'success', url: product },
    ] }
  const input = createAssistantMessage({ content: [{ type: 'tool_use', id: 'shifted-recovery', name: 'Playwright', input: { actions: [
    { type: 'navigate', url: google }, { type: 'wait', ms: 700 }, { type: 'extract', selector: 'body' },
    { type: 'navigate', url: product }, { type: 'extract', selector: 'body' },
  ] } }] }) as Message
  const result = createUserMessage({ content: [{ type: 'tool_result', tool_use_id: 'shifted-recovery', content:
    '<playwright-action-ledger encoding="base64">' + Buffer.from(JSON.stringify(ledger)).toString('base64') + '</playwright-action-ledger>',
  }] }) as Message
  expect(buildPlaywrightAudit([input, result])).toEqual([
    expect.objectContaining({ searchEngine: 'Google', status: 'access_limited' }),
    expect.objectContaining({ searchEngine: '百度', finalUrl: baidu, searchResultStatus: 'results_observed', actionTypes: ['navigate', 'wait', 'extract'] }),
    expect.objectContaining({ target: product, finalUrl: product, actionTypes: ['navigate', 'extract'] }),
  ])
})
