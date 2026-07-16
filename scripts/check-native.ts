import { copyFile, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'

export function needsWindowsAsciiBunProxy(platform: NodeJS.Platform, bunExecutable: string): boolean {
  return platform === 'win32' && /[^\x00-\x7f]/.test(bunExecutable)
}

export function resolveAsciiBunTempDir(publicRoot: string, pid: number, timestamp: number): string {
  return path.join(publicRoot, 'cc-jiangxia-bun', `${pid}-${timestamp}`)
}

async function runCommand(command: string[], cwd: string, env: Record<string, string | undefined>): Promise<number> {
  const process = Bun.spawn(command, {
    cwd,
    env,
    stdout: 'inherit',
    stderr: 'inherit',
  })
  return process.exited
}

export async function runNativeCheck({
  platform = process.platform,
  bunExecutable = process.execPath,
  env = process.env,
  now = Date.now,
}: {
  platform?: NodeJS.Platform
  bunExecutable?: string
  env?: NodeJS.ProcessEnv
  now?: () => number
} = {}): Promise<number> {
  const desktopRoot = path.resolve(import.meta.dir, '..', 'desktop')
  const nativeRoot = path.join(desktopRoot, 'src-tauri')
  const inheritedPath = env.PATH ?? env.Path ?? ''
  let temporaryBunDir: string | null = null
  let launcher = bunExecutable

  try {
    if (needsWindowsAsciiBunProxy(platform, bunExecutable)) {
      const publicRoot = env.PUBLIC ?? 'C:\Users\Public'
      temporaryBunDir = resolveAsciiBunTempDir(publicRoot, process.pid, now())
      launcher = path.join(temporaryBunDir, 'bun.exe')
      await mkdir(temporaryBunDir, { recursive: true })
      await copyFile(bunExecutable, launcher)
    }

    const commandEnv: Record<string, string | undefined> = {
      ...env,
      PATH: `${path.dirname(launcher)}${path.delimiter}${inheritedPath}`,
    }
    const sidecarExit = await runCommand([launcher, 'run', 'build:sidecars'], desktopRoot, commandEnv)
    if (sidecarExit !== 0) return sidecarExit
    return runCommand(['cargo', 'check'], nativeRoot, commandEnv)
  } finally {
    if (temporaryBunDir) await rm(temporaryBunDir, { recursive: true, force: true })
  }
}

if (import.meta.main) {
  const exitCode = await runNativeCheck()
  if (exitCode !== 0) process.exit(exitCode)
}
