import * as path from 'node:path'

function normalizeComparablePath(filePath: string): string {
  const resolved = path.resolve(filePath)
  const root = path.parse(resolved).root
  let normalized = resolved
  while (normalized.length > root.length && /[\\/]/.test(normalized.at(-1) ?? '')) {
    normalized = normalized.slice(0, -1)
  }
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

/** True if `filePath` resolves to a location outside of `workDir`.
 *  Relative paths are resolved against workDir first. */
export function isOutsideWorkDir(filePath: string, workDir: string): boolean {
  const abs = path.resolve(workDir, filePath)
  const normFile = normalizeComparablePath(abs)
  const normWork = normalizeComparablePath(workDir)
  const workPrefix = normWork.endsWith(path.sep) ? normWork : normWork + path.sep
  return normFile !== normWork && !normFile.startsWith(workPrefix)
}
