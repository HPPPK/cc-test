import type { ExpertSessionMetadata } from './expertPackRegistryService.js'
import { hasAcceptedExpertResearchDelivery, type ExpertResearchDeliveryPolicy } from './expertResearchDeliveryService.js'
import {
  evaluateExpertResearchCompletion,
  evaluateExpertResearchDeliveryEligibility,
  type ExpertResearchCompletionEvaluation,
} from './expertResearchCompletionService.js'

export type ExpertResearchDeliveryTerminalRecovery = {
  kind: 'continue-research-delivery'
  policy: ExpertResearchDeliveryPolicy
  completion: ExpertResearchCompletionEvaluation
  deliveryEligibility: {
    eligible: boolean
    missing: string[]
  }
}

export type ExpertResearchDeliveryTerminalRecoveryInput = {
  expert: ExpertSessionMetadata | undefined
  usedAskUserQuestion: boolean
  hasPendingAskUserQuestion: boolean
}

/**
 * Resolves the opt-in end-of-turn handoff for a research Expert.
 *
 * This is deliberately driven only by the ZIP-derived runtime policies and
 * persisted browser audit receipts. Ordinary Experts, ordinary chat, and an
 * Expert that has not yet started auditable research are left untouched.
 */
export function resolveExpertResearchDeliveryTerminalRecovery(
  input: ExpertResearchDeliveryTerminalRecoveryInput,
): ExpertResearchDeliveryTerminalRecovery | null {
  const expert = input.expert
  const binding = expert?.runtimeBinding
  if (
    !expert
    || expert.mode !== 'expert'
    || expert.status !== 'active'
    || binding?.active !== true
    || input.usedAskUserQuestion
    || input.hasPendingAskUserQuestion
  ) {
    return null
  }

  const deliveryPolicy = binding.researchDeliveryPolicy
  const completionPolicy = binding.researchCompletionPolicy
  if (!deliveryPolicy || !completionPolicy) return null

  // An accepted report can move to the template-fill flow, while a paused
  // research session must remain paused until the user explicitly resumes it.
  if (
    hasAcceptedExpertResearchDelivery(expert.researchDelivery)
    || expert.researchDelivery?.status === 'paused'
  ) {
    return null
  }

  const trackedAudits = (expert.researchCompletion?.audits ?? [])
    .filter((audit) => completionPolicy.trackedAgentTypes.includes(audit.agentType))
  if (trackedAudits.length === 0) return null

  return {
    kind: 'continue-research-delivery',
    policy: deliveryPolicy,
    completion: evaluateExpertResearchCompletion(completionPolicy, expert.researchCompletion),
    deliveryEligibility: evaluateExpertResearchDeliveryEligibility(completionPolicy, expert.researchCompletion),
  }
}