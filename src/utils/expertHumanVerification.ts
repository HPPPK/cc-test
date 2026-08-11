export const EXPERT_HUMAN_VERIFICATION_RESOLUTIONS = [
  'verification_completed',
  'switch_public_entry',
  'record_evidence_gap',
] as const

export type ExpertHumanVerificationResolution =
  (typeof EXPERT_HUMAN_VERIFICATION_RESOLUTIONS)[number]

export type ExpertBrowserVerificationContext = {
  url: string
  title?: string
  detail?: string
  engine?: string
}

type QuestionOption = {
  id?: unknown
  label?: unknown
}

function inputRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function choicesForQuestion(question: Record<string, unknown>): QuestionOption[] {
  const choices = question.choices ?? question.options
  return Array.isArray(choices)
    ? choices.filter((choice): choice is QuestionOption => Boolean(choice && typeof choice === 'object'))
    : []
}

export function isExpertBrowserVerificationContext(value: unknown): value is ExpertBrowserVerificationContext {
  const record = inputRecord(value)
  if (!record || typeof record.url !== 'string' || !record.url.trim()) return false
  return ['title', 'detail', 'engine'].every((key) => record[key] === undefined || typeof record[key] === 'string')
}

/**
 * Legacy AskUserQuestion recognizer retained for old transcripts and packs.
 * New Expert browser handoffs never use this model-supplied question envelope.
 */
export function isExpertHumanVerificationInput(input: unknown): input is Record<string, unknown> {
  const record = inputRecord(input)
  const questions = record?.questions
  if (!Array.isArray(questions)) return false

  return questions.some((item) => {
    const question = inputRecord(item)
    if (!question) return false
    const optionIds = new Set(
      choicesForQuestion(question)
        .map((choice) => typeof choice.id === 'string' ? choice.id : '')
        .filter(Boolean),
    )
    return EXPERT_HUMAN_VERIFICATION_RESOLUTIONS.every((resolution) => optionIds.has(resolution))
  })
}

const HUMAN_VERIFICATION_LANGUAGE = /验证码|滑块|人机验证|安全验证|访问验证|验证页面|CAPTCHA|captcha|human[ -]?verification|browser[ -]?verification/i
const HUMAN_VERIFICATION_RESOLUTION_LANGUAGE = /完成.*验证|验证.*完成|已.*验证|不做.*验证|跳过.*验证|改查|换.*入口|其他.*入口|公开入口|证据缺口|记录.*缺口|放弃.*入口/i

/**
 * Detects an Expert model attempting to turn a browser CAPTCHA into a normal
 * AskUserQuestion card. It intentionally requires both verification language
 * and a resolution-like choice, so ordinary research questions keep working.
 */
export function isExpertBrowserVerificationQuestionAttempt(input: unknown): boolean {
  if (isExpertHumanVerificationInput(input)) return true

  const record = inputRecord(input)
  const questions = record?.questions
  if (!Array.isArray(questions)) return false

  return questions.some((item) => {
    const question = inputRecord(item)
    if (!question) return false
    const questionText = ['id', 'prompt', 'question', 'header']
      .map((key) => typeof question[key] === 'string' ? question[key] : '')
      .join(' ')
    if (!HUMAN_VERIFICATION_LANGUAGE.test(questionText)) return false

    const choiceText = choicesForQuestion(question)
      .map((choice) => [choice.id, choice.label].filter((value): value is string => typeof value === 'string').join(' '))
      .join(' ')
    return HUMAN_VERIFICATION_RESOLUTION_LANGUAGE.test(choiceText)
  })
}
