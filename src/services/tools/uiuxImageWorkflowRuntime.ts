import { getJiangxiaEnvValue } from '../../utils/appIdentity.js'
import { uiuxImagePathKey as fileKey } from './uiuxImageContract.js'

type Block = { type?: string; name?: string; id?: string; input?: any; tool_use_id?: string; is_error?: boolean; content?: unknown; source?: unknown; text?: string }
type MessageLike = { type?: string; role?: string; message?: { role?: string; content?: unknown }; content?: unknown }
const blocks = (v: unknown): Block[] => typeof v === 'string' ? [{ type: 'text', text: v }] : Array.isArray(v) ? v : v && typeof v === 'object' && 'type' in v ? [v as Block] : []
const text = (v: unknown): string => blocks(v).filter(b => b.type === 'text').map(b => b.text ?? '').join('\n')
const image = (v: unknown): boolean => blocks(v).some(b => b.type === 'image' && b.source)
const urlsIn = (value: string): string[] => [...new Set((value.match(/https?:\/\/[^\s<>"，。；、）)]+/g) ?? []).map(v => publicUrl(v)).filter((v): v is string => !!v))]
function directionSelected(value: string): boolean {
  return value.split(/[，。；\n]/).some(part => !/(?:不要|不选|不使用|别|还没|未|not |don.t)/i.test(part) && /(?:方向.{0,8}(?:你来|你定|自行)|你.{0,6}(?:决定|选择).{0,6}方向|choose the direction yourself|(?:选择?|使用|采用|就用)\s*(?:方向|方案)\s*\S|(?:方向|方案)\s*[A-Z一二三123]\s*(?:就这个|就它|吧)|(?:use|choose) (?:direction|option)\s+\S)/i.test(part))
}
function publicUrl(v: unknown): string | null {
  try {
    const u = new URL(String(v))
    if (!['http:', 'https:'].includes(u.protocol)) return null
    u.hash = ''; u.hostname = u.hostname.replace(/^www\./, '')
    return u.toString().replace(/\/$/, '')
  } catch { return null }
}
export function isUiuxImageOnlySession(): boolean { return getJiangxiaEnvValue('UIUX_IMAGE_ONLY_DELIVERY') === '1' }

export function collectUiuxImageEvidence(messages: readonly MessageLike[]) {
  const calls = new Map<string, Block>()
  const references = new Map<string, string>()
  const readSources = new Set<string>()
  let scope: 'none' | 'public' | null = null
  let direction = false
  let stopped = false
  let taskBoundaryPending = false
  let lockedUrls: string[] | null = null
  let suppliedUrls: string[] = []
  let currentBrowserUrl: string | null = null
  let latestImage: string | null = null
  let latestImageRead = false
  let latestReadFailed = false
  let generationCount = 0
  let generationFailurePending = false
  let reviewText = ''
  let referenceReceipt = false
  let minimumReferences = 2
  for (const m of messages) {
    const content = m.message?.content ?? m.content
    const originalRole = m.message?.role ?? m.role ?? m.type
    const role = originalRole === 'tool_use' ? 'assistant' : originalRole === 'tool_result' ? 'user' : originalRole
    const bs = blocks(content)
    if (role === 'user' && image(content) && !bs.some(b => b.type === 'tool_result') && (direction || latestImage)) {
      // An extra upload is not permission to discard a successful image or reset paid generation budget.
      taskBoundaryPending = true
    }
    if (role === 'user' && !bs.some(b => b.type === 'tool_result')) {
      const request = text(content)
      if (!request.trim().startsWith('<')) {
        const urls = urlsIn(request)
        if (urls.length) { suppliedUrls = [...new Set([...suppliedUrls, ...urls])]; lockedUrls = suppliedUrls }
        if (/(?:不(?:用|要|使用|需要).*?(?:外部|参考|网站)|no external|without external)/i.test(request)) { scope = 'none'; lockedUrls = null }
        else if (/(?:允许|可以|请|去).{0,12}(?:研究|参考网站|找灵感)|https?:\/\//i.test(request)) scope = 'public'
        if (/(?:允许|可以).{0,8}(?:扩展|其他网站)|allow (?:expanded|other)/i.test(request)) { scope = 'public'; lockedUrls = null }
        if (directionSelected(request)) direction = true
        if (/^(?:停止|先停|不要继续|stop|cancel)[。.!！\s]*$/i.test(request.trim())) stopped = true
      }
    }
    for (const b of bs) {
      if (role === 'assistant' && b.type === 'text') {
        if (latestImageRead) reviewText += b.text ?? ''
        if (readSources.size >= minimumReferences && /<visual-reference-receipt>[\s\S]+<\/visual-reference-receipt>/.test(b.text ?? '')) referenceReceipt = true
      }
      if (role === 'assistant' && b.type === 'tool_use' && b.id) calls.set(b.id, b)
      if (role !== 'user' || b.type !== 'tool_result') continue
      const call = calls.get(b.tool_use_id ?? '')
      if (!call) continue
      const result = text(b.content)
      if (call.name === 'Read' && latestImage && fileKey(call.input?.file_path ?? '') === fileKey(latestImage)) {
        latestImageRead = !b.is_error && image(b.content)
        latestReadFailed = !latestImageRead
      }
      if (call.name === 'image_generation' && call.input?.operation === 'generate' && !/UIUX_[A-Z_]+:/.test(result)) {
        generationFailurePending = Boolean(b.is_error) || !/Image generation status:\s*generated\./.test(result)
      }
      if (b.is_error) continue
      if (call.name === 'AskUserQuestion' && /User has answered your questions:/i.test(result)) {
        for (const q of call.input?.questions ?? []) {
          const answerStart = result.indexOf('"' + q.id + '"="')
          const answerValue = answerStart < 0 ? '' : result.slice(answerStart + String(q.id).length + 4).split('"')[0]
          const match = answerValue ? ['', answerValue] : null
          if (!match) continue
          const choice = (q.choices ?? []).find((c: any) => c.id === match[1] || c.label === match[1])
          const answer = choice?.id ?? match[1]
          const answerUrls = urlsIn(match[1])
          if (answerUrls.length) { suppliedUrls = [...new Set([...suppliedUrls, ...answerUrls])]; lockedUrls = suppliedUrls }
          if (['reference_recovery', 'design_direction', 'image_preview_recovery', 'image_generation_failure', 'design_task_action'].includes(q.id) && /^(?:stop|cancel|停止|先停)$/.test(answer)) stopped = true
          if (/^inspiration_sources?$/.test(q.id)) {
            if (/^(?:no_external_reference|不使用外部|不使用参考)$/.test(answer)) { scope = 'none'; lockedUrls = null }
            else if (answer === 'user_provided_reference' || answerUrls.length) { scope = 'public'; lockedUrls = suppliedUrls }
            else if (/^(?:builtin_public_sources|extended_public_research)$/.test(answer)) { scope = 'public'; lockedUrls = null }
          }
          if (q.id === 'image_generation_failure' && /^(?:configure[-_]then[-_]retry|adjust[-_]brief)$/.test(answer)) generationFailurePending = false
          if (q.id === 'reference_recovery') {
            if (answer === 'no_external_reference') { scope = 'none'; lockedUrls = null }
            if (answer === 'change_sources') { scope = null; references.clear(); readSources.clear(); suppliedUrls = []; lockedUrls = null; currentBrowserUrl = null; referenceReceipt = false; minimumReferences = 2 }
            if (answer === 'use_available_evidence' && readSources.size > 0) { scope = 'public'; minimumReferences = 1 }
          }
          if (q.id === 'design_task_action' && answer === 'start_new_design') {
            references.clear(); readSources.clear(); scope = null; direction = false
            stopped = false; taskBoundaryPending = false; generationFailurePending = false; lockedUrls = null; suppliedUrls = []; currentBrowserUrl = null
            latestImage = null; latestImageRead = false; latestReadFailed = false; generationCount = 0; reviewText = ''; referenceReceipt = false; minimumReferences = 2
          }
          if (q.id === 'design_task_action' && answer === 'continue_current') { taskBoundaryPending = false; stopped = false }
          if (q.id === 'design_task_action' && answer === 'revise_existing' && latestImageRead) { taskBoundaryPending = false; stopped = false; generationCount = 1; reviewText = '' }
          if (q.id === 'design_direction' && !/^(?:skip|cancel|stop|none|other|其他)$/.test(answer) && !/(?:不要|不选|未决定|还没)/.test(answer) && (choice || /^(?:选|使用|采用|choose|use)/i.test(answer))) direction = true
        }
      }
      if (call.name === 'Playwright') {
        const encoded = result.match(/<playwright-action-ledger encoding="base64">([^<]+)<\/playwright-action-ledger>/)?.[1]
        if (!encoded) continue
        try {
          const ledger = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))
          if (ledger.accessLimited || ledger.error) continue
          const url = publicUrl(ledger.url)
          const screenshot = ledger.screenshotPath ?? result.match(/(?:^|\n)Local screenshot path:\s*([^\n]+)/)?.[1]?.trim()
          currentBrowserUrl = url
          if (scope === 'public' && !stopped && url && screenshot && (!lockedUrls || lockedUrls.includes(url))) references.set(fileKey(screenshot), url)
        } catch { /* Invalid ledger is not visual evidence. */ }
      }
      if (call.name === 'Read' && image(b.content)) {
        const url = references.get(fileKey(call.input?.file_path ?? ''))
        if (url) readSources.add(url)
      }
      if (call.name === 'image_generation' && call.input?.operation === 'generate' && /Image generation status:\s*generated\./.test(result)) {
        const p = result.match(/(?:^|\n)Image:\s*(.+?\.(?:png|jpe?g|webp))\s*(?:\r?\n|$)/i)?.[1]
        if (p) { latestImage = p.trim(); latestImageRead = false; latestReadFailed = false; generationCount += 1; reviewText = '' }
      }
    }
  }
  return { scope, direction, stopped, taskBoundaryPending, lockedUrls, currentBrowserUrl, minimumReferences, sources: [...readSources], referenceReceipt, latestImage, latestImageRead, latestReadFailed, generationCount, generationFailurePending, reviewText }
}

/** Enforce before hooks/tool.call: terminal reminders cannot prevent a paid request. */
export function uiuxImageToolViolation(toolName: string, input: any, messages: readonly MessageLike[], active = isUiuxImageOnlySession()): string | null {
  if (!active) return null
  const generate = toolName === 'image_generation' && input?.operation === 'generate'
  const chooseDirection = toolName === 'AskUserQuestion' && input?.questions?.some((q: any) => q.id === 'design_direction')
  const research = toolName === 'Playwright'
  if (!generate && !chooseDirection && !research) return null
  const s = collectUiuxImageEvidence(messages)
  if (s.stopped) return 'UIUX_STOPPED: The user stopped this task. No production or research action was sent. Wait for a new request; use design_task_action only when task boundaries need clarification.'
  if (s.taskBoundaryPending) return 'UIUX_TASK_BOUNDARY_REQUIRED: Additional image material arrived after direction or generation. Use AskUserQuestion id=design_task_action to resolve continue_current, start_new_design or revise_existing. Preserve the existing generated image until that answer.'
  if (research) {
    if (!s.scope) return 'UIUX_INSPIRATION_REQUIRED: Resolve inspiration_sources before public research.'
    if (s.scope === 'none') return 'UIUX_RESEARCH_DISABLED: The user declined external references. Do not open websites.'
    if (s.lockedUrls) {
      if (!s.lockedUrls.length) return 'UIUX_REFERENCE_URLS_REQUIRED: AskUserQuestion for the promised source URLs; do not invent a replacement.'
      if (!Array.isArray(input?.actions) || !input.actions.length) return 'UIUX_REFERENCE_SCOPE: Explicit read-only actions are required within the locked source scope.'
      let current = s.currentBrowserUrl
      for (const action of input.actions) {
        if (!['navigate', 'scroll', 'wait', 'extract', 'screenshot'].includes(action.type) || action.script) return 'UIUX_REFERENCE_SCOPE: Within locked pages use navigate, scroll, wait, extract or screenshot, not uncontrolled navigation.'
        if (action.type === 'navigate') current = publicUrl(action.url)
        if (!current || !s.lockedUrls.includes(current)) return 'UIUX_REFERENCE_SCOPE: This action is outside the exact user-approved URLs. Ask before changing sources.'
      }
    }
    return null
  }
  if (generate && s.latestImage && !s.latestImageRead) return 'UIUX_IMAGE_PREVIEW_REQUIRED: A generated image exists: ' + s.latestImage + '. No generation request was sent. Repair the host preview and Read this existing file. Do not regenerate, lower quality, or change Provider settings to fix a preview error.'
  if (!s.scope) return 'UIUX_INSPIRATION_REQUIRED: AskUserQuestion id=inspiration_sources must resolve reference scope before design_direction or generation.'
  if (s.scope === 'public' && (s.sources.length < s.minimumReferences || !s.referenceReceipt)) return 'UIUX_REFERENCE_IMAGES_REQUIRED: Before direction selection or generation, Read screenshots from two distinct public pages and write <visual-reference-receipt> from visible pixels. Page text, failed Reads and duplicate URLs do not count. If blocked, AskUserQuestion id=reference_recovery to explicitly use_available_evidence, no_external_reference, change_sources, or stop; do not silently continue.'
  if (generate && s.generationFailurePending) return 'UIUX_GENERATION_RECOVERY_REQUIRED: The previous Provider generation failed. AskUserQuestion id=image_generation_failure with configure_then_retry, adjust_brief or stop before another paid request.'
  if (generate && !s.direction) return 'UIUX_DIRECTION_REQUIRED: AskUserQuestion id=design_direction is required unless the user explicitly delegated selection.'
  if (generate && s.latestImage) {
    if (s.generationCount >= 2) return 'UIUX_REVISION_LIMIT: One targeted revision already exists. Read the latest image and report remaining defects as NEEDS WORK; no paid request was sent.'
    if (!/<image-revision-brief>[\s\S]{20,}<\/image-revision-brief>/.test(s.reviewText) || !s.reviewText.includes(s.latestImage)) return 'UIUX_PIXEL_REVIEW_REQUIRED: Before a revision, describe the visible defect, exact latest image path, preserved facts and correction inside <image-revision-brief>. A preview failure is not a visual defect.'
  }
  return null
}


export function uiuxImageBrowserOverrides(active = isUiuxImageOnlySession()) {
  return active ? { visible: false, slowMoMs: 0, screenshotFullPage: false, presentation: undefined, preserveHumanVerificationPage: false } : {}
}
