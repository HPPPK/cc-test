import { useEffect, useMemo, useRef, useState } from 'react'
import { useChatStore } from '../../stores/chatStore'
import { useTabStore } from '../../stores/tabStore'
import { useTranslation } from '../../i18n'
import { Button } from '../shared/Button'
import { notifyDesktop } from '../../lib/desktopNotifications'

type QuestionOption = {
  id?: string
  label: string
  description?: string
}

type Question = {
  id?: string
  prompt?: string
  question?: string
  header?: string
  choices?: QuestionOption[]
  options?: QuestionOption[]
  multiSelect?: boolean
  /** Only server-authored Expert Intake cards use this to unlock free text. */
  intakeFreeTextOptionId?: string
}

type AskUserInput = {
  questions?: Question[]
  question?: string
  prompt?: string
  header?: string
  choices?: QuestionOption[]
  options?: QuestionOption[]
  multiSelect?: boolean
}

type Props = {
  sessionId?: string | null
  toolUseId: string
  input: unknown
  result?: unknown
  resultIsError?: boolean
}

/**
 * Parse the AskUserQuestion input which may come in different shapes.
 */
function parseInput(input: unknown): Question[] {
  if (!input || typeof input !== 'object') return []
  const obj = input as AskUserInput

  // Shape 1: { questions: [...] }
  if (Array.isArray(obj.questions)) {
    // Older providers sometimes placed multiSelect at the tool root. Preserve
    // that already-issued choice for rendering while newer calls keep it on
    // the individual question.
    return obj.questions.map((question) => ({
      ...question,
      multiSelect: question.multiSelect ?? obj.multiSelect,
    }))
  }

  // Shape 2: { question: "...", options: [...] }
  if (typeof obj.question === 'string') {
    return [{
      question: obj.question ?? obj.prompt,
      prompt: obj.prompt,
      header: obj.header,
      choices: obj.choices,
      options: obj.options,
      multiSelect: obj.multiSelect,
    }]
  }

  return []
}

type QuestionSelections = Record<number, string[]>
type QuestionFreeTexts = Record<number, string>

function questionText(question: Question): string {
  return question.prompt ?? question.question ?? question.id ?? ''
}

function questionKey(question: Question): string {
  return question.id ?? question.question ?? question.prompt ?? ''
}

function questionOptions(question: Question): QuestionOption[] {
  return question.choices ?? question.options ?? []
}

function getSelectedAnswer(question: Question, selected: string[] | undefined) {
  if (!selected || selected.length === 0) return ''
  const labels = selected.map((optionKey) =>
    questionOptions(question).find((option) => (option.id ?? option.label) === optionKey)?.label ?? optionKey,
  )
  return question.multiSelect ? labels.join(', ') : labels[0] ?? ''
}

function resultContentToText(result: unknown): string | null {
  if (typeof result === 'string') return result
  if (!Array.isArray(result)) return null

  const text = result
    .map((block) => {
      if (typeof block === 'string') return block
      if (!block || typeof block !== 'object') return ''
      const textBlock = block as { type?: unknown; text?: unknown }
      return textBlock.type === 'text' && typeof textBlock.text === 'string'
        ? textBlock.text
        : ''
    })
    .filter(Boolean)
    .join('\n')

  return text || null
}

function decodePersistedResultText(text: string): string {
  return text
    .replace(/&quot;|&#34;|&#x22;/gi, '"')
    .replace(/&apos;|&#39;|&#x27;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
}

function parsePersistedResultAnswers(result: unknown, questions: Question[]): Record<string, string> {
  const text = resultContentToText(result)
  if (!text) return {}

  const decoded = decodePersistedResultText(text)
  const prefix = 'User has answered your questions: '
  const start = decoded.indexOf(prefix)
  if (start === -1) return {}

  const suffix = ". You can now continue with the user's answers in mind."
  const bodyStart = start + prefix.length
  const suffixStart = decoded.indexOf(suffix, bodyStart)
  const body = decoded.slice(bodyStart, suffixStart === -1 ? undefined : suffixStart)
  const answers: Record<string, string> = {}

  for (const question of questions) {
    const marker = `"${questionKey(question)}"="`
    const answerStart = body.indexOf(marker)
    if (answerStart === -1) continue

    const valueStart = answerStart + marker.length
    const valueEnd = body.indexOf('"', valueStart)
    const value = body.slice(valueStart, valueEnd === -1 ? undefined : valueEnd).trim()
    if (value) answers[questionKey(question)] = value
  }

  return answers
}

export function AskUserQuestion({ sessionId, toolUseId, input, result, resultIsError = false }: Props) {
  const { respondToPermission } = useChatStore()
  const activeTabId = useTabStore((s) => s.activeTabId)
  const targetSessionId = sessionId ?? activeTabId
  const pendingPermission = useChatStore((s) => targetSessionId ? s.sessions[targetSessionId]?.pendingPermission : undefined)
  const permissionResponse = useChatStore((s) => targetSessionId ? s.sessions[targetSessionId]?.permissionResponse : undefined)
  const answeredQuestion = useChatStore((s) => targetSessionId
    ? s.sessions[targetSessionId]?.answeredAskUserQuestions?.[toolUseId]
    : undefined)
  const t = useTranslation()
  const questions = parseInput(input)
  const questionPreview = questionText(questions[0] ?? {}).trim()
  const inputObject = (input && typeof input === 'object') ? input as Record<string, unknown> : {}
  const [activeTab, setActiveTab] = useState(0)
  const [selections, setSelections] = useState<QuestionSelections>({})
  const [freeTexts, setFreeTexts] = useState<QuestionFreeTexts>({})
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const [submissionRequestId, setSubmissionRequestId] = useState<string | null>(null)
  const [submissionStatus, setSubmissionStatus] = useState<'idle' | 'submitting' | 'stale'>('idle')
  const [submissionMessage, setSubmissionMessage] = useState<string | null>(null)
  const composingRef = useRef(false)

  useEffect(() => {
    if (!submissionRequestId || permissionResponse?.requestId !== submissionRequestId) return
    if (permissionResponse.status === 'accepted') {
      setHasSubmitted(true)
      setSubmissionStatus('idle')
      setSubmissionMessage(null)
      return
    }
    if (permissionResponse.status === 'stale') {
      setSubmissionStatus('stale')
      setSubmissionMessage(permissionResponse.message ?? 'This question has expired because the workflow was updated.')
      return
    }
    if (permissionResponse.status === 'rejected') {
      setSubmissionRequestId(null)
      setSubmissionStatus('idle')
      setSubmissionMessage(permissionResponse.message ?? 'The response was rejected. Please choose again.')
    }
  }, [permissionResponse, submissionRequestId])

  if (questions.length === 0) return null
  const safeActiveTab = Math.min(activeTab, questions.length - 1)
  const activeQuestion = questions[safeActiveTab]

  const resultAnswers = useMemo(() => {
    if (result && typeof result === 'object' && !Array.isArray(result)) {
      const answers = (result as { answers?: unknown }).answers
      if (answers && typeof answers === 'object') {
        return answers as Record<string, string>
      }
    }
    return parsePersistedResultAnswers(result, questions)
  }, [questions, result])
  const resultText = resultContentToText(result)?.trim() ?? ''
  const hasStructuredAnswers = Object.keys(resultAnswers).length > 0
  const acceptedAnswers = hasStructuredAnswers
    ? resultAnswers
    : answeredQuestion?.status === 'accepted'
      ? answeredQuestion.answers
      : {}
  const hasAcceptedAnswers = Object.keys(acceptedAnswers).length > 0
  // Persist this pending submission at session scope too: a tab/window remount
  // must not revive the full form during the short acknowledgement race. A
  // rejected acknowledgement removes this entry and reopens the question.
  const submittedAnswers = answeredQuestion?.status === 'submitting'
    ? answeredQuestion.answers
    : {}
  const hasSubmittedAnswers = Object.keys(submittedAnswers).length > 0
  const hasTerminalResult = hasStructuredAnswers || resultText.length > 0
  const hasTerminalFailure = resultIsError
    || resultText.includes('<tool_use_error>')
    || resultText.startsWith('Tool permission request failed:')

  // A tool_use event is only a model proposal. The card becomes actionable
  // when the server has bound that exact tool use to the active permission
  // request. This prevents a failed/retried tool invocation from rendering a
  // second disabled question form beside the real one.
  const pendingRequest = pendingPermission?.toolName === 'AskUserQuestion'
    && pendingPermission.toolUseId === toolUseId
    ? pendingPermission
    : null
  // If an acknowledgement reaches an older card before the transcript has
  // flushed its tool_result, close only the exact acknowledged question. This
  // prevents a tab/window remount from reviving a non-functional form without
  // hiding any other pending question in the same session.
  const hasLegacyAcceptedAcknowledgement = !hasStructuredAnswers
    && !answeredQuestion
    && !pendingRequest
    && permissionResponse?.status === 'accepted'
    && permissionResponse.toolUseId === toolUseId
  const hasClosedAnswer = hasAcceptedAnswers || hasSubmittedAnswers || hasLegacyAcceptedAcknowledgement
  const answeredText = useMemo(() => {
    const compactAnswers = hasAcceptedAnswers ? acceptedAnswers : submittedAnswers
    if (Object.keys(compactAnswers).length > 0) {
      return questions
        .map((question) => compactAnswers[questionKey(question)])
        .filter((answer): answer is string => typeof answer === 'string' && answer.trim().length > 0)
        .join(', ')
    }
    if (hasLegacyAcceptedAcknowledgement) return t('question.completed')
    if (resultText) return resultText
    return questions
      .map((question, index) => freeTexts[index]?.trim() || getSelectedAnswer(question, selections[index]))
      .filter(Boolean)
      .join('; ')
  }, [acceptedAnswers, freeTexts, hasAcceptedAnswers, hasLegacyAcceptedAcknowledgement, questions, resultText, selections, submittedAnswers, t])
  const compactAnswerPrefix = hasSubmittedAnswers
    ? t('question.submittedPrefix')
    : t('question.answeredPrefix')
  const submitted = hasTerminalResult || hasClosedAnswer || hasSubmitted
  const interactionLocked = submitted || submissionStatus === 'submitting' || submissionStatus === 'stale'
  const terminalWithoutAnswers = submitted && !hasAcceptedAnswers && resultText.length > 0

  useEffect(() => {
    if (!pendingRequest || hasTerminalResult || !targetSessionId) return

    void notifyDesktop({
      dedupeKey: `ask-user-question:${targetSessionId}:${pendingRequest.requestId}`,
      title: t('question.needsInput'),
      ...(questionPreview ? { body: questionPreview.slice(0, 160) } : {}),
      requestAttention: true,
      target: { type: 'session', sessionId: targetSessionId },
    })
  }, [hasTerminalResult, pendingRequest?.requestId, questionPreview, t, targetSessionId])

  // Historical completed cards remain compact, and terminal failures retain
  // their alert. A non-terminal tool use without a matching pending request is
  // either queued behind another request or a superseded proposal. The store
  // promotes queued requests after the displayed request is resolved.
  if (!pendingRequest && !hasTerminalResult && !hasClosedAnswer) return null

  if (hasClosedAnswer) {
    return (
      <div className="mb-3 rounded-[var(--radius-md)] border border-[var(--color-outline-variant)]/30 bg-[var(--color-surface-container-low)] px-3 py-2">
        <div className="flex items-start gap-2 text-xs text-[var(--color-text-secondary)]">
          <span className="material-symbols-outlined mt-[1px] text-[14px] text-[var(--color-success)]">check_circle</span>
          <span>
            {compactAnswerPrefix}<strong>{answeredText}</strong>
          </span>
        </div>
      </div>
    )
  }

  if (hasTerminalFailure) {
    return (
      <div
        role="alert"
        className="mb-3 rounded-[var(--radius-md)] border border-[var(--color-error)]/30 bg-[var(--color-error-container)]/20 px-3 py-2"
      >
        <div className="flex items-start gap-2 text-xs text-[var(--color-error)]">
          <span className="material-symbols-outlined mt-[1px] text-[14px]">error</span>
          <span className="whitespace-pre-wrap break-words">{resultText || t('question.completed')}</span>
        </div>
      </div>
    )
  }


  const handleSelect = (qIndex: number, optionKey: string) => {
    if (interactionLocked) return
    const question = questions[qIndex]
    const selected = selections[qIndex] ?? []
    const shouldAdvance =
      question &&
      !question.multiSelect &&
      selected[0] !== optionKey &&
      qIndex < questions.length - 1

    setSelections((prev) => {
      const currentSelected = prev[qIndex] ?? []
      if (question?.multiSelect) {
        const nextSelected = currentSelected.includes(optionKey)
          ? currentSelected.filter((value) => value !== optionKey)
          : [...currentSelected, optionKey]
        const next = { ...prev }
        if (nextSelected.length > 0) {
          next[qIndex] = nextSelected
        } else {
          delete next[qIndex]
        }
        return next
      }
      if (currentSelected[0] === optionKey) {
        const next = { ...prev }
        delete next[qIndex]
        return next
      }
      return { ...prev, [qIndex]: [optionKey] }
    })
    setFreeTexts((prev) => {
      if (!prev[qIndex]) return prev
      const next = { ...prev }
      delete next[qIndex]
      return next
    })
    if (shouldAdvance) {
      setActiveTab(qIndex + 1)
    }
  }

  const handleFreeTextChange = (qIndex: number, value: string) => {
    if (interactionLocked) return
    setFreeTexts((prev) => {
      const next = { ...prev }
      if (value) {
        next[qIndex] = value
      } else {
        delete next[qIndex]
      }
      return next
    })
    if (value.trim() && !questions[qIndex]?.intakeFreeTextOptionId) {
      setSelections((prev) => {
        if (!prev[qIndex]) return prev
        const next = { ...prev }
        delete next[qIndex]
        return next
      })
    }
  }

  const handleSubmit = () => {
    if (interactionLocked) return

    const parts: string[] = []
    for (let i = 0; i < questions.length; i++) {
      const answer = freeTexts[i]?.trim() || getSelectedAnswer(questions[i]!, selections[i])
      if (answer) parts.push(answer)
    }
    const response = parts.join('; ')
    if (!response) return

    if (!targetSessionId || !pendingRequest) return

    const answers = questions.reduce<Record<string, string>>((acc, question, index) => {
      const freeText = freeTexts[index]?.trim()
      if (freeText) {
        acc[questionKey(question)] = freeText
      } else {
        const selected = getSelectedAnswer(question, selections[index])
        if (selected) acc[questionKey(question)] = selected
      }
      return acc
    }, {})

    const answerChoiceIds = questions.reduce<Record<string, string[]>>((acc, question, index) => {
      const key = questionKey(question)
      const isRuntimeBoundResearchQuestion = key.startsWith('research-recovery:') || key.startsWith('research-delivery:')
      const isServerBoundExpertIntakeQuestion = key.startsWith('expert-intake:')
      if ((!isRuntimeBoundResearchQuestion && !isServerBoundExpertIntakeQuestion) || (freeTexts[index]?.trim() && !isServerBoundExpertIntakeQuestion)) return acc
      const selected = selections[index] ?? []
      if (selected.length > 0) acc[key] = selected
      return acc
    }, {})

    setSubmissionRequestId(pendingRequest.requestId)
    setSubmissionStatus('submitting')
    setSubmissionMessage(null)
    respondToPermission(targetSessionId, pendingRequest.requestId, true, {
      updatedInput: {
        ...inputObject,
        answers,
        ...(Object.keys(answerChoiceIds).length > 0 ? { answerChoiceIds } : {}),
      },
    })
  }

  // A response to any question is enough to continue; unanswered question tabs remain optional.
  // Commercialization Intake uses a stricter variant: “其他 / 我补充说明”
  // must contain the actual supplement, not merely the option label.
  const hasAnswer = questions.some((question, i) => {
    const freeText = Boolean(freeTexts[i]?.trim())
    const selected = selections[i] ?? []
    const freeTextOptionId = question.intakeFreeTextOptionId
    if (freeTextOptionId && selected.includes(freeTextOptionId)) return freeText
    return freeText || selected.length > 0
  })
  if (!activeQuestion) return null

  const activeIntakeFreeTextOptionId = activeQuestion.intakeFreeTextOptionId
  const activeIntakeFreeTextSelected = Boolean(
    activeIntakeFreeTextOptionId && selections[safeActiveTab]?.includes(activeIntakeFreeTextOptionId),
  )
  const showFreeTextInput = !activeIntakeFreeTextOptionId || activeIntakeFreeTextSelected

  return (
    <div className={`mb-4 rounded-[var(--radius-lg)] border overflow-hidden ${
      submitted
        ? 'border-[var(--color-outline-variant)]/40 bg-[var(--color-surface-container-low)] opacity-70'
        : 'border-[var(--color-brand)] bg-[var(--color-surface-container-lowest)]'
    }`}>
      {/* Header */}
      <div className={`flex items-center gap-3 px-4 py-3 ${
        submitted
          ? 'bg-[var(--color-surface-container-low)]'
          : 'bg-[var(--color-surface-container)]'
      }`}>
        <div className="flex items-center justify-center w-8 h-8 rounded-[var(--radius-md)] bg-[var(--color-brand)]/10">
          <span className="material-symbols-outlined text-[18px] text-[var(--color-brand)]">
            help
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">
            {t('question.needsInput')}
          </span>
          {submitted && (
            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[var(--color-surface-container-high)] text-[var(--color-text-tertiary)]">
              {t(terminalWithoutAnswers ? 'question.completed' : 'question.answered')}
            </span>
          )}
        </div>
      </div>

      {submissionMessage && (
        <div role="alert" className={`mx-4 mt-3 rounded-[var(--radius-sm)] border px-3 py-2 text-xs ${
          submissionStatus === 'stale'
            ? 'border-[var(--color-warning)]/50 bg-[var(--color-warning)]/10 text-[var(--color-text-secondary)]'
            : 'border-[var(--color-error)]/50 bg-[var(--color-error)]/10 text-[var(--color-error)]'
        }`}>
          {submissionMessage}
        </div>
      )}

      {/* Question tabs — horizontal tab bar (only show when multiple questions) */}
      {questions.length > 1 && (
        <div className="flex px-4 border-b border-[var(--color-outline-variant)]/20 bg-[var(--color-surface-container-low)] overflow-x-auto">
          {questions.map((q, i) => {
            const isActive = safeActiveTab === i
            const isAnswered = Boolean(freeTexts[i]?.trim()) || (selections[i]?.length ?? 0) > 0
            const tabLabel = q.header || `Q${i + 1}`
            return (
              <button
                key={i}
                onClick={() => setActiveTab(i)}
                className={`relative flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium whitespace-nowrap transition-colors ${
                  isActive
                      ? 'text-[var(--color-brand)]'
                    : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
                }`}
              >
                {isAnswered && (
                  <span className="material-symbols-outlined text-[14px] text-[var(--color-success)]">check_circle</span>
                )}
                {tabLabel}
                {isActive && (
                  <div className="absolute bottom-0 left-2 right-2 h-[2px] bg-[var(--color-brand)] rounded-t" />
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Active question content */}
      <div className="px-4 py-3">
        <p className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {questionText(activeQuestion)}
        </p>


        {/* Option cards */}
        {questionOptions(activeQuestion).length > 0 && (
          <div className="space-y-2 mb-3">
            {questionOptions(activeQuestion).map((opt, optIndex) => {
              const isSelected = selections[safeActiveTab]?.includes(opt.id ?? opt.label) ?? false
              const isMultiSelect = activeQuestion.multiSelect === true
              return (
                <button
                  key={optIndex}
                  data-testid={`ask-user-option-${safeActiveTab}-${opt.id ?? opt.label}`}
                  onClick={() => handleSelect(safeActiveTab, opt.id ?? opt.label)}
                  disabled={submitted}
                  className={`w-full text-left px-4 py-3 rounded-[var(--radius-md)] border transition-all duration-150 cursor-pointer ${
                    isSelected
                      ? 'border-[var(--color-brand)] bg-[var(--color-primary-fixed)]/35 ring-1 ring-[var(--color-brand)]/25'
                      : 'border-[var(--color-outline-variant)]/40 bg-[var(--color-surface)] hover:border-[var(--color-outline-variant)] hover:bg-[var(--color-surface-container-low)]'
                  } ${submitted ? 'cursor-not-allowed opacity-60 hover:border-[var(--color-outline-variant)]/40 hover:bg-[var(--color-surface)]' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    {/* Selection indicator */}
                    <div className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                      isSelected
                        ? 'border-[var(--color-brand)] bg-[var(--color-brand)]'
                        : 'border-[var(--color-outline)]'
                    } ${isMultiSelect ? 'rounded-[var(--radius-xs)]' : 'rounded-full'}`}>
                      {isSelected && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className={`text-sm font-medium ${
                        isSelected
                          ? 'text-[var(--color-brand)]'
                          : 'text-[var(--color-text-primary)]'
                      }`}>
                        {opt.label}
                      </span>
                      {opt.description && (
                        <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                          {opt.description}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* Free text input */}
        {!interactionLocked && showFreeTextInput && (
          <div>
            <label className="text-xs text-[var(--color-text-tertiary)] mb-1.5 block">
              {activeIntakeFreeTextOptionId ? '补充说明' : t('question.customResponse')}
            </label>
            <textarea
              value={freeTexts[safeActiveTab] ?? ''}
              onChange={(e) => handleFreeTextChange(safeActiveTab, e.target.value)}
              onCompositionStart={() => { composingRef.current = true }}
              onCompositionEnd={() => { composingRef.current = false }}
              onKeyDown={(e) => {
                if (composingRef.current || e.nativeEvent.isComposing || e.keyCode === 229) return
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && hasAnswer) {
                  e.preventDefault()
                  handleSubmit()
                }
              }}
              placeholder={t('question.typePlaceholder')}
              rows={3}
              wrap="soft"
              className="max-h-48 min-h-[84px] w-full resize-y rounded-[var(--radius-md)] border border-[var(--color-outline-variant)]/40 bg-[var(--color-surface)] px-3 py-2 text-sm leading-relaxed text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-brand)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)]/30"
            />
          </div>
        )}

        {/* Submitted answer display */}
        {submitted && (
          <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
            <span className="material-symbols-outlined text-[14px] text-[var(--color-success)]">check_circle</span>
            <span>
              {t(terminalWithoutAnswers ? 'question.resultPrefix' : 'question.answeredPrefix')}<strong>{answeredText}</strong>
            </span>
          </div>
        )}
      </div>

      {/* Submit button */}
      {!interactionLocked && (
        <div className="flex items-center gap-2 px-4 py-3 border-t border-[var(--color-outline-variant)]/20 bg-[var(--color-surface-container-low)]">
          <Button
            data-testid="ask-user-submit"
            variant="primary"
            size="sm"
            disabled={!hasAnswer || !pendingRequest}
            onClick={handleSubmit}
            icon={
              <span className="material-symbols-outlined text-[14px]">send</span>
            }
          >
            {t('question.submit')}
          </Button>
        </div>
      )}
    </div>
  )
}
