import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { ApiError } from '../middleware/errorHandler.js'
import { getAppStoragePath } from '../../utils/appIdentity.js'
import type {
  WorkflowArtifact,
  WorkflowPreviewState,
  WorkflowSessionState,
} from './workflowTypes.js'

export type WorkflowPreviewStartInput = {
  command?: string
  cwd?: string
  detectedPort?: number
  detectedUrl?: string
}

export type WorkflowPreviewStopInput = {
  reason?: string
}

export type WorkflowPreviewResult = {
  state: WorkflowSessionState
  preview: WorkflowPreviewState
}

type PreviewProcessRecord = {
  child: ChildProcessWithoutNullStreams
  logPath: string
  logs: string[]
}

const previewProcesses = new Map<string, PreviewProcessRecord>()
const MAX_LOG_LINES = 40

function configDir(): string {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
}

function workflowSessionDir(sessionId: string): string {
  return getAppStoragePath(configDir(), 'workflow-sessions', sessionId)
}

function previewLogPath(state: WorkflowSessionState, startedAt: string): string {
  const safeStartedAt = startedAt.replace(/[:.]/g, '-')
  if (state.workspaceRoot) {
    return path.join(state.workspaceRoot, '.workflow', 'logs', `preview-${safeStartedAt}.log`)
  }
  return path.join(workflowSessionDir(state.sessionId), 'preview', `${safeStartedAt}.log`)
}

function cloneState(state: WorkflowSessionState): WorkflowSessionState {
  return JSON.parse(JSON.stringify(state)) as WorkflowSessionState
}

function isRunningPreview(preview: unknown): preview is WorkflowPreviewState {
  if (!preview || typeof preview !== 'object' || Array.isArray(preview)) return false
  const status = (preview as WorkflowPreviewState).status
  return status === 'starting' || status === 'running'
}

function touchState(state: WorkflowSessionState, now: string): WorkflowSessionState {
  return {
    ...state,
    status: state.workflowStatus,
    stateVersion: (typeof state.stateVersion === 'number' ? state.stateVersion : 0) + 1,
    revision: (typeof state.revision === 'number' ? state.revision : 0) + 1,
    updatedAt: now,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function activeRunIndex(state: WorkflowSessionState): number {
  if (!Array.isArray(state.workflowRuns)) return -1
  if (state.activeWorkflowRunId) {
    return state.workflowRuns.findIndex((run) => run.id === state.activeWorkflowRunId)
  }
  return state.workflowRuns.findIndex((run) => run.status === 'active')
}

function updateActiveRunArtifact(
  state: WorkflowSessionState,
  preview: WorkflowPreviewState,
  now: string,
): void {
  const index = activeRunIndex(state)
  if (index < 0 || !state.workflowRuns?.[index]) return

  const run = state.workflowRuns[index]
  const artifact: WorkflowArtifact = {
    id: 'run-preview',
    filename: 'run-preview.md',
    kind: 'markdown',
    required: true,
    phaseId: state.activePhaseId ?? 'run-preview',
    createdAt: now,
    updatedAt: now,
    description: 'Workflow-owned local preview status, command, logs, URL, and DB safety notes.',
    content: renderPreviewArtifact(preview),
  }
  const artifacts = run.artifacts.filter((candidate) => candidate.id !== artifact.id)
  state.workflowRuns[index] = {
    ...run,
    artifacts: [...artifacts, artifact],
    history: [
      ...run.history,
      {
        type: 'preview-status',
        at: now,
        phaseId: state.activePhaseId ?? undefined,
        summary: `Local preview ${preview.status}.`,
      },
    ],
    updatedAt: now,
  }
}

function renderPreviewArtifact(preview: WorkflowPreviewState): string {
  return [
    '# run-preview.md',
    '',
    `status: ${preview.status}`,
    preview.command ? `command: ${preview.command}` : null,
    preview.cwd ? `cwd: ${preview.cwd}` : null,
    preview.pid ? `pid: ${preview.pid}` : null,
    preview.detectedUrl ? `detectedUrl: ${preview.detectedUrl}` : null,
    preview.detectedPort ? `detectedPort: ${preview.detectedPort}` : null,
    `dbStatus: ${preview.dbStatus ?? 'unknown'}`,
    preview.logPath ? `logPath: ${preview.logPath}` : null,
    preview.error ? `error: ${preview.error}` : null,
    '',
    'logs:',
    ...(preview.logs ?? []).map((line) => `- ${line}`),
  ].filter((line): line is string => line !== null).join('\n')
}

function appendLogLine(record: PreviewProcessRecord, line: string): void {
  const trimmed = line.trimEnd()
  if (!trimmed) return
  record.logs.push(trimmed)
  if (record.logs.length > MAX_LOG_LINES) {
    record.logs.splice(0, record.logs.length - MAX_LOG_LINES)
  }
  void fs.appendFile(record.logPath, `${trimmed}\n`, 'utf-8').catch(() => {})
}

async function readLogTail(logPath: string | undefined): Promise<string[]> {
  if (!logPath) return []
  try {
    const raw = await fs.readFile(logPath, 'utf-8')
    return raw.split(/\r?\n/).filter(Boolean).slice(-MAX_LOG_LINES)
  } catch {
    return []
  }
}

function resolveCwd(state: WorkflowSessionState, requestedCwd: string | undefined): string {
  const base = state.workspaceRoot || process.cwd()
  const cwd = path.resolve(requestedCwd || base)
  if (state.workspaceRoot && !isPathInsideOrEqual(cwd, path.resolve(state.workspaceRoot))) {
    throw ApiError.badRequest('Workflow preview cwd must stay inside the workflow workspace')
  }
  return cwd
}

function isPathInsideOrEqual(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

async function inferCommand(state: WorkflowSessionState, cwd: string): Promise<string> {
  const artifactCommand = commandFromWorkflowArtifacts(state)
  if (artifactCommand) return artifactCommand

  const packageJsonPath = path.join(cwd, 'package.json')
  try {
    const parsed = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8')) as {
      scripts?: Record<string, unknown>
      packageManager?: string
    }
    const scripts = parsed.scripts ?? {}
    const scriptName = typeof scripts.dev === 'string'
      ? 'dev'
      : typeof scripts.start === 'string'
        ? 'start'
        : null
    if (!scriptName) {
      throw ApiError.badRequest('Workflow preview could not infer a dev or start script from package.json')
    }
    return `${await packageManagerCommand(cwd, parsed.packageManager)} run ${scriptName}`
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw ApiError.badRequest('Workflow preview requires a command or project-context run command')
  }
}

async function packageManagerCommand(cwd: string, packageManager: string | undefined): Promise<string> {
  if (packageManager?.startsWith('bun@')) return 'bun'
  if (packageManager?.startsWith('pnpm@')) return 'pnpm'
  if (packageManager?.startsWith('yarn@')) return 'yarn'
  if (await exists(path.join(cwd, 'bun.lock')) || await exists(path.join(cwd, 'bun.lockb'))) return 'bun'
  if (await exists(path.join(cwd, 'pnpm-lock.yaml'))) return 'pnpm'
  if (await exists(path.join(cwd, 'yarn.lock'))) return 'yarn'
  return 'npm'
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

function commandFromWorkflowArtifacts(state: WorkflowSessionState): string | null {
  const runs = Array.isArray(state.workflowRuns) ? [...state.workflowRuns].reverse() : []
  for (const run of runs) {
    for (const artifact of [...run.artifacts].reverse()) {
      if (!isProjectContextArtifact(artifact)) continue
      const command = commandFromArtifactContent(artifact.content)
      if (command) return command
    }
  }
  return null
}

function isProjectContextArtifact(artifact: WorkflowArtifact): boolean {
  return artifact.id === 'project-context' || artifact.filename === 'project-context.md'
}

function commandFromArtifactContent(content: unknown): string | null {
  if (isRecord(content)) {
    return commandFromRecord(content)
  }
  if (typeof content !== 'string') return null

  try {
    const parsed = JSON.parse(content) as unknown
    if (isRecord(parsed)) {
      const command = commandFromRecord(parsed)
      if (command) return command
    }
  } catch {
    // Markdown artifacts are common; fall through to text heuristics.
  }

  const directLine = content.match(/(?:^|\n)\s*(?:runCommands?|devCommand|startCommand)\s*[:=]\s*(.+)/i)?.[1]
  if (directLine) {
    const cleaned = cleanupCommand(directLine)
    if (cleaned) return cleaned
  }

  const commonCommand = content.match(/\b(?:bun|npm|pnpm|yarn)\s+(?:run\s+)?(?:dev|start)\b[^\n]*/i)?.[0]
    ?? content.match(/\b(?:python3?|flask|uvicorn)\s+[^\n]+/i)?.[0]
  return commonCommand ? cleanupCommand(commonCommand) : null
}

function commandFromRecord(record: Record<string, unknown>): string | null {
  for (const key of ['runCommands', 'runCommand', 'devCommand', 'startCommand']) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (Array.isArray(value)) {
      const first = value.find((item): item is string => typeof item === 'string' && item.trim().length > 0)
      if (first) return first.trim()
    }
  }
  return null
}

function cleanupCommand(value: string): string | null {
  const cleaned = value
    .replace(/^[-*]\s*/, '')
    .replace(/^["'`]+|["'`,.;\]]+$/g, '')
    .trim()
  return cleaned || null
}

function applyPreviewState(
  stateInput: WorkflowSessionState,
  preview: WorkflowPreviewState,
  now: string,
): WorkflowSessionState {
  const state = touchState(cloneState(stateInput), now)
  state.preview = preview
  updateActiveRunArtifact(state, preview, now)
  return state
}


async function waitForPreviewProcessExit(child: ChildProcessWithoutNullStreams, timeoutMs = 2_000): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, timeoutMs)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

async function terminatePreviewProcess(record: PreviewProcessRecord): Promise<void> {
  const pid = record.child.pid
  if (!pid) {
    record.child.kill('SIGTERM')
    await waitForPreviewProcessExit(record.child)
    return
  }

  if (process.platform === 'win32') {
    await new Promise<void>((resolve, reject) => {
      const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      })
      killer.once('error', reject)
      killer.once('exit', (code) => {
        if (code === 0 || record.child.exitCode !== null || record.child.signalCode !== null) {
          resolve()
        } else {
          reject(new Error(`taskkill exited with code ${code ?? 'null'}`))
        }
      })
    })
    await waitForPreviewProcessExit(record.child)
    return
  }

  try {
    process.kill(-pid, 'SIGTERM')
  } catch {
    record.child.kill('SIGTERM')
  }
  await waitForPreviewProcessExit(record.child)
}
export class WorkflowPreviewService {
  async startPreview(
    state: WorkflowSessionState,
    input: WorkflowPreviewStartInput = {},
  ): Promise<WorkflowPreviewResult> {
    if (state.mode !== 'workflow') {
      throw ApiError.badRequest('Workflow preview is only available for workflow sessions')
    }
    if (isRunningPreview(state.preview)) {
      throw ApiError.conflict('Workflow preview is already running')
    }

    const now = new Date().toISOString()
    const cwd = resolveCwd(state, input.cwd)
    const command = input.command?.trim() || await inferCommand(state, cwd)
    const logPath = previewLogPath(state, now)
    await fs.mkdir(path.dirname(logPath), { recursive: true })
    await fs.writeFile(logPath, `Workflow preview started at ${now}\n$ ${command}\n`, 'utf-8')

    const child = spawn(command, {
      cwd,
      shell: true,
      detached: true,
      env: { ...process.env, FORCE_COLOR: '0' },
    })
    const record: PreviewProcessRecord = {
      child,
      logPath,
      logs: [`$ ${command}`],
    }
    previewProcesses.set(state.sessionId, record)
    child.stdout.on('data', (chunk) => {
      appendLogLine(record, String(chunk))
    })
    child.stderr.on('data', (chunk) => {
      appendLogLine(record, String(chunk))
    })
    child.once('exit', (code, signal) => {
      appendLogLine(record, `preview process exited code=${code ?? 'null'} signal=${signal ?? 'null'}`)
      previewProcesses.delete(state.sessionId)
    })
    child.once('error', (error) => {
      appendLogLine(record, `preview process error: ${error.message}`)
      previewProcesses.delete(state.sessionId)
    })

    const preview: WorkflowPreviewState = {
      status: 'running',
      command,
      cwd,
      pid: child.pid,
      processOwner: 'workflow',
      logPath,
      logs: record.logs,
      ...(input.detectedPort ? { detectedPort: input.detectedPort } : {}),
      ...(input.detectedUrl ? { detectedUrl: input.detectedUrl } : {}),
      dbStatus: 'unknown',
      startedAt: now,
      updatedAt: now,
    }
    return {
      state: applyPreviewState(state, preview, now),
      preview,
    }
  }

  async stopPreview(
    state: WorkflowSessionState,
    input: WorkflowPreviewStopInput = {},
  ): Promise<WorkflowPreviewResult> {
    if (state.mode !== 'workflow') {
      throw ApiError.badRequest('Workflow preview is only available for workflow sessions')
    }

    const now = new Date().toISOString()
    const current = isRunningPreview(state.preview)
      ? state.preview
      : {
          status: 'idle',
          updatedAt: now,
        } satisfies WorkflowPreviewState
    const record = previewProcesses.get(state.sessionId)
    let error: string | undefined

    if (record) {
      const pid = record.child.pid
      try {
        await terminatePreviewProcess(record)
      } catch (killError) {
        error = killError instanceof Error ? killError.message : String(killError)
      } finally {
        previewProcesses.delete(state.sessionId)
      }
    } else if (current.pid) {
      error = 'Preview process is not tracked by this server process; no external PID was killed.'
    }

    const logs = [
      ...(record?.logs ?? await readLogTail(current.logPath)),
      input.reason ? `stop reason: ${input.reason}` : 'stop requested',
      ...(error ? [error] : []),
    ].slice(-MAX_LOG_LINES)
    const preview: WorkflowPreviewState = {
      ...current,
      status: error ? 'failed' : 'stopped',
      logs,
      stoppedAt: now,
      updatedAt: now,
      ...(error ? { error } : {}),
    }

    if (preview.logPath) {
      await fs.appendFile(preview.logPath, `${logs.slice(-2).join('\n')}\n`, 'utf-8').catch(() => {})
    }

    return {
      state: applyPreviewState(state, preview, now),
      preview,
    }
  }
}
