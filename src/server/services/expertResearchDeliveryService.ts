export type ExpertResearchDeliveryPolicy = {
  questionId: string
  acceptedChoiceId: string
  continueChoiceIds: string[]
  pauseChoiceIds: string[]
}

export type ExpertResearchDeliveryStatus =
  | 'awaiting-user-decision'
  | 'accepted-current-scope'
  | 'continue-research'
  | 'paused'

export type ExpertResearchDeliveryState = {
  status: ExpertResearchDeliveryStatus
  questionId: string
  selectedChoiceId: string
  unresolvedEvidence: string[]
  decidedAt: string
}

type JsonRecord = Record<string, unknown>

type ResearchDeliveryInput = {
  questionId: string
  choiceIds: string[]
  unresolvedEvidence?: string[]
  decidedAt: string
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function stringArray(value: unknown, field: string): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some((item) => !nonEmptyString(item))) {
    throw new Error(`researchDelivery.${field} 必须是非空字符串数组。`)
  }
  return [...new Set(value.map((item) => (item as string).trim()))]
}

/**
 * Reads the optional, ZIP-declared delivery policy from an Expert output protocol.
 * Omitted policies preserve legacy Expert behaviour, so this mechanism is opt-in
 * per pack rather than tied to any hard-coded Expert ID.
 */
export function resolveExpertResearchDeliveryPolicy(outputProtocolContent?: string): ExpertResearchDeliveryPolicy | undefined {
  if (!outputProtocolContent?.trim()) return undefined

  let document: unknown
  try {
    document = JSON.parse(outputProtocolContent)
  } catch {
    throw new Error('专家输出协议不是有效 JSON，无法读取 researchDelivery 交付规则。')
  }
  if (!isRecord(document) || document.researchDelivery === undefined) return undefined
  if (!isRecord(document.researchDelivery)) {
    throw new Error('researchDelivery 必须是对象。')
  }

  const raw = document.researchDelivery
  if (raw.requireExplicitUserDecisionBeforeFinalOutput !== true) return undefined

  const questionId = nonEmptyString(raw.questionId)
  const acceptedChoiceId = nonEmptyString(raw.acceptedChoiceId)
  if (!questionId || !acceptedChoiceId) {
    throw new Error('启用 researchDelivery 时必须提供 questionId 和 acceptedChoiceId。')
  }

  const continueChoiceIds = stringArray(raw.continueChoiceIds, 'continueChoiceIds')
  const pauseChoiceIds = stringArray(raw.pauseChoiceIds, 'pauseChoiceIds')
  const allChoiceIds = [acceptedChoiceId, ...continueChoiceIds, ...pauseChoiceIds]
  if (new Set(allChoiceIds).size !== allChoiceIds.length) {
    throw new Error('researchDelivery 的各个 choice ID 不能重复。')
  }

  return { questionId, acceptedChoiceId, continueChoiceIds, pauseChoiceIds }
}

export function resolveExpertResearchDeliveryDecision(
  policy: ExpertResearchDeliveryPolicy,
  input: ResearchDeliveryInput,
): ExpertResearchDeliveryState {
  if (input.questionId !== policy.questionId) {
    throw new Error('研究交付确认的问题 ID 与当前专家包声明不一致。')
  }

  const choiceIds = [...new Set(input.choiceIds.map((choiceId) => choiceId.trim()).filter(Boolean))]
  if (choiceIds.length !== 1) {
    throw new Error('研究交付确认必须选择且只能选择一个预设选项。')
  }

  const selectedChoiceId = choiceIds[0]!
  const status: ExpertResearchDeliveryStatus = selectedChoiceId === policy.acceptedChoiceId
    ? 'accepted-current-scope'
    : policy.continueChoiceIds.includes(selectedChoiceId)
      ? 'continue-research'
      : policy.pauseChoiceIds.includes(selectedChoiceId)
        ? 'paused'
        : 'awaiting-user-decision'

  if (status === 'awaiting-user-decision') {
    throw new Error('所选研究交付确认选项不在当前专家包允许范围内。')
  }

  const unresolvedEvidence = [...new Set((input.unresolvedEvidence ?? [])
    .map((item) => item.trim())
    .filter(Boolean))]

  return {
    status,
    questionId: policy.questionId,
    selectedChoiceId,
    unresolvedEvidence,
    decidedAt: input.decidedAt,
  }
}

export function hasAcceptedExpertResearchDelivery(
  state: ExpertResearchDeliveryState | undefined,
): boolean {
  return state?.status === 'accepted-current-scope'
}
