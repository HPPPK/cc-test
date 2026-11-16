import { createHash, randomBytes } from 'node:crypto'
import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { writeFile, rename, unlink } from 'node:fs/promises'
import * as path from 'node:path'
import { ApiError } from '../middleware/errorHandler.js'
import { authoritativeDevelopmentBatchPlan, developmentBatchPlanSignature, parseDevelopmentBatchPlanDocument, validateDevelopmentBatchPlanTasks } from './workflowDevelopmentBatchAgentPolicy.js'
import type { WorkflowScopeAmendmentApproval, WorkflowScopeAmendmentRequest, WorkflowSessionState } from './workflowTypes.js'

function reject(message: string): never { throw new ApiError(409, message, 'WORKFLOW_SCOPE_AMENDMENT_INVALID') }
const hash = (content: string) => createHash('sha256').update(content).digest('hex')
function bindings(state: WorkflowSessionState) {
  if (state.templateIdentity?.id !== 'efficient-constrained-dev-debug-workflow-v5' || state.activePhaseId !== 'delegate-implement') reject('Scope amendments only apply to the canonical development implementation phase.')
  const run = state.workflowRuns?.find(item => item.id === state.activeWorkflowRunId)
  if (!run || !state.workspaceRoot || !['active', 'blocked', 'waiting_for_user'].includes(state.runStatus ?? '')) reject('Current workflow run is unavailable for a scope amendment.')
  if (path.basename(run.id) !== run.id || /[\\/\0:]/.test(run.id)) reject('Unsafe workflow run identity.')
  return { run, root: state.workspaceRoot, file: path.resolve(state.workspaceRoot, '.workflow', 'runs', run.id, 'delivery-plan.md') }
}

function idle(state: WorkflowSessionState) {
  const tasks = state.runtimeContract?.phaseStates['delegate-implement']?.taskSnapshots ?? []
  if (tasks.some(task => task.status === 'running' || task.status === 'waiting_user')) reject('Wait for existing phase workers to finish before amending the scope. No worker was stopped.')
  return tasks
}

function existingFile(root: string, relative: string, internal = false): string {
  try { return checkedExistingFile(root, relative, internal) }
  catch (error) {
    if (error instanceof ApiError) throw error
    return reject('Scope amendment requires an accessible existing regular file within the workspace.')
  }
}

function checkedExistingFile(root: string, relative: string, internal = false): string {
  if (!relative || relative.length > 512 || path.isAbsolute(relative) || /[\\\0:*?<>|"\[\]{}]/.test(relative)
    || relative.split('/').some(segment => !segment || segment === '.' || segment === '..')) reject('Use an exact workspace-relative file, without wildcards or traversal.')
  if (!internal && (relative.split('/').some(segment => segment.startsWith('.') || ['node_modules', 'vendor'].includes(segment))
    || /(?:^|\/)(?:AGENTS\.md|CLAUDE\.md|package(?:-lock)?\.json|bun\.lockb?|requirements[^/]*\.txt|pyproject\.toml|Cargo\.(?:toml|lock))$/i.test(relative)
    || /\.(?:pem|key|p12|pfx)$/i.test(relative))) reject('Protected configuration, credentials, dependency manifests and workflow metadata cannot be added through this amendment.')
  const resolvedRoot = realpathSync(root)
  let current = root
  for (const segment of relative.split('/')) {
    current = path.join(current, segment)
    if (lstatSync(current).isSymbolicLink()) reject('Scope amendment paths cannot cross symlinks.')
  }
  const target = realpathSync(current)
  const within = path.relative(resolvedRoot, target)
  if (!within || within.startsWith('..') || path.isAbsolute(within) || !lstatSync(target).isFile()) reject('Scope amendment requires an existing regular file within the workspace.')
  return target
}

function planDocument(content: string) {
  const candidates: Array<{ start: number; end: number; json: Record<string, unknown>; tasks: Array<Record<string, unknown>> }> = []
  const add = (raw: string, start: number, end: number) => {
    try {
      const json = JSON.parse(raw)
      if (!json || typeof json !== 'object' || Array.isArray(json)) return
      const container = json.workflow_parallel_plan ?? json.workflowParallelPlan ?? json.batchPlan ?? json
      if (container && Array.isArray(container.tasks)) candidates.push({ start, end, json, tasks: container.tasks })
    } catch {}
  }
  for (const match of content.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    const raw = match[1]!
    const offset = match.index! + match[0].indexOf(raw)
    add(raw, offset, offset + raw.length)
  }
  if (!candidates.length && content.trim().startsWith('{')) add(content.trim(), content.indexOf('{'), content.lastIndexOf('}') + 1)
  if (candidates.length !== 1) reject('The accepted delivery plan must contain one unambiguous Batch JSON block.')
  return candidates[0]!
}

export function validateScopeAmendmentFile(state: WorkflowSessionState, approval: WorkflowScopeAmendmentApproval) {
  const bound = bindings(state)
  if (approval.schemaVersion !== 1 || approval.runId !== bound.run.id || approval.phaseId !== state.activePhaseId || approval.workspaceRoot !== bound.root) reject('Scope approval belongs to a different workflow run, phase or workspace.')
  const file = existingFile(bound.root, path.relative(bound.root, bound.file).split(path.sep).join('/'), true)
  const content = readFileSync(file, 'utf8')
  if (hash(content) !== approval.basePlanContentHash) reject('The delivery plan changed after the scope request. Request a fresh approval.')
  return { ...bound, file, content }
}

export function prepareScopeAmendment(state: WorkflowSessionState, request: WorkflowScopeAmendmentRequest): WorkflowScopeAmendmentApproval {
  const bound = bindings(state)
  const tasks = idle(state)
  if (!request || typeof request.batchId !== 'string' || !Array.isArray(request.addWriteScopes) || !request.addWriteScopes.length || request.addWriteScopes.length > 4) reject('A scope amendment requires one Batch and 1–4 exact existing files.')
  const plan = authoritativeDevelopmentBatchPlan(state)
  const batch = plan?.find(item => item.id === request.batchId)
  if (!plan || !batch || !tasks.some(task => task.batchId === batch.id && task.workflowRole === 'coder')) reject('The requested Batch is not in the accepted implementation plan.')
  const added = [...new Set(request.addWriteScopes)]
  for (const file of added) {
    if (typeof file !== 'string') reject('Scope amendment paths must be strings.')
    existingFile(bound.root, file)
    if (batch.writeScopes.some(scope => scope === file || scope.endsWith('/') && file.startsWith(scope))) reject('The file is already in this Batch scope; no amendment is needed.')
  }
  const file = existingFile(bound.root, path.relative(bound.root, bound.file).split(path.sep).join('/'), true)
  const content = readFileSync(file, 'utf8')
  planDocument(content)
  const parsed = parseDevelopmentBatchPlanDocument(content)
  if (!parsed.plan || developmentBatchPlanSignature(parsed.plan) !== developmentBatchPlanSignature(plan)) reject('The plan file and accepted task plan disagree. Resolve that conflict before scope approval.')
  const nextPlan = plan.map(task => task.id === batch.id ? { ...task, writeScopes: [...task.writeScopes, ...added] } : task)
  const issues = validateDevelopmentBatchPlanTasks(nextPlan)
  if (issues.length) reject(`Scope amendment violates the accepted dependency/parallelism rules: ${issues.join(' ')}`)
  return { schemaVersion: 1, batchId: batch.id, addWriteScopes: added, runId: bound.run.id, phaseId: state.activePhaseId!, workspaceRoot: bound.root,
    basePlanSignature: developmentBatchPlanSignature(plan), basePlanContentHash: hash(content) }
}

/** Pure state update. The state store owns the CAS-locked project-file commit. */
export function applyScopeAmendment(state: WorkflowSessionState, approval: WorkflowScopeAmendmentApproval, now: string): void {
  const { run, content } = validateScopeAmendmentFile(state, approval)
  const checked = prepareScopeAmendment(state, approval)
  if (checked.basePlanSignature !== approval.basePlanSignature) reject('The accepted plan changed after approval was requested.')
  const document = planDocument(content)
  const rawTask = document.tasks.find(task => (task.id ?? task.batch_id ?? task.batchId) === approval.batchId)
  if (!rawTask) reject('The approved Batch is missing from the plan JSON block.')
  const field = Object.hasOwn(rawTask, 'write_scopes') ? 'write_scopes' : 'writeScopes'
  if (!Array.isArray(rawTask[field])) reject('Batch write scopes are unavailable.')
  rawTask[field] = [...rawTask[field] as string[], ...approval.addWriteScopes]
  const nextContent = content.slice(0, document.start) + JSON.stringify(document.json, null, 2) + '\n' + content.slice(document.end)
  const nextPlan = parseDevelopmentBatchPlanDocument(nextContent).plan
  if (!nextPlan) reject('Amended delivery plan could not be validated.')
  const signature = developmentBatchPlanSignature(nextPlan)
  const affected = new Set([approval.batchId])
  let changed = true
  while (changed) {
    changed = false
    for (const task of nextPlan) if (!affected.has(task.id) && task.dependsOn.some(id => affected.has(id))) { affected.add(task.id); changed = true }
  }
  const phaseState = state.runtimeContract!.phaseStates['delegate-implement']!
  phaseState.taskSnapshots = phaseState.taskSnapshots.map(task => {
    if (!affected.has(task.batchId ?? '')) return { ...task, developmentPlanSignature: signature }
    const { agentId: _agentId, agentRunId: _agentRunId, toolUseId: _toolUseId, reason: _reason, startedAt: _startedAt, completedAt: _completedAt,
      startedStateVersion: _startedStateVersion, completedStateVersion: _completedStateVersion, lastHeartbeatAt: _lastHeartbeatAt,
      reviewStatus: _reviewStatus, requiredFixes: _requiredFixes, readyForNextBatch: _readyForNextBatch, outputArtifactRefs: _outputArtifactRefs, ...rest } = task
    const ownPlan = nextPlan.find(item => item.id === task.batchId)!
    return { ...rest, status: task.workflowRole === 'coder' && ownPlan.dependsOn.every(id => !affected.has(id)) ? 'pending' as const : 'waiting_dependency' as const,
      writeScopes: task.workflowRole === 'coder' ? ownPlan.writeScopes : [], developmentPlanSignature: signature, updatedAt: now }
  })
  run.artifacts = run.artifacts.map(artifact => artifact.id === 'delivery-plan' || artifact.filename === 'delivery-plan.md'
    ? { ...artifact, content: nextContent, developmentBatchPlan: nextPlan, developmentBatchPlanSignature: signature, updatedAt: now } : artifact)
  const phase = state.phases.find(item => item.id === 'delegate-implement')!
  // New scheduler cohort; no old worker can hold a permit (idle checked above).
  phase.startedAt = now
}

/** Used only after the state store's version CAS passes under its write lock. */
async function writePlanAtomically(file: string, content: string) {
  const temp = `${file}.scope-commit-${randomBytes(8).toString('hex')}`
  try { await writeFile(temp, content, { encoding: 'utf8', flag: 'wx' }); await rename(temp, file) }
  finally { await unlink(temp).catch(() => {}) }
}

export function scopeAmendmentStorageTransaction(previous: WorkflowSessionState, next: WorkflowSessionState) {
  const approval = previous.pendingRoute?.scopeAmendment
  const accepted = next.transitionHistory?.at(-1)?.scopeAmendment
  if (!approval || !accepted || accepted.basePlanSignature !== approval.basePlanSignature || accepted.batchId !== approval.batchId) return undefined
  let original: { file: string; content: string } | undefined
  return {
    async beforeSync() {
      original = validateScopeAmendmentFile(previous, approval)
      const amended = next.workflowRuns?.find(run => run.id === approval.runId)?.artifacts.find(artifact => artifact.id === 'delivery-plan' || artifact.filename === 'delivery-plan.md')?.content
      if (typeof amended !== 'string') reject('The amended plan content is unavailable for commit.')
      await writePlanAtomically(original.file, amended)
    },
    async rollback() {
      if (!original) return
      const bound = bindings(previous)
      existingFile(bound.root, path.relative(bound.root, original.file).split(path.sep).join('/'), true)
      await writePlanAtomically(original.file, original.content)
    },
  }
}

/** Optional v1 approval payloads upgrade without changing old pending routes. */
export function migrateWorkflowScopeApproval(state: WorkflowSessionState): WorkflowSessionState {
  const route = state.pendingRoute
  if (!route || route.scopeAmendment === undefined) return state
  const value = route.scopeAmendment
  if (value && value.schemaVersion === 1 && typeof value.batchId === 'string' && Array.isArray(value.addWriteScopes)
    && value.addWriteScopes.every(item => typeof item === 'string')
    && ['runId', 'phaseId', 'workspaceRoot', 'basePlanSignature', 'basePlanContentHash'].every(key => typeof (value as unknown as Record<string, unknown>)[key] === 'string')) return state
  const { scopeAmendment: _invalid, ...retained } = route
  return { ...state, pendingRoute: { ...retained, status: 'rejected' }, runStatus: 'blocked', status: 'running', workflowStatus: 'running',
    blockedReason: 'Stored scope approval is unsupported or incomplete. Request a fresh scope amendment; no Batch scope was changed.',
    stateVersion: (state.stateVersion ?? 0) + 1, revision: (state.revision ?? 0) + 1 }
}
