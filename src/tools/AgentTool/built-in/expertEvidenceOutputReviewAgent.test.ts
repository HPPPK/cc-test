import { REPORT_ABSORPTION_WORK_GUIDANCE, REPORT_EVIDENCE_HANDOFF_GUIDANCE } from '../../../services/tools/expertReportHandoffGuidance.js'
import { expect, test } from 'bun:test'
import { EXPERT_EVIDENCE_OUTPUT_REVIEW_AGENT } from './expertEvidenceOutputReviewAgent.js'

test('reviewer keeps required corrections distinct from optional findings and never prescribes fake patches', () => {
  const prompt = EXPERT_EVIDENCE_OUTPUT_REVIEW_AGENT.getSystemPrompt({} as never)
  expect(prompt).toContain('A MUST_PATCH marker is optional, not a required format')
  expect(prompt).toContain('negated findings, conditional guidance, and optional suggestions')
  expect(prompt).toContain('finalize with empty fields, never an empty patch or an internal placeholder field')
  expect(prompt).toContain('flag the smallest source-supported patch')
  expect(prompt).toContain('Read your own declared 08 output')
  expect(EXPERT_EVIDENCE_OUTPUT_REVIEW_AGENT.tools).toEqual(['Read', 'Write'])
})


test('reviewer checks source attribution and meaning-changing errors without new research or quotas', () => {
  const prompt = EXPERT_EVIDENCE_OUTPUT_REVIEW_AGENT.getSystemPrompt({} as never)
  expect(prompt).toContain('wrong source URL or source label')
  expect(prompt).toContain('meaning-changing typo')
  expect(prompt).toContain('No new browsing, word-count quota, or source-count quota')
})


test('reviewer follows cumulative reads and interprets an empty correction list as no patch', () => {
  const prompt = EXPERT_EVIDENCE_OUTPUT_REVIEW_AGENT.getSystemPrompt({} as never)
  expect(prompt).toContain('full-file and complete paginated Reads are equivalent')
  expect(prompt).toContain('empty correction list')
  expect(prompt).toContain('audit:<exact-audit-id>')
})

test('uses shared report handoff guidance without extending tool permissions', () => {
  const prompt = EXPERT_EVIDENCE_OUTPUT_REVIEW_AGENT.getSystemPrompt({} as never)
  expect(prompt).toContain(REPORT_EVIDENCE_HANDOFF_GUIDANCE)
  expect(prompt).not.toContain(REPORT_ABSORPTION_WORK_GUIDANCE)
  expect(EXPERT_EVIDENCE_OUTPUT_REVIEW_AGENT.tools).toEqual(['Read', 'Write'])
})
