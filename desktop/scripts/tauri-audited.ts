import { spawn } from 'node:child_process'
import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { auditWindowsWorkflowBundle } from '../../scripts/audit-windows-workflow-bundle.js'

const desktopDir = path.resolve(import.meta.dir, '..')
const repoRoot = path.resolve(desktopDir, '..')

export function shouldAuditWindowsBuild(platform: NodeJS.Platform, args: string[]): boolean {
  return platform === 'win32' && args[0] === 'build'
}

export async function findBuiltWindowsInstaller(
  rootDesktopDir: string,
  targetTriple: string,
): Promise<string> {
  const targetRoots = [
    process.env.CARGO_TARGET_DIR ? path.resolve(rootDesktopDir, process.env.CARGO_TARGET_DIR) : '',
    path.join(rootDesktopDir, 'src-tauri', 'target'),
  ].filter(Boolean)
  const candidateDirs = targetRoots.flatMap(targetRoot => [
    path.join(targetRoot, targetTriple, 'release', 'bundle', 'nsis'),
    path.join(targetRoot, 'release', 'bundle', 'nsis'),
  ])
  const installers: Array<{ path: string, mtimeMs: number }> = []
  for (const candidateDir of candidateDirs) {
    await collectInstallers(candidateDir, installers)
  }
  installers.sort((a, b) => b.mtimeMs - a.mtimeMs || a.path.localeCompare(b.path))
  if (!installers[0]) {
    throw new Error('No built NSIS installer found under: ' + candidateDirs.join(', '))
  }
  return installers[0].path
}

async function collectInstallers(
  root: string,
  installers: Array<{ path: string, mtimeMs: number }>,
): Promise<void> {
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      await collectInstallers(entryPath, installers)
      continue
    }
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.exe')) continue
    installers.push({ path: entryPath, mtimeMs: (await stat(entryPath)).mtimeMs })
  }
}

async function runTauri(args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ['x', 'tauri', ...args], {
      cwd: desktopDir,
      env: process.env,
      stdio: 'inherit',
      windowsHide: true,
    })
    child.once('error', error => reject(new Error('Failed to start Tauri CLI: ' + error.message)))
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error('Tauri CLI failed (code=' + String(code) + ', signal=' + String(signal) + ')'))
    })
  })
}

export async function runAuditedTauri(args: string[]): Promise<void> {
  await runTauri(args)
  if (!shouldAuditWindowsBuild(process.platform, args)) return

  const targetTriple = process.env.TAURI_ENV_TARGET_TRIPLE || 'x86_64-pc-windows-msvc'
  const installerPath = await findBuiltWindowsInstaller(desktopDir, targetTriple)
  const outputFile = path.join(repoRoot, 'artifacts', 'release', 'workflow-pack-audit.json')
  await auditWindowsWorkflowBundle({
    installerPath,
    layer: 'windows-release-bundle',
    outputFile,
  })
}

if (import.meta.main) {
  await runAuditedTauri(process.argv.slice(2))
}
