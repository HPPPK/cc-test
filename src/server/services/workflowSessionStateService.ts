import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { randomBytes } from 'node:crypto'
import { ApiError } from '../middleware/errorHandler.js'
import { getAppStoragePath } from '../../utils/appIdentity.js'
import type {
  WorkflowArtifactPointer,
  WorkflowPhaseArtifact,
  WorkflowSessionState,
} from './workflowTypes.js'

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

  async readState(sessionId: string): Promise<WorkflowStateReadResult> {
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

  async writeState(sessionId: string, stateInput: unknown): Promise<WorkflowStateWriteResult> {
    return this.withWriteLock(this.statePath(sessionId), async () => {
      const state = normalizeJsonObject<WorkflowSessionState>(stateInput, 'workflow state')

      if (state.sessionId !== sessionId) {
        throw ApiError.badRequest('Workflow state sessionId must match the owning session')
      }
      assertSafeArtifactId('state')

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
  ): Promise<WorkflowStateWriteResult> {
    return this.withWriteLock(this.statePath(sessionId), async () => {
      const current = await this.readState(sessionId)
      if (!current.exists || !current.state) {
        throw ApiError.notFound('Workflow state is unavailable for update')
      }

      const previousRevision = typeof current.state.revision === 'number' ? current.state.revision : 0
      const nextState = normalizeJsonObject<WorkflowSessionState>(
        await update(current.state),
        'workflow state update',
      )
      const state = {
        ...nextState,
        revision: previousRevision + 1,
      }

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
