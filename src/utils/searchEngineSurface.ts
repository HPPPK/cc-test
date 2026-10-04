/** Search provenance is a URL surface, not ownership of a corporate domain. */
export type SearchEngine = 'Google' | '百度' | 'Bing' | '360'

export function searchEngineForUrl(value: unknown): SearchEngine | undefined {
  if (typeof value !== 'string') return undefined
  try {
    const url = new URL(value)
    if (!/^https?:$/.test(url.protocol)) return undefined
    const host = url.hostname.toLowerCase()
    const route = url.pathname.replace(/\/$/, '') || '/'
    if (/^(?:www\.)?google\.(?:com|[a-z]{2}|com\.[a-z]{2}|co\.[a-z]{2})$/.test(host)
      && (route === '/' || route === '/search' || /^\/sorry(?:\/|$)/.test(route))) return 'Google'
    if (/^(?:www\.|m\.)?baidu\.com$/.test(host) && (route === '/' || route === '/s')) return '百度'
    if (/^(?:www\.|cn\.)?bing\.com$/.test(host) && (route === '/' || route === '/search')) return 'Bing'
    if (/^(?:www\.)?so\.com$/.test(host) && (route === '/' || route === '/s')) return '360'
  } catch { /* Unknown/malformed URLs remain ordinary page attempts. */ }
  return undefined
}

export function isSearchResultsUrl(value: string | undefined, expectedEngine?: SearchEngine): boolean {
  const engine = searchEngineForUrl(value)
  if (!engine || !value || (expectedEngine && engine !== expectedEngine)) return false
  const url = new URL(value)
  const resultPath = engine === '百度' || engine === '360' ? '/s' : '/search'
  const query = engine === '百度' ? url.searchParams.get('wd') ?? url.searchParams.get('word') : url.searchParams.get('q')
  return url.pathname.replace(/\/$/, '') === resultPath && Boolean(query?.trim())
}
