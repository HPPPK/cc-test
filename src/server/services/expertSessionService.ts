// 专家 Mode session service.
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { ApiError } from '../middleware/errorHandler.js'
import { sessionService } from './sessionService.js'
import { conversationService } from './conversationService.js'
import { ExpertPackRegistryService, ExpertPackValidationError, type ExpertIntakeState, type ExpertMaterialRef, type ExpertSessionMetadata } from './expertPackRegistryService.js'
import { ExpertRuntimeService } from './expertRuntimeService.js'
import { createExpertRuntimeBinding, hasActiveExpertRuntime } from './expertRuntimeBindingService.js'
import { renderExpertTemplateFill } from '../../utils/expertTemplateFill.js'
import { expertRuntimeSessionStore } from './expertRuntimeSessionStore.js'
import { hasAcceptedExpertResearchDelivery, resolveExpertResearchDeliveryDecision, type ExpertResearchDeliveryState } from './expertResearchDeliveryService.js'
import { resolveExpertResearchBrowserConnection, resolveExpertResearchBrowserPresentation } from './expertResearchBrowserPolicyService.js'
import { expertBrowserActivityService } from './expertBrowserActivityService.js'
import { evaluateExpertFinalSourceCoverage, evaluateExpertResearchCompletion, recordExpertResearchAudit, type ExpertResearchCompletionState } from './expertResearchCompletionService.js'

const registry = new ExpertPackRegistryService()
const runtime = new ExpertRuntimeService()

export type ExpertSubagentSkillContext = {
  expertId: string
  packId: string
  packVersion: string
  skills: Array<{
    skillId: string
    title: string
    path: string
    sha256: string
    content: string
  }>
}

export class ExpertSessionService {
  /**
   * Returns only package-declared Skill content for one delegated Expert agent.
   * It never exposes user materials, chat history, provider configuration, or
   * unrelated package skills. Omitted mappings deliberately return an empty
   * list so ordinary Experts keep their existing agent behaviour.
   */
  async getSubagentSkillContext(
    sessionId: string,
    agentType: string,
  ): Promise<ExpertSubagentSkillContext> {
    const normalizedAgentType = agentType.trim()
    if (!/^[a-z][a-z0-9-]{0,95}$/.test(normalizedAgentType)) {
      throw ApiError.badRequest('子代理类型无效。')
    }
    const session = await sessionService.getSession(sessionId)
    if (!session) throw ApiError.notFound(`Session not found: ${sessionId}`)
    const expert = hasActiveExpertRuntime(session.expert)
      ? session.expert
      : await expertRuntimeSessionStore.get(sessionId)
    if (!hasActiveExpertRuntime(expert)) {
      throw ApiError.badRequest('当前会话没有启用有效的 Expert Runtime。')
    }

    const skillIds = expert.runtimeBinding.subagentSkillIdsByAgentType?.[normalizedAgentType] ?? []
    const allowed = new Set(skillIds)
    return {
      expertId: expert.runtimeBinding.expertId,
      packId: expert.runtimeBinding.packId,
      packVersion: expert.runtimeBinding.packVersion,
      skills: expert.runtimeBinding.skills
        .filter((skill) => allowed.has(skill.skillId))
        .map((skill) => ({ ...skill })),
    }
  }


  async enterExpertMode(sessionId: string, expertId: string, researchBrowserConnectionInput?: unknown, researchBrowserPresentationInput?: unknown): Promise<ExpertSessionMetadata> {
    const session = await sessionService.getSession(sessionId)
    if (!session) throw ApiError.notFound(`Session not found: ${sessionId}`)
    const expert = await registry.getExpert(expertId)
    if (!expert) throw ApiError.notFound(`Expert not found: ${expertId}`)
    const now = new Date().toISOString()
    let runtimeContext
    try {
      runtimeContext = await runtime.loadContext(expert.id)
    } catch (error) {
      if (error instanceof ExpertPackValidationError) {
        throw new ApiError(400, error.message, 'EXPERT_PACK_INCOMPLETE')
      }
      throw error
    }
    const previousRefs = session.expert?.materialRefs ?? []
    const runtimeBinding = createExpertRuntimeBinding(runtimeContext, now)
    let researchBrowserConnection
    let researchBrowserPresentation
    try {
      researchBrowserConnection = resolveExpertResearchBrowserConnection(
        runtimeBinding.researchBrowserPolicy,
        researchBrowserConnectionInput,
        now,
      )
      researchBrowserPresentation = resolveExpertResearchBrowserPresentation(
        runtimeBinding.researchBrowserPolicy,
        researchBrowserConnection,
        researchBrowserPresentationInput,
      )
    } catch (error) {
      throw ApiError.badRequest(error instanceof Error ? error.message : String(error))
    }
    const metadata: ExpertSessionMetadata = {
      mode: 'expert',
      expertId: expert.id,
      expertName: expert.name,
      packId: expert.packId,
      packVersion: expert.packVersion,
      status: 'active',
      runtimeBinding,
      ...(researchBrowserConnection ? { researchBrowserConnection } : {}),
      ...(researchBrowserPresentation ? { researchBrowserPresentation } : {}),
      materialRefs: previousRefs,
      intakeState: session.expert?.expertId === expert.id ? session.expert.intakeState : initialIntakeState(now),
      startedAt: session.expert?.startedAt ?? now,
      updatedAt: now,
    }
    await expertRuntimeSessionStore.save(sessionId, metadata)
    await sessionService.appendSessionMetadata(sessionId, {
      workDir: session.workDir || session.projectRoot || session.projectPath,
      expert: metadata,
    })
    const persistedExpert = (await sessionService.getSession(sessionId))?.expert ?? await expertRuntimeSessionStore.get(sessionId)
    if (
      !persistedExpert ||
      persistedExpert.expertId !== metadata.expertId ||
      persistedExpert.status !== 'active' ||
      !hasActiveExpertRuntime(persistedExpert)
    ) {
      throw new ApiError(500, `Failed to persist Expert Mode for session: ${sessionId}`, 'EXPERT_MODE_PERSISTENCE_FAILED')
    }
    // This precise session may already be backed by a CLI with an ordinary
    // tool pool. The next turn must start a new CLI with the expert deny list.
    await conversationService.stopSessionAndWait(sessionId)
    return persistedExpert
  }

  async exitExpertMode(sessionId: string): Promise<ExpertSessionMetadata> {
    const session = await sessionService.getSession(sessionId)
    if (!session) throw ApiError.notFound(`Session not found: ${sessionId}`)
    if (!session.expert) throw ApiError.notFound(`Expert mode not active for session: ${sessionId}`)
    const now = new Date().toISOString()
    const {
      runtimeBinding: _runtimeBinding,
      researchBrowserConnection: _researchBrowserConnection,
      researchBrowserPresentation: _researchBrowserPresentation,
      ...retainedExpertMetadata
    } = session.expert
    const metadata: ExpertSessionMetadata = {
      ...retainedExpertMetadata,
      status: 'exited',
      updatedAt: now,
      exitedAt: now,
    }
    await sessionService.appendSessionMetadata(sessionId, {
      workDir: session.workDir || session.projectRoot || session.projectPath,
      expert: metadata,
    })
    await expertRuntimeSessionStore.remove(sessionId)
    expertBrowserActivityService.clear(sessionId)
    // Exit has to remove the prior expert deny list before normal chat resumes.
    await conversationService.stopSessionAndWait(sessionId)
    return metadata
  }

  async listMaterials(sessionId: string): Promise<{ materialRefs: ExpertMaterialRef[] }> {
    const session = await sessionService.getSession(sessionId)
    if (!session) throw ApiError.notFound(`Session not found: ${sessionId}`)
    return { materialRefs: session.expert?.materialRefs ?? [] }
  }

  async submitIntakeStep(sessionId: string, input: { stepId?: string; answer?: unknown; answers?: Record<string, unknown> }): Promise<{ expert: ExpertSessionMetadata; intakeState: ExpertIntakeState }> {
    const session = await sessionService.getSession(sessionId)
    if (!session) throw ApiError.notFound(`Session not found: ${sessionId}`)
    if (!session.expert) throw ApiError.badRequest('\u8bf7\u5148\u8fdb\u5165\u4e13\u5bb6 Mode\u3002')
    const now = new Date().toISOString()
    const previous = session.expert.intakeState ?? initialIntakeState(now)
    const answers = { ...previous.answers, ...(input.answers ?? {}) }
    const completedStepIds = new Set(previous.completedStepIds)
    if (input.stepId) {
      answers[input.stepId] = input.answer ?? input.answers?.[input.stepId] ?? answers[input.stepId]
      completedStepIds.add(input.stepId)
    }
    const intakeState: ExpertIntakeState = {
      currentStepId: input.stepId,
      answers,
      errors: {},
      completedStepIds: [...completedStepIds],
      updatedAt: now,
    }
    const metadata: ExpertSessionMetadata = {
      ...session.expert,
      status: 'collecting',
      intakeState,
      updatedAt: now,
      error: undefined,
    }
    await sessionService.appendSessionMetadata(sessionId, {
      workDir: session.workDir || session.projectRoot || session.projectPath,
      expert: metadata,
    })
    return { expert: metadata, intakeState }
  }

  async recordResearchDeliveryDecision(
    sessionId: string,
    input: { questionId: string; choiceIds: string[]; unresolvedEvidence?: string[] },
  ): Promise<{ expert: ExpertSessionMetadata; researchDelivery: ExpertResearchDeliveryState }> {
    const session = await sessionService.getSession(sessionId)
    if (!session) throw ApiError.notFound(`Session not found: ${sessionId}`)
    const expert = hasActiveExpertRuntime(session.expert)
      ? session.expert
      : await expertRuntimeSessionStore.get(sessionId)
    if (!hasActiveExpertRuntime(expert)) {
      throw ApiError.badRequest('当前会话没有启用可用的专家交付确认。请重新进入专家 Mode 后重试。')
    }

    const policy = expert.runtimeBinding.researchDeliveryPolicy
    if (!policy) {
      throw new ApiError(400, '当前专家没有声明研究交付确认规则，不能提交该确认。', 'EXPERT_RESEARCH_DELIVERY_NOT_CONFIGURED')
    }

    const now = new Date().toISOString()
    let researchDelivery: ExpertResearchDeliveryState
    try {
      researchDelivery = resolveExpertResearchDeliveryDecision(policy, {
        questionId: input.questionId,
        choiceIds: input.choiceIds,
        unresolvedEvidence: input.unresolvedEvidence,
        decidedAt: now,
      })
    } catch (error) {
      throw new ApiError(400, `研究交付确认无效：${error instanceof Error ? error.message : String(error)}`, 'EXPERT_RESEARCH_DELIVERY_INVALID')
    }

    // User-facing accept_current_scope is authoritative for allow-with-evidence-gaps
    // packs. Incomplete audits (Google VPN/CAPTCHA, partial subagents) stay in
    // unresolvedEvidence; they must not veto an explicit human acceptance.

    const metadata: ExpertSessionMetadata = {
      ...expert,
      researchDelivery,
      updatedAt: now,
      error: undefined,
    }
    await sessionService.appendSessionMetadata(sessionId, {
      workDir: session.workDir || session.projectRoot || session.projectPath,
      expert: metadata,
    })
    if (metadata.status === 'active') await expertRuntimeSessionStore.save(sessionId, metadata)
    return { expert: metadata, researchDelivery }
  }

  async recordResearchAudit(
    sessionId: string,
    input: { agentId: unknown; agentType: unknown; entries: unknown },
  ): Promise<{ expert: ExpertSessionMetadata; researchCompletion: ExpertResearchCompletionState }> {
    const session = await sessionService.getSession(sessionId)
    if (!session) throw ApiError.notFound(`Session not found: ${sessionId}`)
    const expert = hasActiveExpertRuntime(session.expert) ? session.expert : await expertRuntimeSessionStore.get(sessionId)
    if (!hasActiveExpertRuntime(expert)) throw ApiError.badRequest('当前会话没有启用可用的 Expert Runtime。')
    const policy = expert.runtimeBinding.researchCompletionPolicy
    if (!policy || !policy.trackedAgentTypes.includes(typeof input.agentType === 'string' ? input.agentType : '')) {
      return { expert, researchCompletion: expert.researchCompletion ?? { audits: [], updatedAt: new Date().toISOString() } }
    }
    const now = new Date().toISOString()
    let researchCompletion: ExpertResearchCompletionState
    try {
      researchCompletion = recordExpertResearchAudit(expert.researchCompletion, { ...input, recordedAt: now })
    } catch (error) {
      throw new ApiError(400, `研究浏览审计无效：${error instanceof Error ? error.message : String(error)}`, 'EXPERT_RESEARCH_AUDIT_INVALID')
    }
    const metadata: ExpertSessionMetadata = { ...expert, researchCompletion, updatedAt: now }
    await sessionService.appendSessionMetadata(sessionId, { workDir: session.workDir || session.projectRoot || session.projectPath, expert: metadata })
    await expertRuntimeSessionStore.save(sessionId, metadata)
    return { expert: metadata, researchCompletion }
  }

  async renderTemplateFill(sessionId: string, payload: unknown): Promise<{ content: string; templateId: string }> {
    const session = await sessionService.getSession(sessionId)
    if (!session) throw ApiError.notFound(`Session not found: ${sessionId}`)
    const expert = hasActiveExpertRuntime(session.expert)
      ? session.expert
      : await expertRuntimeSessionStore.get(sessionId)
    if (!hasActiveExpertRuntime(expert)) {
      throw ApiError.badRequest('当前会话没有启用可用的专家模板填充输出。请重新进入专家 Mode 后重试；不要改为手写 HTML、调用 Write 写 .html，或继续试探模板/服务器。')
    }
    const binding = expert.runtimeBinding
    if (binding.outputMode !== 'template-fill' || !binding.outputTemplate) {
      throw ApiError.badRequest('当前专家不使用模板填充输出；请按该专家自身的交付方式操作。')
    }

    if (binding.researchCompletionPolicy?.finalOutputBehavior === 'block') {
      const completion = evaluateExpertResearchCompletion(binding.researchCompletionPolicy, expert.researchCompletion)
      if (!completion.complete) {
        throw new ApiError(
          409,
          `当前专家的浏览调研尚未达到 ZIP 声明的完成条件：${completion.missing.join('；')}。请继续使用 Playwright 的具体页面取证；不要把搜索页、验证码页或失败调用写成已完成。`,
          'EXPERT_RESEARCH_COMPLETION_REQUIRED',
        )
      }
    }

    // For allow-with-evidence-gaps packs, an explicit user accept is enough to
    // render the evidence-limited report. Do not re-block on audit eligibility
    // after the user already chose accept_current_scope.

    if (binding.researchDeliveryPolicy && !hasAcceptedExpertResearchDelivery(expert.researchDelivery)) {
      throw new ApiError(
        409,
        '当前商业化调研尚未获得用户对剩余证据缺口和交付范围的确认。先继续完成仍可自行取得的公开证据；确实需要用户选择时，必须使用 AskUserQuestion 的 research-delivery 问题。用户选择“保留列出的证据缺口，交付当前范围报告”后，才能生成最终 HTML；在此之前不得宣布交付完成。',
        'EXPERT_RESEARCH_DELIVERY_DECISION_REQUIRED',
      )
    }

    const sourceCoverageFailure = evaluateExpertFinalSourceCoverage(binding.researchCompletionPolicy, payload)
    if (sourceCoverageFailure) {
      throw new ApiError(
        409,
        sourceCoverageFailure + ' 继续补充并核验具体公开页面，再把实际使用的来源逐条写入来源表；不要用“待验证”填满竞品、价格或渠道字段后直接交付。',
        'EXPERT_FINAL_SOURCE_COVERAGE_REQUIRED',
      )
    }
    try {
      const rendered = renderExpertTemplateFill(binding.outputTemplate.content, payload)
      return { content: rendered.content, templateId: rendered.schema.templateId }
    } catch (error) {
      throw ApiError.badRequest(`专家模板字段校验未通过：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async runExpertAgent(sessionId: string, input: { expertId?: string; projectRoot?: string; title?: string; notes?: string } = {}): Promise<{ expert: ExpertSessionMetadata; materialRef: ExpertMaterialRef }> {
    return this.writeMaterialPackage(sessionId, input)
  }

  async writePlaceholderMaterial(sessionId: string, input: { expertId?: string; projectRoot?: string; title?: string; notes?: string }): Promise<{ expert: ExpertSessionMetadata; materialRef: ExpertMaterialRef }> {
    return this.writeMaterialPackage(sessionId, input)
  }

  async writeMaterialPackage(sessionId: string, input: { expertId?: string; projectRoot?: string; title?: string; notes?: string }): Promise<{ expert: ExpertSessionMetadata; materialRef: ExpertMaterialRef }> {
    const session = await sessionService.getSession(sessionId)
    if (!session) throw ApiError.notFound(`Session not found: ${sessionId}`)
    const activeExpertId = input.expertId || session.expert?.expertId
    if (!activeExpertId) throw ApiError.badRequest('\u8bf7\u5148\u8fdb\u5165\u4e13\u5bb6 Mode\u3002')
    const expert = await registry.getExpert(activeExpertId)
    if (!expert) throw ApiError.notFound(`Expert not found: ${activeExpertId}`)

    const projectRoot = input.projectRoot || session.workDir || session.projectRoot || session.projectPath
    if (!projectRoot || typeof projectRoot !== 'string') throw ApiError.badRequest('\u7f3a\u5c11\u9879\u76ee\u76ee\u5f55\uff0c\u65e0\u6cd5\u5199\u5165\u4e13\u5bb6\u6750\u6599\u5305\u3002')
    const runId = createRunId()
    const outputDir = path.resolve(projectRoot, '.workflow', 'intake', 'expert-runs', runId, expert.id)
    const workflowRoot = path.resolve(projectRoot, '.workflow')
    if (!outputDir.startsWith(workflowRoot + path.sep)) throw ApiError.badRequest('\u4e13\u5bb6\u8f93\u51fa\u8def\u5f84\u4e0d\u5b89\u5168\u3002')
    await fs.mkdir(path.join(outputDir, 'logs'), { recursive: true })

    const now = new Date().toISOString()
    const runningExpert: ExpertSessionMetadata = {
      mode: 'expert',
      expertId: expert.id,
      expertName: expert.name,
      packId: expert.packId,
      packVersion: expert.packVersion,
      status: 'running',
      activeRunId: runId,
      runtimeBinding: session.expert?.runtimeBinding,
      intakeState: session.expert?.intakeState,
      materialRefs: session.expert?.materialRefs ?? [],
      startedAt: session.expert?.startedAt ?? now,
      updatedAt: now,
    }
    await sessionService.appendSessionMetadata(sessionId, {
      workDir: session.workDir || session.projectRoot || session.projectPath,
      expert: runningExpert,
    })

    try {
      const title = input.title?.trim() || `${expert.name}\u6750\u6599\u5305`
      const analysis = await runtime.analyze(expert.id, {
        projectRoot,
        title,
        notes: input.notes,
        runId,
        outputDir,
        intakeState: runningExpert.intakeState,
      })

      const finalSummary = analysis.summary
      const finalMaterial = analysis.material
      const finalEvidence = analysis.evidence
      const shortSummary = String(finalMaterial.summary || `\u5df2\u4e3a\u300c${expert.name}\u300d\u751f\u6210\u4e13\u5bb6\u6750\u6599\u5305\u3002`)
      const summaryPath = path.join(outputDir, 'material-summary.md')
      const materialJsonPath = path.join(outputDir, 'material.json')
      const evidencePath = path.join(outputDir, 'evidence.md')

      await fs.writeFile(summaryPath, finalSummary, 'utf-8')
      await fs.writeFile(materialJsonPath, `${JSON.stringify({
        ...finalMaterial,
        runId,
        outputDirectory: outputDir,
      }, null, 2)}\n`, 'utf-8')
      await fs.writeFile(evidencePath, finalEvidence, 'utf-8')

      const materialRef: ExpertMaterialRef = {
        runId,
        expertId: expert.id,
        expertName: expert.name,
        packId: expert.packId,
        packVersion: expert.packVersion,
        summaryPath,
        materialJsonPath,
        evidencePath,
        createdAt: now,
        title,
        shortSummary,
      }
      const previous = session.expert?.materialRefs ?? []
      const completedAt = new Date().toISOString()
      const nextExpert: ExpertSessionMetadata = {
        ...runningExpert,
        status: 'completed',
        materialRefs: [materialRef, ...previous.filter((ref) => ref.runId !== runId)],
        updatedAt: completedAt,
        completedAt,
        error: undefined,
      }
      await sessionService.appendSessionMetadata(sessionId, {
        workDir: session.workDir || session.projectRoot || session.projectPath,
        expert: nextExpert,
      })
      return { expert: nextExpert, materialRef }
    } catch (error) {
      const failedAt = new Date().toISOString()
      const nextExpert: ExpertSessionMetadata = {
        ...runningExpert,
        status: 'failed',
        updatedAt: failedAt,
        error: error instanceof Error ? error.message : String(error),
      }
      await sessionService.appendSessionMetadata(sessionId, {
        workDir: session.workDir || session.projectRoot || session.projectPath,
        expert: nextExpert,
      })
      throw error
    }
  }
}

function initialIntakeState(now: string): ExpertIntakeState {
  return { answers: {}, errors: {}, completedStepIds: [], updatedAt: now }
}

function createRunId(): string {
  const timestamp = new Date().toISOString().replace(/[-:.]/g, '').replace('T', '-').replace('Z', '')
  const suffix = Math.random().toString(36).slice(2, 8)
  return `expert-${timestamp}-${suffix}`
}


