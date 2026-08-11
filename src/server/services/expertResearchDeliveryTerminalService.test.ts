import { describe, expect, it } from 'bun:test'
import type { ExpertSessionMetadata } from './expertPackRegistryService.js'
import { resolveExpertResearchDeliveryTerminalRecovery } from './expertResearchDeliveryTerminalService.js'

function activeResearchExpert(): ExpertSessionMetadata {
  return {
    mode: 'expert',
    expertId: 'research-pack',
    expertName: 'Research pack',
    packId: 'research-pack',
    packVersion: '1.0.0',
    status: 'active',
    materialRefs: [],
    startedAt: '2026-08-06T00:00:00.000Z',
    updatedAt: '2026-08-06T00:00:00.000Z',
    runtimeBinding: {
      schemaVersion: 1,
      active: true,
      expertId: 'research-pack',
      expertName: 'Research pack',
      packId: 'research-pack',
      packVersion: '1.0.0',
      promptSnapshot: 'Research before delivery.',
      skills: [],
      hostTools: [],
      tools: [],
      permissions: [],
      researchDeliveryPolicy: {
        questionId: 'research-delivery:research-pack',
        acceptedChoiceId: 'accept_current_scope',
        continueChoiceIds: ['provide_material_and_continue'],
        pauseChoiceIds: ['pause_research'],
      },
      researchCompletionPolicy: {
        finalOutputBehavior: 'allow-with-evidence-gaps',
        trackedAgentTypes: ['expert-evidence-researcher', 'expert-evidence-reviewer'],
        minimumCompletedAgents: 4,
        requiredSearchEngines: ['Google', '百度', 'Bing', '360'],
        minimumDistinctSearchQueries: 2,
        minimumOpenedSpecificPublicPages: 6,
        requireConcreteSourcePerAgent: true,
      },
      activatedAt: '2026-08-06T00:00:00.000Z',
    },
    researchCompletion: {
      updatedAt: '2026-08-06T00:01:00.000Z',
      audits: [{
        agentId: 'research-competitors',
        agentType: 'expert-evidence-researcher',
        recordedAt: '2026-08-06T00:01:00.000Z',
        entries: [{
          kind: 'search',
          searchEngine: 'Bing',
          query: 'research pack competitors',
          target: 'https://www.bing.com/search?q=research+pack+competitors',
          status: 'opened',
        }],
      }],
    },
  }
}

describe('Expert research-delivery terminal recovery', () => {
  it('continues an audited research Expert that ends before its delivery decision', () => {
    const recovery = resolveExpertResearchDeliveryTerminalRecovery({
      expert: activeResearchExpert(),
      usedAskUserQuestion: false,
      hasPendingAskUserQuestion: false,
    })

    expect(recovery).toMatchObject({
      kind: 'continue-research-delivery',
      policy: {
        questionId: 'research-delivery:research-pack',
        acceptedChoiceId: 'accept_current_scope',
      },
      completion: {
        complete: false,
      },
      deliveryEligibility: {
        eligible: false,
      },
    })
    expect(recovery?.completion.missing).toContain('仍缺少 3 个已回传浏览审计的研究子代理。')
  })

  it('does not recover an Expert before any tracked browser audit exists', () => {
    const expert = activeResearchExpert()
    expert.researchCompletion = { audits: [], updatedAt: '2026-08-06T00:01:00.000Z' }

    expect(resolveExpertResearchDeliveryTerminalRecovery({
      expert,
      usedAskUserQuestion: false,
      hasPendingAskUserQuestion: false,
    })).toBeNull()
  })

  it('does not recover after the user has accepted the current evidence scope', () => {
    const expert = activeResearchExpert()
    expert.researchDelivery = {
      status: 'accepted-current-scope',
      questionId: 'research-delivery:research-pack',
      selectedChoiceId: 'accept_current_scope',
      unresolvedEvidence: ['Need one more user interview'],
      decidedAt: '2026-08-06T00:02:00.000Z',
    }

    expect(resolveExpertResearchDeliveryTerminalRecovery({
      expert,
      usedAskUserQuestion: false,
      hasPendingAskUserQuestion: false,
    })).toBeNull()
  })

  it('does not interfere with ordinary Experts that did not opt into the policy', () => {
    const expert = activeResearchExpert()
    delete expert.runtimeBinding.researchDeliveryPolicy

    expect(resolveExpertResearchDeliveryTerminalRecovery({
      expert,
      usedAskUserQuestion: false,
      hasPendingAskUserQuestion: false,
    })).toBeNull()
  })
})