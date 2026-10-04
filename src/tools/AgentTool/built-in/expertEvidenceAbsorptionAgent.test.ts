import { REPORT_ABSORPTION_WORK_GUIDANCE, REPORT_EVIDENCE_HANDOFF_GUIDANCE } from '../../../services/tools/expertReportHandoffGuidance.js'
import { expect, test } from 'bun:test'
import { EXPERT_EVIDENCE_ABSORPTION_AGENT } from './expertEvidenceAbsorptionAgent.js'

test('absorption consumes registered parts and keeps exact audit identities without a new format gate', () => {
  const prompt = EXPERT_EVIDENCE_ABSORPTION_AGENT.getSystemPrompt({} as never)
  expect(prompt).toContain('all registered research parts')
  expect(prompt).not.toContain('three researcher ledgers')
  expect(prompt).toContain('audit:<exact-audit-id>')
  expect(prompt).toContain('full-file and complete paginated Reads are equivalent')
  expect(prompt).toContain('missing labels do not block completion')
  expect(prompt).toContain('Read your own declared 07 output')
  expect(EXPERT_EVIDENCE_ABSORPTION_AGENT.tools).toEqual(['Read', 'Write'])
})

test('uses shared report handoff guidance without extending tool permissions', () => {
  const prompt = EXPERT_EVIDENCE_ABSORPTION_AGENT.getSystemPrompt({} as never)
  expect(prompt).toContain(REPORT_EVIDENCE_HANDOFF_GUIDANCE)
  expect(prompt).toContain(REPORT_ABSORPTION_WORK_GUIDANCE)
  expect(EXPERT_EVIDENCE_ABSORPTION_AGENT.tools).toEqual(['Read', 'Write'])
})
