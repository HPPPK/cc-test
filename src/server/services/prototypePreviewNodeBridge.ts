import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { getJiangxiaEnvValue } from '../../utils/appIdentity.js'
import { resolvePlaywrightExecutablePath } from '../../tools/PlaywrightTool/runtime.js'
import type { PrototypePreviewReceipt } from './prototypePreviewService.js'

export const PROTOTYPE_PREVIEW_RUNNER = 'prototype-preview-runner.cjs'
let developmentRunnerBuild: Promise<string> | undefined

async function runnerPath(): Promise<string> {
  const bundled = process.env.CLAUDE_BROWSER_RUNTIME_DIR && path.join(process.env.CLAUDE_BROWSER_RUNTIME_DIR, PROTOTYPE_PREVIEW_RUNNER)
  if (bundled && existsSync(bundled)) return bundled
  // A source checkout can build its own runner. Compiled sidecars must ship it.
  const entrypoint = fileURLToPath(new URL('../../tools/PrototypePreviewTool/prototype-preview-runner.ts', import.meta.url))
  if (!existsSync(entrypoint)) throw new Error('PROTOTYPE_PREVIEW_RUNNER_MISSING: rebuild the desktop sidecars')
  developmentRunnerBuild ??= (async () => {
    const repo = path.resolve(path.dirname(entrypoint), '../../..')
    const output = path.join(repo, 'artifacts', 'prototype-preview-runtime')
    const result = await Bun.build({ entrypoints: [entrypoint], outdir: output, naming: PROTOTYPE_PREVIEW_RUNNER, target: 'node', format: 'cjs', external: ['playwright', 'playwright-core'], minify: false })
    if (!result.success) throw new Error('PROTOTYPE_PREVIEW_BUILD_FAILED: ' + result.logs.map(log => log.message).join('; '))
    return path.join(output, PROTOTYPE_PREVIEW_RUNNER)
  })()
  return developmentRunnerBuild
}

export async function runPrototypePreviewWithNode(options: { workDir: string; fidelity?: 'low' | 'mid' | 'high'; screenId?: string; signal?: AbortSignal }): Promise<PrototypePreviewReceipt> {
  const executablePath = getJiangxiaEnvValue('VISUAL_QA_BROWSER_EXECUTABLE') || resolvePlaywrightExecutablePath()
  if (!executablePath) throw new Error('PROTOTYPE_BROWSER_UNAVAILABLE: no approved installed Chromium')
  options.signal?.throwIfAborted()
  const runner = await runnerPath()
  const node = process.env.CLAUDE_BUNDLED_NODE_EXECUTABLE || Bun.which('node')
  if (!node) throw new Error('PROTOTYPE_NODE_UNAVAILABLE: bundled Node runtime is required')
  const proc = Bun.spawn([node, '--eval', 'require(process.env.CLAUDE_PROTOTYPE_PREVIEW_RUNNER)'], {
    stdin: 'pipe', stdout: 'pipe', stderr: 'pipe', windowsHide: true,
    env: { ...process.env, CLAUDE_PROTOTYPE_PREVIEW_RUNNER: runner.replace(/^\\\\\?\\/, '') },
  })
  let forceStop: ReturnType<typeof setTimeout> | undefined
  const abort = () => {
    try { proc.stdin.write('abort\n'); proc.stdin.flush() } catch {}
    forceStop ??= setTimeout(() => proc.kill(), 25_000)
  }
  options.signal?.addEventListener('abort', abort, { once: true })
  const timeout = setTimeout(abort, 110_000)
  try {
    proc.stdin.write(JSON.stringify({ workDir: options.workDir, fidelity: options.fidelity || 'high', screenId: options.screenId, executablePath }) + '\n')
    proc.stdin.flush()
    const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited])
    options.signal?.throwIfAborted()
    let result: { receipt?: PrototypePreviewReceipt; error?: string }
    try { result = JSON.parse(stdout) } catch { throw new Error('PROTOTYPE_PREVIEW_RUNNER_FAILED: ' + stderr.slice(-2000)) }
    if (code !== 0 || !result.receipt) throw new Error(result.error || 'PROTOTYPE_PREVIEW_RUNNER_FAILED')
    return result.receipt
  } finally {
    clearTimeout(timeout)
    if (forceStop) clearTimeout(forceStop)
    options.signal?.removeEventListener('abort', abort)
    proc.stdin.end()
  }
}
