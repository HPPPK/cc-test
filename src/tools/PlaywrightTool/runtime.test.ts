import { describe, expect, test } from 'bun:test'
import { getUnsafePublicBrowserUrlReason, isBrowserOwnedDocumentUrl, summarizeRenderedPageText } from './runtime.js'

describe('Playwright runtime', () => {
  test('allows public pages and blocks local targets', () => {
    expect(getUnsafePublicBrowserUrlReason('https://example.com/path')).toBeNull()
    expect(getUnsafePublicBrowserUrlReason('http://localhost:3000')).toContain('Localhost')
  })

  test('allows browser-owned documents without allowing local or file destinations', () => {
    expect(isBrowserOwnedDocumentUrl('about:blank')).toBe(true)
    expect(isBrowserOwnedDocumentUrl('data:text/html,<h1>scratch</h1>')).toBe(true)
    expect(isBrowserOwnedDocumentUrl('https://example.com')).toBe(false)
    expect(isBrowserOwnedDocumentUrl('file:///C:/private.html')).toBe(false)
  })

  test('labels truncation as Playwright output', () => {
    const result = summarizeRenderedPageText('x'.repeat(100), 30)
    expect(result.truncated).toBe(true)
    expect(result.text).toContain('Playwright')
  })
})
