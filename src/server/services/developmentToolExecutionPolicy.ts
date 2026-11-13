import { realpathSync } from 'node:fs'
import path from 'node:path'
import picomatch from 'picomatch'
import type { WorkflowSessionState } from './workflowTypes.js'

const DEVELOPMENT_MANAGED_TEMPLATE_IDS = new Set([
  'efficient-constrained-dev-debug-workflow-v5',
  'stradn-managed-development-workflow-v1',
])
export type DevelopmentWorkerContract = {
  sessionId: string
  phaseId: string
  runId?: string
  batchId?: string
  agentId?: string
  role: 'coder' | 'reviewer' | 'qa' | 'debug'
  workspaceRoot: string
  writeScopes: string[]
}

const CONTROL_TOOLS = new Set(['AskUserQuestion', 'request_workflow_route', 'submit_phase_completion', 'TaskOutput', 'TaskStop'])
const WORKER_AUTHORITY_TOOLS = new Set(['Agent', 'Task', 'AskUserQuestion', 'request_workflow_route', 'submit_phase_completion'])
const FILE_MUTATIONS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])
const REVIEW_TOOLS = new Set(['Read', 'Glob', 'Grep', 'LS', 'TodoWrite', 'Skill'])
const PHASE_ROLES: Record<string, string[]> = {
  'delegate-implement': ['coder', 'reviewer', 'debug'],
  'stradn-delivery': ['coder', 'reviewer', 'qa', 'debug'],
  'scenario-review': ['qa'],
  'local-preview': ['debug'],
}

export function isDevelopmentManagedWorkflowId(value: string | undefined): boolean {
  return typeof value === 'string' && DEVELOPMENT_MANAGED_TEMPLATE_IDS.has(value)
}

export function createDevelopmentWorkerContract(
  state: WorkflowSessionState | undefined,
  role: DevelopmentWorkerContract['role'] | undefined,
  workspaceRoot: string,
  batchId?: string,
  writeScopes: string[] = [],
): DevelopmentWorkerContract | undefined {
  if (!isDevelopmentManagedWorkflowId(templateId(state)) || !role || !state?.activePhaseId) return undefined
  return {
    sessionId: state.sessionId, phaseId: state.activePhaseId, runId: state.activeWorkflowRunId,
    role, batchId, workspaceRoot, writeScopes: [...writeScopes],
  }
}

export function developmentWorkerToolAllowed(toolName: string, role: DevelopmentWorkerContract['role']): boolean {
  if (WORKER_AUTHORITY_TOOLS.has(toolName)) return false
  if (role === 'reviewer') return REVIEW_TOOLS.has(toolName)
  return role === 'coder' || !FILE_MUTATIONS.has(toolName)
}

export function developmentWorkerContractPrompt(worker: DevelopmentWorkerContract): string {
  return [
    'Default development worker execution contract (runtime enforced)',
    JSON.stringify(worker),
    'Only the Leader can ask the user, delegate, submit phase completion, or route a phase. Return blockers to the Leader.',
    worker.role === 'reviewer'
      ? 'Review files and recorded evidence only. Shell tools are unavailable. Return missing validation as a required fix.'
      : worker.role === 'coder'
        ? 'Direct file mutations must stay within writeScopes. Shell commands still use the existing execution permissions and sandbox; do not use them to bypass scope or disable the sandbox.'
        : 'Validate or investigate only; do not edit files. Return required changes to the Leader for Coder repair.',
    'A tool error is not success. Correct only the identified fields or target and retry; if the contract blocks the task, return the blocker rather than bypassing it.',
  ].join('\n')
}

function discardedFields(raw: unknown, parsed: unknown, prefix = '', depth = 0): string[] {
  if (depth > 12 || !raw || typeof raw !== 'object' || !parsed || typeof parsed !== 'object') return []
  return Object.keys(raw).flatMap(key => {
    const field = prefix ? `${prefix}.${key}` : key
    return Object.prototype.hasOwnProperty.call(parsed, key)
      ? discardedFields((raw as Record<string, unknown>)[key], (parsed as Record<string, unknown>)[key], field, depth + 1)
      : [field]
  }).slice(0, 20)
}

function templateId(state: WorkflowSessionState | undefined): string | undefined {
  return state?.templateIdentity?.id ?? state?.templateSnapshot?.id ?? state?.template?.id
}

// Resolve existing ancestors as well as the final file: a new file inside a
// symlinked directory must not escape a declared task scope.
function canonicalPath(candidate: string): string | null {
  try { return realpathSync(candidate) } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return null
    const parent = path.dirname(candidate)
    if (parent === candidate) return null
    const resolved = canonicalPath(parent)
    return resolved ? path.join(resolved, path.basename(candidate)) : null
  }
}

function isChild(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

function fileWithinScope(file: unknown, worker: DevelopmentWorkerContract): boolean {
  if (typeof file !== 'string' || !file.trim()) return false
  const root = path.resolve(worker.workspaceRoot)
  const target = path.resolve(root, file)
  const canonicalRoot = canonicalPath(root)
  const canonicalTarget = canonicalPath(target)
  if (!canonicalRoot || !canonicalTarget || !isChild(root, target) || !isChild(canonicalRoot, canonicalTarget)) return false
  const relative = path.relative(root, target).split(path.sep).join('/')
  const realRelative = path.relative(canonicalRoot, canonicalTarget).split(path.sep).join('/')
  return worker.writeScopes.some(scope => {
    const normalized = scope.replaceAll('\\', '/').replace(/^\.\//, '')
    if (path.isAbsolute(normalized) || normalized.startsWith('!') || /^[A-Za-z]:/.test(normalized) || normalized.split('/').includes('..')) return false
    const prefix = normalized.replace(/\/$/, '') + '/'
    if ((relative === normalized || relative.startsWith(prefix)) && (realRelative === normalized || realRelative.startsWith(prefix))) return true
    return picomatch.isMatch(relative, normalized, { dot: true }) && picomatch.isMatch(realRelative, normalized, { dot: true })
  })
}

export function developmentArtifactWriteAllowed(workspaceRoot: string, file: unknown): boolean {
  return fileWithinScope(file, { sessionId: '', phaseId: '', role: 'coder', workspaceRoot, writeScopes: ['.workflow/**'] })
}

/** Validates actual execution, independently of what the model was shown. */
export function developmentToolCallViolation(
  toolName: string,
  input: Record<string, unknown>,
  state?: WorkflowSessionState,
  worker?: DevelopmentWorkerContract,
  parsedInput?: Record<string, unknown>,
  isSubagent = false,
): string | null {
  if (worker && (!isDevelopmentManagedWorkflowId(templateId(state)) || state?.sessionId !== worker.sessionId || state?.activePhaseId !== worker.phaseId
    || (worker.runId !== undefined && state?.activeWorkflowRunId !== worker.runId))) {
    return 'WORKFLOW_WORKER_STALE: This worker no longer owns the active workflow phase. Stop and return its result to the Leader; do not execute another tool.'
  }
  if (!isDevelopmentManagedWorkflowId(templateId(state))) return null
  if (isSubagent && !worker) {
    return 'WORKFLOW_WORKER_CONTRACT_REQUIRED: This worker has no current runtime authority. Return to the Leader and relaunch from the validated Batch/role; do not infer permissions from an old transcript.'
  }
  if (worker?.batchId) {
    const task = state?.runtimeContract?.phaseStates?.[worker.phaseId]?.taskSnapshots?.find(candidate =>
      candidate.batchId === worker.batchId && candidate.workflowRole === worker.role)
    if (!task || task.status !== 'running' || !worker.agentId || task.agentRunId !== worker.agentId) {
      return 'WORKFLOW_WORKER_STALE: This Batch is no longer running under this Agent Run. Stop and return to the Leader.'
    }
  }
  if (worker && WORKER_AUTHORITY_TOOLS.has(toolName)) {
    return 'WORKFLOW_WORKER_AUTHORITY: Only the Leader may delegate, ask the user, submit completion, or route a phase. Return blockers and evidence to the Leader.'
  }
  if ((state?.pendingConfirmation || ['paused', 'waiting_for_user', 'blocked', 'stopped', 'cancelled'].includes(state?.runStatus ?? '')
    || ['pending-confirmation', 'completed', 'cancelled', 'failed'].includes(state?.workflowStatus ?? '')) && !CONTROL_TOOLS.has(toolName)) {
    return 'WORKFLOW_EXECUTION_SUSPENDED: No business tool was executed. Wait for the Leader/user to resume or resolve the current workflow state.'
  }
  if (parsedInput) {
    const discarded = discardedFields(input, parsedInput)
    if (discarded.length) return `WORKFLOW_TOOL_FIELDS_INVALID: Remove unsupported fields: ${discarded.join(', ')}. Reissue this tool with its declared schema; no tool was executed.`
  }
  if (worker?.role === 'reviewer' && !REVIEW_TOOLS.has(toolName)) {
    return 'WORKFLOW_WORKER_READ_ONLY: Reviewer may only inspect files and evidence. Return required fixes or missing validation to the Leader; do not execute shell commands or mutation tools.'
  }
  if (worker && worker.role !== 'coder' && FILE_MUTATIONS.has(toolName)) {
    return 'WORKFLOW_WORKER_READ_ONLY: This worker must not edit files. Return the issue and evidence to the Leader for a Coder repair.'
  }
  if (worker?.role === 'coder' && FILE_MUTATIONS.has(toolName) && !fileWithinScope(input.file_path ?? input.notebook_path, worker)) {
    return 'WORKFLOW_WRITE_SCOPE: The target is outside this Batch write_scopes or crosses a symlink boundary. Use a declared target, or return a scope-change request to the Leader; no file was modified.'
  }
  if ((toolName === 'Bash' || toolName === 'PowerShell') && input.dangerouslyDisableSandbox === true) {
    return 'WORKFLOW_SANDBOX_BYPASS_FORBIDDEN: Omit dangerouslyDisableSandbox. A workflow tool call cannot disable the execution sandbox.'
  }
  if (toolName === 'Agent' || toolName === 'Task') {
    const role = input.workflow_role
    const allowed = PHASE_ROLES[state?.activePhaseId ?? ''] ?? []
    if (typeof role !== 'string' || !allowed.includes(role)) return `WORKFLOW_AGENT_ROLE: workflow_role is required and must be one of [${allowed.join(', ')}] for the active phase.`
    for (const field of ['description', 'prompt']) {
      if (typeof input[field] !== 'string' || !(input[field] as string).trim()) return `WORKFLOW_AGENT_FIELDS: ${field} must contain the assigned task. Reissue the Agent call with a non-empty ${field}.`
    }
    if (input.cwd !== undefined || input.name !== undefined || input.team_name !== undefined || input.mode !== undefined) return 'WORKFLOW_AGENT_FIELDS: Omit cwd, name, team_name, and mode. Use the current workflow workspace and normal scoped subagents; use isolation=worktree when required.'
    if ((role === 'coder' || role === 'reviewer') && input.run_in_background !== true) return 'WORKFLOW_AGENT_FIELDS: Coder/Reviewer require run_in_background=true and the complete workflow_parallel_plan.'
    if ((role === 'qa' || role === 'debug') && input.workflow_parallel_plan !== undefined) return 'WORKFLOW_AGENT_FIELDS: QA/Debug must omit workflow_parallel_plan; Batch scheduling belongs to Coder/Reviewer.'
  }
  return null
}
