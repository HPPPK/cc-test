import * as fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import * as os from 'node:os'
import * as path from 'node:path'

import { getAppStoragePath } from '../../utils/appIdentity.js'
import type { WorkflowSessionState } from './workflowTypes.js'

export type WorkflowGitCheckpoint = {
  id: string
  ref: string
  version: number
  commit: string
  phaseId: string | null
  phaseIndex: number | null
  label: string
  createdAt: string
  message: string
}

export type WorkflowCheckpointTranscriptSnapshot = {
  messageCount: number
  lastMessageId?: string | null
}

export type WorkflowGitCheckpointListResponse = {
  enabled: boolean
  reason?: string
  latestVersion: number | null
  checkpoints: WorkflowGitCheckpoint[]
}

export type WorkflowGitCheckpointCreateRequest = {
  phaseId?: string | null
  phaseIndex?: number | null
  label?: string
  workflowStateSnapshot?: WorkflowSessionState | null
  transcriptSnapshot?: WorkflowCheckpointTranscriptSnapshot | null
}

export type WorkflowGitCheckpointCreateResponse = {
  ok: true
  checkpoint: WorkflowGitCheckpoint
  checkpoints: WorkflowGitCheckpoint[]
  latestVersion: number
}

export type WorkflowGitCheckpointRestoreRequest = {
  checkpointId: string
}

export type WorkflowGitCheckpointRestoreResponse = {
  ok: true
  checkpoint: WorkflowGitCheckpoint
  workflowStateSnapshot?: WorkflowSessionState
  workflowStateRestored: boolean
  transcriptSnapshot?: WorkflowCheckpointTranscriptSnapshot
  transcriptRestored: boolean
  removedFiles: string[]
}

const REF_PREFIX = 'refs/cc-jiangxia/workflow'
const LOCAL_STORE_DIR = 'workflow-checkpoints'
const CHECKPOINT_EXCLUDED_PATHS = [
  ':(exclude).git',
  ':(exclude)**/.git',
  ':(exclude)node_modules',
  ':(exclude)**/node_modules',
  ':(exclude).next',
  ':(exclude)**/.next',
  ':(exclude)dist',
  ':(exclude)**/dist',
  ':(exclude)build',
  ':(exclude)**/build',
  ':(exclude)coverage',
  ':(exclude)**/coverage',
  ':(exclude).turbo',
  ':(exclude)**/.turbo',
  ':(exclude).vite',
  ':(exclude)**/.vite',
  ':(exclude).cache',
  ':(exclude)**/.cache',
]

async function git(cwd: string, args: string[], env?: Record<string, string>): Promise<string> {
  const proc = Bun.spawn(['git', ...args], {
    cwd,
    env: { ...process.env, ...env },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || stdout.trim() || `git ${args.join(' ')} failed`)
  }
  return stdout.trim()
}

type WorkflowCheckpointStore = {
  enabled: true
  cwd: string
  argsPrefix: string[]
  fallback: boolean
}

function configDir(): string {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
}

function workspaceStoreDir(workDir: string): string {
  const hash = createHash('sha256').update(path.resolve(workDir)).digest('hex').slice(0, 24)
  return getAppStoragePath(configDir(), LOCAL_STORE_DIR, hash)
}

function checkpointStateSnapshotPath(workDir: string, sessionId: string, version: number): string {
  const hash = createHash('sha256').update(path.resolve(workDir)).digest('hex').slice(0, 24)
  return getAppStoragePath(configDir(), LOCAL_STORE_DIR, hash, safeSessionRef(sessionId), `v${version}.state.json`)
}

function checkpointTranscriptSnapshotPath(workDir: string, sessionId: string, version: number): string {
  const hash = createHash('sha256').update(path.resolve(workDir)).digest('hex').slice(0, 24)
  return getAppStoragePath(configDir(), LOCAL_STORE_DIR, hash, safeSessionRef(sessionId), `v${version}.transcript.json`)
}

async function writeCheckpointStateSnapshot(
  workDir: string,
  sessionId: string,
  version: number,
  state: WorkflowSessionState | null | undefined,
): Promise<void> {
  if (!state) return
  const filePath = checkpointStateSnapshotPath(workDir, sessionId, version)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf-8')
}

async function writeCheckpointTranscriptSnapshot(
  workDir: string,
  sessionId: string,
  version: number,
  transcript: WorkflowCheckpointTranscriptSnapshot | null | undefined,
): Promise<void> {
  if (!transcript) return
  const messageCount = Number.isInteger(transcript.messageCount)
    ? Math.max(0, transcript.messageCount)
    : 0
  const snapshot: WorkflowCheckpointTranscriptSnapshot = {
    messageCount,
    lastMessageId: transcript.lastMessageId ?? null,
  }
  const filePath = checkpointTranscriptSnapshotPath(workDir, sessionId, version)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf-8')
}

async function readCheckpointStateSnapshot(
  workDir: string,
  sessionId: string,
  version: number,
): Promise<WorkflowSessionState | undefined> {
  try {
    const raw = await fs.readFile(checkpointStateSnapshotPath(workDir, sessionId, version), 'utf-8')
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
    return parsed as WorkflowSessionState
  } catch {
    return undefined
  }
}

async function readCheckpointTranscriptSnapshot(
  workDir: string,
  sessionId: string,
  version: number,
): Promise<WorkflowCheckpointTranscriptSnapshot | undefined> {
  try {
    const raw = await fs.readFile(checkpointTranscriptSnapshotPath(workDir, sessionId, version), 'utf-8')
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
    const messageCount = (parsed as { messageCount?: unknown }).messageCount
    if (!Number.isInteger(messageCount) || messageCount < 0) return undefined
    const lastMessageId = (parsed as { lastMessageId?: unknown }).lastMessageId
    return {
      messageCount,
      lastMessageId: typeof lastMessageId === 'string' ? lastMessageId : null,
    }
  } catch {
    return undefined
  }
}

async function ensureLocalStore(workDir: string): Promise<WorkflowCheckpointStore> {
  const gitDir = workspaceStoreDir(workDir)
  await fs.mkdir(path.dirname(gitDir), { recursive: true })
  try {
    await fs.access(path.join(gitDir, 'HEAD'))
  } catch {
    await git(workDir, ['init', '--bare', gitDir])
    await git(workDir, ['--git-dir', gitDir, 'config', 'core.autocrlf', 'false'])
  }
  return {
    enabled: true,
    cwd: workDir,
    argsPrefix: ['--git-dir', gitDir, '--work-tree', workDir],
    fallback: true,
  }
}

async function resolveCheckpointStore(workDir: string): Promise<WorkflowCheckpointStore | { enabled: false; reason: string }> {
  try {
    const stat = await fs.stat(workDir)
    if (!stat.isDirectory()) {
      return { enabled: false, reason: 'Workflow checkpoint workspace is not a directory.' }
    }
  } catch {
    return { enabled: false, reason: 'Workflow checkpoint workspace does not exist.' }
  }

  try {
    const repoRoot = await git(workDir, ['rev-parse', '--show-toplevel'])
    return {
      enabled: true,
      cwd: repoRoot,
      argsPrefix: [],
      fallback: false,
    }
  } catch {
    return await ensureLocalStore(workDir)
  }
}

function safeSessionRef(sessionId: string): string {
  return `session-${sessionId.replace(/[^A-Za-z0-9._-]/g, '-')}`
}

function checkpointRef(sessionId: string, version: number): string {
  return `${REF_PREFIX}/${safeSessionRef(sessionId)}/v${version}`
}

function checkpointNamespace(sessionId: string): string {
  return `${REF_PREFIX}/${safeSessionRef(sessionId)}`
}

function parseCheckpointSubject(subject: string): Pick<WorkflowGitCheckpoint, 'phaseId' | 'phaseIndex' | 'label' | 'message'> {
  const match = subject.match(/^cc-jiangxia workflow checkpoint v\d+(?: \[phase=([^\] ]+)(?: index=(\d+))?\])?(?: - (.*))?$/)
  return {
    phaseId: match?.[1] ?? null,
    phaseIndex: match?.[2] ? Number.parseInt(match[2], 10) : null,
    label: match?.[3] || subject,
    message: subject,
  }
}

function parseCheckpointLine(line: string): WorkflowGitCheckpoint | null {
  const [ref, commit, createdAt, ...subjectParts] = line.split('|')
  const subject = subjectParts.join('|')
  const id = ref?.split('/').pop() ?? ''
  const version = id.startsWith('v') ? Number.parseInt(id.slice(1), 10) : NaN
  if (!ref || !commit || !Number.isInteger(version)) return null
  const metadata = parseCheckpointSubject(subject)
  return {
    id,
    ref,
    version,
    commit,
    createdAt: createdAt || '',
    ...metadata,
  }
}

async function runStoreGit(store: WorkflowCheckpointStore, args: string[], env?: Record<string, string>): Promise<string> {
  return await git(store.cwd, [...store.argsPrefix, ...args], env)
}

function normalizeGitPath(filePath: string): string {
  return filePath.split(path.sep).join('/')
}

function isExcludedWorkspacePath(relativePath: string): boolean {
  const normalized = normalizeGitPath(relativePath)
  return normalized === '.git' ||
    normalized.startsWith('.git/') ||
    normalized === 'node_modules' ||
    normalized.startsWith('node_modules/') ||
    normalized.includes('/node_modules/') ||
    normalized === 'dist' ||
    normalized.startsWith('dist/') ||
    normalized.includes('/dist/') ||
    normalized === 'build' ||
    normalized.startsWith('build/') ||
    normalized.includes('/build/') ||
    normalized === 'coverage' ||
    normalized.startsWith('coverage/') ||
    normalized.includes('/coverage/') ||
    normalized === '.next' ||
    normalized.startsWith('.next/') ||
    normalized.includes('/.next/') ||
    normalized === '.turbo' ||
    normalized.startsWith('.turbo/') ||
    normalized.includes('/.turbo/') ||
    normalized === '.vite' ||
    normalized.startsWith('.vite/') ||
    normalized.includes('/.vite/') ||
    normalized === '.cache' ||
    normalized.startsWith('.cache/') ||
    normalized.includes('/.cache/')
}

async function listWorkspaceFiles(root: string, dir = root): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name)
    const relative = normalizeGitPath(path.relative(root, absolute))
    if (!relative || isExcludedWorkspacePath(relative)) continue
    if (entry.isDirectory()) {
      files.push(...await listWorkspaceFiles(root, absolute))
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      files.push(relative)
    }
  }
  return files
}

async function removeFilesAbsentFromCheckpoint(store: WorkflowCheckpointStore, checkpointCommit: string): Promise<string[]> {
  const treeOutput = await runStoreGit(store, ['ls-tree', '-r', '--name-only', checkpointCommit])
  const checkpointFiles = new Set(treeOutput ? treeOutput.split('\n').map((item) => item.trim()).filter(Boolean) : [])
  const currentFiles = await listWorkspaceFiles(store.cwd)
  const removed: string[] = []

  for (const relativePath of currentFiles) {
    if (checkpointFiles.has(relativePath) || isExcludedWorkspacePath(relativePath)) continue
    await fs.rm(path.join(store.cwd, relativePath), { force: true })
    removed.push(relativePath)
  }

  return removed
}

async function listRefs(store: WorkflowCheckpointStore, sessionId: string): Promise<WorkflowGitCheckpoint[]> {
  const namespace = checkpointNamespace(sessionId)
  const output = await runStoreGit(store, [
    'for-each-ref',
    namespace,
    '--format=%(refname)|%(objectname)|%(creatordate:iso-strict)|%(subject)',
  ])
  if (!output) return []
  return output
    .split('\n')
    .map(parseCheckpointLine)
    .filter((item): item is WorkflowGitCheckpoint => Boolean(item))
    .sort((a, b) => b.version - a.version)
}

export async function listWorkflowGitCheckpoints(
  sessionId: string,
  workDir: string,
): Promise<WorkflowGitCheckpointListResponse> {
  const resolved = await resolveCheckpointStore(workDir)
  if (!resolved.enabled) {
    return { enabled: false, reason: resolved.reason, latestVersion: null, checkpoints: [] }
  }
  const checkpoints = await listRefs(resolved, sessionId)
  return {
    enabled: true,
    latestVersion: checkpoints[0]?.version ?? null,
    checkpoints,
  }
}

export async function createWorkflowGitCheckpoint(
  sessionId: string,
  workDir: string,
  request: WorkflowGitCheckpointCreateRequest = {},
): Promise<WorkflowGitCheckpointCreateResponse> {
  const resolved = await resolveCheckpointStore(workDir)
  if (!resolved.enabled) throw new Error(resolved.reason)

  const before = await listRefs(resolved, sessionId)
  const version = (before[0]?.version ?? 0) + 1
  const ref = checkpointRef(sessionId, version)
  const phaseSuffix = request.phaseId
    ? ` [phase=${request.phaseId}${Number.isInteger(request.phaseIndex) ? ` index=${request.phaseIndex}` : ''}]`
    : ''
  const label = request.label?.trim() || 'manual save'
  const message = `cc-jiangxia workflow checkpoint v${version}${phaseSuffix} - ${label}`
  const indexFile = path.join(os.tmpdir(), `cc-jiangxia-workflow-index-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const env = {
    GIT_INDEX_FILE: indexFile,
    GIT_AUTHOR_NAME: 'Claude Code Jiangxia',
    GIT_AUTHOR_EMAIL: 'workflow-checkpoint@cc-jiangxia.local',
    GIT_COMMITTER_NAME: 'Claude Code Jiangxia',
    GIT_COMMITTER_EMAIL: 'workflow-checkpoint@cc-jiangxia.local',
  }

  try {
    if (resolved.fallback) {
      await runStoreGit(resolved, ['read-tree', '--empty'], env)
    } else {
      await runStoreGit(resolved, ['read-tree', 'HEAD'], env)
    }
    await runStoreGit(resolved, ['add', '-A', '--', '.', ...CHECKPOINT_EXCLUDED_PATHS], env)
    const tree = await runStoreGit(resolved, ['write-tree'], env)
    const parent = before[0]?.commit || (!resolved.fallback ? await runStoreGit(resolved, ['rev-parse', 'HEAD']) : null)
    const commitArgs = parent
      ? ['commit-tree', tree, '-p', parent, '-m', message]
      : ['commit-tree', tree, '-m', message]
    const commit = await runStoreGit(resolved, commitArgs, env)
    await runStoreGit(resolved, ['update-ref', ref, commit])
    await writeCheckpointStateSnapshot(workDir, sessionId, version, request.workflowStateSnapshot)
    await writeCheckpointTranscriptSnapshot(workDir, sessionId, version, request.transcriptSnapshot)
  } finally {
    await fs.rm(indexFile, { force: true })
  }

  const checkpoints = await listRefs(resolved, sessionId)
  const checkpoint = checkpoints.find((item) => item.version === version)
  if (!checkpoint) throw new Error('Workflow checkpoint was not created')
  return { ok: true, checkpoint, checkpoints, latestVersion: version }
}

export async function restoreWorkflowGitCheckpoint(
  sessionId: string,
  workDir: string,
  request: WorkflowGitCheckpointRestoreRequest,
): Promise<WorkflowGitCheckpointRestoreResponse> {
  if (!/^v\d+$/.test(request.checkpointId)) {
    throw new Error('checkpointId must be a workflow checkpoint version such as v1')
  }
  const resolved = await resolveCheckpointStore(workDir)
  if (!resolved.enabled) throw new Error(resolved.reason)
  const checkpoints = await listRefs(resolved, sessionId)
  const checkpoint = checkpoints.find((item) => item.id === request.checkpointId)
  if (!checkpoint) throw new Error(`Workflow checkpoint not found: ${request.checkpointId}`)

  const indexFile = path.join(os.tmpdir(), `cc-jiangxia-workflow-restore-index-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const env = {
    GIT_INDEX_FILE: indexFile,
    GIT_AUTHOR_NAME: 'Claude Code Jiangxia',
    GIT_AUTHOR_EMAIL: 'workflow-checkpoint@cc-jiangxia.local',
    GIT_COMMITTER_NAME: 'Claude Code Jiangxia',
    GIT_COMMITTER_EMAIL: 'workflow-checkpoint@cc-jiangxia.local',
  }

  try {
    await runStoreGit(resolved, ['read-tree', checkpoint.commit], env)
    const removedFiles = await removeFilesAbsentFromCheckpoint(resolved, checkpoint.commit)
    await runStoreGit(resolved, ['checkout-index', '-a', '-f'], env)
    const workflowStateSnapshot = await readCheckpointStateSnapshot(workDir, sessionId, checkpoint.version)
    const transcriptSnapshot = await readCheckpointTranscriptSnapshot(workDir, sessionId, checkpoint.version)
    return {
      ok: true,
      checkpoint,
      ...(workflowStateSnapshot ? { workflowStateSnapshot } : {}),
      workflowStateRestored: Boolean(workflowStateSnapshot),
      ...(transcriptSnapshot ? { transcriptSnapshot } : {}),
      transcriptRestored: Boolean(transcriptSnapshot),
      removedFiles,
    }
  } finally {
    await fs.rm(indexFile, { force: true })
  }
}
