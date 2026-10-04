import { describe, expect, test } from 'bun:test'
import {
  allowedExpertResearchArtifactPaths,
  canonicalizeExpertResearchArtifactInputPath,
  resolveExpertResearchArtifactPath,
  resolveExpertResearchArtifactPolicy,
  resolveRuntimeExpertResearchArtifactPolicy,
} from './expertResearchArtifactPolicyService.js'

const protocol = JSON.stringify({
  researchArtifacts: {
    mode: 'markdown-path-only',
    directory: 'commercialization-research',
    briefPath: 'commercialization-research/01-research-brief.md',
    researcherPaths: [
      'commercialization-research/02-competitors.md',
      'commercialization-research/03-user-needs.md',
      'commercialization-research/04-channels.md',
    ],
    reviewerPath: 'commercialization-research/05-evidence-review.md',
    auditPath: 'commercialization-research/06-browser-audit.md',
    absorptionPath: 'commercialization-research/07-report-field-absorption.md',
    completionReviewPath: 'commercialization-research/08-report-completeness-review.md',
    maxCharacters: 90_000,
  },
})

describe('expert research artifact policy', () => {
  test('accepts only declared session-relative Markdown artifacts', () => {
    const policy = resolveExpertResearchArtifactPolicy(protocol)!
    expect(allowedExpertResearchArtifactPaths(policy, 'researcher-report')).toEqual([
      'commercialization-research/02-competitors.md',
      'commercialization-research/03-user-needs.md',
      'commercialization-research/04-channels.md',
    ])
    expect(allowedExpertResearchArtifactPaths(policy, 'field-absorption')).toEqual([
      'commercialization-research/07-report-field-absorption.md',
    ])
    expect(allowedExpertResearchArtifactPaths(policy, 'final-output-review')).toEqual([
      'commercialization-research/08-report-completeness-review.md',
    ])
    expect(resolveExpertResearchArtifactPath({
      workDir: 'C:/session/workdir',
      policy,
      artifactPath: 'commercialization-research/03-user-needs.md',
      allowedKinds: ['researcher-report'],
    })).toMatchObject({
      relativePath: 'commercialization-research/03-user-needs.md',
      absolutePath: expect.stringContaining('commercialization-research'),
    })
  })

  test('accepts the bare runtime policy object that ConversationService passes to child agents', () => {
    const bareRuntimePolicy = JSON.stringify(JSON.parse(protocol).researchArtifacts)
    expect(resolveRuntimeExpertResearchArtifactPolicy(bareRuntimePolicy)).toEqual(
      resolveExpertResearchArtifactPolicy(protocol),
    )
  })

  test('keeps the legacy wrapped runtime policy form compatible', () => {
    expect(resolveRuntimeExpertResearchArtifactPolicy(protocol)).toEqual(
      resolveExpertResearchArtifactPolicy(protocol),
    )
  })

  test('permits a small positive maximum without imposing an artificial research length minimum', () => {
    const policy = resolveExpertResearchArtifactPolicy(JSON.stringify({
      researchArtifacts: {
        mode: 'markdown-path-only',
        directory: 'commercialization-research',
        briefPath: 'commercialization-research/01-research-brief.md',
        researcherPaths: ['commercialization-research/02-competitors.md'],
        reviewerPath: 'commercialization-research/05-evidence-review.md',
        auditPath: 'commercialization-research/06-browser-audit.md',
        maxCharacters: 1,
      },
    }))
    expect(policy?.maxCharacters).toBe(1)
  })

  test('carries an opt-in dynamic route completion contract without affecting legacy artifact packs', () => {
    const policy = resolveExpertResearchArtifactPolicy(JSON.stringify({
      researchArtifacts: {
        mode: 'markdown-path-only',
        directory: 'commercialization-research',
        briefPath: 'commercialization-research/01-research-brief.md',
        researcherPaths: ['commercialization-research/02-competitors.md'],
        reviewerPath: 'commercialization-research/05-evidence-review.md',
        auditPath: 'commercialization-research/06-browser-audit.md',
        maxCharacters: 90_000,
        routeCompletion: { mode: 'dynamic-route-status-v1' },
      },
    }))
    expect(policy?.routeCompletion).toEqual({ mode: 'dynamic-route-status-v1' })
  })


  test('carries a pack-scoped dual-market route and page-disposition contract', () => {
    const policy = resolveExpertResearchArtifactPolicy(JSON.stringify({
      researchArtifacts: {
        mode: 'markdown-path-only',
        directory: 'commercialization-research',
        briefPath: 'commercialization-research/01-research-brief.md',
        researcherPaths: [
          'commercialization-research/02-competitors.md',
          'commercialization-research/03-user-needs.md',
          'commercialization-research/04-channels.md',
        ],
        reviewerPath: 'commercialization-research/05-evidence-review.md',
        auditPath: 'commercialization-research/06-browser-audit.md',
        maxCharacters: 90_000,
        requireOpenedPageDisposition: true,
        routeCompletion: {
          mode: 'dynamic-route-status-v1',
          defaultMarketScope: 'dual',
          requiredSourceLanesByReport: {
            'commercialization-research/03-user-needs.md': ['cn-user', 'global-user'],
          },
          sourceLanes: {
            'cn-user': { hostSuffixes: ['zhihu.com', 'bilibili.com'] },
            'global-user': { hostSuffixes: ['reddit.com', 'github.com'], allowConcreteOpenedPageFallback: true },
          },
        },
      },
    }))

    expect(policy).toMatchObject({
      requireOpenedPageDisposition: true,
      routeCompletion: {
        mode: 'dynamic-route-status-v1',
        defaultMarketScope: 'dual',
        requiredSourceLanesByReport: {
          'commercialization-research/03-user-needs.md': ['cn-user', 'global-user'],
        },
        sourceLanes: {
          'global-user': expect.objectContaining({
            allowConcreteOpenedPageFallback: true,
          }),
        },
      },
    })
  })

  test('accepts a brief-selected route contract without fixed source lanes', () => {
    const policy = resolveExpertResearchArtifactPolicy(JSON.stringify({
      researchArtifacts: {
        mode: 'markdown-path-only',
        directory: 'commercialization-research',
        briefPath: 'commercialization-research/01-research-brief.md',
        researcherPaths: ['commercialization-research/03-user-needs.md'],
        reviewerPath: 'commercialization-research/05-evidence-review.md',
        auditPath: 'commercialization-research/06-browser-audit.md',
        maxCharacters: 90_000,
        routeCompletion: { mode: 'dynamic-route-status-v2', requireAttemptedRequiredRoutes: true },
      },
    }))

    expect(policy?.routeCompletion).toEqual({
      mode: 'dynamic-route-status-v2',
      requireAttemptedRequiredRoutes: true,
    })
  })

  test('keeps packages without a report-field absorption path compatible', () => {
    const legacy = JSON.parse(protocol)
    delete legacy.researchArtifacts.absorptionPath
    delete legacy.researchArtifacts.completionReviewPath
    const policy = resolveExpertResearchArtifactPolicy(JSON.stringify(legacy))!
    expect(allowedExpertResearchArtifactPaths(policy, 'field-absorption')).toEqual([])
    expect(allowedExpertResearchArtifactPaths(policy, 'final-output-review')).toEqual([])
  })

  test('rejects traversal, arbitrary files, and malformed contracts', () => {
    const policy = resolveExpertResearchArtifactPolicy(protocol)!
    expect(() => resolveExpertResearchArtifactPath({
      workDir: 'C:/session/workdir', policy, artifactPath: '../outside.md', allowedKinds: ['researcher-report'],
    })).toThrow('会话工作目录')
    expect(() => resolveExpertResearchArtifactPath({
      workDir: 'C:/session/workdir', policy, artifactPath: 'commercialization-research/other.md', allowedKinds: ['researcher-report'],
    })).toThrow('不在当前阶段允许的文件清单')
    expect(() => resolveExpertResearchArtifactPolicy(JSON.stringify({
      researchArtifacts: { mode: 'markdown-path-only', directory: 'x', briefPath: 'x/a.md' },
    }))).toThrow('reviewerPath')
  })

  test('canonicalizes matching absolute and relative session paths while keeping the contract relative-only', () => {
    const policy = resolveExpertResearchArtifactPolicy(protocol)!
    const relative = resolveExpertResearchArtifactPath({
      workDir: 'C:/Users/test/Desktop/0816',
      policy,
      artifactPath: 'commercialization-research/01-research-brief.md',
      allowedKinds: ['research-brief'],
    })
    const absolute = resolveExpertResearchArtifactPath({
      workDir: 'C:/Users/test/Desktop/0816',
      policy,
      artifactPath: 'C:/Users/test/Desktop/0816/commercialization-research/01-research-brief.md',
      allowedKinds: ['research-brief'],
    })
    expect(absolute.relativePath).toBe(relative.relativePath)
    expect(canonicalizeExpertResearchArtifactInputPath({
      workDir: 'C:/Users/test/Desktop/0816',
      artifactPath: 'C:/Users/test/Desktop/0816/commercialization-research/03-user-needs.md',
    }).relativePath).toBe('commercialization-research/03-user-needs.md')
    expect(() => resolveExpertResearchArtifactPath({
      workDir: 'C:/Users/test/Desktop/0816',
      policy,
      artifactPath: 'C:/Users/test/Desktop/elsewhere/commercialization-research/03-user-needs.md',
      allowedKinds: ['researcher-report'],
    })).toThrow('会话工作目录')
  })

})


test('accepts opted-in worker parts, but not other lanes, traversal or review output parts', () => {
  const source = JSON.parse(protocol)
  source.researchArtifacts.researcherParts = true
  const policy = resolveExpertResearchArtifactPolicy(JSON.stringify(source))!
  expect(policy.researcherParts).toBe(true)
  const resolve = (artifactPath: string) => resolveExpertResearchArtifactPath({ workDir: 'C:/session/workdir', policy, artifactPath, allowedKinds: ['researcher-report'] })
  expect(resolve('commercialization-research/02-competitors.parts/worker-12.md').relativePath).toBe('commercialization-research/02-competitors.parts/worker-12.md')
  expect(() => resolve('commercialization-research/05-evidence-review.parts/fake.md')).toThrow()
  expect(() => resolve('commercialization-research/02-competitors.parts/../../secret.md')).toThrow()
  expect(() => resolveExpertResearchArtifactPath({ workDir: 'C:/session/workdir', policy: resolveExpertResearchArtifactPolicy(protocol)!, artifactPath: 'commercialization-research/02-competitors.parts/worker-12.md', allowedKinds: ['researcher-report'] })).toThrow()
})
