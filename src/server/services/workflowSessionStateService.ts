import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { randomBytes } from 'node:crypto'
import { ApiError } from '../middleware/errorHandler.js'
import { getAppStoragePath } from '../../utils/appIdentity.js'
import type {
  WorkflowArtifactPointer,
  WorkflowPhaseArtifact,
  WorkflowRun,
  WorkflowSessionState,
} from './workflowTypes.js'
import { ensureWorkflowArtifactStorage } from './workflowArtifactStorage.js'
import { migrateWorkflowRuntimeContract } from './workflowCompletionGate.js'

export type WorkflowStateReadResult = {
  exists: boolean
  state: WorkflowSessionState | null
  recoveryStatus: 'ok' | 'state-missing' | 'state-corrupt'
  errorCode: 'WORKFLOW_STATE_UNAVAILABLE' | null
}

export type WorkflowStateWriteResult = {
  state: WorkflowSessionState
  pointer: WorkflowArtifactPointer
}

export type WorkflowStateUpdateOptions = {
  expectedStateVersion?: number
  expectedRevision?: number
}

export type WorkflowPhaseArtifactWriteResult = {
  artifact: WorkflowPhaseArtifact
  pointer: WorkflowArtifactPointer
}

function errnoCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined
}

function configDir(): string {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
}

function workflowSessionDir(sessionId: string): string {
  return getAppStoragePath(configDir(), 'workflow-sessions', sessionId)
}

function assertSafeArtifactId(artifactId: unknown): asserts artifactId is string {
  if (
    typeof artifactId !== 'string'
    || artifactId.length === 0
    || artifactId === '.'
    || artifactId === '..'
    || artifactId.includes('/')
    || artifactId.includes('\\')
    || path.basename(artifactId) !== artifactId
  ) {
    throw ApiError.badRequest('Invalid workflow artifactId')
  }
}

function normalizeJsonObject<T extends Record<string, unknown>>(value: unknown, label: string): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw ApiError.badRequest(`Invalid ${label} JSON shape`)
  }
  return value as T
}

function statePointer(state: WorkflowSessionState): WorkflowArtifactPointer {
  return {
    kind: 'workflow-state',
    sessionId: state.sessionId,
    artifactId: 'state',
    schemaVersion: state.schemaVersion,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    label: 'Workflow state',
  }
}

function artifactPointer(artifact: WorkflowPhaseArtifact): WorkflowArtifactPointer {
  return {
    kind: 'phase-artifact',
    sessionId: artifact.sessionId,
    artifactId: artifact.artifactId,
    schemaVersion: artifact.schemaVersion,
    createdAt: artifact.createdAt,
    updatedAt: artifact.createdAt,
    label: artifact.title,
  }
}

function projectReadableState(state: WorkflowSessionState): WorkflowSessionState {
  return {
    ...state,
    lastRecoveryStatus: 'ok',
  }
}

function activeRunForStorage(state: WorkflowSessionState): { run: WorkflowRun; index: number } | null {
  const runs = Array.isArray(state.workflowRuns) ? state.workflowRuns : []
  if (runs.length === 0) return null
  const activeIndex = state.activeWorkflowRunId
    ? runs.findIndex((run) => run.id === state.activeWorkflowRunId)
    : runs.findIndex((run) => run.status === 'active')
  const index = activeIndex >= 0 ? activeIndex : runs.length - 1
  const run = runs[index]
  return run ? { run, index } : null
}

async function syncProjectWorkflowArtifacts(state: WorkflowSessionState): Promise<void> {
  if (state.mode !== 'workflow' || !state.workspaceRoot) return
  const activeRun = activeRunForStorage(state)
  if (!activeRun) return

  await ensureWorkflowArtifactStorage({
    workspaceRoot: state.workspaceRoot,
    run: activeRun.run,
    runIndex: activeRun.index,
    now: state.updatedAt || new Date().toISOString(),
  })
}

async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
  const tmpFile = `${filePath}.tmp.${process.pid}.${Date.now()}.${randomBytes(6).toString('hex')}`

  await fs.mkdir(path.dirname(filePath), { recursive: true })

  try {
    await fs.writeFile(tmpFile, `${JSON.stringify(value, null, 2)}\n`, 'utf-8')
    await fs.rename(tmpFile, filePath)
  } catch (error) {
    await fs.unlink(tmpFile).catch(() => {})
    throw ApiError.internal(`Failed to write workflow artifact: ${error}`)
  }
}

function assertExpectedVersion(
  current: WorkflowSessionState,
  options: WorkflowStateUpdateOptions,
): void {
  if (options.expectedStateVersion !== undefined && current.stateVersion !== options.expectedStateVersion) {
    throw new ApiError(409, 'Workflow state version is stale.', 'WORKFLOW_STATE_STALE')
  }
  if (options.expectedRevision !== undefined && current.revision !== options.expectedRevision) {
    throw new ApiError(409, 'Workflow state revision is stale.', 'WORKFLOW_STATE_STALE')
  }
}

export class WorkflowSessionStateService {
  private static writeLocks = new Map<string, Promise<void>>()

  private statePath(sessionId: string): string {
    return path.join(workflowSessionDir(sessionId), 'state.json')
  }

  private phaseArtifactPath(sessionId: string, artifactId: string): string {
    assertSafeArtifactId(artifactId)
    return path.join(workflowSessionDir(sessionId), 'artifacts', `${artifactId}.json`)
  }

  private async withWriteLock<T>(lockKey: string, task: () => Promise<T>): Promise<T> {
    const previousWrite = WorkflowSessionStateService.writeLocks.get(lockKey) ?? Promise.resolve()
    const nextWrite = previousWrite.catch(() => {}).then(task)
    const trackedWrite = nextWrite.then(() => {}, () => {})

    WorkflowSessionStateService.writeLocks.set(lockKey, trackedWrite)

    try {
      return await nextWrite
    } finally {
      if (WorkflowSessionStateService.writeLocks.get(lockKey) === trackedWrite) {
        WorkflowSessionStateService.writeLocks.delete(lockKey)
      }
    }
  }

  private async readStoredState(sessionId: string): Promise<WorkflowStateReadResult> {
    const filePath = this.statePath(sessionId)
    let raw: string

    try {
      raw = await fs.readFile(filePath, 'utf-8')
    } catch (error) {
      if (errnoCode(error) === 'ENOENT') {
        return {
          exists: false,
          state: null,
          recoveryStatus: 'state-missing',
          errorCode: 'WORKFLOW_STATE_UNAVAILABLE',
        }
      }
      throw ApiError.internal(`Failed to read workflow state: ${error}`)
    }

    try {
      const parsed = normalizeJsonObject<WorkflowSessionState>(JSON.parse(raw), 'workflow state')
      return {
        exists: true,
        state: projectReadableState(parsed),
        recoveryStatus: 'ok',
        errorCode: null,
      }
    } catch {
      return {
        exists: false,
        state: null,
        recoveryStatus: 'state-corrupt',
        errorCode: 'WORKFLOW_STATE_UNAVAILABLE',
      }
    }
  }

  /**
   * Reads persisted state and durably installs the fail-closed completion
   * contract for legacy sessions. The lock re-reads the file before writing so
   * a concurrent transition cannot be overwritten by a stale migration read.
   */
  async readState(sessionId: string): Promise<WorkflowStateReadResult> {
    const initial = await this.readStoredState(sessionId)
    if (!initial.exists || !initial.state) return initial

    const migrated = migrateWorkflowRuntimeContract(initial.state, undefined, new Date().toISOString())
    if (migrated === initial.state) return initial

    return this.withWriteLock(this.statePath(sessionId), async () => {
      const current = await this.readStoredState(sessionId)
      if (!current.exists || !current.state) return current
      const currentMigrated = migrateWorkflowRuntimeContract(current.state, undefined, new Date().toISOString())
      if (currentMigrated === current.state) return current

      await syncProjectWorkflowArtifacts(currentMigrated)
      await atomicWriteJson(this.statePath(sessionId), currentMigrated)
      return {
        exists: true,
        state: projectReadableState(currentMigrated),
        recoveryStatus: 'ok',
        errorCode: null,
      }
    })
  }

  async writeState(
    sessionId: string,
    stateInput: unknown,
    options: WorkflowStateUpdateOptions = {},
  ): Promise<WorkflowStateWriteResult> {
    return this.withWriteLock(this.statePath(sessionId), async () => {
      const current = await this.readStoredState(sessionId)
      if (current.exists && current.state) {
        assertExpectedVersion(current.state, options)
      }

      const state = migrateWorkflowRuntimeContract(
        normalizeJsonObject<WorkflowSessionState>(stateInput, 'workflow state'),
        undefined,
        new Date().toISOString(),
      )

      if (state.sessionId !== sessionId) {
        throw ApiError.badRequest('Workflow state sessionId must match the owning session')
      }
      assertSafeArtifactId('state')

      await syncProjectWorkflowArtifacts(state)
      await atomicWriteJson(this.statePath(sessionId), state)
      return {
        state,
        pointer: statePointer(state),
      }
    })
  }

  async updateState(
    sessionId: string,
    update: (current: WorkflowSessionState) => WorkflowSessionState | Promise<WorkflowSessionState>,
    options: WorkflowStateUpdateOptions = {},
  ): Promise<WorkflowStateWriteResult> {
    return this.withWriteLock(this.statePath(sessionId), async () => {
      const current = await this.readStoredState(sessionId)
      if (!current.exists || !current.state) {
        throw ApiError.notFound('Workflow state is unavailable for update')
      }

      const migrated = migrateWorkflowRuntimeContract(current.state, undefined, new Date().toISOString())
      assertExpectedVersion(migrated, options)
      const previousRevision = typeof migrated.revision === 'number' ? migrated.revision : 0
      const previousStateVersion = typeof migrated.stateVersion === 'number' ? migrated.stateVersion : 0
      const nextState = normalizeJsonObject<WorkflowSessionState>(
        await update(migrated),
        'workflow state update',
      )
      const requestedStateVersion = typeof nextState.stateVersion === 'number'
        ? nextState.stateVersion
        : previousStateVersion
      const state = {
        ...nextState,
        // Every persisted mutation advances the state version. Runtime paths
        // that already called touchState keep their newer version; auxiliary
        // persistence paths (for example AskUserQuestion issue updates) cannot
        // silently reuse a stale stateVersion.
        stateVersion: requestedStateVersion > previousStateVersion
          ? requestedStateVersion
          : previousStateVersion + 1,
        revision: previousRevision + 1,
      }

      await syncProjectWorkflowArtifacts(state)
      await atomicWriteJson(this.statePath(sessionId), state)
      return {
        state,
        pointer: statePointer(state),
      }
    })
  }

  async writePhaseArtifact(
    sessionId: string,
    artifactInput: unknown,
  ): Promise<WorkflowPhaseArtifactWriteResult> {
    const artifact = normalizeJsonObject<WorkflowPhaseArtifact>(artifactInput, 'workflow phase artifact')

    if (artifact.sessionId !== sessionId) {
      throw ApiError.badRequest('Workflow phase artifact sessionId must match the owning session')
    }
    assertSafeArtifactId(artifact.artifactId)

    return this.withWriteLock(this.phaseArtifactPath(sessionId, artifact.artifactId), async () => {
      await atomicWriteJson(this.phaseArtifactPath(sessionId, artifact.artifactId), artifact)
      return {
        artifact,
        pointer: artifactPointer(artifact),
      }
    })
  }
}
