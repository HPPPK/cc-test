import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  executeWorkflowSessionModeSmoke,
  runWorkflowSessionModeSmoke,
  type WorkflowSessionModeSmokeResult,
} from './workflow-session-mode-smoke'

const ORIGINAL_CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR

afterEach(() => {
  if (ORIGINAL_CONFIG_DIR === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR
  } else {
    process.env.CLAUDE_CONFIG_DIR = ORIGINAL_CONFIG_DIR
  }
})

describe('workflow session mode smoke', () => {
  test('drives workflow creation, websocket transition, resume, and dialogue compatibility without live credentials', async () => {
    process.env.CLAUDE_CONFIG_DIR = join(tmpdir(), 'cc-jiangxia-real-profile-sentinel')
    const result = await runWorkflowSessionModeSmoke({
      rootDir: process.cwd(),
      keepProfile: true,
    })

    try {
      expect(result.configDir).not.toBe(process.env.CLAUDE_CONFIG_DIR)
      expect(result.configDir).toContain('cc-jiangxia-workflow-session-smoke-')
      expect(existsSync(result.configDir)).toBe(true)
      expect(result.workflowSessionId).toMatch(/^[0-9a-f-]{36}$/)
      expect(result.dialogueSessionId).toMatch(/^[0-9a-f-]{36}$/)
      expect(result.workflowSummary).toMatchObject({
        mode: 'workflow',
        templateId: 'quality-smoke-workflow',
        templateSource: 'user',
        status: 'completed',
        activePhaseId: null,
        pendingConfirmation: false,
        phaseCount: 5,
      })
      expect(result.resumeSummary).toMatchObject({
        status: 'completed',
        activePhaseId: null,
        pendingConfirmation: false,
      })
      expect(result.workflowSummary.reportPointer).toMatchObject({
        kind: 'final-report',
        artifactId: 'final',
      })
      expect(result.finalReportReady).toBe(true)
      expect(result.websocketNotifications).toContain('workflow_transition')
      expect(result.websocketNotifications).toContain('workflow_state')
      expect(result.websocketNotifications).toContain('workflow_report_ready')
      expect(result.dialogueHasWorkflowMetadata).toBe(false)
    } finally {
      await rm(result.configDir, { recursive: true, force: true })
    }
  })

  test('returns a quality-gate lane result and removes its isolated profile by default', async () => {
    const artifactDir = await mkdtemp(join(tmpdir(), 'cc-jiangxia-workflow-session-artifacts-'))

    try {
      const result = await executeWorkflowSessionModeSmoke(
        process.cwd(),
        artifactDir,
        'workflow-session-mode-smoke',
        'Workflow session mode smoke',
      )

      expect(result.status).toBe('passed')
      expect(result.artifactDir).toBe(artifactDir)
      expect(result.id).toBe('workflow-session-mode-smoke')
      const persisted = await Bun.file(join(artifactDir, 'result.json')).json() as WorkflowSessionModeSmokeResult
      expect(existsSync(persisted.configDir)).toBe(false)
    } finally {
      await rm(artifactDir, { recursive: true, force: true })
    }
  })
})
