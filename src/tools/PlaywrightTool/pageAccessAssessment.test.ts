import { describe, expect, test } from 'bun:test'
import { classifyRenderedPageAccess, detectHumanVerificationKind, isHumanVerificationSurfaceStillPresent, isHumanVerificationRecoveryHealthy } from './pageAccessAssessment.js'

describe('detectHumanVerificationKind', () => {
  test('detects Google Chinese sorry / reCAPTCHA interstitial even when iframe text is missing', () => {
    const url = 'https://www.google.com/sorry/index?continue=https://www.google.com/search%3Fq%3Dtest'
    const text = [
      '进行人机身份验证',
      '关于此网页',
      '我们的系统检测到您的计算机网络中存在异常流量。此网页用于确认这些请求是由您而不是自动程序发出的。',
      'IP 地址: 104.28.215.68',
      '时间: 2026-08-07T08:32:19Z',
    ].join('\n')

    // URL alone is enough (reCAPTCHA often lives in a cross-origin iframe).
    expect(detectHumanVerificationKind(url, '', '')).toBe('Google security verification')
    // Chinese body copy alone also matches when URL is stripped from extraction.
    expect(detectHumanVerificationKind('https://www.google.com/search?q=test', '', text)).toBe('human verification')
    expect(detectHumanVerificationKind(url, '', text)).toBe('Google security verification')
  })

  test('detects English Google unusual-traffic wording and reCAPTCHA tokens', () => {
    expect(detectHumanVerificationKind(
      'https://www.google.com/search?q=test',
      '',
      'Our systems have detected unusual traffic from your computer network. Verify you are human.',
    )).toBe('human verification')
    expect(detectHumanVerificationKind(
      'https://www.google.com/search?q=test',
      '',
      'reCAPTCHA checkbox: I\'m not a robot',
    )).toBe('human verification')
  })

  test('still detects Baidu slider security verification', () => {
    expect(detectHumanVerificationKind(
      'https://wappass.baidu.com/static/captcha/tuxing.html',
      '百度安全验证',
      '请完成安全验证 拖动左侧滑块',
    )).toBe('Baidu security verification')
  })

  test('does not treat the ordinary Baidu home page as a human-verification surface', () => {
    expect(detectHumanVerificationKind(
      'https://www.baidu.com/',
      '百度一下，你就知道',
      '新闻 hao123 地图 贴吧 视频 图片 网盘 文库 登录 百度一下',
    )).toBeNull()
  })

  test('detects Bing’s rendered continue challenge as human verification', () => {
    const url = 'https://www.bing.com/search?q=mouse+middle+button+quick+action+panel'
    const text = '跳至内容\n辅助功能反馈\nRewards\n最后一步\n请解决以下难题以继续'

    expect(detectHumanVerificationKind(url, 'Search - Microsoft Bing', text)).toBe('Bing security verification')
    expect(classifyRenderedPageAccess(url, 'Search - Microsoft Bing', text)).toContain('ACCESS_LIMITED_PAGE')
  })

  test('does not treat a public FAQ that documents login and SMS verification as a verification page', () => {
    const url = 'https://www.u-tools.cn/docs/guide/faq.html'
    const title = 'uTools 文档中心 | uTools 帮助中心'
    const text = [
      '常见问题',
      '登录时提示手机号已被使用或绑定微信失败怎么办？',
      '注销手机号：使用手机验证码登录，跳过微信绑定。',
      '无法收到短信？验证码倒计时结束后可以重新获取。',
      '请检查安全软件或防火墙是否拦截了网络请求。',
    ].join('\n')

    expect(detectHumanVerificationKind(url, title, text)).toBeNull()
    expect(classifyRenderedPageAccess(url, title, text)).toBeNull()
  })

  test('returns null for ordinary public research pages', () => {
    expect(detectHumanVerificationKind(
      'https://example.com/product',
      'Example Product',
      'Pricing starts at $9. Pricing plans for teams and individuals.',
    )).toBeNull()
  })
})

describe('classifyRenderedPageAccess', () => {
  test('marks Google Chinese sorry pages as access-limited via URL or body copy', () => {
    const url = 'https://www.google.com/sorry/index?continue=https://www.google.com/search'
    const text = '进行人机身份验证\n我们的系统检测到您的计算机网络中存在异常流量。'
    expect(classifyRenderedPageAccess(url, '', '')).toContain('ACCESS_LIMITED_PAGE')
    expect(classifyRenderedPageAccess('https://www.google.com/search?q=x', '', text)).toContain('ACCESS_LIMITED_PAGE')
  })

  test('does not mark ordinary product pages as access-limited', () => {
    expect(classifyRenderedPageAccess(
      'https://example.com/docs',
      'Docs',
      'Getting started with the API.',
    )).toBeNull()
  })
})


describe('isHumanVerificationSurfaceStillPresent', () => {
  test('recognizes the original Google sorry surface but releases a normal SERP even when ordinary copy mentions captcha or robots', () => {
    expect(isHumanVerificationSurfaceStillPresent(
      'Google security verification',
      'https://www.google.com/sorry/index?continue=https://www.google.com/search?q=test',
      'Before you continue to Google Search',
      '进行人机身份验证',
    )).toBe(true)
    expect(isHumanVerificationSurfaceStillPresent(
      'Google security verification',
      'https://www.google.com/search?q=test',
      'test - Google Search',
      'A public result explains how robots.txt and CAPTCHA work.',
    )).toBe(false)
  })

  test('keeps Baidu, Bing, and login gates pending only while their concrete challenge remains', () => {
    expect(isHumanVerificationSurfaceStillPresent(
      'Baidu security verification',
      'https://wappass.baidu.com/static/captcha/tuxing.html',
      '百度安全验证',
      '请完成安全验证，拖动左侧滑块',
    )).toBe(true)
    expect(isHumanVerificationSurfaceStillPresent(
      'Bing security verification',
      'https://www.bing.com/search?q=test',
      'Search - Microsoft Bing',
      '请解决以下难题以继续',
    )).toBe(true)
    expect(isHumanVerificationSurfaceStillPresent(
      'login verification',
      'https://example.com/login',
      'Sign in',
      'Email Password Sign in to continue',
    )).toBe(true)
  })
})


describe('real research page access regressions', () => {
  test('robots.txt rules and public SEO documentation are not access controls', () => {
    for (const [url, title, body] of [
      ['https://www.u-tools.cn/robots.txt', '', 'User-agent: *\nAllow: /\nSitemap: https://www.u-tools.cn/sitemap.xml'],
      ['https://getquicker.net/robots.txt', '', 'User-agent: AhrefsBot\nDisallow: /\nUser-agent: *\nDisallow: /account'],
      ['https://example.com/docs/captcha', 'CAPTCHA integration docs', 'This page explains robots.txt and CAPTCHA errors such as 403 and 429.'],
    ]) {
      expect(classifyRenderedPageAccess(url!, title!, body!)).toBeNull()
      expect(detectHumanVerificationKind(url!, title!, body!)).toBeNull()
    }
  })
  test('recognizes actual network-policy walls and Zhihu API access errors without inventing CAPTCHA', () => {
    for (const [url, body] of [
      ['https://www.reddit.com/search/?q=quicker', "You've been blocked by network security. To continue, log in to your Reddit account or use your developer token."],
      ['https://www.zhihu.com/question/351589539', '{"error":{"message":"您当前请求存在异常，暂时限制本次访问。","code":40362}}'],
    ]) {
      expect(classifyRenderedPageAccess(url!, '', body!)).toContain('ACCESS_LIMITED_PAGE')
      expect(detectHumanVerificationKind(url!, '', body!)).toBeNull()
    }
  })
})


test('rendered 404 and domain-sale pages are unavailable, not successfully researched or human challenges', () => {
  expect(classifyRenderedPageAccess('https://old.example.com/report', '404 Not Found', 'The page you requested could not be found.')).toContain('PAGE_UNAVAILABLE')
  expect(classifyRenderedPageAccess('https://old.example.com/', 'This domain is for sale', 'Buy this domain')).toContain('PAGE_UNAVAILABLE')
  expect(detectHumanVerificationKind('https://old.example.com/', 'This domain is for sale', 'Buy this domain')).toBeNull()
})

test('recognizes denial titles or leading body messages separately from the URL without treating them as human verification', () => {
  for (const [title, text] of [
    ['403 Forbidden', 'The server denied this request.'],
    ['429 Too Many Requests', 'Try again later.'],
    ['Request failed', 'Access denied: this resource is not available to you.'],
  ]) {
    expect(classifyRenderedPageAccess('https://example.com/article', title!, text!)).toContain('ACCESS_LIMITED_PAGE')
    expect(detectHumanVerificationKind('https://example.com/article', title!, text!)).toBeNull()
  }
})


test('replacement verification surfaces remain blocked regardless of the initial challenge kind', () => {
  for (const initialKind of ['Google security verification', 'Baidu security verification', 'Bing security verification', 'human verification', 'login verification']) {
    expect(isHumanVerificationSurfaceStillPresent(initialKind, 'https://example.com/login', 'Sign in', 'Email Password Sign in to continue')).toBe(true)
    expect(isHumanVerificationSurfaceStillPresent(initialKind, 'https://www.google.com/sorry/index', '', '')).toBe(true)
    expect(isHumanVerificationSurfaceStillPresent(initialKind, 'https://www.bing.com/search?q=x', 'Bing', '请解决以下难题以继续')).toBe(true)
  }
})

test('recovery requires readable public content and rejects loading, blank, closed and denied pages', async () => {
  const { isHumanVerificationRecoveryHealthy } = await import('./pageAccessAssessment.js')
  const healthy = { url: 'https://example.com/results', title: 'Results', text: 'Public results have loaded.', readyState: 'complete', closed: false }
  expect(isHumanVerificationRecoveryHealthy(healthy)).toBe(true)
  for (const invalid of [
    { closed: true }, { readyState: 'loading' }, { url: 'about:blank' }, { text: '' },
    { title: '403 Forbidden' }, { title: '404 Not Found' },
    { url: 'https://example.com/login', title: 'Sign in', text: 'Email Password' },
    { text: '请解决以下难题以继续' },
  ]) expect(isHumanVerificationRecoveryHealthy({ ...healthy, ...invalid })).toBe(false)
})

test('recognizes the observed Reddit and Cloudflare challenge surfaces consistently', () => {
  const cases = [
    ['https://www.reddit.com/r/Windows10/search/?js_challenge=1', 'Reddit - Prove your humanity', 'Prove your humanity\nComplete the challenge below and let us know you’re a real person.'],
    ['https://www.v2ex.com/?__cf_chl_rt_tk=token', 'Just a moment...', ''],
  ]
  for (const [url, title, text] of cases) {
    expect(detectHumanVerificationKind(url!, title!, text!)).toBeTruthy()
    expect(isHumanVerificationSurfaceStillPresent(undefined, url!, title!, text!)).toBe(true)
    expect(classifyRenderedPageAccess(url!, title!, text!)).toContain('ACCESS_LIMITED_PAGE')
  }
  expect(detectHumanVerificationKind('https://example.com/article', 'How Reddit verifies users', 'The challenge says “Prove your humanity”.')).toBeNull()
})


test('keeps the real Cloudflare security-verification wording paused without treating a discussion as a challenge', () => {
  const text = 'www.autohotkey.com\nPerforming security verification\nThis website uses a security service to protect against malicious bots. This page is displayed while the website verifies you are not a bot.\nRay ID: example\nPerformance and security by Cloudflare'
  for (const url of ['https://www.autohotkey.com/', 'https://cn.v2ex.com/t/723554']) {
    expect(detectHumanVerificationKind(url, 'Just a moment...', text)).toBe('human verification')
    expect(isHumanVerificationSurfaceStillPresent(undefined, url, 'Just a moment...', text)).toBe(true)
    expect(classifyRenderedPageAccess(url, 'Just a moment...', text)).toContain('ACCESS_LIMITED_PAGE')
  }
  expect(detectHumanVerificationKind('https://example.com/blog', 'How security verification works', text)).toBeNull()
})

test('recognizes the recorded Chinese Cloudflare page without blocking articles that quote it', () => {
  const body = 'www.v2ex.com\n正在进行安全验证\n本网站使用安全服务防护恶意自动程序。在验证您不是自动程序期间，将显示此页面。\n由 Cloudflare 提供的性能和安全服务'
  expect(detectHumanVerificationKind('https://www.v2ex.com/t/165355', '请稍候…', body)).toBe('human verification')
  expect(classifyRenderedPageAccess('https://www.v2ex.com/t/165355', '请稍候…', body)).toContain('ACCESS_LIMITED_PAGE')
  expect(isHumanVerificationRecoveryHealthy({ url: 'https://www.v2ex.com/t/165355', title: '请稍候…', text: body, readyState: 'complete', closed: false })).toBe(false)
  expect(detectHumanVerificationKind('https://example.com/article', 'Cloudflare 验证说明', body)).toBeNull()
  expect(detectHumanVerificationKind('https://example.com/', '请稍候…', '正在加载公开产品说明')).toBeNull()
})
