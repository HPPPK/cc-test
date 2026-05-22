import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { WorkflowReportStore } from './workflowReportStore.js'

const FIXTURE_DIR = path.join(import.meta.dir, '__fixtures__', 'workflow-sessions')

const SESSION_ID = 'workflow-report-store-test'
const NOW = '2026-05-20T00:05:00.000Z'

let tmpDir: string
let originalConfigDir: string | undefined

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-haha-workflow-report-'))
  originalConfigDir = process.env.CLAUDE_CONFIG_DIR
  process.env.CLAUDE_CONFIG_DIR = tmpDir
})

afterEach(async () => {
  if (originalConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR
  } else {
    process.env.CLAUDE_CONFIG_DIR = originalConfigDir
  }
  await fs.rm(tmpDir, { recursive: true, force: true })
})

function reportPath(sessionId = SESSION_ID): string {
  return path.join(tmpDir, 'cc-haha', 'workflow-sessions', sessionId, 'reports', 'final.json')
}

function statePath(sessionId = SESSION_ID): string {
  return path.join(tmpDir, 'cc-haha', 'workflow-sessions', sessionId, 'state.json')
}

async function readJson(filePath: string): Promise<Record<string, unknown>> {
  return JSON.parse(await fs.readFile(filePath, 'utf-8')) as Record<string, unknown>
}

async function copyFixtureTo(fileName: string, filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.copyFile(path.join(FIXTURE_DIR, fileName), filePath)
}

async function copyStateFixture(fileName: string, sessionId = SESSION_ID): Promise<void> {
  const raw = await fs.readFile(path.join(FIXTURE_DIR, fileName), 'utf-8')
  const state = JSON.parse(raw) as Record<string, unknown>
  state.sessionId = sessionId
  await fs.mkdir(path.dirname(statePath(sessionId)), { recursive: true })
  await fs.writeFile(statePath(sessionId), `${JSON.stringify(state, null, 2)}\n`, 'utf-8')
}

function makeFinalReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    reportId: 'final',
    sessionId: SESSION_ID,
    templateId: 'requirements-to-implementation',
    templateVersion: '1',
    createdAt: NOW,
    phaseSummaries: [
      {
        phaseId: 'requirements-clarification',
        label: 'Requirements clarification',
        status: 'completed',
        artifactRefs: [
          {
            kind: 'phase-artifact',
            sessionId: SESSION_ID,
            artifactId: 'requirements-clarification-output-v1',
            schemaVersion: 1,
            createdAt: '2026-05-20T00:03:00.000Z',
          },
        ],
        completion: {
          phaseId: 'requirements-clarification',
          passed: true,
          checkedAt: '2026-05-20T00:04:00.000Z',
          criteriaType: 'manual-checklist',
          artifactPointers: [],
        },
      },
    ],
    verificationResult: {
      passed: true,
      notes: 'Verification passed',
    },
    conversationSummary: 'Workflow completed.',
    artifactRefs: [],
    ...overrides,
  }
}

describe('WorkflowReportStore', () => {
  test('writes final reports before exposing a safe immutable report pointer', async () => {
    const store = new WorkflowReportStore()
    await copyStateFixture('completed-final-report-state.json')
    const report = makeFinalReport()

    const result = await store.createFinalReport(SESSION_ID, report)
    const persisted = await readJson(reportPath())
    const reportDirFiles = await fs.readdir(path.dirname(reportPath()))

    expect(result.pointer).toEqual({
      kind: 'final-report',
      sessionId: SESSION_ID,
      artifactId: 'final',
      schemaVersion: 1,
      createdAt: NOW,
      updatedAt: NOW,
      label: 'Final workflow report',
    })
    expect(result.pointer).not.toHaveProperty('path')
    expect(persisted).toEqual(report)
    expect(reportDirFiles.filter((name) => name.includes('.tmp.'))).toEqual([])
    expect(reportPath()).toContain(path.join('cc-haha', 'workflow-sessions', SESSION_ID, 'reports', 'final.json'))
  })

  test('keeps report creation idempotent and preserves the existing final report on retry', async () => {
    const store = new WorkflowReportStore()
    await copyStateFixture('completed-final-report-state.json')
    const firstReport = makeFinalReport({
      conversationSummary: 'Original summary.',
      futureReportField: { preserved: true },
    })
    const retryReport = makeFinalReport({
      conversationSummary: 'Changed retry summary should not replace original.',
    })

    const first = await store.createFinalReport(SESSION_ID, firstReport)
    const retry = await store.createFinalReport(SESSION_ID, retryReport)
    const persisted = await readJson(reportPath())

    expect(retry.pointer).toEqual(first.pointer)
    expect(persisted.conversationSummary).toBe('Original summary.')
    expect(persisted.futureReportField).toEqual({ preserved: true })
  })

  test('preserves unknown report fields when reading old fixture files', async () => {
    const store = new WorkflowReportStore()
    await copyFixtureTo('final-report-with-unknown-fields.json', reportPath('fixture-session'))

    const result = await store.readFinalReport('fixture-session')

    expect(result).toMatchObject({
      exists: true,
      recoveryStatus: 'ok',
      errorCode: null,
    })
    expect(result.report?.futureReportField).toEqual({ preserved: true })
    expect(result.report?.phaseSummaries[0].futurePhaseSummaryField).toBe('preserve me')
  })

  test('rejects unsafe artifact pointer fixtures without creating or rewriting final reports', async () => {
    const store = new WorkflowReportStore()
    await copyStateFixture('completed-final-report-state.json')
    const unsafeReport = await readJson(path.join(FIXTURE_DIR, 'unsafe-artifact-pointer.json'))
    unsafeReport.sessionId = SESSION_ID
    const reportFilesBefore = await fs.readdir(path.dirname(reportPath()), { recursive: true }).catch(() => [])

    await expect(store.createFinalReport(SESSION_ID, unsafeReport)).rejects.toThrow(/artifactId/i)

    expect(await fs.readdir(path.dirname(reportPath()), { recursive: true }).catch(() => [])).toEqual(reportFilesBefore)
    await expect(fs.readFile(reportPath(), 'utf-8')).rejects.toThrow()
  })

  test('reports missing and corrupt final reports as recoverable without regenerating report content', async () => {
    const store = new WorkflowReportStore()

    const missing = await store.readFinalReport(SESSION_ID)
    await fs.mkdir(path.dirname(reportPath()), { recursive: true })
    await fs.copyFile(path.join(FIXTURE_DIR, 'corrupt-final-report.json'), reportPath())
    const rawBeforeCorruptRead = await fs.readFile(reportPath(), 'utf-8')
    const corrupt = await store.readFinalReport(SESSION_ID)
    const rawAfterCorruptRead = await fs.readFile(reportPath(), 'utf-8').catch(() => null)

    expect(missing).toMatchObject({
      exists: false,
      report: null,
      recoveryStatus: 'report-missing',
      errorCode: 'WORKFLOW_REPORT_UNAVAILABLE',
    })
    expect(corrupt).toMatchObject({
      exists: false,
      report: null,
      recoveryStatus: 'report-corrupt',
      errorCode: 'WORKFLOW_REPORT_UNAVAILABLE',
    })
    expect(rawAfterCorruptRead).toBe(rawBeforeCorruptRead)
  })

  test('does not create a final report before the owning workflow state is completed', async () => {
    const store = new WorkflowReportStore()
    await copyStateFixture('pending-ready-state.json')

    await expect(store.createFinalReport(SESSION_ID, makeFinalReport())).rejects.toThrow(/completed workflow state/i)

    await expect(fs.readFile(reportPath(), 'utf-8')).rejects.toThrow()
  })

  test('does not create a final report from an accepted intermediate phase artifact', async () => {
    const store = new WorkflowReportStore()
    await copyStateFixture('accepted-completion-state.json')

    await expect(store.createFinalReport(SESSION_ID, makeFinalReport())).rejects.toThrow(/completed workflow state/i)

    await expect(fs.readFile(reportPath(), 'utf-8')).rejects.toThrow()
  })

  test('does not silently regenerate a corrupt final report during create retry', async () => {
    const store = new WorkflowReportStore()
    await copyStateFixture('completed-final-report-state.json')
    await copyFixtureTo('corrupt-final-report.json', reportPath())
    const rawBeforeCreateRetry = await fs.readFile(reportPath(), 'utf-8')

    await expect(store.createFinalReport(SESSION_ID, makeFinalReport())).rejects.toThrow(/unavailable|corrupt/i)

    expect(await fs.readFile(reportPath(), 'utf-8')).toBe(rawBeforeCreateRetry)
  })

  test('creates and reads final report pointers only after completed state is present', async () => {
    const store = new WorkflowReportStore()
    await copyStateFixture('completed-final-report-state.json')
    const completedReport = {
      ...makeFinalReport({
        sessionId: SESSION_ID,
        futureReportField: {
          preserved: true,
        },
      }),
      modelResolutions: [
        {
          requestedModel: 'provider-a/missing-model',
          actualModel: 'provider-b/default-model',
          providerId: 'provider-b',
          source: 'main-session-default',
          fallbackApplied: true,
          fallbackReason: 'Requested phase model is unavailable.',
          resolvedAt: '2026-05-21T00:10:01.000Z',
        },
      ],
    }

    const created = await store.createFinalReport(SESSION_ID, completedReport)
    const read = await store.readFinalReport(SESSION_ID)

    expect(created.pointer).toMatchObject({
      kind: 'final-report',
      sessionId: SESSION_ID,
      artifactId: 'final',
    })
    expect(read.recoveryStatus).toBe('ok')
    expect(read.report?.futureReportField).toEqual({ preserved: true })
    expect(read.report?.modelResolutions?.[0].fallbackApplied).toBe(true)
  })

  test('does not mutate protected user-owned files when final reports are missing or corrupt', async () => {
    const store = new WorkflowReportStore()
    const protectedFiles = [
      path.join(tmpDir, 'settings.json'),
      path.join(tmpDir, 'cc-haha', 'providers.json'),
      path.join(tmpDir, 'adapter-sessions.json'),
      path.join(tmpDir, 'projects', 'session.jsonl'),
    ]

    for (const file of protectedFiles) {
      await fs.mkdir(path.dirname(file), { recursive: true })
      await fs.writeFile(file, 'protected-content', 'utf-8')
    }
    await store.readFinalReport(SESSION_ID)
    await copyFixtureTo('corrupt-final-report.json', reportPath())
    await store.readFinalReport(SESSION_ID)

    for (const file of protectedFiles) {
      expect(await fs.readFile(file, 'utf-8')).toBe('protected-content')
    }
  })

  test('rejects report pointers and artifact refs that escape the owning session scope', async () => {
    const store = new WorkflowReportStore()
    await copyStateFixture('accepted-completion-state.json')

    await expect(store.createFinalReport(SESSION_ID, makeFinalReport({
      sessionId: 'other-session',
    }))).rejects.toThrow(/sessionId/i)

    await expect(store.createFinalReport(SESSION_ID, makeFinalReport({
      artifactRefs: [
        {
          kind: 'phase-artifact',
          sessionId: SESSION_ID,
          artifactId: '../oauth-token',
          schemaVersion: 1,
          createdAt: NOW,
        },
      ],
    }))).rejects.toThrow(/artifactId/i)

    await expect(store.createFinalReport(SESSION_ID, makeFinalReport({
      artifactRefs: [
        {
          kind: 'phase-artifact',
          sessionId: 'other-session',
          artifactId: 'requirements-output-v1',
          schemaVersion: 1,
          createdAt: NOW,
        },
      ],
    }))).rejects.toThrow(/session scope/i)
  })
})
