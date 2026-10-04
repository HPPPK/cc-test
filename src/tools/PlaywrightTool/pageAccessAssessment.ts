// Match an actual denial message, not a topic word or a URL such as /robots.txt.
const ACCESS_LIMITED_PATTERN = /^(?:access denied|forbidden|403(?: forbidden)?|429(?: too many requests)?|too many requests|rate limit(?: exceeded)?|访问受限)(?:[\s:：.!]|$)|(?:you(?:'ve| have) been |request (?:was |is )?)blocked by network security|暂时限制本次访问|您的请求已被拦截|access to this (?:page|resource|site) (?:has been |is )denied/i

/**
 * Patterns that freeze an Expert Playwright session and open the Desktop
 * human-verification handoff modal. Keep Chinese Google /sorry wording here:
 * the page says「进行人机身份验证」, not the shorter「人机验证」token.
 */
const HUMAN_VERIFICATION_PATTERNS: Array<{ pattern: RegExp; kind: string }> = [
  { pattern: /百度安全验证|请完成安全验证|拖动(?:左侧)?滑块|tuxing_v2/i, kind: 'Baidu security verification' },
  // Bing may render its challenge without the word CAPTCHA; its Chinese prompt is the stable visible signal.
  { pattern: /请解决以下难题以继续|solve the following puzzle to continue/i, kind: 'Bing security verification' },
  // Google sorry interstitial: URL is the strongest signal when reCAPTCHA is iframe-only.
  { pattern: /\/sorry(?:\/|\?|$)|google\.[^/\s]+\/sorry/i, kind: 'Google security verification' },
  {
    pattern: /人机身份验证|进行人机|人机验证|滑块验证|滑动验证|异常流量|unusual traffic|verify you are human|i.?m not a robot/i,
    kind: 'human verification',
  },
]

const LOGIN_PAGE_TITLE = /^\s*(?:登录(?:验证)?|login(?: verification)?|sign[ -]?in|authentication required)(?:\s*[-|].*)?\s*$/i
const LOGIN_PAGE_URL = /\/(?:login|sign[ -]?in|signin|auth|authenticate)(?:\/|[?#]|$)/i
const LOGIN_FORM_PATTERN = /账号|帐户|用户名|密码|短信验证码|手机验证码|email|password|sign in to continue|login required/i

function hasLoginVerificationSurface(url: string, title: string, text: string): boolean {
  // A public FAQ can legitimately explain “登录” and “验证码”. Treat it as an
  // interactive verification page only when the URL or page title identifies a
  // sign-in surface and the rendered body contains a real authentication form.
  return (LOGIN_PAGE_TITLE.test(title) || LOGIN_PAGE_URL.test(url)) && LOGIN_FORM_PATTERN.test(text)
}

/** Detects CAPTCHA / slider / Google sorry surfaces that require human help. */
export function detectHumanVerificationKind(
  url: string,
  title: string,
  text: string,
): string | null {
  const haystack = [url, title, text].join('\n').slice(0, 20_000)
  const explicitChallenge = HUMAN_VERIFICATION_PATTERNS.find(({ pattern }) => pattern.test(haystack))?.kind
  if (explicitChallenge) return explicitChallenge
  return hasLoginVerificationSurface(url, title, text) ? 'login verification' : null
}

/**
 * Checks whether the specific human-verification surface that froze a browser
 * session is still present. This is intentionally narrower than the generic
 * access audit: an ordinary result page can discuss robots, CAPTCHAs, or
 * abnormal traffic without itself being a challenge page.
 */
export function isHumanVerificationSurfaceStillPresent(
  expectedKind: string | undefined,
  url: string,
  title: string,
  text: string,
): boolean {
  const haystack = [url, title, text].join('\n').slice(0, 20_000)
  if (expectedKind === 'Google security verification') {
    return /\/sorry(?:\/|\?|$)|google\.[^/\s]+\/sorry/i.test(url)
      || (/进行人机身份验证|verify you are human/i.test(haystack) && /异常流量|unusual traffic|automated queries/i.test(haystack))
  }
  if (expectedKind === 'Baidu security verification') {
    return /wappass\.baidu\.com|(?:^|[/?#])captcha(?:[/?#]|$)|tuxing_v2/i.test(url)
      || (/百度安全验证|请完成安全验证/i.test(haystack) && /拖动(?:左侧)?滑块|滑块验证|滑动验证/i.test(haystack))
  }
  if (expectedKind === 'Bing security verification') {
    return /请解决以下难题以继续|solve the following puzzle to continue/i.test(haystack)
  }
  if (expectedKind === 'login verification') return hasLoginVerificationSurface(url, title, text)

  // The generic initial detector may use a broad hint to surface a modal. Once
  // a page is frozen, recovery waits only on phrases that describe a live
  // challenge, never a lone "captcha" or "robots" word in ordinary content.
  return /进行人机身份验证|请完成(?:下方|安全)验证|拖动(?:左侧)?滑块|请解决以下难题以继续|solve the following puzzle to continue|verify you are human|i.?m not a robot/i.test(haystack)
}

/** Detects a rendered access or verification surface without making any research-quality judgment. */
export function classifyRenderedPageAccess(url: string, title: string, text: string): string | null {
  // Leading denial messages belong to the title/body, not the prefixed URL.
  const hasDenial = [title, text].some((value) => ACCESS_LIMITED_PATTERN.test(value.trim()))
  if (hasDenial || detectHumanVerificationKind(url, title, text)) {
    return 'ACCESS_LIMITED_PAGE: The rendered page requires verification, login, or another access control.'
  }
  if (/^\s*(?:404(?:\s*[-:|]?)?\s*(?:not found|page not found)?|page not found|页面不存在|页面未找到)(?:[\s.!:：-]|$)/i.test(title)
    || /^\s*(?:this domain is for sale|buy this domain|域名出售)(?:[\s.!:：-]|$)/i.test(title)) {
    return 'PAGE_UNAVAILABLE: The rendered page is missing or is a domain-sale placeholder; no usable content was obtained.'
  }
  return hasLoginVerificationSurface(url, title, text)
    ? 'ACCESS_LIMITED_PAGE: The rendered page is an authentication prompt.'
    : null
}


export function assessRenderedPageAccess(url: string, title: string, text: string): { accessLimited: boolean; error?: string } {
  const reason = classifyRenderedPageAccess(url, title, text)
  return {
    accessLimited: Boolean(reason?.startsWith('ACCESS_LIMITED_PAGE:')),
    ...(reason?.startsWith('PAGE_UNAVAILABLE:') ? { error: reason } : {}),
  }
}
