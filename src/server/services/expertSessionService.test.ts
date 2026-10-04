import { spyOn, afterEach, describe, expect, it } from 'bun:test'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { sessionService } from './sessionService.js'
import { ExpertSessionService, formatCommercializationReportDate, stampCommercializationReportDate } from './expertSessionService.js'
import { commercializationReportSourceBoundary } from './expertCommercializationReportScopeService.js'
import { ExpertPackRegistryService, resetExpertPackRegistryForTests } from './expertPackRegistryService.js'
import { ZipPackAdapter } from './zipPackAdapter.js'
import { expertResearchAutoContinueService } from './expertResearchAutoContinueService.js'

const adapter = new ZipPackAdapter()
const previousConfigDir = process.env.CLAUDE_CONFIG_DIR
async function renderAndCommit(service: ExpertSessionService, sessionId: string, payload: unknown, options: { outputPath?: string } = {}) {
  const session = await sessionService.getSession(sessionId)
  const outputPath = options.outputPath ?? session?.expert?.templateFillDraft?.completionReview?.reportPath ?? path.join(session!.workDir!, 'test-report.html')
  const rendered = await service.renderTemplateFill(sessionId, payload, { outputPath })
  await writeFile(outputPath, rendered.content, 'utf8')
  if (rendered.writeReceipt) await service.commitTemplateFillWrite(sessionId, { receipt: rendered.writeReceipt })
  return rendered
}

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


async function installDynamicCommercializationExpert(configRoot: string) {
  process.env.CLAUDE_CONFIG_DIR = configRoot
  resetExpertPackRegistryForTests()
  await new ExpertPackRegistryService().importExpertPackZip(await adapter.write({
    'manifest.json': JSON.stringify({
      packId: 'commercialization-research-report',
      name: 'Commercialization Dynamic Question Pack',
      version: '1.0.0',
      schemaVersion: 1,
      type: 'expert-pack',
      entrypoints: { experts: ['experts/commercialization/expert.json'], skills: ['session-skill'] },
    }),
    'experts/commercialization/expert.json': JSON.stringify({
      id: 'commercialization-research-report',
      name: 'Commercialization Research',
      description: 'Model-driven commercialization clarification test expert',
      promptPaths: { system: 'experts/commercialization/system.md' },
      skillIds: ['session-skill'],
    }),
    'experts/commercialization/system.md': 'The user first product description directly enters the model. Ask product-specific questions only when a decision-critical ambiguity remains.',
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
      researchEvidenceReview: {
        reviewerAgentType: 'expert-evidence-reviewer',
        sourceAgentTypes: ['expert-evidence-researcher'],
        maxRecords: 4,
        maxCharactersPerRecord: 2000,
        reviewerEvidenceOnly: true,
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

describe('commercialization report date stamping', () => {
  it('uses the server Asia/Shanghai date and never trusts a model-supplied future date', () => {
    const serverNow = new Date('2026-08-15T16:30:00.000Z')
    const modelFields = { REPORT_DATE: '2026-08-17', REPORT_TITLE: 'Commercial report' }

    expect(formatCommercializationReportDate(serverNow)).toBe('2026-08-16')
    expect(stampCommercializationReportDate('commercialization-research-report', modelFields, serverNow)).toEqual({
      REPORT_DATE: '2026-08-16',
      REPORT_TITLE: 'Commercial report',
    })
    expect(stampCommercializationReportDate('session-expert', modelFields, serverNow)).toBe(modelFields)
  })

  it('applies the server date during actual commercial template rendering', async () => {
    const configRoot = await makeTempRoot('commercial-report-date-config-')
    const projectRoot = await makeTempRoot('commercial-report-date-project-')
    await installExpert(configRoot)
    const service = new ExpertSessionService()
    const { sessionId } = await sessionService.createSession(projectRoot)
    await service.enterExpertMode(sessionId, 'session-expert')

    const stored = await sessionService.getSession(sessionId)
    const expert = stored?.expert
    if (!expert?.runtimeBinding) throw new Error('expected active expert runtime')
    expert.runtimeBinding = {
      ...expert.runtimeBinding,
      expertId: 'commercialization-research-report',
      outputTemplate: {
        path: 'experts/commercialization-research-report/templates/date.html',
        content: '<html data-template-id="commercialization-date-v1"><body><p>{{REPORT_DATE}}</p></body></html>',
      },
    }
    await sessionService.appendSessionMetadata(sessionId, { workDir: projectRoot, expert })

    const previousOverride = process.env.CLAUDE_CODE_OVERRIDE_DATE
    process.env.CLAUDE_CODE_OVERRIDE_DATE = '2026-08-16'
    try {
      const rendered = await service.renderTemplateFill(sessionId, {
        templateId: 'commercialization-date-v1',
        fields: { REPORT_DATE: '2099-01-01' },
      })
      expect(rendered.content).toContain('2026-08-16')
      expect(rendered.content).not.toContain('2099-01-01')
    } finally {
      if (previousOverride === undefined) delete process.env.CLAUDE_CODE_OVERRIDE_DATE
      else process.env.CLAUDE_CODE_OVERRIDE_DATE = previousOverride
    }
  })

  it('adds the non-blocking source boundary during actual commercial template rendering', async () => {
    const configRoot = await makeTempRoot('commercial-report-scope-config-')
    const projectRoot = await makeTempRoot('commercial-report-scope-project-')
    await installExpert(configRoot)
    const service = new ExpertSessionService()
    const { sessionId } = await sessionService.createSession(projectRoot)
    await service.enterExpertMode(sessionId, 'session-expert')

    const stored = await sessionService.getSession(sessionId)
    const expert = stored?.expert
    if (!expert?.runtimeBinding) throw new Error('expected active expert runtime')
    expert.runtimeBinding = {
      ...expert.runtimeBinding,
      expertId: 'commercialization-research-report',
      outputTemplate: {
        path: 'experts/commercialization-research-report/templates/scope.html',
        content: '<html data-template-id="commercialization-scope-v1"><body><p>{{REPORT_DATE}}</p><div><!-- SLOT: DATA_DECLARATION --></div></body></html>',
      },
    }
    await sessionService.appendSessionMetadata(sessionId, { workDir: projectRoot, expert })

    const rendered = await service.renderTemplateFill(sessionId, {
      templateId: 'commercialization-scope-v1',
      fields: {
        DATA_DECLARATION: ['**已核验事实**：具体页面已列入来源表。'],
      },
    })

    expect(rendered.content).toContain('已核验事实')
    expect(rendered.content).toContain(commercializationReportSourceBoundary)
    expect(rendered.content.match(/本轮实际采用的网页证据/g)).toHaveLength(1)
  })
})

describe('ExpertSessionService', () => {
  afterEach(async () => {
    process.env.CLAUDE_CONFIG_DIR = previousConfigDir
    resetExpertPackRegistryForTests()
    await Promise.all(tempRoots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  it('starts commercialization research without a static intake and only stores arbitrary dynamic answers', async () => {
    const configRoot = await makeTempRoot('commercialization-dynamic-config-')
    const projectRoot = await makeTempRoot('commercialization-dynamic-project-')
    await installDynamicCommercializationExpert(configRoot)
    const { sessionId } = await sessionService.createSession(projectRoot)
    const service = new ExpertSessionService()

    const entered = await service.enterExpertMode(sessionId, 'commercialization-research-report')
    expect(entered.status).toBe('active')
    expect(entered.runtimeBinding?.promptSnapshot).toContain('first product description directly enters the model')

    const submitted = await service.submitIntakeStep(sessionId, {
      stepId: 'photo-repair-priority',
      answer: 'Prioritize family photo restoration',
      choiceId: 'family',
    })
    expect(submitted.intakeState.answers).toMatchObject({
      'photo-repair-priority': 'Prioritize family photo restoration',
    })
    expect(submitted).not.toHaveProperty('nextQuestion')
    expect(submitted).not.toHaveProperty('researchInstruction')
  })

  it('removes legacy fixed-domain channel routes when a commercialization session resumes a delegated agent', async () => {
    const configRoot = await makeTempRoot('commercialization-route-upgrade-config-')
    const projectRoot = await makeTempRoot('commercialization-route-upgrade-project-')
    await installDynamicCommercializationExpert(configRoot)
    const { sessionId } = await sessionService.createSession(projectRoot)
    const service = new ExpertSessionService()
    await service.enterExpertMode(sessionId, 'commercialization-research-report')

    const session = await sessionService.getSession(sessionId)
    const expert = session?.expert
    if (!expert?.runtimeBinding) throw new Error('expected active Expert binding')
    expert.runtimeBinding.researchArtifactPolicy = {
      mode: 'markdown-path-only',
      directory: 'commercialization-research',
      briefPath: 'commercialization-research/01-research-brief.md',
      researcherPaths: ['commercialization-research/04-channels.md'],
      reviewerPath: 'commercialization-research/05-evidence-review.md',
      auditPath: 'commercialization-research/06-browser-audit.md',
      maxCharacters: 10000,
      routeCompletion: {
        mode: 'dynamic-route-status-v1',
        sourceLanes: {
          'cn-channel': { hostSuffixes: ['sspai.com'] },
          'global-channel': { hostSuffixes: ['reddit.com'] },
        },
      },
    }
    await sessionService.appendSessionMetadata(sessionId, { workDir: projectRoot, expert })

    await service.getSubagentSkillContext(sessionId, 'general-purpose')
    const upgraded = (await sessionService.getSession(sessionId))?.expert?.runtimeBinding
    expect(upgraded?.researchArtifactPolicy?.routeCompletion).toBeUndefined()
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


  it('renders a commercial evidence-gap report after a Google connection failure even before other engine audits exist', async () => {
    const configRoot = await makeTempRoot('expert-google-failure-gap-config-')
    const projectRoot = await makeTempRoot('expert-google-failure-gap-project-')
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
      requiredSearchEngines: ['Google', '百度', 'Bing', '360'],
      minimumDistinctSearchQueries: 2,
      minimumOpenedSpecificPublicPages: 6,
      requireConcreteSourcePerAgent: true,
    }
    await sessionService.appendSessionMetadata(sessionId, { workDir: projectRoot, expert })
    await service.recordResearchAudit(sessionId, {
      agentId: 'researcher',
      agentType: 'expert-evidence-researcher',
      entries: [{
        target: 'https://www.google.com/',
        kind: 'search',
        searchEngine: 'Google',
        query: 'markdown reader competitors',
        status: 'failed',
        finalUrl: 'chrome-error://chromewebdata/',
        detail: 'page.goto: net::ERR_CONNECTION_CLOSED',
      }],
    })

    await expect(service.renderTemplateFill(sessionId, {
      format: 'cc-jiangxia-expert-template-fill/v1', templateId: 'session-v1',
      fields: { REPORT_TITLE: 'Google failure evidence-gap report', SOURCE_ROWS: [['[1]', 'https://example.com']] },
    })).resolves.toMatchObject({ templateId: 'session-v1' })
  })

  it('requires declared search-engine coverage even when this ZIP otherwise permits evidence-gap rendering', async () => {
    const configRoot = await makeTempRoot('expert-search-coverage-config-')
    const projectRoot = await makeTempRoot('expert-search-coverage-project-')
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
      requiredSearchEngines: ['Google', '百度'],
      minimumDistinctSearchQueries: 1,
      minimumOpenedSpecificPublicPages: 1,
      requireConcreteSourcePerAgent: true,
      requireSearchCoverageBeforeFinalOutput: true,
    }
    await sessionService.appendSessionMetadata(sessionId, { workDir: projectRoot, expert })
    await service.recordResearchAudit(sessionId, {
      agentId: 'researcher', agentType: 'expert-evidence-researcher',
      entries: [
        { target: 'https://www.google.com/search?q=reader', kind: 'search', searchEngine: 'Google', query: 'reader', status: 'access_limited' },
        { target: 'https://example.com/reader', kind: 'url', status: 'opened' },
      ],
    })

    await expect(service.renderTemplateFill(sessionId, {
      format: 'cc-jiangxia-expert-template-fill/v1', templateId: 'session-v1',
      fields: { REPORT_TITLE: 'Missing Baidu', SOURCE_ROWS: [['[1]', 'https://example.com']] },
    })).rejects.toMatchObject({ code: 'EXPERT_RESEARCH_SEARCH_COVERAGE_REQUIRED' })

    await service.recordResearchAudit(sessionId, {
      agentId: 'researcher', agentType: 'expert-evidence-researcher',
      entries: [
        { target: 'https://www.google.com/search?q=reader', kind: 'search', searchEngine: 'Google', query: 'reader', status: 'access_limited' },
        { target: 'https://www.baidu.com/s?wd=reader', kind: 'search', searchEngine: '百度', query: 'reader', status: 'access_limited' },
        { target: 'https://example.com/reader', kind: 'url', status: 'opened' },
      ],
    })
    await expect(service.renderTemplateFill(sessionId, {
      format: 'cc-jiangxia-expert-template-fill/v1', templateId: 'session-v1',
      fields: { REPORT_TITLE: 'All attempted', SOURCE_ROWS: [['[1]', 'https://example.com']] },
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
  })

  it('passes completed researcher reports and browser audits only to the ZIP-declared reviewer', async () => {
    const configRoot = await makeTempRoot('expert-review-evidence-config-')
    const projectRoot = await makeTempRoot('expert-review-evidence-project-')
    await installDeliveryConfirmedExpert(configRoot)
    const service = new ExpertSessionService()
    const { sessionId } = await sessionService.createSession(projectRoot)
    await service.enterExpertMode(sessionId, 'delivery-expert')

    await service.recordResearchAudit(sessionId, {
      agentId: 'competitor-researcher',
      agentType: 'expert-evidence-researcher',
      content: 'Typora pricing is a one-time purchase according to its opened official page.',
      entries: [{ target: 'https://typora.io/', finalUrl: 'https://typora.io/', kind: 'url', status: 'opened' }],
    })

    const reviewer = await service.getSubagentResearchEvidenceContext(sessionId, 'expert-evidence-reviewer')
    expect(reviewer).toMatchObject({
      reviewerEvidenceOnly: true,
      records: [expect.objectContaining({
        agentId: 'competitor-researcher',
        content: 'Typora pricing is a one-time purchase according to its opened official page.',
        entries: [expect.objectContaining({ finalUrl: 'https://typora.io/', status: 'opened' })],
      })],
    })
    expect(await service.getSubagentResearchEvidenceContext(sessionId, 'expert-evidence-researcher')).toBeUndefined()
  })

  it('stores researcher detail in declared Markdown files and exposes only file paths to the reviewer', async () => {
    const configRoot = await makeTempRoot('expert-artifact-evidence-config-')
    const projectRoot = await makeTempRoot('expert-artifact-evidence-project-')
    await installDeliveryConfirmedExpert(configRoot)
    const service = new ExpertSessionService()
    const { sessionId } = await sessionService.createSession(projectRoot)
    await service.enterExpertMode(sessionId, 'delivery-expert')
    const stored = await sessionService.getSession(sessionId)
    const expert = stored?.expert
    if (!expert?.runtimeBinding) throw new Error('expected active Expert binding')
    expert.runtimeBinding.researchArtifactPolicy = {
      mode: 'markdown-path-only', directory: 'commercialization-research',
      briefPath: 'commercialization-research/01-research-brief.md',
      researcherPaths: [
        'commercialization-research/02-competitors.md',
        'commercialization-research/03-user-needs.md',
        'commercialization-research/04-channels.md',
      ],
      reviewerPath: 'commercialization-research/05-evidence-review.md',
      auditPath: 'commercialization-research/06-browser-audit.md', maxCharacters: 90000,
    }
    await sessionService.appendSessionMetadata(sessionId, { workDir: projectRoot, expert })
    await expect(service.getSubagentSkillContext(sessionId, 'expert-evidence-researcher')).rejects.toMatchObject({
      code: 'EXPERT_RESEARCH_BRIEF_REQUIRED',
    })
    await expect(service.recordResearchAudit(sessionId, {
      agentId: 'before-brief', agentType: 'expert-evidence-researcher', content: 'commercialization-research/02-competitors.md', entries: [],
    })).rejects.toMatchObject({ code: 'EXPERT_RESEARCH_BRIEF_REQUIRED' })

    await mkdir(path.join(projectRoot, 'commercialization-research'), { recursive: true })
    await writeFile(path.join(projectRoot, 'commercialization-research', '01-research-brief.md'), '# Brief\n产品形态：桌面工具。', 'utf8')
    await expect(service.getSubagentSkillContext(sessionId, 'expert-evidence-researcher')).resolves.toMatchObject({
      expertId: 'delivery-expert',
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
    })


    await expect(service.getSubagentSkillContext(sessionId, 'expert-evidence-reviewer')).rejects.toMatchObject({
      code: 'EXPERT_RESEARCH_SUBAGENTS_PENDING',
    })
    await expect(service.recordResearchAudit(sessionId, {
      agentId: 'free-form', agentType: 'expert-evidence-researcher', content: '竞品台账已经写入；官方页支持免费边界，仍需对真实付费意愿继续取证。',
      entries: [{ target: 'https://example.com/wrong', status: 'opened' }],
    })).resolves.toMatchObject({ researchEvidence: expect.any(Object) })

    const paths = ['02-competitors.md', '03-user-needs.md', '04-channels.md']
    for (const [index, filename] of paths.entries()) {
      const artifactPath = 'commercialization-research/' + filename
      await writeFile(path.join(projectRoot, artifactPath), '# Research ' + index + '\n详细证据只保存在文件中。', 'utf8')
      await service.recordResearchAudit(sessionId, {
        agentId: 'researcher-' + index, agentType: 'expert-evidence-researcher', content: artifactPath,
        entries: [{ target: 'https://example.com/' + index, finalUrl: 'https://example.com/' + index, kind: 'url', status: 'opened' }],
      })
    }

    const reviewer = await service.getSubagentResearchEvidenceContext(sessionId, 'expert-evidence-reviewer')
    expect(reviewer).toMatchObject({
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
    })
    await expect(readFile(path.join(projectRoot, 'commercialization-research', '06-browser-audit.md'), 'utf8')).resolves.toContain('https://example.com/0')
  })


  it('holds the reviewer only for a brief-selected unattempted route, then accepts the narrow recovery on the same Markdown', async () => {
    const configRoot = await makeTempRoot('expert-required-route-config-')
    const projectRoot = await makeTempRoot('expert-required-route-project-')
    await installDeliveryConfirmedExpert(configRoot)
    const service = new ExpertSessionService()
    const { sessionId } = await sessionService.createSession(projectRoot)
    await service.enterExpertMode(sessionId, 'delivery-expert')
    const stored = await sessionService.getSession(sessionId)
    const expert = stored?.expert
    if (!expert?.runtimeBinding) throw new Error('expected active Expert binding')
    expert.runtimeBinding.researchArtifactPolicy = {
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
      routeCompletion: { mode: 'dynamic-route-status-v2', requireAttemptedRequiredRoutes: true },
    }
    const artifactPolicy = expert.runtimeBinding.researchArtifactPolicy
    await sessionService.appendSessionMetadata(sessionId, { workDir: projectRoot, expert })

    await mkdir(path.join(projectRoot, 'commercialization-research'), { recursive: true })
    await writeFile(path.join(projectRoot, artifactPolicy.briefPath), [
      '# Brief',
      '### Route: overseas-video-demand',
      '- Owner report: commercialization-research/03-user-needs.md',
      '- Required route: yes',
      '- Evidence field: user-demand',
      '- Goal: obtain overseas video user evidence',
      '- First route: open a concrete YouTube page',
      '- Fallback route: open a concrete Product Hunt page for the same field',
      '- Completion bar: a concrete page or two limited attempts',
      '- Primary target host: youtube.com',
      '- Fallback target host: producthunt.com',
    ].join('\n'), 'utf8')
    for (const artifactPath of artifactPolicy.researcherPaths) {
      await writeFile(path.join(projectRoot, artifactPath), '# initial research', 'utf8')
    }
    await service.recordResearchAudit(sessionId, {
      agentId: 'research-competitors', agentType: 'expert-evidence-researcher', content: artifactPolicy.researcherPaths[0],
      entries: [{ kind: 'url', target: 'https://example.com/competitor', status: 'opened', actionTypes: ['navigate', 'wait', 'extract'] }],
    })
    await service.recordResearchAudit(sessionId, {
      agentId: 'research-users-original', agentType: 'expert-evidence-researcher', content: artifactPolicy.researcherPaths[1],
      entries: [{ kind: 'url', target: 'https://www.v2ex.com/t/1', status: 'opened', actionTypes: ['navigate', 'wait', 'extract'] }],
    })
    await service.recordResearchAudit(sessionId, {
      agentId: 'research-channels', agentType: 'expert-evidence-researcher', content: artifactPolicy.researcherPaths[2],
      entries: [{ kind: 'url', target: 'https://example.com/channel', status: 'opened', actionTypes: ['navigate', 'wait', 'extract'] }],
    })

    await expect(service.getSubagentResearchEvidenceContext(sessionId, 'expert-evidence-reviewer')).rejects.toMatchObject({
      code: 'EXPERT_RESEARCH_REQUIRED_ROUTE_RECOVERY_REQUIRED',
    })

    await writeFile(path.join(projectRoot, artifactPolicy.researcherPaths[1]), '# narrow YouTube recovery', 'utf8')
    await service.recordResearchAudit(sessionId, {
      agentId: 'research-users-recovery', agentType: 'expert-evidence-researcher', content: artifactPolicy.researcherPaths[1],
      entries: [{ kind: 'url', target: 'https://www.youtube.com/watch?v=abc', status: 'opened', actionTypes: ['navigate', 'wait', 'extract'] }],
    })

    await expect(service.getSubagentResearchEvidenceContext(sessionId, 'expert-evidence-reviewer')).resolves.toMatchObject({
      reviewerEvidenceOnly: true,
      artifactPaths: { auditPath: 'commercialization-research/06-browser-audit.md' },
    })
  })

  it('identifies written but unaudited researcher Markdown as repairable instead of pending', async () => {
    const configRoot = await makeTempRoot('expert-audit-repair-config-')
    const projectRoot = await makeTempRoot('expert-audit-repair-project-')
    await installDeliveryConfirmedExpert(configRoot)
    const service = new ExpertSessionService()
    const { sessionId } = await sessionService.createSession(projectRoot)
    await service.enterExpertMode(sessionId, 'delivery-expert')
    const stored = await sessionService.getSession(sessionId)
    const expert = stored?.expert
    if (!expert?.runtimeBinding) throw new Error('expected active Expert binding')
    expert.runtimeBinding.researchArtifactPolicy = {
      mode: 'markdown-path-only', directory: 'commercialization-research',
      briefPath: 'commercialization-research/01-research-brief.md',
      researcherPaths: [
        'commercialization-research/02-competitors.md',
        'commercialization-research/03-user-needs.md',
        'commercialization-research/04-channels.md',
      ],
      reviewerPath: 'commercialization-research/05-evidence-review.md', auditPath: 'commercialization-research/06-browser-audit.md', maxCharacters: 90000,
    }
    await mkdir(path.join(projectRoot, 'commercialization-research'), { recursive: true })
    await Promise.all([
      writeFile(path.join(projectRoot, 'commercialization-research', '01-research-brief.md'), '# Brief\n产品形态：桌面工具。', 'utf8'),
      writeFile(path.join(projectRoot, 'commercialization-research', '02-competitors.md'), '# Competitors\n真实浏览后已写入。', 'utf8'),
      writeFile(path.join(projectRoot, 'commercialization-research', '03-user-needs.md'), '# User needs\n真实浏览后已写入。', 'utf8'),
      writeFile(path.join(projectRoot, 'commercialization-research', '04-channels.md'), '# Channels\n真实浏览后已写入。', 'utf8'),
    ])
    await sessionService.appendSessionMetadata(sessionId, { workDir: projectRoot, expert })

    try {
      await service.getSubagentSkillContext(sessionId, 'expert-evidence-reviewer')
      throw new Error('Expected audit-repair gate to reject reviewer launch')
    } catch (error) {
      expect(error).toMatchObject({ code: 'EXPERT_RESEARCH_AUDIT_REPAIR_REQUIRED' })
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toContain('不要等待或暂停')
      expect((error as Error).message).toContain('02-competitors.md')
      expect((error as Error).message).not.toContain('等待对应')
    }
  })

  it('requires the declared research brief before a file-first Expert can render final HTML', async () => {
    const configRoot = await makeTempRoot('expert-brief-gate-config-')
    const projectRoot = await makeTempRoot('expert-brief-gate-project-')
    await installDeliveryConfirmedExpert(configRoot)
    const service = new ExpertSessionService()
    const { sessionId } = await sessionService.createSession(projectRoot)
    await service.enterExpertMode(sessionId, 'delivery-expert')
    const stored = await sessionService.getSession(sessionId)
    const expert = stored?.expert
    if (!expert?.runtimeBinding) throw new Error('expected active Expert binding')
    expert.runtimeBinding.researchArtifactPolicy = {
      mode: 'markdown-path-only', directory: 'commercialization-research',
      briefPath: 'commercialization-research/01-research-brief.md',
      researcherPaths: ['commercialization-research/02-competitors.md', 'commercialization-research/03-user-needs.md', 'commercialization-research/04-channels.md'],
      reviewerPath: 'commercialization-research/05-evidence-review.md', auditPath: 'commercialization-research/06-browser-audit.md', maxCharacters: 90000,
    }
    await sessionService.appendSessionMetadata(sessionId, { workDir: projectRoot, expert })
    await expect(service.renderTemplateFill(sessionId, deliveryTemplatePayload())).rejects.toMatchObject({
      code: 'EXPERT_RESEARCH_BRIEF_REQUIRED',
    })
  })

  it('requires the declared compact report-field absorption Markdown before a file-first Expert can render final HTML', async () => {
    const configRoot = await makeTempRoot('expert-absorption-gate-config-')
    const projectRoot = await makeTempRoot('expert-absorption-gate-project-')
    await installDeliveryConfirmedExpert(configRoot)
    const service = new ExpertSessionService()
    const { sessionId } = await sessionService.createSession(projectRoot)
    await service.enterExpertMode(sessionId, 'delivery-expert')
    const stored = await sessionService.getSession(sessionId)
    const expert = stored?.expert
    if (!expert?.runtimeBinding) throw new Error('expected active Expert binding')
    expert.runtimeBinding.researchArtifactPolicy = {
      mode: 'markdown-path-only', directory: 'commercialization-research',
      briefPath: 'commercialization-research/01-research-brief.md',
      researcherPaths: ['commercialization-research/02-competitors.md', 'commercialization-research/03-user-needs.md', 'commercialization-research/04-channels.md'],
      reviewerPath: 'commercialization-research/05-evidence-review.md',
      auditPath: 'commercialization-research/06-browser-audit.md',
      absorptionPath: 'commercialization-research/07-report-field-absorption.md',
      maxCharacters: 90000,
    }
    await mkdir(path.join(projectRoot, 'commercialization-research'), { recursive: true })
    await writeFile(path.join(projectRoot, 'commercialization-research', '01-research-brief.md'), '# Brief\n产品形态：桌面工具。', 'utf8')
    await sessionService.appendSessionMetadata(sessionId, { workDir: projectRoot, expert })

    await expect(service.renderTemplateFill(sessionId, deliveryTemplatePayload())).rejects.toMatchObject({
      code: 'EXPERT_RESEARCH_REPORT_ABSORPTION_REQUIRED',
    })
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



  it('derives post-review URL disposition server-side so optional evidenceAbsorption does not block final HTML', async () => {
    const configRoot = await makeTempRoot('expert-absorption-config-')
    const projectRoot = await makeTempRoot('expert-absorption-project-')
    await installExpert(configRoot)
    const service = new ExpertSessionService()
    const { sessionId } = await sessionService.createSession(projectRoot)
    await service.enterExpertMode(sessionId, 'session-expert')
    const stored = await sessionService.getSession(sessionId)
    const expert = stored?.expert
    if (!expert?.runtimeBinding) throw new Error('expected runtime binding')
    expert.runtimeBinding.researchEvidenceReviewPolicy = {
      reviewerAgentType: 'expert-evidence-reviewer', sourceAgentTypes: ['expert-evidence-researcher'],
      maxRecords: 4, maxCharactersPerRecord: 2000, reviewerEvidenceOnly: true,
    }
    expert.runtimeBinding.researchEvidenceAbsorptionPolicy = {
      required: true, userInteraction: 'none', before: 'template-fill',
      reviewerAgentType: 'expert-evidence-reviewer', sourceAgentTypes: ['expert-evidence-researcher'],
      sourceFieldId: 'SOURCE_ROWS', requireAllOpenedSourcesDisposition: true, requireSourceFieldMapping: true,
      requireUsedSourceFieldEvidence: true,
    }
    expert.runtimeBinding.outputTemplate.content = expert.runtimeBinding.outputTemplate.content.replace(
      '</body>',
      '<section>{{COMPETITOR_DETAIL}}</section></body>',
    )
    expert.runtimeBinding.skills = expert.runtimeBinding.skills.filter((skill) => skill.skillId !== 'research-source-library')
    await sessionService.appendSessionMetadata(sessionId, { workDir: projectRoot, expert })

    await service.recordResearchAudit(sessionId, {
      agentId: 'researcher', agentType: 'expert-evidence-researcher', content: 'Competitor evidence.',
      entries: [
        { target: 'https://example.com/', finalUrl: 'https://example.com/', kind: 'url', status: 'opened' },
        { target: 'https://example.com/unused', finalUrl: 'https://example.com/unused', kind: 'url', status: 'opened' },
      ],
    })
    await service.recordResearchAudit(sessionId, {
      agentId: 'reviewer', agentType: 'expert-evidence-reviewer', content: 'Reviewer verdict.', entries: [],
    })

    const base = {
      format: 'cc-jiangxia-expert-template-fill/v1', templateId: 'session-v1',
      fields: {
        REPORT_TITLE: 'Absorbed report',
        COMPETITOR_DETAIL: 'A bounded competitor detail.',
        SOURCE_ROWS: [['[1]', 'https://example.com/']],
      },
    }
    await expect(service.renderTemplateFill(sessionId, base)).resolves.toMatchObject({ templateId: 'session-v1' })
    await expect(service.renderTemplateFill(sessionId, {
      ...base,
      evidenceAbsorption: {
        version: 'cc-jiangxia-evidence-absorption/v1',
        records: [{ sourceUrl: 'https://example.com/', disposition: 'used', fieldIds: ['COMPETITOR_DETAIL'], note: 'Optional only.' }],
        fieldEvidence: [{ sourceUrl: 'https://example.com/', fieldId: 'COMPETITOR_DETAIL', claim: 'This supplemental text is not copied verbatim.' }],
      },
    })).resolves.toMatchObject({ templateId: 'session-v1' })

    await expect(service.renderTemplateFill(sessionId, {
      ...base,
      fields: { ...base.fields, SOURCE_ROWS: [['[1]', 'https://unreviewed.example/source']] },
    })).rejects.toMatchObject({ code: 'EXPERT_RESEARCH_EVIDENCE_ABSORPTION_REQUIRED' })
  })

  it('server-compiles configured field coverage while accepting labeled source-grounded inference', async () => {
    const configRoot = await makeTempRoot('expert-field-coverage-config-')
    const projectRoot = await makeTempRoot('expert-field-coverage-project-')
    await installExpert(configRoot)
    const service = new ExpertSessionService()
    const { sessionId } = await sessionService.createSession(projectRoot)
    await service.enterExpertMode(sessionId, 'session-expert')
    const stored = await sessionService.getSession(sessionId)
    const expert = stored?.expert
    if (!expert?.runtimeBinding) throw new Error('expected runtime binding')
    expert.runtimeBinding.researchEvidenceReviewPolicy = {
      reviewerAgentType: 'expert-evidence-reviewer', sourceAgentTypes: ['expert-evidence-researcher'],
      maxRecords: 4, maxCharactersPerRecord: 2000, reviewerEvidenceOnly: true,
    }
    expert.runtimeBinding.researchEvidenceAbsorptionPolicy = {
      required: true, userInteraction: 'none', before: 'template-fill',
      reviewerAgentType: 'expert-evidence-reviewer', sourceAgentTypes: ['expert-evidence-researcher'],
      sourceFieldId: 'SOURCE_ROWS', requireAllOpenedSourcesDisposition: true, requireSourceFieldMapping: true,
      requireFieldCoverage: true, fieldCoverageFieldIds: ['COMPETITOR_DETAIL'], allowReasonedInference: true,
    }
    expert.runtimeBinding.outputTemplate.content = expert.runtimeBinding.outputTemplate.content.replace(
      '</body>',
      '<section>{{COMPETITOR_DETAIL}}</section></body>',
    )
    await sessionService.appendSessionMetadata(sessionId, { workDir: projectRoot, expert })
    await service.recordResearchAudit(sessionId, {
      agentId: 'researcher', agentType: 'expert-evidence-researcher', content: 'Competitor evidence.',
      entries: [{ target: 'https://example.com/', finalUrl: 'https://example.com/', kind: 'url', status: 'opened' }],
    })
    await service.recordResearchAudit(sessionId, {
      agentId: 'reviewer', agentType: 'expert-evidence-reviewer', content: 'Reviewer verdict.', entries: [],
    })
    const base = {
      format: 'cc-jiangxia-expert-template-fill/v1', templateId: 'session-v1',
      fields: {
        REPORT_TITLE: 'Field coverage report',
        COMPETITOR_DETAIL: '（AI推断）已核验的付费桌面竞品意味着新产品应先验证清晰的升级边界。',
        SOURCE_ROWS: [['[1]', 'https://example.com/']],
      },
    }
    await expect(service.renderTemplateFill(sessionId, base)).resolves.toMatchObject({ templateId: 'session-v1' })
    await expect(service.renderTemplateFill(sessionId, {
      ...base,
      evidenceAbsorption: {
        version: 'cc-jiangxia-evidence-absorption/v2',
        fieldCoverage: [{
          fieldId: 'COMPETITOR_DETAIL',
          state: 'inference',
          sourceUrls: ['https://example.com/'],
          note: '基于已核验的竞品商业模式作出的非数值策略推断。',
        }],
      },
    })).resolves.toMatchObject({ templateId: 'session-v1' })
  })

  it('keeps the same deterministic evidence failure available as correction feedback', async () => {
    const configRoot = await makeTempRoot('expert-repair-limit-evidence-config-')
    const projectRoot = await makeTempRoot('expert-repair-limit-evidence-project-')
    await installExpert(configRoot)
    const service = new ExpertSessionService()
    const { sessionId } = await sessionService.createSession(projectRoot)
    await service.enterExpertMode(sessionId, 'session-expert')
    const stored = await sessionService.getSession(sessionId)
    const expert = stored?.expert
    if (!expert?.runtimeBinding) throw new Error('expected runtime binding')
    expert.runtimeBinding.researchEvidenceReviewPolicy = {
      reviewerAgentType: 'expert-evidence-reviewer', sourceAgentTypes: ['expert-evidence-researcher'],
      maxRecords: 4, maxCharactersPerRecord: 2000, reviewerEvidenceOnly: true,
    }
    expert.runtimeBinding.researchEvidenceAbsorptionPolicy = {
      required: true, userInteraction: 'none', before: 'template-fill',
      reviewerAgentType: 'expert-evidence-reviewer', sourceAgentTypes: ['expert-evidence-researcher'],
      sourceFieldId: 'SOURCE_ROWS', requireAllOpenedSourcesDisposition: true, requireSourceFieldMapping: true,
    }
    await sessionService.appendSessionMetadata(sessionId, { workDir: projectRoot, expert })
    await service.recordResearchAudit(sessionId, {
      agentId: 'researcher', agentType: 'expert-evidence-researcher', content: 'Evidence.',
      entries: [{ target: 'https://example.com/', finalUrl: 'https://example.com/', kind: 'url', status: 'opened' }],
    })
    await service.recordResearchAudit(sessionId, {
      agentId: 'reviewer', agentType: 'expert-evidence-reviewer', content: 'Reviewed.', entries: [],
    })

    const unchanged = {
      format: 'cc-jiangxia-expert-template-fill/v1',
      templateId: 'session-v1',
      fields: { REPORT_TITLE: 'Unreviewed source', SOURCE_ROWS: [['[1]', 'https://unreviewed.example/source']] },
    }
    await expect(service.renderTemplateFill(sessionId, unchanged)).rejects.toMatchObject({ code: 'EXPERT_RESEARCH_EVIDENCE_ABSORPTION_REQUIRED' })
    const afterFirst = await sessionService.getSession(sessionId)
    expect((afterFirst?.expert as { templateFillRepairFailures?: unknown[] } | undefined)?.templateFillRepairFailures).toHaveLength(1)
    await expect(service.renderTemplateFill(sessionId, unchanged)).rejects.toMatchObject({
      code: 'EXPERT_RESEARCH_EVIDENCE_ABSORPTION_REQUIRED',
    })
    await expect(service.renderTemplateFill(sessionId, {
      ...unchanged,
      fields: { ...unchanged.fields, REPORT_TITLE: 'Cosmetic payload change keeps the same evidence correction active.' },
    })).rejects.toMatchObject({
      code: 'EXPERT_RESEARCH_EVIDENCE_ABSORPTION_REQUIRED',
    })
    const afterRepeated = await sessionService.getSession(sessionId)
    expect((afterRepeated?.expert as { templateFillRepairFailures?: unknown[] } | undefined)?.templateFillRepairFailures).toHaveLength(3)
  })


  it('keeps the initial report draft pending until completeness review chooses finalization or one patch', async () => {
    const configRoot = await makeTempRoot('expert-output-review-config-')
    const projectRoot = await makeTempRoot('expert-output-review-project-')
    await installExpert(configRoot)
    const service = new ExpertSessionService()
    const { sessionId } = await sessionService.createSession(projectRoot)
    await service.enterExpertMode(sessionId, 'session-expert')
    const stored = await sessionService.getSession(sessionId)
    const expert = stored?.expert
    if (!expert?.runtimeBinding) throw new Error('expected runtime binding')
    expert.runtimeBinding.researchArtifactPolicy = {
      mode: 'markdown-path-only',
      directory: 'commercialization-research',
      briefPath: 'commercialization-research/01-research-brief.md',
      researcherPaths: ['commercialization-research/02-competitors.md'],
      reviewerPath: 'commercialization-research/05-evidence-review.md',
      auditPath: 'commercialization-research/06-browser-audit.md',
      absorptionPath: 'commercialization-research/07-report-field-absorption.md',
      completionReviewPath: 'commercialization-research/08-report-completeness-review.md',
      maxCharacters: 90_000,
    }
    await mkdir(path.join(projectRoot, 'commercialization-research'), { recursive: true })
    await writeFile(path.join(projectRoot, 'commercialization-research/01-research-brief.md'), '# Brief\n- Product: a test product', 'utf8')
    await writeFile(path.join(projectRoot, 'commercialization-research/07-report-field-absorption.md'), '# Approved field material\n- source-supported detail', 'utf8')
    await sessionService.appendSessionMetadata(sessionId, { workDir: projectRoot, expert })

    const firstDraft = {
      format: 'cc-jiangxia-expert-template-fill/v1',
      templateId: 'session-v1',
      fields: {
        REPORT_TITLE: 'Initial report draft requires completeness review',
        SOURCE_ROWS: [['[1]', 'https://example.com/']]
      },
    }
    const reportPath = path.join(projectRoot, 'initial-commercialization-report.html')
    const initialRender = await service.renderTemplateFill(sessionId, firstDraft, { outputPath: reportPath })
    const beforeWrite = await sessionService.getSession(sessionId)
    expect(beforeWrite?.expert?.templateFillDraft?.completionReview).toBeUndefined()
    expect(beforeWrite?.expert?.templateFillDelivery).toBeUndefined()
    await expect(service.commitTemplateFillWrite(sessionId, { receipt: initialRender.writeReceipt })).rejects.toThrow()
    await writeFile(reportPath, '<html>wrong or partial write</html>', 'utf8')
    await expect(service.commitTemplateFillWrite(sessionId, { receipt: initialRender.writeReceipt })).rejects.toThrow()
    await writeFile(reportPath, initialRender.content, 'utf8')
    await service.commitTemplateFillWrite(sessionId, { receipt: initialRender.writeReceipt })
    await service.commitTemplateFillWrite(sessionId, { receipt: initialRender.writeReceipt })
    // A lost initial acknowledgement may make the caller retry the same full
    // Write. It must recover the pending review, not demand a new field payload.
    const recoveredInitial = await service.renderTemplateFill(sessionId, firstDraft, { outputPath: reportPath })
    expect(recoveredInitial.content).toBe(initialRender.content)
    expect(recoveredInitial.completionReviewRequired).toBe(true)
    await service.commitTemplateFillWrite(sessionId, { receipt: recoveredInitial.writeReceipt })
    const afterInitial = await sessionService.getSession(sessionId)
    expect((afterInitial?.expert as { templateFillDraft?: unknown } | undefined)?.templateFillDraft).toMatchObject({
      templateId: 'session-v1',
      fields: firstDraft.fields,
      completionReview: { reportPath },
    })

    await expect(service.renderTemplateFill(sessionId, {
      templateId: 'session-v1',
      mode: 'patch',
      fields: { REPORT_TITLE: 'Patched after review' },
    })).rejects.toMatchObject({ code: 'EXPERT_REPORT_COMPLETENESS_REVIEW_REQUIRED' })

    await writeFile(path.join(projectRoot, 'commercialization-research/08-report-completeness-review.md'), '# Covered\n- No unsupported additions.', 'utf8')
    await expect(service.renderTemplateFill(sessionId, {
      templateId: 'session-v1',
      mode: 'finalize',
      fields: {},
    })).rejects.toMatchObject({ code: 'EXPERT_REPORT_COMPLETENESS_REVIEWER_REQUIRED' })

    await service.recordResearchAudit(sessionId, {
      agentId: 'output-reviewer-1',
      agentType: 'expert-evidence-output-reviewer',
      entries: [],
      artifactPath: 'commercialization-research/08-report-completeness-review.md', content: '完整性复核已写入；请按其中的证据结论处理。',
    })
    await expect(service.renderTemplateFill(sessionId, {
      templateId: 'session-v1',
      mode: 'patch',
      fields: { REPORT_TITLE: 'Patched after review' },
    })).rejects.toMatchObject({ code: 'EXPERT_REPORT_COMPLETENESS_NO_PATCH_REQUIRED' })
    const finalizedRender = await service.renderTemplateFill(sessionId, {
      templateId: 'session-v1',
      mode: 'finalize',
      fields: {},
    }, { outputPath: reportPath })
    expect(finalizedRender).toMatchObject({ templateId: 'session-v1' })
    expect((await sessionService.getSession(sessionId))?.expert?.templateFillDelivery).toBeUndefined()
    expect((await sessionService.getSession(sessionId))?.expert?.templateFillDraft?.completionReview).toBeDefined()
    await writeFile(reportPath, finalizedRender.content, 'utf8')
    await service.commitTemplateFillWrite(sessionId, { receipt: finalizedRender.writeReceipt })
    const finalized = await sessionService.getSession(sessionId)
    expect((finalized?.expert as { templateFillDraft?: unknown } | undefined)?.templateFillDraft).toBeUndefined()
    expect((finalized?.expert as { templateFillDelivery?: unknown } | undefined)?.templateFillDelivery).toMatchObject({
      templateId: 'session-v1',
      reportPath,
      finalizedAt: expect.any(String),
    })
    const existingFinal = await readFile(reportPath, 'utf8')
    await expect(service.renderTemplateFill(sessionId, {
      templateId: 'session-v1',
      mode: 'finalize',
      fields: {},
    }, { outputPath: reportPath })).resolves.toEqual({ content: existingFinal, templateId: 'session-v1', completionReviewRequired: false })
    await expect(service.renderTemplateFill(sessionId, {
      templateId: 'session-v1',
      mode: 'patch',
      fields: { REPORT_TITLE: 'must not reopen delivery' },
    }, { outputPath: reportPath })).resolves.toEqual({ content: existingFinal, templateId: 'session-v1', completionReviewRequired: false })
  })

  it('a repaired initial candidate still creates an 08-pending draft, never a finalized delivery', async () => {
    const configRoot = await makeTempRoot('expert-output-review-config-')
    const projectRoot = await makeTempRoot('expert-output-review-project-')
    await installExpert(configRoot)
    const service = new ExpertSessionService()
    const { sessionId } = await sessionService.createSession(projectRoot)
    await service.enterExpertMode(sessionId, 'session-expert')
    const stored = await sessionService.getSession(sessionId)
    const expert = stored?.expert
    if (!expert?.runtimeBinding) throw new Error('expected runtime binding')
    expert.runtimeBinding.researchArtifactPolicy = {
      mode: 'markdown-path-only',
      directory: 'commercialization-research',
      briefPath: 'commercialization-research/01-research-brief.md',
      researcherPaths: ['commercialization-research/02-competitors.md'],
      reviewerPath: 'commercialization-research/05-evidence-review.md',
      auditPath: 'commercialization-research/06-browser-audit.md',
      absorptionPath: 'commercialization-research/07-report-field-absorption.md',
      completionReviewPath: 'commercialization-research/08-report-completeness-review.md',
      maxCharacters: 90_000,
    }
    await mkdir(path.join(projectRoot, 'commercialization-research'), { recursive: true })
    await writeFile(path.join(projectRoot, 'commercialization-research/01-research-brief.md'), '# Brief\n- Product: a test product', 'utf8')
    await writeFile(path.join(projectRoot, 'commercialization-research/07-report-field-absorption.md'), '# Approved field material\n- source-supported detail', 'utf8')
    await sessionService.appendSessionMetadata(sessionId, { workDir: projectRoot, expert })

    const firstDraft = {
      format: 'cc-jiangxia-expert-template-fill/v1',
      templateId: 'session-v1',
      fields: {
        REPORT_TITLE: 'Initial report draft requires completeness review',
        SOURCE_ROWS: [['[1]', 'https://example.com/']]
      },
    }
    const reportPath = path.join(projectRoot, 'initial-commercialization-report.html')
    await expect(service.renderTemplateFill(sessionId, { ...firstDraft, fields: { REPORT_TITLE: firstDraft.fields.REPORT_TITLE } }, { outputPath: reportPath })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect((await sessionService.getSession(sessionId))?.expert?.templateFillDraft).toBeUndefined()
    await expect(renderAndCommit(service, sessionId, { templateId: firstDraft.templateId, mode: 'patch', fields: { SOURCE_ROWS: firstDraft.fields.SOURCE_ROWS } }, { outputPath: reportPath })).resolves.toMatchObject({ templateId: 'session-v1', completionReviewRequired: true })
    const afterInitial = await sessionService.getSession(sessionId)
    expect((afterInitial?.expert as { templateFillDraft?: unknown } | undefined)?.templateFillDraft).toMatchObject({
      templateId: 'session-v1',
      fields: firstDraft.fields,
      completionReview: { reportPath },
    })

    expect(afterInitial?.expert?.templateFillDelivery).toBeUndefined()
  })

  it('keeps a stable search URL resolved to its audited URL in the rendered 08 draft', async () => {
    const configRoot = await makeTempRoot('expert-rendered-draft-source-config-')
    const projectRoot = await makeTempRoot('expert-rendered-draft-source-project-')
    await installExpert(configRoot)
    const service = new ExpertSessionService()
    const { sessionId } = await sessionService.createSession(projectRoot)
    await service.enterExpertMode(sessionId, 'session-expert')
    const initial = await sessionService.getSession(sessionId)
    const initialExpert = initial?.expert
    if (!initialExpert?.runtimeBinding) throw new Error('expected runtime binding')
    initialExpert.runtimeBinding.researchEvidenceReviewPolicy = {
      reviewerAgentType: 'expert-evidence-reviewer',
      sourceAgentTypes: ['expert-evidence-researcher'],
      maxRecords: 4,
      maxCharactersPerRecord: 2_000,
      reviewerEvidenceOnly: true,
    }
    initialExpert.runtimeBinding.researchEvidenceAbsorptionPolicy = {
      required: true,
      userInteraction: 'none',
      before: 'template-fill',
      reviewerAgentType: 'expert-evidence-reviewer',
      sourceAgentTypes: ['expert-evidence-researcher'],
      sourceFieldId: 'SOURCE_ROWS',
      requireSourceFieldMapping: true,
      requireSearchAuditBindings: true,
    }
    await sessionService.appendSessionMetadata(sessionId, { workDir: projectRoot, expert: initialExpert })

    const stableUrl = 'https://www.google.com/search?q=mouse+middle+button'
    const auditedUrl = stableUrl + '&sei=ephemeral&ved=volatile'
    await service.recordResearchAudit(sessionId, {
      agentId: 'researcher',
      agentType: 'expert-evidence-researcher',
      content: 'Google SERP observed.',
      entries: [{
        auditId: 'google-middle-button',
        target: stableUrl,
        finalUrl: auditedUrl,
        kind: 'search',
        searchEngine: 'Google',
        searchResultStatus: 'results_observed',
        status: 'opened',
      }],
    })
    await service.recordResearchAudit(sessionId, {
      agentId: 'reviewer',
      agentType: 'expert-evidence-reviewer',
      content: 'Reviewed Google evidence.',
      entries: [],
    })

    const beforeRender = await sessionService.getSession(sessionId)
    const expert = beforeRender?.expert
    if (!expert?.runtimeBinding) throw new Error('expected runtime binding')
    expert.runtimeBinding.researchArtifactPolicy = {
      mode: 'markdown-path-only',
      directory: 'commercialization-research',
      briefPath: 'commercialization-research/01-research-brief.md',
      researcherPaths: ['commercialization-research/02-competitors.md'],
      reviewerPath: 'commercialization-research/05-evidence-review.md',
      auditPath: 'commercialization-research/06-browser-audit.md',
      absorptionPath: 'commercialization-research/07-report-field-absorption.md',
      completionReviewPath: 'commercialization-research/08-report-completeness-review.md',
      maxCharacters: 90_000,
    }
    const researchDir = path.join(projectRoot, 'commercialization-research')
    await mkdir(researchDir, { recursive: true })
    await writeFile(path.join(researchDir, '01-research-brief.md'), '# Brief', 'utf8')
    await writeFile(path.join(researchDir, '07-report-field-absorption.md'), '# Absorption', 'utf8')
    expert.runtimeBinding.skills = expert.runtimeBinding.skills.filter((skill) => skill.skillId !== 'research-source-library')
    await sessionService.appendSessionMetadata(sessionId, { workDir: projectRoot, expert })

    await expect(renderAndCommit(service, sessionId, {
      format: 'cc-jiangxia-expert-template-fill/v1',
      templateId: 'session-v1',
      fields: {
        REPORT_TITLE: 'Stable search URL remains repaired in the review draft',
        SOURCE_ROWS: [['[1]', stableUrl]],
      },
    })).resolves.toMatchObject({ templateId: 'session-v1' })

    const rendered = await sessionService.getSession(sessionId)
    expect((rendered?.expert as { templateFillDraft?: { fields?: { SOURCE_ROWS?: unknown } } } | undefined)?.templateFillDraft?.fields?.SOURCE_ROWS)
      .toEqual([{ value: ['[1]', auditedUrl], auditId: 'google-middle-button' }])
  })

  it('requires the single post-review patch when natural review prose identifies a source-supported omission', async () => {
    const configRoot = await makeTempRoot('expert-output-review-patch-config-')
    const projectRoot = await makeTempRoot('expert-output-review-patch-project-')
    await installExpert(configRoot)
    const service = new ExpertSessionService()
    const { sessionId } = await sessionService.createSession(projectRoot)
    await service.enterExpertMode(sessionId, 'session-expert')
    const stored = await sessionService.getSession(sessionId)
    const expert = stored?.expert
    if (!expert?.runtimeBinding) throw new Error('expected runtime binding')
    expert.runtimeBinding.researchArtifactPolicy = {
      mode: 'markdown-path-only',
      directory: 'commercialization-research',
      briefPath: 'commercialization-research/01-research-brief.md',
      researcherPaths: ['commercialization-research/02-competitors.md'],
      reviewerPath: 'commercialization-research/05-evidence-review.md',
      auditPath: 'commercialization-research/06-browser-audit.md',
      absorptionPath: 'commercialization-research/07-report-field-absorption.md',
      completionReviewPath: 'commercialization-research/08-report-completeness-review.md',
      maxCharacters: 90_000,
    }
    await mkdir(path.join(projectRoot, 'commercialization-research'), { recursive: true })
    await writeFile(path.join(projectRoot, 'commercialization-research/01-research-brief.md'), '# Brief\n- Product: a test product', 'utf8')
    await writeFile(path.join(projectRoot, 'commercialization-research/07-report-field-absorption.md'), '# Approved field material\n- source-supported detail', 'utf8')
    await sessionService.appendSessionMetadata(sessionId, { workDir: projectRoot, expert })

    const firstDraft = {
      format: 'cc-jiangxia-expert-template-fill/v1',
      templateId: 'session-v1',
      fields: { REPORT_TITLE: 'Initial report draft requires one patch', SOURCE_ROWS: [['[1]', 'https://example.com/']] },
    }
    await expect(renderAndCommit(service, sessionId, firstDraft)).resolves.toMatchObject({ templateId: 'session-v1' })
    await writeFile(path.join(projectRoot, 'commercialization-research/08-report-completeness-review.md'), '# Review\n初版遗漏了已吸收的来源支持细节，需要补写到匹配的报告字段。', 'utf8')
    await service.recordResearchAudit(sessionId, {
      agentId: 'output-reviewer-2',
      agentType: 'expert-evidence-output-reviewer',
      entries: [],
      artifactPath: 'commercialization-research/08-report-completeness-review.md', content: '完整性复核已写入；请按其中的证据结论处理。',
    })

    await expect(service.renderTemplateFill(sessionId, {
      templateId: 'session-v1',
      mode: 'finalize',
      fields: {},
    })).rejects.toMatchObject({ code: 'EXPERT_REPORT_COMPLETENESS_PATCH_REQUIRED' })

    await expect(renderAndCommit(service, sessionId, {
      templateId: 'session-v1',
      mode: 'patch',
      fields: { REPORT_TITLE: 'Patched after natural completeness review' },
    })).resolves.toMatchObject({ templateId: 'session-v1' })
    expect((await sessionService.getSession(sessionId))?.expert?.templateFillDraft).toBeUndefined()
  })

  it('does not create a patch-only draft when the first schema validation fails', async () => {
    const configRoot = await makeTempRoot('expert-template-draft-config-')
    const projectRoot = await makeTempRoot('expert-template-draft-project-')
    await installExpert(configRoot)
    const service = new ExpertSessionService()
    const { sessionId } = await sessionService.createSession(projectRoot)
    await service.enterExpertMode(sessionId, 'session-expert')

    await expect(service.renderTemplateFill(sessionId, {
      format: 'cc-jiangxia-expert-template-fill/v1',
      templateId: 'session-v1',
      fields: { REPORT_TITLE: 'Missing source table on first submission.' },
    })).rejects.toMatchObject({ code: 'BAD_REQUEST' })

    const afterFailure = await sessionService.getSession(sessionId)
    expect((afterFailure?.expert as { templateFillDraft?: unknown } | undefined)?.templateFillDraft).toBeUndefined()

    await expect(service.renderTemplateFill(sessionId, {
      format: 'cc-jiangxia-expert-template-fill/v1',
      templateId: 'session-v1',
      fields: {
        REPORT_TITLE: 'Complete retry after schema validation.',
        SOURCE_ROWS: [['[1]', 'https://example.com']],
      },
    })).resolves.toMatchObject({ templateId: 'session-v1' })
  })

  it('retains rejected first-submission fields for an incremental repair without creating a rendered draft', async () => {
    const configRoot = await makeTempRoot('expert-candidate-repair-config-')
    const projectRoot = await makeTempRoot('expert-candidate-repair-project-')
    await installExpert(configRoot)
    const service = new ExpertSessionService()
    const { sessionId } = await sessionService.createSession(projectRoot)
    await service.enterExpertMode(sessionId, 'session-expert')
    await expect(service.renderTemplateFill(sessionId, {
      templateId: 'session-v1', fields: { REPORT_TITLE: 'Keep this detailed title without retransmission' },
    })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect((await sessionService.getSession(sessionId))?.expert?.templateFillDraft).toBeUndefined()
    // HTTP handlers can use separate service instances; repairs still share this server's candidate.
    const rendered = await new ExpertSessionService().renderTemplateFill(sessionId, {
      templateId: 'session-v1', mode: 'patch', fields: { SOURCE_ROWS: [['[1]', 'https://example.com']] },
    })
    expect(rendered.content).toContain('Keep this detailed title without retransmission')
    expect((await sessionService.getSession(sessionId))?.expert?.templateFillDraft).toBeUndefined()
  })

  it('allows a complete retry after rejected first-source validation instead of forcing patch mode', async () => {
    const configRoot = await makeTempRoot('expert-template-first-retry-config-')
    const projectRoot = await makeTempRoot('expert-template-first-retry-project-')
    await installExpert(configRoot)
    const service = new ExpertSessionService()
    const { sessionId } = await sessionService.createSession(projectRoot)
    await service.enterExpertMode(sessionId, 'session-expert')
    const stored = await sessionService.getSession(sessionId)
    const expert = stored?.expert
    if (!expert?.runtimeBinding) throw new Error('expected runtime binding')
    expert.runtimeBinding.researchEvidenceReviewPolicy = {
      reviewerAgentType: 'expert-evidence-reviewer',
      sourceAgentTypes: ['expert-evidence-researcher'],
      maxRecords: 4,
      maxCharactersPerRecord: 2000,
      reviewerEvidenceOnly: true,
    }
    expert.runtimeBinding.researchEvidenceAbsorptionPolicy = {
      required: true,
      userInteraction: 'none',
      before: 'template-fill',
      reviewerAgentType: 'expert-evidence-reviewer',
      sourceAgentTypes: ['expert-evidence-researcher'],
      sourceFieldId: 'SOURCE_ROWS',
      requireAllOpenedSourcesDisposition: true,
      requireSourceFieldMapping: true,
    }
    await sessionService.appendSessionMetadata(sessionId, { workDir: projectRoot, expert })

    const auditedUrl = 'https://example.com/'
    await service.recordResearchAudit(sessionId, {
      agentId: 'researcher', agentType: 'expert-evidence-researcher', content: 'Public source opened.',
      entries: [{ target: auditedUrl, finalUrl: auditedUrl, kind: 'url', status: 'opened' }],
    })
    await service.recordResearchAudit(sessionId, {
      agentId: 'reviewer', agentType: 'expert-evidence-reviewer', content: 'Reviewed.', entries: [],
    })

    await expect(service.renderTemplateFill(sessionId, {
      format: 'cc-jiangxia-expert-template-fill/v1',
      templateId: 'session-v1',
      fields: {
        REPORT_TITLE: 'First attempt has an unverified source.',
        SOURCE_ROWS: [['[1]', 'https://unreviewed.example/source']],
      },
    })).rejects.toMatchObject({ code: 'EXPERT_RESEARCH_EVIDENCE_ABSORPTION_REQUIRED' })

    const afterRejectedInitial = await sessionService.getSession(sessionId)
    expect((afterRejectedInitial?.expert as { templateFillDraft?: unknown } | undefined)?.templateFillDraft).toBeUndefined()

    await expect(service.renderTemplateFill(sessionId, {
      format: 'cc-jiangxia-expert-template-fill/v1',
      templateId: 'session-v1',
      fields: {
        REPORT_TITLE: 'Full retry after a rejected first source validation.',
        SOURCE_ROWS: [['[1]', auditedUrl]],
      },
    })).resolves.toMatchObject({ templateId: 'session-v1' })

    const afterSuccessfulRetry = await sessionService.getSession(sessionId)
    expect((afterSuccessfulRetry?.expert as { templateFillDraft?: unknown } | undefined)?.templateFillDraft).toBeUndefined()
  })

  it('repairs copied SOURCE_ROWS punctuation and renders in the original request', async () => {
    const configRoot = await makeTempRoot('expert-source-recovery-config-')
    const projectRoot = await makeTempRoot('expert-source-recovery-project-')
    await installExpert(configRoot)
    const service = new ExpertSessionService()
    const { sessionId } = await sessionService.createSession(projectRoot)
    await service.enterExpertMode(sessionId, 'session-expert')
    const stored = await sessionService.getSession(sessionId)
    const expert = stored?.expert
    if (!expert?.runtimeBinding) throw new Error('expected runtime binding')
    expert.runtimeBinding.researchEvidenceReviewPolicy = {
      reviewerAgentType: 'expert-evidence-reviewer', sourceAgentTypes: ['expert-evidence-researcher'],
      maxRecords: 4, maxCharactersPerRecord: 2000, reviewerEvidenceOnly: true,
    }
    expert.runtimeBinding.researchEvidenceAbsorptionPolicy = {
      required: true, userInteraction: 'none', before: 'template-fill',
      reviewerAgentType: 'expert-evidence-reviewer', sourceAgentTypes: ['expert-evidence-researcher'],
      sourceFieldId: 'SOURCE_ROWS', requireAllOpenedSourcesDisposition: true, requireSourceFieldMapping: true,
    }
    await sessionService.appendSessionMetadata(sessionId, { workDir: projectRoot, expert })

    const auditedUrl = 'https://example.com/pricing?plan=pro&ref=research'
    await service.recordResearchAudit(sessionId, {
      agentId: 'researcher', agentType: 'expert-evidence-researcher', content: 'Pricing evidence.',
      entries: [{ target: auditedUrl, finalUrl: auditedUrl, kind: 'url', status: 'opened' }],
    })
    await service.recordResearchAudit(sessionId, {
      agentId: 'reviewer', agentType: 'expert-evidence-reviewer', content: 'Reviewed.', entries: [],
    })

    await expect(service.renderTemplateFill(sessionId, {
      format: 'cc-jiangxia-expert-template-fill/v1',
      templateId: 'session-v1',
      fields: {
        REPORT_TITLE: 'Automatic source recovery',
        SOURCE_ROWS: [['[1]', auditedUrl + '。']],
      },
    })).resolves.toMatchObject({ templateId: 'session-v1' })

    const afterRender = await sessionService.getSession(sessionId)
    expect((afterRender?.expert as { templateFillDraft?: unknown } | undefined)?.templateFillDraft).toBeUndefined()
    expect((afterRender?.expert as { templateFillRepairFailures?: unknown[] } | undefined)?.templateFillRepairFailures).toBeUndefined()
  })

  it('keeps unchanged template schema failures available as correction feedback', async () => {
    const configRoot = await makeTempRoot('expert-repair-limit-schema-config-')
    const projectRoot = await makeTempRoot('expert-repair-limit-schema-project-')
    await installExpert(configRoot)
    const service = new ExpertSessionService()
    const { sessionId } = await sessionService.createSession(projectRoot)
    await service.enterExpertMode(sessionId, 'session-expert')

    const malformed = {
      format: 'cc-jiangxia-expert-template-fill/v1',
      templateId: 'session-v1',
      fields: { REPORT_TITLE: 'Missing required source table' },
    }
    await expect(service.renderTemplateFill(sessionId, malformed)).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await expect(service.renderTemplateFill(sessionId, malformed)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    const afterRepeated = await sessionService.getSession(sessionId)
    expect((afterRepeated?.expert as { templateFillRepairFailures?: unknown[] } | undefined)?.templateFillRepairFailures).toHaveLength(2)
  })

  it('rejects a research Markdown audit contradiction before persisting its evidence record', async () => {
    const configRoot = await makeTempRoot('expert-research-audit-assertion-config-')
    const projectRoot = await makeTempRoot('expert-research-audit-assertion-project-')
    await installExpert(configRoot)
    const service = new ExpertSessionService()
    const { sessionId } = await sessionService.createSession(projectRoot)
    await service.enterExpertMode(sessionId, 'session-expert')
    const stored = await sessionService.getSession(sessionId)
    const expert = stored?.expert
    if (!expert?.runtimeBinding) throw new Error('expected runtime binding')
    expert.runtimeBinding.researchArtifactPolicy = {
      mode: 'markdown-path-only',
      directory: 'commercialization-research',
      briefPath: 'commercialization-research/01-research-brief.md',
      researcherPaths: ['commercialization-research/02-competitors.md'],
      reviewerPath: 'commercialization-research/05-evidence-review.md',
      auditPath: 'commercialization-research/06-browser-audit.md',
      absorptionPath: 'commercialization-research/07-report-field-absorption.md',
      maxCharacters: 90_000,
    }
    expert.runtimeBinding.researchEvidenceReviewPolicy = {
      reviewerAgentType: 'expert-evidence-reviewer',
      sourceAgentTypes: ['expert-evidence-researcher'],
      maxRecords: 4,
      maxCharactersPerRecord: 20_000,
      reviewerEvidenceOnly: true,
    }
    expert.runtimeBinding.researchEvidenceAbsorptionPolicy = {
      required: true,
      userInteraction: 'none',
      before: 'template-fill',
      reviewerAgentType: 'expert-evidence-reviewer',
      sourceAgentTypes: ['expert-evidence-researcher'],
      sourceFieldId: 'SOURCE_ROWS',
      requireAllOpenedSourcesDisposition: true,
      requireSourceFieldMapping: true,
      requireResearchArtifactAuditAssertions: true,
    }
    const researchDir = path.join(projectRoot, 'commercialization-research')
    await mkdir(researchDir, { recursive: true })
    await writeFile(path.join(researchDir, '01-research-brief.md'), '# Brief\n- Product: Quicker', 'utf8')
    await writeFile(path.join(researchDir, '02-competitors.md'), [
      '# Competitors',
      '- Bing access limited [audit:bing-observed].',
      '',
      '<!-- CC_RESEARCH_AUDIT_ASSERTIONS',
      '{',
      '  "version": "cc-jiangxia-research-audit-assertions/v1",',
      '  "assertions": [{',
      '    "auditId": "bing-observed",',
      '    "status": "access_limited",',
      '    "kind": "search",',
      '    "searchResultStatus": "access_limited",',
      '    "finalUrl": "https://www.bing.com/search?q=quicker"',
      '  }]',
      '}',
      '-->',
    ].join('\n'), 'utf8')
    await sessionService.appendSessionMetadata(sessionId, { workDir: projectRoot, expert })

    await expect(service.recordResearchAudit(sessionId, {
      agentId: 'researcher',
      agentType: 'expert-evidence-researcher',
      content: 'commercialization-research/02-competitors.md',
      entries: [{
        auditId: 'bing-observed',
        target: 'https://www.bing.com/search?q=quicker',
        finalUrl: 'https://www.bing.com/search?q=quicker',
        kind: 'search',
        searchEngine: 'Bing',
        searchResultStatus: 'results_observed',
        status: 'opened',
      }],
    })).rejects.toMatchObject({
      code: 'EXPERT_RESEARCH_AUDIT_INVALID',
      message: expect.stringContaining('changes the recorded status for audit bing-observed'),
    })

    const afterRejectedAudit = await sessionService.getSession(sessionId)
    expect(afterRejectedAudit?.expert?.researchEvidence).toBeUndefined()
  })

  it('returns a compact post-review instruction only to the ZIP-designated reviewer', async () => {
    const configRoot = await makeTempRoot('expert-absorption-context-config-')
    const projectRoot = await makeTempRoot('expert-absorption-context-project-')
    await installExpert(configRoot)
    const service = new ExpertSessionService()
    const { sessionId } = await sessionService.createSession(projectRoot)
    await service.enterExpertMode(sessionId, 'session-expert')
    const stored = await sessionService.getSession(sessionId)
    const expert = stored?.expert
    if (!expert?.runtimeBinding) throw new Error('expected runtime binding')
    expert.runtimeBinding.researchEvidenceReviewPolicy = {
      reviewerAgentType: 'expert-evidence-reviewer', sourceAgentTypes: ['expert-evidence-researcher'],
      maxRecords: 4, maxCharactersPerRecord: 2000, reviewerEvidenceOnly: true,
    }
    expert.runtimeBinding.researchEvidenceAbsorptionPolicy = {
      required: true, userInteraction: 'none', before: 'template-fill',
      reviewerAgentType: 'expert-evidence-reviewer', sourceAgentTypes: ['expert-evidence-researcher'],
      sourceFieldId: 'SOURCE_ROWS', requireAllOpenedSourcesDisposition: true, requireSourceFieldMapping: true,
    }
    await sessionService.appendSessionMetadata(sessionId, { workDir: projectRoot, expert })

    await service.recordResearchAudit(sessionId, {
      agentId: 'researcher', agentType: 'expert-evidence-researcher', content: 'Detailed Typora pricing ledger.',
      entries: [{ target: 'https://typora.io/', finalUrl: 'https://typora.io/', kind: 'url', status: 'opened' }],
    })
    expect(await service.getPostReviewEvidenceAbsorptionContext(sessionId, 'expert-evidence-reviewer')).toBeUndefined()

    await service.recordResearchAudit(sessionId, {
      agentId: 'reviewer', agentType: 'expert-evidence-reviewer', content: 'Reviewer accepts supported Typora detail.', entries: [],
    })
    const context = await service.getPostReviewEvidenceAbsorptionContext(sessionId, 'expert-evidence-reviewer')
    expect(context?.instruction).toContain('immediately preceding reviewer result')
    expect(context?.instruction).toContain('https://typora.io/')
    expect(context?.instruction).not.toContain('Detailed Typora pricing ledger.')
    expect(context?.instruction).not.toContain('Reviewer accepts supported Typora detail.')
    expect(await service.getPostReviewEvidenceAbsorptionContext(sessionId, 'expert-evidence-researcher')).toBeUndefined()
  })


  it('accepts a reviewer receipt when the parent accidentally dispatches its declared Markdown as a researcher', async () => {
    const configRoot = await makeTempRoot('expert-reviewer-role-reconcile-config-')
    const projectRoot = await makeTempRoot('expert-reviewer-role-reconcile-project-')
    await installExpert(configRoot)
    const service = new ExpertSessionService()
    const { sessionId } = await sessionService.createSession(projectRoot)
    await service.enterExpertMode(sessionId, 'session-expert')
    const stored = await sessionService.getSession(sessionId)
    const expert = stored?.expert
    if (!expert?.runtimeBinding) throw new Error('expected runtime binding')

    const artifactPolicy = {
      mode: 'markdown-path-only' as const,
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
    }
    expert.runtimeBinding.researchArtifactPolicy = artifactPolicy
    expert.runtimeBinding.researchEvidenceReviewPolicy = {
      reviewerAgentType: 'expert-evidence-reviewer',
      sourceAgentTypes: ['expert-evidence-researcher'],
      maxRecords: 8,
      maxCharactersPerRecord: 20_000,
      reviewerEvidenceOnly: true,
    }
    expert.runtimeBinding.researchEvidenceAbsorptionPolicy = {
      required: true,
      userInteraction: 'none',
      before: 'template-fill',
      reviewerAgentType: 'expert-evidence-reviewer',
      absorberAgentType: 'expert-evidence-absorber',
      sourceAgentTypes: ['expert-evidence-researcher'],
      sourceFieldId: 'SOURCE_ROWS',
      requireAllOpenedSourcesDisposition: true,
      requireSourceFieldMapping: true,
    }
    const researchDir = path.join(projectRoot, 'commercialization-research')
    await mkdir(researchDir, { recursive: true })
    await writeFile(path.join(researchDir, '01-research-brief.md'), '# Brief\nProduct definition.', 'utf8')
    await writeFile(path.join(researchDir, '05-evidence-review.md'), '# Review\nReviewer checked the saved ledgers.', 'utf8')
    await sessionService.appendSessionMetadata(sessionId, { workDir: projectRoot, expert })

    await service.recordResearchAudit(sessionId, {
      agentId: 'misdispatched-reviewer',
      agentType: 'expert-evidence-researcher',
      artifactPath: artifactPolicy.reviewerPath,
      content: 'Written: commercialization-research/05-evidence-review.md',
      entries: [],
    })

    const after = await sessionService.getSession(sessionId)
    expect(after?.expert?.researchEvidenceReviewer?.reviewer).toMatchObject({
      agentId: 'misdispatched-reviewer',
      artifactPath: artifactPolicy.reviewerPath,
    })
    expect(after?.expert?.researchEvidence?.records ?? []).toHaveLength(0)
  })

  it('does not mark a missing reviewer Markdown as complete or dispatch absorption', async () => {
    const configRoot = await makeTempRoot('expert-missing-review-config-')
    const projectRoot = await makeTempRoot('expert-missing-review-project-')
    await installExpert(configRoot)
    const service = new ExpertSessionService()
    const { sessionId } = await sessionService.createSession(projectRoot)
    await service.enterExpertMode(sessionId, 'session-expert')
    const stored = await sessionService.getSession(sessionId)
    const expert = stored?.expert
    if (!expert?.runtimeBinding) throw new Error('expected runtime binding')
    const artifactPolicy = {
      mode: 'markdown-path-only' as const,
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
      maxCharacters: 90_000,
    }
    expert.runtimeBinding.researchArtifactPolicy = artifactPolicy
    expert.runtimeBinding.researchEvidenceReviewPolicy = {
      reviewerAgentType: 'expert-evidence-reviewer', sourceAgentTypes: ['expert-evidence-researcher'],
      maxRecords: 8, maxCharactersPerRecord: 20_000, reviewerEvidenceOnly: true,
    }
    expert.runtimeBinding.researchEvidenceAbsorptionPolicy = {
      required: true, userInteraction: 'none', before: 'template-fill',
      reviewerAgentType: 'expert-evidence-reviewer', absorberAgentType: 'expert-evidence-absorber',
      sourceAgentTypes: ['expert-evidence-researcher'], sourceFieldId: 'SOURCE_ROWS',
      requireAllOpenedSourcesDisposition: true, requireSourceFieldMapping: true,
    }
    const researchDir = path.join(projectRoot, 'commercialization-research')
    await mkdir(researchDir, { recursive: true })
    await writeFile(path.join(researchDir, '01-research-brief.md'), '# Brief', 'utf8')
    for (const artifactPath of artifactPolicy.researcherPaths) {
      await writeFile(path.join(projectRoot, artifactPath), '# Research', 'utf8')
    }
    await sessionService.appendSessionMetadata(sessionId, { workDir: projectRoot, expert })

    for (const [index, artifactPath] of artifactPolicy.researcherPaths.entries()) {
      await service.recordResearchAudit(sessionId, {
        agentId: 'researcher-' + index,
        agentType: 'expert-evidence-researcher',
        artifactPath,
        content: artifactPath,
        entries: [{ target: 'https://example.com/' + index, finalUrl: 'https://example.com/' + index, kind: 'url', status: 'opened' }],
      })
    }
    await service.recordResearchAudit(sessionId, {
      agentId: 'reviewer-denied-write',
      agentType: 'expert-evidence-reviewer',
      artifactPath: artifactPolicy.reviewerPath,
      content: '文件交接：05-evidence-review.md；状态：子代理已结束。',
      entries: [],
    })

    const after = await sessionService.getSession(sessionId)
    expect(after?.expert?.researchEvidenceReviewer).toBeUndefined()
    expect(await service.getPostReviewEvidenceAbsorptionContext(sessionId, 'expert-evidence-reviewer')).toBeUndefined()
  })

  it('hands the completed file-first review to exactly one compact evidence-absorption worker', async () => {
    const configRoot = await makeTempRoot('expert-file-first-absorber-config-')
    const projectRoot = await makeTempRoot('expert-file-first-absorber-project-')
    await installExpert(configRoot)
    const service = new ExpertSessionService()
    const { sessionId } = await sessionService.createSession(projectRoot)
    await service.enterExpertMode(sessionId, 'session-expert')
    const stored = await sessionService.getSession(sessionId)
    const expert = stored?.expert
    if (!expert?.runtimeBinding) throw new Error('expected runtime binding')
    const artifactPolicy = {
      mode: 'markdown-path-only' as const,
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
    }
    expert.runtimeBinding.researchArtifactPolicy = artifactPolicy
    expert.runtimeBinding.researchEvidenceReviewPolicy = {
      reviewerAgentType: 'expert-evidence-reviewer', sourceAgentTypes: ['expert-evidence-researcher'],
      maxRecords: 8, maxCharactersPerRecord: 20_000, reviewerEvidenceOnly: true,
    }
    expert.runtimeBinding.researchEvidenceAbsorptionPolicy = {
      required: true, userInteraction: 'none', before: 'template-fill',
      reviewerAgentType: 'expert-evidence-reviewer', absorberAgentType: 'expert-evidence-absorber',
      sourceAgentTypes: ['expert-evidence-researcher'], sourceFieldId: 'SOURCE_ROWS',
      requireAllOpenedSourcesDisposition: true, requireSourceFieldMapping: true,
    }
    const researchDir = path.join(projectRoot, 'commercialization-research')
    await mkdir(researchDir, { recursive: true })
    await writeFile(path.join(researchDir, '01-research-brief.md'), '# Brief\n产品方向：图像修复。', 'utf8')
    await writeFile(path.join(researchDir, '02-competitors.md'), '# Competitors\n具体竞品事实。', 'utf8')
    await writeFile(path.join(researchDir, '03-user-needs.md'), '# Needs\n具体用户信号。', 'utf8')
    await writeFile(path.join(researchDir, '04-channels.md'), '# Channels\n具体渠道线索。', 'utf8')
    await writeFile(path.join(researchDir, '05-evidence-review.md'), '# Review\n可采用的证据簇。', 'utf8')
    await writeFile(path.join(researchDir, '07-report-field-absorption.md'), '# Absorption\n具体细节簇及去向。', 'utf8')
    await sessionService.appendSessionMetadata(sessionId, { workDir: projectRoot, expert })

    for (const [index, artifactPath] of artifactPolicy.researcherPaths.entries()) {
      await service.recordResearchAudit(sessionId, {
        agentId: 'researcher-' + index, agentType: 'expert-evidence-researcher', artifactPath, content: '已写入本分工的研究台账，证据和限制以该文件为准。',
        entries: [{
          target: 'https://example.com/' + index,
          finalUrl: 'https://example.com/' + index,
          kind: 'url',
          status: 'opened',
        }],
      })
    }
    await service.getSubagentResearchEvidenceContext(sessionId, 'expert-evidence-reviewer')
    await service.recordResearchAudit(sessionId, {
      agentId: 'reviewer',
      agentType: 'expert-evidence-reviewer',
      artifactPath: artifactPolicy.reviewerPath, content: '独立复核已写入；可继续字段吸收。',
      entries: [],
    })

    const postReview = await service.getPostReviewEvidenceAbsorptionContext(sessionId, 'expert-evidence-reviewer')
    expect(postReview?.instruction).toContain('Dispatch exactly one Agent with subagent_type: "expert-evidence-absorber"')
    expect(postReview?.instruction).toContain(artifactPolicy.absorptionPath)
    expect(postReview?.instruction).not.toContain('具体竞品事实。')
    expect(postReview?.instruction).not.toContain('可采用的证据簇。')

    const absorberContext = await service.getSubagentSkillContext(sessionId, 'expert-evidence-absorber')
    expect(absorberContext.artifactPaths).toEqual({
      briefPath: artifactPolicy.briefPath,
      researcherPaths: artifactPolicy.researcherPaths,
      reviewerPath: artifactPolicy.reviewerPath,
      auditPath: artifactPolicy.auditPath,
      absorptionPath: artifactPolicy.absorptionPath,
      completionReviewPath: artifactPolicy.completionReviewPath,
    })

    const outputReviewerContext = await service.getSubagentSkillContext(sessionId, 'expert-evidence-output-reviewer')
    expect(outputReviewerContext.artifactPaths).toEqual({
      briefPath: artifactPolicy.briefPath,
      researcherPaths: artifactPolicy.researcherPaths,
      reviewerPath: artifactPolicy.reviewerPath,
      auditPath: artifactPolicy.auditPath,
      absorptionPath: artifactPolicy.absorptionPath,
      completionReviewPath: artifactPolicy.completionReviewPath,
    })
  })

  it('writes an observational user source-library receipt into the server-generated browser audit', async () => {
    const configRoot = await makeTempRoot('expert-source-library-audit-config-')
    const projectRoot = await makeTempRoot('expert-source-library-audit-project-')
    await installExpert(configRoot)
    const service = new ExpertSessionService()
    const { sessionId } = await sessionService.createSession(projectRoot)
    await service.enterExpertMode(sessionId, 'session-expert')
    const stored = await sessionService.getSession(sessionId)
    const expert = stored?.expert
    if (!expert?.runtimeBinding) throw new Error('expected runtime binding')

    expert.runtimeBinding.skills.push({
      skillId: 'research-source-library',
      title: 'User source library',
      path: 'skills/research-source-library/SKILL.md',
      sha256: 'source-library-test',
      content: [
        '### 移动应用与增长',
        '- TalkingData：https://www.talkingdata.com/',
      ].join('\n'),
    })
    expert.runtimeBinding.researchArtifactPolicy = {
      mode: 'markdown-path-only',
      directory: 'commercialization-research',
      briefPath: 'commercialization-research/01-research-brief.md',
      researcherPaths: ['commercialization-research/02-competitors.md'],
      reviewerPath: 'commercialization-research/05-evidence-review.md',
      auditPath: 'commercialization-research/06-browser-audit.md',
      maxCharacters: 90_000,
    }
    expert.runtimeBinding.researchEvidenceReviewPolicy = {
      reviewerAgentType: 'expert-evidence-reviewer',
      sourceAgentTypes: ['expert-evidence-researcher'],
      maxRecords: 4,
      maxCharactersPerRecord: 20_000,
      reviewerEvidenceOnly: true,
    }

    const researchDir = path.join(projectRoot, 'commercialization-research')
    await mkdir(researchDir, { recursive: true })
    await writeFile(path.join(researchDir, '01-research-brief.md'), '# Brief', 'utf8')
    await writeFile(path.join(researchDir, '02-competitors.md'), '# Research', 'utf8')
    await sessionService.appendSessionMetadata(sessionId, { workDir: projectRoot, expert })

    await service.recordResearchAudit(sessionId, {
      agentId: 'researcher-a',
      agentType: 'expert-evidence-researcher',
      artifactPath: 'commercialization-research/02-competitors.md',
      content: 'commercialization-research/02-competitors.md',
      entries: [{
        auditId: 'talkingdata-opened',
        target: 'https://www.talkingdata.com/',
        finalUrl: 'https://www.talkingdata.com/reports/mobile-market',
        kind: 'url',
        status: 'opened',
      }],
    })

    await service.getSubagentResearchEvidenceContext(sessionId, 'expert-evidence-reviewer')
    const audit = await readFile(path.join(researchDir, '06-browser-audit.md'), 'utf8')
    expect(audit).toContain('用户候选来源库任务池与浏览状态')
    expect(audit).toContain('用户候选来源库实际命中')
    expect(audit).toContain('公司 PM 核心来源库')
    expect(audit).toContain('开放补充来源网络')
    expect(audit).toContain('A：产品与竞品')
    expect(audit).toContain('移动应用与增长')
    expect(audit).toContain('https://www.talkingdata.com/')
    expect(audit).toContain('同域具体页已打开：https://www.talkingdata.com/reports/mobile-market')
    expect(audit).toContain('talkingdata.com')
    expect(audit).toContain('talkingdata-opened')

    // The receipt belongs only to Experts that actually ship the optional
    // user-curated source-library skill. It must not leak into unrelated
    // Expert audit artifacts as an empty and confusing section.
    const persistedExpert = (await sessionService.getSession(sessionId))?.expert
    if (!persistedExpert?.runtimeBinding) throw new Error('expected persisted Expert binding')
    persistedExpert.runtimeBinding.skills = persistedExpert.runtimeBinding.skills.filter((skill) => skill.skillId !== 'research-source-library')
    await sessionService.appendSessionMetadata(sessionId, { workDir: projectRoot, expert: persistedExpert })
    await service.getSubagentResearchEvidenceContext(sessionId, 'expert-evidence-reviewer')
    const auditWithoutSourceLibrary = await readFile(path.join(researchDir, '06-browser-audit.md'), 'utf8')
    expect(auditWithoutSourceLibrary).not.toContain('用户候选来源库任务池与浏览状态')
    expect(auditWithoutSourceLibrary).not.toContain('用户候选来源库实际命中')
  })




  it('blocks reviewer absorber and output reviewer until every assigned source URL has a real terminal browser outcome', async () => {
    const configRoot = await makeTempRoot('expert-source-terminal-gate-config-')
    const projectRoot = await makeTempRoot('expert-source-terminal-gate-project-')
    await installExpert(configRoot)
    const service = new ExpertSessionService()
    const { sessionId } = await sessionService.createSession(projectRoot)
    await service.enterExpertMode(sessionId, 'session-expert')
    const stored = await sessionService.getSession(sessionId)
    const expert = stored?.expert
    if (!expert?.runtimeBinding) throw new Error('expected runtime binding')
    const artifactPolicy = {
      mode: 'markdown-path-only' as const,
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
    }
    expert.runtimeBinding.researchArtifactPolicy = artifactPolicy
    expert.runtimeBinding.researchEvidenceReviewPolicy = {
      reviewerAgentType: 'expert-evidence-reviewer',
      sourceAgentTypes: ['expert-evidence-researcher'],
      maxRecords: 8,
      maxCharactersPerRecord: 20_000,
      reviewerEvidenceOnly: true,
    }
    expert.runtimeBinding.researchEvidenceAbsorptionPolicy = {
      required: true, userInteraction: 'none', before: 'template-fill',
      reviewerAgentType: 'expert-evidence-reviewer', absorberAgentType: 'expert-evidence-absorber',
      sourceAgentTypes: ['expert-evidence-researcher'], sourceFieldId: 'SOURCE_ROWS',
      requireAllOpenedSourcesDisposition: true, requireSourceFieldMapping: true,
    }
    expert.runtimeBinding.skills.push({
      skillId: 'research-source-library', title: 'Source library', path: 'skills/research-source-library/SKILL.md', sha256: 'terminal-gate',
      content: [
        '### 移动应用、产品数据与 ASO / 增长',
        '- A：https://source-a.example.com/',
        '### 行业、用户、内容与品牌',
        '- B：https://source-b.example.com/',
        '### 投融资、公司与战略研究',
        '- C：https://source-c.example.com/',
      ].join('\n'),
    })
    expert.researchEvidence = {
      updatedAt: '2026-08-27T08:00:00.000Z',
      records: artifactPolicy.researcherPaths.map((artifactPath, index) => ({
        agentId: 'researcher-' + index,
        agentType: 'expert-evidence-researcher',
        artifactPath,
        recordedAt: '2026-08-27T08:00:00.000Z',
        content: '# existing research',
        entries: [{ target: 'https://unrelated-' + index + '.example.net/', status: 'opened' as const, kind: 'url' as const }],
      })),
    }
    expert.researchSourceDispatches = {
      receipts: [],
      recoveredBatchFingerprints: ['already-dispatched-is-not-evidence'],
    }
    const researchDir = path.join(projectRoot, 'commercialization-research')
    await mkdir(researchDir, { recursive: true })
    for (const [name, content] of [
      ['01-research-brief.md', '# Brief'],
      ['02-competitors.md', '# A'],
      ['03-user-needs.md', '# B'],
      ['04-channels.md', '# C'],
      ['05-evidence-review.md', '# Review'],
      ['07-report-field-absorption.md', '# Absorption'],
    ]) await writeFile(path.join(researchDir, name), content, 'utf8')
    await sessionService.appendSessionMetadata(sessionId, { workDir: projectRoot, expert })

    for (const agentType of ['expert-evidence-reviewer', 'expert-evidence-absorber', 'expert-evidence-output-reviewer']) {
      await expect(service.getSubagentSkillContext(sessionId, agentType)).rejects.toMatchObject({
        code: 'EXPERT_RESEARCH_SOURCE_LIBRARY_RECOVERY_REQUIRED',
      })
    }

    const terminalStatuses = ['opened', 'access_limited', 'failed'] as const
    expert.researchEvidence.records = expert.researchEvidence.records.map((record, index) => ({
      ...record,
      entries: [{
        target: 'https://source-' + String.fromCharCode(97 + index) + '.example.com/',
        finalUrl: index === 0 ? 'https://source-a.example.com/report' : undefined,
        status: terminalStatuses[index],
        kind: 'url' as const,
      }],
    }))
    await sessionService.appendSessionMetadata(sessionId, { workDir: projectRoot, expert })
    await expect(service.getSubagentSkillContext(sessionId, 'expert-evidence-reviewer')).resolves.toMatchObject({
      expertId: 'session-expert',
    })
  })

  it('gives each commercialization researcher only its server-planned source batch instead of the full library skill', async () => {
    const configRoot = await makeTempRoot('expert-source-plan-config-')
    const projectRoot = await makeTempRoot('expert-source-plan-project-')
    await installExpert(configRoot)
    const service = new ExpertSessionService()
    const { sessionId } = await sessionService.createSession(projectRoot)
    await service.enterExpertMode(sessionId, 'session-expert')
    const stored = await sessionService.getSession(sessionId)
    const expert = stored?.expert
    if (!expert?.runtimeBinding) throw new Error('expected runtime binding')

    expert.runtimeBinding.skills.push({
      skillId: 'research-source-library',
      title: 'User source library',
      path: 'skills/research-source-library/SKILL.md',
      sha256: 'source-plan-test',
      content: [
        '### 移动应用、产品数据与 ASO / 增长',
        '- A：https://a.example.com/',
        ...Array.from({ length: 10 }, (_, index) => '- A extra ' + index + '：https://a-extra-' + index + '.example.com/'),
        '### 行业、用户、内容与品牌',
        '- B：https://b.example.com/',
        '### 投融资、公司与战略研究',
        '- C：https://c.example.com/',
        '<!-- research-source-library-tier: open -->',
        '### 中文社区、内容与讨论',
        '- B 站：https://www.bilibili.com/',
      ].join('\n'),
    })
    expert.runtimeBinding.subagentSkillIdsByAgentType = {
      ...expert.runtimeBinding.subagentSkillIdsByAgentType,
      'expert-evidence-researcher': ['session-skill', 'research-source-library'],
    }
    expert.runtimeBinding.researchArtifactPolicy = {
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
    }
    expert.runtimeBinding.researchEvidenceReviewPolicy = {
      reviewerAgentType: 'expert-evidence-reviewer',
      sourceAgentTypes: ['expert-evidence-researcher'],
      maxRecords: 4,
      maxCharactersPerRecord: 20_000,
      reviewerEvidenceOnly: true,
    }
    const researchDir = path.join(projectRoot, 'commercialization-research')
    await mkdir(researchDir, { recursive: true })
    await writeFile(path.join(researchDir, '01-research-brief.md'), '# Brief', 'utf8')
    await sessionService.appendSessionMetadata(sessionId, { workDir: projectRoot, expert })

    const targeted = await service.getSubagentSkillContext(sessionId, 'expert-evidence-researcher', 'targeted-evidence')
    expect(targeted.researchTaskKind).toBe('targeted-evidence')
    expect(targeted.researchSourcePlan).toBeUndefined()
    expect(targeted.artifactPaths?.researcherPaths).toHaveLength(3)
    expect(targeted.skills.map((skill) => skill.skillId)).toContain('session-skill')
    expect(targeted.skills.map((skill) => skill.skillId)).not.toContain('research-source-library')
    // A targeted task must not erase the library queue or bypass D's existing gate.
    await expect(service.getSubagentSkillContext(sessionId, 'expert-evidence-reviewer', 'targeted-evidence')).rejects.toThrow()
    const context = await service.getSubagentSkillContext(sessionId, 'expert-evidence-researcher')
    expect(context.researchSourcePlan?.batches).toHaveLength(3)
    expect(context.researchSourcePlan?.batches.map((batch) => batch.artifactPath)).toEqual([
      'commercialization-research/02-competitors.md',
      'commercialization-research/03-user-needs.md',
      'commercialization-research/04-channels.md',
    ])
    expect(context.researchSourcePlan?.batches.flatMap((batch) => batch.entries.map((entry) => entry.candidateUrl))).toEqual(expect.arrayContaining([
      'https://a.example.com/',
      'https://b.example.com/',
      'https://c.example.com/',
      'https://www.bilibili.com/',
    ]))
    expect(context.skills.map((skill) => skill.skillId)).toContain('session-skill')
    expect(context.skills.map((skill) => skill.skillId)).not.toContain('research-source-library')
    const batches = context.researchSourcePlan?.batches ?? []
    expect(batches).toHaveLength(3)
    expect(batches[0]?.batchFingerprint).toMatch(/^[a-f0-9]{32}$/)
    const dispatches = await Promise.all(batches.map((batch, index) => service.recordResearchSourceDispatch(sessionId, {
      agentId: 'researcher-' + index,
      agentType: 'expert-evidence-researcher',
      artifactPath: batch.artifactPath,
      batchFingerprint: batch.batchFingerprint,
      coreEntryCount: batch.entries.filter((entry) => entry.tier === 'core').length,
      openEntryCount: batch.entries.filter((entry) => entry.tier === 'open').length,
    })))
    expect(dispatches.map((dispatch) => dispatch.receipt.artifactPath).sort()).toEqual(batches.map((batch) => batch.artifactPath).sort())

    const first = batches[0]!
    await service.recordResearchSourceDispatch(sessionId, {
      agentId: 'researcher-duplicate',
      agentType: 'expert-evidence-researcher',
      artifactPath: first.artifactPath,
      batchFingerprint: first.batchFingerprint,
      coreEntryCount: first.entries.filter((entry) => entry.tier === 'core').length,
      openEntryCount: first.entries.filter((entry) => entry.tier === 'open').length,
    })
    const persistedReceipts = (await sessionService.getSession(sessionId))?.expert?.researchSourceDispatches?.receipts ?? []
    expect(persistedReceipts).toHaveLength(3)
    expect(new Set(persistedReceipts.map((receipt) => receipt.artifactPath))).toEqual(new Set(batches.map((batch) => batch.artifactPath)))
    expect((await sessionService.getSession(sessionId))?.expert?.researchSourceDispatches?.recoveredBatchFingerprints ?? []).toEqual([])
    expect(persistedReceipts.find((receipt) => receipt.artifactPath === first.artifactPath)?.agentId).toBe('researcher-duplicate')

    await writeFile(path.join(researchDir, '02-competitors.md'), '# A first wave', 'utf8')
    await service.recordResearchAudit(sessionId, {
      agentId: 'researcher-a-wave-1',
      agentType: 'expert-evidence-researcher',
      artifactPath: first.artifactPath,
      content: first.artifactPath,
      entries: first.entries.map((entry) => ({ target: entry.candidateUrl, kind: 'url', status: 'failed' })),
    })
    const nextContext = await service.getSubagentSkillContext(sessionId, 'expert-evidence-researcher')
    const nextA = nextContext.researchSourcePlan?.batches.find((batch) => batch.artifactPath === first.artifactPath)
    expect(nextA?.entries).toHaveLength(1)
    await service.recordResearchSourceDispatch(sessionId, {
      agentId: 'researcher-a-recovery',
      agentType: 'expert-evidence-researcher',
      artifactPath: first.artifactPath,
      batchFingerprint: nextA?.batchFingerprint,
      coreEntryCount: nextA?.entries.filter((entry) => entry.tier === 'core').length,
      openEntryCount: nextA?.entries.filter((entry) => entry.tier === 'open').length,
    })
    expect((await sessionService.getSession(sessionId))?.expert?.researchSourceDispatches?.recoveredBatchFingerprints).toContain(nextA?.batchFingerprint)
  })
})


  it('separates incremental writes from completion and settles one exhausted retry as unexecuted gaps', async () => {
    const configRoot = await makeTempRoot('expert-batch-lifecycle-config-')
    const projectRoot = await makeTempRoot('expert-batch-lifecycle-project-')
    await installExpert(configRoot)
    const service = new ExpertSessionService()
    const { sessionId } = await sessionService.createSession(projectRoot)
    await service.enterExpertMode(sessionId, 'session-expert')
    const expert = (await sessionService.getSession(sessionId))!.expert!
    const paths = ['02-competitors.md', '03-user-needs.md', '04-channels.md'].map((file) => 'commercialization-research/' + file)
    expert.runtimeBinding!.researchArtifactPolicy = { mode: 'markdown-path-only', directory: 'commercialization-research', briefPath: 'commercialization-research/01-research-brief.md', researcherPaths: paths, reviewerPath: 'commercialization-research/05-evidence-review.md', auditPath: 'commercialization-research/06-browser-audit.md', maxCharacters: 90_000 }
    expert.runtimeBinding!.researchEvidenceReviewPolicy = { reviewerAgentType: 'expert-evidence-reviewer', sourceAgentTypes: ['expert-evidence-researcher'], maxRecords: 12, maxCharactersPerRecord: 20_000, reviewerEvidenceOnly: true }
    expert.runtimeBinding!.skills.push({ skillId: 'research-source-library', title: 'Sources', path: 'skills/research-source-library/SKILL.md', sha256: 'fixture', content: '<!-- research-source-library-tier: core -->\n### 移动应用、产品数据与 ASO / 增长\n- Source: https://a.example.com/\n' })
    await mkdir(path.join(projectRoot, 'commercialization-research'), { recursive: true })
    await writeFile(path.join(projectRoot, 'commercialization-research/01-research-brief.md'), '# Brief', 'utf8')
    await writeFile(path.join(projectRoot, paths[0]!), '# Research\n未取得证据，不作为事实。', 'utf8')
    await sessionService.appendSessionMetadata(sessionId, { workDir: projectRoot, expert })
    const batch = (await service.getSubagentSkillContext(sessionId, 'expert-evidence-researcher')).researchSourcePlan!.batches.find((item) => item.entries.length)!
    const dispatch = (agentId: string) => service.recordResearchSourceDispatch(sessionId, { agentId, agentType: 'expert-evidence-researcher', artifactPath: batch.artifactPath, batchFingerprint: batch.batchFingerprint, coreEntryCount: batch.entries.filter((entry) => entry.tier === 'core').length, openEntryCount: batch.entries.filter((entry) => entry.tier === 'open').length })
    const audit = (agentId: string, completed = false) => service.recordResearchAudit(sessionId, { agentId, agentType: 'expert-evidence-researcher', artifactPath: batch.artifactPath, entries: [{ target: 'https://other-evidence.example.org/article', kind: 'url', status: 'opened', finalUrl: 'https://other-evidence.example.org/article' }], content: batch.artifactPath, completed })
    await dispatch('a-first')
    const continuation = spyOn(expertResearchAutoContinueService, 'schedule').mockImplementation(() => {})
    try {
      await audit('a-first')
      expect(continuation).toHaveBeenCalledTimes(1)
      const checkpoint = (await sessionService.getSession(sessionId))!.expert!
      expect(checkpoint.researchEvidence!.records).toHaveLength(1)
    } finally { continuation.mockRestore() }
    expect((await sessionService.getSession(sessionId))!.expert!.researchSourceDispatches!.receipts[0]!.completedAt).toBeUndefined()
    const terminalEvents = spyOn(sessionService, 'getSessionTaskNotifications')
    try {
      terminalEvents.mockResolvedValue([{ taskId: 'some-other-agent', toolUseId: 't', status: 'completed', timestamp: new Date().toISOString() }])
      await service.reconcileResearchSourceCompletionNotifications(sessionId)
      expect((await sessionService.getSession(sessionId))!.expert!.researchSourceDispatches!.receipts[0]!.completedAt).toBeUndefined()
      terminalEvents.mockResolvedValue([{ taskId: 'a-first', toolUseId: 't', status: 'completed', timestamp: new Date().toISOString() }])
      await service.reconcileResearchSourceCompletionNotifications(sessionId)
    } finally { terminalEvents.mockRestore() }
    const first = (await sessionService.getSession(sessionId))!.expert!.researchSourceDispatches!.receipts[0]!
    expect(first.completedAt).toEqual(expect.any(String))
    expect((await dispatch('a-first')).receipt).toEqual(first)
    const retry = await dispatch('a-retry')
    expect(retry.receipt.retryCount).toBe(1)
    expect(retry.receipt.completedAt).toBeUndefined()
    const settle = { artifactPath: batch.artifactPath, batchFingerprint: batch.batchFingerprint, agentId: 'a-retry', candidateUrls: batch.entries.map((entry) => entry.candidateUrl) }
    await service.settleFinishedResearchSourceBatch(sessionId, settle)
    expect((await service.getSubagentSkillContext(sessionId, 'expert-evidence-researcher')).researchSourcePlan!.batches.some((item) => item.entries.length)).toBe(true)
    const rejectedContinuation = spyOn(expertResearchAutoContinueService, 'schedule').mockImplementation(() => {})
    try {
      await expect(service.recordResearchAudit(sessionId, { agentId: 'a-retry', agentType: 'expert-evidence-researcher', content: batch.artifactPath, completed: true, entries: [] })).rejects.toThrow('没有可验证')
      expect(rejectedContinuation).toHaveBeenCalledTimes(1)
    } finally { rejectedContinuation.mockRestore() }
    expect((await sessionService.getSession(sessionId))!.expert!.researchSourceDispatches!.receipts[0]!.completedAt).toEqual(expect.any(String))
    await service.settleFinishedResearchSourceBatch(sessionId, settle)
    const stored = (await sessionService.getSession(sessionId))!.expert!
    const attempts = stored.researchEvidence!.records.flatMap((record) => record.entries).filter((entry) => entry.target === 'https://a.example.com/')
    expect(attempts).toEqual([expect.objectContaining({ status: 'interrupted', target: 'https://a.example.com/', detail: expect.stringContaining('未执行/未完成') })])
    expect(attempts[0]!.finalUrl).toBeUndefined()
    await service.settleFinishedResearchSourceBatch(sessionId, settle)
    expect((await service.getSubagentSkillContext(sessionId, 'expert-evidence-researcher')).researchSourcePlan!.batches.every((item) => item.entries.length === 0)).toBe(true)
  })

async function makeReviewedDraft(reviewContent: string, withEvidence = false) {
  const configRoot = await makeTempRoot('expert-loop-regression-config-')
  const projectRoot = await makeTempRoot('expert-loop-regression-project-')
  await installExpert(configRoot)
  const service = new ExpertSessionService()
  const { sessionId } = await sessionService.createSession(projectRoot)
  await service.enterExpertMode(sessionId, 'session-expert')
  const expert = (await sessionService.getSession(sessionId))!.expert!
  const binding = expert.runtimeBinding!
  if (withEvidence) {
    binding.researchEvidenceReviewPolicy = {
      reviewerAgentType: 'expert-evidence-reviewer', sourceAgentTypes: ['expert-evidence-researcher'],
      maxRecords: 4, maxCharactersPerRecord: 2000, reviewerEvidenceOnly: true,
    }
    binding.researchEvidenceAbsorptionPolicy = {
      required: true, userInteraction: 'none', before: 'template-fill',
      reviewerAgentType: 'expert-evidence-reviewer', sourceAgentTypes: ['expert-evidence-researcher'],
      sourceFieldId: 'SOURCE_ROWS', requireSourceFieldMapping: true,
    }
    await sessionService.appendSessionMetadata(sessionId, { workDir: projectRoot, expert })
    await service.recordResearchAudit(sessionId, {
      agentId: 'researcher', agentType: 'expert-evidence-researcher', content: 'Pricing evidence.',
      entries: [{ target: 'https://example.com/', finalUrl: 'https://example.com/', kind: 'url', status: 'opened' }],
    })
    await service.recordResearchAudit(sessionId, {
      agentId: 'reviewer', agentType: 'expert-evidence-reviewer', content: 'Reviewed.', entries: [],
    })
  }
  const current = (await sessionService.getSession(sessionId))!.expert!
  current.runtimeBinding!.researchArtifactPolicy = {
    mode: 'markdown-path-only', directory: 'commercialization-research',
    briefPath: 'commercialization-research/01-research-brief.md',
    researcherPaths: ['commercialization-research/02-competitors.md'],
    reviewerPath: 'commercialization-research/05-evidence-review.md',
    auditPath: 'commercialization-research/06-browser-audit.md',
    absorptionPath: 'commercialization-research/07-report-field-absorption.md',
    completionReviewPath: 'commercialization-research/08-report-completeness-review.md', maxCharacters: 90000,
  }
  const researchDir = path.join(projectRoot, 'commercialization-research')
  await mkdir(researchDir, { recursive: true })
  await writeFile(path.join(researchDir, '01-research-brief.md'), '# Brief')
  await writeFile(path.join(researchDir, '07-report-field-absorption.md'), '# Supported title correction')
  await sessionService.appendSessionMetadata(sessionId, { workDir: projectRoot, expert: current })
  const reportPath = path.join(projectRoot, 'report.html')
  const fields = { REPORT_TITLE: 'Original detailed report', SOURCE_ROWS: [['[1]', 'https://example.com/']] }
  const rendered = await renderAndCommit(service, sessionId, { templateId: 'session-v1', fields }, { outputPath: reportPath })
  await writeFile(path.join(researchDir, '08-report-completeness-review.md'), reviewContent)
  await service.recordResearchAudit(sessionId, {
    agentId: 'output-reviewer', agentType: 'expert-evidence-output-reviewer', entries: [],
    artifactPath: 'commercialization-research/08-report-completeness-review.md', content: '已写入复核。',
  })
  return { service, sessionId, projectRoot, reportPath, fields, rendered }
}

describe('report delivery loop regressions', () => {
  it.each([
    '结论：无需补写。\n本文覆盖了全部决策簇与对应字段映射：一句话内核修正。\n本复核无 MUST_PATCH。',
    '未见由 07 已支持但与草稿不一致、需最小补写的源支撑型遗漏，未发现任何 MUST_PATCH。',
    '已补充官方定价；不需要再次修改。\n无需任何补写。',
    'No MUST_PATCH. No patch is needed. The report does not need a patch.',
    '可选建议：如需增强可追溯性，建议补写来源行；不影响本次定稿。',
    '需求映射已覆盖；响应内容修正已经完成。无需补写。',
    '## MUST_PATCH: 无\n已覆盖全部有来源支持的内容。',
    '结论：无必须补写项。所有需要修正的具体项见「必须补写项」一节当前为空；存在 1 项事实一致性提示（非必须补写）。',
    '## 必须补写项\n无。\n## 非必须提示\n建议修改标题措辞，不影响交付。',
    '需要修改的字段：无。需要补写的项目：0 项。可原样定稿。',
    '若发现遗漏，需要补写对应字段；本轮未发现遗漏，可原样定稿。',
    '## MUST_PATCH\n无。',
  ])('finalizes a negative review without keyword false positives: %s', async (review) => {
    const { service, sessionId, reportPath, rendered } = await makeReviewedDraft(review)
    const final = await renderAndCommit(service, sessionId, { templateId: 'session-v1', mode: 'finalize', fields: {} }, { outputPath: reportPath })
    expect(final.content).toBe(rendered.content)
    expect((await sessionService.getSession(sessionId))?.expert?.templateFillDelivery?.reportPath).toBe(reportPath)
  })

  it.each([
    'MUST_PATCH: REPORT_TITLE 缺少已有来源支持的具体限制。',
    '来源已支持：需要补写 REPORT_TITLE 中遗漏的免费版限制。',
    '根据 07 的原始材料，需要修正 REPORT_TITLE 中改变含义的错字。',
    '根据 07 的已审计页面，需要修正 SOURCE_ROWS 的来源名称与错链。',
    'SOURCE_ROWS 无需补写，REPORT_TITLE 需要补充已支持的免费版限制。',
    '其他章节无需补写，但 REPORT_TITLE 需要补充来源已支持的免费版限制。',
    'No patch is needed for SOURCE_ROWS, but REPORT_TITLE needs a patch: the free-tier limit is missing.',
    '## MUST_PATCH\n- REPORT_TITLE 缺少已有来源支持的免费边界。',
    '## 必须补写项\n- REPORT_TITLE 缺少已有来源支持的免费边界。',
    '## REPORT_TITLE 需要补充来源已支持的免费边界。',
    '## 非必须提示\n建议修改标题风格。\n## 必须修正\nREPORT_TITLE 字段为空，需要补写 07 已有的产品定义。',
  ])('retains real source-supported patch requirements: %s', async (review) => {
    const { service, sessionId, reportPath } = await makeReviewedDraft(review)
    await expect(service.renderTemplateFill(sessionId, { templateId: 'session-v1', mode: 'finalize', fields: {} }, { outputPath: reportPath }))
      .rejects.toMatchObject({ code: 'EXPERT_REPORT_COMPLETENESS_PATCH_REQUIRED' })
    await expect(renderAndCommit(service, sessionId, { templateId: 'session-v1', mode: 'patch', fields: { REPORT_TITLE: 'Supported free-tier limit' } }, { outputPath: reportPath }))
      .resolves.toMatchObject({ completionReviewRequired: false })
  })

  it('never persists a rejected source-normalizing patch or an unacknowledged successful patch', async () => {
    const { service, sessionId, reportPath, rendered } = await makeReviewedDraft('MUST_PATCH: 补写 REPORT_TITLE 的已支持细节。', true)
    const before = (await sessionService.getSession(sessionId))!.expert!.templateFillDraft
    await expect(service.renderTemplateFill(sessionId, {
      templateId: 'session-v1', mode: 'patch',
      fields: { SOURCE_ROWS: [['[1]', 'https://example.com/。']], BUILD_CONSUMER_TEXT: 'invalid-placeholder' },
    }, { outputPath: reportPath })).rejects.toThrow('BUILD_CONSUMER_TEXT')
    expect((await sessionService.getSession(sessionId))!.expert!.templateFillDraft).toEqual(before)
    expect(await readFile(reportPath, 'utf8')).toBe(rendered.content)
    const patch = await service.renderTemplateFill(sessionId, {
      templateId: 'session-v1', mode: 'patch', fields: { REPORT_TITLE: 'Supported correction', SOURCE_ROWS: [['[1]', 'https://example.com/。']] },
    }, { outputPath: reportPath })
    expect((await sessionService.getSession(sessionId))!.expert!.templateFillDraft).toEqual(before)
    await writeFile(reportPath, patch.content)
    await service.commitTemplateFillWrite(sessionId, { receipt: patch.writeReceipt })
    expect((await sessionService.getSession(sessionId))!.expert!.templateFillDelivery?.reportPath).toBe(reportPath)
  })

  it('recovers a legacy polluted draft only from history that exactly reproduces the reviewed HTML', async () => {
    const { sessionId, projectRoot, reportPath, rendered } = await makeReviewedDraft('无需补写。可原样定稿。')
    const original = (await sessionService.getSession(sessionId))!.expert!
    const polluted = structuredClone(original)
    polluted.templateFillDraft!.fields = { ...polluted.templateFillDraft!.fields, REPORT_TITLE: 'Rejected replacement', BUILD_CONSUMER_TEXT: 'invalid-placeholder' }
    await sessionService.appendSessionMetadata(sessionId, { workDir: projectRoot, expert: polluted })
    const service = new ExpertSessionService()
    const final = await service.renderTemplateFill(sessionId, { templateId: 'session-v1', mode: 'finalize', fields: {} }, { outputPath: reportPath })
    expect(final.content).toBe(rendered.content)
    expect((await sessionService.getSession(sessionId))!.expert!.templateFillDraft).toEqual(polluted.templateFillDraft)
    await writeFile(reportPath, final.content)
    await service.commitTemplateFillWrite(sessionId, { receipt: final.writeReceipt })
    expect((await sessionService.getSession(sessionId))!.expert!.templateFillDelivery?.reportPath).toBe(reportPath)
  })

  it('does not restore a historic draft when the report bytes no longer match', async () => {
    const { service, sessionId, projectRoot, reportPath } = await makeReviewedDraft('无需补写。')
    const polluted = (await sessionService.getSession(sessionId))!.expert!
    polluted.templateFillDraft!.fields.BUILD_CONSUMER_TEXT = 'invalid-placeholder'
    await sessionService.appendSessionMetadata(sessionId, { workDir: projectRoot, expert: polluted })
    await writeFile(reportPath, '<html>User edited this report</html>')
    await expect(service.renderTemplateFill(sessionId, { templateId: 'session-v1', mode: 'finalize', fields: {} }, { outputPath: reportPath }))
      .rejects.toMatchObject({ code: 'EXPERT_TEMPLATE_FILL_DRAFT_RECOVERY_REQUIRED' })
    expect(await readFile(reportPath, 'utf8')).toBe('<html>User edited this report</html>')
    expect((await sessionService.getSession(sessionId))!.expert!.templateFillDraft).toEqual(polluted.templateFillDraft)
  })
})


it('removes only explicitly null undeclared pre-render candidate fields while preserving valid content', async () => {
  const configRoot = await makeTempRoot('expert-candidate-delete-config-')
  const projectRoot = await makeTempRoot('expert-candidate-delete-project-')
  await installExpert(configRoot)
  const service = new ExpertSessionService()
  const { sessionId } = await sessionService.createSession(projectRoot)
  await service.enterExpertMode(sessionId, 'session-expert')
  const outputPath = path.join(projectRoot, 'same-report.html')
  await expect(service.renderTemplateFill(sessionId, {
    templateId: 'session-v1', fields: { REPORT_TITLE: 'Keep all valid research', SOURCE_ROWS: [['[1]', 'https://example.com']], TARGET_USER_PROFILE_ROWS_note: 'Move this note into a real field' },
  }, { outputPath })).rejects.toThrow('TARGET_USER_PROFILE_ROWS_note')
  expect((await sessionService.getSession(sessionId))?.expert?.templateFillDraft).toBeUndefined()
  // A partial patch must not silently drop an unknown non-null note.
  await expect(service.renderTemplateFill(sessionId, { templateId: 'session-v1', mode: 'patch', fields: { SOURCE_ROWS: [['[1]', 'https://example.com']] } }, { outputPath })).rejects.toThrow('TARGET_USER_PROFILE_ROWS_note')
  const result = await new ExpertSessionService().renderTemplateFill(sessionId, {
    templateId: 'session-v1', mode: 'patch', fields: { TARGET_USER_PROFILE_ROWS_note: null },
  }, { outputPath })
  expect(result.content).toContain('Keep all valid research')
  expect(result.content).toContain('https://example.com')
  expect(result.content).not.toContain('TARGET_USER_PROFILE_ROWS_note')
  await expect(service.renderTemplateFill(sessionId, { templateId: 'session-v1', mode: 'patch', fields: { REPORT_TITLE: null } }, { outputPath })).rejects.toThrow('REPORT_TITLE')
})


it('ingests a legacy general-purpose research audit only for a declared Expert artifact', async () => {
  const configRoot = await makeTempRoot('expert-identity-audit-config-')
  const projectRoot = await makeTempRoot('expert-identity-audit-project-')
  await installDeliveryConfirmedExpert(configRoot)
  const service = new ExpertSessionService()
  const { sessionId } = await sessionService.createSession(projectRoot)
  await service.enterExpertMode(sessionId, 'delivery-expert')
  const expert = (await sessionService.getSession(sessionId))!.expert!
  const researcherPath = 'commercialization-research/03-user-needs.md'
  expert.runtimeBinding!.researchArtifactPolicy = {
    mode: 'markdown-path-only', directory: 'commercialization-research',
    briefPath: 'commercialization-research/01-research-brief.md', researcherPaths: [researcherPath],
    reviewerPath: 'commercialization-research/05-evidence-review.md', auditPath: 'commercialization-research/06-browser-audit.md', maxCharacters: 90000,
  }
  await mkdir(path.join(projectRoot, 'commercialization-research'), { recursive: true })
  await writeFile(path.join(projectRoot, 'commercialization-research/01-research-brief.md'), '# Brief')
  await writeFile(path.join(projectRoot, researcherPath), '# Concrete user observation\nhttps://www.v2ex.com/t/1171074')
  await sessionService.appendSessionMetadata(sessionId, { workDir: projectRoot, expert })
  const input = { agentId: 'legacy-b', agentType: 'general-purpose', artifactPath: researcherPath, content: '已写入', completed: true,
    entries: [{ target: 'https://www.v2ex.com/t/1171074', finalUrl: 'https://www.v2ex.com/t/1171074', kind: 'url', status: 'opened' }] }
  await service.recordResearchAudit(sessionId, input)
  const saved = (await sessionService.getSession(sessionId))!.expert!
  expect(saved.researchEvidence?.records).toEqual([expect.objectContaining({ agentId: 'legacy-b', agentType: 'expert-evidence-researcher', artifactPath: researcherPath, entries: [expect.objectContaining({ target: 'https://www.v2ex.com/t/1171074' })] })])
  await service.recordResearchAudit(sessionId, { ...input, agentId: 'ordinary-task', artifactPath: 'notes.md' })
  expect((await sessionService.getSession(sessionId))!.expert!.researchEvidence?.records).toHaveLength(1)
})


it.each(['url', 'audit'])('carries a legacy child audit and a 07 reference through rendering and confirmed file delivery (%s)', async (referenceKind) => {
  const configRoot = await makeTempRoot('expert-reference-delivery-config-')
  const projectRoot = await makeTempRoot('expert-reference-delivery-project-')
  await installExpert(configRoot)
  const service = new ExpertSessionService()
  const { sessionId } = await sessionService.createSession(projectRoot)
  await service.enterExpertMode(sessionId, 'session-expert')
  const expert = (await sessionService.getSession(sessionId))!.expert!
  const binding = expert.runtimeBinding!
  binding.researchArtifactPolicy = {
    mode: 'markdown-path-only', directory: 'commercialization-research',
    briefPath: 'commercialization-research/01-research-brief.md', researcherPaths: ['commercialization-research/03-user-needs.md'],
    reviewerPath: 'commercialization-research/05-evidence-review.md', auditPath: 'commercialization-research/06-browser-audit.md',
    absorptionPath: 'commercialization-research/07-report-field-absorption.md', maxCharacters: 90000,
  }
  binding.researchEvidenceReviewPolicy = { reviewerAgentType: 'expert-evidence-reviewer', sourceAgentTypes: ['expert-evidence-researcher'], maxRecords: 4, maxCharactersPerRecord: 2000, reviewerEvidenceOnly: true }
  binding.researchEvidenceAbsorptionPolicy = { required: true, userInteraction: 'none', before: 'template-fill', reviewerAgentType: 'expert-evidence-reviewer', sourceAgentTypes: ['expert-evidence-researcher'], sourceFieldId: 'SOURCE_ROWS', requireSourceFieldMapping: true }
  await mkdir(path.join(projectRoot, 'commercialization-research'), { recursive: true })
  for (const [name, content] of Object.entries({
    '01-research-brief.md': '# Brief',
    '03-user-needs.md': '# Observed user task\nConcrete discussion https://www.v2ex.com/t/1171074',
    '05-evidence-review.md': '# Review\nKeep the observed user-task boundary.',
    '07-report-field-absorption.md': '# Report material\nBounded observed user task [S1].\n\n[S1]: https://www.v2ex.com/t/1171074',
  })) await writeFile(path.join(projectRoot, 'commercialization-research', name), content)
  await sessionService.appendSessionMetadata(sessionId, { workDir: projectRoot, expert })
  await service.recordResearchAudit(sessionId, { agentId: 'legacy-b', agentType: 'general-purpose', artifactPath: 'commercialization-research/03-user-needs.md', completed: true,
    entries: [{ auditId: 'exact-user-task', target: 'https://www.v2ex.com/t/1171074', finalUrl: 'https://www.v2ex.com/t/1171074', kind: 'url', status: 'opened' }] })
  await service.recordResearchAudit(sessionId, { agentId: 'reviewer', agentType: 'expert-evidence-reviewer', artifactPath: 'commercialization-research/05-evidence-review.md', entries: [] })
  if (referenceKind === 'audit') await writeFile(path.join(projectRoot, binding.researchArtifactPolicy!.absorptionPath!), '# Report material\nBounded observed user task [S1].\n[S1]: audit:exact-user-task')
  const outputPath = path.join(projectRoot, 'report.html')
  const rendered = await renderAndCommit(service, sessionId, { templateId: 'session-v1', fields: { REPORT_TITLE: 'Bounded observed user task [S1]', SOURCE_ROWS: [] } }, { outputPath })
  expect(rendered.content).toContain('href="https://www.v2ex.com/t/1171074"')
  expect(rendered.content).toContain('[S1]')
  expect(await readFile(outputPath, 'utf8')).toBe(rendered.content)
  expect((await sessionService.getSession(sessionId))!.expert!.templateFillDelivery?.reportPath).toBe(outputPath)
})


it('keeps an oversized legacy ledger and twelve independent parts bound through review and absorption', async () => {
  const configRoot = await makeTempRoot('expert-parts-config-')
  const projectRoot = await makeTempRoot('expert-parts-project-')
  await installExpert(configRoot)
  const service = new ExpertSessionService()
  const { sessionId } = await sessionService.createSession(projectRoot)
  await service.enterExpertMode(sessionId, 'session-expert')
  const expert = (await sessionService.getSession(sessionId))!.expert!
  const base = 'commercialization-research/02-competitors.md'
  const policy = { mode: 'markdown-path-only' as const, directory: 'commercialization-research', briefPath: 'commercialization-research/01-research-brief.md', researcherPaths: [base], researcherParts: true, reviewerPath: 'commercialization-research/05-evidence-review.md', auditPath: 'commercialization-research/06-browser-audit.md', absorptionPath: 'commercialization-research/07-report-field-absorption.md', maxCharacters: 90000 }
  expert.runtimeBinding!.researchArtifactPolicy = policy
  expert.runtimeBinding!.researchEvidenceReviewPolicy = { reviewerAgentType: 'expert-evidence-reviewer', sourceAgentTypes: ['expert-evidence-researcher'], maxRecords: 8, maxCharactersPerRecord: 24000, reviewerEvidenceOnly: true }
  expert.runtimeBinding!.researchEvidenceAbsorptionPolicy = { required: true, userInteraction: 'none', before: 'template-fill', reviewerAgentType: 'expert-evidence-reviewer', absorberAgentType: 'expert-evidence-absorber', sourceAgentTypes: ['expert-evidence-researcher'], sourceFieldId: 'SOURCE_ROWS', requireSourceFieldMapping: true }
  await mkdir(path.join(projectRoot, 'commercialization-research/02-competitors.parts'), { recursive: true })
  await writeFile(path.join(projectRoot, policy.briefPath), '# brief')
  await sessionService.appendSessionMetadata(sessionId, { workDir: projectRoot, expert })
  const parts = [base, ...Array.from({ length: 12 }, (_, i) => 'commercialization-research/02-competitors.parts/worker-' + i + '.md')]
  for (const [index, artifactPath] of parts.entries()) {
    await writeFile(path.join(projectRoot, artifactPath), index === 0 ? '# oversized legacy\n' + '真实完整证据\n'.repeat(25000) : '# task ' + index)
    await service.recordResearchAudit(sessionId, { agentId: 'worker-' + index, agentType: 'expert-evidence-researcher', artifactPath, content: 'saved', completed: true,
      entries: [{ kind: 'url', target: 'https://example.com/' + index, finalUrl: 'https://example.com/' + index, status: 'opened' }] })
  }
  const stored = (await sessionService.getSession(sessionId))!.expert!
  expect(stored.researchEvidence!.records.map(record => record.artifactPath)).toEqual(parts)
  // Replay the old size-gate corruption. Recover only from this worker's unique dispatch.
  delete stored.researchEvidence!.records[0].artifactPath
  stored.researchSourceDispatches = { receipts: [{ agentId: 'worker-0', artifactPath: base, batchFingerprint: 'old-dispatch', coreEntryCount: 1, openEntryCount: 0, dispatchedAt: '2026-09-10T00:00:00Z', completedAt: '2026-09-10T00:01:00Z' }] }
  await sessionService.appendSessionMetadata(sessionId, { workDir: projectRoot, expert: stored })
  const reviewer = await service.getSubagentSkillContext(sessionId, 'expert-evidence-reviewer')
  expect(reviewer.artifactPaths!.researcherPaths).toEqual(parts)
  expect((await sessionService.getSession(sessionId))!.expert!.researchEvidence!.records[0].artifactPath).toBe(base)
  const evidence = await service.getSubagentResearchEvidenceContext(sessionId, 'expert-evidence-reviewer')
  expect(evidence!.artifactPaths!.researcherPaths).toEqual(parts)
  expect(evidence!.records).toHaveLength(0)
  await writeFile(path.join(projectRoot, policy.reviewerPath), '# review\nAll saved parts reviewed.')
  await service.recordResearchAudit(sessionId, { agentId: 'reviewer', agentType: 'expert-evidence-reviewer', artifactPath: policy.reviewerPath, entries: [] })
  const absorber = await service.getSubagentSkillContext(sessionId, 'expert-evidence-absorber')
  expect(absorber.artifactPaths!.researcherPaths).toEqual(parts)
  await writeFile(path.join(projectRoot, policy.absorptionPath), '# chapter-ready material\nObserved evidence [S1].\n[S1]: https://example.com/0')
  const rendered = await renderAndCommit(service, sessionId, { templateId: 'session-v1', fields: { REPORT_TITLE: 'Observed evidence [S1]', SOURCE_ROWS: [['S1', 'https://example.com/0']] } })
  expect(rendered.content).toContain('https://example.com/0')
  expect((await sessionService.getSession(sessionId))!.expert!.templateFillDelivery?.reportPath).toBeDefined()
  expect(await readFile(path.join(projectRoot, base), 'utf8')).toContain('真实完整证据')
})
