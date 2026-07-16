/**
 * Session REST API Routes
 *
 * 提供会话的 CRUD 操作接口，数据来自 CLI 共享的 JSONL 文件。
 *
 * Routes:
 *   GET    /api/sessions            — 列出会话
 *   GET    /api/sessions/:id        — 获取会话详情
 *   GET    /api/sessions/:id/messages — 获取会话消息
 *   GET    /api/sessions/:id/turn-checkpoints — 获取按轮次保留的 checkpoint 预览
 *   GET    /api/sessions/:id/turn-checkpoints/diff — 获取绑定到指定 checkpoint 的 diff
 *   GET    /api/sessions/:id/workflow/checkpoints — 获取 workflow git checkpoint 列表
 *   POST   /api/sessions/:id/workflow/checkpoints — 创建 workflow git checkpoint
 *   POST   /api/sessions/:id/workflow/checkpoints/restore — 回退到 workflow git checkpoint
 *   POST   /api/sessions            — 创建新会话
 *   POST   /api/sessions/batch-delete — 批量删除会话
 *   DELETE /api/sessions/:id        — 删除会话
 *   PATCH  /api/sessions/:id        — 重命名会话
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { sessionService } from '../services/sessionService.js'
import { conversationService } from '../services/conversationService.js'
import { ApiError, errorResponse } from '../middleware/errorHandler.js'
import {
  closeSessionConnection,
  getSlashCommands,
  sendToSession,
  workflowNotificationForDesktop,
} from '../ws/handler.js'
import { listSkillSlashCommands, type SkillSlashCommand } from './skills.js'
import { WorkspaceService } from '../services/workspaceService.js'
import {
  getRepositoryContext,
  type CreateSessionRepositoryOptions,
} from '../services/repositoryLaunchService.js'
import { WorkflowSessionStateService } from '../services/workflowSessionStateService.js'
import { WorkflowSessionCreateService } from '../services/workflowSessionCreateService.js'
import { WorkflowSessionLinkService } from '../services/workflowSessionLinkService.js'
import { validateWorkflowWorkspaceRoot } from '../services/workflowWorkspacePolicy.js'
import { WorkflowReportStore } from '../services/workflowReportStore.js'
import { WorkflowRuntimeService } from '../services/workflowRuntimeService.js'
import { WorkflowPreviewService } from '../services/workflowPreviewService.js'
import { buildWorkflowFinalReport } from '../services/workflowFinalReport.js'
import {
  createWorkflowGitCheckpoint,
  listWorkflowGitCheckpoints,
  restoreWorkflowGitCheckpoint,
} from '../services/workflowGitCheckpointService.js'
import {
  createFollowUpWorkflowRun,
  selectFollowUpWorkflowTemplate,
  type WorkflowFollowUpRunKind,
} from '../services/workflowRuntimeEnforcement.js'
import {
  type CompletionSubmission,
  type WorkflowSessionCreateOptions,
  type WorkflowSessionMetadata,
  type WorkflowSessionState,
  type WorkflowSessionSummary,
  type WorkflowTemplate,
  type WorkflowTemplateSource,
  type WorkflowTransitionRecord,
  type WorkflowTransitionRequest,
} from '../services/workflowTypes.js'
import {
  WorkflowTemplateRegistryService,
} from '../services/workflowTemplateRegistryService.js'
import {
  stateToWorkflowMetadata,
  workflowSummaryFromState,
} from '../services/workflowSummary.js'
import {
  executeSessionRewind,
  getSessionTurnCheckpointDiff,
  listSessionTurnCheckpoints,
  previewSessionRewind,
  type RewindTargetSelector,
} from '../services/sessionRewindService.js'
import { SessionStore } from '../../../adapters/common/session-store.js'
import { getSessionChatState, setSessionChatState } from './conversations.js'
import { ExpertSessionService } from '../services/expertSessionService.js'
import { resetTaskList } from '../../utils/tasks.js'

const workspaceService = new WorkspaceService(
  async (sessionId) => (
    conversationService.getSessionWorkDir(sessionId) ||
    await sessionService.getSessionWorkDir(sessionId)
  ),
  async (sessionId) => sessionService.getSessionMessages(sessionId),
  async (sessionId) => sessionService.getSessionFileHistorySnapshots(sessionId),
)
const workflowTemplateRegistryService = new WorkflowTemplateRegistryService()
const workflowSessionStateService = new WorkflowSessionStateService()
const workflowSessionCreateService = new WorkflowSessionCreateService({
  registryService: workflowTemplateRegistryService,
  stateService: workflowSessionStateService,
})
const workflowSessionLinkService = new WorkflowSessionLinkService({
  createService: workflowSessionCreateService,
  stateService: workflowSessionStateService,
  isSourceActive: (sessionId) => getSessionChatState(sessionId) !== 'idle',
})
const workflowReportStore = new WorkflowReportStore()
const workflowRuntimeService = new WorkflowRuntimeService()
const workflowPreviewService = new WorkflowPreviewService()
const expertSessionService = new ExpertSessionService()

const workflowTransitionPromises = new Map<string, Promise<unknown>>()

class WorkflowApiError extends ApiError {
  constructor(statusCode: number, code: string, message: string) {
    super(statusCode, message, code)
  }
}

export async function handleSessionsApi(
  req: Request,
  url: URL,
  segments: string[]
): Promise<Response> {
  try {
    // segments: ['api', 'sessions', ...rest]
    const sessionId = segments[2] // may be undefined
    const subResource = segments[3] // e.g. 'messages'

    // -----------------------------------------------------------------------
    // Collection routes: /api/sessions
    // -----------------------------------------------------------------------
    if (!sessionId) {
      switch (req.method) {
        case 'GET':
          return await listSessions(url)
        case 'POST':
          return await createSession(req)
        default:
          return Response.json(
            { error: 'METHOD_NOT_ALLOWED', message: `Method ${req.method} not allowed` },
            { status: 405 }
          )
      }
    }

    // Special collection route: /api/sessions/batch-delete
    if (sessionId === 'batch-delete') {
      if (req.method !== 'POST') {
        return Response.json(
          { error: 'METHOD_NOT_ALLOWED', message: `Method ${req.method} not allowed` },
          { status: 405 }
        )
      }
      return await batchDeleteSessions(req)
    }

    // Special collection route: /api/sessions/recent-projects
    if (sessionId === 'recent-projects' && req.method === 'GET') {
      return await getRecentProjects(url)
    }

    // Special collection route: /api/sessions/repository-context
    if (sessionId === 'repository-context' && req.method === 'GET') {
      return await getSessionRepositoryContext(url)
    }

    // -----------------------------------------------------------------------
    // Sub-resource routes: /api/sessions/:id/messages
    // -----------------------------------------------------------------------
    if (subResource === 'messages') {
      if (req.method !== 'GET') {
        return Response.json(
          { error: 'METHOD_NOT_ALLOWED', message: `Method ${req.method} not allowed` },
          { status: 405 }
        )
      }
      return await getSessionMessages(sessionId)
    }

    if (subResource === 'git-info') {
      if (req.method !== 'GET') {
        return Response.json(
          { error: 'METHOD_NOT_ALLOWED', message: `Method ${req.method} not allowed` },
          { status: 405 }
        )
      }
      return await getGitInfo(sessionId)
    }

    if (subResource === 'rewind') {
      if (req.method !== 'POST') {
        return Response.json(
          { error: 'METHOD_NOT_ALLOWED', message: `Method ${req.method} not allowed` },
          { status: 405 }
        )
      }
      return await rewindSession(req, sessionId)
    }

    if (subResource === 'turn-checkpoints') {
      if (req.method !== 'GET') {
        return Response.json(
          { error: 'METHOD_NOT_ALLOWED', message: `Method ${req.method} not allowed` },
          { status: 405 }
        )
      }
      return segments[4] === 'diff'
        ? await getTurnCheckpointDiff(sessionId, url)
        : await getTurnCheckpoints(sessionId)
    }

    if (subResource === 'slash-commands') {
      if (req.method !== 'GET') {
        return Response.json(
          { error: 'METHOD_NOT_ALLOWED', message: `Method ${req.method} not allowed` },
          { status: 405 }
        )
      }
      return await getSessionSlashCommands(sessionId)
    }

    if (subResource === 'inspection') {
      if (req.method !== 'GET') {
        return Response.json(
          { error: 'METHOD_NOT_ALLOWED', message: `Method ${req.method} not allowed` },
          { status: 405 }
        )
      }
      return await getSessionInspection(sessionId, url)
    }

    if (subResource === 'workspace') {
      if (req.method !== 'GET') {
        return Response.json(
          { error: 'METHOD_NOT_ALLOWED', message: `Method ${req.method} not allowed` },
          { status: 405 }
        )
      }
      return await handleSessionWorkspaceRoute(sessionId, url, segments[4])
    }

    if (subResource === 'workflow') {
      return await handleWorkflowSessionRoute(req, sessionId, segments[4], segments[5])
    }

    if (subResource === 'expert') {
      return await handleSessionExpertRoute(req, sessionId, segments[4], segments[5], segments[6])
    }

    // Route to conversations handler if sub-resource is 'chat'
    if (subResource === 'chat') {
      // This is handled by the conversations API, but in case the router
      // forwards it here, we delegate to the conversations module.
      // Normally the router should route /api/sessions/:id/chat/* to conversations.
      return Response.json(
        { error: 'NOT_FOUND', message: 'Use /api/sessions/:id/chat via conversations API' },
        { status: 404 }
      )
    }

    // -----------------------------------------------------------------------
    // Item routes: /api/sessions/:id
    // -----------------------------------------------------------------------
    switch (req.method) {
      case 'GET':
        return await getSession(sessionId)
      case 'DELETE':
        return await deleteSession(sessionId)
      case 'PATCH':
        return await patchSession(req, sessionId)
      default:
        return Response.json(
          { error: 'METHOD_NOT_ALLOWED', message: `Method ${req.method} not allowed` },
          { status: 405 }
        )
    }
  } catch (error) {
    return errorResponse(error)
  }
}

// ============================================================================
// Handler implementations
// ============================================================================

async function listSessions(url: URL): Promise<Response> {
  const project = url.searchParams.get('project') || undefined
  const limit = parseInt(url.searchParams.get('limit') || '20', 10)
  const offset = parseInt(url.searchParams.get('offset') || '0', 10)

  if (isNaN(limit) || limit < 0) {
    throw ApiError.badRequest('Invalid limit parameter')
  }
  if (isNaN(offset) || offset < 0) {
    throw ApiError.badRequest('Invalid offset parameter')
  }

  const result = await sessionService.listSessions({ project, limit, offset })
  return Response.json(result)
}

async function getSession(sessionId: string): Promise<Response> {
  const detail = await sessionService.getSession(sessionId)
  if (!detail) {
    throw ApiError.notFound(`Session not found: ${sessionId}`)
  }
  return Response.json(detail)
}

async function getSessionMessages(sessionId: string): Promise<Response> {
  const [messages, taskNotifications] = await Promise.all([
    sessionService.getSessionMessages(sessionId),
    sessionService.getSessionTaskNotifications(sessionId),
  ])
  return Response.json({ messages, taskNotifications })
}

async function handleSessionWorkspaceRoute(
  sessionId: string,
  url: URL,
  workspaceResource?: string,
): Promise<Response> {
  await requireSessionWorkspace(sessionId)

  switch (workspaceResource) {
    case 'status':
      return Response.json(await workspaceService.getStatus(sessionId))
    case 'tree':
      return await runWorkspaceRequest(() => workspaceService.readTree(
        sessionId,
        url.searchParams.get('path') || '',
      ))
    case 'file':
      return await runWorkspaceRequest(() => workspaceService.readFile(
        sessionId,
        requireWorkspacePath(url, 'file'),
      ))
    case 'diff':
      return await runWorkspaceDiffRequest(() => workspaceService.getDiff(
        sessionId,
        requireWorkspacePath(url, 'diff'),
      ))
    default:
      throw ApiError.notFound(`Unknown workspace resource: ${workspaceResource || 'workspace'}`)
  }
}

async function createSession(req: Request): Promise<Response> {
  let body: {
    workDir?: string
    repository?: CreateSessionRepositoryOptions
    workflow?: WorkflowSessionCreateOptions
  }
  try {
    body = (await req.json()) as {
      workDir?: string
      repository?: CreateSessionRepositoryOptions
      workflow?: WorkflowSessionCreateOptions
    }
  } catch {
    throw ApiError.badRequest('Invalid JSON body')
  }

  if (body.workDir && typeof body.workDir !== 'string') {
    throw ApiError.badRequest('workDir must be a string')
  }

  if (body.repository !== undefined) {
    if (!body.repository || typeof body.repository !== 'object' || Array.isArray(body.repository)) {
      throw ApiError.badRequest('repository must be an object')
    }
    if (body.repository.branch !== undefined && body.repository.branch !== null && typeof body.repository.branch !== 'string') {
      throw ApiError.badRequest('repository.branch must be a string')
    }
    if (body.repository.worktree !== undefined && typeof body.repository.worktree !== 'boolean') {
      throw ApiError.badRequest('repository.worktree must be a boolean')
    }
  }

  const workflowTemplate = body.workflow === undefined
    ? null
    : await workflowSessionCreateService.resolveTemplate(body.workflow)
  if (workflowTemplate) {
    const workspaceValidation = validateWorkflowWorkspaceRoot(body.workDir)
    if (!workspaceValidation.valid) {
      throw new ApiError(400, workspaceValidation.message, 'WORKFLOW_WORKSPACE_INVALID')
    }
  }
  const result = await sessionService.createSession(body.workDir, body.repository)
  let response: { sessionId: string; workDir: string; workflow?: WorkflowSessionSummary } = result

  if (workflowTemplate) {
    response = {
      ...result,
      workflow: await workflowSessionCreateService.createWorkflowSessionMetadata(
        result.sessionId,
        result.workDir,
        workflowTemplate,
        body.workflow,
      ),
    }
  }

  recentProjectsCache = null
  return Response.json(response, { status: 201 })
}

async function getSessionRepositoryContext(url: URL): Promise<Response> {
  const workDir = url.searchParams.get('workDir')
  if (!workDir) {
    throw ApiError.badRequest('workDir query parameter is required')
  }

  return Response.json(await getRepositoryContext(workDir))
}

export async function handleWorkflowTemplatesApi(req: Request): Promise<Response> {
  try {
    if (req.method !== 'GET') {
      return Response.json(
        { error: 'METHOD_NOT_ALLOWED', message: `Method ${req.method} not allowed` },
        { status: 405 },
      )
    }

    const registry = await workflowTemplateRegistryService.listTemplates()
    return Response.json({
      templates: registry.templates.map((template) => ({
        id: template.id,
        source: template.source,
        version: template.version,
        name: template.name,
        description: template.description,
        labels: template.labels,
        phaseCount: template.phases.length,
        firstPhaseId: template.phases[0]?.id ?? null,
        phaseNames: template.phases.map((phase) => phase.name),
      })),
      invalidTemplates: registry.invalidTemplates,
    })
  } catch (error) {
    return errorResponse(error)
  }
}


async function handleSessionExpertRoute(
  req: Request,
  sessionId: string,
  action?: string,
  subAction?: string,
  subSubAction?: string,
): Promise<Response> {
  if (action === 'materials') {
    if (req.method !== 'GET') throw new ApiError(405, `Method ${req.method} not allowed`, 'METHOD_NOT_ALLOWED')
    // 材料包下载：GET /api/sessions/:id/expert/materials/:runId/download
    if (subAction && subSubAction === 'download') {
      return await downloadExpertMaterialPackage(sessionId, subAction)
    }
    return Response.json(await expertSessionService.listMaterials(sessionId))
  }
  if (action === 'start') {
    if (req.method !== 'POST') throw new ApiError(405, `Method ${req.method} not allowed`, 'METHOD_NOT_ALLOWED')
    const body = await readOptionalObjectBody(req)
    const expertId = typeof body.expertId === 'string' ? body.expertId : ''
    if (!expertId) throw ApiError.badRequest('请选择一个专家。')
    return Response.json({ expert: await expertSessionService.enterExpertMode(sessionId, expertId) })
  }
  if (action === 'intake') {
    if (req.method !== 'POST') throw new ApiError(405, `Method ${req.method} not allowed`, 'METHOD_NOT_ALLOWED')
    const body = await readOptionalObjectBody(req)
    return Response.json(await expertSessionService.submitIntakeStep(sessionId, {
      stepId: typeof body.stepId === 'string' ? body.stepId : undefined,
      answer: body.answer,
      answers: body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers) ? body.answers as Record<string, unknown> : undefined,
    }))
  }
  if (action === 'run') {
    if (req.method !== 'POST') throw new ApiError(405, `Method ${req.method} not allowed`, 'METHOD_NOT_ALLOWED')
    const body = await readOptionalObjectBody(req)

    // 检查是否是流式请求（通过 Accept 头）
    const isStreaming = req.headers.get('Accept')?.includes('text/event-stream')

    if (isStreaming) {
      // 返回 SSE 流式响应（包含进度事件）
      const encoder = new TextEncoder()
      const enqueue = (c: ReadableStreamDefaultController<Uint8Array>, data: unknown) => {
        c.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            const result = await expertSessionService.runExpertAgent(
              sessionId,
              {
                expertId: typeof body.expertId === 'string' ? body.expertId : undefined,
                projectRoot: typeof body.projectRoot === 'string' ? body.projectRoot : undefined,
                title: typeof body.title === 'string' ? body.title : undefined,
                notes: typeof body.notes === 'string' ? body.notes : undefined,
              },
              (progress) => {
                enqueue(controller, { type: 'progress', phase: progress.phase, content: progress.content })
              },
            )

            enqueue(controller, { type: 'complete', data: result })
            console.log('[Expert SSE] 发送 complete 事件')
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : '分析失败'
            enqueue(controller, { type: 'error', error: errorMsg })
            console.error('[Expert SSE] 发送 error 事件:', errorMsg)
          }
          controller.close()
        },
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      })
    }

    // 普通的非流式请求
    return Response.json(await expertSessionService.runExpertAgent(sessionId, {
      expertId: typeof body.expertId === 'string' ? body.expertId : undefined,
      projectRoot: typeof body.projectRoot === 'string' ? body.projectRoot : undefined,
      title: typeof body.title === 'string' ? body.title : undefined,
      notes: typeof body.notes === 'string' ? body.notes : undefined,
    }))
  }
  if (action === 'exit') {
    if (req.method !== 'POST') throw new ApiError(405, `Method ${req.method} not allowed`, 'METHOD_NOT_ALLOWED')
    const current = await sessionService.getSession(sessionId)
    if (!current) throw ApiError.notFound(`Session not found: ${sessionId}`)
    if (!current.expert) throw ApiError.notFound(`Expert mode not active for session: ${sessionId}`)
    await conversationService.stopSessionAndWait(sessionId)
    setSessionChatState(sessionId, 'idle')
    await resetTaskList(sessionId)
    return Response.json({ expert: await expertSessionService.exitExpertMode(sessionId) })
  }
  throw ApiError.notFound(`Unknown session expert resource: ${action || 'expert'}`)
}

async function handleWorkflowSessionRoute(
  req: Request,
  sessionId: string,
  workflowResource?: string,
  workflowAction?: string,
): Promise<Response> {
  switch (workflowResource) {
    case undefined:
      if (req.method !== 'GET') return methodNotAllowed(req.method)
      return await getWorkflowState(sessionId)
    case 'transition':
      if (req.method !== 'POST') return methodNotAllowed(req.method)
      return await transitionWorkflow(req, sessionId)
    case 'start':
      if (req.method !== 'POST') return methodNotAllowed(req.method)
      return await startLinkedWorkflow(req, sessionId)
    case 'context-summary':
      if (req.method !== 'POST') return methodNotAllowed(req.method)
      return await previewLinkedWorkflowContext(req, sessionId)
    case 'follow-up':
      if (req.method !== 'POST') return methodNotAllowed(req.method)
      return await startFollowUpWorkflowRun(req, sessionId)
    case 'exit':
      if (req.method !== 'POST') return methodNotAllowed(req.method)
      return await exitWorkflow(req, sessionId)
    case 'preview':
      if (req.method !== 'POST') return methodNotAllowed(req.method)
      return await controlWorkflowPreview(req, sessionId, workflowAction)
    case 'checkpoints':
      return await handleWorkflowGitCheckpoints(req, sessionId, workflowAction)
    case 'report':
      if (req.method !== 'GET') return methodNotAllowed(req.method)
      return await getWorkflowReport(sessionId)
    default:
      throw ApiError.notFound(`Unknown workflow resource: ${workflowResource}`)
  }
}

async function handleWorkflowGitCheckpoints(
  req: Request,
  sessionId: string,
  action?: string,
): Promise<Response> {
  await requireWorkflowSession(sessionId)
  const workDir = await requireSessionWorkspace(
    sessionId,
    'Workflow checkpoints require a project workspace. Select the repository or app folder before saving checkpoints.',
    'WORKFLOW_CHECKPOINT_WORKSPACE_REQUIRED',
  )
  const workspaceValidation = validateWorkflowWorkspaceRoot(workDir)
  if (!workspaceValidation.valid) {
    if (req.method === 'GET' && !action) {
      return Response.json({
        enabled: false,
        reason: workspaceValidation.message,
        latestVersion: null,
        checkpoints: [],
      })
    }
    throw workflowError(400, 'WORKFLOW_CHECKPOINT_WORKSPACE_REQUIRED', workspaceValidation.message)
  }

  if (req.method === 'GET' && !action) {
    return Response.json(await listWorkflowGitCheckpoints(sessionId, workDir))
  }

  if (req.method === 'POST' && !action) {
    const body = await readOptionalObjectBody(req)
    try {
      const [stateResult, messages] = await Promise.all([
        workflowSessionStateService.readState(sessionId),
        sessionService.getSessionMessages(sessionId),
      ])
      const lastMessage = messages[messages.length - 1]
      return Response.json(await createWorkflowGitCheckpoint(sessionId, workDir, {
        ...body,
        workflowStateSnapshot: stateResult.state,
        transcriptSnapshot: {
          messageCount: messages.length,
          lastMessageId: lastMessage?.id ?? null,
        },
      }))
    } catch (error) {
      throw workflowError(400, 'WORKFLOW_CHECKPOINT_INVALID', error instanceof Error ? error.message : 'Workflow checkpoint could not be created')
    }
  }

  if (req.method === 'POST' && action === 'restore') {
    const body = await readOptionalObjectBody(req)
    try {
      await conversationService.stopSessionAndWait(sessionId)
      setSessionChatState(sessionId, 'idle')
      const restored = await restoreWorkflowGitCheckpoint(sessionId, workDir, body as { checkpointId: string })
      let workflow: WorkflowSessionSummary | undefined
      if (restored.workflowStateSnapshot) {
        const current = await workflowSessionStateService.readState(sessionId)
        const now = new Date().toISOString()
        const restoredState = workflowStateAfterCheckpointRestore({
          snapshot: restored.workflowStateSnapshot,
          current: current.state,
          checkpointId: restored.checkpoint.id,
          checkpointVersion: restored.checkpoint.version,
          checkpointLabel: restored.checkpoint.label,
          removedFiles: restored.removedFiles,
          restoredAt: now,
        })
        const written = await workflowSessionStateService.writeState(sessionId, restoredState)
        workflow = workflowSummaryFromState(written.state)
      }
      const transcriptTrim = restored.transcriptSnapshot
        ? await sessionService.trimSessionMessagesAfterCount(
          sessionId,
          restored.transcriptSnapshot.messageCount,
        )
        : { removedCount: 0, removedMessageIds: [] }
      const {
        workflowStateSnapshot: _workflowStateSnapshot,
        transcriptSnapshot: _transcriptSnapshot,
        ...publicRestored
      } = restored
      return Response.json({
        ...publicRestored,
        transcriptRestored: Boolean(restored.transcriptSnapshot),
        conversation: {
          messagesRemoved: transcriptTrim.removedCount,
          removedMessageIds: transcriptTrim.removedMessageIds,
        },
        ...(workflow ? { workflow } : {}),
      })
    } catch (error) {
      throw workflowError(400, 'WORKFLOW_CHECKPOINT_INVALID', error instanceof Error ? error.message : 'Workflow checkpoint could not be restored')
    }
  }

  if (action) throw ApiError.notFound(`Unknown workflow checkpoint action: ${action}`)
  return methodNotAllowed(req.method)
}

async function downloadExpertMaterialPackage(
  sessionId: string,
  runId: string,
): Promise<Response> {
  const materials = await expertSessionService.listMaterials(sessionId)
  const material = materials.materialRefs.find((ref) => ref.runId === runId)
  if (!material) throw ApiError.notFound(`Material run not found: ${runId}`)

  const session = await sessionService.getSession(sessionId)
  if (!session) throw ApiError.notFound(`Session not found: ${sessionId}`)
  const projectRoot = session.workDir || session.projectRoot || session.projectPath
  if (!projectRoot) throw ApiError.badRequest('缺少项目目录，无法读取材料包。')

  // 材料文件所在目录
  const materialDir = path.dirname(material.materialJsonPath)
  if (!materialDir.startsWith(path.resolve(projectRoot, '.workflow'))) {
    throw ApiError.badRequest('材料路径不安全。')
  }

  // 读取目录中所有文件打包为 ZIP
  const zipParts: Array<{ name: string; data: Uint8Array }> = []
  try {
    const entries = await fs.readdir(materialDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isFile()) continue
      const filePath = path.join(materialDir, entry.name)
      const data = await fs.readFile(filePath)
      zipParts.push({ name: entry.name, data: new Uint8Array(data) })
    }
  } catch {
    throw ApiError.notFound('材料文件不可用。')
  }

  // 简单 ZIP 打包（使用 Bun 原生支持）
  const zipBuffer = await createZipBuffer(zipParts)
  const filename = `expert-material-${runId.slice(0, 8)}.zip`

  return new Response(zipBuffer, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

async function createZipBuffer(files: Array<{ name: string; data: Uint8Array }>): Promise<Uint8Array> {
  // 使用 Bun 的 gzip 或其他方式... Bun 没有内置 zip，手动实现简单 ZIP
  const chunks: Uint8Array[] = []
  const encoder = new TextEncoder()
  const fileEntries: Array<{ name: Uint8Array; data: Uint8Array; crc: number }> = []

  // 计算各文件的偏移
  for (const file of files) {
    const nameBytes = encoder.encode(file.name)
    let crc = 0
    for (const b of file.data) {
      crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ b) & 0xff]
    }
    crc = (crc ^ 0xffffffff) >>> 0
    fileEntries.push({ name: nameBytes, data: file.data, crc })
  }

  // 写入各文件
  const centralDir: Uint8Array[] = []
  let offset = 0

  for (const entry of fileEntries) {
    const localHeader = createLocalFileHeader(entry)
    chunks.push(localHeader)
    chunks.push(entry.data)
    const centralEntry = createCentralDirEntry(entry, offset)
    centralDir.push(centralEntry)
    offset += localHeader.length + entry.data.length
  }

  const centralDirBytes = concatUint8Arrays(centralDir)
  chunks.push(centralDirBytes)
  chunks.push(createEndOfCentralDir(fileEntries.length, centralDirBytes.length, offset))

  return concatUint8Arrays(chunks)
}

function createLocalFileHeader(entry: { name: Uint8Array; data: Uint8Array; crc: number }): Uint8Array {
  const buf = new ArrayBuffer(30 + entry.name.length)
  const view = new DataView(buf)
  let pos = 0
  const arr = new Uint8Array(buf)
  setU32LE(arr, pos, 0x04034b50); pos += 4 // signature
  setU16LE(arr, pos, 20); pos += 2 // version needed
  setU16LE(arr, pos, 0); pos += 2 // flags
  setU16LE(arr, pos, 0); pos += 2 // compression (stored)
  setU16LE(arr, pos, 0); pos += 2 // mod time
  setU16LE(arr, pos, 0); pos += 2 // mod date
  setU32LE(arr, pos, entry.crc); pos += 4 // crc32
  setU32LE(arr, pos, entry.data.length); pos += 4 // compressed size
  setU32LE(arr, pos, entry.data.length); pos += 4 // uncompressed size
  setU16LE(arr, pos, entry.name.length); pos += 2 // filename length
  setU16LE(arr, pos, 0); pos += 2 // extra field length
  arr.set(entry.name, pos)
  return arr
}

function createCentralDirEntry(entry: { name: Uint8Array; data: Uint8Array; crc: number }, offset: number): Uint8Array {
  const buf = new ArrayBuffer(46 + entry.name.length)
  const arr = new Uint8Array(buf)
  let pos = 0
  setU32LE(arr, pos, 0x02014b50); pos += 4 // signature
  setU16LE(arr, pos, 20); pos += 2 // version made by
  setU16LE(arr, pos, 20); pos += 2 // version needed
  setU16LE(arr, pos, 0); pos += 2 // flags
  setU16LE(arr, pos, 0); pos += 2 // compression
  setU16LE(arr, pos, 0); pos += 2 // mod time
  setU16LE(arr, pos, 0); pos += 2 // mod date
  setU32LE(arr, pos, entry.crc); pos += 4 // crc32
  setU32LE(arr, pos, entry.data.length); pos += 4 // compressed size
  setU32LE(arr, pos, entry.data.length); pos += 4 // uncompressed size
  setU16LE(arr, pos, entry.name.length); pos += 2 // filename length
  setU16LE(arr, pos, 0); pos += 2 // extra field length
  setU16LE(arr, pos, 0); pos += 2 // file comment length
  setU16LE(arr, pos, 0); pos += 2 // disk number start
  setU16LE(arr, pos, 0); pos += 2 // internal file attrs
  setU32LE(arr, pos, 0); pos += 4 // external file attrs
  setU32LE(arr, pos, offset); pos += 4 // relative offset
  arr.set(entry.name, pos)
  return arr
}

function createEndOfCentralDir(fileCount: number, centralDirSize: number, centralDirOffset: number): Uint8Array {
  const buf = new ArrayBuffer(22)
  const arr = new Uint8Array(buf)
  let pos = 0
  setU32LE(arr, pos, 0x06054b50); pos += 4
  setU16LE(arr, pos, 0); pos += 2 // disk number
  setU16LE(arr, pos, 0); pos += 2 // disk with central dir
  setU16LE(arr, pos, fileCount); pos += 2 // entries on disk
  setU16LE(arr, pos, fileCount); pos += 2 // total entries
  setU32LE(arr, pos, centralDirSize); pos += 4
  setU32LE(arr, pos, centralDirOffset); pos += 4
  setU16LE(arr, pos, 0); pos += 2 // comment length
  return arr
}

function setU32LE(arr: Uint8Array, offset: number, value: number): void {
  arr[offset] = value & 0xff
  arr[offset + 1] = (value >>> 8) & 0xff
  arr[offset + 2] = (value >>> 16) & 0xff
  arr[offset + 3] = (value >>> 24) & 0xff
}

function setU16LE(arr: Uint8Array, offset: number, value: number): void {
  arr[offset] = value & 0xff
  arr[offset + 1] = (value >>> 8) & 0xff
}

function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, arr) => sum + arr.length, 0)
  const result = new Uint8Array(total)
  let offset = 0
  for (const arr of arrays) {
    result.set(arr, offset)
    offset += arr.length
  }
  return result
}

const CRC32_TABLE = (() => {
  const table = new Int32Array(256)
  for (let i = 0; i < 256; i++) {
    let crc = i
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
    }
    table[i] = crc
  }
  return table
})()

function workflowStateAfterCheckpointRestore(input: {
  snapshot: WorkflowSessionState
  current: WorkflowSessionState | null
  checkpointId: string
  checkpointVersion: number
  checkpointLabel: string
  removedFiles: string[]
  restoredAt: string
}): WorkflowSessionState {
  const previousRevision = typeof input.current?.revision === 'number'
    ? input.current.revision
    : typeof input.snapshot.revision === 'number'
      ? input.snapshot.revision
      : 0
  const previousStateVersion = typeof input.current?.stateVersion === 'number'
    ? input.current.stateVersion
    : typeof input.snapshot.stateVersion === 'number'
      ? input.snapshot.stateVersion
      : 0
  const activeRunId = input.snapshot.activeWorkflowRunId
  const workflowRuns = input.snapshot.workflowRuns?.map((run) => {
    if (run.id !== activeRunId) return run
    return {
      ...run,
      history: [
        ...run.history,
        {
          type: 'checkpoint-restored',
          at: input.restoredAt,
          phaseId: input.snapshot.activePhaseId ?? undefined,
          summary: `Restored workflow checkpoint ${input.checkpointId} (${input.checkpointLabel}).`,
          checkpointId: input.checkpointId,
          checkpointVersion: input.checkpointVersion,
          removedFiles: input.removedFiles,
        },
      ],
      updatedAt: input.restoredAt,
    }
  })

  return {
    ...input.snapshot,
    workflowRuns,
    revision: previousRevision + 1,
    stateVersion: previousStateVersion + 1,
    updatedAt: input.restoredAt,
    nextPhaseContextStrategy: 'clear',
    pendingConfirmation: null,
    lastCheckpointRestore: {
      checkpointId: input.checkpointId,
      checkpointVersion: input.checkpointVersion,
      checkpointLabel: input.checkpointLabel,
      restoredAt: input.restoredAt,
      restoredActivePhaseId: input.snapshot.activePhaseId,
      restoredPhaseIndex: input.snapshot.phases.find((phase) => phase.id === input.snapshot.activePhaseId)?.index ?? null,
      removedFiles: input.removedFiles,
      instruction: 'The workflow and files were rolled back to this checkpoint. Treat later generated context as superseded. Continue from the restored phase and re-evaluate subsequent stage prompts, assumptions, and outputs from the restored project state.',
    },
  }
}

async function readOptionalObjectBody(req: Request): Promise<Record<string, unknown>> {
  const rawBody = await req.text()
  let body: unknown = {}
  if (rawBody.trim()) {
    try {
      body = JSON.parse(rawBody)
    } catch {
      throw workflowError(400, 'WORKFLOW_CHECKPOINT_INVALID', 'Workflow checkpoint request body must be valid JSON')
    }
  }
  if (body === null) body = {}
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw workflowError(400, 'WORKFLOW_CHECKPOINT_INVALID', 'Workflow checkpoint request body must be an object')
  }
  return body as Record<string, unknown>
}

async function exitWorkflow(_req: Request, sessionId: string): Promise<Response> {
  await requireWorkflowSession(sessionId)

  return await enqueueWorkflowTransition(sessionId, async () => {
    const stateRead = await workflowSessionStateService.readState(sessionId)
    if (!stateRead.exists || !stateRead.state) {
      throw workflowError(404, 'WORKFLOW_STATE_UNAVAILABLE', 'Workflow state is unavailable')
    }
    if (stateRead.state.preview?.status === 'running' || stateRead.state.preview?.status === 'starting' || stateRead.state.preview?.status === 'stopping') {
      throw workflowError(409, 'WORKFLOW_PREVIEW_ACTIVE', 'Stop the workflow preview before exiting the workflow')
    }

    await conversationService.stopSessionAndWait(sessionId)
    setSessionChatState(sessionId, 'idle')
    // Exiting a workflow also clears its live Todo/Task list; transcript and workflow artifacts remain persisted.
    await resetTaskList(sessionId)
    const now = new Date().toISOString()
    const result = await workflowRuntimeService.exitWorkflow({
      state: stateRead.state,
      requestedAt: now,
      transitionId: 'exit-' + sessionId + '-' + stateRead.state.stateVersion,
    })
    const { pointer } = await workflowSessionStateService.writeState(sessionId, result.state)
    const detail = await sessionService.getSession(sessionId)
    const workDir = detail.workDir || process.cwd()
    await workflowSessionCreateService.appendWorkflowMetadata(
      sessionId,
      workDir,
      stateToWorkflowMetadata(result.state, pointer),
    )
    for (const notification of result.notifications) {
      sendToSession(sessionId, workflowNotificationForDesktop(notification) as any)
    }

    return Response.json({
      ok: true,
      state: result.state,
      workflow: workflowSummaryFromState(result.state),
    })
  })
}

async function controlWorkflowPreview(
  req: Request,
  sessionId: string,
  action?: string,
): Promise<Response> {
  await requireWorkflowSession(sessionId)
  if (action !== 'start' && action !== 'stop') {
    throw ApiError.notFound(`Unknown workflow preview action: ${action || 'preview'}`)
  }

  let body: unknown = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  if (body === null) body = {}
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw workflowError(400, 'WORKFLOW_PREVIEW_INVALID', 'Workflow preview request must be an object')
  }
  const request = body as Record<string, unknown>

  return await enqueueWorkflowTransition(sessionId, async () => {
    const stateRead = await workflowSessionStateService.readState(sessionId)
    if (!stateRead.exists || !stateRead.state) {
      throw workflowError(404, 'WORKFLOW_STATE_UNAVAILABLE', 'Workflow state is unavailable')
    }
    assertWorkflowStateTrustedForTransition(stateRead.state)

    const result = action === 'start'
      ? await workflowPreviewService.startPreview(stateRead.state, {
          command: optionalString(request.command, 'command'),
          cwd: optionalString(request.cwd, 'cwd'),
          detectedPort: optionalNumber(request.detectedPort, 'detectedPort'),
          detectedUrl: optionalString(request.detectedUrl, 'detectedUrl'),
        })
      : await workflowPreviewService.stopPreview(stateRead.state, {
          reason: optionalString(request.reason, 'reason'),
        })

    const { pointer } = await workflowSessionStateService.writeState(sessionId, result.state)
    const detail = await sessionService.getSession(sessionId)
    const workDir = detail.workDir || process.cwd()
    await workflowSessionCreateService.appendWorkflowMetadata(
      sessionId,
      workDir,
      stateToWorkflowMetadata(result.state, pointer),
    )

    return Response.json({
      ok: true,
      state: result.state,
      workflow: workflowSummaryFromState(result.state),
      preview: result.preview,
    })
  })
}

function optionalString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string') {
    throw workflowError(400, 'WORKFLOW_PREVIEW_INVALID', `${fieldName} must be a string`)
  }
  const trimmed = value.trim()
  return trimmed || undefined
}

function optionalNumber(value: unknown, fieldName: string): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw workflowError(400, 'WORKFLOW_PREVIEW_INVALID', `${fieldName} must be a number`)
  }
  return value
}

async function startLinkedWorkflow(req: Request, sessionId: string): Promise<Response> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    throw workflowError(400, 'WORKFLOW_TEMPLATE_INVALID', 'Invalid JSON body')
  }

  const result = await workflowSessionLinkService.createLinkedWorkflowSession(sessionId, body)
  const { created, ...response } = result
  return Response.json(response, { status: created ? 201 : 200 })
}

async function previewLinkedWorkflowContext(req: Request, sessionId: string): Promise<Response> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    throw workflowError(400, 'WORKFLOW_TEMPLATE_INVALID', 'Invalid JSON body')
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw workflowError(400, 'WORKFLOW_TEMPLATE_INVALID', 'Context summary request must be an object')
  }
  const record = body as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (key !== 'summaryInstructions') {
      throw workflowError(400, 'WORKFLOW_TEMPLATE_INVALID', `Unsupported context summary field: ${key}`)
    }
  }
  if (record.summaryInstructions !== undefined && typeof record.summaryInstructions !== 'string') {
    throw workflowError(400, 'WORKFLOW_TEMPLATE_INVALID', 'summaryInstructions must be a string')
  }
  const result = await workflowSessionLinkService.previewSummary(sessionId, {
    ...(typeof record.summaryInstructions === 'string' && record.summaryInstructions.trim()
      ? { summaryInstructions: record.summaryInstructions.trim() }
      : {}),
  })
  return Response.json(result)
}

async function startFollowUpWorkflowRun(req: Request, sessionId: string): Promise<Response> {
  await requireWorkflowSession(sessionId)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    throw workflowError(400, 'WORKFLOW_TEMPLATE_INVALID', 'Invalid JSON body')
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw workflowError(400, 'WORKFLOW_TEMPLATE_INVALID', 'Workflow follow-up request must be an object')
  }
  const request = typeof (body as Record<string, unknown>).request === 'string'
    ? String((body as Record<string, unknown>).request)
    : ''
  if (!request.trim()) {
    throw workflowError(400, 'WORKFLOW_TEMPLATE_INVALID', 'request is required')
  }

  return await enqueueWorkflowTransition(sessionId, async () => {
    const stateRead = await workflowSessionStateService.readState(sessionId)
    if (!stateRead.exists || !stateRead.state) {
      throw workflowError(404, 'WORKFLOW_STATE_UNAVAILABLE', 'Workflow state is unavailable')
    }
    assertWorkflowStateTrustedForTransition(stateRead.state)

    const record = body as Record<string, unknown>
    const kind = normalizeWorkflowFollowUpKind(record.kind)
    const selectedTemplate = await resolveWorkflowFollowUpTemplate(record, kind)
    const initialPhaseId = normalizeOptionalNonEmptyString(record.initialPhaseId)
    if (selectedTemplate && initialPhaseId && !selectedTemplate.phases.some((phase) => phase.id === initialPhaseId)) {
      throw workflowError(400, 'WORKFLOW_TEMPLATE_INVALID', 'initialPhaseId does not exist in the selected workflow template')
    }
    const now = new Date().toISOString()
    const state = await createFollowUpWorkflowRun(stateRead.state, {
      request,
      kind,
      template: selectedTemplate,
      ...(initialPhaseId ? { initialPhaseId } : {}),
      selectedFiles: Array.isArray(record.selectedFiles)
        ? record.selectedFiles.filter((item): item is string => typeof item === 'string')
        : undefined,
      repoMetadata: record.repoMetadata && typeof record.repoMetadata === 'object' && !Array.isArray(record.repoMetadata)
        ? record.repoMetadata as Record<string, unknown>
        : undefined,
      errors: typeof record.errors === 'string' ? record.errors : undefined,
      logs: typeof record.logs === 'string' ? record.logs : undefined,
      testOutput: typeof record.testOutput === 'string' ? record.testOutput : undefined,
      now,
    })
    const { pointer } = await workflowSessionStateService.writeState(sessionId, state)
    const detail = await sessionService.getSession(sessionId)
    const workDir = detail.workDir || process.cwd()
    await workflowSessionCreateService.appendWorkflowMetadata(
      sessionId,
      workDir,
      stateToWorkflowMetadata(state, pointer),
    )

    return Response.json({
      ok: true,
      state,
      workflow: workflowSummaryFromState(state),
    })
  })
}

async function resolveWorkflowFollowUpTemplate(
  record: Record<string, unknown>,
  kind: WorkflowFollowUpRunKind | undefined,
): Promise<WorkflowTemplate> {
  const templateId = normalizeOptionalNonEmptyString(record.templateId)
  const templateSource = normalizeWorkflowTemplateSource(record.templateSource)
  const registry = await workflowTemplateRegistryService.listTemplates()
  const template = templateId
    ? registry.templates.find((candidate) => candidate.id === templateId && (!templateSource || candidate.source === templateSource))
    : selectFollowUpWorkflowTemplate(registry.templates, kind)
  if (!template) {
    throw workflowError(404, 'WORKFLOW_TEMPLATE_NOT_FOUND', 'Selected workflow template was not found')
  }
  if (template.phases.length === 0) {
    throw workflowError(400, 'WORKFLOW_TEMPLATE_INVALID', 'Selected workflow template has no phases')
  }
  return {
    ...template,
    displayName: typeof template.displayName === 'string' ? template.displayName : template.name,
  } as WorkflowTemplate
}

function normalizeWorkflowFollowUpKind(value: unknown): WorkflowFollowUpRunKind | undefined {
  if (value === undefined) return undefined
  if (value === 'development' || value === 'feature-extension' || value === 'debug-repair') return value
  if (value === 'feature') return 'feature-extension'
  if (value === 'debug') return 'debug-repair'
  throw workflowError(400, 'WORKFLOW_TEMPLATE_INVALID', 'Unsupported workflow follow-up kind')
}

function normalizeWorkflowTemplateSource(value: unknown): WorkflowTemplateSource | undefined {
  if (value === undefined) return undefined
  if (value === 'builtin' || value === 'user' || value === 'pack') return value
  throw workflowError(400, 'WORKFLOW_TEMPLATE_INVALID', 'Unsupported workflow template source')
}

function normalizeOptionalNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

async function getWorkflowState(sessionId: string): Promise<Response> {
  const workflowMetadata = await requireWorkflowSession(sessionId)
  const stateRead = await workflowSessionStateService.readState(sessionId)
  if (!stateRead.exists || !stateRead.state) {
    throw workflowError(404, 'WORKFLOW_STATE_UNAVAILABLE', 'Workflow state is unavailable')
  }
  const state = projectWorkflowStateForApi(stateRead.state, workflowMetadata)
  return Response.json({ state, workflow: workflowSummaryFromState(stateRead.state) })
}

function projectWorkflowStateForApi(
  state: WorkflowSessionState,
  metadata: WorkflowSessionMetadata,
): WorkflowSessionState {
  if (!hasResumeRecoveryProjection(state, metadata)) {
    return state
  }

  const resumedAt = state.lastResumeAt ?? new Date().toISOString()
  const resumeTransition = buildResumeTransitionProjection(state, resumedAt)

  return {
    ...state,
    status: 'resumed',
    lastResumeAt: resumedAt,
    transitionHistory: hasResumeTransition(state.transitionHistory)
      ? state.transitionHistory
      : [...state.transitionHistory, resumeTransition],
    resumeMetadata: {
      status: 'resumed',
      trustedStatus: state.status,
      trustedWorkflowStatus: state.workflowStatus,
      projectedAt: resumedAt,
    },
  }
}

function hasResumeRecoveryProjection(
  state: WorkflowSessionState,
  metadata: WorkflowSessionMetadata,
): boolean {
  if (state.status === 'created' || state.workflowStatus === 'created') {
    return false
  }
  return (
    metadata.activePhaseId !== state.activePhaseId ||
    metadata.sourceTemplateStatus !== state.sourceTemplateStatus ||
    metadata.stateRevision !== state.revision
  )
}

function hasResumeTransition(transitions: WorkflowTransitionRecord[]): boolean {
  return transitions.some((transition) =>
    transition.authority === 'resume' && transition.decision === 'resumed'
  )
}

function buildResumeTransitionProjection(
  state: WorkflowSessionState,
  resumedAt: string,
): WorkflowTransitionRecord {
  return {
    transitionId: `resume-${state.sessionId}-${state.revision}`,
    fromStatus: state.status,
    toStatus: 'resumed',
    fromPhaseId: state.activePhaseId,
    toPhaseId: state.activePhaseId,
    authority: 'resume',
    decision: 'resumed',
    completionCheckId: null,
    createdAt: resumedAt,
    stateVersion: state.stateVersion,
    previousRevision: state.revision,
    nextRevision: state.revision,
  }
}

async function transitionWorkflow(req: Request, sessionId: string): Promise<Response> {
  await requireWorkflowSession(sessionId)

  let body: WorkflowBoundaryTransitionRequest
  try {
    body = normalizeWorkflowBoundaryTransitionRequest(await req.json())
  } catch {
    throw ApiError.badRequest('Invalid JSON body')
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw workflowError(400, 'WORKFLOW_TRANSITION_INVALID', 'Workflow transition must be an object')
  }
  if (typeof body.phaseId !== 'string' || body.phaseId.length === 0) {
    throw workflowError(400, 'WORKFLOW_TRANSITION_INVALID', 'phaseId is required')
  }
  if (!isSupportedWorkflowBoundaryAction(body.action)) {
    throw workflowError(400, 'WORKFLOW_TRANSITION_INVALID', 'Unsupported workflow transition action')
  }
  if (!isSupportedNextPhaseContextStrategy(body.nextPhaseContextStrategy)) {
    throw workflowError(400, 'WORKFLOW_TRANSITION_INVALID', 'Unsupported next phase context strategy')
  }

  return await enqueueWorkflowTransition(sessionId, async () => {
    const stateRead = await workflowSessionStateService.readState(sessionId)
    if (!stateRead.exists || !stateRead.state) {
      throw workflowError(404, 'WORKFLOW_STATE_UNAVAILABLE', 'Workflow state is unavailable')
    }
    assertWorkflowStateTrustedForTransition(stateRead.state)

    const requestedAt = new Date().toISOString()
    const result = await applyWorkflowBoundaryTransition(stateRead.state, body, requestedAt)
    const { pointer } = await workflowSessionStateService.writeState(sessionId, result.state)
    await persistWorkflowFinalReportIfReady(result.state)
    const detail = await sessionService.getSession(sessionId)
    const workDir = detail.workDir || process.cwd()
    await workflowSessionCreateService.appendWorkflowMetadata(
      sessionId,
      workDir,
      stateToWorkflowMetadata(result.state, pointer),
    )
    for (const notification of result.notifications) {
      sendToSession(sessionId, workflowNotificationForDesktop(notification) as any)
    }

    return Response.json({
      ok: true,
      state: result.state,
      workflow: workflowSummaryFromState(result.state),
      ...(result.route ? { route: result.route } : {}),
    })
  })
}

async function persistWorkflowFinalReportIfReady(state: WorkflowSessionState): Promise<void> {
  if (!state.finalReportRef) return
  await workflowReportStore.createFinalReport(state.sessionId, buildWorkflowFinalReport(state))
}

function assertWorkflowStateTrustedForTransition(state: WorkflowSessionState): void {
  if (
    state.sourceTemplateStatus === 'stale-template' ||
    state.sourceTemplateStatus === 'missing-template'
  ) {
    throw workflowError(
      409,
      'WORKFLOW_STATE_CONFLICT',
      'Workflow state was restored from a template recovery state and cannot advance safely',
    )
  }
}

type WorkflowBoundaryTransitionRequest = Omit<WorkflowTransitionRequest, 'action'> & {
  action: WorkflowTransitionRequest['action'] | CompletionSubmission['status'] | 'manual_complete'
  stateVersion?: number
  expectedStateVersion?: number
  handoff?: unknown
  rationale?: unknown
  evidence?: unknown
}

type WorkflowBoundaryTransitionResult = {
  state: WorkflowSessionState
  notifications: Array<Record<string, unknown>>
  route?: {
    approvedTargetPhaseId: string | null
    routeReason: string
    requiresConfirmation: boolean
  }
}

async function applyWorkflowBoundaryTransition(
  state: WorkflowSessionState,
  request: WorkflowBoundaryTransitionRequest,
  requestedAt: string,
): Promise<WorkflowBoundaryTransitionResult> {
  if (request.action === 'route') {
    if (!request.routeIntent || typeof request.rationale !== 'string' || !Array.isArray(request.evidence)) {
      throw workflowError(400, 'WORKFLOW_ROUTE_INVALID', 'Workflow route requires routeIntent, rationale, and evidence.')
    }
    const result = await workflowRuntimeService.requestWorkflowRoute({
      state,
      requestedAt,
      transitionId: request.transitionId,
      request: {
        phaseId: request.phaseId,
        stateVersion: request.stateVersion,
        intent: request.routeIntent,
        targetPhaseId: request.targetPhaseId,
        targetWorkflowId: request.targetWorkflowId,
        rationale: request.rationale,
        evidence: request.evidence as Array<Record<string, unknown>>,
        requireUserConfirmation: request.requireUserConfirmation,
      },
    })
    return {
      state: result.state,
      notifications: result.notifications,
      route: {
        approvedTargetPhaseId: result.approvedTargetPhaseId,
        routeReason: result.routeReason,
        requiresConfirmation: result.requiresConfirmation,
      },
    }
  }

  if (isCompletionSubmissionAction(request.action)) {
    const submission = toCompletionSubmission(request)
    const result = request.action === 'manual_complete'
      ? await workflowRuntimeService.submitManualCompletion({
        state,
        submission,
        requestedAt,
        transitionId: request.transitionId,
        nextPhaseContextStrategy: request.nextPhaseContextStrategy,
      })
      : await workflowRuntimeService.submitPhaseCompletion({
        state,
        submission,
        requestedAt,
        transitionId: request.transitionId,
      })
    return { state: result.state, notifications: result.notifications }
  }

  return await workflowRuntimeService.applyTransition({
    state,
    request: request as WorkflowTransitionRequest,
    requestedAt,
  })
}

function normalizeWorkflowBoundaryTransitionRequest(value: unknown): WorkflowBoundaryTransitionRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value as WorkflowBoundaryTransitionRequest
  }

  const request = value as WorkflowBoundaryTransitionRequest
  if (typeof request.stateVersion === 'number') return request
  if (typeof request.expectedStateVersion === 'number') {
    return { ...request, stateVersion: request.expectedStateVersion }
  }
  return request
}

function isSupportedWorkflowBoundaryAction(
  action: unknown,
): action is WorkflowBoundaryTransitionRequest['action'] {
  return (
    action === 'confirm' ||
    action === 'route' ||
    action === 'reject' ||
    action === 'retry' ||
    action === 'manual_complete' ||
    action === 'pause' ||
    action === 'resume' ||
    action === 'stop' ||
    action === 'ready' ||
    action === 'needs_user' ||
    action === 'completed' ||
    action === 'blocked' ||
    action === 'unable'
  )
}

function isCompletionSubmissionAction(action: unknown): action is CompletionSubmission['status'] | 'manual_complete' {
  return action === 'ready' || action === 'needs_user' || action === 'completed' || action === 'blocked' || action === 'unable' || action === 'manual_complete'
}

function isSupportedNextPhaseContextStrategy(
  strategy: unknown,
): strategy is WorkflowTransitionRequest['nextPhaseContextStrategy'] | undefined {
  return strategy === undefined || strategy === 'inherit' || strategy === 'clear'
}

function toCompletionSubmission(request: WorkflowBoundaryTransitionRequest): CompletionSubmission {
  return {
    phaseId: request.phaseId,
    stateVersion: request.stateVersion as number,
    status: request.action === 'manual_complete' ? 'ready' : request.action as CompletionSubmission['status'],
    handoff: request.handoff as CompletionSubmission['handoff'],
    rationale: request.rationale as string,
    evidence: request.evidence as CompletionSubmission['evidence'],
  }
}

function enqueueWorkflowTransition<T>(
  sessionId: string,
  transition: () => Promise<T>,
): Promise<T> {
  const previous = workflowTransitionPromises.get(sessionId) ?? Promise.resolve()
  const next = previous.catch(() => {}).then(transition)
  const tracked = next.then(() => {}, () => {})
  workflowTransitionPromises.set(sessionId, tracked)
  return next.finally(() => {
    if (workflowTransitionPromises.get(sessionId) === tracked) {
      workflowTransitionPromises.delete(sessionId)
    }
  })
}

async function getWorkflowReport(sessionId: string): Promise<Response> {
  const workflow = await requireWorkflowSession(sessionId)
  if (!workflow.reportPointer && !workflow.reportRef) {
    throw workflowError(404, 'WORKFLOW_REPORT_NOT_READY', 'Workflow report is not ready')
  }

  const reportRead = await workflowReportStore.readFinalReport(sessionId)
  if (!reportRead.exists || !reportRead.report) {
    throw workflowError(404, 'WORKFLOW_REPORT_UNAVAILABLE', 'Workflow report artifact is unavailable')
  }

  return Response.json({ report: reportRead.report, pointer: workflow.reportPointer ?? workflow.reportRef })
}

async function requireWorkflowSession(sessionId: string): Promise<WorkflowSessionMetadata> {
  const detail = await sessionService.getSession(sessionId)
  if (!detail) {
    throw ApiError.notFound(`Session not found: ${sessionId}`)
  }
  if (!detail.workflow || detail.workflow.mode !== 'workflow') {
    throw workflowError(409, 'WORKFLOW_NOT_ENABLED', 'Workflow mode is not enabled for this session')
  }
  return detail.workflow
}

function workflowError(statusCode: number, code: string, message: string): WorkflowApiError {
  return new WorkflowApiError(statusCode, code, message)
}

function methodNotAllowed(method: string): Response {
  return Response.json(
    { error: 'METHOD_NOT_ALLOWED', message: `Method ${method} not allowed` },
    { status: 405 },
  )
}

async function requireSessionWorkspace(
  sessionId: string,
  missingMessage = `Session not found: ${sessionId}`,
  missingCode?: string,
): Promise<string> {
  const workDir =
    conversationService.getSessionWorkDir(sessionId) ||
    await sessionService.getSessionWorkDir(sessionId)

  if (!workDir) {
    if (missingCode) {
      throw workflowError(400, missingCode, missingMessage)
    }
    throw ApiError.notFound(missingMessage)
  }

  return workDir
}

function requireWorkspacePath(url: URL, route: 'file' | 'diff'): string {
  const filePath = url.searchParams.get('path')
  if (!filePath) {
    throw ApiError.badRequest(`path query parameter is required for workspace ${route}`)
  }
  return filePath
}

async function runWorkspaceRequest<T>(operation: () => Promise<T>): Promise<Response> {
  try {
    return Response.json(await operation())
  } catch (error) {
    if (isOutsideWorkspaceError(error)) {
      throw new ApiError(403, error.message, 'FORBIDDEN')
    }
    if (isSessionNotFoundError(error)) {
      throw ApiError.notFound(error.message)
    }
    throw error
  }
}

async function runWorkspaceDiffRequest<T extends { state?: string; error?: string }>(
  operation: () => Promise<T>,
): Promise<Response> {
  const result = await runWorkspaceRequest(operation)
  const body = await result.clone().json() as T

  if (body.state === 'error' && typeof body.error === 'string' && body.error.includes('outside workspace')) {
    throw new ApiError(403, body.error, 'FORBIDDEN')
  }

  return result
}

function isOutsideWorkspaceError(error: unknown): error is Error {
  return error instanceof Error && error.message.includes('outside workspace')
}

function isSessionNotFoundError(error: unknown): error is Error {
  return error instanceof Error && error.message.startsWith('Session not found:')
}

async function deleteSession(sessionId: string): Promise<Response> {
  conversationService.markSessionDeleted(sessionId)
  try {
    await sessionService.deleteSession(sessionId)
  } catch (error) {
    conversationService.unmarkSessionDeleted(sessionId)
    throw error
  }
  closeSessionConnection(sessionId, 'session deleted')
  cleanupAdapterSessionMappings(sessionId)
  return Response.json({ ok: true })
}

async function batchDeleteSessions(req: Request): Promise<Response> {
  let body: { sessionIds?: unknown }
  try {
    body = (await req.json()) as { sessionIds?: unknown }
  } catch {
    throw ApiError.badRequest('Invalid JSON body')
  }

  const sessionIds = normalizeSessionIds(body.sessionIds)
  conversationService.markSessionsDeleted(sessionIds)
  const result = await sessionService.deleteSessions(sessionIds)

  if (result.failures.length > 0) {
    conversationService.unmarkSessionsDeleted(result.failures.map((failure) => failure.sessionId))
  }

  for (const sessionId of result.successes) {
    closeSessionConnection(sessionId, 'session deleted')
    cleanupAdapterSessionMappings(sessionId)
  }

  return Response.json({
    ok: result.failures.length === 0,
    successes: result.successes,
    failures: result.failures,
  })
}

function normalizeSessionIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw ApiError.badRequest('sessionIds must be an array')
  }

  const sessionIds: string[] = []
  for (const sessionId of value) {
    if (typeof sessionId !== 'string' || sessionId.trim().length === 0) {
      throw ApiError.badRequest('sessionIds must contain only non-empty strings')
    }
    sessionIds.push(sessionId.trim())
  }

  if (sessionIds.length === 0) {
    throw ApiError.badRequest('sessionIds must include at least one session id')
  }

  return [...new Set(sessionIds)]
}

function cleanupAdapterSessionMappings(sessionId: string): void {
  const removedChatIds = new SessionStore().deleteBySessionId(sessionId)
  if (removedChatIds.length > 0) {
    console.log(`[Sessions API] Removed ${removedChatIds.length} adapter session mapping(s) for ${sessionId}`)
  }
}

function mergeSessionSlashCommands(
  preferred: Array<{ name: string; description?: string; argumentHint?: string }>,
  fallback: SkillSlashCommand[],
): Array<{ name: string; description: string; argumentHint?: string }> {
  const merged = new Map<string, { name: string; description: string; argumentHint?: string }>()

  for (const command of preferred) {
    if (!command.name) continue
    merged.set(command.name, {
      name: command.name,
      description: command.description || '',
      ...(command.argumentHint ? { argumentHint: command.argumentHint } : {}),
    })
  }

  for (const command of fallback) {
    if (!command.name || merged.has(command.name)) continue
    merged.set(command.name, {
      name: command.name,
      description: command.description || '',
      ...(command.argumentHint ? { argumentHint: command.argumentHint } : {}),
    })
  }

  return [...merged.values()]
}

async function getSessionSlashCommands(sessionId: string): Promise<Response> {
  const cachedCommands = getSlashCommands(sessionId)
  const workDir = await sessionService.getSessionWorkDir(sessionId)
  if (!workDir) {
    throw ApiError.notFound(`Session not found: ${sessionId}`)
  }

  const skillCommands = await listSkillSlashCommands(workDir)
  const slashCommands = cachedCommands.length > 0
    ? mergeSessionSlashCommands(cachedCommands, skillCommands)
    : skillCommands

  return Response.json({ commands: slashCommands })
}

async function getSessionInspection(sessionId: string, url: URL): Promise<Response> {
  const includeContext = url.searchParams.get('includeContext') !== '0'
  const contextOnly = includeContext && url.searchParams.get('contextOnly') === '1'
  const workDir =
    conversationService.getSessionWorkDir(sessionId) ||
    await sessionService.getSessionWorkDir(sessionId)

  if (!workDir) {
    throw ApiError.notFound(`Session not found: ${sessionId}`)
  }

  const active = conversationService.hasSession(sessionId)
  const initMessage = conversationService.getSessionInitMessage(sessionId) ??
    [...conversationService.getRecentSdkMessages(sessionId)]
    .reverse()
    .find((message) => message?.type === 'system' && message.subtype === 'init')
  const transcriptMetadata = await sessionService.getTranscriptMetadata(sessionId)
  const cachedSlashCommands = getSlashCommands(sessionId)
  const skillSlashCommands = await listSkillSlashCommands(workDir)
  const fallbackSlashCommands = cachedSlashCommands.length > 0
    ? mergeSessionSlashCommands(cachedSlashCommands, skillSlashCommands)
    : skillSlashCommands
  const slashCommandCount = Array.isArray(initMessage?.slash_commands)
    ? initMessage.slash_commands.length
    : fallbackSlashCommands.length

  const response: Record<string, unknown> = {
    active,
    status: {
      sessionId,
      workDir,
      permissionMode: conversationService.getSessionPermissionMode(sessionId),
      version: typeof initMessage?.claude_code_version === 'string' ? initMessage.claude_code_version : transcriptMetadata?.version,
      cwd: typeof initMessage?.cwd === 'string' ? initMessage.cwd : transcriptMetadata?.cwd ?? workDir,
      model: typeof initMessage?.model === 'string' ? initMessage.model : transcriptMetadata?.model,
      apiKeySource: typeof initMessage?.apiKeySource === 'string' ? initMessage.apiKeySource : undefined,
      outputStyle: typeof initMessage?.output_style === 'string' ? initMessage.output_style : undefined,
      tools: Array.isArray(initMessage?.tools) ? initMessage.tools : [],
      mcpServers: Array.isArray(initMessage?.mcp_servers) ? initMessage.mcp_servers : [],
      slashCommandCount,
      skillCount: Array.isArray(initMessage?.skills) ? initMessage.skills.length : 0,
    },
    errors: {},
  }
  const transcriptUsage = await sessionService.getTranscriptUsage(sessionId)
  const transcriptContextEstimate = await sessionService.getTranscriptContextEstimate(sessionId)
  if (transcriptContextEstimate) {
    response.contextEstimate = transcriptContextEstimate
  }

  if (!active) {
    if (transcriptUsage) {
      response.usage = transcriptUsage
    }
    response.errors = {
      ...(transcriptUsage ? {} : { usage: 'CLI session is not running' }),
      ...(includeContext ? { context: 'CLI session is not running' } : {}),
    }
    return Response.json(response)
  }

  const errors: Record<string, string> = {}
  if (contextOnly) {
    try {
      response.context = await conversationService.requestControl(
        sessionId,
        { subtype: 'get_context_usage', estimateOnly: true },
        20_000,
      )
    } catch (error) {
      errors.context = error instanceof Error ? error.message : String(error)
    }
  } else {
    const basicControlTimeoutMs = includeContext ? 10_000 : 4_000
    const [usageResult, contextResult, mcpResult] = await Promise.allSettled([
      conversationService.requestControl(sessionId, { subtype: 'get_session_usage' }, basicControlTimeoutMs),
      includeContext
        ? conversationService.requestControl(
            sessionId,
            { subtype: 'get_context_usage', estimateOnly: true },
            20_000,
          )
        : Promise.resolve(null),
      conversationService.requestControl(sessionId, { subtype: 'mcp_status' }, basicControlTimeoutMs),
    ])

    if (usageResult.status === 'fulfilled') {
      response.usage = chooseRicherUsage(
        { ...usageResult.value, source: 'current_process' },
        transcriptUsage,
      )
    } else {
      if (transcriptUsage) {
        response.usage = transcriptUsage
      } else {
        errors.usage = usageResult.reason instanceof Error ? usageResult.reason.message : String(usageResult.reason)
      }
    }

    if (!includeContext) {
      // Context can be expensive on large live sessions. The desktop UI loads it
      // separately when the context tab is actually selected.
    } else if (contextResult.status === 'fulfilled' && contextResult.value) {
      response.context = contextResult.value
    } else {
      errors.context = contextResult.reason instanceof Error ? contextResult.reason.message : String(contextResult.reason)
    }

    if (mcpResult.status === 'fulfilled' && response.status && typeof response.status === 'object') {
      response.status = {
        ...response.status,
        mcpServers: Array.isArray(mcpResult.value.mcpServers) ? mcpResult.value.mcpServers : (response.status as Record<string, unknown>).mcpServers,
      }
    }
  }

  response.errors = errors
  return Response.json(response)
}

function usageTokenTotal(usage: unknown): number {
  if (!usage || typeof usage !== 'object') return 0
  const record = usage as Record<string, unknown>
  return [
    record.totalInputTokens,
    record.totalOutputTokens,
    record.totalCacheReadInputTokens,
    record.totalCacheCreationInputTokens,
  ].reduce((sum, value) => sum + (typeof value === 'number' ? value : 0), 0)
}

function chooseRicherUsage(
  currentUsage: Record<string, unknown>,
  transcriptUsage: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!transcriptUsage) return currentUsage
  return usageTokenTotal(transcriptUsage) > usageTokenTotal(currentUsage)
    ? transcriptUsage
    : currentUsage
}

async function getGitInfo(sessionId: string): Promise<Response> {
  const workDir = conversationService.getSessionWorkDir(sessionId) || await sessionService.getSessionWorkDir(sessionId)
  if (!workDir) {
    throw ApiError.notFound(`Session not found: ${sessionId}`)
  }
  const launchInfo = await sessionService.getSessionLaunchInfo(sessionId).catch(() => null)
  const repository = launchInfo?.repository
  const worktreeSession = launchInfo?.worktreeSession
  // The visible business branch comes from Desktop's launch choice when present.
  // CLI originalBranch is the source checkout before creating the worktree, which
  // can differ from the selected base ref.
  const sessionBranch = repository?.branch || worktreeSession?.originalBranch || null
  const worktree = repository?.worktree || worktreeSession
    ? {
        enabled: true,
        path: worktreeSession?.worktreePath || workDir,
        plannedPath: worktreeSession?.worktreePath || repository?.worktreePath || null,
        sourceWorkDir: worktreeSession?.originalCwd || repository?.requestedWorkDir || repository?.repoRoot || null,
        slug: worktreeSession?.worktreeName || repository?.worktreeSlug || null,
        branch: worktreeSession?.worktreeBranch || repository?.worktreeBranch || null,
      }
    : null

  try {
    // Get branch name
    const branchProc = Bun.spawn(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: workDir,
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const branchText = await new Response(branchProc.stdout).text()
    const branch = sessionBranch || branchText.trim()

    // Get repo name from remote or directory
    let repoName = ''
    try {
      const remoteProc = Bun.spawn(['git', 'remote', 'get-url', 'origin'], {
        cwd: workDir,
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const remoteText = await new Response(remoteProc.stdout).text()
      const remote = remoteText.trim()
      // Extract repo name from URL: git@github.com:user/repo.git or https://...repo.git
      const match = remote.match(/\/([^/]+?)(?:\.git)?$/) || remote.match(/:([^/]+\/[^/]+?)(?:\.git)?$/)
      repoName = match ? match[1]! : ''
    } catch {
      // No remote, use directory name
      const parts = workDir.split('/')
      repoName = parts[parts.length - 1] || ''
    }

    // Get short status
    const statusProc = Bun.spawn(['git', 'status', '--porcelain'], {
      cwd: workDir,
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const statusText = await new Response(statusProc.stdout).text()
    const changedFiles = statusText.trim().split('\n').filter(Boolean).length

    return Response.json({
      branch,
      repoName,
      workDir,
      changedFiles,
      worktree,
    })
  } catch {
    // Not a git repo or git not available
    return Response.json({
      branch: sessionBranch,
      repoName: null,
      workDir,
      changedFiles: 0,
      worktree,
    })
  }
}

async function rewindSession(req: Request, sessionId: string): Promise<Response> {
  let body: RewindTargetSelector & { dryRun?: boolean }
  try {
    body = (await req.json()) as RewindTargetSelector & { dryRun?: boolean }
  } catch {
    throw ApiError.badRequest('Invalid JSON body')
  }

  if (
    (typeof body.targetUserMessageId !== 'string' || body.targetUserMessageId.length === 0) &&
    !Number.isInteger(body.userMessageIndex)
  ) {
    throw ApiError.badRequest('targetUserMessageId (string) or userMessageIndex (integer) is required')
  }

  const result = body.dryRun
    ? await previewSessionRewind(sessionId, body)
    : await executeSessionRewind(sessionId, body)

  return Response.json(result)
}

async function getTurnCheckpoints(sessionId: string): Promise<Response> {
  const checkpoints = await listSessionTurnCheckpoints(sessionId)
  return Response.json({ checkpoints })
}

async function getTurnCheckpointDiff(sessionId: string, url: URL): Promise<Response> {
  const targetUserMessageId = url.searchParams.get('targetUserMessageId') || undefined
  const userMessageIndexParam = url.searchParams.get('userMessageIndex')
  const path = url.searchParams.get('path')
  const userMessageIndex =
    userMessageIndexParam === null ? undefined : Number.parseInt(userMessageIndexParam, 10)

  if (
    (typeof targetUserMessageId !== 'string' || targetUserMessageId.length === 0) &&
    !Number.isInteger(userMessageIndex)
  ) {
    throw ApiError.badRequest('targetUserMessageId (string) or userMessageIndex (integer) is required')
  }

  if (!path) {
    throw ApiError.badRequest('path query parameter is required for turn checkpoint diff')
  }

  const result = await getSessionTurnCheckpointDiff(
    sessionId,
    {
      targetUserMessageId,
      userMessageIndex,
    },
    path,
  )

  return Response.json(result)
}

async function patchSession(req: Request, sessionId: string): Promise<Response> {
  let body: { title?: string }
  try {
    body = (await req.json()) as { title?: string }
  } catch {
    throw ApiError.badRequest('Invalid JSON body')
  }

  if (!body.title || typeof body.title !== 'string') {
    throw ApiError.badRequest('title (string) is required in request body')
  }

  await sessionService.renameSession(sessionId, body.title)
  return Response.json({ ok: true })
}

type RecentProjectEntry = {
  projectPath: string
  realPath: string
  projectName: string
  isGit: boolean
  repoName: string | null
  branch: string | null
  modifiedAt: string
  sessionCount: number
}

// In-memory cache for recent projects (TTL: 30s)
let recentProjectsCache: { projects: RecentProjectEntry[]; timestamp: number } | null = null
const RECENT_PROJECTS_CACHE_TTL = 30_000
const DESKTOP_WORKTREE_MARKER = '/.claude/worktrees/'

function projectNameForRecentPath(realPath: string, fallback: string): string {
  const normalizedRealPath = realPath.replace(/\\/g, '/')
  const displayRoot = normalizedRealPath.includes(DESKTOP_WORKTREE_MARKER)
    ? normalizedRealPath.slice(0, normalizedRealPath.indexOf(DESKTOP_WORKTREE_MARKER))
    : normalizedRealPath
  return displayRoot.split('/').filter(Boolean).pop() || fallback
}

function isDesktopWorktreeBranchName(branch: string | null): boolean {
  return !!branch && branch.startsWith('worktree-desktop-')
}

async function getRecentProjects(url: URL): Promise<Response> {
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '10', 10) || 10, 1), 500)

  // Return cached response if fresh
  if (recentProjectsCache && Date.now() - recentProjectsCache.timestamp < RECENT_PROJECTS_CACHE_TTL) {
    return Response.json({ projects: recentProjectsCache.projects.slice(0, limit) })
  }

  const { sessions } = await sessionService.listSessions({ limit: 200 })
  const validSessions = sessions.filter((session) => session.workDirExists && session.workDir)

  // First pass: group by logical project root so worktrees stay under the same project.
  const realPathMap = new Map<string, { projectPath: string; modifiedAt: string; sessionCount: number; sessionId: string }>()
  for (const s of validSessions) {
    let realPath: string
    try {
      const workDir = await sessionService.getSessionWorkDir(s.id)
      realPath = s.projectRoot || workDir || sessionService.desanitizePath(s.projectPath)
    } catch {
      realPath = s.projectRoot || sessionService.desanitizePath(s.projectPath)
    }

    const existing = realPathMap.get(realPath)
    if (!existing || s.modifiedAt > existing.modifiedAt) {
      realPathMap.set(realPath, {
        projectPath: realPath,
        modifiedAt: s.modifiedAt,
        sessionCount: (existing?.sessionCount ?? 0) + 1,
        sessionId: s.id,
      })
    } else {
      existing.sessionCount++
    }
  }

  // Build project list with git info — parallelize git operations
  const entries = Array.from(realPathMap.entries())
  const projects = await Promise.all(
    entries.map(async ([realPath, info]) => {
      const projectName = projectNameForRecentPath(realPath, info.projectPath)

      let isGit = false
      let repoName: string | null = null
      let branch: string | null = null
      try {
        const proc = Bun.spawn(['git', 'rev-parse', '--is-inside-work-tree'], {
          cwd: realPath, stdout: 'pipe', stderr: 'pipe',
        })
        const out = await new Response(proc.stdout).text()
        isGit = out.trim() === 'true'

        if (isGit) {
          // Run branch + remote in parallel
          const [branchResult, remoteResult] = await Promise.all([
            (async () => {
              const branchProc = Bun.spawn(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], {
                cwd: realPath, stdout: 'pipe', stderr: 'pipe',
              })
              return (await new Response(branchProc.stdout).text()).trim() || null
            })(),
            (async () => {
              try {
                const remoteProc = Bun.spawn(['git', 'remote', 'get-url', 'origin'], {
                  cwd: realPath, stdout: 'pipe', stderr: 'pipe',
                })
                const remote = (await new Response(remoteProc.stdout).text()).trim()
                const match = remote.match(/:([^/]+\/[^/]+?)(?:\.git)?$/) || remote.match(/\/([^/]+\/[^/]+?)(?:\.git)?$/)
                return match ? match[1]! : null
              } catch { return null }
            })(),
          ])
          branch = isDesktopWorktreeBranchName(branchResult) ? null : branchResult
          repoName = remoteResult
        }
      } catch { /* not a git repo or dir doesn't exist */ }

      return {
        projectPath: info.projectPath, realPath, projectName, isGit, repoName, branch,
        modifiedAt: info.modifiedAt, sessionCount: info.sessionCount,
      }
    })
  )

  // Sort by most recent
  projects.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))

  recentProjectsCache = { projects, timestamp: Date.now() }
  return Response.json({ projects: projects.slice(0, limit) })
}
