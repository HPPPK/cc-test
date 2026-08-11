import { useMemo, useState } from 'react'
import { useChatStore, type PerSessionState } from '../../stores/chatStore'
import { Button } from '../shared/Button'
import { Modal } from '../shared/Modal'

type PendingPermission = PerSessionState['pendingPermission']
type VerificationResolution = 'verification_completed' | 'switch_public_entry'

type VerificationContext = {
  url: string
  title?: string
  detail?: string
  engine?: string
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
  const hostname = hostnameFor(context.url)
  if (context.engine === '百度' || hostname.endsWith('baidu.com')) return '百度安全验证（如拖动滑块）'
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
    remaining: typeof queue?.remaining === 'number' && Number.isInteger(queue.remaining) && queue.remaining > 0
      ? queue.remaining
      : 0,
  }
}

const LABELS: Record<VerificationResolution, string> = {
  verification_completed: '我已完成，继续',
  switch_public_entry: '暂不验证，换其他入口',
}

export function ExpertHumanVerificationModal({
  sessionId,
  request,
}: {
  sessionId: string
  request: PendingPermission
}) {
  const respondToPermission = useChatStore((state) => state.respondToPermission)
  const [submitted, setSubmitted] = useState<VerificationResolution | null>(null)
  const context = useMemo(() => verificationContext(request), [request])

  if (!request || !context) return null

  const choose = (resolution: VerificationResolution) => {
    if (submitted) return
    setSubmitted(resolution)
    respondToPermission(sessionId, request.requestId, true, {
      updatedInput: { verificationResolution: resolution },
    })
  }

  const site = siteName(context)
  return (
    <Modal
      open
      onClose={() => undefined}
      title={`${site} 需要验证`}
      width={400}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="secondary"
            disabled={submitted !== null}
            onClick={() => choose('switch_public_entry')}
          >
            {LABELS.switch_public_entry}
          </Button>
          <Button
            variant="primary"
            disabled={submitted !== null}
            onClick={() => choose('verification_completed')}
          >
            {LABELS.verification_completed}
          </Button>
        </div>
      }
    >
      <div className="space-y-2 text-sm">
        <p className="font-medium text-[var(--color-text-primary)]">请完成：{requiredAction(context)}</p>
        <p className="text-[var(--color-text-secondary)]">浏览器已打开 {site} 的验证页面。</p>
        {context.remaining > 0 ? (
          <p className="text-xs text-[var(--color-text-tertiary)]">还有 {context.remaining} 个网站验证，会按顺序提示。</p>
        ) : null}
      </div>
    </Modal>
  )
}
