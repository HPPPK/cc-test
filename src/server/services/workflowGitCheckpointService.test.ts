import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  createWorkflowGitCheckpoint,
  listWorkflowGitCheckpoints,
  restoreWorkflowGitCheckpoint,
} from './workflowGitCheckpointService.js'

let tmpDir: string | null = null
let configDir: string | null = null
let originalConfigDir: string | undefined

beforeEach(async () => {
  originalConfigDir = process.env.CLAUDE_CONFIG_DIR
  configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'workflow-git-checkpoint-config-'))
  process.env.CLAUDE_CONFIG_DIR = configDir
})

afterEach(async () => {
  if (originalConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR
  } else {
    process.env.CLAUDE_CONFIG_DIR = originalConfigDir
  }
  originalConfigDir = undefined
  if (tmpDir) {
    await fs.rm(tmpDir, { recursive: true, force: true })
    tmpDir = null
  }
  if (configDir) {
    await fs.rm(configDir, { recursive: true, force: true })
    configDir = null
  }
})

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
  }).trim()
}

function gitRaw(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
  })
}

async function createRepo(): Promise<string> {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'workflow-git-checkpoint-'))
  git(tmpDir, 'init')
  git(tmpDir, 'config', 'core.autocrlf', 'false')
  git(tmpDir, 'config', 'user.email', 'workflow-checkpoint@example.com')
  git(tmpDir, 'config', 'user.name', 'Workflow Checkpoint')
  await fs.writeFile(path.join(tmpDir, 'README.md'), 'initial\n')
  git(tmpDir, 'add', 'README.md')
  git(tmpDir, 'commit', '-m', 'initial')
  return tmpDir
}

describe('workflowGitCheckpointService', () => {
  it('creates git-backed workflow checkpoints without moving HEAD or mutating the working tree/index', async () => {
    const repo = await createRepo()
    const headBefore = git(repo, 'rev-parse', 'HEAD')

    await fs.writeFile(path.join(repo, 'README.md'), 'saved content\n')
    await fs.writeFile(path.join(repo, 'notes.txt'), 'untracked note\n')

    const created = await createWorkflowGitCheckpoint('session-a', repo, {
      phaseId: 'build',
      phaseIndex: 2,
      label: 'Build save',
    })

    expect(created.latestVersion).toBe(1)
    expect(created.checkpoint).toMatchObject({
      id: 'v1',
      version: 1,
      phaseId: 'build',
      phaseIndex: 2,
      label: 'Build save',
    })
    expect(git(repo, 'rev-parse', 'HEAD')).toBe(headBefore)
    expect(gitRaw(repo, 'status', '--short').split('\n').filter(Boolean).sort()).toEqual([
      ' M README.md',
      '?? notes.txt',
    ])

    const listed = await listWorkflowGitCheckpoints('session-a', repo)
    expect(listed.enabled).toBe(true)
    expect(listed.latestVersion).toBe(1)
    expect(listed.checkpoints.map((checkpoint) => checkpoint.id)).toEqual(['v1'])
  }, 60_000)

  it('restores tracked files to a selected checkpoint version', async () => {
    const repo = await createRepo()
    await fs.writeFile(path.join(repo, 'README.md'), 'checkpoint content\n')
    await createWorkflowGitCheckpoint('session-a', repo, { label: 'Before regression' })
    await fs.writeFile(path.join(repo, 'README.md'), 'regressed content\n')
    await fs.writeFile(path.join(repo, 'generated.txt'), 'generated after checkpoint\n')

    const restored = await restoreWorkflowGitCheckpoint('session-a', repo, { checkpointId: 'v1' })

    expect(restored.checkpoint.id).toBe('v1')
    expect(restored.removedFiles).toContain('generated.txt')
    expect(await fs.readFile(path.join(repo, 'README.md'), 'utf8')).toBe('checkpoint content\n')
    await expect(fs.stat(path.join(repo, 'generated.txt'))).rejects.toThrow()
  }, 60_000)

  it('stores and restores workflow state snapshots with checkpoint versions', async () => {
    const repo = await createRepo()
    await fs.writeFile(path.join(repo, 'README.md'), 'checkpoint content\n')
    await createWorkflowGitCheckpoint('session-a', repo, {
      label: 'Phase save',
      workflowStateSnapshot: {
        schemaVersion: 1,
        sessionId: 'session-a',
        mode: 'workflow',
        template: {
          id: 'template-a',
          version: '1',
          source: 'user',
          snapshotId: 'template-a-v1',
          sourceState: 'current',
        },
        templateSnapshot: {
          schemaVersion: 1,
          id: 'template-a',
          source: 'user',
          version: '1',
          displayName: 'Template A',
          description: 'Template A',
          phases: [],
        },
        templateIdentity: {
          id: 'template-a',
          source: 'user',
          version: '1',
        },
        sourceTemplateStatus: 'current',
        status: 'running',
        workflowStatus: 'running',
        activePhaseId: 'scope-plan',
        phases: [],
        phaseRuns: [],
        transitionHistory: [],
        artifactIndex: [],
        finalReportRef: null,
        stateVersion: 3,
        revision: 4,
        createdAt: '2026-07-04T00:00:00.000Z',
        updatedAt: '2026-07-04T00:00:00.000Z',
      },
    })

    const restored = await restoreWorkflowGitCheckpoint('session-a', repo, { checkpointId: 'v1' })

    expect(restored.workflowStateRestored).toBe(true)
    expect(restored.workflowStateSnapshot?.activePhaseId).toBe('scope-plan')
    expect(restored.workflowStateSnapshot?.stateVersion).toBe(3)
  }, 60_000)

  it('creates and restores checkpoints for non-git workflow workspaces using cc-jiangxia local storage', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'workflow-git-checkpoint-non-git-'))
    await fs.writeFile(path.join(tmpDir, 'notes.txt'), 'checkpoint content\n')

    const created = await createWorkflowGitCheckpoint('session-a', tmpDir, { label: 'Non git save' })
    expect(created.latestVersion).toBe(1)
    expect(created.checkpoint).toMatchObject({ id: 'v1', label: 'Non git save' })
    expect(await fs.readdir(tmpDir)).toEqual(['notes.txt'])

    await fs.writeFile(path.join(tmpDir, 'notes.txt'), 'regressed content\n')
    await restoreWorkflowGitCheckpoint('session-a', tmpDir, { checkpointId: 'v1' })

    expect(await fs.readFile(path.join(tmpDir, 'notes.txt'), 'utf8')).toBe('checkpoint content\n')
    const listed = await listWorkflowGitCheckpoints('session-a', tmpDir)
    expect(listed.enabled).toBe(true)
    expect(listed.latestVersion).toBe(1)
  })

  it('excludes dependency folders from workflow checkpoints', async () => {
    const repo = await createRepo()
    await fs.mkdir(path.join(repo, 'node_modules', 'pkg'), { recursive: true })
    await fs.writeFile(path.join(repo, 'node_modules', 'pkg', 'index.js'), 'large dependency\n')
    await fs.writeFile(path.join(repo, 'README.md'), 'checkpoint content\n')

    await createWorkflowGitCheckpoint('session-a', repo, { label: 'Before dependency churn' })
    await fs.writeFile(path.join(repo, 'README.md'), 'regressed content\n')
    await fs.writeFile(path.join(repo, 'node_modules', 'pkg', 'index.js'), 'changed dependency\n')
    await restoreWorkflowGitCheckpoint('session-a', repo, { checkpointId: 'v1' })

    expect(await fs.readFile(path.join(repo, 'README.md'), 'utf8')).toBe('checkpoint content\n')
    expect(await fs.readFile(path.join(repo, 'node_modules', 'pkg', 'index.js'), 'utf8')).toBe('changed dependency\n')
  })
})
