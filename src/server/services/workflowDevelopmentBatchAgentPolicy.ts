import { createHash, randomBytes } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { assessDependencyRisk, type DependencyRiskContext } from './workflowDependencyRiskPolicy.js'
import { developmentArtifactWriteAllowed } from './developmentToolExecutionPolicy.js'
import { readdirSync, readFileSync } from 'node:fs'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import * as path from 'node:path'
import type {
  WorkflowPhaseCompletionState,
  WorkflowSessionState,
  WorkflowTaskSnapshot,
} from './workflowTypes.js'

export const DEVELOPMENT_WORKFLOW_TEMPLATE_ID = 'efficient-constrained-dev-debug-workflow-v5'
export const DEVELOPMENT_PLAN_PHASE_ID = 'delivery-plan'
export const DEVELOPMENT_IMPLEMENT_PHASE_ID = 'delegate-implement'

export type DevelopmentBatchAgentRole = 'coder' | 'reviewer'
export type DevelopmentBatchAgentStatus = 'running' | 'succeeded' | 'failed' | 'blocked' | 'interrupted'
export type DevelopmentReviewerStatus = 'pass' | 'needs-fix'

export type DevelopmentReviewerOutcome = {
  reviewStatus: DevelopmentReviewerStatus
  requiredFixes: string[]
  readyForNextBatch: boolean
}

export type DevelopmentBatchPlanTask = {
  id: string
  dependsOn: string[]
  writeScopes: string[]
  resourceClaims: string[]
  executionMode?: 'read' | 'write'
}

export type DevelopmentBatchAgentProgressInput = {
  phaseId: string
  role: DevelopmentBatchAgentRole
  batchId: string
  plan: DevelopmentBatchPlanTask[]
  status: DevelopmentBatchAgentStatus
  agentId: string
  toolUseId?: string
  reason?: string
  reviewerOutcome?: DevelopmentReviewerOutcome
  recordedAt: string
}

function isDevelopmentWorkflow(
  state: Pick<WorkflowSessionState, 'templateIdentity' | 'templateSnapshot' | 'template'> | null | undefined,
): boolean {
  const templateId = state?.templateIdentity?.id ?? state?.templateSnapshot?.id ?? state?.template?.id
  return templateId === DEVELOPMENT_WORKFLOW_TEMPLATE_ID
}

export function isDevelopmentPlanPhase(
  state: Pick<WorkflowSessionState, 'templateIdentity' | 'templateSnapshot' | 'template' | 'activePhaseId'> | null | undefined,
): boolean {
  return isDevelopmentWorkflow(state) && state?.activePhaseId === DEVELOPMENT_PLAN_PHASE_ID
}

export function isDevelopmentImplementationPhase(
  state: Pick<WorkflowSessionState, 'templateIdentity' | 'templateSnapshot' | 'template' | 'activePhaseId'> | null | undefined,
): boolean {
  return isDevelopmentWorkflow(state) && state?.activePhaseId === DEVELOPMENT_IMPLEMENT_PHASE_ID
}

export type DevelopmentBatchPlanParseResult = {
  plan: DevelopmentBatchPlanTask[] | null
  issues: string[]
  workspaceMode?: 'existing-project' | 'blank-create'
}

export type DevelopmentDeliveryPlanPreparation = DevelopmentBatchPlanParseResult & {
  state: WorkflowSessionState
  canonicalPath: string | null
  sourcePath: string | null
}

function normalizeBatchId(value: string): string {
  const trimmed = value.trim()
  return /^b\d+$/i.test(trimmed) ? trimmed.toUpperCase() : trimmed
}

function naturalBatchSort(left: string, right: string): number {
  const leftNumber = /^B(\d+)$/i.exec(left)?.[1]
  const rightNumber = /^B(\d+)$/i.exec(right)?.[1]
  if (leftNumber && rightNumber) return Number(leftNumber) - Number(rightNumber)
  return left.localeCompare(right)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const normalized = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
  return normalized.length === value.length ? normalized : null
}

function taskFromRecord(value: unknown, index: number): { task: DevelopmentBatchPlanTask | null, issues: string[] } {
  if (!isRecord(value)) {
    return { task: null, issues: [`tasks[${index}] must be an object.`] }
  }

  const rawId = typeof value.id === 'string' ? normalizeBatchId(value.id) : ''
  const dependsOn = stringArray(value.dependsOn ?? value.depends_on)
  const writeScopes = stringArray(value.writeScopes ?? value.write_scopes)
  const resourceClaims = stringArray(value.resourceClaims ?? value.resource_claims)
  const executionMode = value.executionMode ?? value.execution_mode
  const issues: string[] = []

  if (!/^B[1-9]\d*$/.test(rawId)) issues.push(`tasks[${index}].id must be a stable Batch ID such as B1; received ${rawId || 'missing'}.`)
  if (!dependsOn) issues.push(`tasks[${index}].depends_on must be an explicit string array.`)
  if (!writeScopes) issues.push(`tasks[${index}].write_scopes must be an explicit string array.`)
  if (!resourceClaims) issues.push(`tasks[${index}].resource_claims must be an explicit string array.`)
  if (executionMode !== 'read' && executionMode !== 'write') {
    issues.push(`tasks[${index}].execution_mode must be "read" or "write".`)
  }
  if (executionMode === 'write' && writeScopes && writeScopes.length === 0) {
    issues.push(`tasks[${index}] is a write Batch and must declare at least one write_scope.`)
  }
  if (issues.length) return { task: null, issues }

  return {
    task: {
      id: rawId,
      dependsOn: dependsOn!.map(normalizeBatchId),
      writeScopes: writeScopes!,
      resourceClaims: resourceClaims!,
      executionMode: executionMode as 'read' | 'write',
    },
    issues: [],
  }
}

function normalizedScope(value: string): string {
  return value.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '').toLowerCase()
}

function scopesOverlap(left: string, right: string): boolean {
  const a = normalizedScope(left)
  const b = normalizedScope(right)
  if (!a || !b) return false
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`)
}

export function validateDevelopmentBatchPlanTasks(plan: DevelopmentBatchPlanTask[]): string[] {
  if (!Array.isArray(plan) || plan.length === 0) {
    return ['The Batch plan must contain at least one task.']
  }

  const issues: string[] = []
  const ids = new Set<string>()
  for (const task of plan) {
    task.id = normalizeBatchId(task.id)
    task.dependsOn = task.dependsOn.map(normalizeBatchId)
    if (!/^B[1-9]\d*$/.test(task.id)) issues.push(`Batch ID ${task.id || 'missing'} must use B1, B2, ... format.`)
    if (ids.has(task.id)) issues.push(`Batch ID ${task.id} is duplicated.`)
    ids.add(task.id)
    if (task.executionMode !== 'read' && task.executionMode !== 'write') {
      issues.push(`Batch ${task.id} must declare execution_mode as read or write.`)
    }
    if (task.executionMode === 'write' && task.writeScopes.length === 0) {
      issues.push(`Batch ${task.id} is a write Batch and must declare at least one write_scope.`)
    }
  }

  for (const task of plan) {
    for (const dependency of task.dependsOn) {
      if (!ids.has(dependency)) issues.push(`Batch ${task.id} depends on unknown Batch ${dependency}.`)
      if (dependency === task.id) issues.push(`Batch ${task.id} cannot depend on itself.`)
    }
  }

  const byId = new Map(plan.map((task) => [task.id, task]))
  const visitState = new Map<string, 'visiting' | 'visited'>()
  const visit = (id: string, stack: string[]): void => {
    const status = visitState.get(id)
    if (status === 'visited') return
    if (status === 'visiting') {
      issues.push(`Batch dependency cycle detected: ${[...stack, id].join(' -> ')}.`)
      return
    }
    visitState.set(id, 'visiting')
    for (const dependency of byId.get(id)?.dependsOn ?? []) {
      if (byId.has(dependency)) visit(dependency, [...stack, id])
    }
    visitState.set(id, 'visited')
  }
  for (const task of plan) visit(task.id, [])

  const dependsTransitivelyOn = (taskId: string, dependencyId: string, seen = new Set<string>()): boolean => {
    if (seen.has(taskId)) return false
    seen.add(taskId)
    const task = byId.get(taskId)
    if (!task) return false
    if (task.dependsOn.includes(dependencyId)) return true
    return task.dependsOn.some((dependency) => dependsTransitivelyOn(dependency, dependencyId, seen))
  }

  for (let leftIndex = 0; leftIndex < plan.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < plan.length; rightIndex += 1) {
      const left = plan[leftIndex]!
      const right = plan[rightIndex]!
      const ordered = dependsTransitivelyOn(left.id, right.id) || dependsTransitivelyOn(right.id, left.id)
      if (ordered) continue
      const sharedResource = left.resourceClaims.find((claim) => right.resourceClaims.includes(claim))
      const sharedScope = left.executionMode === 'write' && right.executionMode === 'write'
        ? left.writeScopes.find((leftScope) => right.writeScopes.some((rightScope) => scopesOverlap(leftScope, rightScope)))
        : undefined
      if (sharedResource || sharedScope) {
        issues.push(`Batches ${left.id} and ${right.id} share ${sharedResource ? `resource ${sharedResource}` : `write scope ${sharedScope}`} but have no dependency ordering; they cannot be scheduled in parallel.`)
      }
    }
  }

  return [...new Set(issues)]
}

export function parseDevelopmentBatchPlanDocument(content: string): DevelopmentBatchPlanParseResult {
  const candidates: string[] = []
  for (const match of content.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) candidates.push(match[1]!.trim())
  const trimmed = content.trim()
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) candidates.push(trimmed)

  let structuredIssues: string[] | null = null
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (!isRecord(parsed)) continue
      const container = isRecord(parsed.workflow_parallel_plan)
        ? parsed.workflow_parallel_plan
        : isRecord(parsed.workflowParallelPlan)
          ? parsed.workflowParallelPlan
          : isRecord(parsed.batchPlan)
            ? parsed.batchPlan
            : parsed
      if (!Array.isArray(container.tasks)) continue
      const taskResults = container.tasks.map(taskFromRecord)
      const issues = taskResults.flatMap((result) => result.issues)
      const rawWorkspaceMode = container.workspace_mode ?? container.workspaceMode
      const workspaceMode = rawWorkspaceMode === 'existing-project' || rawWorkspaceMode === 'blank-create'
        ? rawWorkspaceMode
        : undefined
      if (rawWorkspaceMode !== undefined && !workspaceMode) {
        issues.push('workspace_mode must be "existing-project" or "blank-create".')
      }
      const plan = taskResults.map((result) => result.task).filter((task): task is DevelopmentBatchPlanTask => Boolean(task))
      if (!issues.length) issues.push(...validateDevelopmentBatchPlanTasks(plan))
      if (!issues.length) return { plan, issues: [], ...(workspaceMode ? { workspaceMode } : {}) }
      structuredIssues = issues
    } catch {}
  }

  return {
    plan: null,
    issues: structuredIssues ?? [
      'delivery-plan.md must contain one JSON code block with a top-level tasks array using id, depends_on, write_scopes, resource_claims, and execution_mode.',
    ],
  }
}

export function extractDevelopmentBatchIds(content: string): string[] {
  const ids = new Set<string>()
  const rangePattern = /\bB(\d+)\s*(?:-|–|—|~|～|至|到)\s*B?(\d+)\b/gi
  for (const match of content.matchAll(rangePattern)) {
    const start = Number(match[1])
    const end = Number(match[2])
    if (!Number.isInteger(start) || !Number.isInteger(end) || end < start || end - start > 100) continue
    for (let index = start; index <= end; index += 1) ids.add(`B${index}`)
  }
  for (const match of content.matchAll(/\bB[1-9]\d*\b/gi)) ids.add(normalizeBatchId(match[0]))
  return [...ids].sort(naturalBatchSort)
}

function activeRun(state: WorkflowSessionState) {
  const runs = state.workflowRuns ?? []
  return (state.activeWorkflowRunId
    ? runs.find((run) => run.id === state.activeWorkflowRunId)
    : runs.find((run) => run.status === 'active')) ?? null
}

type DevelopmentWorkspaceInspection = {
  status: 'blank' | 'populated' | 'unavailable'
  evidence: string[]
}

function inspectDevelopmentWorkspace(state: WorkflowSessionState): DevelopmentWorkspaceInspection {
  const workspaceRoot = activeRun(state)?.workspaceRoot ?? state.workspaceRoot
  if (!workspaceRoot) return { status: 'unavailable', evidence: [] }
  try {
    const evidence = readdirSync(workspaceRoot, { withFileTypes: true })
      .map((entry) => entry.name)
      .filter((name) => !['.workflow', '.DS_Store', 'Thumbs.db'].includes(name))
      .sort()
    return { status: evidence.length ? 'populated' : 'blank', evidence: evidence.slice(0, 8) }
  } catch {
    return { status: 'unavailable', evidence: [] }
  }
}

function formatDevelopmentWorkspaceInspection(inspection: DevelopmentWorkspaceInspection): string {
  if (inspection.status === 'blank') {
    return 'Workspace preflight: blank. No project files exist outside workflow metadata. Use top-level "workspace_mode": "blank-create" and make the first implementation Batch create the project skeleton; do not describe guessed paths as existing files.'
  }
  if (inspection.status === 'populated') {
    return `Workspace preflight: existing project evidence found (${inspection.evidence.join(', ')}). Inspect the available files before planning and use top-level "workspace_mode": "existing-project".`
  }
  return 'Workspace preflight: unavailable. Do not guess project paths. Ask for the correct workspace or record the access problem; Stage 3 cannot complete until the workspace can be inspected.'
}

function isSafeRunId(runId: string | null | undefined): runId is string {
  return Boolean(runId && path.basename(runId) === runId && runId !== '.' && runId !== '..')
}

function isWorkflowInternalPath(workspaceRoot: string, candidatePath: unknown): boolean {
  if (typeof candidatePath !== 'string' || !candidatePath.trim()) return false
  const internalRoot = path.resolve(workspaceRoot, '.workflow')
  const targetPath = path.resolve(workspaceRoot, candidatePath)
  const relative = path.relative(internalRoot, targetPath)
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative)
}

function canonicalDevelopmentDeliveryPlanPath(state: WorkflowSessionState): string | null {
  const run = activeRun(state)
  const workspaceRoot = run?.workspaceRoot ?? state.workspaceRoot
  const runId = run?.id ?? state.activeWorkflowRunId
  if (!workspaceRoot || !isSafeRunId(runId)) return null
  const candidate = path.resolve(workspaceRoot, '.workflow', 'runs', runId, 'delivery-plan.md')
  return isWorkflowInternalPath(workspaceRoot, candidate) ? candidate : null
}

function developmentDeliveryPlanArtifacts(state: WorkflowSessionState) {
  return [...(activeRun(state)?.artifacts ?? [])].reverse().filter((artifact) =>
    artifact.id === 'delivery-plan'
      || artifact.filename?.replace(/\\/g, '/').endsWith('/delivery-plan.md')
      || artifact.filename === 'delivery-plan.md'
  )
}

function developmentDeliveryPlanDiskCandidates(state: WorkflowSessionState): string[] {
  const run = activeRun(state)
  const workspaceRoot = run?.workspaceRoot ?? state.workspaceRoot
  if (!workspaceRoot) return []
  const candidates = [canonicalDevelopmentDeliveryPlanPath(state)]
  if (isSafeRunId(state.sessionId) && state.sessionId !== run?.id) {
    candidates.push(path.resolve(workspaceRoot, '.workflow', 'runs', state.sessionId, 'delivery-plan.md'))
  }
  return candidates.filter((candidate): candidate is string => Boolean(candidate && isWorkflowInternalPath(workspaceRoot, candidate)))
}

function readDevelopmentDeliveryPlanSync(state: WorkflowSessionState): { content: string, sourcePath: string | null } | null {
  for (const artifact of developmentDeliveryPlanArtifacts(state)) {
    if (typeof artifact.content === 'string' && artifact.content.trim()) {
      return { content: artifact.content, sourcePath: null }
    }
  }
  for (const candidate of developmentDeliveryPlanDiskCandidates(state)) {
    try {
      return { content: readFileSync(candidate, 'utf8'), sourcePath: candidate }
    } catch {}
  }
  return null
}

async function atomicWriteDevelopmentPlan(filePath: string, content: string): Promise<void> {
  const tempPath = `${filePath}.tmp.${process.pid}.${Date.now()}.${randomBytes(6).toString('hex')}`
  await mkdir(path.dirname(filePath), { recursive: true })
  try {
    await writeFile(tempPath, `${content.trimEnd()}\n`, 'utf8')
    await rename(tempPath, filePath)
  } catch (error) {
    await unlink(tempPath).catch(() => {})
    throw error
  }
}

export function developmentBatchHandoffPrompt(state: WorkflowSessionState): string {
  if (!isDevelopmentWorkflow(state)) return ''
  const run = activeRun(state)
  const runId = run?.id ?? state.activeWorkflowRunId
  if (!isSafeRunId(runId)) return ''
  const relativePath = `.workflow/runs/${runId}/delivery-plan.md`

  if (state.activePhaseId === DEVELOPMENT_PLAN_PHASE_ID) {
    const workspaceInspection = inspectDevelopmentWorkspace(state)
    return [
      'Default development Stage 3 -> Stage 4 handoff contract',
      formatDevelopmentWorkspaceInspection(workspaceInspection),
      `Write the final delivery plan to exactly: ${relativePath}`,
      'Before submitting Stage 3 completion, include exactly one machine-readable JSON code block in that file. Use stable individual Batch IDs (B1, B2, B3); never use a range such as B1-B3 as one Batch ID.',
      'Use this shape, with the same field names later passed to Agent.workflow_parallel_plan.tasks:',
      '```json',
      '{',
      '  "workspace_mode": "existing-project",',
      '  "tasks": [',
      '    {',
      '      "id": "B1",',
      '      "depends_on": [],',
      '      "write_scopes": ["src/example.ts"],',
      '      "resource_claims": [],',
      '      "execution_mode": "write"',
      '    }',
      '  ]',
      '}',
      '```',
      'Every dependency must reference an existing Batch. Shared write scopes or resources must be ordered by depends_on. Stage 3 completion is rejected here, before user confirmation, if this contract is missing or inconsistent.',
    ].join('\n')
  }

  if (state.activePhaseId === DEVELOPMENT_IMPLEMENT_PHASE_ID) {
    return [
      'Default development Stage 4 intake contract',
      `Treat ${relativePath} as the authoritative, already-validated Stage 3 Batch plan. Only an approved server-side scope amendment may update it within Stage 4.`,
      'workflow_parallel_plan.task_id is the original Batch ID from tasks, for example B1; workflow_role selects coder or reviewer. Never pass internal ledger IDs such as development-batch:B1:coder or scheduler IDs such as B1::coder as task_id.',
      'Every Coder/Reviewer Agent call must reuse its complete tasks array without changing IDs, dependencies, write scopes, resource claims, or execution modes.',
      'Do not edit delivery-plan.md from Stage 4 to work around a scheduling error. For a necessary small existing-file scope addition, wait for current workers to finish, then request_workflow_route intent=rework_current_phase with scopeAmendment={batchId,addWriteScopes:["exact/relative/file"]} and a concrete rationale. Its confirmation updates the accepted plan and actual write permissions together; ordinary AskUserQuestion answers do not grant file scope. Re-read the amended complete tasks array after approval. Structural changes to goals, dependencies or resources still require Stage 3.',
      'Reviewer launch and resume automatically receive the current successful Coder report and actual command receipts from existing task records. Inspect that packet and its transcript reference before asking for another run. Production database selection does not imply every test requires a live production database.',
    ].join('\n')
  }

  return ''
}

export async function prepareDevelopmentDeliveryPlanHandoff(
  state: WorkflowSessionState,
  now: string,
): Promise<DevelopmentDeliveryPlanPreparation> {
  if (!isDevelopmentPlanPhase(state)) {
    return { state, plan: null, issues: [], canonicalPath: null, sourcePath: null }
  }

  const canonicalPath = canonicalDevelopmentDeliveryPlanPath(state)
  let resolved: { content: string, sourcePath: string | null } | null = null
  if (canonicalPath) {
    try {
      resolved = { content: await readFile(canonicalPath, 'utf8'), sourcePath: canonicalPath }
    } catch {}
  }
  // The active-run file is what the model just wrote and read back. Persisted
  // artifacts are compatibility fallbacks; preferring one here can restore an
  // older plan over a user-confirmed Stage 3 revision during completion.
  if (!resolved) resolved = readDevelopmentDeliveryPlanSync(state)
  if (!resolved) {
    return {
      state,
      plan: null,
      issues: ['The Stage 3 delivery plan is missing. Write the exact active-run delivery-plan.md path before completing this phase.'],
      canonicalPath,
      sourcePath: null,
    }
  }

  const parsed = parseDevelopmentBatchPlanDocument(resolved.content)
  if (!parsed.plan || parsed.issues.length) {
    return { state, plan: null, issues: parsed.issues, canonicalPath, sourcePath: resolved.sourcePath }
  }
  const workspaceInspection = inspectDevelopmentWorkspace(state)
  const hasWriteBatch = parsed.plan.some((task) => task.executionMode === 'write')
  if (workspaceInspection.status === 'unavailable' && hasWriteBatch) {
    return {
      state,
      plan: null,
      issues: ['The workspace could not be inspected. Do not guess project paths; verify the workspace or ask the user for the correct folder before completing Stage 3.'],
      canonicalPath,
      sourcePath: resolved.sourcePath,
    }
  }
  if (workspaceInspection.status === 'blank' && hasWriteBatch && parsed.workspaceMode !== 'blank-create') {
    return {
      state,
      plan: null,
      issues: ['The workspace contains no project files. Add top-level "workspace_mode": "blank-create" and make the first implementation Batch create the project skeleton instead of treating guessed paths as existing files.'],
      canonicalPath,
      sourcePath: resolved.sourcePath,
    }
  }
  if (!canonicalPath) {
    return {
      state,
      plan: null,
      issues: ['The active workflow run ID or workspace root is unavailable, so the canonical Stage 3 handoff path cannot be resolved.'],
      canonicalPath: null,
      sourcePath: resolved.sourcePath,
    }
  }

  const next = JSON.parse(JSON.stringify(state)) as WorkflowSessionState
  const run = activeRun(next)
  if (!run) {
    return { state, plan: null, issues: ['The active workflow run is unavailable.'], canonicalPath, sourcePath: resolved.sourcePath }
  }
  const relativePath = `.workflow/runs/${run.id}/delivery-plan.md`
  const artifact = {
    id: 'delivery-plan',
    filename: relativePath,
    kind: 'markdown',
    required: true,
    phaseId: DEVELOPMENT_PLAN_PHASE_ID,
    createdAt: developmentDeliveryPlanArtifacts(next)[0]?.createdAt ?? now,
    updatedAt: now,
    content: resolved.content,
    developmentBatchPlan: parsed.plan,
    developmentBatchPlanSignature: developmentBatchPlanSignature(parsed.plan),
  }
  run.artifacts = [
    ...run.artifacts.filter((candidate) => candidate.id !== 'delivery-plan'),
    artifact,
  ]
  run.updatedAt = now
  await atomicWriteDevelopmentPlan(canonicalPath, resolved.content)

  return { state: next, plan: parsed.plan, issues: [], canonicalPath, sourcePath: resolved.sourcePath }
}

export function authoritativeDevelopmentBatchPlan(state: WorkflowSessionState): DevelopmentBatchPlanTask[] | null {
  if (!isDevelopmentImplementationPhase(state)) return null
  for (const artifact of developmentDeliveryPlanArtifacts(state)) {
    const stored = artifact.developmentBatchPlan
    if (Array.isArray(stored)) {
      const taskResults = stored.map(taskFromRecord)
      const plan = taskResults.map((result) => result.task).filter((task): task is DevelopmentBatchPlanTask => Boolean(task))
      if (!taskResults.some((result) => result.issues.length) && !validateDevelopmentBatchPlanTasks(plan).length) return plan
    }
    if (typeof artifact.content === 'string') {
      const parsed = parseDevelopmentBatchPlanDocument(artifact.content)
      if (parsed.plan && !parsed.issues.length) return parsed.plan
    }
  }
  const resolved = readDevelopmentDeliveryPlanSync(state)
  if (!resolved) return null
  const parsed = parseDevelopmentBatchPlanDocument(resolved.content)
  return parsed.plan && !parsed.issues.length ? parsed.plan : null
}

export function authoritativeDevelopmentBatchIds(state: WorkflowSessionState): string[] {
  if (!isDevelopmentImplementationPhase(state)) return []
  const plan = authoritativeDevelopmentBatchPlan(state)
  if (plan) return plan.map((task) => task.id).sort(naturalBatchSort)

  const contents = developmentDeliveryPlanArtifacts(state)
    .map((artifact) => artifact.content)
    .filter((content): content is string => typeof content === 'string' && content.trim().length > 0)
  const disk = readDevelopmentDeliveryPlanSync(state)
  if (disk) contents.push(disk.content)
  return extractDevelopmentBatchIds(contents.join('\n'))
}

export function validateDevelopmentBatchPlanForState(
  state: WorkflowSessionState,
  plan: DevelopmentBatchPlanTask[],
): string[] {
  const normalizedPlan = plan.map((task) => ({
    id: normalizeBatchId(task.id),
    dependsOn: [...task.dependsOn].map(normalizeBatchId),
    writeScopes: [...task.writeScopes],
    resourceClaims: [...task.resourceClaims],
    executionMode: task.executionMode,
  }))
  const planIssues = validateDevelopmentBatchPlanTasks(normalizedPlan)
  if (planIssues.length) {
    throw new Error(`WORKFLOW_DEVELOPMENT_BATCH_PLAN_INVALID: ${planIssues.join(' ')}`)
  }

  const authoritativePlan = authoritativeDevelopmentBatchPlan(state)
  if (authoritativePlan) {
    if (developmentBatchPlanSignature(authoritativePlan) !== developmentBatchPlanSignature(normalizedPlan)) {
      throw new Error('WORKFLOW_DEVELOPMENT_BATCH_PLAN_MISMATCH: workflow_parallel_plan must exactly match the validated Stage 3 tasks, including dependencies, write scopes, resource claims, and execution modes.')
    }
    return authoritativePlan.map((task) => task.id).sort(naturalBatchSort)
  }

  const expected = authoritativeDevelopmentBatchIds(state)
  if (!expected.length) {
    throw new Error('WORKFLOW_DEVELOPMENT_BATCH_PLAN_UNAVAILABLE: Stage 3 delivery-plan.md must declare stable Batch IDs before Stage 4 can launch Coder/Reviewer Agents.')
  }
  const actual = normalizedPlan.map((task) => task.id).sort(naturalBatchSort)
  if (expected.length !== actual.length || expected.some((id, index) => id !== actual[index])) {
    throw new Error(`WORKFLOW_DEVELOPMENT_BATCH_PLAN_MISMATCH: workflow_parallel_plan must contain the complete Stage 3 Batch list (${expected.join(', ')}); received ${actual.join(', ') || 'none'}.`)
  }
  return expected
}

export function developmentBatchPlanSignature(plan: DevelopmentBatchPlanTask[]): string {
  const normalized = plan
    .map((task) => ({
      id: normalizeBatchId(task.id),
      dependsOn: [...task.dependsOn].map(normalizeBatchId).sort(naturalBatchSort),
      writeScopes: [...task.writeScopes].sort(),
      resourceClaims: [...task.resourceClaims].sort(),
      executionMode: task.executionMode ?? (task.writeScopes.length > 0 ? 'write' : 'read'),
    }))
    .sort((left, right) => naturalBatchSort(left.id, right.id))
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex')
}

function normalizeReviewStatus(value: unknown): DevelopmentReviewerStatus | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase().replace(/[ _]/g, '-')
  if (['pass', 'passed', 'approved', 'approve', '通过', '批准'].includes(normalized)) return 'pass'
  if (['needs-fix', 'need-fix', 'needs-fixes', 'changes-required', 'reject', 'failed', '需修复', '需要修复'].includes(normalized)) return 'needs-fix'
  return null
}

function booleanValue(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return null
  if (/^(true|yes|pass|ready|是|可以)$/i.test(value.trim())) return true
  if (/^(false|no|not-ready|否|不可以)$/i.test(value.trim())) return false
  return null
}

function reviewerOutcomeFromRecord(record: Record<string, unknown>, issues: string[], riskContext: DependencyRiskContext): DevelopmentReviewerOutcome | null {
  const invalid = (message: string): null => { issues.push(message); return null }
  const nested = record.workflowReview
  if (nested !== undefined) {
    if (!nested || typeof nested !== 'object' || Array.isArray(nested)) return invalid('workflowReview must be an object.')
    return reviewerOutcomeFromRecord(nested as Record<string, unknown>, issues, riskContext)
  }
  const reviewStatus = normalizeReviewStatus(record.reviewStatus ?? record.approvalStatus)
  const canonicalReady = booleanValue(record.readyForNextBatch)
  const legacyReady = booleanValue(record.allowNextBatch)
  if (record.readyForNextBatch !== undefined && canonicalReady === null) return invalid('readyForNextBatch must be a boolean.')
  if (record.allowNextBatch !== undefined && legacyReady === null) return invalid('allowNextBatch must be a boolean.')
  if (canonicalReady !== null && legacyReady !== null && canonicalReady !== legacyReady) return invalid('readyForNextBatch conflicts with allowNextBatch.')
  const readyForNextBatch = canonicalReady ?? legacyReady
  const rawFixes = record.requiredFixes
  if (!Array.isArray(rawFixes) && typeof rawFixes !== 'string') return invalid('requiredFixes must be an array of concrete strings or finding objects.')
  const requiredFixes: string[] = []
  const riskIssue = (value: unknown, mandatory: boolean): string | null => {
    const risk = assessDependencyRisk(value, riskContext)
    if (!risk) return null
    if (mandatory && risk.classification === 'nonblocking-warning') return 'A dependency nonblocking warning cannot be a mandatory requiredFix; retain it in dependencyRisks and correct the review receipt without repeating Coder work.'
    if (reviewStatus === 'pass' && risk.classification !== 'nonblocking-warning') return `A dependency risk remains ${risk.classification}; pass is not coherent. ${risk.reason}`
    const finding = typeof value === 'string' ? JSON.parse(value) : value
    const expectedDisposition = risk.classification === 'nonblocking-warning' ? 'warning' : risk.classification
    if ((finding as Record<string, unknown>).disposition !== expectedDisposition) return `dependency risk disposition must be ${expectedDisposition}; ${risk.reason}`
    return null
  }
  if (Array.isArray(rawFixes)) {
    for (const [index, value] of rawFixes.entries()) {
      const issue = riskIssue(value, true)
      if (issue) return invalid(`requiredFixes[${index}]: ${issue}`)
      if (typeof value === 'string' && value.trim()) {
        requiredFixes.push(value.trim())
      } else if (value && typeof value === 'object' && !Array.isArray(value)
        && ['issue', 'fix', 'requiredChange', 'requiredAction', 'suggestedFix', 'description', 'detail', 'message'].some(key =>
          typeof value[key] === 'string' && value[key].trim())) {
        // Keep all supplied locations, severity and actions in the existing
        // string[] receipt shape. Never silently discard structured findings.
        requiredFixes.push(JSON.stringify(value))
      } else {
        return invalid(`requiredFixes[${index}] must be a non-empty string or finding object with issue, fix, requiredChange, requiredAction, suggestedFix, description, detail, or message.`)
      }
    }
  } else if (rawFixes.trim() && !/^(none|no|无|没有|\[\])$/i.test(rawFixes.trim())) {
    const issue = riskIssue(rawFixes, true)
    if (issue) return invalid(issue)
    requiredFixes.push(rawFixes.trim())
  }
  if (record.dependencyRisks !== undefined && !Array.isArray(record.dependencyRisks)) return invalid('dependencyRisks must be an array of explicit dependency-risk finding objects.')
  if (Array.isArray(record.dependencyRisks)) {
    for (const [index, finding] of record.dependencyRisks.entries()) {
      if (!finding || typeof finding !== 'object' || Array.isArray(finding) || !('kind' in finding) || finding.kind !== 'dependency-risk') {
        return invalid(`dependencyRisks[${index}] must be an explicit dependency-risk finding object.`)
      }
      const issue = riskIssue(finding, false)
      if (issue) return invalid(`dependencyRisks[${index}]: ${issue}`)
      if (assessDependencyRisk(finding, riskContext)?.classification !== 'nonblocking-warning'
        && !requiredFixes.some(value => {
          if (!assessDependencyRisk(value, riskContext)) return false
          return isDeepStrictEqual(JSON.parse(value), finding)
        })) {
        return invalid(`dependencyRisks[${index}]: unresolved or blocking dependency risk must also be retained as the same typed kind="dependency-risk" finding in requiredFixes. A plain Leader Ask action loses risk metadata and must not become a Coder repair. Have the same Reviewer correct this receipt, preserving its evidence and unresolved decision; do not repeat Coder work or claim pass.`)
      }
    }
  }
  if (!reviewStatus) return invalid('reviewStatus must be pass or needs-fix.')
  if (readyForNextBatch === null) return invalid('readyForNextBatch is required (boolean).')
  if (reviewStatus === 'pass' && (!readyForNextBatch || requiredFixes.length)) return invalid('pass requires requiredFixes=[] and readyForNextBatch=true.')
  if (reviewStatus === 'needs-fix' && (readyForNextBatch || !requiredFixes.length)) return invalid('needs-fix requires at least one concrete requiredFixes entry and readyForNextBatch=false.')
  return { reviewStatus, requiredFixes, readyForNextBatch }
}

export function inspectDevelopmentReviewerOutcome(content: string, riskContext: DependencyRiskContext = {}): { outcome: DevelopmentReviewerOutcome | null, issue: string | null } {
  const candidates = [content]
  const issues: string[] = []
  const outcomes: DevelopmentReviewerOutcome[] = []
  for (const match of content.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) candidates.push(match[1])
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate.trim())
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        // Evidence JSON is not a review receipt. Validate every actual receipt
        // before accepting one, so another fence cannot hide a risk or conflict.
        if (!['workflowReview', 'reviewStatus', 'approvalStatus', 'requiredFixes', 'readyForNextBatch', 'allowNextBatch', 'dependencyRisks']
          .some(key => key in parsed)) continue
        const outcome = reviewerOutcomeFromRecord(parsed as Record<string, unknown>, issues, riskContext)
        if (outcome) outcomes.push(outcome)
      }
    } catch {}
  }

  // A parsed but invalid receipt must not be reinterpreted by the legacy
  // text parser, which cannot validate individual JSON finding entries.
  if (issues.length) return { outcome: null, issue: issues[0] }
  if (outcomes.some(outcome => JSON.stringify(outcome) !== JSON.stringify(outcomes[0]))) {
    return { outcome: null, issue: 'Multiple workflowReview receipts conflict; return one coherent review receipt.' }
  }
  if (outcomes.length) return { outcome: outcomes[0]!, issue: null }

  const outcome = parseLegacyDevelopmentReviewerOutcome(content)
  return { outcome, issue: outcome ? null : 'Return a JSON workflowReview object with reviewStatus, requiredFixes and readyForNextBatch; the report could not be parsed as a valid receipt.' }
}

export function parseDevelopmentReviewerOutcome(content: string, riskContext: DependencyRiskContext = {}): DevelopmentReviewerOutcome | null {
  return inspectDevelopmentReviewerOutcome(content, riskContext).outcome
}

function parseLegacyDevelopmentReviewerOutcome(content: string): DevelopmentReviewerOutcome | null {
  const status = normalizeReviewStatus(/(?:reviewStatus|approvalStatus)\s*[:：]\s*([^\r\n]+)/i.exec(content)?.[1])
  const canonicalReady = /readyForNextBatch\s*[:：]\s*([^\r\n]+)/i.exec(content)?.[1]
  const legacyReady = /allowNextBatch\s*[:：]\s*([^\r\n]+)/i.exec(content)?.[1]
  const ready = booleanValue(canonicalReady ?? legacyReady)
  if (canonicalReady !== undefined && legacyReady !== undefined && booleanValue(canonicalReady) !== booleanValue(legacyReady)) return null
  const fixesMatch = /requiredFixes\s*[:：]\s*([^\r\n]+)/i.exec(content)
  if (!fixesMatch) return null
  const fixesText = fixesMatch[1]?.trim() ?? ''
  const requiredFixes = fixesText && !/^(none|no|无|没有|\[\])$/i.test(fixesText)
    ? [fixesText.replace(/^[-*\s]+/, '')]
    : []
  if (!status || ready === null) return null
  if (status === 'pass' && (!ready || requiredFixes.length)) return null
  if (status === 'needs-fix' && (ready || !requiredFixes.length)) return null
  return { reviewStatus: status, requiredFixes, readyForNextBatch: ready }
}

export function isDevelopmentBatchTaskSnapshot(
  snapshot: WorkflowTaskSnapshot,
): snapshot is WorkflowTaskSnapshot & { batchId: string, workflowRole: DevelopmentBatchAgentRole } {
  return snapshot.phaseId === DEVELOPMENT_IMPLEMENT_PHASE_ID
    && typeof snapshot.batchId === 'string'
    && (snapshot.workflowRole === 'coder' || snapshot.workflowRole === 'reviewer')
}

export function developmentBatchAgentBlockerReasons(
  state: WorkflowSessionState,
  phaseState: WorkflowPhaseCompletionState,
): string[] {
  if (
    state.templateIdentity?.id !== DEVELOPMENT_WORKFLOW_TEMPLATE_ID
    || phaseState.phaseId !== DEVELOPMENT_IMPLEMENT_PHASE_ID
  ) return []

  const snapshots = phaseState.taskSnapshots.filter(isDevelopmentBatchTaskSnapshot)
  if (!snapshots.length) {
    return ['No real Coder/Reviewer Agent batch execution has been recorded for this implementation phase.']
  }

  const batches = new Map<string, Partial<Record<DevelopmentBatchAgentRole, WorkflowTaskSnapshot>>>()
  for (const snapshot of snapshots) {
    const batch = batches.get(snapshot.batchId) ?? {}
    batch[snapshot.workflowRole] = snapshot
    batches.set(snapshot.batchId, batch)
  }

  const reasons: string[] = []
  for (const [batchId, roles] of [...batches.entries()].sort(([left], [right]) => naturalBatchSort(left, right))) {
    const coder = roles.coder
    const reviewer = roles.reviewer
    if (!coder || coder.status !== 'succeeded') reasons.push(`Batch ${batchId} is missing a successful Coder Agent run.`)
    if (!reviewer || reviewer.status !== 'succeeded') reasons.push(`Batch ${batchId} is missing a successful Reviewer Agent run.`)
    if (reviewer?.status === 'succeeded' && (reviewer.reviewStatus !== 'pass' || reviewer.readyForNextBatch !== true || reviewer.requiredFixes?.length)) {
      reasons.push(`Batch ${batchId} Reviewer has not returned a passing review with no required fixes.`)
    }
    if (
      coder?.status === 'succeeded'
      && reviewer?.status === 'succeeded'
      && typeof coder.completedStateVersion === 'number'
      && typeof reviewer.completedStateVersion === 'number'
      && reviewer.completedStateVersion <= coder.completedStateVersion
    ) {
      reasons.push(`Batch ${batchId} Reviewer must complete after its Coder Agent run.`)
    }
  }
  return reasons
}

const LEADER_MUTATING_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'PowerShell'])
const LEADER_FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])

export function developmentLeaderToolViolation(
  toolName: string,
  input: Record<string, unknown>,
  state: WorkflowSessionState | null | undefined,
  isSubagent: boolean,
): string | null {
  if (!isDevelopmentImplementationPhase(state) || isSubagent || !LEADER_MUTATING_TOOLS.has(toolName)) return null
  if (LEADER_FILE_TOOLS.has(toolName)) {
    const workspaceRoot = state?.workspaceRoot ?? activeRun(state!)?.workspaceRoot
    if (workspaceRoot && developmentArtifactWriteAllowed(workspaceRoot, input.file_path)) return null
  }
  return `WORKFLOW_DEVELOPMENT_LEADER_IMPLEMENTATION_FORBIDDEN: ${toolName} cannot be used by the Leader for production work in default development Stage 4. Launch the current Batch Coder Agent, then its Reviewer Agent. Leader writes are limited to .workflow artifacts.`
}
