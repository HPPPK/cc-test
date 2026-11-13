import { expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { ZipPackAdapter } from '../src/server/services/zipPackAdapter.js'

test('packaged expert gives one actual task ID source and preserves local repair and fixed-template delivery', async () => {
  const zip = await new ZipPackAdapter().read(await readFile(new URL('../src/server/packs/experts/commercialization-research-report.zip', import.meta.url)))
  const prompt = await zip.readText('experts/commercialization-research-report/prompts/system.md')
  expect(prompt).not.toContain('建议使用带批次/专项后缀的可读 `task_id`')
  expect(prompt).toContain('TaskOutput 的 task_id 直接使用 Agent 返回的真实 agentId')
  expect(prompt).toContain('不新派研究者或重开网页')
  expect(prompt).toContain('claude expert-template-fill')
  expect(prompt).toContain('AskUserQuestion')
  expect(prompt.length).toBeLessThan(41406)
  const sourceSkill = await zip.readText('skills/research-source-library/SKILL.md')
  expect(sourceSkill).toContain('选择只写在 picks')
  expect(sourceSkill).not.toContain('"decision":"deferred"')
})


test('every research handoff role receives the existing chapter guide and worked analysis examples', async () => {
  const root = new URL('../experts/commercialization-research-report/', import.meta.url)
  const expert = JSON.parse(await readFile(new URL('expert.json', root), 'utf8'))
  for (const role of ['expert-evidence-researcher', 'expert-evidence-reviewer', 'expert-evidence-absorber', 'expert-evidence-output-reviewer']) {
    expect(expert.subagentSkillIds[role]).toContain('commercialization-field-evidence')
  }
  const skill = await readFile(new URL('skills/commercialization-field-evidence/SKILL.md', root), 'utf8')
  expect(skill).toContain('完整分析示例')
  expect(skill).toContain('示例是假设材料')
  expect(skill).toContain('保留不同章节的新增信息')
  const prompt = await readFile(new URL('prompts/system.md', root), 'utf8')
  expect(prompt).not.toContain('只能做非数字的')
})
