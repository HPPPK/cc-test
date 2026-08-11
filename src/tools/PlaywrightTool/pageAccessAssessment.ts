const ACCESS_LIMITED_PATTERN = /access denied|forbidden|captcha|verify you are human|unusual traffic|automated queries|robots|rate limit|too many requests|\b403\b|\b429\b|访问受限|百度安全验证|请完成下方验证|拖动左侧滑块|请解决以下挑战|security check|人机身份验证|进行人机|人机验证|滑块验证|滑动验证|异常流量|i.?m not a robot|\/sorry(?:\/|\?|$)|google\.[^/\s]+\/sorry/i

/**
 * Patterns that freeze an Expert Playwright session and open the Desktop
 * human-verification handoff modal. Keep Chinese Google /sorry wording here:
 * the page says「进行人机身份验证」, not the shorter「人机验证」token.
 */
const HUMAN_VERIFICATION_PATTERNS: Array<{ pattern: RegExp; kind: string }> = [
  { pattern: /百度安全验证|请完成安全验证|拖动(?:左侧)?滑块|tuxing_v2/i, kind: 'Baidu security verification' },
  // Google sorry interstitial: URL is the strongest signal when reCAPTCHA is iframe-only.
  { pattern: /\/sorry(?:\/|\?|$)|google\.[^/\s]+\/sorry/i, kind: 'Google security verification' },
  {
    pattern: /人机身份验证|进行人机|人机验证|滑块验证|滑动验证|异常流量|unusual traffic|verify you are human|i.?m not a robot|\b(?:captcha|recaptcha|hcaptcha)\b/i,
    kind: 'human verification',
  },
  {
    pattern: /(?:登录|login).{0,24}(?:验证|verify|verification)|(?:验证|verify|verification).{0,24}(?:登录|login)/i,
    kind: 'login verification',
  },
]

/** Detects CAPTCHA / slider / Google sorry surfaces that require human help. */
export function detectHumanVerificationKind(
  url: string,
  title: string,
  text: string,
): string | null {
  const haystack = [url, title, text].join('\n').slice(0, 20_000)
  return HUMAN_VERIFICATION_PATTERNS.find(({ pattern }) => pattern.test(haystack))?.kind ?? null
}

/** Detects a rendered access or verification surface without making any research-quality judgment. */
export function classifyRenderedPageAccess(url: string, title: string, text: string): string | null {
  const rendered = [url, title, text].join('\n')
  if (ACCESS_LIMITED_PATTERN.test(rendered) || detectHumanVerificationKind(url, title, text)) {
    return 'ACCESS_LIMITED_PAGE: The rendered page requires verification, login, or another access control.'
  }
  const authTitle = /^\s*(?:登录|log[ -]?in|sign[ -]?in|authentication required)(?:\s*[-|].*)?\s*$/i.test(title)
  const authForm = /账号|帐户|用户名|密码|短信验证码|手机验证码|email|password|sign in to continue|login required/i.test(text)
  return authTitle && authForm ? 'ACCESS_LIMITED_PAGE: The rendered page is an authentication prompt.' : null
}
