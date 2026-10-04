import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { WorkflowPackLock, WorkflowPackLockEntry } from './build-workflow-packs.js'

const repoRoot = path.resolve(import.meta.dir, '..')

export type WorkflowPackAuditResult = 'pass' | 'missing' | 'checksum-mismatch'

export type WorkflowPackAuditEntry = {
  packId: string
  filename: string
  version: string
  workflowVersion: string
  expectedSha256: string
  actualSha256: string | null
  layer: string
  result: WorkflowPackAuditResult
}

export type WorkflowPackAuditReport = {
  schemaVersion: 1
  generatedAt: string
  layer: string
  resourceDir: string
  packDir: string | null
  lockFile: string
  result: 'pass' | 'fail'
  packs: WorkflowPackAuditEntry[]
}

export class WorkflowPackAuditError extends Error {
  readonly report: WorkflowPackAuditReport

  constructor(message: string, report: WorkflowPackAuditReport) {
    super(message)
    this.name = 'WorkflowPackAuditError'
    this.report = report
  }
}

export async function auditWorkflowPackResources(options: {
  resourceDir: string
  lockFile?: string
  layer: string
  outputFile: string
}): Promise<WorkflowPackAuditReport> {
  const resourceDir = path.resolve(options.resourceDir)
  const lockFile = path.resolve(options.lockFile ?? path.join(repoRoot, 'workflow-pack-lock.json'))
  const outputFile = path.resolve(options.outputFile)
  const lock = await readWorkflowPackLock(lockFile)
  const filenames = lock.packs.map(pack => pack.filename || pack.packId + '.zip')
  const packDir = await findPackDirectory(resourceDir, filenames)
  const packs = await Promise.all(lock.packs.map(pack => auditEntry(packDir, pack, options.layer)))
  const report: WorkflowPackAuditReport = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    layer: options.layer,
    resourceDir,
    packDir,
    lockFile,
    result: packs.every(pack => pack.result === 'pass') ? 'pass' : 'fail',
    packs,
  }

  await mkdir(path.dirname(outputFile), { recursive: true })
  await writeFile(outputFile, JSON.stringify(report, null, 2) + '\n', 'utf8')
  if (report.result !== 'pass') {
    const failures = packs.filter(pack => pack.result !== 'pass')
      .map(pack => pack.packId + ': ' + pack.result)
      .join(', ')
    throw new WorkflowPackAuditError('Workflow pack audit failed for ' + options.layer + ': ' + failures, report)
  }
  return report
}

async function readWorkflowPackLock(lockFile: string): Promise<WorkflowPackLock> {
  const parsed = JSON.parse(await readFile(lockFile, 'utf8')) as WorkflowPackLock
  if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.packs) || parsed.packs.length === 0) {
    throw new Error('Invalid workflow-pack-lock.json: ' + lockFile)
  }
  return parsed
}

async function auditEntry(
  packDir: string | null,
  pack: WorkflowPackLockEntry,
  layer: string,
): Promise<WorkflowPackAuditEntry> {
  const filename = pack.filename || pack.packId + '.zip'
  let actualSha256: string | null = null
  if (packDir) {
    try {
      actualSha256 = createHash('sha256').update(await readFile(path.join(packDir, filename))).digest('hex')
    } catch {}
  }
  return {
    packId: pack.packId,
    filename,
    version: pack.packVersion,
    workflowVersion: pack.workflowVersion,
    expectedSha256: pack.sha256,
    actualSha256,
    layer,
    result: actualSha256 === null
      ? 'missing'
      : actualSha256 === pack.sha256
        ? 'pass'
        : 'checksum-mismatch',
  }
}

async function findPackDirectory(resourceDir: string, filenames: string[]): Promise<string | null> {
  const queue = [resourceDir]
  const visited = new Set<string>()
  while (queue.length) {
    const current = queue.shift()!
    if (visited.has(current)) continue
    visited.add(current)
    let entries
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      continue
    }
    const fileNames = new Set(entries.filter(entry => entry.isFile()).map(entry => entry.name))
    if (filenames.every(filename => fileNames.has(filename))) return current
    for (const entry of entries) {
      if (!entry.isDirectory() || shouldSkipDirectory(entry.name)) continue
      queue.push(path.join(current, entry.name))
    }
  }
  return null
}

function shouldSkipDirectory(name: string): boolean {
  return name === '.git' || name === 'node_modules' || name === '.playwright-browsers'
}

function argValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : undefined
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const resourceDir = argValue(args, '--resource-dir')
  const outputFile = argValue(args, '--output-file')
  const layer = argValue(args, '--layer')
  if (!resourceDir || !outputFile || !layer) {
    throw new Error('Usage: bun run scripts/audit-workflow-packs.ts --resource-dir <dir> --layer <name> --output-file <file> [--lock-file <file>]')
  }
  const report = await auditWorkflowPackResources({
    resourceDir,
    outputFile,
    layer,
    ...(argValue(args, '--lock-file') ? { lockFile: argValue(args, '--lock-file') } : {}),
  })
  console.log('[workflow-pack-audit] ' + report.layer + ' verified ' + report.packs.length + ' pack(s).')
}
