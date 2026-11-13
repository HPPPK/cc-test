import { expect, test } from 'bun:test'
import { searchFormRecoveryUrl } from './searchFormRecovery.js'

test('recovers only recognized public search home forms on the same engine and host', () => {
  for (const [home, selector, pathname, param] of [
    ['https://www.baidu.com/', '#kw', '/s', 'wd'],
    ['https://www.google.com.hk/', 'textarea[name="q"]:visible', '/search', 'q'],
    ['https://cn.bing.com/', '#sb_form_q', '/search', 'q'],
    ['https://www.so.com/', '#keyword', '/s', 'q'],
  ]) {
    const target = new URL(searchFormRecoveryUrl(home!, selector!, 'old photo 修复')!)
    expect(target.host).toBe(new URL(home!).host)
    expect(target.pathname).toBe(pathname!)
    expect(target.searchParams.get(param!)).toBe('old photo 修复')
  }
})

test('never offers form recovery for CAPTCHA, result pages, login fields, or unrelated domains', () => {
  for (const [url, selector, text] of [
    ['https://www.google.com/sorry/index', 'input[name=q]', 'test'],
    ['https://wappass.baidu.com/static/captcha/a', '#kw', 'test'],
    ['https://www.baidu.com/s?wd=before', '#kw', 'test'],
    ['https://www.baidu.com/', '#password', 'secret'],
    ['https://www.baidu.com.attacker.test/', '#kw', 'test'],
    ['https://www.baidu.com/', '#kw', ''],
    ['https://www.baidu.com/', '#kw', 'x'.repeat(1025)],
  ]) expect(searchFormRecoveryUrl(url!, selector!, text!)).toBeUndefined()
})
