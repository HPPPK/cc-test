import { describe, expect, test } from 'bun:test'
import { evaluateLiveEvidence, redact, selectFlash } from './evidence.js'
const base = { asked: true, answerMatched: true, briefSaved: true, agentStarted: true, bindingMatched: true, sourcePackageMatched: true, pages: [] }
describe('truthful live evidence', () => {
  test('does not pass a homepage, non-error tool, or browser launch', () => {
    expect(evaluateLiveEvidence({ ...base, pages: [{ url: 'https://example.org/', text: 'Welcome', toolUseId: 'p1', audited: true, extracted: false }] }).passed).toBe(false)
  })
  test('requires concrete body extraction paired to successful tool and audit', () => {
    const page = { url: 'https://example.org/docs/feature', text: 'Specific feature details and supported platforms. '.repeat(8), toolUseId: 'p2', audited: true, extracted: true }
    expect(evaluateLiveEvidence({ ...base, pages: [page] }).passed).toBe(true)
    expect(evaluateLiveEvidence({ ...base, pages: [{ ...page, audited: false }] }).passed).toBe(false)
    expect(evaluateLiveEvidence({ ...base, pages: [{ ...page, accessLimited: true }] }).passed).toBe(false)
    expect(evaluateLiveEvidence({ ...base, briefSaved: false, pages: [page] }).passed).toBe(false)
  })
  test('selects configured Flash without hardcoded IDs or Pro fallback', () => {
    expect(selectFlash([{ id: 'changed-id', model: 'deepseek-v4-flash' }], 'changed-id')).toEqual({ providerId: 'changed-id', model: 'deepseek-v4-flash' })
    expect(selectFlash([{ id: 'pro', model: 'deepseek-v4-pro' }], 'pro')).toBeUndefined()
    expect(selectFlash([{ id: 'other', model: 'deepseek-v4-pro', smallFastModel: 'deepseek-v4-flash' }], '')?.model).toBe('deepseek-v4-flash')
  })
  test('redacts secrets in events recursively', () => {
    const result = JSON.stringify(redact({ apiKey: 'hidden-key', nested: { authorization: 'Bearer private', message: 'Bearer abc.def' }, url: 'https://example.org/?api_key=private&x=1' }))
    expect(result).not.toContain('hidden-key'); expect(result).not.toContain('private'); expect(result).not.toContain('abc.def')
  })
})

import { answerFixtureQuestion } from './evidence.js'
test('answers known product clarifications differently and refuses unexpected delivery confirmation', () => {
  const object = answerFixtureQuestion({ question: '本轮的研究对象？' })
  const trigger = answerFixtureQuestion({ question: '你关注的中键触发能力是哪一类？' })
  const material = answerFixtureQuestion({ question: '你现在有哪些可提供的材料？' })
  expect(new Set([object, trigger, material]).size).toBe(3)
  expect([object, trigger, material].every(Boolean)).toBe(true)
  expect(answerFixtureQuestion({ question: '是否接受当前范围并开始生成？' })).toBeUndefined()
})

test('accepts observed natural-language object question with header, not only exact wording', () => {
  expect(answerFixtureQuestion({ header:'研究对象', question:'这次商业化调研的对象是哪一种？' })).toContain('拟开发新品')
  expect(answerFixtureQuestion({ header:'中键能力', question:'“鼠标中键效率工具”里，中键触发的是什么能力？' })).toContain('动作面板')
})

test('does not invent a selected user group for the known uncertain fixture', () => {
  expect(answerFixtureQuestion({ question:'新品首发主要面向哪类用户？', header:'目标用户' })).toContain('尚未确定')
})
