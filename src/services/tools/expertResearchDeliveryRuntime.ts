type ResearchDeliveryQuestionMetadata = {
  question_id?: string
  unresolved_evidence?: string[]
}

type ResearchDeliveryChoice = {
  id?: string
  label?: string
  description?: string
}

type ResearchDeliveryQuestion = {
  id?: string
  prompt?: string
  question?: string
  header?: string
  choices?: ResearchDeliveryChoice[]
  options?: ResearchDeliveryChoice[]
  metadata?: ResearchDeliveryQuestionMetadata
}

type ExpertResearchDeliveryPolicy = {
  questionId: string
  acceptedChoiceId: string
  continueChoiceIds: string[]
  pauseChoiceIds: string[]
}

type ResearchDeliveryMetadata = {
  expert_research_delivery?: {
    question_id?: string
    unresolved_evidence?: string[]
  }
}
type ExpertResearchDeliveryContractInput = {
  questions: ResearchDeliveryQuestion[]
  metadata?: ResearchDeliveryMetadata
}

export type ExpertResearchDeliveryRuntimeInput = {
  questions: ResearchDeliveryQuestion[]
  answers?: Record<string, string>
  answerChoiceIds?: Record<string, string[]>
  metadata?: ResearchDeliveryMetadata
}

export type ExpertResearchDeliveryRuntimeDependencies = {
  env: Record<string, string | undefined>
  fetch: typeof fetch
  sleep?: (ms: number) => Promise<void>
  maxAttempts?: number
}

function parseExpertResearchDeliveryPolicy(
  env: Record<string, string | undefined>,
): ExpertResearchDeliveryPolicy | undefined {
  const raw = (
    env.CC_JIANGXIA_EXPERT_RESEARCH_DELIVERY_POLICY
    ?? env.CC_HAHA_EXPERT_RESEARCH_DELIVERY_POLICY
  )?.trim()
  if (!raw) return undefined

  try {
    const parsed = JSON.parse(raw) as Partial<ExpertResearchDeliveryPolicy>
    const choiceLists = [parsed.continueChoiceIds, parsed.pauseChoiceIds]
    if (
      typeof parsed.questionId !== 'string' || !parsed.questionId.trim()
      || typeof parsed.acceptedChoiceId !== 'string' || !parsed.acceptedChoiceId.trim()
      || choiceLists.some((choices) => !Array.isArray(choices) || choices.some((choice) => typeof choice !== 'string' || !choice.trim()))
    ) {
      return undefined
    }
    return {
      questionId: parsed.questionId.trim(),
      acceptedChoiceId: parsed.acceptedChoiceId.trim(),
      continueChoiceIds: [...new Set(parsed.continueChoiceIds.map((choice) => choice.trim()))],
      pauseChoiceIds: [...new Set(parsed.pauseChoiceIds.map((choice) => choice.trim()))],
    }
  } catch {
    return undefined
  }
}

function deliveryMetadataQuestions(input: ExpertResearchDeliveryContractInput): ResearchDeliveryQuestion[] {
  return input.questions.filter((question) => question.metadata?.question_id?.trim())
}

const DELIVERY_LANGUAGE = /交付|报告输出|生成(?:当前)?报告|最终(?:报告|输出)|deliver(?:y)?/i
const DELIVERY_SCOPE_LANGUAGE = /证据缺口|当前范围|补充(?:资料|材料|链接)|暂停(?:研究|输出)|evidence[ -]?gap|current[ -]?scope/i
const LEGACY_DELIVERY_ID = /(?:delivery|deliver|evidence[_-]?gap)/i

function questionText(question: ResearchDeliveryQuestion): string {
  return [question.id, question.prompt, question.question, question.header]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
}

function choiceText(question: ResearchDeliveryQuestion): string {
  return (question.choices ?? question.options ?? [])
    .flatMap((choice) => [choice.id, choice.label, choice.description])
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
}

/**
 * A final-delivery question is still a final-delivery question when a model
 * omits the required metadata. Detect that narrow intent before Desktop shows
 * it, otherwise the user can answer a card that the CLI will never recognize.
 */
function looksLikeResearchDeliveryAttempt(input: ExpertResearchDeliveryContractInput): boolean {
  return input.questions.some((question) => {
    const prompt = questionText(question)
    const choices = choiceText(question)
    return LEGACY_DELIVERY_ID.test(String(question.id ?? ''))
      || (DELIVERY_LANGUAGE.test(prompt) && DELIVERY_SCOPE_LANGUAGE.test(prompt + ' ' + choices))
  })
}

function normalizedChoiceLabel(id: string, fallback: string): string {
  if (/accept|current/i.test(id)) return '接受当前范围（推荐）'
  if (/material|provide|continue/i.test(id)) return '补充材料后继续'
  if (/pause|stop/i.test(id)) return '暂缓报告'
  return fallback
}

/**
 * A ZIP-scoped final-delivery card has a stable server contract. Models still
 * write the explanatory prompt and evidence gaps, but the runtime supplies the
 * contract IDs and prevents a harmless wording variation from becoming a
 * user-visible dead end. Ordinary AskUserQuestion cards remain untouched.
 */
export function normalizeExpertResearchDeliveryQuestionContract<T extends ExpertResearchDeliveryContractInput>(
  input: T,
  env: Record<string, string | undefined> = process.env,
): T {
  const policy = parseExpertResearchDeliveryPolicy(env)
  if (!policy || !looksLikeResearchDeliveryAttempt(input) || input.questions.length !== 1) return input

  const question = input.questions[0]!
  const supplied = [...(question.choices ?? question.options ?? [])]
  const used = new Set<number>()
  const take = (pattern: RegExp): ResearchDeliveryChoice | undefined => {
    const index = supplied.findIndex((choice, candidateIndex) => !used.has(candidateIndex) && pattern.test([choice.id, choice.label, choice.description].filter(Boolean).join(' ')))
    if (index < 0) return undefined
    used.add(index)
    return supplied[index]
  }
  const expectedIds = [policy.acceptedChoiceId, ...policy.continueChoiceIds, ...policy.pauseChoiceIds]
  const fallbackByIndex = (index: number): ResearchDeliveryChoice | undefined => {
    const candidateIndex = supplied.findIndex((_choice, sourceIndex) => !used.has(sourceIndex) && sourceIndex >= index)
    const indexToUse = candidateIndex >= 0 ? candidateIndex : supplied.findIndex((_choice, sourceIndex) => !used.has(sourceIndex))
    if (indexToUse < 0) return undefined
    used.add(indexToUse)
    return supplied[indexToUse]
  }
  const choices = expectedIds.map((id, index) => {
    const exactIndex = supplied.findIndex((choice, candidateIndex) => !used.has(candidateIndex) && choice.id === id)
    const exact = exactIndex >= 0 ? (used.add(exactIndex), supplied[exactIndex]) : undefined
    const inferred = exact
      ?? (id === policy.acceptedChoiceId ? take(/接受|当前范围|accept|current/i) : undefined)
      ?? (policy.pauseChoiceIds.includes(id) ? take(/暂停|暂缓|暂不|pause|stop/i) : take(/补充|材料|继续|provide|material|continue/i))
      ?? fallbackByIndex(index)
    const fallback = id === policy.acceptedChoiceId ? '接受当前范围（推荐）' : policy.pauseChoiceIds.includes(id) ? '暂缓报告' : '补充材料后继续'
    return {
      ...(inferred ?? {}),
      id,
      label: typeof inferred?.label === 'string' && inferred.label.trim() ? inferred.label : normalizedChoiceLabel(id, fallback),
    }
  })
  const { options: _options, ...baseQuestion } = question
  const rootDelivery = input.metadata?.expert_research_delivery
  const unresolvedEvidence = rootDelivery?.unresolved_evidence ?? question.metadata?.unresolved_evidence
  return {
    ...input,
    questions: [{
      ...baseQuestion,
      id: policy.questionId,
      choices,
      metadata: {
        ...question.metadata,
        question_id: policy.questionId,
        ...(unresolvedEvidence ? { unresolved_evidence: unresolvedEvidence } : {}),
      },
    }],
    metadata: {
      ...input.metadata,
      expert_research_delivery: {
        ...rootDelivery,
        question_id: policy.questionId,
        ...(unresolvedEvidence ? { unresolved_evidence: unresolvedEvidence } : {}),
      },
    },
  }
}

/**
 * Rejects a model-authored final delivery card unless it exactly matches the
 * ZIP-declared policy injected for this active Expert process. This runs before
 * Desktop displays a permission card, so an invalid model ID cannot consume a
 * user response and then loop at final rendering time.
 */
/**
 * Normalizes the persisted response with the same ZIP-scoped delivery
 * contract used before the card is displayed. This closes the UI/runtime gap:
 * a legacy Desktop response can still carry the model's pre-normalization IDs.
 */
export function normalizeExpertResearchDeliveryResponseContract<T extends ExpertResearchDeliveryRuntimeInput>(
  input: T,
  env: Record<string, string | undefined> = process.env,
): T {
  const normalizedContract = normalizeExpertResearchDeliveryQuestionContract({
    questions: input.questions,
    ...(input.metadata ? { metadata: input.metadata } : {}),
  }, env)
  if (normalizedContract.questions === input.questions && normalizedContract.metadata === input.metadata) return input

  const originalQuestion = input.questions[0]
  const normalizedQuestion = normalizedContract.questions[0]
  if (!originalQuestion || !normalizedQuestion) return input
  const originalChoices = originalQuestion.choices ?? originalQuestion.options ?? []
  const normalizedChoices = normalizedQuestion.choices ?? normalizedQuestion.options ?? []
  const originalQuestionId = originalQuestion.id
  const normalizedQuestionId = normalizedQuestion.id
  if (!originalQuestionId || !normalizedQuestionId) return input

  const choiceIdMap = new Map<string, string>()
  originalChoices.forEach((choice, index) => {
    const oldId = choice.id?.trim()
    const canonicalId = normalizedChoices[index]?.id?.trim()
    if (oldId && canonicalId) choiceIdMap.set(oldId, canonicalId)
  })

  const originalChoiceIds = input.answerChoiceIds?.[originalQuestionId]
  const normalizedChoiceIds = originalChoiceIds?.map((choiceId) => choiceIdMap.get(choiceId) ?? choiceId)
  const answers = { ...(input.answers ?? {}) }
  if (Object.prototype.hasOwnProperty.call(answers, originalQuestionId)) {
    const answer = answers[originalQuestionId]
    delete answers[originalQuestionId]
    answers[normalizedQuestionId] = answer
  }
  const answerChoiceIds = { ...(input.answerChoiceIds ?? {}) }
  if (Object.prototype.hasOwnProperty.call(answerChoiceIds, originalQuestionId)) {
    delete answerChoiceIds[originalQuestionId]
    if (normalizedChoiceIds) answerChoiceIds[normalizedQuestionId] = normalizedChoiceIds
  }

  return {
    ...input,
    questions: normalizedContract.questions,
    ...(Object.keys(answers).length > 0 ? { answers } : {}),
    ...(Object.keys(answerChoiceIds).length > 0 ? { answerChoiceIds } : {}),
    ...(normalizedContract.metadata ? { metadata: normalizedContract.metadata } : {}),
  } as T
}

export function validateExpertResearchDeliveryQuestionContract(
  input: ExpertResearchDeliveryContractInput,
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const rootDelivery = input.metadata?.expert_research_delivery
  const questionDeliveries = deliveryMetadataQuestions(input)
  const policy = parseExpertResearchDeliveryPolicy(env)
  // Packages without a declared policy preserve the ordinary AskUserQuestion
  // behavior. A policy-enabled Expert must also reject an unmarked card that
  // plainly asks to accept evidence gaps and deliver the final report.
  if (!policy) return undefined
  const deliveryAttempt = Boolean(rootDelivery) || questionDeliveries.length > 0 || looksLikeResearchDeliveryAttempt(input)
  if (!deliveryAttempt) return undefined

  const expectedChoiceIds = [
    policy.acceptedChoiceId,
    ...policy.continueChoiceIds,
    ...policy.pauseChoiceIds,
  ]
  const repair = [
    '这张正式交付问题卡未展示给用户，因为它不符合当前 Expert 的固定交付合同。',
    '只发送一个问题；问题 ID 与 metadata.expert_research_delivery.question_id 都必须为 ' + policy.questionId + '。',
    '选项 ID 只能使用：' + expectedChoiceIds.join('、') + '；并且必须包含 ' + policy.acceptedChoiceId + '。',
    '请用这些固定 ID 重新调用 AskUserQuestion；不要自行创建 delivery_confirm_*、deliver 或其他 ID。',
  ].join(' ')

  if (input.questions.length !== 1) return repair
  const question = input.questions[0]
  if (!question || question.id !== policy.questionId) return repair
  if (rootDelivery?.question_id?.trim() !== policy.questionId) return repair
  if (questionDeliveries.length > 1) return repair
  if (questionDeliveries.length === 1 && question.metadata?.question_id?.trim() !== policy.questionId) return repair

  const choiceIds = (question.choices ?? question.options ?? []).map((choice) => choice.id?.trim())
  if (
    choiceIds.some((choiceId) => !choiceId)
    || new Set(choiceIds).size !== choiceIds.length
    || expectedChoiceIds.some((choiceId) => !choiceIds.includes(choiceId))
    || choiceIds.some((choiceId) => !expectedChoiceIds.includes(choiceId!))
  ) {
    return repair
  }

  return undefined
}
function responseMessage(response: Response): Promise<string> {
  return response.json()
    .then((body: { message?: unknown; error?: unknown }) => {
      if (typeof body.message === 'string' && body.message.trim()) return body.message
      if (typeof body.error === 'string' && body.error.trim()) return body.error
      return `Desktop Expert delivery service returned HTTP ${response.status}.`
    })
    .catch(() => `Desktop Expert delivery service returned HTTP ${response.status}.`)
}

class ExpertResearchDeliveryDecisionRejectedError extends Error {
  constructor(status: number, message: string) {
    super(`无法记录研究交付确认：服务端拒绝本次交付确认（HTTP ${status}，${message}）。当前选择没有被当作已确认交付。`)
    this.name = 'ExpertResearchDeliveryDecisionRejectedError'
  }
}

function resolveSelectedChoiceIds(
  input: ExpertResearchDeliveryRuntimeInput,
  questionId: string,
): string[] | undefined {
  const explicitChoiceIds = input.answerChoiceIds?.[questionId]
  if (explicitChoiceIds?.length) return explicitChoiceIds

  // Older Desktop clients persisted only the displayed answer. Recover an ID
  // only when it exactly and uniquely matches a declared preset choice.
  const answer = input.answers?.[questionId]?.trim()
  if (!answer) return undefined

  const question = input.questions.find((candidate) => candidate.id === questionId)
  const matches = (question?.choices ?? question?.options ?? []).filter((choice) =>
    Boolean(choice.id?.trim()) && choice.label?.trim() === answer,
  )
  if (matches.length !== 1) return undefined

  const choiceId = matches[0]?.id?.trim()
  return choiceId ? [choiceId] : undefined
}
function resolveResearchDeliveryMetadata(input: ExpertResearchDeliveryRuntimeInput): ResearchDeliveryQuestionMetadata | undefined {
  const rootMetadata = input.metadata?.expert_research_delivery
  if (rootMetadata?.question_id?.trim()) return rootMetadata

  const questionScoped = input.questions
    .filter((question) => question.metadata?.question_id?.trim())

  if (questionScoped.length === 0) return undefined
  if (questionScoped.length > 1) {
    throw new Error('无法记录研究交付确认：一次 AskUserQuestion 只能有一个问题携带交付确认 metadata。')
  }

  const question = questionScoped[0]
  const questionId = question.metadata?.question_id?.trim()
  if (!questionId || question.id !== questionId) {
    throw new Error('无法记录研究交付确认：问题内的 question_id 必须与该问题的 id 完全一致。')
  }
  return question.metadata
}

function resolveServerUrl(value: string | undefined): string {
  const normalized = value?.trim()
  if (!normalized) {
    throw new Error('无法记录研究交付确认：当前 Expert 会话缺少 Desktop 服务地址。请重新进入专家 Mode 后重试。')
  }
  try {
    return new URL(normalized).toString().replace(/\/$/, '')
  } catch {
    throw new Error(`无法记录研究交付确认：Desktop 服务地址无效（${normalized}）。`)
  }
}

/**
 * Persists a user's explicit research-delivery decision to the Desktop service.
 * This runs only for a question that the selected Expert pack has marked with
 * expert_research_delivery metadata; ordinary AskUserQuestion calls are untouched.
 */
export async function syncExpertResearchDeliveryDecision(
  input: ExpertResearchDeliveryRuntimeInput,
  dependencies: ExpertResearchDeliveryRuntimeDependencies = {
    env: process.env,
    fetch: globalThis.fetch,
  },
): Promise<void> {
  const delivery = resolveResearchDeliveryMetadata(input)
  const questionId = delivery?.question_id?.trim()
  if (!questionId) return

  if (!input.questions.some((question) => question.id === questionId)) {
    throw new Error('无法记录研究交付确认：问题 ID 没有出现在本次 AskUserQuestion 中。')
  }

  const choiceIds = resolveSelectedChoiceIds(input, questionId)
  if (!choiceIds?.length) {
    throw new Error('无法记录研究交付确认：需要桌面端返回所选选项 ID。请用问题卡选择一个预设交付选项，不要改用自由文本回答。')
  }

  const sessionId = (dependencies.env.CC_JIANGXIA_EXPERT_SESSION_ID ?? dependencies.env.EXPERT_SESSION_ID)?.trim()
  if (!sessionId) {
    throw new Error('无法记录研究交付确认：当前 Expert 会话缺少 session ID。请重新进入专家 Mode 后重试。')
  }

  const serverUrl = resolveServerUrl(dependencies.env.CC_JIANGXIA_DESKTOP_SERVER_URL ?? dependencies.env.DESKTOP_SERVER_URL)
  const requestUrl = `${serverUrl}/api/sessions/${encodeURIComponent(sessionId)}/expert/research-delivery`
  const body = JSON.stringify({
    questionId,
    choiceIds,
    unresolvedEvidence: delivery?.unresolved_evidence ?? [],
  })
  const maxAttempts = Math.max(1, Math.min(4, dependencies.maxAttempts ?? 3))
  const sleep = dependencies.sleep ?? (async (ms: number) => { await new Promise<void>((resolve) => setTimeout(resolve, ms)) })
  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await dependencies.fetch(requestUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      })
      if (response.ok) return
      const message = await responseMessage(response)
      if (response.status < 500) {
        throw new ExpertResearchDeliveryDecisionRejectedError(response.status, message)
      }
      if (attempt === maxAttempts) throw new Error(message)
      lastError = new Error(message)
    } catch (error) {
      if (error instanceof ExpertResearchDeliveryDecisionRejectedError) {
        throw error
      }
      lastError = error
      if (attempt === maxAttempts) break
    }
    await sleep(150 * attempt)
  }
  const message = lastError instanceof Error ? lastError.message : String(lastError)
  throw new Error(`无法记录研究交付确认：Desktop 服务连接在 ${maxAttempts} 次尝试后仍不可用（${message}）。当前选择没有被当作已确认交付。`)
}
