import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ZipPackAdapter } from '../src/server/services/zipPackAdapter.js'

const repoRoot = path.resolve(import.meta.dir, '..')
const DEFAULT_PACK_IDS = [
  'efficient-constrained-dev-debug-workflow-v5',
  'feature-extension-workflow-v8',
  'debug-repair-workflow-v8',
] as const
const adapter = new ZipPackAdapter()
const TEXT_EXTENSIONS = new Set([
  '.cjs', '.css', '.html', '.js', '.json', '.md', '.mjs', '.sh', '.ts', '.txt', '.yaml', '.yml',
])

export type WorkflowPackLockEntry = {
  packId: string
  packVersion: string
  workflowVersion: string
  sha256: string
  entrypoint: string
  sourceRevision: string
  filename: string
}

export type WorkflowPackLock = {
  schemaVersion: 1
  packs: WorkflowPackLockEntry[]
}

export type WorkflowPackBuildResult = {
  sourceDir: string
  outputDir: string
  lockFile: string
  packs: Array<WorkflowPackLockEntry & { outputPath: string }>
}

export type WorkflowPackBuildOptions = {
  sourceDir?: string
  outputDir?: string
  lockFile?: string
  packIds?: string[]
  sourceRevision?: string
}

type PreparedPack = {
  sourceRoot: string
  packId: string
  packVersion: string
  workflowVersion: string
  entrypoint: string
  sourceRevision: string
  entries: Record<string, Uint8Array>
  checksumsBytes: Uint8Array
}

export async function buildWorkflowPacks(options: WorkflowPackBuildOptions = {}): Promise<WorkflowPackBuildResult> {
  return buildWorkflowPacksInternal(options, { write: true })
}

export async function checkWorkflowPacks(options: WorkflowPackBuildOptions = {}): Promise<WorkflowPackBuildResult> {
  const outputDir = path.resolve(options.outputDir ?? path.join(repoRoot, 'src', 'server', 'packs'))
  const lockFile = path.resolve(options.lockFile ?? path.join(repoRoot, 'workflow-pack-lock.json'))
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'workflow-pack-check-'))
  try {
    const candidate = await buildWorkflowPacksInternal({
      ...options,
      outputDir: path.join(tempRoot, 'packs'),
      lockFile: path.join(tempRoot, 'workflow-pack-lock.json'),
    }, { write: true, writeSourceChecksums: false })

    const stale: string[] = []
    for (const pack of candidate.packs) {
      const actualPath = path.join(outputDir, pack.filename)
      if (!await filesEqual(actualPath, pack.outputPath)) stale.push(pack.filename)
    }
    if (!await filesEqual(lockFile, candidate.lockFile)) stale.push(path.basename(lockFile))

    for (const pack of candidate.packs) {
      const expectedSourceChecksums = pack.sourceRevision
      const sourceChecksumsPath = path.join(path.resolve(options.sourceDir ?? path.join(repoRoot, 'workflows')), pack.packId, 'checksums.json')
      try {
        const sourceChecksums = await readFile(sourceChecksumsPath)
        const parsed = JSON.parse(sourceChecksums.toString('utf8')) as { sourceRevision?: unknown }
        if (parsed.sourceRevision !== expectedSourceChecksums) stale.push(path.relative(repoRoot, sourceChecksumsPath).replaceAll('\\', '/'))
      } catch {
        stale.push(path.relative(repoRoot, sourceChecksumsPath).replaceAll('\\', '/'))
      }
    }

    if (stale.length) {
      throw new Error(
        'Workflow packs are out of date: ' + [...new Set(stale)].join(', ') + '. Run bun run build:workflow-packs.',
      )
    }
    return {
      ...candidate,
      outputDir,
      lockFile,
      packs: candidate.packs.map((pack) => ({ ...pack, outputPath: path.join(outputDir, pack.filename) })),
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
}

export async function auditWorkflowPackLayer(options: {
  packDir: string
  lockFile?: string
}): Promise<{ ok: true; packs: WorkflowPackLockEntry[] }> {
  const packDir = path.resolve(options.packDir)
  const lockFile = path.resolve(options.lockFile ?? path.join(repoRoot, 'workflow-pack-lock.json'))
  const lock = JSON.parse(await readFile(lockFile, 'utf8')) as WorkflowPackLock
  if (lock.schemaVersion !== 1 || !Array.isArray(lock.packs)) throw new Error('Invalid workflow-pack-lock.json')

  for (const pack of lock.packs) {
    const zipPath = path.join(packDir, pack.filename || (pack.packId + '.zip'))
    let bytes: Uint8Array
    try {
      bytes = await readFile(zipPath)
    } catch {
      throw new Error('Workflow pack missing from audited layer: ' + pack.packId)
    }
    const actual = sha256(bytes)
    if (actual !== pack.sha256) {
      throw new Error('Workflow pack checksum mismatch for ' + pack.packId + ': expected ' + pack.sha256 + ', got ' + actual)
    }
  }

  return { ok: true, packs: lock.packs }
}

async function buildWorkflowPacksInternal(
  options: WorkflowPackBuildOptions,
  mode: { write: boolean; writeSourceChecksums?: boolean },
): Promise<WorkflowPackBuildResult> {
  const sourceDir = path.resolve(options.sourceDir ?? path.join(repoRoot, 'workflows'))
  const outputDir = path.resolve(options.outputDir ?? path.join(repoRoot, 'src', 'server', 'packs'))
  const lockFile = path.resolve(options.lockFile ?? path.join(repoRoot, 'workflow-pack-lock.json'))
  const requestedIds = options.packIds ?? (options.sourceDir ? undefined : [...DEFAULT_PACK_IDS])
  const dirs = (await readdir(sourceDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && (!requestedIds || requestedIds.includes(entry.name)))
    .map((entry) => entry.name)
    .sort()
  if (requestedIds) {
    const missing = requestedIds.filter((id) => !dirs.includes(id))
    if (missing.length) throw new Error('Missing workflow source directories: ' + missing.join(', '))
  }

  const prepared = await Promise.all(dirs.map((id) => preparePack(path.join(sourceDir, id), options.sourceRevision)))
  if (!prepared.length) throw new Error('No workflow pack sources found in ' + sourceDir)
  await mkdir(outputDir, { recursive: true })
  await mkdir(path.dirname(lockFile), { recursive: true })

  const packs: WorkflowPackBuildResult['packs'] = []
  for (const pack of prepared.sort((left, right) => left.packId.localeCompare(right.packId))) {
    const filename = pack.packId + '.zip'
    const outputPath = path.join(outputDir, filename)
    const zipBytes = await adapter.write(pack.entries)
    if (mode.write) await writeFile(outputPath, zipBytes)
    if (mode.write && mode.writeSourceChecksums !== false) {
      await writeFile(path.join(pack.sourceRoot, 'checksums.json'), pack.checksumsBytes)
    }
    packs.push({
      packId: pack.packId,
      packVersion: pack.packVersion,
      workflowVersion: pack.workflowVersion,
      sha256: sha256(zipBytes),
      entrypoint: pack.entrypoint,
      sourceRevision: pack.sourceRevision,
      filename,
      outputPath,
    })
  }

  const lock: WorkflowPackLock = {
    schemaVersion: 1,
    packs: packs.map(({ outputPath: _outputPath, ...pack }) => pack),
  }
  if (mode.write) await writeFile(lockFile, canonicalJson(lock))
  return { sourceDir, outputDir, lockFile, packs }
}

async function preparePack(sourceRoot: string, forcedSourceRevision?: string): Promise<PreparedPack> {
  const filePaths = (await collectFiles(sourceRoot))
    .filter((filePath) => path.basename(filePath) !== 'checksums.json')
  const relativePaths = filePaths
    .map((filePath) => path.relative(sourceRoot, filePath).replaceAll('\\', '/'))
    .sort()
  const contents = new Map<string, Uint8Array>()
  for (const relativePath of relativePaths) {
    contents.set(relativePath, await canonicalFile(path.join(sourceRoot, relativePath), relativePath))
  }

  const manifestBytes = contents.get('manifest.json')
  if (!manifestBytes) throw new Error('Workflow pack source is missing manifest.json: ' + sourceRoot)
  const manifest = JSON.parse(Buffer.from(manifestBytes).toString('utf8')) as Record<string, unknown>
  const packId = stringField(manifest, 'packId', 'manifest')
  const packVersion = stringField(manifest, 'version', 'manifest')
  if (manifest.type !== 'workflow-pack') throw new Error('Workflow manifest type must be workflow-pack: ' + packId)
  if (path.basename(sourceRoot) !== packId) throw new Error('Workflow source directory must match packId: ' + packId)
  const entrypoints = manifest.entrypoints as { workflows?: unknown } | undefined
  if (!Array.isArray(entrypoints?.workflows) || entrypoints.workflows.length !== 1 || typeof entrypoints.workflows[0] !== 'string') {
    throw new Error('Workflow pack must declare exactly one workflow entrypoint: ' + packId)
  }
  const entrypoint = entrypoints.workflows[0]
  const workflowBytes = contents.get(entrypoint)
  if (!workflowBytes) throw new Error('Workflow entrypoint does not exist: ' + entrypoint)
  const workflow = JSON.parse(Buffer.from(workflowBytes).toString('utf8')) as Record<string, unknown>
  const workflowId = stringField(workflow, 'id', 'workflow')
  const workflowVersion = stringField(workflow, 'version', 'workflow')
  if (workflowId !== packId) throw new Error('Workflow id must match packId for ' + packId)
  if (workflowVersion !== packVersion) {
    throw new Error('Workflow version must match manifest version for ' + packId + ': ' + workflowVersion + ' != ' + packVersion)
  }

  const revisionHash = createHash('sha256')
  for (const relativePath of relativePaths) {
    revisionHash.update(relativePath).update('\0').update(contents.get(relativePath)!).update('\0')
  }
  const sourceRevision = forcedSourceRevision ?? ('sha256-' + revisionHash.digest('hex'))
  const checksums = {
    schemaVersion: 1,
    algorithm: 'sha256',
    sourceRevision,
    files: Object.fromEntries(relativePaths.map((relativePath) => [
      relativePath,
      'sha256-' + sha256(contents.get(relativePath)!),
    ])),
  }
  const checksumsBytes = canonicalJson(checksums)
  contents.set('checksums.json', checksumsBytes)
  const entries = Object.fromEntries([...contents.entries()].sort(([left], [right]) => comparePath(left, right)))
  return { sourceRoot, packId, packVersion, workflowVersion, entrypoint, sourceRevision, entries, checksumsBytes }
}

async function canonicalFile(filePath: string, relativePath: string): Promise<Uint8Array> {
  const bytes = await readFile(filePath)
  const extension = path.extname(relativePath).toLowerCase()
  if (extension === '.json') return canonicalJson(JSON.parse(bytes.toString('utf8')))
  if (!TEXT_EXTENSIONS.has(extension)) return bytes
  return Buffer.from(bytes.toString('utf8').replace(/\r\n?/g, '\n'), 'utf8')
}

function canonicalJson(value: unknown): Uint8Array {
  return Buffer.from(JSON.stringify(value, null, 2) + '\n', 'utf8')
}

async function collectFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const resolved = path.join(root, entry.name)
    if (entry.isDirectory()) files.push(...await collectFiles(resolved))
    else if (entry.isFile()) files.push(resolved)
  }
  return files
}

async function filesEqual(left: string, right: string): Promise<boolean> {
  try {
    const [leftStat, rightStat] = await Promise.all([stat(left), stat(right)])
    if (leftStat.size !== rightStat.size) return false
    const [leftBytes, rightBytes] = await Promise.all([readFile(left), readFile(right)])
    return Buffer.compare(leftBytes, rightBytes) === 0
  } catch {
    return false
  }
}

function stringField(value: Record<string, unknown>, key: string, label: string): string {
  const field = value[key]
  if (typeof field !== 'string' || !field.trim()) throw new Error(label + ' ' + key + ' must be a non-empty string')
  return field
}

function comparePath(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function argValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : undefined
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const options: WorkflowPackBuildOptions = {
    ...(argValue(args, '--source-dir') ? { sourceDir: argValue(args, '--source-dir') } : {}),
    ...(argValue(args, '--output-dir') ? { outputDir: argValue(args, '--output-dir') } : {}),
    ...(argValue(args, '--lock-file') ? { lockFile: argValue(args, '--lock-file') } : {}),
  }
  if (args.includes('--check')) {
    const result = await checkWorkflowPacks(options)
    console.log('[workflow-packs] verified ' + result.packs.length + ' deterministic pack(s).')
  } else if (argValue(args, '--audit-dir')) {
    const result = await auditWorkflowPackLayer({ packDir: argValue(args, '--audit-dir')!, lockFile: options.lockFile })
    console.log(JSON.stringify(result, null, 2))
  } else {
    const result = await buildWorkflowPacks(options)
    console.log('[workflow-packs] built ' + result.packs.length + ' deterministic pack(s).')
    for (const pack of result.packs) console.log(pack.packId + ' ' + pack.sha256)
  }
}
