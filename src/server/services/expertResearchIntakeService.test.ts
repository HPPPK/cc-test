import { describe, expect, it } from 'bun:test'
import { assessResearchIntake, issueResearchIntakeQuestion, answerResearchIntakeQuestion, upgradeResearchIntake, assertResearchIntakeAdmitted, reuseAnsweredResearchIntakeQuestion } from './expertResearchIntakeService.js'

const human = { id: 'u1', type: 'user', content: '做一个帮学生复习的网页。用户群体先探索，你来决定。', isHumanInput: true }
const evidence = { messageId: 'u1', quote: '帮学生复习' }
const clear = { dimensions: [
  { id: 'coreTask', provenance: 'confirmed', value: '帮助学生复习', evidence },
  { id: 'audience', provenance: 'explicitly-delegated', value: '探索学生细分人群', evidence: { messageId: 'u1', quote: '用户群体先探索，你来决定' } },
  { id: 'deliveryBoundary', provenance: 'confirmed', value: '网页', evidence: { messageId: 'u1', quote: '网页' } },
] }
const uncertain = { dimensions: clear.dimensions.map(d => d.id === 'coreTask' ? { id: d.id, provenance: 'unknown', materialImpact: '决定竞品集合', userOwnedReason: '不知道用户要做什么' } : d) }
const card = { questions: [{ id: 'coreTask', prompt: '最先帮助用户完成哪件事？', choices: [{ id: 'review', label: '复习知识' }, { id: 'delegate', label: '先探索，你来决定' }] }] }

describe('adaptive commercialization intake', () => {
  it('admits grounded clear or explicitly delegated scope without fixed questions', () => {
    const state = assessResearchIntake(undefined, clear, [human], '2026-11-10T00:00:00Z')
    expect(state.status).toBe('delegated')
    expect(state.admittedAt).toBeDefined()
  })
  it('rejects invented, non-human, empty or missing decision evidence', () => {
    for (const messages of [[], [{ ...human, isHumanInput: false }], [{ ...human, content: 'something else' }]]) {
      expect(() => assessResearchIntake(undefined, clear, messages)).toThrow('evidence')
    }
    expect(() => assessResearchIntake(undefined, { dimensions: [] }, [human])).toThrow()
    expect(() => assessResearchIntake(undefined, { dimensions: [{ ...clear.dimensions[0], provenance: 'known-business-default' }, ...clear.dimensions.slice(1)] }, [human])).toThrow()
  })
  it('blocks unresolved scope and cannot bypass pending question by reassessment', () => {
    const state = assessResearchIntake(undefined, uncertain, [human])
    expect(state.status).toBe('needs-user')
    expect(() => assertResearchIntakeAdmitted({ expertId: 'commercialization-research-report', researchIntake: state } as any)).toThrow('EXPERT_INTAKE_REQUIRED')
    expect(() => assessResearchIntake(state, clear, [human])).toThrow('pending')
  })
  it('binds real answers to issued card and preserves Other across resume', () => {
    const state = assessResearchIntake(undefined, uncertain, [human])
    const issued = issueResearchIntakeQuestion(state, 'r1', 't1', card)
    const restored = JSON.parse(JSON.stringify(issued))
    expect(() => answerResearchIntakeQuestion(restored, 'unknown', { answers: { coreTask: '复习' } })).toThrow()
    const answered = answerResearchIntakeQuestion(restored, 'r1', { answers: { coreTask: '帮教师备课' } })
    expect(answered.status).toBe('delegated')
    expect(answered.dimensions[0].value).toBe('帮教师备课')
    expect(answered.receipts[0].requestId).toBe('r1')
    expect(answerResearchIntakeQuestion(answered, 'r1', { answers: { coreTask: 'different' } })).toEqual(answered)
  })
  it('does not accept forged choices, partial answers or dismissal as admission', () => {
    const state = issueResearchIntakeQuestion(assessResearchIntake(undefined, uncertain, [human]), 'r1', 't1', card)
    expect(() => answerResearchIntakeQuestion(state, 'r1', { answers: { coreTask: '复习' }, answerChoiceIds: { coreTask: ['forged'] } })).toThrow()
    expect(answerResearchIntakeQuestion(state, 'r1', { answers: {} }).status).toBe('needs-user')
  })
  it('upgrades old records additively without promoting arbitrary answers or blocking completed reports', () => {
    const old = { expertId: 'commercialization-research-report', status: 'active', intakeState: { answers: { ready: true } }, materialRefs: [] }
    expect(upgradeResearchIntake(old as any).researchIntake?.status).toBe('unassessed')
    expect(upgradeResearchIntake(old as any).intakeState).toEqual(old.intakeState)
    expect(upgradeResearchIntake({ ...old, completedAt: 'yesterday' } as any).researchIntake).toBeUndefined()
    expect(() => assertResearchIntakeAdmitted({ ...old, completedAt: 'yesterday' } as any)).toThrow('EXPERT_INTAKE_REQUIRED')
    expect(upgradeResearchIntake({ ...old, expertId: 'other' } as any)).toEqual({ ...old, expertId: 'other' })
  })
})


it('accepts new genuine human delegation while preserving the established boundaries', () => {
  const pending = assessResearchIntake(undefined, uncertain, [human])
  const delegated = { dimensions: uncertain.dimensions.map(d => d.id === 'coreTask' ? { id: 'coreTask', provenance: 'explicitly-delegated', value: '探索核心任务', evidence: { messageId: 'u2', quote: '核心任务先探索，你来决定' } } : d) }
  expect(() => assessResearchIntake(pending, delegated, [human])).toThrow('evidence')
  const result = assessResearchIntake(pending, delegated, [human, { id: 'u2', content: '核心任务先探索，你来决定', isHumanInput: true }])
  expect(result.status).toBe('delegated')
  expect(result.dimensions.slice(1)).toEqual(pending.dimensions.slice(1))
})


it('reuses actual answered scope when a later human turn requires reassessment', () => {
  const pending = issueResearchIntakeQuestion(assessResearchIntake(undefined, uncertain, [human]), 'r1', 't1', card)
  const answered = answerResearchIntakeQuestion(pending, 'r1', { answers: { coreTask: '复习' } })
  const next = assessResearchIntake(answered, { dimensions: answered.dimensions }, [human, { id: 'u2', content: '继续', isHumanInput: true }])
  expect(next.status).toBe('delegated')
  expect(next.receipts).toEqual(answered.receipts)
  expect(next.evidenceMessageIds).toContain('u2')
})


it('uses exact active edited business-rule defaults and rejects invented or later default overrides', () => {
  const rules = '当前默认业务规则：面向科研机构，交付在私有服务器。'
  const input = { dimensions: [clear.dimensions[0],
    { id: 'audience', provenance: 'known-business-default', value: 'invented consumer audience', evidence: { messageId: 'active-business-rules', quote: '面向科研机构' } },
    { id: 'deliveryBoundary', provenance: 'known-business-default', evidence: { messageId: 'active-business-rules', quote: '交付在私有服务器' } },
  ] }
  expect(() => assessResearchIntake(undefined, input, [human])).toThrow('active editable business rules')
  const ready = assessResearchIntake(undefined, input, [human], undefined, rules)
  expect(ready.dimensions[1].value).toBe('面向科研机构')
  expect(ready.dimensions[2].value).toBe('交付在私有服务器')
  expect(() => assessResearchIntake(undefined, input, [human], undefined, '已改为其他业务')).toThrow()
  const pending = assessResearchIntake(undefined, { dimensions: input.dimensions.map(d => d.id === 'audience' ? { id: 'audience', provenance: 'unknown', materialImpact: '改变用户任务', userOwnedReason: '用户需要决定受众' } : d) }, [human], undefined, rules)
  expect(() => assessResearchIntake(pending, input, [human], undefined, rules)).toThrow('pending')
})


it('keeps host-confirmed card scope canonical when model paraphrases and confuses receipt IDs', () => {
  const issued = issueResearchIntakeQuestion(assessResearchIntake(undefined, uncertain, [human]), 'question-request', 'tool-call', card)
  const answered = answerResearchIntakeQuestion(issued, 'question-request', { answers: { coreTask: '帮教师备课' } })
  const repeated = { dimensions: answered.dimensions.map(d => ({ ...d, value: '模型改写的范围', evidence: { messageId: 'tool-call', quote: '帮教师备课' } })) }
  const result = assessResearchIntake(answered, repeated, [human])
  expect(result).toEqual(answered)
  expect(result.dimensions[0].value).toBe('帮教师备课')
  expect(() => assessResearchIntake(answered, repeated, [human, { id: 'new-human', isHumanInput: true, content: '改做其他方向' }])).toThrow('evidence')
})

it('revalidates editable default evidence before reusing admitted scope', () => {
  const rules = '面向科研机构；私有服务器'
  const input = { dimensions: [clear.dimensions[0],
    { id: 'audience', provenance: 'known-business-default', evidence: { messageId: 'active-business-rules', quote: '面向科研机构' } },
    { id: 'deliveryBoundary', provenance: 'known-business-default', evidence: { messageId: 'active-business-rules', quote: '私有服务器' } },
  ] }
  const previous = assessResearchIntake(undefined, input, [human], undefined, rules)
  expect(() => assessResearchIntake(previous, input, [human], undefined, '面向家庭')).toThrow('business rules changed')
  const updated = { dimensions: input.dimensions.map(d => d.id === 'coreTask' ? d : { ...d, evidence: { messageId: 'active-business-rules', quote: '面向家庭' } }) }
  expect(assessResearchIntake(previous, updated, [human], undefined, '面向家庭').dimensions[1].value).toBe('面向家庭')
})


it('reuses persisted human scope answers across changed tool and question IDs without asking again', () => {
  const pending = issueResearchIntakeQuestion(assessResearchIntake(undefined, uncertain, [human]), 'r1', 't1', card)
  const answered = JSON.parse(JSON.stringify(answerResearchIntakeQuestion(pending, 'r1', { answers: { coreTask: '复习知识' } })))
  const messages = [human, { id: 'a1', content: [{ type: 'tool_use', id: 't1', name: 'AskUserQuestion', input: card }] }]
  const repeated = { questions: [{ ...card.questions[0], id: 'scope-object' }], metadata: { expert_research_delivery: { question_id: 'wrong' } } }
  const reused = reuseAnsweredResearchIntakeQuestion(answered, repeated, messages)
  expect(reused?.answers).toEqual({ 'scope-object': '复习知识' })
  expect(reused).not.toHaveProperty('metadata')
  expect(reuseAnsweredResearchIntakeQuestion(answered, card, messages)?.answers).toEqual({ coreTask: '复习知识' })
  expect(reuseAnsweredResearchIntakeQuestion(answered, repeated, [...messages, { id: 'new-human', content: '改做别的产品', isHumanInput: true }])).toBeUndefined()
  expect(reuseAnsweredResearchIntakeQuestion(answered, { questions: [{ ...repeated.questions[0], prompt: '需要哪种全新的功能？' }] }, messages)).toBeUndefined()
  expect(reuseAnsweredResearchIntakeQuestion(answered, { questions: [...repeated.questions, { ...card.questions[0], id: 'new-topic', prompt: '预算多少？' }] }, messages)).toBeUndefined()
})


it('does not invent saved answers for new, ambiguous or unconfirmed cards', () => {
  const pending = issueResearchIntakeQuestion(assessResearchIntake(undefined, uncertain, [human]), 'r1', 't1', card)
  const answered = answerResearchIntakeQuestion(pending, 'r1', { answers: { coreTask: '复习知识' } })
  expect(reuseAnsweredResearchIntakeQuestion(undefined, card, [human])).toBeUndefined()
  expect(reuseAnsweredResearchIntakeQuestion(pending, card, [human])).toBeUndefined()
  expect(reuseAnsweredResearchIntakeQuestion(answered, null, [human])).toBeUndefined()
  expect(reuseAnsweredResearchIntakeQuestion(answered, { questions: [] }, [human])).toBeUndefined()
  expect(reuseAnsweredResearchIntakeQuestion(answered, { questions: [card.questions[0], card.questions[0]] }, [human])).toBeUndefined()
  expect(reuseAnsweredResearchIntakeQuestion(answered, { questions: [{ prompt: 'Missing ID' }] }, [human])).toBeUndefined()
  expect(reuseAnsweredResearchIntakeQuestion(answered, { questions: [{ ...card.questions[0], id: 'audience' }] }, [human])).toBeUndefined()
  const question = { ...card.questions[0], id: 'unknown-question' }
  const originals = [{ id: 'a', content: [{ type: 'tool_use', name: 'AskUserQuestion', id: 't1', input: { questions: [card.questions[0], card.questions[0]] } }] }]
  expect(reuseAnsweredResearchIntakeQuestion(answered, { questions: [question] }, originals)).toBeUndefined()
  const issued = issueResearchIntakeQuestion(assessResearchIntake(undefined, uncertain, [human]), 'r2', 't2', { questions: [{ ...card.questions[0], metadata: { question_id: 'report-delivery' } }] })
  expect(issued.pending?.card.questions[0]).not.toHaveProperty('metadata')
})
