import { describe, expect, test } from 'bun:test'
import {
  formatExpertSubagentSkillContext,
  loadExpertSubagentSkillContext,
  recordExpertSubagentResearchAudit,
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
      skills: [expect.objectContaining({ skillId: 'browser-information-retrieval' })],
    })
    expect(prompt).toContain('<expert-subagent-package-skills>')
    expect(prompt).toContain('browser-information-retrieval')
    expect(prompt).not.toContain('user chat history')
  })

  test('reports transcript audit only to the active Expert Runtime endpoint', async () => {
    let request: { url: string; init?: RequestInit } | undefined
    await recordExpertSubagentResearchAudit({
      agentId: 'agent-1', agentType: 'expert-evidence-researcher', entries: [{ target: 'https://example.com', status: 'opened' }],
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
  })

  test('does not throw when research-audit persistence fails, so subagent completion stays intact', async () => {
    const errors: unknown[] = []
    const originalError = console.error
    console.error = (...args: unknown[]) => { errors.push(args.join(' ')) }
    try {
      await recordExpertSubagentResearchAudit({
        agentId: 'reviewer-1',
        agentType: 'expert-evidence-reviewer',
        entries: [{ target: 'https://example.com', status: 'opened' }],
      }, {
        env: expertEnv,
        fetch: async () => new Response('研究浏览审计无效', { status: 400 }),
      })
      await recordExpertSubagentResearchAudit({
        agentId: 'reviewer-2',
        agentType: 'expert-evidence-reviewer',
        entries: [{ target: 'https://example.com', status: 'opened' }],
      }, {
        env: expertEnv,
        fetch: async () => { throw new Error('socket hung up') },
      })
    } finally {
      console.error = originalError
    }
    expect(errors.some((line) => String(line).includes('HTTP 400'))).toBe(true)
    expect(errors.some((line) => String(line).includes('socket hung up'))).toBe(true)
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
})
