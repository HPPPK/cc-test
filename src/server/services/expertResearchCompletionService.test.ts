import { describe, expect, it } from 'bun:test'
import {
  evaluateExpertResearchCompletion,
  evaluateExpertResearchDeliveryEligibility,
  resolveExpertResearchCompletionPolicy,
  type ExpertResearchCompletionPolicy,
  type ExpertResearchCompletionState,
} from './expertResearchCompletionService.js'

const policy: ExpertResearchCompletionPolicy = {
  finalOutputBehavior: 'allow-with-evidence-gaps',
  trackedAgentTypes: ['expert-evidence-researcher', 'expert-evidence-reviewer'],
  minimumCompletedAgents: 4,
  minimumCompletedAgentsByType: {
    'expert-evidence-researcher': 3,
    'expert-evidence-reviewer': 1,
  },
  requiredSearchEngines: ['Google', '百度', 'Bing', '360'],
  minimumDistinctSearchQueries: 2,
  minimumOpenedSpecificPublicPages: 4,
  minimumDistinctOpenedSourceDomains: 4,
  requireConcreteSourcePerAgent: true,
}

function stateWithAudits(): ExpertResearchCompletionState {
  return {
    updatedAt: '2026-08-06T00:00:00.000Z',
    audits: [
      {
        agentId: 'research-competitors',
        agentType: 'expert-evidence-researcher',
        recordedAt: '2026-08-06T00:00:00.000Z',
        entries: [
          { kind: 'search', searchEngine: 'Bing', query: 'markdown reader competitors', target: 'https://www.bing.com/search?q=markdown+reader', status: 'opened' },
          { kind: 'url', target: 'https://typora.io/', status: 'opened' },
        ],
      },
      {
        agentId: 'research-demand-market',
        agentType: 'expert-evidence-researcher',
        recordedAt: '2026-08-06T00:00:00.000Z',
        entries: [
          { kind: 'search', searchEngine: 'Google', query: 'markdown reader user demand', target: 'https://www.google.com/search?q=markdown+reader', status: 'access_limited' },
          { kind: 'url', target: 'https://www.reddit.com/r/Markdown/', status: 'opened' },
        ],
      },
      {
        agentId: 'research-commercialization-channel',
        agentType: 'expert-evidence-researcher',
        recordedAt: '2026-08-06T00:00:00.000Z',
        entries: [
          { kind: 'search', searchEngine: '百度', query: 'Markdown 阅读器 需求', target: 'https://www.baidu.com/s?wd=Markdown', status: 'access_limited' },
          { kind: 'url', target: 'https://www.bilibili.com/', status: 'opened' },
        ],
      },
      {
        agentId: 'research-evidence-review',
        agentType: 'expert-evidence-reviewer',
        recordedAt: '2026-08-06T00:00:00.000Z',
        entries: [
          { kind: 'search', searchEngine: '360', query: 'Markdown 阅读器 定价', target: 'https://www.so.com/s?q=Markdown', status: 'access_limited' },
          { kind: 'url', target: 'https://obsidian.md/pricing', status: 'opened' },
        ],
      },
    ],
  }
}

describe('Expert research completion policy', () => {
  it('requires the configured research/review composition before an evidence-gap decision', () => {
    const incomplete = stateWithAudits()
    incomplete.audits.pop()

    const result = evaluateExpertResearchDeliveryEligibility(policy, incomplete)

    expect(result.eligible).toBe(false)
    expect(result.missing).toContain('仍缺少 1 个已回传浏览审计的研究子代理。')
    expect(result.missing).toContain('仍缺少 1 个类型为 expert-evidence-reviewer 的已回传浏览审计子代理。')
  })

  it('treats access-limited engines as attempted while requiring diverse concrete pages', () => {
    const result = evaluateExpertResearchCompletion(policy, stateWithAudits())

    expect(result).toEqual({ complete: true, missing: [] })
  })

  it('rejects a policy whose typed minimums exceed its overall minimum', () => {
    expect(() => resolveExpertResearchCompletionPolicy(JSON.stringify({
      researchCompletion: {
        finalOutputBehavior: 'allow-with-evidence-gaps',
        trackedAgentTypes: ['expert-evidence-researcher', 'expert-evidence-reviewer'],
        minimumCompletedAgents: 3,
        minimumCompletedAgentsByType: {
          'expert-evidence-researcher': 3,
          'expert-evidence-reviewer': 1,
        },
        requiredSearchEngines: ['Google'],
        minimumDistinctSearchQueries: 1,
        minimumOpenedSpecificPublicPages: 1,
        requireConcreteSourcePerAgent: true,
      },
    }))).toThrow('minimumCompletedAgents 不得小于')
  })
})
