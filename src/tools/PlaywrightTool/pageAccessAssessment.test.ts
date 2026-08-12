import { describe, expect, test } from 'bun:test'
import { classifyRenderedPageAccess, detectHumanVerificationKind } from './pageAccessAssessment.js'

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
