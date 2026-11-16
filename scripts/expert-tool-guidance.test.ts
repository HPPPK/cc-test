import { expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { ZipPackAdapter } from '../src/server/services/zipPackAdapter.js'

test('research guidance follows observed links and missing decisions rather than quotas or repeated caveats', async () => {
  const root = new URL('../experts/commercialization-research-report/', import.meta.url)
  for (const name of ['prompts/system.md', 'skills/commercialization-field-evidence/SKILL.md']) {
    const text = await readFile(new URL(name, root), 'utf8')
    expect(text).toContain('真实链接')
    expect(text).toMatch(/已知事实、关键缺口、下一条线索|关键缺口与下一路线/)
    expect(text).toContain('共通限制集中说明')
    expect(text).toContain('摘要缺字不等于未取得')
    expect(text).toContain('引文副本')
  }
  const field = await readFile(new URL('skills/commercialization-field-evidence/SKILL.md', root), 'utf8')
  expect(field).toContain('同属 Google，查询不同仍是不同页面')
  expect(field).toContain('不把内容塞进另一条查询的旧编号')
})

test('packaged expert gives one actual task ID source and preserves local repair and fixed-template delivery', async () => {
  const zip = await new ZipPackAdapter().read(await readFile(new URL('../src/server/packs/experts/commercialization-research-report.zip', import.meta.url)))
  const prompt = await zip.readText('experts/commercialization-research-report/prompts/system.md')
  expect(prompt).not.toContain('建议使用带批次/专项后缀的可读 `task_id`')
  expect(prompt).toContain('TaskOutput 的 task_id 直接使用 Agent 返回的真实 agentId')
  expect(prompt).toContain('不新派研究者或重开网页')
  expect(prompt).toContain('`to`、非空 `summary` 和 `message`')
  expect(prompt).toContain('普通子代理恢复不需要启用团队功能')
  expect(prompt).toContain('EXPERT_INTAKE_UNAVAILABLE')
  expect(prompt).toContain('不代表答案未保存')
  expect(prompt).toContain('不猜商店 ID、帖子编号或 URL 路径')
  expect(prompt).toContain('claude expert-template-fill')
  expect(prompt).toContain('AskUserQuestion')
  expect(prompt.length).toBeLessThan(41406)
  expect(prompt).toContain('主代理进入D前')
  expect(prompt).toContain('EVIDENCE_STATUS_SUMMARY 只写影响结论的简短补充')
  expect(prompt).toContain('金舟 C 端工具业务')
  const fieldSkill = await zip.readText('skills/commercialization-field-evidence/SKILL.md')
  expect(fieldSkill).toContain('归属实际搜索页')
  expect(fieldSkill).not.toContain('报告使用的内容必须来自实际打开的具体帖子')
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
