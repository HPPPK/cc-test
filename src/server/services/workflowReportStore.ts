import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { randomBytes } from 'node:crypto'
import { ApiError } from '../middleware/errorHandler.js'
import type {
  WorkflowArtifactPointer,
  WorkflowFinalReport,
  WorkflowSessionState,
} from './workflowTypes.js'
import { WorkflowSessionStateService } from './workflowSessionStateService.js'

export type WorkflowFinalReportReadResult = {
  exists: boolean
  report: WorkflowFinalReport | null
  recoveryStatus: 'ok' | 'report-missing' | 'report-corrupt'
  errorCode: 'WORKFLOW_REPORT_UNAVAILABLE' | null
}

export type WorkflowFinalReportWriteResult = {
  report: WorkflowFinalReport
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
  return path.join(configDir(), 'cc-haha', 'workflow-sessions', sessionId)
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

function reportPointer(report: WorkflowFinalReport): WorkflowArtifactPointer {
  return {
    kind: 'final-report',
    sessionId: report.sessionId,
    artifactId: 'final',
    schemaVersion: report.schemaVersion,
    createdAt: report.createdAt,
    updatedAt: report.createdAt,
    label: 'Final workflow report',
  }
}

function collectPointers(value: unknown, pointers: WorkflowArtifactPointer[] = []): WorkflowArtifactPointer[] {
  if (!value || typeof value !== 'object') {
    return pointers
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectPointers(item, pointers)
    }
    return pointers
  }

  const record = value as Record<string, unknown>
  if (
    typeof record.kind === 'string'
    && typeof record.sessionId === 'string'
    && typeof record.artifactId === 'string'
    && typeof record.schemaVersion === 'number'
    && typeof record.createdAt === 'string'
  ) {
    pointers.push(record as WorkflowArtifactPointer)
  }

  for (const nested of Object.values(record)) {
    collectPointers(nested, pointers)
  }

  return pointers
}

function validateReportScope(sessionId: string, report: WorkflowFinalReport): void {
  if (report.sessionId !== sessionId) {
    throw ApiError.badRequest('Workflow final report sessionId must match the owning session')
  }
  if (report.reportId !== 'final') {
    assertSafeArtifactId(report.reportId)
  }

  for (const pointer of collectPointers(report)) {
    assertSafeArtifactId(pointer.artifactId)
    if (pointer.sessionId !== sessionId) {
      throw ApiError.badRequest('Workflow report artifact pointer escapes session scope')
    }
  }
}

function artifactIndexValues(state: WorkflowSessionState): Array<Record<string, unknown>> {
  if (Array.isArray(state.artifactIndex)) {
    return state.artifactIndex.filter((artifact): artifact is Record<string, unknown> =>
      Boolean(artifact) && typeof artifact === 'object' && !Array.isArray(artifact)
    )
  }

  if (state.artifactIndex && typeof state.artifactIndex === 'object') {
    return Object.values(state.artifactIndex).filter((artifact): artifact is Record<string, unknown> =>
      Boolean(artifact) && typeof artifact === 'object' && !Array.isArray(artifact)
    )
  }

  return []
}

function canCreateFinalReport(state: WorkflowSessionState): boolean {
  return (
    state.workflowStatus === 'completed'
    && state.status === 'completed'
    && state.activePhaseId === null
  )
}

async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
  const tmpFile = `${filePath}.tmp.${process.pid}.${Date.now()}.${randomBytes(6).toString('hex')}`

  await fs.mkdir(path.dirname(filePath), { recursive: true })

  try {
    await fs.writeFile(tmpFile, `${JSON.stringify(value, null, 2)}\n`, 'utf-8')
    await fs.rename(tmpFile, filePath)
  } catch (error) {
    await fs.unlink(tmpFile).catch(() => {})
    throw ApiError.internal(`Failed to write workflow final report: ${error}`)
  }
}

export class WorkflowReportStore {
  private static writeLocks = new Map<string, Promise<void>>()

  private readonly stateService: WorkflowSessionStateService

  constructor(stateService = new WorkflowSessionStateService()) {
    this.stateService = stateService
  }

  private reportPath(sessionId: string): string {
    return path.join(workflowSessionDir(sessionId), 'reports', 'final.json')
  }

  private async withWriteLock<T>(lockKey: string, task: () => Promise<T>): Promise<T> {
    const previousWrite = WorkflowReportStore.writeLocks.get(lockKey) ?? Promise.resolve()
    const nextWrite = previousWrite.catch(() => {}).then(task)
    const trackedWrite = nextWrite.then(() => {}, () => {})

    WorkflowReportStore.writeLocks.set(lockKey, trackedWrite)

    try {
      return await nextWrite
    } finally {
      if (WorkflowReportStore.writeLocks.get(lockKey) === trackedWrite) {
        WorkflowReportStore.writeLocks.delete(lockKey)
      }
    }
  }

  async readFinalReport(sessionId: string): Promise<WorkflowFinalReportReadResult> {
    let raw: string

    try {
      raw = await fs.readFile(this.reportPath(sessionId), 'utf-8')
    } catch (error) {
      if (errnoCode(error) === 'ENOENT') {
        return {
          exists: false,
          report: null,
          recoveryStatus: 'report-missing',
          errorCode: 'WORKFLOW_REPORT_UNAVAILABLE',
        }
      }
      throw ApiError.internal(`Failed to read workflow final report: ${error}`)
    }

    try {
      const report = normalizeJsonObject<WorkflowFinalReport>(JSON.parse(raw), 'workflow final report')
      return {
        exists: true,
        report,
        recoveryStatus: 'ok',
        errorCode: null,
      }
    } catch {
      return {
        exists: false,
        report: null,
        recoveryStatus: 'report-corrupt',
        errorCode: 'WORKFLOW_REPORT_UNAVAILABLE',
      }
    }
  }

  async createFinalReport(
    sessionId: string,
    reportInput: unknown,
  ): Promise<WorkflowFinalReportWriteResult> {
    return this.withWriteLock(this.reportPath(sessionId), async () => {
      const report = normalizeJsonObject<WorkflowFinalReport>(reportInput, 'workflow final report')
      validateReportScope(sessionId, report)

      const state = await this.stateService.readState(sessionId)
      if (
        !state.exists
        || !state.state
        || !canCreateFinalReport(state.state)
      ) {
        throw ApiError.badRequest('Cannot create final report without completed workflow state')
      }

      const existing = await this.readFinalReport(sessionId)
      if (existing.exists && existing.report) {
        return {
          report: existing.report,
          pointer: reportPointer(existing.report),
        }
      }
      if (existing.recoveryStatus === 'report-corrupt') {
        throw ApiError.conflict('Workflow final report artifact is corrupt or unavailable')
      }

      await atomicWriteJson(this.reportPath(sessionId), report)
      return {
        report,
        pointer: reportPointer(report),
      }
    })
  }
}
