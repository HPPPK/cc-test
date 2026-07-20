// 专家 Mode session service.
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { ApiError } from '../middleware/errorHandler.js'
import { sessionService } from './sessionService.js'
import { ExpertPackRegistryService, type ExpertIntakeState, type ExpertMaterialRef, type ExpertSessionMetadata } from './expertPackRegistryService.js'
import { ExpertRuntimeService } from './expertRuntimeService.js'
import { createExpertRuntimeBinding } from './expertRuntimeBindingService.js'

const registry = new ExpertPackRegistryService()
const runtime = new ExpertRuntimeService()

export class ExpertSessionService {
  async enterExpertMode(sessionId: string, expertId: string): Promise<ExpertSessionMetadata> {
    const session = await sessionService.getSession(sessionId)
    if (!session) throw ApiError.notFound(`Session not found: ${sessionId}`)
    const expert = await registry.getExpert(expertId)
    if (!expert) throw ApiError.notFound(`Expert not found: ${expertId}`)
    const now = new Date().toISOString()
    const runtimeContext = await runtime.loadContext(expert.id)
    const previousRefs = session.expert?.materialRefs ?? []
    const metadata: ExpertSessionMetadata = {
      mode: 'expert',
      expertId: expert.id,
      expertName: expert.name,
      packId: expert.packId,
      packVersion: expert.packVersion,
      status: 'active',
      runtimeBinding: createExpertRuntimeBinding(runtimeContext, now),
      materialRefs: previousRefs,
      intakeState: session.expert?.expertId === expert.id ? session.expert.intakeState : initialIntakeState(now),
      startedAt: session.expert?.startedAt ?? now,
      updatedAt: now,
    }
    await sessionService.appendSessionMetadata(sessionId, {
      workDir: session.workDir || session.projectRoot || session.projectPath,
      expert: metadata,
    })
    return metadata
  }

  async exitExpertMode(sessionId: string): Promise<ExpertSessionMetadata> {
    const session = await sessionService.getSession(sessionId)
    if (!session) throw ApiError.notFound(`Session not found: ${sessionId}`)
    if (!session.expert) throw ApiError.notFound(`Expert mode not active for session: ${sessionId}`)
    const now = new Date().toISOString()
    const { runtimeBinding: _runtimeBinding, ...retainedExpertMetadata } = session.expert
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


