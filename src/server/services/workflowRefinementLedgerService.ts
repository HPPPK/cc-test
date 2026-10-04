import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import { ApiError } from '../middleware/errorHandler.js'
import { getAppStoragePath } from '../../utils/appIdentity.js'

export type WorkflowRefinementKind =
  | 'prompt-rule'
  | 'question-contract'
  | 'tool-contract'
  | 'phase-policy'
  | 'subagent-spec'
  | 'evaluation-case'

export type WorkflowRefinementStatus =
  | 'observed'
  | 'proposed'
  | 'accepted'
  | 'rejected'
  | 'rolled-back'

export type WorkflowRefinementScope = 'session' | 'template'

export type WorkflowRefinementEvidence = {
  type: string
  summary: string
  observedAt: string
  [key: string]: unknown
}

export type WorkflowRefinementRecord = {
  schemaVersion: 1
  id: string
  templateId: string
  basePackSha256: string | null
  phaseId?: string
  kind: WorkflowRefinementKind
  status: WorkflowRefinementStatus
  scope: WorkflowRefinementScope
  evidence: WorkflowRefinementEvidence[]
  expectedOutcome: string
  proposedChange: string
  createdAt: string
  updatedAt: string
  sourceSessionId?: string
  rollbackOf?: string
  [key: string]: unknown
}

type WorkflowRefinementLedger = {
  schemaVersion: 1
  templateId: string
  records: WorkflowRefinementRecord[]
  createdAt: string
  updatedAt: string
  [key: string]: unknown
}

export type AppendWorkflowRefinementInput = Omit<
  WorkflowRefinementRecord,
  'schemaVersion' | 'id' | 'createdAt' | 'updatedAt'
> & {
  id?: string
  createdAt?: string
  updatedAt?: string
}

function configDir(): string {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
}

function assertSafeTemplateId(templateId: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(templateId)) {
    throw ApiError.badRequest('Workflow refinement templateId contains unsafe path characters.')
  }
}

function ledgerPath(templateId: string): string {
  assertSafeTemplateId(templateId)
  return getAppStoragePath(configDir(), 'workflow-refinements', templateId, 'ledger.json')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isKind(value: unknown): value is WorkflowRefinementKind {
  return value === 'prompt-rule'
    || value === 'question-contract'
    || value === 'tool-contract'
    || value === 'phase-policy'
    || value === 'subagent-spec'
    || value === 'evaluation-case'
}

function isStatus(value: unknown): value is WorkflowRefinementStatus {
  return value === 'observed'
    || value === 'proposed'
    || value === 'accepted'
    || value === 'rejected'
    || value === 'rolled-back'
}

function isScope(value: unknown): value is WorkflowRefinementScope {
  return value === 'session' || value === 'template'
}

function normalizeEvidence(value: unknown): WorkflowRefinementEvidence[] {
  if (!Array.isArray(value)) throw ApiError.internal('Workflow refinement evidence must be an array.')
  return value.map((item) => {
    if (
      !isRecord(item)
      || typeof item.type !== 'string'
      || !item.type.trim()
      || typeof item.summary !== 'string'
      || !item.summary.trim()
      || typeof item.observedAt !== 'string'
      || Number.isNaN(Date.parse(item.observedAt))
    ) {
      throw ApiError.internal('Workflow refinement evidence is invalid.')
    }
    return item as WorkflowRefinementEvidence
  })
}

function normalizeRecord(value: unknown, expectedTemplateId: string): WorkflowRefinementRecord {
  if (
    !isRecord(value)
    || value.schemaVersion !== 1
    || typeof value.id !== 'string'
    || !value.id.trim()
    || value.templateId !== expectedTemplateId
    || (value.basePackSha256 !== null && typeof value.basePackSha256 !== 'string')
    || (value.phaseId !== undefined && typeof value.phaseId !== 'string')
    || !isKind(value.kind)
    || !isStatus(value.status)
    || !isScope(value.scope)
    || typeof value.expectedOutcome !== 'string'
    || !value.expectedOutcome.trim()
    || typeof value.proposedChange !== 'string'
    || !value.proposedChange.trim()
    || typeof value.createdAt !== 'string'
    || Number.isNaN(Date.parse(value.createdAt))
    || typeof value.updatedAt !== 'string'
    || Number.isNaN(Date.parse(value.updatedAt))
    || (value.sourceSessionId !== undefined && typeof value.sourceSessionId !== 'string')
    || (value.rollbackOf !== undefined && typeof value.rollbackOf !== 'string')
  ) {
    throw ApiError.internal('Workflow refinement record is invalid.')
  }
  return {
    ...value,
    schemaVersion: 1,
    templateId: expectedTemplateId,
    evidence: normalizeEvidence(value.evidence),
  } as WorkflowRefinementRecord
}

function emptyLedger(templateId: string, now: string): WorkflowRefinementLedger {
  return {
    schemaVersion: 1,
    templateId,
    records: [],
    createdAt: now,
    updatedAt: now,
  }
}

async function readLedgerFile(templateId: string): Promise<WorkflowRefinementLedger> {
  const filePath = ledgerPath(templateId)
  let raw: string
  try {
    raw = await fs.readFile(filePath, 'utf-8')
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return emptyLedger(templateId, new Date().toISOString())
    }
    throw ApiError.internal(`Failed to read workflow refinement ledger: ${error}`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw ApiError.internal('Workflow refinement ledger contains invalid JSON.')
  }
  if (
    !isRecord(parsed)
    || parsed.schemaVersion !== 1
    || parsed.templateId !== templateId
    || !Array.isArray(parsed.records)
    || typeof parsed.createdAt !== 'string'
    || typeof parsed.updatedAt !== 'string'
  ) {
    throw ApiError.internal('Workflow refinement ledger has an unsupported shape.')
  }

  return {
    ...parsed,
    schemaVersion: 1,
    templateId,
    records: parsed.records.map((record) => normalizeRecord(record, templateId)),
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
  } as WorkflowRefinementLedger
}

async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
  const tempPath = `${filePath}.tmp.${process.pid}.${Date.now()}.${randomUUID()}`
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  try {
    await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8')
    await fs.rename(tempPath, filePath)
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => {})
    throw ApiError.internal(`Failed to write workflow refinement ledger: ${error}`)
  }
}

function canTransition(
  from: WorkflowRefinementStatus,
  to: WorkflowRefinementStatus,
): boolean {
  if (from === to) return true
  if (from === 'observed') return to === 'proposed' || to === 'rejected'
  if (from === 'proposed') return to === 'accepted' || to === 'rejected'
  if (from === 'accepted') return to === 'rolled-back'
  return false
}

export class WorkflowRefinementLedgerService {
  private static writeLocks = new Map<string, Promise<void>>()

  private async withWriteLock<T>(templateId: string, work: () => Promise<T>): Promise<T> {
    const key = ledgerPath(templateId)
    const prior = WorkflowRefinementLedgerService.writeLocks.get(key) ?? Promise.resolve()
    const next = prior.catch(() => {}).then(work)
    const tracked = next.then(() => {}, () => {})
    WorkflowRefinementLedgerService.writeLocks.set(key, tracked)
    return next.finally(() => {
      if (WorkflowRefinementLedgerService.writeLocks.get(key) === tracked) {
        WorkflowRefinementLedgerService.writeLocks.delete(key)
      }
    })
  }

  async list(templateId: string): Promise<WorkflowRefinementRecord[]> {
    const ledger = await readLedgerFile(templateId)
    return ledger.records.map((record) => ({ ...record, evidence: [...record.evidence] }))
  }

  async append(input: AppendWorkflowRefinementInput): Promise<WorkflowRefinementRecord> {
    assertSafeTemplateId(input.templateId)
    return this.withWriteLock(input.templateId, async () => {
      const now = input.updatedAt ?? new Date().toISOString()
      const record = normalizeRecord({
        ...input,
        schemaVersion: 1,
        id: input.id ?? randomUUID(),
        createdAt: input.createdAt ?? now,
        updatedAt: now,
      }, input.templateId)
      const ledger = await readLedgerFile(input.templateId)
      if (ledger.records.some((candidate) => candidate.id === record.id)) {
        throw ApiError.conflict('Workflow refinement id already exists.')
      }
      const next: WorkflowRefinementLedger = {
        ...ledger,
        schemaVersion: 1,
        templateId: input.templateId,
        records: [...ledger.records, record],
        updatedAt: now,
      }
      await atomicWriteJson(ledgerPath(input.templateId), next)
      return record
    })
  }

  async transitionStatus(input: {
    templateId: string
    id: string
    status: WorkflowRefinementStatus
    rollbackOf?: string
  }): Promise<WorkflowRefinementRecord> {
    assertSafeTemplateId(input.templateId)
    return this.withWriteLock(input.templateId, async () => {
      const ledger = await readLedgerFile(input.templateId)
      const index = ledger.records.findIndex((record) => record.id === input.id)
      if (index === -1) throw ApiError.notFound('Workflow refinement is unavailable.')
      const current = ledger.records[index]
      if (!canTransition(current.status, input.status)) {
        throw ApiError.badRequest(`Workflow refinement cannot transition from ${current.status} to ${input.status}.`)
      }
      const now = new Date().toISOString()
      const nextRecord: WorkflowRefinementRecord = {
        ...current,
        status: input.status,
        updatedAt: now,
        ...(input.rollbackOf ? { rollbackOf: input.rollbackOf } : {}),
      }
      const records = [...ledger.records]
      records[index] = nextRecord
      await atomicWriteJson(ledgerPath(input.templateId), {
        ...ledger,
        schemaVersion: 1,
        templateId: input.templateId,
        records,
        updatedAt: now,
      })
      return nextRecord
    })
  }
}
