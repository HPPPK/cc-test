import { describe, expect, test } from 'bun:test'
import {
  formatExpertAssignedResearchSourceBatch,
  formatExpertSubagentResearchEvidenceContext,
  formatExpertSubagentSkillContext,
  isFileFirstReviewerReadAllowed,
  ExpertSubagentContextGateError,
  loadExpertPostReviewEvidenceAbsorptionContext,
  loadExpertSubagentResearchEvidenceContext,
  loadExpertSubagentSkillContext,
  recordExpertSubagentResearchAudit,
  recordExpertSubagentResearchSourceDispatch,
  resolveExpertAssignedResearchSourceBatch,
  resolveExpertSubagentTypeForDispatch,
} from './expertSubagentSkillRuntime.js'

const expertEnv = {
  CC_JIANGXIA_EXPERT_SESSION_ID: 'expert-session-123',
  CC_JIANGXIA_DESKTOP_SERVER_URL: 'http://127.0.0.1:3456/',
} as NodeJS.ProcessEnv

function packageSkillResponse() {
  return new Response(JSON.stringify({
    expertId: 'commercialization-research-report',
    packId: 'commercialization-research-report',
    packVersion: '0.13.0-local',
    artifactPaths: {
      briefPath: 'commercialization-research/01-research-brief.md',
      researcherPaths: ['commercialization-research/02-competitors.md'],
      reviewerPath: 'commercialization-research/05-evidence-review.md',
      auditPath: 'commercialization-research/06-browser-audit.md',
    },
    skills: [{
      skillId: 'browser-information-retrieval',
      title: 'Browser information retrieval',
      path: 'skills/browser-information-retrieval/SKILL.md',
      sha256: 'abc123',
      content: 'Use visible Playwright actions, then open concrete public pages.',
    }],
  }), { status: 200, headers: { 'content-type': 'application/json' } })
}

describe('expertSubagentSkillRuntime', () => {
  test('does not call the local service for a normal agent or absent Expert session', async () => {
    let calls = 0
    const fetch = async () => {
      calls++
      return packageSkillResponse()
    }

    expect(await loadExpertSubagentSkillContext('general-purpose', { env: expertEnv, fetch })).toBeUndefined()
    expect(await loadExpertSubagentSkillContext('expert-evidence-researcher', {
      env: {} as NodeJS.ProcessEnv,
      fetch,
    })).toBeUndefined()
    expect(calls).toBe(0)
  })

  test('loads only the active package context for the delegated Expert agent type', async () => {
    let requestedUrl = ''
    const context = await loadExpertSubagentSkillContext('expert-evidence-researcher', {
      env: expertEnv,
      fetch: async (input) => {
        requestedUrl = String(input)
        return packageSkillResponse()
      },
    })

    expect(requestedUrl).toBe('http://127.0.0.1:3456/api/sessions/expert-session-123/expert/subagent-skill-context?agentType=expert-evidence-researcher')
    const prompt = formatExpertSubagentSkillContext(context)
    expect(structuredClone(context)).toMatchObject({
      expertId: 'commercialization-research-report',
      artifactPaths: expect.objectContaining({
        researcherPaths: ['commercialization-research/02-competitors.md'],
      }),
      skills: [expect.objectContaining({ skillId: 'browser-information-retrieval' })],
    })
    expect(prompt).toContain('<expert-subagent-package-skills>')
    expect(prompt).toContain('browser-information-retrieval')
    expect(prompt).not.toContain('user chat history')
    expect(prompt).not.toContain('commercialization-research/02-competitors.md')
  })

  test('reports transcript audit only to the active Expert Runtime endpoint', async () => {
    let request: { url: string; init?: RequestInit } | undefined
    await recordExpertSubagentResearchAudit({
      agentId: 'agent-1', agentType: 'expert-evidence-researcher', artifactPath: 'commercialization-research/02-competitors.md', entries: [{ target: 'https://example.com', status: 'opened' }],
    }, {
      env: expertEnv,
      fetch: async (url, init) => {
        request = { url: String(url), init }
        return new Response('{}', { status: 200 })
      },
    })
    expect(request?.url).toBe('http://127.0.0.1:3456/api/sessions/expert-session-123/expert/research-audit')
    expect(request?.init?.method).toBe('POST')
    expect(request?.init?.body).toContain('agent-1')
    expect(request?.init?.body).toContain('commercialization-research/02-competitors.md')
  })

  test('does not silently accept a completed researcher when the audit transport is missing its session binding', async () => {
    let calls = 0
    await expect(recordExpertSubagentResearchAudit({
      agentId: 'researcher-without-binding',
      agentType: 'expert-evidence-researcher',
      entries: [{ target: 'https://example.com', status: 'opened' }],
    }, {
      env: {} as NodeJS.ProcessEnv,
      fetch: async () => {
        calls++
        return new Response('{}', { status: 200 })
      },
    })).rejects.toMatchObject({ code: 'EXPERT_RESEARCH_AUDIT_PERSISTENCE_FAILED' })
    expect(calls).toBe(0)
  })

  test('surfaces persistence failure for evidence agents so the parent cannot mistake an unsaved reviewer for completion', async () => {
    const errors: unknown[] = []
    const originalError = console.error
    console.error = (...args: unknown[]) => { errors.push(args.join(' ')) }
    try {
      await expect(recordExpertSubagentResearchAudit({
        agentId: 'reviewer-1',
        agentType: 'expert-evidence-reviewer',
        entries: [],
      }, {
        env: expertEnv,
        fetch: async () => new Response('研究浏览审计无效', { status: 400 }),
      })).rejects.toMatchObject({ code: 'EXPERT_RESEARCH_AUDIT_PERSISTENCE_FAILED' })
      await expect(recordExpertSubagentResearchAudit({
        agentId: 'reviewer-2',
        agentType: 'expert-evidence-reviewer',
        entries: [],
      }, {
        env: expertEnv,
        fetch: async () => { throw new Error('socket hung up') },
      })).rejects.toMatchObject({ code: 'EXPERT_RESEARCH_AUDIT_PERSISTENCE_FAILED' })
      await expect(recordExpertSubagentResearchAudit({
        agentId: 'output-reviewer-1',
        agentType: 'expert-evidence-output-reviewer',
        entries: [],
      }, {
        env: expertEnv,
        fetch: async () => new Response('review receipt unavailable', { status: 503 }),
      })).rejects.toMatchObject({ code: 'EXPERT_RESEARCH_AUDIT_PERSISTENCE_FAILED' })
    } finally {
      console.error = originalError
    }
    expect(errors).toEqual([])
  })

  test('fails closed when the local service returns an error or malformed context', async () => {
    expect(await loadExpertSubagentSkillContext('expert-evidence-researcher', {
      env: expertEnv,
      fetch: async () => new Response('unavailable', { status: 503 }),
    })).toBeUndefined()

    expect(await loadExpertSubagentSkillContext('expert-evidence-researcher', {
      env: expertEnv,
      fetch: async () => new Response(JSON.stringify({ skills: [] }), { status: 200 }),
    })).toBeUndefined()
  })

  test('retains upstream evidence text for a legacy non-file-first Expert', async () => {
    let requestedUrl = ''
    const context = await loadExpertSubagentResearchEvidenceContext('expert-evidence-reviewer', {
      env: expertEnv,
      fetch: async (input) => {
        requestedUrl = String(input)
        return new Response(JSON.stringify({
          expertId: 'commercialization-research-report',
          packId: 'commercialization-research-report',
          packVersion: '0.14.0-local',
          reviewerEvidenceOnly: true,
          records: [{
            agentId: 'competitor-researcher',
            agentType: 'legacy-evidence-researcher',
            recordedAt: '2026-08-12T00:00:00.000Z',
            content: 'Typora is a one-time purchase competitor.',
            entries: [{ target: 'https://typora.io/', finalUrl: 'https://typora.io/', kind: 'url', status: 'opened' }],
          }],
        }), { status: 200 })
      },
    })

    expect(requestedUrl).toBe('http://127.0.0.1:3456/api/sessions/expert-session-123/expert/subagent-research-evidence-context?agentType=expert-evidence-reviewer')
    const prompt = formatExpertSubagentResearchEvidenceContext(context)
    expect(prompt).toContain('<expert-subagent-research-evidence>')
    expect(prompt).toContain('Typora is a one-time purchase competitor.')
    expect(prompt).toContain('Do not use Read to search the work directory')
    expect(prompt).toContain('https://typora.io/')
  })

  test("drops a legacy file-first worker's free-form content when fixed paths are absent", async () => {
    const context = await loadExpertSubagentResearchEvidenceContext('expert-evidence-reviewer', {
      env: expertEnv,
      fetch: async () => new Response(JSON.stringify({
        expertId: 'commercialization-research-report', packId: 'commercialization-research-report', packVersion: '0.14.0-local',
        reviewerEvidenceOnly: true,
        records: [{
          agentId: 'competitor-researcher',
          agentType: 'expert-evidence-researcher',
          recordedAt: '2026-08-12T00:00:00.000Z',
          artifactPath: 'commercialization-research/02-competitors.md',
          content: 'LEAK: the full competitor findings and reasoning must never enter the reviewer prompt.',
          entries: [{ target: 'https://example.com/hidden', finalUrl: 'https://example.com/hidden', kind: 'url', status: 'opened' }],
        }],
      }), { status: 200 }),
    })

    const prompt = formatExpertSubagentResearchEvidenceContext(context)
    expect(prompt).toContain('02-competitors.md')
    expect(prompt).toContain('stored free-form handoff and browser audit are intentionally not forwarded')
    expect(prompt).not.toContain('LEAK: the full competitor findings')
    expect(prompt).not.toContain('https://example.com/hidden')
  })

  test('passes only declared Markdown paths to a file-first reviewer and never injects researcher prose', async () => {
    const context = await loadExpertSubagentResearchEvidenceContext('expert-evidence-reviewer', {
      env: expertEnv,
      fetch: async () => new Response(JSON.stringify({
        expertId: 'commercialization-research-report', packId: 'commercialization-research-report', packVersion: '0.13.23-local',
        reviewerEvidenceOnly: true, records: [],
        artifactPaths: {
          briefPath: 'commercialization-research/01-research-brief.md',
          researcherPaths: [
            'commercialization-research/02-competitors.md',
            'commercialization-research/03-user-needs.md',
            'commercialization-research/04-channels.md',
          ],
          reviewerPath: 'commercialization-research/05-evidence-review.md',
          auditPath: 'commercialization-research/06-browser-audit.md',
        },
      }), { status: 200 }),
    })
    const prompt = formatExpertSubagentResearchEvidenceContext(context)
    expect(prompt).toContain('Read only these exact session Markdown artifacts')
    expect(prompt).toContain('01-research-brief.md')
    expect(prompt).toContain('04-channels.md')
    expect(prompt).toContain('06-browser-audit.md')
    expect(prompt).toContain('hand back exactly one short file receipt only')
    expect(prompt).toContain('do not repeat findings, evidence, URLs, or review prose')
    expect(prompt).not.toContain('Typora is a one-time purchase competitor.')
    expect(prompt).not.toContain('Playwright audit:')
    const artifactPaths = context?.artifactPaths
    if (!artifactPaths) throw new Error('expected file-first paths')
    expect(isFileFirstReviewerReadAllowed({ file_path: artifactPaths.briefPath }, artifactPaths)).toBe(true)
    expect(isFileFirstReviewerReadAllowed({ file_path: artifactPaths.auditPath }, artifactPaths)).toBe(true)
    expect(isFileFirstReviewerReadAllowed({ file_path: artifactPaths.reviewerPath }, artifactPaths)).toBe(true)
    expect(isFileFirstReviewerReadAllowed({ file_path: '../README.md' }, artifactPaths)).toBe(false)
  })

  test('surfaces server-enforced research gates instead of launching an unscoped agent', async () => {
    const blocked = async () => new Response(JSON.stringify({
      error: 'EXPERT_RESEARCH_BRIEF_REQUIRED',
      message: '尚未先生成有效的调研任务说明 Markdown。',
    }), { status: 409, headers: { 'content-type': 'application/json' } })

    await expect(loadExpertSubagentSkillContext('expert-evidence-researcher', {
      env: expertEnv,
      fetch: blocked,
    })).rejects.toBeInstanceOf(ExpertSubagentContextGateError)
    await expect(loadExpertSubagentResearchEvidenceContext('expert-evidence-reviewer', {
      env: expertEnv,
      fetch: blocked,
    })).rejects.toMatchObject({ code: 'EXPERT_RESEARCH_BRIEF_REQUIRED' })
  })

  test('loads a post-review absorption instruction only when the server returns the ZIP-authorized reviewer context', async () => {
    let requestedUrl = ''
    const context = await loadExpertPostReviewEvidenceAbsorptionContext('expert-evidence-reviewer', {
      env: expertEnv,
      fetch: async (input) => {
        requestedUrl = String(input)
        return new Response(JSON.stringify({
          expertId: 'commercialization-research-report',
          packId: 'commercialization-research-report',
          packVersion: '0.13.5-local',
          instruction: '<expert-post-review-evidence-absorption>\nTypora pricing ledger detail.\n</expert-post-review-evidence-absorption>',
        }), { status: 200 })
      },
    })
    expect(requestedUrl).toBe('http://127.0.0.1:3456/api/sessions/expert-session-123/expert/post-review-evidence-absorption-context?agentType=expert-evidence-reviewer')
    expect(context?.instruction).toContain('Typora pricing ledger detail.')

    expect(await loadExpertPostReviewEvidenceAbsorptionContext('general-purpose', { env: expertEnv, fetch: async () => { throw new Error('should not fetch') } })).toBeUndefined()
    expect(await loadExpertPostReviewEvidenceAbsorptionContext('expert-evidence-reviewer', {
      env: expertEnv,
      fetch: async () => new Response(JSON.stringify({ instruction: 'untrusted' }), { status: 200 }),
    })).toBeUndefined()
  })


  test('retains the server-persisted exact HTML identity for an output reviewer after reconnect', async () => {
    const context = await loadExpertSubagentSkillContext('expert-evidence-output-reviewer', {
      env: expertEnv,
      fetch: async () => new Response(JSON.stringify({
        expertId: 'commercialization-research-report',
        packId: 'commercialization-research-report',
        packVersion: '0.13.0-local',
        artifactPaths: {
          briefPath: 'commercialization-research/01-research-brief.md',
          researcherPaths: ['commercialization-research/02-competitors.md'],
          reviewerPath: 'commercialization-research/05-evidence-review.md',
          auditPath: 'commercialization-research/06-browser-audit.md',
          absorptionPath: 'commercialization-research/07-report-field-absorption.md',
          completionReviewPath: 'commercialization-research/08-report-completeness-review.md',
        },
        outputReview: {
          briefPath: 'commercialization-research/01-research-brief.md',
          absorptionPath: 'commercialization-research/07-report-field-absorption.md',
          completionReviewPath: 'commercialization-research/08-report-completeness-review.md',
          reportPath: 'C:/expert-session-output/persisted-report.html',
        },
        skills: [],
      }), { status: 200 }),
    })

    expect(context?.outputReview).toEqual({
      briefPath: 'commercialization-research/01-research-brief.md',
      absorptionPath: 'commercialization-research/07-report-field-absorption.md',
      completionReviewPath: 'commercialization-research/08-report-completeness-review.md',
      reportPath: 'C:/expert-session-output/persisted-report.html',
    })
  })

  test('formats only the source batch for the researcher target and keeps other batches out of its prompt', async () => {
    const context = await loadExpertSubagentSkillContext('expert-evidence-researcher', {
      env: expertEnv,
      fetch: async () => new Response(JSON.stringify({
        expertId: 'commercialization-research-report',
        packId: 'commercialization-research-report',
        packVersion: '0.13.42-local',
        artifactPaths: {
          briefPath: 'commercialization-research/01-research-brief.md',
          researcherPaths: [
            'commercialization-research/02-competitors.md',
            'commercialization-research/03-user-needs.md',
            'commercialization-research/04-channels.md',
          ],
          reviewerPath: 'commercialization-research/05-evidence-review.md',
          auditPath: 'commercialization-research/06-browser-audit.md',
        },
        researchSourcePlan: {
          batches: [
            { owner: 'competitors', artifactPath: 'commercialization-research/02-competitors.md', entries: [{ tier: 'core', category: '产品数据', candidateUrl: 'https://a.example.com/', candidateHost: 'a.example.com', owner: 'competitors' }] },
            { owner: 'demand-market', artifactPath: 'commercialization-research/03-user-needs.md', entries: [{ tier: 'core', category: '用户讨论', candidateUrl: 'https://b.example.com/', candidateHost: 'b.example.com', owner: 'demand-market' }] },
            { owner: 'commercialization-channel', artifactPath: 'commercialization-research/04-channels.md', entries: [{ tier: 'open', category: 'SEO', candidateUrl: 'https://c.example.com/', candidateHost: 'c.example.com', owner: 'commercialization-channel' }] },
          ],
        },
        skills: [{
          skillId: 'browser-information-retrieval',
          title: 'Browser information retrieval',
          path: 'skills/browser-information-retrieval/SKILL.md',
          sha256: 'abc123',
          content: 'Use visible Playwright actions, then open concrete public pages.',
        }],
      }), { status: 200 }),
    })

    const prompt = formatExpertAssignedResearchSourceBatch(context, 'commercialization-research/03-user-needs.md')
    expect(prompt).toContain('<expert-research-source-assignment>')
    expect(prompt).toContain('唯一负责产物：commercialization-research/03-user-needs.md')
    expect(prompt).toContain('https://b.example.com/')
    expect(prompt).not.toContain('https://a.example.com/')
    expect(prompt).not.toContain('https://c.example.com/')
    const formattedContext = formatExpertSubagentSkillContext(context, { researcherTargetPath: 'commercialization-research/03-user-needs.md' })
    expect(formattedContext).toContain('https://b.example.com/')
    expect(formattedContext).toContain('每线本次最多 10 个仍未终态 URL')
    expect(formattedContext).toContain('pending 或未浏览不能冒充完成')
    expect(formatExpertAssignedResearchSourceBatch(context, 'commercialization-research/05-evidence-review.md')).toBeUndefined()
  })
})


test('records a non-blocking source-package delivery receipt at the Expert Runtime endpoint', async () => {
  let request: { url: string; init?: RequestInit } | undefined
  await recordExpertSubagentResearchSourceDispatch({
    agentId: 'researcher-a',
    agentType: 'expert-evidence-researcher',
    artifactPath: 'commercialization-research/02-competitors.md',
    batchFingerprint: 'batch-fingerprint',
    coreEntryCount: 40,
    openEntryCount: 5,
  }, {
    env: expertEnv,
    fetch: async (url, init) => {
      request = { url: String(url), init }
      return new Response('{}', { status: 200 })
    },
  })

  expect(request?.url).toBe('http://127.0.0.1:3456/api/sessions/expert-session-123/expert/research-source-dispatch')
  expect(request?.init?.method).toBe('POST')
  expect(request?.init?.body).toContain('batch-fingerprint')
  expect(request?.init?.body).toContain('02-competitors.md')
})


test('retries the commercialization skill context once after a transient server failure', async () => {
  let calls = 0
  const context = await loadExpertSubagentSkillContext('expert-evidence-researcher', {
    env: expertEnv,
    fetch: async () => {
      calls++
      if (calls === 1) return new Response('{}', { status: 503 })
      return packageSkillResponse()
    },
  })

  expect(calls).toBe(2)
  expect(context?.expertId).toBe('commercialization-research-report')
})

test('stops commercialization skill-context recovery after two bounded attempts', async () => {
  let calls = 0
  const context = await loadExpertSubagentSkillContext('expert-evidence-researcher', {
    env: expertEnv,
    fetch: async () => {
      calls++
      throw new Error('temporary transport failure')
    },
  })

  expect(calls).toBe(2)
  expect(context).toBeUndefined()
})


test('targeted evidence task purpose survives the request and excludes an unrelated source package', async () => {
  let requestedUrl = ''
  const payload = await packageSkillResponse().json()
  const context = await loadExpertSubagentSkillContext('expert-evidence-researcher', {
    env: expertEnv,
    fetch: async (url) => {
      requestedUrl = String(url)
      return Response.json({ ...payload, researchTaskKind: 'targeted-evidence', researchSourcePlan: { batches: [{
        owner: 'competitors', artifactPath: 'commercialization-research/02-competitors.md', batchFingerprint: 'pending-batch',
        entries: [{ tier: 'core', category: '数据入口', candidateUrl: 'https://unrelated.example/', candidateHost: 'unrelated.example', owner: 'competitors' }],
      }] } })
    },
  }, { researchTaskKind: 'targeted-evidence' })
  expect(new URL(requestedUrl).searchParams.get('researchTaskKind')).toBe('targeted-evidence')
  expect(context?.researchTaskKind).toBe('targeted-evidence')
  expect(resolveExpertAssignedResearchSourceBatch(context, 'commercialization-research/02-competitors.md')).toBeUndefined()
  const prompt = formatExpertSubagentSkillContext(context, { researcherTargetPath: 'commercialization-research/02-competitors.md' })
  expect(prompt).toContain('<expert-targeted-evidence-task>')
  expect(prompt).not.toContain('<expert-research-source-assignment>')
  expect(prompt).not.toContain('https://unrelated.example/')
})


describe('Expert research identity recovery', () => {
  test('resolves an omitted or general type only against the active pack artifact paths', async () => {
    const deps = { env: expertEnv, fetch: async () => packageSkillResponse() }
    for (const agentType of [undefined, 'general-purpose']) {
      expect(await resolveExpertSubagentTypeForDispatch({ agentType, artifactPath: 'commercialization-research/02-competitors.md' }, deps)).toBe('expert-evidence-researcher')
    }
    expect(await resolveExpertSubagentTypeForDispatch({ agentType: 'expert-evidence-researcher', artifactPath: 'commercialization-research/05-evidence-review.md' }, deps)).toBe('expert-evidence-reviewer')
    expect(await resolveExpertSubagentTypeForDispatch({ artifactPath: 'unrelated.md' }, deps)).toBeUndefined()
    expect(await resolveExpertSubagentTypeForDispatch({ artifactPath: '../commercialization-research/02-competitors.md' }, deps)).toBeUndefined()
  })

  test('does not promote ordinary chat, workflow roles or explicit nonresearch specialists', async () => {
    let calls = 0
    const deps = { env: expertEnv, fetch: async () => { calls++; return packageSkillResponse() } }
    expect(await resolveExpertSubagentTypeForDispatch({ artifactPath: 'commercialization-research/02-competitors.md', workflowRole: 'coder' }, deps)).toBeUndefined()
    expect(await resolveExpertSubagentTypeForDispatch({ agentType: 'Explore', artifactPath: 'commercialization-research/02-competitors.md' }, deps)).toBe('Explore')
    expect(await resolveExpertSubagentTypeForDispatch({ agentType: 'general-purpose' }, deps)).toBe('general-purpose')
    expect(await resolveExpertSubagentTypeForDispatch({ artifactPath: 'commercialization-research/02-competitors.md' }, { ...deps, env: {} })).toBeUndefined()
    expect(calls).toBe(0)
  })

  test('forwards legacy general-purpose browser evidence to the bound server instead of dropping it', async () => {
    const sent: unknown[] = []
    await recordExpertSubagentResearchAudit({
      agentId: 'legacy-b', agentType: 'general-purpose', artifactPath: 'commercialization-research/03-user-needs.md', completed: true,
      entries: [{ target: 'https://www.v2ex.com/t/1171074', kind: 'url', status: 'opened' }],
    }, { env: expertEnv, fetch: async (_url, init) => { sent.push(JSON.parse(String(init?.body))); return new Response('{}') } })
    expect(sent).toEqual([expect.objectContaining({ agentId: 'legacy-b', entries: [expect.objectContaining({ target: 'https://www.v2ex.com/t/1171074' })] })])
  })
})


test('uses the bound artifact policy for dispatch without another context request', async () => {
  let calls = 0
  const context = await packageSkillResponse().json() as { artifactPaths: unknown }
  const result = await resolveExpertSubagentTypeForDispatch({ artifactPath: 'commercialization-research/02-competitors.md' }, {
    env: { ...expertEnv, CC_JIANGXIA_EXPERT_RESEARCH_ARTIFACT_POLICY: JSON.stringify({ mode: 'markdown-path-only', ...context.artifactPaths as object }) },
    fetch: async () => { calls++; return packageSkillResponse() },
  })
  expect(result).toBe('expert-evidence-researcher')
  expect(calls).toBe(0)
})
