import { getUnsafePublicBrowserUrlReason } from './runtime.js'

function decodeBingRedirectUrl(rawUrl: string): string | null | undefined {
  let parsed: URL
  try { parsed = new URL(rawUrl) } catch { return undefined }
  if (!parsed.hostname.endsWith('.bing.com') || parsed.pathname !== '/ck/a') return undefined
  const encodedTarget = parsed.searchParams.get('u')
  if (!encodedTarget?.startsWith('a1')) return undefined
  try {
    const target = Buffer.from(encodedTarget.slice(2), 'base64').toString('utf8')
    return !target || getUnsafePublicBrowserUrlReason(target) ? null : target
  } catch { return undefined }
}

/** Normalizes public rendered links without ranking, filtering, or research inference. */
export function normalizePublicBrowserLink(rawUrl: string): string | null {
  const decoded = decodeBingRedirectUrl(rawUrl)
  const url = decoded === undefined ? rawUrl : decoded
  return url && !getUnsafePublicBrowserUrlReason(url) ? url : null
}
