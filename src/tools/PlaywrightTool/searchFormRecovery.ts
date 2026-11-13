import { searchEngineForUrl } from '../../utils/searchEngineSurface.js'

/** Same public engine, same query; never a CAPTCHA/login recovery or navigation itself. */
export function searchFormRecoveryUrl(currentUrl: string, selector: string, query: string): string | undefined {
  const engine = searchEngineForUrl(currentUrl)
  if (!engine || !query.trim() || query.length > 1024) return undefined
  const current = new URL(currentUrl)
  if (current.pathname !== '/' || current.username || current.password) return undefined
  const field = engine === '百度' ? /#kw\b|\[name\s*=\s*['"]?(?:wd|word)['"]?\]/i
    : engine === 'Bing' ? /#sb_form_q\b|\[name\s*=\s*['"]?q['"]?\]/i
      : engine === '360' ? /#keyword\b|\[name\s*=\s*['"]?(?:q|keyword)['"]?\]/i
        : /\[name\s*=\s*['"]?q['"]?\]/i
  if (!field.test(selector)) return undefined
  const target = new URL(engine === '百度' || engine === '360' ? '/s' : '/search', current.origin)
  target.searchParams.set(engine === '百度' ? 'wd' : 'q', query)
  return target.toString()
}
