import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { randomBytes } from 'node:crypto'
import { ApiError } from '../middleware/errorHandler.js'
import type { WorkflowArtifact, WorkflowRun } from './workflowTypes.js'

type WorkflowStorageKind = 'project-context' | 'work-order' | 'run-report'

export type WorkflowArtifactStoragePath = {
  absolutePath: string
  relativePath: string
}

export type EnsureWorkflowArtifactStorageInput = {
  workspaceRoot: string
  run: WorkflowRun
  runIndex?: number
  now: string
}

const WORKFLOW_DIR = '.workflow'
const CANONICAL_FILES: Record<WorkflowStorageKind, string> = {
  'project-context': 'project-context.md',
  'work-order': 'work-order.md',
  'run-report': 'run-report.md',
}

const WORK_ORDER_ARTIFACT_IDS = new Set([
  'work-order',
  'feature-work-order',
  'debug-context',
  'debug-report',
  'problem-report',
  'execution-plan',
])

const RUN_REPORT_ARTIFACT_IDS = new Set([
  'run-report',
  'run-preview',
  'quality-report',
  'review-report',
  'verification-report',
  'handoff-summary',
  'final-report',
])

export function workflowArtifactStoragePath(
  workspaceRoot: string,
  kind: WorkflowStorageKind,
): WorkflowArtifactStoragePath {
  if (!Object.hasOwn(CANONICAL_FILES, kind)) {
    throw ApiError.badRequest('Workflow artifacts must use a canonical .workflow storage kind')
  }
  const absolutePath = path.join(workspaceRoot, WORKFLOW_DIR, CANONICAL_FILES[kind])
  return {
    absolutePath,
    relativePath: path.posix.join(WORKFLOW_DIR, CANONICAL_FILES[kind]),
  }
}

export function workflowRunArchiveDir(workspaceRoot: string, runIndex = 0): string {
  return path.join(workspaceRoot, WORKFLOW_DIR, 'runs', `run-${String(runIndex + 1).padStart(3, '0')}`)
}

export async function ensureWorkflowArtifactStorage(
  input: EnsureWorkflowArtifactStorageInput,
): Promise<void> {
  if (!input.workspaceRoot) return

  await ensureWorkflowDirectories(input.workspaceRoot)
  await writeCurrentCanonicalFiles(input)
  await writeRunArchive(input)
}

async function ensureWorkflowDirectories(workspaceRoot: string): Promise<void> {
  await Promise.all([
    fs.mkdir(path.join(workspaceRoot, WORKFLOW_DIR, 'runs'), { recursive: true }),
    fs.mkdir(path.join(workspaceRoot, WORKFLOW_DIR, 'logs'), { recursive: true }),
    fs.mkdir(path.join(workspaceRoot, WORKFLOW_DIR, 'preview'), { recursive: true }),
    fs.mkdir(path.join(workspaceRoot, WORKFLOW_DIR, 'archive'), { recursive: true }),
  ])
}

async function writeCurrentCanonicalFiles(input: EnsureWorkflowArtifactStorageInput): Promise<void> {
  const projectContext = findArtifact(input.run, (artifact) =>
    artifact.id === 'project-context' || artifact.filename === 'project-context.md')
  const workOrder = findArtifact(input.run, (artifact) =>
    WORK_ORDER_ARTIFACT_IDS.has(artifact.id) || WORK_ORDER_ARTIFACT_IDS.has(stripMarkdownExt(artifact.filename)))
  const runReport = findArtifact(input.run, (artifact) =>
    RUN_REPORT_ARTIFACT_IDS.has(artifact.id) || RUN_REPORT_ARTIFACT_IDS.has(stripMarkdownExt(artifact.filename)))

  await writeCanonicalFile(input.workspaceRoot, 'project-context', projectContext?.content ?? renderProjectContext(input))
  await writeCanonicalFile(input.workspaceRoot, 'work-order', workOrder?.content ?? renderWorkOrder(input))
  await writeCanonicalFile(input.workspaceRoot, 'run-report', runReport?.content ?? renderRunReport(input))
}

async function writeRunArchive(input: EnsureWorkflowArtifactStorageInput): Promise<void> {
  const archiveDir = workflowRunArchiveDir(input.workspaceRoot, input.runIndex ?? 0)
  await fs.mkdir(archiveDir, { recursive: true })

  for (const artifact of input.run.artifacts) {
    const filename = safeMarkdownFilename(artifact.filename ?? `${artifact.id}.md`)
    await atomicWriteFile(
      path.join(archiveDir, filename),
      artifact.content ?? renderArtifactSummary(artifact),
    )
  }
}

async function writeCanonicalFile(
  workspaceRoot: string,
  kind: WorkflowStorageKind,
  content: string,
): Promise<void> {
  const storagePath = workflowArtifactStoragePath(workspaceRoot, kind)
  await atomicWriteFile(storagePath.absolutePath, content)
}

async function atomicWriteFile(filePath: string, content: string): Promise<void> {
  const tmpFile = `${filePath}.tmp.${process.pid}.${Date.now()}.${randomBytes(6).toString('hex')}`
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  try {
    await fs.writeFile(tmpFile, `${content.trimEnd()}\n`, 'utf-8')
    await fs.rename(tmpFile, filePath)
  } catch (error) {
    await fs.unlink(tmpFile).catch(() => {})
    throw ApiError.internal(`Failed to write workflow project artifact: ${error}`)
  }
}

function findArtifact(
  run: WorkflowRun,
  predicate: (artifact: WorkflowArtifact) => boolean,
): WorkflowArtifact | null {
  return [...run.artifacts].reverse().find(predicate) ?? null
}

function stripMarkdownExt(filename: string | undefined): string {
  return filename?.replace(/\.md$/i, '') ?? ''
}

function safeMarkdownFilename(filename: string): string {
  const basename = path.basename(filename)
  if (
    basename !== filename ||
    basename === '.' ||
    basename === '..' ||
    basename.includes('/') ||
    basename.includes('\\') ||
    !basename.endsWith('.md')
  ) {
    return 'artifact.md'
  }
  return basename
}

function renderProjectContext(input: EnsureWorkflowArtifactStorageInput): string {
  return [
    '# Project Context',
    '',
    `workspaceRoot: ${input.workspaceRoot}`,
    `workflowRunId: ${input.run.id}`,
    `templateId: ${input.run.templateId}`,
    `label: ${input.run.primaryLabel ?? 'unknown'}`,
    `effort: ${input.run.effort ?? 'unknown'}`,
    `updatedAt: ${input.now}`,
  ].join('\n')
}

function renderWorkOrder(input: EnsureWorkflowArtifactStorageInput): string {
  return [
    '# Work Order',
    '',
    `workflowRunId: ${input.run.id}`,
    `templateId: ${input.run.templateId}`,
    `status: ${input.run.status}`,
    `currentPhaseId: ${input.run.currentPhaseId ?? 'unknown'}`,
    `updatedAt: ${input.now}`,
  ].join('\n')
}

function renderRunReport(input: EnsureWorkflowArtifactStorageInput): string {
  return [
    '# Run Report',
    '',
    `workflowRunId: ${input.run.id}`,
    `status: ${input.run.status}`,
    `updatedAt: ${input.now}`,
    '',
    'History:',
    ...input.run.history.map((event) => `- ${event.at}: ${event.summary}`),
  ].join('\n')
}

function renderArtifactSummary(artifact: WorkflowArtifact): string {
  return [
    `# ${artifact.filename ?? artifact.id}`,
    '',
    `id: ${artifact.id}`,
    `kind: ${artifact.kind}`,
    artifact.phaseId ? `phaseId: ${artifact.phaseId}` : null,
    artifact.description ? `description: ${artifact.description}` : null,
    `updatedAt: ${artifact.updatedAt}`,
  ].filter((line): line is string => line !== null).join('\n')
}
