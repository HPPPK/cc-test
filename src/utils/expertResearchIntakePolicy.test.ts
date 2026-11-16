import { expect, test } from 'bun:test'
import { isExpertIntakeLocalTool } from './expertResearchIntakePolicy.js'

test('only bounded intake tools are exempt, never research, delegation or writes', () => {
  for (const name of ['Read', 'AskUserQuestion', 'assess_expert_research_scope', 'Skill']) expect(isExpertIntakeLocalTool(name)).toBe(true)
  for (const name of ['Agent', 'Bash', 'Write', 'Edit', 'Playwright', 'WebSearch', 'WebFetch', 'AskUserQuestion_fake']) expect(isExpertIntakeLocalTool(name)).toBe(false)
})
