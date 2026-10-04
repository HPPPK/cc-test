import { afterEach, describe, expect, it } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { handleSessionsApi } from './sessions.js'
import { sessionService } from '../services/sessionService.js'
import { ExpertSessionService } from '../services/expertSessionService.js'
import { ExpertPackRegistryService, resetExpertPackRegistryForTests } from '../services/expertPackRegistryService.js'
import { ZipPackAdapter } from '../services/zipPackAdapter.js'
import { WorkflowSessionStateService } from '../services/workflowSessionStateService.js'
import type { WorkflowSessionState, WorkflowTemplate } from '../services/workflowTypes.js'
import { recordWorkflowAgentTaskProgress } from '../services/workflowAgentTaskStateService.js'
import { stateToWorkflowMetadata } from '../services/workflowSummary.js'

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
      postReviewEvidenceAbsorption: {
        required: true,
        userInteraction: 'none',
        before: 'template-fill',
        reviewerAgentType: 'expert-evidence-reviewer',
        sourceAgentTypes: ['expert-evidence-researcher'],
        sourceFieldId: 'SOURCE_ROWS',
        requireAllOpenedSourcesDisposition: true,
        requireSourceFieldMapping: true,
      },
    }),
    'skills/research-skill/SKILL.md': 'Use only public evidence.',
  }))
}

async function installTemplateFillExpert(configRoot: string) {
  process.env.CLAUDE_CONFIG_DIR = configRoot
  resetExpertPackRegistryForTests()
  await new ExpertPackRegistryService().importExpertPackZip(await adapter.write({
    'manifest.json': JSON.stringify({
      packId: 'sessions-api-template-fill-pack',
      name: 'Sessions API Template Fill Pack',
      version: '1.0.0',
      schemaVersion: 1,
      type: 'expert-pack',
      entrypoints: {
        experts: ['experts/template-fill/expert.json'],
        skills: ['session-skill'],
      },
    }),
    'experts/template-fill/expert.json': JSON.stringify({
      id: 'sessions-api-template-fill-expert',
      name: 'Sessions API Template Fill Expert',
      description: 'Regression coverage for the server-owned template-fill delivery route.',
      promptPaths: { system: 'experts/template-fill/system.md' },
      outputMode: 'template-fill',
      outputTemplatePath: 'experts/template-fill/templates/report.html',
      skillIds: ['session-skill'],
    }),
    'experts/template-fill/system.md': 'Template-fill route regression prompt',
    'experts/template-fill/templates/report.html': '<html data-template-id="sessions-api-template-v1"><body><h1>{{REPORT_TITLE}}</h1><table><thead><tr><th>编号</th><th>链接（URL）</th></tr></thead><tbody><!-- SLOT: SOURCE_ROWS --></tbody></table></body></html>',
    'skills/session-skill/SKILL.md': 'Template-fill route regression skill',
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

    const nonReviewerEvidenceUrl = new URL('http://localhost/api/sessions/' + sessionId + '/expert/subagent-research-evidence-context?agentType=expert-evidence-researcher')
    const nonReviewerEvidenceResponse = await handleSessionsApi(
      new Request(nonReviewerEvidenceUrl),
      nonReviewerEvidenceUrl,
      ['api', 'sessions', sessionId, 'expert', 'subagent-research-evidence-context'],
    )
    expect(nonReviewerEvidenceResponse.status).toBe(200)
    expect(await nonReviewerEvidenceResponse.json()).toBeNull()

    const absorptionUrl = new URL(`http://localhost/api/sessions/${sessionId}/expert/post-review-evidence-absorption-context?agentType=expert-evidence-reviewer`)
    const pendingAbsorptionResponse = await handleSessionsApi(
      new Request(absorptionUrl),
      absorptionUrl,
      ['api', 'sessions', sessionId, 'expert', 'post-review-evidence-absorption-context'],
    )
    expect(pendingAbsorptionResponse.status).toBe(200)
    expect(await pendingAbsorptionResponse.json()).toBeNull()
  })


  it('acknowledges researcher audits without serializing the complete Expert runtime binding', async () => {
    const configRoot = await makeTempRoot('sessions-api-research-audit-config-')
    const projectRoot = await makeTempRoot('sessions-api-research-audit-project-')
    await installContextExpert(configRoot)
    const { sessionId } = await sessionService.createSession(projectRoot)
    await new ExpertSessionService().enterExpertMode(sessionId, 'sessions-api-context-expert')

    const url = new URL('http://localhost/api/sessions/' + sessionId + '/expert/research-audit')
    const response = await handleSessionsApi(
      new Request(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          agentId: 'researcher-1',
          agentType: 'expert-evidence-researcher',
          content: 'Completed researcher handoff.',
          entries: [{
            target: 'https://example.com/research',
            finalUrl: 'https://example.com/research',
            status: 'opened',
            kind: 'url',
          }],
        }),
      }),
      url,
      ['api', 'sessions', sessionId, 'expert', 'research-audit'],
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      accepted: true,
      researchCompletionUpdatedAt: expect.any(String),
      researchEvidenceUpdatedAt: expect.any(String),
    })
    const evidence = await new ExpertSessionService().getSubagentResearchEvidenceContext(sessionId, 'expert-evidence-reviewer')
    expect(evidence?.records).toEqual([expect.objectContaining({
      agentId: 'researcher-1',
      entries: [expect.objectContaining({ finalUrl: 'https://example.com/research' })],
    })])
  })


  it('records only the current researcher source batch through the dispatch HTTP route', async () => {
    const configRoot = await makeTempRoot('sessions-api-source-dispatch-config-')
    const projectRoot = await makeTempRoot('sessions-api-source-dispatch-project-')
    await installContextExpert(configRoot)
    const { sessionId } = await sessionService.createSession(projectRoot)
    const expertSessionService = new ExpertSessionService()
    await expertSessionService.enterExpertMode(sessionId, 'sessions-api-context-expert')

    const stored = await sessionService.getSession(sessionId)
    const expert = stored?.expert
    if (!expert?.runtimeBinding) throw new Error('expected Expert runtime binding')
    expert.runtimeBinding.skills.push({
      skillId: 'research-source-library',
      title: 'Company PM source library',
      path: 'skills/research-source-library/SKILL.md',
      sha256: 'sessions-api-source-library',
      content: [
        '<!-- research-source-library-tier: core -->',
        '### Product data',
        '- Core source: https://core.example.com/',
        '<!-- research-source-library-tier: open -->',
        '### Community signals',
        '- Open source: https://community.example.com/',
      ].join('\n'),
    })
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
    const researchDir = path.join(projectRoot, 'commercialization-research')
    await mkdir(researchDir, { recursive: true })
    await writeFile(path.join(researchDir, '01-research-brief.md'), '# Research brief', 'utf8')
    await sessionService.appendSessionMetadata(sessionId, { workDir: projectRoot, expert })

    const targetedUrl = new URL('http://localhost/api/sessions/' + sessionId + '/expert/subagent-skill-context?agentType=expert-evidence-researcher&researchTaskKind=targeted-evidence')
    const targetedResponse = await handleSessionsApi(new Request(targetedUrl), targetedUrl, ['api', 'sessions', sessionId, 'expert', 'subagent-skill-context'])
    expect(targetedResponse.status).toBe(200)
    const targeted = await targetedResponse.json() as Record<string, unknown>
    expect(targeted.researchTaskKind).toBe('targeted-evidence')
    expect(targeted.researchSourcePlan).toBeUndefined()
    expect(targeted.artifactPaths).toBeDefined()
    const context = await expertSessionService.getSubagentSkillContext(sessionId, 'expert-evidence-researcher')
    const batch = context.researchSourcePlan?.batches.find((candidate) => candidate.entries.some((entry) => entry.tier === 'core'))
    if (!batch?.batchFingerprint) throw new Error('expected source dispatch batch')
    const coreEntryCount = batch.entries.filter((entry) => entry.tier === 'core').length
    const openEntryCount = batch.entries.filter((entry) => entry.tier === 'open').length
    const url = new URL('http://localhost/api/sessions/' + sessionId + '/expert/research-source-dispatch')
    const postDispatch = (batchFingerprint: string) => handleSessionsApi(
      new Request(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          agentId: 'researcher-a',
          agentType: 'expert-evidence-researcher',
          artifactPath: batch.artifactPath,
          batchFingerprint,
          coreEntryCount,
          openEntryCount,
        }),
      }),
      url,
      ['api', 'sessions', sessionId, 'expert', 'research-source-dispatch'],
    )

    const accepted = await postDispatch(batch.batchFingerprint)
    expect(accepted.status).toBe(200)
    expect(await accepted.json()).toEqual({
      accepted: true,
      artifactPath: batch.artifactPath,
      batchFingerprint: batch.batchFingerprint,
      dispatchedAt: expect.any(String),
    })

    const auditUrl = new URL('http://localhost/api/sessions/' + sessionId + '/expert/research-audit')
    for (const flag of ['interrupted', 'completed']) {
      const auditResponse = await handleSessionsApi(new Request(auditUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agentId: 'researcher-a', agentType: 'expert-evidence-researcher', artifactPath: batch.artifactPath, content: 'No verified evidence', entries: [{ target: batch.entries[0]!.candidateUrl, kind: 'url', status: 'interrupted', detail: '未执行，不是网站访问失败' }], [flag]: true }) }), auditUrl, ['api', 'sessions', sessionId, 'expert', 'research-audit'])
      expect(auditResponse.status).toBe(200)
      expect((await sessionService.getSession(sessionId))!.expert!.researchSourceDispatches!.receipts[0]!.completedAt).toEqual(expect.any(String))
      const current = (await sessionService.getSession(sessionId))!.expert!
      current.researchSourceDispatches!.receipts[0]!.completedAt = undefined
      await sessionService.appendSessionMetadata(sessionId, { workDir: projectRoot, expert: current })
    }

    const rejected = await postDispatch('not-the-current-batch')
    expect(rejected.status).toBe(409)
    expect(await rejected.json()).toMatchObject({
      error: 'EXPERT_RESEARCH_SOURCE_DISPATCH_MISMATCH',
    })
    expect((await sessionService.getSession(sessionId))?.expert?.researchSourceDispatches?.receipts).toEqual([
      expect.objectContaining({
        agentId: 'researcher-a',
        artifactPath: batch.artifactPath,
        batchFingerprint: batch.batchFingerprint,
        coreEntryCount,
        openEntryCount,
      }),
    ])
  })

  it('persists default development Batch Agent progress and keeps duplicate receipts idempotent', async () => {
    const configRoot = await makeTempRoot('sessions-api-development-batch-config-')
    const projectRoot = await makeTempRoot('sessions-api-development-batch-project-')
    process.env.CLAUDE_CONFIG_DIR = configRoot
    const { sessionId } = await sessionService.createSession(projectRoot)
    const now = '2026-08-28T08:00:00.000Z'
    const template: WorkflowTemplate = {
      schemaVersion: 1,
      id: 'efficient-constrained-dev-debug-workflow-v5',
      source: 'user',
      version: '22',
      displayName: 'Development',
      description: 'Fixture',
      phases: [{
        id: 'delegate-implement',
        label: 'Implementation',
        instructions: 'Delegate every Batch.',
        skillDeclarations: [],
        requiredArtifacts: [],
        completionCriteria: [],
        transitionAuthority: 'user-confirmation',
      }],
    }
    const state: WorkflowSessionState = {
      schemaVersion: 1,
      sessionId,
      mode: 'workflow',
      template,
      templateSnapshot: template,
      templateIdentity: { id: template.id, source: 'user', version: template.version },
      sourceTemplateStatus: 'current',
      status: 'running',
      workflowStatus: 'running',
      runStatus: 'active',
      activePhaseId: 'delegate-implement',
      workspaceRoot: projectRoot,
      activeWorkflowRunId: 'run-1',
      workflowRuns: [{
        id: 'run-1',
        templateId: template.id,
        status: 'active',
        workspaceRoot: projectRoot,
        currentPhaseId: 'delegate-implement',
        artifacts: [],
        history: [],
        createdAt: now,
        updatedAt: now,
      }],
      phases: [{ id: 'delegate-implement', index: 0, status: 'running', artifactPointers: [] }],
      phaseRuns: [],
      transitionHistory: [],
      artifactIndex: [],
      finalReportRef: null,
      stateVersion: 1,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      runtimeContract: {
        schemaVersion: 1,
        migrationStatus: 'current',
        phaseStates: {
          'delegate-implement': {
            phaseId: 'delegate-implement',
            workStatus: 'ready-for-review',
            eligibility: 'ineligible',
            blockerReasons: [],
            issues: [],
            artifactRequirements: [],
            checks: [],
            taskSnapshots: [],
            evaluatedAt: now,
          },
        },
        audit: [],
      },
    }
    const runDir = path.join(projectRoot, '.workflow', 'runs', 'run-1')
    await mkdir(runDir, { recursive: true })
    await writeFile(path.join(runDir, 'delivery-plan.md'), '# Delivery plan\n- B1 implementation\n', 'utf8')
    await sessionService.appendSessionMetadata(sessionId, {
      workDir: projectRoot,
      workflow: { mode: 'workflow' } as never,
    })
    await new WorkflowSessionStateService().writeState(sessionId, state)

    const body = {
      phaseId: 'delegate-implement',
      role: 'coder',
      batchId: 'B1',
      plan: [{
        id: 'B1',
        dependsOn: [],
        writeScopes: ['src/**'],
        resourceClaims: [],
        executionMode: 'write',
      }],
      status: 'running',
      agentId: 'coder-1',
      toolUseId: 'toolu_coder_1',
      recordedAt: now,
    }
    const url = new URL('http://localhost/api/sessions/' + sessionId + '/workflow/development-batch-agent-progress')
    const postProgress = () => handleSessionsApi(
      new Request(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
      url,
      ['api', 'sessions', sessionId, 'workflow', 'development-batch-agent-progress'],
    )

    const first = await postProgress()
    expect(first.status).toBe(200)
    const firstBody = await first.json() as {
      ok: boolean
      state: WorkflowSessionState
    }
    expect(firstBody.ok).toBe(true)
    expect(firstBody.state.runtimeContract?.phaseStates['delegate-implement']?.taskSnapshots).toEqual(expect.arrayContaining([
      expect.objectContaining({
        taskId: 'development-batch:B1:coder',
        batchId: 'B1',
        workflowRole: 'coder',
        status: 'running',
        agentId: 'coder-1',
      }),
      expect.objectContaining({
        taskId: 'development-batch:B1:reviewer',
        batchId: 'B1',
        workflowRole: 'reviewer',
        status: 'waiting_dependency',
      }),
    ]))

    const duplicate = await postProgress()
    expect(duplicate.status).toBe(200)
    expect(await duplicate.json()).toMatchObject({ ok: true, unchanged: true })
  })

  it('persists generic Coder and Reviewer task progress for the managed feature workflow', async () => {
    const configRoot = await makeTempRoot('sessions-api-workflow-agent-task-config-')
    const projectRoot = await makeTempRoot('sessions-api-workflow-agent-task-project-')
    process.env.CLAUDE_CONFIG_DIR = configRoot
    const { sessionId } = await sessionService.createSession(projectRoot)
    const phaseId = 'feature-implement'
    const now = '2026-09-17T08:00:00.000Z'
    const state: WorkflowSessionState = {
      schemaVersion: 1,
      sessionId,
      mode: 'workflow',
      template: { id: 'feature-extension-workflow-v8', version: '20', source: 'pack', snapshotId: 'snapshot', sourceState: 'current' },
      templateIdentity: { id: 'feature-extension-workflow-v8', source: 'pack', version: '20' },
      sourceTemplateStatus: 'current',
      status: 'running',
      workflowStatus: 'running',
      activePhaseId: phaseId,
      activeWorkflowRunId: 'run-1',
      workspaceRoot: projectRoot,
      phases: [{ id: phaseId, index: 0, status: 'running', artifactPointers: [] }],
      phaseRuns: [],
      transitionHistory: [],
      artifactIndex: [],
      finalReportRef: null,
      stateVersion: 1,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      runtimeContract: {
        schemaVersion: 1,
        migrationStatus: 'current',
        phaseStates: {
          [phaseId]: {
            phaseId,
            workStatus: 'in-progress',
            eligibility: 'ineligible',
            blockerReasons: [],
            issues: [],
            artifactRequirements: [],
            checks: [],
            taskSnapshots: [],
            evaluatedAt: now,
          },
        },
        audit: [],
      },
    } as WorkflowSessionState
    await sessionService.appendSessionMetadata(sessionId, {
      workDir: projectRoot,
      workflow: { mode: 'workflow' } as never,
    })
    await new WorkflowSessionStateService().writeState(sessionId, state)

    const url = new URL('http://localhost/api/sessions/' + sessionId + '/workflow/agent-task-progress')
    const response = await handleSessionsApi(new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        phaseId,
        batchId: 'B1',
        role: 'coder',
        plan: [{ id: 'B1', dependsOn: [], writeScopes: ['src/**'], resourceClaims: [], executionMode: 'write' }],
        status: 'running',
        agentRunId: 'agent-1',
        toolUseId: 'tool-1',
        recordedAt: now,
      }),
    }), url, ['api', 'sessions', sessionId, 'workflow', 'agent-task-progress'])

    expect(response.status).toBe(200)
    const payload = await response.json() as { state: WorkflowSessionState }
    expect(payload.state.runtimeContract?.phaseStates[phaseId]?.taskSnapshots).toEqual(expect.arrayContaining([
      expect.objectContaining({ taskId: 'B1::coder', status: 'running', agentRunId: 'agent-1', attempt: 1 }),
      expect.objectContaining({ taskId: 'B1::reviewer', status: 'waiting_dependency' }),
    ]))
  })

  it('projects reconciled workflow task state against refreshed metadata instead of fabricating a resumed transition', async () => {
    const configRoot = await makeTempRoot('sessions-api-workflow-reconcile-config-')
    const projectRoot = await makeTempRoot('sessions-api-workflow-reconcile-project-')
    process.env.CLAUDE_CONFIG_DIR = configRoot
    const { sessionId } = await sessionService.createSession(projectRoot)
    const phaseId = 'feature-implement'
    const recordedAt = '2026-09-17T00:00:00.000Z'
    const initial: WorkflowSessionState = {
      schemaVersion: 1,
      sessionId,
      mode: 'workflow',
      template: { id: 'feature-extension-workflow-v8', version: '20', source: 'pack', snapshotId: 'snapshot', sourceState: 'current' },
      templateIdentity: { id: 'feature-extension-workflow-v8', source: 'pack', version: '20' },
      sourceTemplateStatus: 'current',
      status: 'running',
      workflowStatus: 'running',
      activePhaseId: phaseId,
      activeWorkflowRunId: 'run-reconcile',
      workspaceRoot: projectRoot,
      phases: [{ id: phaseId, index: 0, status: 'running', artifactPointers: [] }],
      phaseRuns: [],
      transitionHistory: [],
      artifactIndex: [],
      finalReportRef: null,
      stateVersion: 1,
      revision: 1,
      createdAt: recordedAt,
      updatedAt: recordedAt,
      runtimeContract: {
        schemaVersion: 1,
        migrationStatus: 'current',
        phaseStates: {
          [phaseId]: {
            phaseId,
            workStatus: 'in-progress',
            eligibility: 'ineligible',
            blockerReasons: [],
            issues: [],
            artifactRequirements: [],
            checks: [],
            taskSnapshots: [],
            evaluatedAt: recordedAt,
          },
        },
        audit: [],
      },
    } as WorkflowSessionState
    const running = recordWorkflowAgentTaskProgress(initial, {
      phaseId,
      batchId: 'B1',
      role: 'coder',
      plan: [{ id: 'B1', dependsOn: [], writeScopes: ['src/**'], resourceClaims: [], executionMode: 'write' }],
      status: 'running',
      agentRunId: 'agent-' + crypto.randomUUID(),
      toolUseId: 'tool-reconcile',
      recordedAt,
    })
    const stateStore = new WorkflowSessionStateService()
    const { pointer } = await stateStore.writeState(sessionId, running)
    await sessionService.appendSessionMetadata(sessionId, {
      workDir: projectRoot,
      workflow: stateToWorkflowMetadata(running, pointer),
    })

    const url = new URL('http://localhost/api/sessions/' + sessionId + '/workflow')
    const response = await handleSessionsApi(new Request(url), url, ['api', 'sessions', sessionId, 'workflow'])

    expect(response.status).toBe(200)
    const payload = await response.json() as { state: WorkflowSessionState }
    expect(payload.state.status).toBe('running')
    expect(payload.state.activePhaseId).toBe(phaseId)
    expect(payload.state.runtimeContract?.phaseStates[phaseId]?.taskSnapshots
      .find(task => task.taskId === 'B1::coder')?.status).toBe('interrupted')
    expect(payload.state.transitionHistory.some(transition => transition.authority === 'resume')).toBe(false)
  })

  it('renders a structured template-fill payload through the real session HTTP route', async () => {
    const configRoot = await makeTempRoot('sessions-api-template-fill-config-')
    const projectRoot = await makeTempRoot('sessions-api-template-fill-project-')
    await installTemplateFillExpert(configRoot)
    const { sessionId } = await sessionService.createSession(projectRoot)
    await new ExpertSessionService().enterExpertMode(sessionId, 'sessions-api-template-fill-expert')

    const outputPath = path.join(projectRoot, 'server-owned-report.html')
    const url = new URL(`http://localhost/api/sessions/${sessionId}/expert/template-fill`)
    const response = await handleSessionsApi(
      new Request(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          outputPath,
          payload: {
            format: 'cc-jiangxia-expert-template-fill/v1',
            templateId: 'sessions-api-template-v1',
            fields: {
              REPORT_TITLE: 'Server-owned delivery',
              SOURCE_ROWS: [['[1]', 'https://example.com/source']],
            },
          },
        }),
      }),
      url,
      ['api', 'sessions', sessionId, 'expert', 'template-fill'],
    )

    expect(response.status).toBe(200)
    const rendered = await response.json() as { content: string; writeReceipt: string }
    const renderedHtml = rendered.content
    const receipt = rendered.writeReceipt
    expect(rendered).toMatchObject({
      templateId: 'sessions-api-template-v1',
      content: expect.stringContaining('<h1>Server-owned delivery</h1>'),
    })
    expect((await sessionService.getSession(sessionId))?.expert?.templateFillDelivery).toBeUndefined()
    await writeFile(outputPath, renderedHtml, 'utf8')
    const commitUrl = new URL(url.href + '-commit')
    const acknowledged = await handleSessionsApi(new Request(commitUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ receipt }) }), commitUrl, ['api', 'sessions', sessionId, 'expert', 'template-fill-commit'])
    expect(await acknowledged.json()).toEqual({ committed: true })
    const persisted = await sessionService.getSession(sessionId)
    expect((persisted?.expert as { templateFillDelivery?: unknown } | undefined)?.templateFillDelivery).toMatchObject({
      templateId: 'sessions-api-template-v1',
      reportPath: outputPath,
      finalizedAt: expect.any(String),
    })
  })

  it('returns repeated deterministic template errors through the HTTP route for continued correction', async () => {
    const configRoot = await makeTempRoot('sessions-api-template-retry-config-')
    const projectRoot = await makeTempRoot('sessions-api-template-retry-project-')
    await installTemplateFillExpert(configRoot)
    const { sessionId } = await sessionService.createSession(projectRoot)
    await new ExpertSessionService().enterExpertMode(sessionId, 'sessions-api-template-fill-expert')
    const url = new URL(`http://localhost/api/sessions/${sessionId}/expert/template-fill`)

    const submitInvalidPayload = (title: string) => handleSessionsApi(
      new Request(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          payload: {
            format: 'cc-jiangxia-expert-template-fill/v1',
            templateId: 'sessions-api-template-v1',
            fields: { REPORT_TITLE: title },
          },
        }),
      }),
      url,
      ['api', 'sessions', sessionId, 'expert', 'template-fill'],
    )

    const firstResponse = await submitInvalidPayload('First attempt')
    expect(firstResponse.status).toBe(400)
    expect(await firstResponse.json()).toMatchObject({ error: 'BAD_REQUEST' })

    const secondResponse = await submitInvalidPayload('Cosmetic title change only')
    expect(secondResponse.status).toBe(400)
    expect(await secondResponse.json()).toMatchObject({
      error: 'BAD_REQUEST',
    })
  })
})
