import { readdir, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { ZipPackAdapter } from '../src/server/services/zipPackAdapter.js'

type BuildBundledExpertPacksOptions = {
  sourceDir?: string
  outputDir?: string
  /** Build only one declared pack ID, without touching other bundled Expert ZIPs. */
  packId?: string
}

const repoRoot = path.resolve(import.meta.dir, '..')
const defaultSourceDir = path.join(repoRoot, 'experts')
const defaultOutputDir = path.join(repoRoot, 'src', 'server', 'packs', 'experts')
const adapter = new ZipPackAdapter()

export async function buildBundledExpertPacks(options: BuildBundledExpertPacksOptions = {}): Promise<string[]> {
  const sourceDir = path.resolve(options.sourceDir ?? defaultSourceDir)
  const outputDir = path.resolve(options.outputDir ?? defaultOutputDir)
  const entries = await readdir(sourceDir, { withFileTypes: true })
  const requestedPackId = options.packId?.trim()
  if (options.packId !== undefined && !requestedPackId) throw new Error('A non-empty Expert Pack ID is required when filtering the build.')
  const outputs: string[] = []
  let matchedRequestedPack = false

  await mkdir(outputDir, { recursive: true })
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory()) continue

    const packRoot = path.join(sourceDir, entry.name)
    const manifest = JSON.parse(await readFile(path.join(packRoot, 'manifest.json'), 'utf8')) as {
      packId?: unknown
      type?: unknown
      entrypoints?: { experts?: unknown; skills?: unknown }
    }
    if (manifest.type !== 'expert-pack' || typeof manifest.packId !== 'string' || !manifest.packId.trim()) {
      throw new Error(`Invalid Expert Pack manifest in ${packRoot}`)
    }
    if (requestedPackId && manifest.packId !== requestedPackId) continue
    matchedRequestedPack = true
    const expertEntrypoint = Array.isArray(manifest.entrypoints?.experts) ? manifest.entrypoints?.experts[0] : undefined
    if (typeof expertEntrypoint !== 'string' || !expertEntrypoint.startsWith('experts/') || !expertEntrypoint.endsWith('/expert.json')) {
      throw new Error(`Expert Pack must declare one experts/<id>/expert.json entrypoint: ${packRoot}`)
    }

    const expertRoot = path.posix.dirname(expertEntrypoint)
    const files = await collectFiles(packRoot)
    const relativeFiles = new Set(files.map((filePath) => path.relative(packRoot, filePath).replaceAll('\\', '/')))
    const declaredSkillIds = Array.isArray(manifest.entrypoints?.skills) ? manifest.entrypoints.skills : []
    for (const skillId of declaredSkillIds) {
      if (typeof skillId !== 'string' || !skillId.trim() || skillId.includes('/') || skillId.includes('\\')) {
        throw new Error(`Invalid Expert Pack Skill ID in ${packRoot}: ${String(skillId)}`)
      }
      const skillPath = `skills/${skillId}/SKILL.md`
      if (!relativeFiles.has(skillPath)) {
        throw new Error(`Expert Pack is missing declared Skill file: ${skillPath}`)
      }
    }
    const zipEntries: Record<string, Uint8Array> = {}
    for (const filePath of files) {
      const relativePath = path.relative(packRoot, filePath).replaceAll('\\', '/')
      const zipPath = relativePath === 'manifest.json' || relativePath === 'THIRD_PARTY_NOTICES.md' || relativePath.startsWith('third_party/')
        ? relativePath
        : relativePath.startsWith('tools/') || relativePath.startsWith('skills/')
          ? relativePath
          : `${expertRoot}/${relativePath}`
      const bytes = await readFile(filePath)
      // Keep bundled text stable across Git checkout newline settings; binary assets remain byte-exact.
      zipEntries[zipPath] = /\.(?:json|md|html|txt)$/i.test(relativePath)
        ? Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n'), 'utf8')
        : new Uint8Array(bytes)
    }

    const outputPath = path.join(outputDir, `${manifest.packId}.zip`)
    await writeFile(outputPath, await adapter.write(zipEntries))
    outputs.push(outputPath)
  }

  if (requestedPackId && !matchedRequestedPack) {
    throw new Error(`No Expert Pack with packId ${requestedPackId} was found in ${sourceDir}`)
  }
  return outputs
}

function requestedPackIdFromArgs(args: string[]): string | undefined {
  const index = args.indexOf('--pack')
  if (index === -1) return undefined
  const packId = args[index + 1]
  if (!packId || packId.startsWith('--')) throw new Error('Usage: bun run scripts/build-expert-packs.ts --pack <pack-id>')
  return packId
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

if (import.meta.main) {
  const packId = requestedPackIdFromArgs(process.argv.slice(2))
  const outputs = await buildBundledExpertPacks({ packId })
  console.log(`[build-expert-packs] Built ${outputs.length} bundled Expert Pack ZIP(s).`)
}
