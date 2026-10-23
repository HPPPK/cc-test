import * as fs from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import * as path from 'node:path'

/** IDs used to derive directories must remain one native path component. */
export function assertExpertPathComponent(value: string): void {
  if (!value || value === '.' || value === '..' || /[/\\:\0]/.test(value)) {
    throw new Error('Tool path is outside the allowed directory: expected a single path component.')
  }
}

/** Create an output root without following project-internal symlinks. */
export async function createExpertOutputDirectory(projectRoot: string, outputDirectory: string, allowExternalRoot = false): Promise<string> {
  const originalProject = path.resolve(projectRoot)
  const canonicalProject = await fs.realpath(originalProject)
  const requested = path.resolve(outputDirectory)
  const projectSpelling = isInside(originalProject, requested) ? originalProject : isInside(canonicalProject, requested) ? canonicalProject : undefined
  if (projectSpelling !== undefined) {
    const relative = path.relative(projectSpelling, requested) || '.'
    const outputRoot = await resolveExpertPathInside(canonicalProject, relative, true)
    await makeExpertDirectories(canonicalProject, outputRoot)
    const canonicalOutput = await fs.realpath(outputRoot)
    if (!isInside(canonicalProject, canonicalOutput)) throw new Error('Tool path is outside the allowed directory.')
    return canonicalOutput
  }
  if (!allowExternalRoot) throw new Error('Tool path is outside the allowed directory.')
  // Only a separately selected external output root defines a new boundary.
  // Platform/root aliases are resolved before validating descendants.
  await fs.mkdir(requested, { recursive: true })
  return fs.realpath(requested)
}

/** Write through a checked handle without truncating symlink/hardlink targets. */
export async function writeExpertText(root: string, relativePath: string, content: string): Promise<string> {
  const filePath = await resolveExpertPathInside(root, relativePath, true)
  await makeExpertDirectories(root, path.dirname(filePath))
  await resolveExpertPathInside(root, relativePath, true)
  const file = await fs.open(filePath, fsConstants.O_WRONLY | fsConstants.O_CREAT | (fsConstants.O_NOFOLLOW ?? 0) | (fsConstants.O_NONBLOCK ?? 0), 0o666)
  try {
    const stat = await file.stat()
    if (!stat.isFile()) throw new Error('Only files can be written.')
    if (stat.nlink > 1) throw new Error('Tool file is outside the allowed directory: multiple hard links are not writable.')
    await file.truncate(0)
    await file.writeFile(content, 'utf-8')
  } finally {
    await file.close()
  }
  return filePath
}

export async function resolveExpertPathInside(root: string, relativePath: string, allowMissing = false): Promise<string> {
  if (!relativePath || path.isAbsolute(relativePath)) throw new Error('Tool path is outside the allowed directory.')
  const target = path.resolve(root, relativePath)
  if (!isInside(root, target)) throw new Error('Tool path is outside the allowed directory.')

  // Roots are canonicalized once. Reject links below them, including dangling
  // links, before following them or creating missing descendants. These checks
  // and NOFOLLOW file opens reduce races; they are not an OS process sandbox.
  const rootStat = await fs.lstat(root)
  if (rootStat.isSymbolicLink() || await fs.realpath(root) !== root) throw new Error('Tool path is outside the allowed directory.')
  let current = root
  const components = path.relative(root, target).split(path.sep).filter(Boolean)
  for (const component of components) {
    current = path.join(current, component)
    try {
      const stat = await fs.lstat(current)
      if (stat.isSymbolicLink() || !isInside(root, await fs.realpath(current))) throw new Error('Tool path is outside the allowed directory.')
    } catch (error) {
      if (allowMissing && (error as NodeJS.ErrnoException).code === 'ENOENT') return target
      throw error
    }
  }
  return target
}

export async function makeExpertDirectories(root: string, directory: string): Promise<void> {
  const relative = path.relative(root, directory)
  await resolveExpertPathInside(root, relative || '.', true)
  let current = root
  for (const component of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, component)
    const currentRelative = path.relative(root, current)
    await resolveExpertPathInside(root, currentRelative, true)
    try {
      await fs.mkdir(current)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
    await resolveExpertPathInside(root, currentRelative)
    if (!(await fs.lstat(current)).isDirectory()) throw new Error('Only directories can contain tool output.')
  }
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}
