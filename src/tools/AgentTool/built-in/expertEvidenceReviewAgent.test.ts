import { expect, test } from 'bun:test'
import { EXPERT_EVIDENCE_REVIEW_AGENT } from './expertEvidenceReviewAgent.js'

test('review uses saved evidence and never invents a restriction from missing content', () => {
  const prompt = EXPERT_EVIDENCE_REVIEW_AGENT.getSystemPrompt({} as never)
  expect(prompt).toContain('all registered research parts')
  expect(prompt).toContain('not by opening live source pages')
  expect(prompt).toContain('Use access-limited or no-result only when the exact browser audit actually records that outcome')
  expect(prompt).not.toContain('downgrade that wording to candidate, access-limited, no-result')
  expect(EXPERT_EVIDENCE_REVIEW_AGENT.tools).toEqual(['Read', 'Write'])
})
