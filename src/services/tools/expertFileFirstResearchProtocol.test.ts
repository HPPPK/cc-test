import { describe, expect, test } from 'bun:test'
import { researchArtifactRootPath, createResearcherPartPath, registeredResearchArtifactPaths, resolveFileFirstExpertAgentType } from './expertFileFirstResearchProtocol.js'

const base = 'commercialization-research/02-competitors.md'
describe('file-first research parts', () => {
  test('isolates arbitrary numbers of workers while retaining source ownership', () => {
    const parts = Array.from({ length: 12 }, (_, i) => createResearcherPartPath(base, 'worker-' + i))
    expect(new Set(parts).size).toBe(12)
    for (const part of parts) expect(researchArtifactRootPath(part)).toBe(base)
    expect(registeredResearchArtifactPaths({ researcherPaths: [base], researcherParts: true }, parts.map(artifactPath => ({ artifactPath })))).toEqual(parts)
    expect(resolveFileFirstExpertAgentType({ agentType: 'general-purpose', artifactPath: parts[0], artifactPaths: { researcherPaths: [base], researcherParts: true, reviewerPath: 'review.md' } })).toBe('expert-evidence-researcher')
  })
  test('does not treat unsafe or unrelated paths as parts of the lane', () => {
    expect(() => createResearcherPartPath(base, '../escape')).toThrow()
    expect(researchArtifactRootPath('commercialization-research/02-competitors.parts/../../secrets.md')).not.toBe(base)
    expect(registeredResearchArtifactPaths({ researcherPaths: [base], researcherParts: true }, [{ artifactPath: 'other.md' }])).toEqual([])
  })
})
