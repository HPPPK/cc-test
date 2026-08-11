import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { sessionService } from './sessionService.js'
import { ExpertSessionService } from './expertSessionService.js'
import { ExpertPackRegistryService, resetExpertPackRegistryForTests } from './expertPackRegistryService.js'
import { ZipPackAdapter } from './zipPackAdapter.js'

const adapter = new ZipPackAdapter()
const previousConfigDir = process.env.CLAUDE_CONFIG_DIR
const tempRoots: string[] = []

async function makeTempRoot(prefix: string) {
  const root = await mkdtemp(path.join(tmpdir(), prefix))
  tempRoots.push(root)
  return root
}

async function installExpert(configRoot: string) {
  process.env.CLAUDE_CONFIG_DIR = configRoot
  resetExpertPackRegistryForTests()
  await new ExpertPackRegistryService().importExpertPackZip(await adapter.write({
    'manifest.json': JSON.stringify({ packId: 'session-pack', name: 'Session Pack', version: '1.0.0', schemaVersion: 1, type: 'expert-pack', entrypoints: { experts: ['experts/session/expert.json'], skills: ['session-skill'] } }),
    'experts/session/expert.json': JSON.stringify({
      id: 'session-expert',
      name: 'Session Expert',
      description: 'Session test expert',
      promptPaths: { system: 'experts/session/system.md' },
      outputMode: 'template-fill',
      outputTemplatePath: 'experts/session/templates/report.html',
      skillIds: ['session-skill'],
      subagentSkillIds: {
        'expert-evidence-researcher': ['session-skill'],
      },
    }),
    'experts/session/system.md': 'Session package prompt',
    'experts/session/templates/report.html': '<html data-template-id="session-v1"><body><h1>{{REPORT_TITLE}}</h1><table><thead><tr><th>编号</th><th>链接（URL）</th></tr></thead><tbody><!-- SLOT: SOURCE_ROWS --></tbody></table></body></html>',
    'skills/session-skill/SKILL.md': 'Session package skill',
  }))
}


async function installBrowserAuthorizedExpert(configRoot: string) {
  process.env.CLAUDE_CONFIG_DIR = configRoot
  resetExpertPackRegistryForTests()
  await new ExpertPackRegistryService().importExpertPackZip(await adapter.write({
    'manifest.json': JSON.stringify({ packId: 'browser-pack', name: 'Browser Pack', version: '1.0.0', schemaVersion: 1, type: 'expert-pack', entrypoints: { experts: ['experts/browser/expert.json'], skills: ['session-skill'] } }),
    'experts/browser/expert.json': JSON.stringify({
      id: 'browser-expert',
      name: 'Browser Expert',
      description: 'Expert with an explicitly authorized local browser option',
      promptPaths: { system: 'experts/browser/system.md' },
      outputProtocolPath: 'experts/browser/outputs/material-protocol.json',
      skillIds: ['session-skill'],
    }),
    'experts/browser/system.md': 'Browser package prompt',
    'experts/browser/outputs/material-protocol.json': JSON.stringify({
      researchBrowser: {
        sharePlaywrightSessionAcrossAgents: true,
        allowUserAuthorizedCdp: true,
        forceVisiblePlaywright: true,
        managedPresentationDefault: 'assistable_background',
        allowManagedPresentationChoice: true,
      },
    }),
    'skills/session-skill/SKILL.md': 'Session package skill',
  }))
}

async function installDeliveryConfirmedExpert(configRoot: string) {
  process.env.CLAUDE_CONFIG_DIR = configRoot
  resetExpertPackRegistryForTests()
  await new ExpertPackRegistryService().importExpertPackZip(await adapter.write({
    'manifest.json': JSON.stringify({ packId: 'delivery-pack', name: 'Delivery Pack', version: '1.0.0', schemaVersion: 1, type: 'expert-pack', entrypoints: { experts: ['experts/delivery/expert.json'], skills: ['session-skill'] } }),
    'experts/delivery/expert.json': JSON.stringify({
      id: 'delivery-expert',
      name: 'Delivery Expert',
      description: 'Template Expert requiring an explicit delivery decision',
      promptPaths: { system: 'experts/delivery/system.md' },
      outputProtocolPath: 'experts/delivery/outputs/material-protocol.json',
      outputMode: 'template-fill',
      outputTemplatePath: 'experts/delivery/templates/report.html',
      skillIds: ['session-skill'],
    }),
    'experts/delivery/system.md': 'Delivery package prompt',
    'experts/delivery/outputs/material-protocol.json': JSON.stringify({
      researchDelivery: {
        requireExplicitUserDecisionBeforeFinalOutput: true,
        questionId: 'research-delivery:delivery-report',
        acceptedChoiceId: 'accept_current_scope',
        continueChoiceIds: ['provide_material_and_continue'],
        pauseChoiceIds: ['pause_research'],
      },
    }),
    'experts/delivery/templates/report.html': '<html data-template-id="delivery-v1"><body><h1>{{REPORT_TITLE}}</h1><table><thead><tr><th>编号</th><th>链接（URL）</th></tr></thead><tbody><!-- SLOT: SOURCE_ROWS --></tbody></table></body></html>',
    'skills/session-skill/SKILL.md': 'Session package skill',
  }))
}

function deliveryTemplatePayload() {
  return {
    format: 'cc-jiangxia-expert-template-fill/v1',
    templateId: 'delivery-v1',
    fields: {
      REPORT_TITLE: 'Delivery report',
      SOURCE_ROWS: [['[1]', 'https://example.com']],
    },
  }
}

describe('ExpertSessionService', () => {
  afterEach(async () => {
    process.env.CLAUDE_CONFIG_DIR = previousConfigDir
    resetExpertPackRegistryForTests()
    await Promise.all(tempRoots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  it('enters and exits package-driven Expert Mode without workflow state', async () => {
    const configRoot = await makeTempRoot('expert-session-config-')
    const projectRoot = await makeTempRoot('expert-session-project-')
    await installExpert(configRoot)
    const service = new ExpertSessionService()
    const { sessionId } = await sessionService.createSession(projectRoot)

    const entered = await service.enterExpertMode(sessionId, 'session-expert')
    const expertSession = await sessionService.getSession(sessionId)

    expect(entered.mode).toBe('expert')
    expect(entered.expertId).toBe('session-expert')
    expect(entered.runtimeBinding).toMatchObject({ schemaVersion: 1, expertId: 'session-expert', active: true })
    expect(entered.runtimeBinding?.promptSnapshot).toContain('Session package prompt')
    expect(expertSession?.expert).toMatchObject({
      mode: 'expert',
      expertId: 'session-expert',
      status: 'active',
    })
    expect(expertSession?.expert?.runtimeBinding?.active).toBe(true)
    expect(expertSession?.expert).not.toHaveProperty('researchLedger')
    expect(expertSession?.workflow).toBeUndefined()

    const rendered = await service.renderTemplateFill(sessionId, {
      format: 'cc-jiangxia-expert-template-fill/v1',
      templateId: 'session-v1',
      fields: {
        REPORT_TITLE: 'Session report',
        SOURCE_ROWS: [['[1]', 'https://example.com']],
      },
    })
    expect(rendered.templateId).toBe('session-v1')
    expect(rendered.content).toContain('<h1>Session report</h1>')
    expect(rendered.content).toContain('href="https://example.com/"')

    const written = await service.writeMaterialPackage(sessionId, { title: 'Session result' })
    const afterWrite = await sessionService.getSession(sessionId)
    const expectedRoot = path.resolve(await realpath(projectRoot), '.workflow', 'intake', 'expert-runs')

    expect(written.materialRef.summaryPath.startsWith(expectedRoot + path.sep)).toBe(true)
    expect(afterWrite?.expert?.materialRefs[0]?.runId).toBe(written.materialRef.runId)
    expect(JSON.parse(await readFile(written.materialRef.materialJsonPath, 'utf8')).runtime).toBe('expert-pack-runtime')
    expect(await readFile(written.materialRef.evidencePath, 'utf8')).toContain('Session package prompt')

    const exited = await service.exitExpertMode(sessionId)
    expect(exited.status).toBe('exited')
    expect(exited.runtimeBinding).toBeUndefined()
    expect(exited.materialRefs[0]?.runId).toBe(written.materialRef.runId)
  })


  it('blocks template rendering only for a ZIP session that declares incomplete research requirements', async () => {
    const configRoot = await makeTempRoot('expert-completion-config-')
    const projectRoot = await makeTempRoot('expert-completion-project-')
    await installExpert(configRoot)
    const service = new ExpertSessionService()
    const { sessionId } = await sessionService.createSession(projectRoot)
    await service.enterExpertMode(sessionId, 'session-expert')
    const stored = await sessionService.getSession(sessionId)
    const expert = stored?.expert
    if (!expert?.runtimeBinding) throw new Error('expected active Expert binding')
    expert.runtimeBinding.researchCompletionPolicy = {
      finalOutputBehavior: 'block',
      trackedAgentTypes: ['expert-evidence-researcher', 'expert-evidence-reviewer'],
      minimumCompletedAgents: 2,
      requiredSearchEngines: ['Google', '百度', 'Bing', '360'],
      minimumDistinctSearchQueries: 2,
      minimumOpenedSpecificPublicPages: 2,
      requireConcreteSourcePerAgent: true,
    }
    await sessionService.appendSessionMetadata(sessionId, { workDir: projectRoot, expert })

    await expect(service.renderTemplateFill(sessionId, {
      format: 'cc-jiangxia-expert-template-fill/v1', templateId: 'session-v1',
      fields: { REPORT_TITLE: 'Blocked report', SOURCE_ROWS: [['[1]', 'https://example.com']] },
    })).rejects.toMatchObject({ code: 'EXPERT_RESEARCH_COMPLETION_REQUIRED' })

    await service.recordResearchAudit(sessionId, {
      agentId: 'research-a', agentType: 'expert-evidence-researcher',
      entries: [
        { target: 'q1', kind: 'search', searchEngine: 'Google', query: 'reader pricing', status: 'access_limited' },
        { target: 'q2', kind: 'search', searchEngine: '百度', query: 'reader 竞品', status: 'opened' },
        { target: 'https://example.com/a', kind: 'url', status: 'opened' },
      ],
    })
    await service.recordResearchAudit(sessionId, {
      agentId: 'review-b', agentType: 'expert-evidence-reviewer',
      entries: [
        { target: 'q3', kind: 'search', searchEngine: 'Bing', query: 'reader pricing', status: 'opened' },
        { target: 'q4', kind: 'search', searchEngine: '360', query: 'reader 竞品', status: 'failed' },
        { target: 'https://example.com/b', kind: 'url', status: 'opened' },
      ],
    })

    await expect(service.renderTemplateFill(sessionId, {
      format: 'cc-jiangxia-expert-template-fill/v1', templateId: 'session-v1',
      fields: { REPORT_TITLE: 'Verified report', SOURCE_ROWS: [['[1]', 'https://example.com']] },
    })).resolves.toMatchObject({ templateId: 'session-v1' })
  })


  it('renders an evidence-limited report when an opted-in ZIP chooses classification instead of a hard block', async () => {
    const configRoot = await makeTempRoot('expert-evidence-limited-config-')
    const projectRoot = await makeTempRoot('expert-evidence-limited-project-')
    await installExpert(configRoot)
    const service = new ExpertSessionService()
    const { sessionId } = await sessionService.createSession(projectRoot)
    await service.enterExpertMode(sessionId, 'session-expert')
    const stored = await sessionService.getSession(sessionId)
    const expert = stored?.expert
    if (!expert?.runtimeBinding) throw new Error('expected active Expert binding')
    expert.runtimeBinding.researchCompletionPolicy = {
      finalOutputBehavior: 'allow-with-evidence-gaps',
      trackedAgentTypes: ['expert-evidence-researcher'],
      minimumCompletedAgents: 1,
      requiredSearchEngines: ['Google'],
      minimumDistinctSearchQueries: 1,
      minimumOpenedSpecificPublicPages: 1,
      requireConcreteSourcePerAgent: true,
    }
    await sessionService.appendSessionMetadata(sessionId, { workDir: projectRoot, expert })

    await expect(service.renderTemplateFill(sessionId, {
      format: 'cc-jiangxia-expert-template-fill/v1', templateId: 'session-v1',
      fields: { REPORT_TITLE: 'Evidence limited report', SOURCE_ROWS: [['[1]', 'https://example.com']] },
    })).resolves.toMatchObject({ templateId: 'session-v1' })
  })

  it('requires ZIP-declared source-table coverage before rendering an evidence-limited report', async () => {
    const configRoot = await makeTempRoot('expert-source-coverage-config-')
    const projectRoot = await makeTempRoot('expert-source-coverage-project-')
    await installExpert(configRoot)
    const service = new ExpertSessionService()
    const { sessionId } = await sessionService.createSession(projectRoot)
    await service.enterExpertMode(sessionId, 'session-expert')
    const stored = await sessionService.getSession(sessionId)
    const expert = stored?.expert
    if (!expert?.runtimeBinding) throw new Error('expected active Expert binding')
    expert.runtimeBinding.researchCompletionPolicy = {
      finalOutputBehavior: 'allow-with-evidence-gaps',
      trackedAgentTypes: ['expert-evidence-researcher'],
      minimumCompletedAgents: 1,
      requiredSearchEngines: ['Bing'],
      minimumDistinctSearchQueries: 1,
      minimumOpenedSpecificPublicPages: 1,
      requireConcreteSourcePerAgent: true,
      finalSourceCoverage: { fieldId: 'SOURCE_ROWS', minimumRows: 3 },
    } as never
    await sessionService.appendSessionMetadata(sessionId, { workDir: projectRoot, expert })

    await expect(service.renderTemplateFill(sessionId, {
      format: 'cc-jiangxia-expert-template-fill/v1', templateId: 'session-v1',
      fields: { REPORT_TITLE: 'Sparse report', SOURCE_ROWS: [['[1]', 'https://example.com']] },
    })).rejects.toMatchObject({ code: 'EXPERT_FINAL_SOURCE_COVERAGE_REQUIRED' })

    await expect(service.renderTemplateFill(sessionId, {
      format: 'cc-jiangxia-expert-template-fill/v1', templateId: 'session-v1',
      fields: {
        REPORT_TITLE: 'Sourced report',
        SOURCE_ROWS: [
          ['[1]', 'https://example.com/one'],
          ['[2]', 'https://example.com/two'],
          ['[3]', 'https://example.com/three'],
        ],
      },
    })).resolves.toMatchObject({ templateId: 'session-v1' })
  })

  it('returns only the active ZIP Skills declared for a delegated Expert agent type', async () => {
    const configRoot = await makeTempRoot('expert-subagent-skills-config-')
    const projectRoot = await makeTempRoot('expert-subagent-skills-project-')
    await installExpert(configRoot)
    const service = new ExpertSessionService()
    const { sessionId } = await sessionService.createSession(projectRoot)

    await service.enterExpertMode(sessionId, 'session-expert')

    await expect(service.getSubagentSkillContext(sessionId, 'expert-evidence-researcher')).resolves.toMatchObject({
      expertId: 'session-expert',
      skills: [expect.objectContaining({ skillId: 'session-skill', content: 'Session package skill' })],
    })
    await expect(service.getSubagentSkillContext(sessionId, 'expert-evidence-reviewer')).resolves.toMatchObject({
      skills: [],
    })
  })

  it('persists an explicitly authorized local browser only for an opted-in Expert session and clears it on exit', async () => {
    const configRoot = await makeTempRoot('expert-browser-config-')
    const projectRoot = await makeTempRoot('expert-browser-project-')
    await installBrowserAuthorizedExpert(configRoot)
    const service = new ExpertSessionService()
    const { sessionId } = await sessionService.createSession(projectRoot)

    const entered = await service.enterExpertMode(sessionId, 'browser-expert', {
      kind: 'cdp',
      browser: 'edge',
      endpoint: 'http://127.0.0.1:9222/',
      userAuthorized: true,
    })
    expect(entered.runtimeBinding?.researchBrowserPolicy).toMatchObject({
      allowUserAuthorizedCdp: true,
      forceVisiblePlaywright: true,
    })
    expect(entered.researchBrowserConnection).toMatchObject({
      kind: 'cdp',
      browser: 'edge',
      endpoint: 'http://127.0.0.1:9222',
    })

    const exited = await service.exitExpertMode(sessionId)
    expect(exited.researchBrowserConnection).toBeUndefined()
  })


  it('persists a managed browser presentation only in the active opted-in Expert session and removes it on exit', async () => {
    const configRoot = await makeTempRoot('expert-browser-presentation-config-')
    const projectRoot = await makeTempRoot('expert-browser-presentation-project-')
    await installBrowserAuthorizedExpert(configRoot)
    const service = new ExpertSessionService()
    const { sessionId } = await sessionService.createSession(projectRoot)

    const entered = await service.enterExpertMode(sessionId, 'browser-expert', undefined, 'always_visible')

    expect(entered.researchBrowserConnection).toBeUndefined()
    expect(entered.researchBrowserPresentation).toBe('always_visible')
    expect(entered.runtimeBinding?.researchBrowserPolicy).toMatchObject({
      managedPresentationDefault: 'assistable_background',
      allowManagedPresentationChoice: true,
    })

    const exited = await service.exitExpertMode(sessionId)
    expect(exited.researchBrowserPresentation).toBeUndefined()
  })
  it('rejects an external browser debugger even for an opted-in Expert', async () => {
    const configRoot = await makeTempRoot('expert-browser-reject-config-')
    const projectRoot = await makeTempRoot('expert-browser-reject-project-')
    await installBrowserAuthorizedExpert(configRoot)
    const service = new ExpertSessionService()
    const { sessionId } = await sessionService.createSession(projectRoot)

    await expect(service.enterExpertMode(sessionId, 'browser-expert', {
      kind: 'cdp',
      browser: 'chrome',
      endpoint: 'http://example.com:9222',
      userAuthorized: true,
    })).rejects.toThrow('只允许连接本机')
  })

  it('requires a pack-declared user delivery decision before rendering final HTML', async () => {
    const configRoot = await makeTempRoot('expert-delivery-config-')
    const projectRoot = await makeTempRoot('expert-delivery-project-')
    await installDeliveryConfirmedExpert(configRoot)
    const service = new ExpertSessionService()
    const { sessionId } = await sessionService.createSession(projectRoot)
    await service.enterExpertMode(sessionId, 'delivery-expert')

    await expect(service.renderTemplateFill(sessionId, deliveryTemplatePayload())).rejects.toThrow(
      '尚未获得用户对剩余证据缺口和交付范围的确认',
    )

    const continueResearch = await service.recordResearchDeliveryDecision(sessionId, {
      questionId: 'research-delivery:delivery-report',
      choiceIds: ['provide_material_and_continue'],
      unresolvedEvidence: ['需要用户提供一个受限价格页截图'],
    })
    expect(continueResearch.researchDelivery.status).toBe('continue-research')
    await expect(service.renderTemplateFill(sessionId, deliveryTemplatePayload())).rejects.toThrow(
      '尚未获得用户对剩余证据缺口和交付范围的确认',
    )

    const accepted = await service.recordResearchDeliveryDecision(sessionId, {
      questionId: 'research-delivery:delivery-report',
      choiceIds: ['accept_current_scope'],
      unresolvedEvidence: ['需要用户提供一个受限价格页截图'],
    })
    expect(accepted.researchDelivery).toMatchObject({
      status: 'accepted-current-scope',
      selectedChoiceId: 'accept_current_scope',
    })

    const rendered = await service.renderTemplateFill(sessionId, deliveryTemplatePayload())
    expect(rendered.templateId).toBe('delivery-v1')
    expect(rendered.content).toContain('Delivery report')
  })

  it('records accept_current_scope even when browser audits are incomplete so user choice is authoritative', async () => {
    const configRoot = await makeTempRoot('expert-delivery-gate-config-')
    const projectRoot = await makeTempRoot('expert-delivery-gate-project-')
    await installDeliveryConfirmedExpert(configRoot)
    const service = new ExpertSessionService()
    const { sessionId } = await sessionService.createSession(projectRoot)
    await service.enterExpertMode(sessionId, 'delivery-expert')
    const stored = await sessionService.getSession(sessionId)
    const expert = stored?.expert
    if (!expert?.runtimeBinding) throw new Error('expected active Expert binding')
    expert.runtimeBinding.researchCompletionPolicy = {
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
    await sessionService.appendSessionMetadata(sessionId, { workDir: projectRoot, expert })

    await service.recordResearchAudit(sessionId, {
      agentId: 'research-competitors',
      agentType: 'expert-evidence-researcher',
      entries: [
        { kind: 'search', searchEngine: 'Bing', query: 'markdown reader competitors', target: 'https://www.bing.com/search?q=reader', status: 'opened' },
        { kind: 'url', target: 'https://typora.io/', status: 'opened' },
      ],
    })

    // Missing Google / remaining subagents must not veto an explicit accept.
    await expect(service.recordResearchDeliveryDecision(sessionId, {
      questionId: 'research-delivery:delivery-report',
      choiceIds: ['accept_current_scope'],
      unresolvedEvidence: ['Google search not recorded (VPN/CAPTCHA)', 'Independent review pending'],
    })).resolves.toMatchObject({
      researchDelivery: {
        status: 'accepted-current-scope',
        unresolvedEvidence: expect.arrayContaining([
          'Google search not recorded (VPN/CAPTCHA)',
        ]),
      },
    })
  })

  it('keeps template filling available when transcript Expert metadata cannot be read back', async () => {
    const configRoot = await makeTempRoot('expert-session-readback-config-')
    const projectRoot = await makeTempRoot('expert-session-readback-project-')
    await installExpert(configRoot)
    const service = new ExpertSessionService()
    const { sessionId } = await sessionService.createSession(projectRoot)
    const originalGetSession = sessionService.getSession.bind(sessionService)
    let reads = 0
    sessionService.getSession = async (targetSessionId: string) => {
      reads += 1
      const session = await originalGetSession(targetSessionId)
      return reads >= 2 && session ? { ...session, expert: undefined } : session
    }

    try {
      const entered = await service.enterExpertMode(sessionId, 'session-expert')
      expect(entered.runtimeBinding?.active).toBe(true)

      const rendered = await service.renderTemplateFill(sessionId, {
        format: 'cc-jiangxia-expert-template-fill/v1',
        templateId: 'session-v1',
        fields: {
          REPORT_TITLE: 'Recovered session report',
          SOURCE_ROWS: [['[1]', 'https://example.com']],
        },
      })
      expect(rendered.content).toContain('Recovered session report')
    } finally {
      sessionService.getSession = originalGetSession
    }
  })


})
