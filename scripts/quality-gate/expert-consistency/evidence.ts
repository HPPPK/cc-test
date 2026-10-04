export type PageEvidence = { url: string; text: string; toolUseId: string; audited: boolean; extracted: boolean; accessLimited?: boolean; isError?: boolean }
export type LiveEvidence = { asked: boolean; answerMatched: boolean; briefSaved: boolean; agentStarted: boolean; bindingMatched: boolean; sourcePackageMatched: boolean; pages: PageEvidence[] }
export function evaluateLiveEvidence(evidence: LiveEvidence) {
  const missing = Object.entries(evidence).filter(([key, value]) => key !== 'pages' && value !== true).map(([key]) => key)
  const page = evidence.pages.find(p => {
    try { return new URL(p.url).pathname.split('/').filter(Boolean).length > 0 && p.text.trim().length >= 160 && Boolean(p.toolUseId) && p.extracted && p.audited && !p.accessLimited && !p.isError } catch { return false }
  })
  if (!page) missing.push('concrete-body-extraction-with-audit')
  return { passed: missing.length === 0, missing, pageUrl: page?.url }
}
export function selectFlash(providers: Array<{ id: string; model?: string; smallFastModel?: string; haikuModel?: string }>, active?: string) {
  const sorted = [...providers].sort((a, b) => Number(b.id === active) - Number(a.id === active))
  for (const p of sorted) {
    const model = [p.model, p.smallFastModel, p.haikuModel].find(m => m && /^deepseek.*flash$/i.test(m))
    if (model) return { providerId: p.id, model }
  }
}
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, /api.?key|authorization|token|secret|password/i.test(k) ? '[REDACTED]' : redact(v)]))
  if (typeof value === 'string') return value.replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]').replace(/([?&](?:api_key|key|token)=)[^&\s]+/gi, '$1[REDACTED]')
  return value
}

export function answerFixtureQuestion(question: { question?: string; prompt?: string; header?: string; options?: unknown; choices?: unknown }): string | undefined {
  const text = [question.header, question.question, question.prompt].join(' ')
  if (/研究对象|调研.{0,8}对象|现有.*Quicker|Quicker.*现有/.test(text)) return '拟开发新品；Quicker 仅作为参照竞品，面向桌面重复操作的效率工具。'
  if (/中键.*(能力|触发)|触发.*能力/.test(text)) return '中键弹出可自定义动作面板；手势不是本次核心能力。'
  if (/目标用户|面向.*用户|用户.*群|人群/.test(text)) return '目标用户尚未确定，请作为待验证假设；通过公开研究比较不同人群，不预设已验证需求。'
  if (/材料|文档|原型/.test(text)) return '目前没有私有材料、原型或数据；直接使用公开资料，未知条件标注待验证假设。'
  return undefined
}
