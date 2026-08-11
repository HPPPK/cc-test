import { describe, expect, test } from 'bun:test'
import {
  buildHallmarkPrompt,
  HALLMARK_RUNTIME_ADAPTER,
  HALLMARK_SKILL_NAME,
  getHallmarkSkillDefinition,
} from './hallmark.js'
import { HALLMARK_FILES, HALLMARK_ORIGIN } from './hallmarkContent.js'


describe('Hallmark bundled skill', () => {
  test('vendors the complete MIT-licensed Hallmark source package', () => {
    expect(HALLMARK_ORIGIN).toEqual({
      repository: 'Nutlope/hallmark',
      revision: 'aeb42fb354ff4efa36ab475773a082315a3af2ce',
      license: 'MIT',
    })
    expect(Object.keys(HALLMARK_FILES).length).toBeGreaterThan(100)
    expect(HALLMARK_FILES['SKILL.md']).toContain('# Hallmark')
    expect(HALLMARK_FILES['references/anti-patterns.md']).toContain('The purple-gradient hero')
    expect(HALLMARK_FILES['LICENSE.md']).toContain('MIT License')
  })

  test('adapts Hallmark to the installed Playwright-only browser runtime', () => {
    const prompt = buildHallmarkPrompt('audit C:/workspace/output/page-desktop.png')

    expect(HALLMARK_RUNTIME_ADAPTER).toContain('not a pixel-perfect classifier')
    expect(prompt).toContain('use the application-provided Playwright tool')
    expect(prompt).toContain('render it with Playwright/Chromium')
    expect(prompt).toContain('audit the rendered result against the named anti-patterns')
    expect(prompt).toContain('C:/workspace/output/page-desktop.png')
  })

  test('defines Hallmark as an application-wide bundled Skill', () => {
    const skill = getHallmarkSkillDefinition()

    expect(skill.name).toBe(HALLMARK_SKILL_NAME)
    expect(skill.description).toContain('Anti-AI-slop design skill')
    expect(skill.files).toBe(HALLMARK_FILES)
  })
})
