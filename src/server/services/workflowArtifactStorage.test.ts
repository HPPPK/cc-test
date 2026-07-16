import { describe, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  ensureWorkflowArtifactStorage,
  workflowArtifactStoragePath,
  workflowRunArchiveDir,
} from './workflowArtifactStorage.js'
import type { WorkflowRun } from './workflowTypes.js'

const NOW = '2026-07-02T06:00:00.000Z'

function run(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id: 'session-abc-run-1',
    templateId: 'guided-product-builder',
    status: 'active',
    primaryLabel: 'new-product',
    effort: 'standard',
    workspaceRoot: '/tmp/workflow-artifacts',
    currentPhaseId: 'route',
    artifacts: [],
    history: [{ type: 'created', at: NOW, summary: 'Workflow run created.' }],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

describe('workflow artifact storage policy', () => {
  test('stores current workflow documents only under .workflow fixed filenames', async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workflow-storage-'))
    const currentRun = run({
      workspaceRoot,
      artifacts: [
        {
          id: 'project-context',
          filename: 'project-context.md',
          kind: 'markdown',
          required: true,
          createdAt: NOW,
          updatedAt: NOW,
          content: '# Project Context\n\ncurrent memory',
        },
        {
          id: 'debug-context',
          filename: 'debug-context.md',
          kind: 'markdown',
          required: true,
          createdAt: NOW,
          updatedAt: NOW,
          content: '# Debug Context\n\nactive bug work',
        },
        {
          id: 'run-preview',
          filename: 'run-preview.md',
          kind: 'markdown',
          required: true,
          createdAt: NOW,
          updatedAt: NOW,
          content: '# Preview\n\nrunning',
        },
      ],
    })

    await ensureWorkflowArtifactStorage({
      workspaceRoot,
      run: currentRun,
      now: NOW,
    })

    await expect(fs.readFile(path.join(workspaceRoot, '.workflow', 'project-context.md'), 'utf-8'))
      .resolves.toContain('current memory')
    await expect(fs.readFile(path.join(workspaceRoot, '.workflow', 'work-order.md'), 'utf-8'))
      .resolves.toContain('active bug work')
    await expect(fs.readFile(path.join(workspaceRoot, '.workflow', 'run-report.md'), 'utf-8'))
      .resolves.toContain('running')

    await expect(fs.stat(path.join(workspaceRoot, 'project-context.md'))).rejects.toThrow()
    await expect(fs.stat(path.join(workspaceRoot, 'debug-context.md'))).rejects.toThrow()
    await expect(fs.stat(path.join(workspaceRoot, 'run-preview.md'))).rejects.toThrow()
  })

  test('archives per-run artifact history under .workflow/runs/run-001', async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workflow-storage-history-'))
    const currentRun = run({
      id: 'custom-run-id',
      workspaceRoot,
      artifacts: [
        {
          id: 'project-context',
          filename: 'project-context.md',
          kind: 'markdown',
          required: true,
          createdAt: NOW,
          updatedAt: NOW,
          content: '# Project Context\n\nsnapshot',
        },
        {
          id: 'quality-report',
          filename: 'quality-report.md',
          kind: 'markdown',
          required: true,
          createdAt: NOW,
          updatedAt: NOW,
          content: '# Quality\n\npassed',
        },
      ],
    })

    await ensureWorkflowArtifactStorage({
      workspaceRoot,
      run: currentRun,
      runIndex: 0,
      now: NOW,
    })

    const archiveDir = workflowRunArchiveDir(workspaceRoot, 0)
    await expect(fs.readFile(path.join(archiveDir, 'project-context.md'), 'utf-8'))
      .resolves.toContain('snapshot')
    await expect(fs.readFile(path.join(archiveDir, 'quality-report.md'), 'utf-8'))
      .resolves.toContain('passed')
  })

  test('rejects workflow artifact storage outside the workspace .workflow directory', () => {
    const workspaceRoot = '/tmp/project'

    expect(workflowArtifactStoragePath(workspaceRoot, 'project-context').relativePath)
      .toBe('.workflow/project-context.md')
    expect(() => workflowArtifactStoragePath(workspaceRoot, 'docs/project-context.md')).toThrow()
    expect(() => workflowArtifactStoragePath(workspaceRoot, '../project-context')).toThrow()
  })
})
