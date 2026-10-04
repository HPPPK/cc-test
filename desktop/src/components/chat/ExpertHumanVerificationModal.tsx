import { useEffect, useMemo, useState } from 'react'
import { expertsApi } from '../../api/experts'
import { useChatStore, type PerSessionState } from '../../stores/chatStore'
import { Button } from '../shared/Button'
import { Modal } from '../shared/Modal'
import { notifyDesktop } from '../../lib/desktopNotifications'

type PendingPermission = PerSessionState['pendingPermission']
type VerificationResolution = 'switch_public_entry'

type VerificationContext = {
  url: string
  title?: string
  detail?: string
  engine?: string
  windowPresentationConfirmed?: boolean
  remaining: number
}

function inputRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function hostnameFor(url: string): string {
  try {
    return new URL(url).hostname.replace(/^wappass\./, '').replace(/^www\./, '')
  } catch {
    return '当前网站'
  }
}

function siteName(context: VerificationContext): string {
  const engine = context.engine?.trim()
  if (engine) return engine
  const hostname = hostnameFor(context.url)
  if (hostname.endsWith('baidu.com')) return '百度'
  if (hostname.endsWith('google.com')) return 'Google'
  if (hostname.endsWith('bing.com')) return 'Bing'
  if (hostname.endsWith('so.com') || hostname.endsWith('360.cn')) return '360搜索'
  return hostname
}

function requiredAction(context: VerificationContext): string {
  const detail = context.detail?.trim() ?? ''

  // Site names alone are not evidence of a challenge. The runner provides a
  // concrete kind only after it has identified a real rendered verification page.
  if (/Baidu security verification/i.test(detail)) return '百度安全验证（如拖动滑块）'
  if (/Google security verification/i.test(detail)) return 'Google 安全验证'
  if (/Bing security verification/i.test(detail)) return 'Bing 安全验证'
  if (/login verification/i.test(detail)) return '页面显示的登录验证'
  return '页面显示的安全验证'
}

export function isExpertHumanVerificationRequest(request: PendingPermission): boolean {
  return verificationContext(request) !== null
}

function verificationContext(request: PendingPermission): VerificationContext | null {
  if (request?.toolName !== 'Playwright') return null
  const input = inputRecord(request.input)
  if (input?.kind !== 'expert-playwright-verification') return null
  const verification = inputRecord(input.verification)
  if (!verification || typeof verification.url !== 'string' || !verification.url) return null
  const queue = inputRecord(input.queue)
  return {
    url: verification.url,
    ...(typeof verification.title === 'string' && verification.title ? { title: verification.title } : {}),
    ...(typeof verification.detail === 'string' && verification.detail ? { detail: verification.detail } : {}),
    ...(typeof verification.engine === 'string' && verification.engine ? { engine: verification.engine } : {}),
    ...(typeof verification.windowPresentationConfirmed === 'boolean' ? { windowPresentationConfirmed: verification.windowPresentationConfirmed } : {}),
    remaining: typeof queue?.remaining === 'number' && Number.isInteger(queue.remaining) && queue.remaining > 0
      ? queue.remaining
      : 0,
  }
}

export function ExpertHumanVerificationModal({
  sessionId,
  request,
}: {
  sessionId: string
  request: PendingPermission
}) {
  const respondToPermission = useChatStore((state) => state.respondToPermission)
  const [submitted, setSubmitted] = useState<VerificationResolution | 'opening' | 'checking' | null>(null)
  const [browserStatus, setBrowserStatus] = useState<string | null>(null)
  const context = useMemo(() => verificationContext(request), [request])
  const site = context ? siteName(context) : ''
  const action = context ? requiredAction(context) : ''

  useEffect(() => {
    if (!request || !context) return

    void notifyDesktop({
      dedupeKey: `expert-human-verification:${sessionId}:${request.requestId}`,
      title: `${site} \u9700\u8981\u4eba\u5de5\u9a8c\u8bc1`,
      body: action,
      requestAttention: true,
      target: { type: 'session', sessionId },
    })
  }, [action, context, request, sessionId, site])

  if (!request || !context) return null

  const chooseFallback = () => {
    if (submitted) return
    setSubmitted('switch_public_entry')
    respondToPermission(sessionId, request.requestId, true, {
      updatedInput: { verificationResolution: 'switch_public_entry' },
    })
  }

  const openBrowser = () => {
    if (submitted) return
    setSubmitted('opening')
    setBrowserStatus(null)
    void expertsApi.requestResearchBrowserVisibility(sessionId)
      .then(({ presentationConfirmed }) => {
        if (presentationConfirmed === true) {
          setBrowserStatus('验证浏览器已打开。请在该窗口完成验证；软件之后不会再自动收回它。')
        } else if (presentationConfirmed === false) {
          setBrowserStatus('未能自动恢复验证浏览器。请从任务栏打开 Chromium；如果仍看不到，请告诉我这个提示。')
        } else {
          setBrowserStatus('暂未收到浏览器恢复确认。请稍候再点一次“打开验证浏览器”。')
        }
      })
      .catch(() => setBrowserStatus('未能请求打开验证浏览器。请稍候再试。'))
      .finally(() => setSubmitted(null))
  }

  const checkNow = () => {
    if (submitted) return
    setSubmitted('checking')
    void expertsApi.requestResearchBrowserVerificationCheck(sessionId)
      .catch(() => undefined)
      .finally(() => setSubmitted(null))
  }

  return (
    <Modal
      open
      onClose={chooseFallback}
      title={`${site} 需要验证`}
      width={400}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="secondary"
            disabled={submitted !== null}
            onClick={openBrowser}
          >
            {submitted === 'opening' ? '正在打开…' : '打开验证浏览器'}
          </Button>
          <Button
            variant="secondary"
            disabled={submitted !== null}
            onClick={chooseFallback}
          >
            改查其他入口
          </Button>
          <Button
            variant="primary"
            disabled={submitted !== null}
            onClick={checkNow}
          >
            {submitted === 'checking' ? '正在检查…' : '立即检查'}
          </Button>
        </div>
      }
    >
      <div className="space-y-2 text-sm">
        <p className="font-medium text-[var(--color-text-primary)]">请完成：{requiredAction(context)}</p>
        <p className="text-[var(--color-text-secondary)]">
          {'已为你保留 ' + site + ' 的验证页面。完成网页验证后，软件会自动检测并继续当前检索。点击“打开验证浏览器”才会按你的这次操作恢复该托管 Chromium；之后软件不会再自动移动、最小化或收回它。'}
          {' '}关闭此提示会改查其他公开入口。
        </p>
        {browserStatus ? (
          <p role="status" className="text-xs text-[var(--color-text-secondary)]">{browserStatus}</p>
        ) : null}
        {context.remaining > 0 ? (
          <p className="text-xs text-[var(--color-text-tertiary)]">还有 {context.remaining} 个网站验证，会按顺序提示。</p>
        ) : null}
      </div>
    </Modal>
  )
}
