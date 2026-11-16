import type { MessageKind } from '../../utils/messageKind.js'
import { promises as fsp } from 'fs'
import { getSdkAgentProgressSummariesEnabled } from '../../bootstrap/state.js'
import { getSystemPrompt } from '../../constants/prompts.js'
import { isCoordinatorMode } from '../../coordinator/coordinatorMode.js'
import type { CanUseToolFn } from '../../hooks/useCanUseTool.js'
import type { ToolUseContext } from '../../Tool.js'
import { enqueueAgentNotification, failAgentTask, registerAsyncAgent, startAsyncAgent } from '../../tasks/LocalAgentTask/LocalAgentTask.js'
import { assembleToolPool, assembleWorkflowToolPool } from '../../tools.js'
import { asAgentId } from '../../types/ids.js'
import { runWithAgentContext } from '../../utils/agentContext.js'
import { runWithCwdOverride } from '../../utils/cwd.js'
import { logForDebugging } from '../../utils/debug.js'
import {
  createRuntimeUserMessage,
  filterOrphanedThinkingOnlyMessages,
  filterUnresolvedToolUses,
  filterWhitespaceOnlyAssistantMessages,
} from '../../utils/messages.js'
import { getAgentModel } from '../../utils/model/agent.js'
import { getQuerySourceForAgent } from '../../utils/promptCategory.js'
import {
  getAgentTranscript,
  readAgentMetadata,
} from '../../utils/sessionStorage.js'
import { buildEffectiveSystemPrompt } from '../../utils/systemPrompt.js'
import type { SystemPrompt } from '../../utils/systemPromptType.js'
import { getTaskOutputPath, persistAgentTaskOutput } from '../../utils/task/diskOutput.js'
import { getParentSessionId } from '../../utils/teammate.js'
import { reconstructForSubagentResume } from '../../utils/toolResultStorage.js'
import { runAsyncAgentLifecycle } from './agentToolUtils.js'
import type { ExpertResearchSourceAssignment } from '../../services/tools/expertSubagentSkillRuntime.js'
import { GENERAL_PURPOSE_AGENT } from './built-in/generalPurposeAgent.js'
import { FORK_AGENT, isForkSubagentEnabled } from './forkSubagent.js'
import type { AgentDefinition } from './loadAgentsDir.js'
import { isBuiltInAgent } from './loadAgentsDir.js'
import { runAgent } from './runAgent.js'
import { resolveAgentToolPermissionContext } from './agentPermissionContext.js'
import { createDevelopmentWorkerContract, developmentWorkerToolAllowed, isDefaultDevelopmentImplementationWorker } from '../../server/services/developmentToolExecutionPolicy.js'
import { isManagedWorkflowAgentImplementationPhase, recordWorkflowAgentTaskProgress } from '../../server/services/workflowAgentTaskStateService.js'
import { isDevelopmentImplementationPhase, validateDevelopmentBatchPlanForState, type DevelopmentReviewerOutcome } from '../../server/services/workflowDevelopmentBatchAgentPolicy.js'
import { recordDevelopmentBatchAgentProgress } from '../../server/services/workflowDevelopmentBatchAgentProgress.js'
import { recordDevelopmentBatchAgentProgressThroughDesktop, recordWorkflowAgentTaskProgressThroughDesktop, resolveWorkflowRuntimeState } from '../../services/tools/workflowRuntimeStateBridge.js'
import { runWithinWorkflowTaskSchedule, validateWorkflowTaskSchedule, type WorkflowTaskSchedulePlan } from './workflowTaskScheduling.js'
import { validateReviewerFinalMessage } from './reviewerResultValidation.js'
import type { WorkflowSessionState } from '../../server/services/workflowTypes.js'
import { getCwd } from '../../utils/cwd.js'
import { validateCoderFinalMessage } from './coderResultValidation.js'
import { buildWorkflowReviewerEvidence } from './workflowReviewerEvidence.js'

async function managedResume(agentId: string, context: ToolUseContext) {
  const local = context.getAppState()
  const resolved = await resolveWorkflowRuntimeState((local as { workflow?: unknown }).workflow)
  if (resolved.source === 'desktop-unavailable') throw new Error(`WORKFLOW_RESUME_AUTHORITY_UNAVAILABLE: ${resolved.reason}`)
  const state = resolved.state
  const oldTask = local.tasks[agentId]
  const phaseStates = state?.runtimeContract?.phaseStates
  if (!isManagedWorkflowAgentImplementationPhase(state)) {
    const historicalBatch = Object.values(phaseStates ?? {}).some(phase => phase.taskSnapshots.some(task =>
      (task.agentRunId ?? task.agentId) === agentId && (task.workflowRole === 'coder' || task.workflowRole === 'reviewer')))
    if (historicalBatch || oldTask && 'workflowTaskId' in oldTask && oldTask.workflowTaskId) throw new Error('WORKFLOW_RESUME_AUTHORITY_REQUIRED: Batch worker has no current implementation-phase authority. Relaunch its Batch/role through Agent only when the current phase permits it.')
    return undefined
  }
  const fail = (detail: string): never => { throw new Error(`WORKFLOW_RESUME_AUTHORITY_REQUIRED: ${detail} Relaunch through Agent with the current validated workflow_role. Coder/Reviewer require the complete workflow_parallel_plan; QA/Debug must omit that plan. Do not infer authority from transcript text.`) }
  if (state.runStatus !== 'active' || !state.activePhaseId) fail('Workflow is not active.')
  if (!state.workspaceRoot || !state.activeWorkflowRunId) fail('Current workspace/run identity is unavailable.')
  const snapshots = state.runtimeContract?.phaseStates[state.activePhaseId!]?.taskSnapshots ?? []
  const owned = snapshots.filter(task => (task.agentRunId ?? task.agentId) === agentId)
  if (owned.length !== 1) fail('No unique current Batch/role receipt owns this agent.')
  const task = owned[0]!
  if (task.sessionId !== state.sessionId || task.phaseId !== state.activePhaseId
    || task.runId !== state.activeWorkflowRunId
    || !task.batchId || !['coder', 'reviewer'].includes(task.workflowRole ?? '')) fail('Worker receipt belongs to a different run/phase or lacks its Batch/role.')
  const role = task.workflowRole as 'coder' | 'reviewer'
  const aliases = new Map(snapshots.flatMap(item => item.batchId && item.workflowRole
    ? [[item.taskId, item], [`${item.batchId}::${item.workflowRole}`, item]] as const : []))
  const coders = snapshots.filter(item => item.workflowRole === 'coder')
  if (!coders.length || coders.some(item => !item.batchId || !Array.isArray(item.writeScopes) || !Array.isArray(item.resourceClaims))) fail('Complete trusted task plan metadata is unavailable.')
  const plan: WorkflowTaskSchedulePlan = { taskId: task.batchId!, tasks: coders.map(item => ({
    id: item.batchId!, writeScopes: [...item.writeScopes!], resourceClaims: [...item.resourceClaims!], executionMode: item.executionMode,
    dependsOn: (item.dependsOn ?? []).map(id => {
      const dependency = aliases.get(id)
      return dependency?.workflowRole === 'reviewer' && dependency.batchId ? dependency.batchId : fail(`Unknown task dependency ${id}.`)
    }),
  })) }
  if (isDevelopmentImplementationPhase(state)) validateDevelopmentBatchPlanForState(state, plan.tasks)
  await validateWorkflowTaskSchedule(state, plan, role)
  return { state, role, plan }
}

export type ResumeAgentResult = {
  agentId: string
  description: string
  outputFile: string
}
export async function resumeAgentBackground({
  agentId,
  prompt,
  toolUseContext,
  canUseTool,
  invokingRequestId,
  messageKind,
}: {
  agentId: string
  prompt: string
  toolUseContext: ToolUseContext
  canUseTool: CanUseToolFn
  invokingRequestId?: string
  messageKind?: MessageKind
}): Promise<ResumeAgentResult> {
  const startTime = Date.now()
  const appState = toolUseContext.getAppState()
  // In-process teammates get a no-op setAppState; setAppStateForTasks
  // reaches the root store so task registration/progress/kill stay visible.
  const rootSetAppState =
    toolUseContext.setAppStateForTasks ?? toolUseContext.setAppState
  const permissionMode = appState.toolPermissionContext.mode
  // Authority comes from the current runtime receipt, never a saved transcript.
  const managed = await managedResume(agentId, toolUseContext)

  const [transcript, meta] = await Promise.all([
    getAgentTranscript(asAgentId(agentId)),
    readAgentMetadata(asAgentId(agentId)),
  ])
  if (!transcript) {
    throw new Error(`No transcript found for agent ID: ${agentId}`)
  }
  if (managed && meta?.worktreePath) {
    throw new Error(`WORKFLOW_RESUME_AUTHORITY_REQUIRED: Managed worktree authority cannot be restored from agent metadata alone. Relaunch workflow_role="${managed.role}", workflow_parallel_plan.task_id=${JSON.stringify(managed.plan.taskId)} through Agent.`)
  }
  const resumedMessages = filterWhitespaceOnlyAssistantMessages(
    filterOrphanedThinkingOnlyMessages(
      filterUnresolvedToolUses(transcript.messages),
    ),
  )
  const resumedReplacementState = reconstructForSubagentResume(
    toolUseContext.contentReplacementState,
    resumedMessages,
    transcript.contentReplacements,
  )
  // Best-effort: if the original worktree was removed externally, fall back
  // to parent cwd rather than crashing on chdir later.
  const resumedWorktreePath = meta?.worktreePath
    ? await fsp.stat(meta.worktreePath).then(
        s => (s.isDirectory() ? meta.worktreePath : undefined),
        () => {
          logForDebugging(
            `Resumed worktree ${meta.worktreePath} no longer exists; falling back to parent cwd`,
          )
          return undefined
        },
      )
    : undefined
  if (resumedWorktreePath) {
    // Bump mtime so stale-worktree cleanup doesn't delete a just-resumed worktree (#22355)
    const now = new Date()
    await fsp.utimes(resumedWorktreePath, now, now)
  }

  // Skip filterDeniedAgents re-gating — original spawn already passed permission checks
  let selectedAgent: AgentDefinition
  let isResumedFork = false
  if (meta?.agentType === FORK_AGENT.agentType) {
    selectedAgent = FORK_AGENT
    isResumedFork = true
  } else if (meta?.agentType) {
    const found = toolUseContext.options.agentDefinitions.activeAgents.find(
      a => a.agentType === meta.agentType,
    )
    selectedAgent = found ?? GENERAL_PURPOSE_AGENT
  } else {
    selectedAgent = GENERAL_PURPOSE_AGENT
  }

  const uiDescription = meta?.description ?? '(resumed)'
  if (managed && isResumedFork) {
    throw new Error(`WORKFLOW_RESUME_AUTHORITY_REQUIRED: Managed Batch workers cannot resume with fork tool visibility. Relaunch subagent_type="general-purpose", workflow_role="${managed.role}", workflow_parallel_plan.task_id=${JSON.stringify(managed.plan.taskId)} through Agent.`)
  }

  let forkParentSystemPrompt: SystemPrompt | undefined
  if (isResumedFork) {
    if (toolUseContext.renderedSystemPrompt) {
      forkParentSystemPrompt = toolUseContext.renderedSystemPrompt
    } else {
      const mainThreadAgentDefinition = appState.agent
        ? appState.agentDefinitions.activeAgents.find(
            a => a.agentType === appState.agent,
          )
        : undefined
      const additionalWorkingDirectories = Array.from(
        appState.toolPermissionContext.additionalWorkingDirectories.keys(),
      )
      const defaultSystemPrompt = await getSystemPrompt(
        toolUseContext.options.tools,
        toolUseContext.options.mainLoopModel,
        additionalWorkingDirectories,
        toolUseContext.options.mcpClients,
      )
      forkParentSystemPrompt = buildEffectiveSystemPrompt({
        mainThreadAgentDefinition,
        toolUseContext,
        customSystemPrompt: toolUseContext.options.customSystemPrompt,
        defaultSystemPrompt,
        appendSystemPrompt: toolUseContext.options.appendSystemPrompt,
      })
    }
    if (!forkParentSystemPrompt) {
      throw new Error(
        'Cannot resume fork agent: unable to reconstruct parent system prompt',
      )
    }
  }

  // Resolve model for analytics metadata (runAgent resolves its own internally)
  const resolvedAgentModel = getAgentModel(
    selectedAgent.model,
    toolUseContext.options.mainLoopModel,
    undefined,
    permissionMode,
  )

  const workerPermissionContext = resolveAgentToolPermissionContext(appState.toolPermissionContext, selectedAgent.permissionMode)
  const workerTools = managed
    ? assembleWorkflowToolPool(workerPermissionContext, appState.mcp.tools, managed.state, managed.role)
      .filter(tool => developmentWorkerToolAllowed(tool.name, managed.role, managed.state))
    : isResumedFork
    ? toolUseContext.options.tools
    : assembleToolPool(workerPermissionContext, appState.mcp.tools)

  let metadata: {
    prompt: string
    resolvedAgentModel: string
    isBuiltInAgent: boolean
    startTime: number
    agentType: string
    isAsync: boolean
    researchSourceAssignment?: ExpertResearchSourceAssignment
    priorAuditMessages?: typeof resumedMessages
  }

  const reviewerEvidenceMessages: ReturnType<typeof createRuntimeUserMessage>[] = []
  const runAgentParams: Parameters<typeof runAgent>[0] = {
    agentDefinition: selectedAgent,
    get promptMessages() { return [
      ...resumedMessages,
      createRuntimeUserMessage({ content: prompt, messageKind }),
      ...reviewerEvidenceMessages,
    ] },
    toolUseContext,
    workflowWorkerContract: managed ? createDevelopmentWorkerContract(managed.state, managed.role, resumedWorktreePath ?? managed.state.workspaceRoot ?? getCwd(), managed.plan.taskId,
      managed.role === 'coder' ? managed.plan.tasks.find(task => task.id === managed.plan.taskId)!.writeScopes : []) : undefined,
    canUseTool,
    isAsync: true,
    querySource: getQuerySourceForAgent(
      selectedAgent.agentType,
      isBuiltInAgent(selectedAgent),
    ),
    model: undefined,
    // Fork resume: pass parent's system prompt (cache-identical prefix).
    // Non-fork: undefined → runAgent recomputes under wrapWithCwd so
    // getCwd() sees resumedWorktreePath.
    override: isResumedFork
      ? { systemPrompt: forkParentSystemPrompt }
      : undefined,
    availableTools: workerTools,
    // Transcript already contains the parent context slice from the
    // original fork. Re-supplying it would cause duplicate tool_use IDs.
    forkContextMessages: undefined,
    ...(isResumedFork && { useExactTools: true }),
    // Re-persist so metadata survives runAgent's writeAgentMetadata overwrite
    worktreePath: resumedWorktreePath,
    description: meta?.description,
    contentReplacementState: resumedReplacementState,
    onExpertResearchAssignment: assignment => {
      metadata.researchSourceAssignment = assignment;
    },
  }

  // Skip name-registry write — original entry persists from the initial spawn
  const latestTask = toolUseContext.getAppState().tasks[agentId]
  if (latestTask?.status === 'running' || latestTask?.status === 'pending') {
    throw new Error('WORKFLOW_RESUME_ALREADY_ACTIVE: This agent already has an active or queued attempt. Send a message to that attempt instead of resuming it again.')
  }
  const agentBackgroundTask = registerAsyncAgent({
    agentId,
    description: uiDescription,
    prompt,
    selectedAgent,
    setAppState: rootSetAppState,
    toolUseId: toolUseContext.toolUseId,
    workflowTaskId: managed?.plan.taskId,
    writeScopes: managed?.role === 'coder' ? managed.plan.tasks.find(task => task.id === managed.plan.taskId)!.writeScopes : undefined,
  })

  if (!managed) startAsyncAgent(agentBackgroundTask.agentId, rootSetAppState)

  metadata = {
    prompt,
    resolvedAgentModel,
    isBuiltInAgent: isBuiltInAgent(selectedAgent),
    startTime,
    agentType: selectedAgent.agentType,
    isAsync: true,
    researchSourceAssignment: undefined,
    priorAuditMessages: resumedMessages,
  }

  const asyncAgentContext = {
    agentId,
    parentSessionId: getParentSessionId(),
    agentType: 'subagent' as const,
    subagentName: selectedAgent.agentType,
    isBuiltIn: isBuiltInAgent(selectedAgent),
    invokingRequestId,
    invocationKind: 'resume' as const,
    invocationEmitted: false,
  }

  const wrapWithCwd = <T>(fn: () => T): T =>
    resumedWorktreePath ? runWithCwdOverride(resumedWorktreePath, fn) : fn()

  let reviewOutcome: DevelopmentReviewerOutcome | undefined
  const recordProgress = async (status: 'running' | 'succeeded' | 'failed' | 'blocked', reason?: string) => {
    if (!managed) return
    const common = { phaseId: managed.state.activePhaseId!, role: managed.role, batchId: managed.plan.taskId, plan: managed.plan.tasks,
      toolUseId: toolUseContext.toolUseId, recordedAt: new Date().toISOString(), reason }
    if (isDevelopmentImplementationPhase(managed.state)) {
      const progress = { ...common, status, agentId, reviewerOutcome: reviewOutcome }
      if (await recordDevelopmentBatchAgentProgressThroughDesktop(progress)) return
      let error: unknown
      rootSetAppState(prev => {
        try { return { ...prev, workflow: recordDevelopmentBatchAgentProgress((prev as { workflow?: unknown }).workflow as WorkflowSessionState, progress) } }
        catch (caught) { error = caught; return prev }
      })
      if (error) throw error
    } else {
      const progress = { ...common, status: reviewOutcome?.reviewStatus === 'needs-fix' ? 'needs_fix' as const : status,
        agentRunId: agentId, reviewStatus: reviewOutcome?.reviewStatus, requiredFixes: reviewOutcome?.requiredFixes }
      if (await recordWorkflowAgentTaskProgressThroughDesktop(progress)) return
      let error: unknown
      rootSetAppState(prev => {
        try { return { ...prev, workflow: recordWorkflowAgentTaskProgress((prev as { workflow?: unknown }).workflow as WorkflowSessionState, progress) } }
        catch (caught) { error = caught; return prev }
      })
      if (error) throw error
    }
  }
  const lifecycle = () => wrapWithCwd(async () => {
    if (managed?.role === 'reviewer' && isDevelopmentImplementationPhase(managed.state)) {
      const current = await resolveWorkflowRuntimeState((toolUseContext.getAppState() as { workflow?: unknown }).workflow)
      if (current.source === 'desktop-unavailable' || !current.state) throw new Error('WORKFLOW_REVIEW_EVIDENCE_UNAVAILABLE: Current workflow authority could not be loaded.')
      reviewerEvidenceMessages.push(createRuntimeUserMessage({ content: await buildWorkflowReviewerEvidence(current.state, managed.plan.taskId) }))
    }
    await recordProgress('running')
    return (
      runAsyncAgentLifecycle({
        taskId: agentBackgroundTask.agentId,
        abortController: agentBackgroundTask.abortController!,
        makeStream: onCacheSafeParams =>
          runAgent({
            ...runAgentParams,
            override: {
              ...runAgentParams.override,
              agentId: asAgentId(agentBackgroundTask.agentId),
              abortController: agentBackgroundTask.abortController!,
            },
            onCacheSafeParams,
          }),
        metadata,
        description: uiDescription,
        toolUseContext,
        rootSetAppState,
        agentIdForCleanup: agentId,
        enableSummarization:
          isCoordinatorMode() ||
          isForkSubagentEnabled() ||
          getSdkAgentProgressSummariesEnabled(),
        getWorktreeResult: async () =>
          resumedWorktreePath ? { worktreePath: resumedWorktreePath } : {},
        validateWorkflowExecution: Boolean(managed),
        validateFinalMessage: managed?.role === 'reviewer' ? report => {
          const result = validateReviewerFinalMessage(report)
          reviewOutcome = result.outcome
          return result.error
        } : managed && isDefaultDevelopmentImplementationWorker(managed.state, managed.role)
          ? report => {
            const result = validateCoderFinalMessage(report)
            return result.status === 'not-ready' ? { status: 'blocked' as const, reason: '工作已返回，但实现或承诺检查尚未完成；请按报告中的阻塞继续处理。' } : result.error
          } : undefined,
        beforeTerminal: outcome => recordProgress(outcome.status, outcome.status !== 'succeeded' ? outcome.reason : undefined),
      })
    )
  })
  void runWithAgentContext(asyncAgentContext, () => managed
    ? runWithinWorkflowTaskSchedule(managed.state, managed.plan, lifecycle, {
      role: managed.role, signal: agentBackgroundTask.abortController!.signal,
      onStarted: () => startAsyncAgent(agentId, rootSetAppState),
      onBlocked: async reason => { await recordProgress('failed', reason); throw new Error(reason) },
      onCancelled: () => { throw new Error('Agent resume was cancelled before acquiring its workflow permit') },
    }) : lifecycle()).catch(error => {
      logForDebugging(`Agent resume failed before lifecycle: ${String(error)}`)
      // Setup/scheduler failures must not leave a registered worker running.
      return persistAgentTaskOutput(agentId, String(error)).catch(outputError => {
        error = new Error(`${String(error)}; Agent output persistence failed: ${String(outputError)}`)
      }).then(() => {
        failAgentTask(agentId, String(error), rootSetAppState)
        enqueueAgentNotification({ taskId: agentId, description: uiDescription, status: 'failed', error: String(error), setAppState: rootSetAppState })
      })
    })

  return {
    agentId,
    description: uiDescription,
    outputFile: getTaskOutputPath(agentId),
  }
}
