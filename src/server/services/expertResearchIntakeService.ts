import { z } from 'zod/v4'
import type { ExpertSessionMetadata } from './expertPackRegistryService.js'

const TARGET = 'commercialization-research-report'
export const INTAKE_TOOL_NAME = 'assess_expert_research_scope'
const questionDimension = (id: string) => id.replace(/^expert-intake:/, '')
const dimensionIds = ['coreTask', 'audience', 'deliveryBoundary'] as const
const evidenceSchema = z.strictObject({ messageId: z.string().min(1), quote: z.string().min(1) })
export const researchIntakeAssessmentSchema = z.strictObject({ dimensions: z.array(z.strictObject({
  id: z.enum(dimensionIds),
  provenance: z.enum(['confirmed', 'known-business-default', 'unknown', 'explicitly-delegated']),
  value: z.string().optional(), evidence: evidenceSchema.optional(),
  materialImpact: z.string().optional(), userOwnedReason: z.string().optional(),
})).length(3) })
type Dimension = z.infer<typeof researchIntakeAssessmentSchema>['dimensions'][number]
type Card = { questions: Array<{ id: string; prompt?: string; question?: string; choices?: Array<{ id?: string; label: string }>; options?: Array<{ id?: string; label: string }> }> }
export type ExpertResearchIntakeState = {
  version: 1; revision: number; status: 'unassessed' | 'needs-user' | 'clear' | 'delegated'
  dimensions: Dimension[]; updatedAt: string; admittedAt?: string; evidenceMessageIds?: string[]
  pending?: { requestId: string; toolUseId?: string; revision: number; card: Card }
  receipts: Array<{ requestId: string; toolUseId?: string; revision: number; answers: Record<string, string>; answeredAt: string }>
}
function sameDimension(a: Dimension | undefined, b: Dimension): boolean {
  return !!a && ['id', 'provenance', 'value', 'materialImpact', 'userOwnedReason'].every(key => a[key as keyof Dimension] === b[key as keyof Dimension]) && a.evidence?.messageId === b.evidence?.messageId && a.evidence?.quote === b.evidence?.quote
}
type EvidenceMessage = { id: string; content: unknown; isHumanInput?: boolean }
function fail(detail: string): never { throw new Error('EXPERT_INTAKE_REQUIRED: ' + detail) }
function textContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.flatMap(block => block?.type === 'text' && typeof block.text === 'string' ? [block.text] : []).join('\n')
}
function pendingState(now = new Date().toISOString()): ExpertResearchIntakeState {
  return { version: 1, revision: 0, status: 'unassessed', dimensions: [], receipts: [], updatedAt: now }
}
export function intakeApplies(expert: Partial<ExpertSessionMetadata> | undefined): boolean {
  return expert?.expertId === TARGET
}
/** Forward upgrade keeps original answer/material records; legacy completion is never re-gated. */
export function upgradeResearchIntake<T extends Partial<ExpertSessionMetadata>>(expert: T, now?: string): T {
  return intakeApplies(expert) && !expert.completedAt && !expert.templateFillDelivery && expert.status !== 'completed' && !expert.researchIntake ? { ...expert, researchIntake: pendingState(now) } : expert
}
export function assertResearchIntakeAdmitted(expert: Partial<ExpertSessionMetadata> | undefined): void {
  if (intakeApplies(expert) && !['clear', 'delegated'].includes(expert?.researchIntake?.status ?? '')) fail('Resolve the consequential user-owned scope decisions with AskUserQuestion before research, delegation or a ready brief. Read supplied materials first if useful.')
}
export function assessResearchIntake(previous: ExpertResearchIntakeState | undefined, raw: unknown, messages: EvidenceMessage[], now = new Date().toISOString(), businessRules?: string): ExpertResearchIntakeState {
  const input = researchIntakeAssessmentSchema.parse(raw)
  // Repeated assessment is a read of already admitted host decisions. Model
  // paraphrases or guessed receipt IDs cannot rewrite the actual user's answer.
  const humanIds = messages.filter(m => m.isHumanInput === true).map(m => m.id)
  if (previous && ['clear', 'delegated'].includes(previous.status)) {
    const defaultsChanged = previous.dimensions.some(d => d.provenance === 'known-business-default' && (!d.evidence?.quote || !businessRules?.includes(d.evidence.quote)))
    if (!defaultsChanged && humanIds.every(id => previous.evidenceMessageIds?.includes(id))) return previous
  }
  if (previous?.status === 'needs-user') {
    let newDelegation = false
    for (const d of input.dimensions) {
      const prior = previous.dimensions.find(p => p.id === d.id)
      if (sameDimension(prior, d)) continue
      if (prior?.provenance !== 'unknown' || d.provenance !== 'explicitly-delegated' || !d.evidence || previous.evidenceMessageIds?.includes(d.evidence.messageId)) fail('A pending user-owned decision needs the actual card answer or new explicit human delegation; existing decisions cannot be overwritten.')
      newDelegation = true
    }
    if (!newDelegation) fail('A pending user-owned decision needs the actual issued card answer.')
  }
  if (new Set(input.dimensions.map(d => d.id)).size !== 3) fail('Every scope boundary must be assessed once, without a fixed question bank.')
  for (const d of input.dimensions) {
    if (d.provenance === 'unknown') {
      if (!d.materialImpact?.trim() || !d.userOwnedReason?.trim()) fail('Unknown decisions require material impact and why only the user can decide.')
    } else if (d.provenance === 'known-business-default') {
      if (d.id === 'coreTask') fail('The business default cannot invent the product core task.')
      // The active editable rules are the source of defaults, never host-invented scope.
      const e = d.evidence
      if (e?.messageId !== 'active-business-rules' || !e.quote.trim() || !businessRules?.includes(e.quote)) fail('The active editable business rules changed or evidence is invalid. A known business default requires exact evidence from the active editable business rules; no default scope is invented.')
      d.value = e.quote
    } else {
      const prior = previous?.dimensions.find(p => p.id === d.id)
      const retainedReceipt = previous?.receipts.some(receipt => Object.hasOwn(receipt.answers, d.id)) && sameDimension(prior, d)
      if (retainedReceipt) continue
      const e = d.evidence
      const message = e && messages.find(m => m.id === e.messageId && m.isHumanInput === true)
      if (!e?.quote.trim() || !message || !textContent(message.content).includes(e.quote) || !d.value?.trim()) fail('Confirmed/delegated scope requires actual human message evidence with an exact non-empty quote and interpreted value. RECOVERY: inspect persisted state first; use evidence[].id for messageId, never requestId or toolUseId. If requiresAssessment is false, continue research using canonical state.dimensions; do not resubmit or overwrite recorded card answers.')
    }
  }
  const status = input.dimensions.some(d => d.provenance === 'unknown') ? 'needs-user' : input.dimensions.some(d => d.provenance === 'explicitly-delegated') ? 'delegated' : 'clear'
  return { version: 1, revision: (previous?.revision ?? 0) + 1, status, dimensions: input.dimensions, evidenceMessageIds: messages.filter(m => m.isHumanInput === true).map(m => m.id), receipts: previous?.receipts ?? [], updatedAt: now, ...(status !== 'needs-user' ? { admittedAt: input.dimensions.some(d => d.evidence && !previous?.evidenceMessageIds?.includes(d.evidence.messageId)) ? now : previous?.admittedAt ?? now } : {}) }
}
export function issueResearchIntakeQuestion(state: ExpertResearchIntakeState, requestId: string, toolUseId: string | undefined, raw: unknown): ExpertResearchIntakeState {
  if (state.status !== 'needs-user') return state
  const card = raw as Card
  if (!Array.isArray(card?.questions) || card.questions.length < 1 || card.questions.length > 3) fail('Ask a small dynamic group of unresolved decisions.')
  if (state.pending && state.pending.requestId !== requestId) fail('The existing intake card is still awaiting the actual user answer.')
  const unknown = new Set(state.dimensions.filter(d => d.provenance === 'unknown').map(d => d.id))
  const seen = new Set<string>()
  for (const q of card.questions) {
    const options = q.choices ?? q.options ?? []
    if (!unknown.has(questionDimension(q.id) as any) || seen.has(questionDimension(q.id)) || !(q.prompt ?? q.question)?.trim() || options.length < 2 || options.length > 4 || options.some(o => !o.id?.trim() || !o.label?.trim()) || new Set(options.map(o => o.id)).size !== options.length) fail('Question IDs must identify unresolved dimensions, with dynamic prompts and 2–4 stable choices. Use delegate for explicit exploration delegation.')
    seen.add(questionDimension(q.id))
  }
  return { ...state, pending: { requestId, toolUseId, revision: state.revision, card: { questions: JSON.parse(JSON.stringify(cleanIntakeQuestions(card.questions).map(q => ({ ...q, id: 'expert-intake:' + questionDimension(q.id) })))) } } }
}
/** Return saved human decisions only for a recognisable repeat, never infer answers
 * from a new question's choices. Receipts and original tool inputs survive resume. */
export function reuseAnsweredResearchIntakeQuestion(state: ExpertResearchIntakeState | undefined, raw: unknown, messages: EvidenceMessage[]): (Card & { answers: Record<string, string> }) | undefined {
  if (!state || !['clear', 'delegated'].includes(state.status) || messages.some(m => m.isHumanInput === true && !state.evidenceMessageIds?.includes(m.id))) return
  const card = raw as Card
  if (!Array.isArray(card?.questions) || !card.questions.length) return
  const originals = messages.flatMap(message => Array.isArray(message.content) ? message.content : [])
    .filter(block => block?.type === 'tool_use' && block.name === 'AskUserQuestion' && state.receipts.some(receipt => receipt.toolUseId === block.id))
    .flatMap(block => (block.input as Card)?.questions ?? [])
  const answers: Record<string, string> = {}
  for (const question of card.questions) {
    if (typeof question.id !== 'string' || Object.hasOwn(answers, question.id)) return
    const prompt = (question.prompt ?? question.question)?.trim()
    const matches = originals.filter(original => prompt && (original.prompt ?? original.question)?.trim() === prompt)
    const id = questionDimension(question.id)
    const dimension = dimensionIds.includes(id as typeof dimensionIds[number]) ? id : matches.length === 1 ? questionDimension(matches[0]!.id) : undefined
    const saved = state.dimensions.find(d => d.id === dimension && d.provenance !== 'unknown')
    if (!saved?.value || !state.receipts.some(receipt => Object.hasOwn(receipt.answers, saved.id))) return
    answers[question.id] = saved.value
  }
  return { questions: cleanIntakeQuestions(card.questions), answers }
}
function cleanIntakeQuestions(questions: Card['questions']): Card['questions'] {
  return questions.map(question => {
    const { metadata: _metadata, ...clean } = question as Card['questions'][number] & { metadata?: unknown }
    return clean
  })
}
export function answerResearchIntakeQuestion(state: ExpertResearchIntakeState, requestId: string, input: { answers?: Record<string, string>; answerChoiceIds?: Record<string, string[]> }, now = new Date().toISOString()): ExpertResearchIntakeState {
  if (state.receipts.some(r => r.requestId === requestId)) return state
  const pending = state.pending
  if (!pending || pending.requestId !== requestId || pending.revision !== state.revision) fail('Unknown or stale intake question response.')
  const dimensions = state.dimensions.map(d => ({ ...d }))
  const answers: Record<string, string> = {}
  for (const q of pending.card.questions) {
    const keys = [q.id, questionDimension(q.id), q.prompt, q.question].filter((k): k is string => !!k)
    const answer = keys.map(k => input.answers?.[k]).find(v => typeof v === 'string' && v.trim())
    if (!answer) continue
    const ids = keys.flatMap(k => input.answerChoiceIds?.[k] ?? [])
    const choices = q.choices ?? q.options ?? []
    if (ids.some(id => !choices.some(c => c.id === id))) fail('Answer choice was not offered by the issued card.')
    const delegated = ids.length === 1 && ids[0] === 'delegate'
    const d = dimensions.find(d => d.id === questionDimension(q.id))!
    d.provenance = delegated ? 'explicitly-delegated' : 'confirmed'
    d.value = answer
    answers[questionDimension(q.id)] = answer
  }
  if (!Object.keys(answers).length) return state
  const status = dimensions.some(d => d.provenance === 'unknown') ? 'needs-user' : dimensions.some(d => d.provenance === 'explicitly-delegated') ? 'delegated' : 'clear'
  return { ...state, dimensions, status, pending: undefined, updatedAt: now, receipts: [...state.receipts, { requestId, toolUseId: pending.toolUseId, revision: state.revision, answers, answeredAt: now }], ...(status !== 'needs-user' ? { admittedAt: now } : {}) }
}

const locks = new Map<string, Promise<unknown>>()
export async function updateExpertResearchIntake(sessionId: string, update: (expert: ExpertSessionMetadata) => ExpertSessionMetadata | Promise<ExpertSessionMetadata>) {
  const before = locks.get(sessionId) ?? Promise.resolve()
  const task = before.catch(() => {}).then(async () => {
    const { sessionService } = await import('./sessionService.js')
    const { expertRuntimeSessionStore } = await import('./expertRuntimeSessionStore.js')
    const session = await sessionService.getSession(sessionId)
    const expert = session?.expert ?? await expertRuntimeSessionStore.get(sessionId)
    if (!session || !expert || expert.mode !== 'expert') fail('No Expert session exists.')
    const next = await update(upgradeResearchIntake(expert))
    await sessionService.appendSessionMetadata(sessionId, { workDir: session.workDir || session.projectRoot || session.projectPath, expert: next })
    if (next.status === 'active') await expertRuntimeSessionStore.save(sessionId, next)
    return next
  })
  locks.set(sessionId, task)
  try { return await task } finally { if (locks.get(sessionId) === task) locks.delete(sessionId) }
}
async function currentBusinessRules(expert: ExpertSessionMetadata): Promise<string> {
  if (expert.packId) {
    const { ExpertPackRegistryService } = await import('./expertPackRegistryService.js')
    const stored = await new ExpertPackRegistryService().getExpert(expert.expertId)
    if (stored?.packId === expert.packId && typeof stored.systemPromptContent === 'string') return stored.systemPromptContent
  }
  // A restored/removed pack can retain its actual activation snapshot. Never
  // replace missing rules with a synthesized customer/platform default.
  return expert.runtimeBinding?.promptSnapshot ?? ''
}
export async function inspectExpertResearchIntake(sessionId: string) {
  const expert = await updateExpertResearchIntake(sessionId, expert => expert)
  const { sessionService } = await import('./sessionService.js')
  const businessRules = await currentBusinessRules(expert)
  const evidence = (await sessionService.getSessionMessages(sessionId)).filter(m => (m as any).isHumanInput === true).map(m => ({ id: m.id, text: textContent(m.content) }))
  const state = expert.researchIntake
  const rulesChanged = state?.dimensions.some(d => d.provenance === 'known-business-default' && (!d.evidence?.quote || !businessRules.includes(d.evidence.quote))) ?? false
  const requiresAssessment = intakeApplies(expert) && (!state || state.status === 'unassessed' || rulesChanged || (evidence.length > 0 && !state.evidenceMessageIds?.includes(evidence.at(-1)!.id)))
  const nextAction = requiresAssessment ? 'assess_new_input' : state?.status === 'needs-user' ? 'ask_unresolved_scope' : 'continue_research'
  return {
    businessRules: { id: 'active-business-rules', text: businessRules, precedence: 'Actual user instructions and supplied rule documents override editable defaults; cite defaults only where they still apply.' },
    applicable: intakeApplies(expert), state, nextAction, requiresAssessment, evidence,
  }
}
export async function submitExpertResearchAssessment(sessionId: string, input: unknown) {
  return updateExpertResearchIntake(sessionId, async expert => {
    if (!intakeApplies(expert)) fail('Adaptive intake is scoped to the active commercialization Expert.')
    const { sessionService } = await import('./sessionService.js')
    const messages = await sessionService.getSessionMessages(sessionId)
    const businessRules = await currentBusinessRules(expert)
    return { ...expert, researchIntake: assessResearchIntake(expert.researchIntake, input, messages, undefined, businessRules), updatedAt: new Date().toISOString() }
  })
}
export async function guardExpertResearchIntake(sessionId: string, toolName?: string, input?: unknown) {
  const { sessionService } = await import('./sessionService.js')
  const { expertRuntimeSessionStore } = await import('./expertRuntimeSessionStore.js')
  const session = await sessionService.getSession(sessionId)
  if (!session) fail('The session could not be found; no operation was admitted.')
  const expert = session?.expert ?? await expertRuntimeSessionStore.get(sessionId)
  if (toolName && ['Read', 'AskUserQuestion', INTAKE_TOOL_NAME, 'Skill'].includes(toolName)) return
  const command = (input as { command?: unknown } | undefined)?.command
  if (expert?.templateFillDelivery && (toolName === 'Bash' || toolName === 'PowerShell') && typeof command === 'string' && /^\s*claude\s+expert-template-fill\s+--(?:schema|recover-fields)\s*$/.test(command)) return
  assertResearchIntakeAdmitted(expert)
  if (intakeApplies(expert)) {
    const businessRules = await currentBusinessRules(expert!)
    if (expert?.researchIntake?.dimensions.some(d => d.provenance === 'known-business-default' && (!d.evidence?.quote || !businessRules.includes(d.evidence.quote)))) fail('The active editable business rules changed; reassess scope using the current stored rules.')
    const humans = (await sessionService.getSessionMessages(sessionId)).filter(m => m.isHumanInput === true)
    if (humans.length && !expert?.researchIntake?.evidenceMessageIds?.includes(humans.at(-1)!.id)) fail('A new human turn has not been assessed. Reuse known decisions and assess the new input; do not repeat answered questions.')
  }
}

export async function getPendingExpertIntakeQuestion(sessionId: string) {
  const { sessionService } = await import('./sessionService.js')
  const { expertRuntimeSessionStore } = await import('./expertRuntimeSessionStore.js')
  const expert = (await sessionService.getSession(sessionId))?.expert ?? await expertRuntimeSessionStore.get(sessionId)
  return intakeApplies(expert) ? expert?.researchIntake?.pending : undefined
}
export async function recordExpertIntakeQuestion(sessionId: string, requestId: string, toolUseId: string | undefined, input: unknown): Promise<(Card & { answers?: Record<string, string> }) | undefined> {
  const { sessionService } = await import('./sessionService.js')
  const expert = (await sessionService.getSession(sessionId))?.expert
  if (!intakeApplies(expert) || !expert?.researchIntake) return
  if (expert.researchIntake.status !== 'needs-user') {
    if (!['clear', 'delegated'].includes(expert.researchIntake.status) || !expert.researchIntake.receipts.length) return
    const rules = await currentBusinessRules(expert!)
    if (expert?.researchIntake?.dimensions.some(d => d.provenance === 'known-business-default' && (!d.evidence?.quote || !rules.includes(d.evidence.quote)))) return
    return reuseAnsweredResearchIntakeQuestion(expert?.researchIntake, input, await sessionService.getSessionMessages(sessionId))
  }
  const recorded = await updateExpertResearchIntake(sessionId, expert => ({ ...expert, researchIntake: issueResearchIntakeQuestion(expert.researchIntake!, requestId, toolUseId, input) }))
  return recorded.researchIntake!.pending!.card
}
export async function recordExpertIntakeAnswer(sessionId: string, requestId: string, allowed: boolean, input: unknown): Promise<(Card & { answers: Record<string, string> }) | undefined> {
  let card: Card | undefined
  const recorded = await updateExpertResearchIntake(sessionId, expert => {
    const state = expert.researchIntake!
    if (!state?.pending || state.pending.requestId !== requestId) fail('Unknown or stale intake permission response.')
    if (!allowed) return { ...expert, researchIntake: { ...state, pending: undefined } }
    card = state.pending.card
    const response = input as Parameters<typeof answerResearchIntakeQuestion>[2]
    return { ...expert, researchIntake: answerResearchIntakeQuestion(state, requestId, response) }
  })
  if (!card) return
  const receipt = recorded.researchIntake?.receipts.find(r => r.requestId === requestId)
  if (!receipt) fail('The issued card has no saved answer. Retry the existing card, not a new question.')
  return { questions: cleanIntakeQuestions(card.questions), answers: Object.fromEntries(card.questions.flatMap(q => {
    const value = receipt.answers[questionDimension(q.id)]
    return value ? [[q.id, value]] : []
  })) }
}
