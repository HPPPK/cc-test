import { test, expect } from 'bun:test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
const root = path.resolve(import.meta.dir, '../../..')
const prompt = () => readFile(path.join(root, 'experts/commercialization-research-report/prompts/system.md'), 'utf8')
// Semantic conflicts were traced to getSubagentSkillContext's receipt/queue checks,
// dynamic intake, and dynamic-route-status-v2's bounded unresolved outcome.
// These string regressions preserve the reviewed correction; they do NOT prove semantics alone.
test('intake does not impose an extra fixed questionnaire after sufficient product input', async () => {
  expect((await prompt()).includes('用户完成产品形态、核心差异能力、目标用户、优先验证目标及材料/限制问题后')).toBe(false)
})
test('file presence is not described as unconditional permission to bypass outstanding source receipts', async () => {
  expect((await prompt()).includes('记录缺失或受限证据，再继续下一阶段。')).toBe(false)
  expect(await prompt()).toContain('来源队列')
})
test('bounded unresolved fallback is allowed to remain an evidence gap, not called a site restriction', async () => {
  const skill = await readFile(path.join(root, 'experts/commercialization-research-report/skills/browser-information-retrieval/SKILL.md'), 'utf8')
  expect(skill.includes('只有首选与 fallback 都有真实受限/失败记录时，才把该字段写为 evidence gap')).toBe(false)
})
