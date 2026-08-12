import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { handleSessionsApi } from './sessions.js'
import { sessionService } from '../services/sessionService.js'
import { ExpertSessionService } from '../services/expertSessionService.js'
import { ExpertPackRegistryService, resetExpertPackRegistryForTests } from '../services/expertPackRegistryService.js'
import { ZipPackAdapter } from '../services/zipPackAdapter.js'

const adapter = new ZipPackAdapter()
const previousConfigDir = process.env.CLAUDE_CONFIG_DIR
const tempRoots: string[] = []

async function makeTempRoot(prefix: string) {
  const root = await mkdtemp(path.join(tmpdir(), prefix))
  tempRoots.push(root)
  return root
}

async function installContextExpert(configRoot: string) {
  process.env.CLAUDE_CONFIG_DIR = configRoot
  resetExpertPackRegistryForTests()
  await new ExpertPackRegistryService().importExpertPackZip(await adapter.write({
    'manifest.json': JSON.stringify({
      packId: 'sessions-api-context-pack',
      name: 'Sessions API Context Pack',
      version: '1.0.0',
      schemaVersion: 1,
      type: 'expert-pack',
      entrypoints: {
        experts: ['experts/context/expert.json'],
        skills: ['research-skill'],
      },
    }),
    'experts/context/expert.json': JSON.stringify({
      id: 'sessions-api-context-expert',
      name: 'Sessions API Context Expert',
      description: 'Regression coverage for Expert session context routes.',
      promptPaths: { system: 'experts/context/system.md' },
      outputProtocolPath: 'experts/context/outputs/material-protocol.json',
      skillIds: ['research-skill'],
      subagentSkillIds: {
        'expert-evidence-researcher': ['research-skill'],
      },
    }),
    'experts/context/system.md': 'Context route regression prompt',
    'experts/context/outputs/material-protocol.json': JSON.stringify({
      researchEvidenceReview: {
        reviewerAgentType: 'expert-evidence-reviewer',
        sourceAgentTypes: ['expert-evidence-researcher'],
        maxRecords: 4,
        maxCharactersPerRecord: 2000,
        reviewerEvidenceOnly: true,
      },
    }),
    'skills/research-skill/SKILL.md': 'Use only public evidence.',
  }))
}

describe('sessions Expert context routes', () => {
  afterEach(async () => {
    process.env.CLAUDE_CONFIG_DIR = previousConfigDir
    resetExpertPackRegistryForTests()
    await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
  })

  it('forwards the request URL to both subagent context routes so agentType query parameters are available', async () => {
    const configRoot = await makeTempRoot('sessions-api-context-config-')
    const projectRoot = await makeTempRoot('sessions-api-context-project-')
    await installContextExpert(configRoot)
    const { sessionId } = await sessionService.createSession(projectRoot)
    await new ExpertSessionService().enterExpertMode(sessionId, 'sessions-api-context-expert')

    const skillUrl = new URL(`http://localhost/api/sessions/${sessionId}/expert/subagent-skill-context?agentType=expert-evidence-researcher`)
    const skillResponse = await handleSessionsApi(
      new Request(skillUrl),
      skillUrl,
      ['api', 'sessions', sessionId, 'expert', 'subagent-skill-context'],
    )
    expect(skillResponse.status).toBe(200)
    expect(await skillResponse.json()).toMatchObject({
      expertId: 'sessions-api-context-expert',
      skills: [expect.objectContaining({ skillId: 'research-skill' })],
    })

    const evidenceUrl = new URL(`http://localhost/api/sessions/${sessionId}/expert/subagent-research-evidence-context?agentType=expert-evidence-reviewer`)
    const evidenceResponse = await handleSessionsApi(
      new Request(evidenceUrl),
      evidenceUrl,
      ['api', 'sessions', sessionId, 'expert', 'subagent-research-evidence-context'],
    )
    expect(evidenceResponse.status).toBe(200)
    expect(await evidenceResponse.json()).toMatchObject({
      expertId: 'sessions-api-context-expert',
      reviewerEvidenceOnly: true,
      records: [],
    })
  })
})
