import { describe, expect, test } from 'bun:test'
import {
  recordExpertResearchEvidence,
  resolveExpertResearchEvidenceReviewPolicy,
} from './expertResearchEvidenceReviewService.js'

describe('expertResearchEvidenceReviewService', () => {
  test('keeps bounded researcher evidence with its Playwright audit for a ZIP-declared reviewer', () => {
    const policy = resolveExpertResearchEvidenceReviewPolicy(JSON.stringify({
      researchEvidenceReview: {
        reviewerAgentType: 'expert-evidence-reviewer',
        sourceAgentTypes: ['expert-evidence-researcher'],
        maxRecords: 4,
        maxCharactersPerRecord: 2000,
        reviewerEvidenceOnly: true,
      },
    }))
    if (!policy) throw new Error('expected policy')

    const state = recordExpertResearchEvidence(undefined, policy, {
      agentId: 'competitor-researcher',
      agentType: 'expert-evidence-researcher',
      recordedAt: '2026-08-12T00:00:00.000Z',
      content: 'Typora pricing page reports a one-time purchase price.',
      entries: [{
        target: 'https://typora.io/',
        finalUrl: 'https://typora.io/',
        kind: 'url',
        status: 'opened',
      }],
    })

    expect(state.records).toEqual([expect.objectContaining({
      agentId: 'competitor-researcher',
      agentType: 'expert-evidence-researcher',
      content: 'Typora pricing page reports a one-time purchase price.',
      entries: [expect.objectContaining({ status: 'opened', finalUrl: 'https://typora.io/' })],
    })])
  })
})
