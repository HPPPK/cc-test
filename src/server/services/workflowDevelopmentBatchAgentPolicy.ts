import { createHash, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
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
      const plan = taskResults.map((result) => result.task).filter((task): task is DevelopmentBatchPlanTask => Boolean(task))
      if (!issues.length) issues.push(...validateDevelopmentBatchPlanTasks(plan))
      if (!issues.length) return { plan, issues: [] }
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
    return [
      'Default development Stage 3 -> Stage 4 handoff contract',
      `Write the final delivery plan to exactly: ${relativePath}`,
      'Before submitting Stage 3 completion, include exactly one machine-readable JSON code block in that file. Use stable individual Batch IDs (B1, B2, B3); never use a range such as B1-B3 as one Batch ID.',
      'Use this shape, with the same field names later passed to Agent.workflow_parallel_plan.tasks:',
      '```json',
      '{',
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
      `Treat ${relativePath} as the immutable, already-validated Stage 3 Batch plan.`,
      'Every Coder/Reviewer Agent call must reuse its complete tasks array without changing IDs, dependencies, write scopes, resource claims, or execution modes.',
      'Do not edit delivery-plan.md from Stage 4 to work around a scheduling error. A plan defect must be corrected in Stage 3; Stage 4 only consumes the accepted plan.',
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

  let resolved = readDevelopmentDeliveryPlanSync(state)
  const canonicalPath = canonicalDevelopmentDeliveryPlanPath(state)
  if (!resolved && canonicalPath) {
    try {
      resolved = { content: await readFile(canonicalPath, 'utf8'), sourcePath: canonicalPath }
    } catch {}
  }
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

function authoritativeDevelopmentBatchPlan(state: WorkflowSessionState): DevelopmentBatchPlanTask[] | null {
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

function reviewerOutcomeFromRecord(record: Record<string, unknown>): DevelopmentReviewerOutcome | null {
  const nested = record.workflowReview
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return reviewerOutcomeFromRecord(nested as Record<string, unknown>)
  }
  const reviewStatus = normalizeReviewStatus(record.reviewStatus ?? record.approvalStatus)
  const readyForNextBatch = booleanValue(record.readyForNextBatch)
  const rawFixes = record.requiredFixes
  const requiredFixes = Array.isArray(rawFixes)
    ? rawFixes.filter((value): value is string => typeof value === 'string' && value.trim().length > 0).map((value) => value.trim())
    : typeof rawFixes === 'string' && rawFixes.trim() && !/^(none|no|无|没有|\[\])$/i.test(rawFixes.trim())
      ? [rawFixes.trim()]
      : []
  if (!reviewStatus || readyForNextBatch === null) return null
  if (reviewStatus === 'pass' && (!readyForNextBatch || requiredFixes.length)) return null
  if (reviewStatus === 'needs-fix' && (readyForNextBatch || !requiredFixes.length)) return null
  return { reviewStatus, requiredFixes, readyForNextBatch }
}

export function parseDevelopmentReviewerOutcome(content: string): DevelopmentReviewerOutcome | null {
  const candidates = [content]
  for (const match of content.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) candidates.push(match[1])
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate.trim())
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const outcome = reviewerOutcomeFromRecord(parsed as Record<string, unknown>)
        if (outcome) return outcome
      }
    } catch {}
  }

  const status = normalizeReviewStatus(/(?:reviewStatus|approvalStatus)\s*[:：]\s*([^\r\n]+)/i.exec(content)?.[1])
  const ready = booleanValue(/readyForNextBatch\s*[:：]\s*([^\r\n]+)/i.exec(content)?.[1])
  const fixesText = /requiredFixes\s*[:：]\s*([^\r\n]+)/i.exec(content)?.[1]?.trim() ?? ''
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
    if (workspaceRoot && isWorkflowInternalPath(workspaceRoot, input.file_path)) return null
  }
  return `WORKFLOW_DEVELOPMENT_LEADER_IMPLEMENTATION_FORBIDDEN: ${toolName} cannot be used by the Leader for production work in default development Stage 4. Launch the current Batch Coder Agent, then its Reviewer Agent. Leader writes are limited to .workflow artifacts.`
}
