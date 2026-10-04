import { describe, expect, test } from 'bun:test'
import { searchEngineForUrl, isSearchResultsUrl } from './searchEngineSurface.js'

describe('search engine surface, not corporate host substring', () => {
  test('excludes stores, forums, support sites and lookalike domains', () => {
    for (const url of ['https://chromewebstore.google.com/detail/foo', 'https://tieba.baidu.com/p/123', 'https://support.google.com/search?q=x', 'https://www.google.com.attacker.test/search?q=x', 'https://bing.example.com/search?q=x']) {
      expect(searchEngineForUrl(url)).toBeUndefined()
      expect(isSearchResultsUrl(url)).toBe(false)
    }
  })
  test('recognizes home submission, actual results and Google human-verification separately', () => {
    expect(searchEngineForUrl('https://www.google.co.uk/')).toBe('Google')
    expect(searchEngineForUrl('https://www.google.com/sorry/index')).toBe('Google')
    expect(isSearchResultsUrl('https://www.google.com/sorry/index')).toBe(false)
    expect(isSearchResultsUrl('https://www.google.com/')).toBe(false)
    for (const [url, engine] of [['https://www.google.com/search?q=x', 'Google'], ['https://www.baidu.com/s?wd=x', '百度'], ['https://cn.bing.com/search?q=x', 'Bing'], ['https://www.so.com/s?q=x', '360']]) {
      expect(searchEngineForUrl(url)).toBe(engine)
      expect(isSearchResultsUrl(url)).toBe(true)
    }
  })
})
