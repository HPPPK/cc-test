import { invokeUncheckedFixture } from '../__tests__/fixtureAssertions.js'
import { describe, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  ensureWorkflowArtifactStorage,
  workflowArtifactStoragePath,
  workflowRunArchiveDir,
  workflowRunStateDir,
} from './workflowArtifactStorage.js'
import type { WorkflowContextCapsule, WorkflowRun, WorkflowTemplate } from './workflowTypes.js'

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

  test('state synchronization preserves editable canonical notes and their read timestamps', async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workflow-storage-owner-'))
    try {
      const input = { workspaceRoot, run: run({ workspaceRoot }), now: NOW }
      await ensureWorkflowArtifactStorage(input)
      const target = path.join(workspaceRoot, '.workflow/project-context.md')
      await fs.writeFile(target, '# 用户和模型共同整理的背景\n保留已确认需求\n')
      const before = await fs.stat(target)
      await ensureWorkflowArtifactStorage({ ...input, run: { ...input.run, currentPhaseId: 'scope' } })
      expect(await fs.readFile(target, 'utf8')).toContain('保留已确认需求')
      expect((await fs.stat(target)).mtimeMs).toBe(before.mtimeMs)
      const workOrder = path.join(workspaceRoot, '.workflow/work-order.md')
      const orderBefore = await fs.stat(workOrder)
      await ensureWorkflowArtifactStorage(input)
      expect((await fs.stat(workOrder)).mtimeMs).toBe(orderBefore.mtimeMs)
      await fs.unlink(workOrder)
      await ensureWorkflowArtifactStorage(input)
      expect(await fs.readFile(workOrder, 'utf8')).toContain('Work Order')
    } finally { await fs.rm(workspaceRoot, { recursive: true, force: true }) }
  })

  test('backend archives refresh independently while unchanged snapshots do not invalidate reads', async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workflow-storage-archive-owner-'))
    try {
      const artifact = { id: 'project-context', filename: 'project-context.md', kind: 'markdown' as const, required: true, createdAt: NOW, updatedAt: NOW, content: '# Initial' }
      const input = { workspaceRoot, run: run({ workspaceRoot, artifacts: [artifact] }), now: NOW }
      await ensureWorkflowArtifactStorage(input)
      const archived = path.join(workflowRunArchiveDir(workspaceRoot, 0), artifact.filename)
      const before = await fs.stat(archived)
      await ensureWorkflowArtifactStorage(input)
      expect((await fs.stat(archived)).mtimeMs).toBe(before.mtimeMs)
      artifact.content = '# Updated state snapshot'
      await ensureWorkflowArtifactStorage(input)
      expect(await fs.readFile(archived, 'utf8')).toContain('Updated state snapshot')
      expect(await fs.readFile(path.join(workspaceRoot, '.workflow/project-context.md'), 'utf8')).toBe('# Initial\n')
    } finally { await fs.rm(workspaceRoot, { recursive: true, force: true }) }
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

  test('persists the run template snapshot and context handoffs under the stable run id', async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workflow-storage-snapshot-'))
    const currentRun = run({ id: 'session-abc-run-1', workspaceRoot })
    const templateSnapshot: WorkflowTemplate = {
      schemaVersion: 2, id: 'guided-product-builder', source: 'pack', version: '7', displayName: 'Guided', description: 'Storage fixture', phases: [],
    }
    const capsule: WorkflowContextCapsule = {
      schemaVersion: 1, id: 'capsule-route-to-scope', sessionId: 'session-abc', runId: currentRun.id,
      fromPhaseId: 'route', toPhaseId: 'scope', sourceStateVersion: 4, sourceHash: 'sha256-abc', createdAt: NOW,
      userRequirements: [], userDecisions: [], acceptedTaskIds: [], completedTaskIds: [], incompleteTaskIds: [],
      artifactRefs: [], modifiedFiles: [], verificationEvidence: [], excludedIssues: [], unresolvedRisks: [], nextActions: [],
      handoff: { summary: 'route complete' },
    }

    await ensureWorkflowArtifactStorage({
      workspaceRoot,
      run: currentRun,
      now: NOW,
      templateSnapshot,
      templateSnapshotHash: 'sha256-template',
      contextCapsules: [capsule],
    })

    const runDir = workflowRunStateDir(workspaceRoot, currentRun.id)
    await expect(fs.readFile(path.join(runDir, 'template.snapshot.json'), 'utf8'))
      .resolves.toContain('sha256-template')
    await expect(fs.readFile(path.join(runDir, 'handoffs', 'route-to-scope.json'), 'utf8'))
      .resolves.toContain('route complete')
  })

  test('rejects workflow artifact storage outside the workspace .workflow directory', () => {
    const workspaceRoot = '/tmp/project'

    expect(workflowArtifactStoragePath(workspaceRoot, 'project-context').relativePath)
      .toBe('.workflow/project-context.md')
    expect(() => invokeUncheckedFixture(workflowArtifactStoragePath, undefined, [workspaceRoot, 'docs/project-context.md'])).toThrow()
    expect(() => invokeUncheckedFixture(workflowArtifactStoragePath, undefined, [workspaceRoot, '../project-context'])).toThrow()
  })
})
