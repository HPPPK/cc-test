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


test('replaces a recovery receipt for the same Markdown while retaining its earlier real browser attempts', () => {
  const policy = {
    reviewerAgentType: 'expert-evidence-reviewer',
    sourceAgentTypes: ['expert-evidence-researcher'],
    maxRecords: 8,
    maxCharactersPerRecord: 10_000,
    reviewerEvidenceOnly: true as const,
  }
  const first = recordExpertResearchEvidence(undefined, policy, {
    agentId: 'researcher-original',
    agentType: 'expert-evidence-researcher',
    recordedAt: '2026-08-24T00:00:00.000Z',
    artifactPath: 'commercialization-research/03-user-needs.md',
    content: '# first attempt',
    entries: [{ kind: 'url', target: 'https://www.bilibili.com/video/BV1', status: 'access_limited', actionTypes: ['navigate', 'wait'] }],
  })

  const recovered = recordExpertResearchEvidence(first, policy, {
    agentId: 'researcher-recovery',
    agentType: 'expert-evidence-researcher',
    recordedAt: '2026-08-24T00:01:00.000Z',
    artifactPath: 'commercialization-research/03-user-needs.md',
    content: '# recovery attempt',
    entries: [{ kind: 'url', target: 'https://www.v2ex.com/t/1', status: 'opened', actionTypes: ['navigate', 'wait', 'extract'] }],
  })

  expect(recovered.records).toHaveLength(1)
  expect(recovered.records[0]).toMatchObject({
    agentId: 'researcher-recovery',
    artifactPath: 'commercialization-research/03-user-needs.md',
    entries: expect.arrayContaining([
      expect.objectContaining({ target: 'https://www.bilibili.com/video/BV1', status: 'access_limited' }),
      expect.objectContaining({ target: 'https://www.v2ex.com/t/1', status: 'opened', actionTypes: ['navigate', 'wait', 'extract'] }),
    ]),
  })
})


test('retains every terminal source outcome when one researcher lane exceeds sixty-four assigned URLs', () => {
  const policy = {
    reviewerAgentType: 'expert-evidence-reviewer',
    sourceAgentTypes: ['expert-evidence-researcher'],
    maxRecords: 8,
    maxCharactersPerRecord: 120_000,
    reviewerEvidenceOnly: true as const,
  }
  let state = undefined
  for (let batch = 0; batch < 7; batch++) {
    const entries = Array.from({ length: batch === 6 ? 8 : 10 }, (_, offset) => {
      const index = batch * 10 + offset
      return {
        kind: 'url' as const,
        target: 'https://source-' + index + '.example.com/',
        status: index % 3 === 0 ? 'opened' as const : index % 3 === 1 ? 'access_limited' as const : 'failed' as const,
      }
    })
    state = recordExpertResearchEvidence(state, policy, {
      agentId: 'researcher-wave-' + batch,
      agentType: 'expert-evidence-researcher',
      recordedAt: '2026-08-27T08:0' + batch + ':00.000Z',
      artifactPath: 'commercialization-research/02-competitors.md',
      content: '# wave ' + batch,
      entries,
    })
  }

  expect(state?.records).toHaveLength(1)
  expect(state?.records[0]?.entries).toHaveLength(68)
  expect(state?.records[0]?.entries[0]?.target).toBe('https://source-0.example.com/')
  expect(state?.records[0]?.entries.at(-1)?.target).toBe('https://source-67.example.com/')
})


test('keeps every file-bound audit even after more than eight parts and pathless retries', () => {
  const policy = { reviewerAgentType: 'expert-evidence-reviewer', sourceAgentTypes: ['expert-evidence-researcher'], maxRecords: 8, maxCharactersPerRecord: 1000, reviewerEvidenceOnly: true as const }
  let state: ReturnType<typeof recordExpertResearchEvidence> | undefined
  for (let i = 0; i < 24; i++) state = recordExpertResearchEvidence(state, policy, {
    agentId: 'worker-' + i, agentType: 'expert-evidence-researcher', recordedAt: '2026-09-10T00:00:00Z', content: 'saved',
    ...(i < 12 ? { artifactPath: 'commercialization-research/02-competitors.parts/worker-' + i + '.md' } : {}),
    entries: [{ target: 'https://example.com/' + i, kind: 'url', status: 'opened' }],
  })
  expect(state!.records.filter(record => record.artifactPath)).toHaveLength(12)
  expect(state!.records.filter(record => !record.artifactPath)).toHaveLength(8)
})
