import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { WorkflowRefinementLedgerService } from './workflowRefinementLedgerService.js'

let tmpDir: string
let originalConfigDir: string | undefined

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-jiangxia-workflow-refinement-'))
  originalConfigDir = process.env.CLAUDE_CONFIG_DIR
  process.env.CLAUDE_CONFIG_DIR = tmpDir
})

afterEach(async () => {
  if (originalConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR
  else process.env.CLAUDE_CONFIG_DIR = originalConfigDir
  await fs.rm(tmpDir, { recursive: true, force: true })
})

function ledgerPath(templateId = 'skills-development'): string {
  return path.join(tmpDir, 'cc-jiangxia', 'workflow-refinements', templateId, 'ledger.json')
}

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    templateId: 'skills-development',
    basePackSha256: 'sha256-test',
    phaseId: 'scenario-review',
    kind: 'tool-contract' as const,
    status: 'observed' as const,
    scope: 'template' as const,
    evidence: [{
      type: 'workflow-artifact-write-denied',
      summary: 'A Stage 5 artifact-only Write targeted an external path.',
      observedAt: '2026-08-12T00:00:00.000Z',
      pathCategory: 'external-or-unknown',
    }],
    expectedOutcome: 'The next artifact write stays under .workflow/.',
    proposedChange: 'State the concrete Write path contract and bounded recovery rule.',
    sourceSessionId: 'session-1',
    ...overrides,
  }
}

describe('WorkflowRefinementLedgerService', () => {
  test('appends candidate evidence atomically without changing a workflow pack', async () => {
    const service = new WorkflowRefinementLedgerService()
    const record = await service.append(candidate())

    expect(record.id).toBeTruthy()
    expect(record.status).toBe('observed')
    const stored = JSON.parse(await fs.readFile(ledgerPath(), 'utf-8')) as Record<string, unknown>
    expect(stored.templateId).toBe('skills-development')
    expect((stored.records as Array<Record<string, unknown>>)).toHaveLength(1)
    expect((stored.records as Array<Record<string, unknown>>)[0]).toMatchObject({
      id: record.id,
      kind: 'tool-contract',
      sourceSessionId: 'session-1',
    })
  })

  test('preserves unknown ledger and record fields while accepting a new candidate', async () => {
    await fs.mkdir(path.dirname(ledgerPath()), { recursive: true })
    await fs.writeFile(ledgerPath(), JSON.stringify({
      schemaVersion: 1,
      templateId: 'skills-development',
      createdAt: '2026-08-12T00:00:00.000Z',
      updatedAt: '2026-08-12T00:00:00.000Z',
      futureLedgerField: { keep: true },
      records: [{
        schemaVersion: 1,
        id: 'existing',
        ...candidate(),
        createdAt: '2026-08-12T00:00:00.000Z',
        updatedAt: '2026-08-12T00:00:00.000Z',
        futureRecordField: 'keep-me',
      }],
    }, null, 2), 'utf-8')

    const service = new WorkflowRefinementLedgerService()
    await service.append(candidate({ sourceSessionId: 'session-2' }))

    const stored = JSON.parse(await fs.readFile(ledgerPath(), 'utf-8')) as Record<string, unknown>
    expect(stored.futureLedgerField).toEqual({ keep: true })
    expect((stored.records as Array<Record<string, unknown>>)[0].futureRecordField).toBe('keep-me')
    expect((stored.records as Array<Record<string, unknown>>)).toHaveLength(2)
  })

  test('requires a traceable status history and records rollback metadata', async () => {
    const service = new WorkflowRefinementLedgerService()
    const observed = await service.append(candidate())
    const proposed = await service.transitionStatus({
      templateId: 'skills-development',
      id: observed.id,
      status: 'proposed',
    })
    const accepted = await service.transitionStatus({
      templateId: 'skills-development',
      id: proposed.id,
      status: 'accepted',
    })
    const rolledBack = await service.transitionStatus({
      templateId: 'skills-development',
      id: accepted.id,
      status: 'rolled-back',
      rollbackOf: 'pack-v17',
    })

    expect(rolledBack).toMatchObject({ status: 'rolled-back', rollbackOf: 'pack-v17' })
    await expect(service.transitionStatus({
      templateId: 'skills-development',
      id: observed.id,
      status: 'accepted',
    })).rejects.toThrow('cannot transition')
  })
})
