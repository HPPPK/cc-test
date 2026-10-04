/**
 * Shared transport contract for Expert workers whose durable Markdown is the
 * only source of research details. Keep this list independent from prompts so
 * every runtime boundary applies the same no-prose handoff rule.
 */
const FILE_FIRST_EXPERT_RESEARCH_AGENT_TYPES = new Set([
  'expert-evidence-researcher',
  'expert-evidence-reviewer',
  'expert-evidence-absorber',
  'expert-evidence-output-reviewer',
])

export function isFileFirstExpertResearchAgentType(agentType: string | undefined): boolean {
  return Boolean(agentType && FILE_FIRST_EXPERT_RESEARCH_AGENT_TYPES.has(agentType))
}


/** Shared role mapping. Only the active pack's declared artifact paths count. */
export function resolveFileFirstExpertAgentType(input: {
  agentType: string | undefined
  artifactPath: string | undefined
  artifactPaths: { researcherPaths: readonly string[]; researcherParts?: boolean; reviewerPath: string; absorptionPath?: string; completionReviewPath?: string } | undefined
}): string | undefined {
  const { agentType, artifactPath, artifactPaths } = input
  if (!artifactPath || !artifactPaths || (agentType && agentType !== 'general-purpose' && !isFileFirstExpertResearchAgentType(agentType))) return agentType
  if (registeredResearchArtifactPaths(artifactPaths, [{ artifactPath }]).length > 0) return 'expert-evidence-researcher'
  if (artifactPath === artifactPaths.reviewerPath) return 'expert-evidence-reviewer'
  if (artifactPath === artifactPaths.absorptionPath) return 'expert-evidence-absorber'
  if (artifactPath === artifactPaths.completionReviewPath) return 'expert-evidence-output-reviewer'
  return agentType
}

/** A/B/C are source-ownership lanes, not a three-file storage limit. */
export function researchArtifactRootPath(artifactPath: string): string {
  return artifactPath.replace(/\\/g, '/').replace(/\.parts\/[A-Za-z0-9_-]+\.md$/, '.md')
}

export function createResearcherPartPath(rootPath: string, agentId: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(agentId)) throw new Error('Invalid researcher part id')
  return researchArtifactRootPath(rootPath).replace(/\.md$/, '.parts/' + agentId + '.md')
}

export function registeredResearchArtifactPaths(
  policy: { researcherPaths: readonly string[]; researcherParts?: boolean },
  records: readonly { artifactPath?: string }[],
): string[] {
  return [...new Set(records.flatMap(({ artifactPath }) => artifactPath && (
    policy.researcherPaths.includes(artifactPath)
    || (policy.researcherParts && policy.researcherPaths.includes(researchArtifactRootPath(artifactPath)))
  ) ? [artifactPath] : []))]
}
