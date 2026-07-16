import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { WorkflowPreviewService } from './workflowPreviewService.js'
import type { WorkflowSessionState } from './workflowTypes.js'

let tmpDir = ''
let previousConfigDir: string | undefined

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-jiangxia-workflow-preview-'))
  previousConfigDir = process.env.CLAUDE_CONFIG_DIR
  process.env.CLAUDE_CONFIG_DIR = tmpDir
})

afterEach(async () => {
  if (previousConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR
  } else {
    process.env.CLAUDE_CONFIG_DIR = previousConfigDir
  }
  await fs.rm(tmpDir, { recursive: true, force: true })
})

function baseWorkflowState(workspaceRoot: string): WorkflowSessionState {
  return {
    schemaVersion: 1,
    sessionId: 'preview-session',
    mode: 'workflow',
    template: {
      id: 'adaptive-development-subagents-v7',
      version: '7.0.0',
      source: 'user',
      snapshotId: 'snapshot',
      sourceState: 'current',
    },
    templateSnapshot: {
      schemaVersion: 1,
      id: 'adaptive-development-subagents-v7',
      source: 'user',
      version: '7.0.0',
      displayName: 'Adaptive Development v7',
      description: 'Preview test template',
      phases: [],
    },
    templateIdentity: {
      id: 'adaptive-development-subagents-v7',
      source: 'user',
      version: '7.0.0',
    },
    sourceTemplateStatus: 'current',
    status: 'running',
    workflowStatus: 'running',
    runStatus: 'active',
    activePhaseId: 'run-preview',
    workspaceRoot,
    activeWorkflowRunId: 'run-1',
    phases: [],
    phaseRuns: [],
    transitionHistory: [],
    artifactIndex: [],
    finalReportRef: null,
    stateVersion: 1,
    revision: 1,
    createdAt: '2026-07-02T00:00:00.000Z',
    updatedAt: '2026-07-02T00:00:00.000Z',
    workflowRuns: [{
      id: 'run-1',
      templateId: 'adaptive-development-subagents-v7',
      status: 'active',
      workspaceRoot,
      currentPhaseId: 'run-preview',
      artifacts: [],
      history: [],
      createdAt: '2026-07-02T00:00:00.000Z',
      updatedAt: '2026-07-02T00:00:00.000Z',
    }],
  } as WorkflowSessionState
}

describe('WorkflowPreviewService', () => {
  test('starts and stops a workflow-owned local preview while preserving a run-preview artifact', async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(tmpDir, 'workspace-'))
    const service = new WorkflowPreviewService()
    const command = `${process.execPath} -e "console.log('preview-ready'); setInterval(() => {}, 1000)"`

    const started = await service.startPreview(baseWorkflowState(workspaceRoot), {
      command,
      detectedUrl: 'http://127.0.0.1:5173',
      detectedPort: 5173,
    })

    expect(started.preview.status).toBe('running')
    expect(started.preview.processOwner).toBe('workflow')
    expect(started.preview.pid).toBeGreaterThan(0)
    expect(started.preview.logPath).toContain(path.join(workspaceRoot, '.workflow', 'logs'))
    expect(started.state.preview).toMatchObject({
      status: 'running',
      command,
      detectedUrl: 'http://127.0.0.1:5173',
      detectedPort: 5173,
    })
    expect(started.state.workflowRuns?.[0]?.artifacts).toContainEqual(
      expect.objectContaining({
        id: 'run-preview',
        filename: 'run-preview.md',
      }),
    )
    await expect(fs.readFile(started.preview.logPath!, 'utf-8'))
      .resolves.toContain('Workflow preview started')

    const stopped = await service.stopPreview(started.state, { reason: 'test cleanup' })

    expect(stopped.preview.status).toBe('stopped')
    expect(stopped.state.preview?.status).toBe('stopped')
    expect(stopped.state.workflowRuns?.[0]?.artifacts.at(-1)).toMatchObject({
      id: 'run-preview',
      filename: 'run-preview.md',
    })
  })

  test('does not kill untracked external PIDs from persisted preview state', async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(tmpDir, 'workspace-'))
    const service = new WorkflowPreviewService()
    const state = {
      ...baseWorkflowState(workspaceRoot),
      preview: {
        status: 'running',
        pid: 1,
        processOwner: 'workflow',
        updatedAt: '2026-07-02T00:00:00.000Z',
      },
    } as WorkflowSessionState

    const stopped = await service.stopPreview(state)

    expect(stopped.preview.status).toBe('failed')
    expect(stopped.preview.error).toContain('not tracked')
  })
})
