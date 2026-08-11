import { createHash } from 'node:crypto'
import { existsSync, readdirSync } from 'node:fs'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

const desktopRoot = path.resolve(import.meta.dir, '..')
const repoRoot = path.resolve(desktopRoot, '..')
const binariesDir = path.join(desktopRoot, 'src-tauri', 'binaries')

const targetTriple =
  process.env.TAURI_ENV_TARGET_TRIPLE ||
  process.env.CARGO_BUILD_TARGET ||
  (await detectHostTriple())

const bunTarget = mapTargetTripleToBun(targetTriple)

const MANAGED_GIT_VERSION = '2.55.0.3'
const MANAGED_GIT_ARCHIVE = `PortableGit-${MANAGED_GIT_VERSION}-64-bit.7z.exe`
const MANAGED_GIT_URL = `https://github.com/git-for-windows/git/releases/download/v2.55.0.windows.3/${MANAGED_GIT_ARCHIVE}`
const MANAGED_GIT_SHA256 = 'ab00566336b5472120f9a52d34f2e79c5406535792acb0548001ffd0bd090e5d'

const MANAGED_NODE_VERSION = '22.23.1'
const MANAGED_NODE_DIRECTORY = `node-v${MANAGED_NODE_VERSION}-win-x64`
const MANAGED_NODE_ARCHIVE = `${MANAGED_NODE_DIRECTORY}.zip`
const MANAGED_NODE_URL = `https://nodejs.org/dist/v${MANAGED_NODE_VERSION}/${MANAGED_NODE_ARCHIVE}`
const MANAGED_NODE_SHA256 = '7df0bc9375723f4a86b3aa1b7cc73342423d9677a8df4538aca31a049e309c29'
const PLAYWRIGHT_BROWSER_RUNNER_FILE = 'playwright-browser-runner.cjs'
const PLAYWRIGHT_RUNTIME_PACKAGES = ['playwright', 'playwright-core'] as const
const PLAYWRIGHT_NODE_RUNNER_EXTERNALS = [
  'playwright',
  'playwright/*',
  'playwright-core',
  'playwright-core/*',
  'chromium-bidi',
  'chromium-bidi/*',
  'chromium-bidi/lib/cjs/bidiMapper/BidiMapper',
  'chromium-bidi/lib/cjs/cdp/CdpConnection',
]


// 编译前先扫一遍 src/ 把所有缺失的 ant-internal 模块在磁盘上 stub 出来。
// 见 desktop/scripts/scan-missing-imports.ts。
console.log('[build-sidecars] scanning for missing imports...')
const scanProc = Bun.spawn(
  ['bun', 'run', path.join(desktopRoot, 'scripts/scan-missing-imports.ts')],
  { cwd: repoRoot, stdout: 'inherit', stderr: 'inherit' },
)
const scanExit = await scanProc.exited
if (scanExit !== 0) {
  throw new Error(`[build-sidecars] scan-missing-imports failed (exit ${scanExit})`)
}

await mkdir(binariesDir, { recursive: true })
await buildBundledExpertPacks()
await buildBundledGitRuntime()
await buildBundledNodeRuntime()
await buildBundledBrowserRuntime()
await buildBundledPlaywrightRunner()
await copyBundledWorkflowPacks()
await copyBundledSkills()

// 单一合并 sidecar：server / cli 共享一份 bun runtime + 共享依赖代码。
// 调用方（Tauri lib.rs / conversationService）通过第一个 positional 参数
// 选择 'server' 或 'cli' 模式，详见 desktop/sidecars/claude-sidecar.ts。
await compileExecutable({
  entrypoint: path.join(desktopRoot, 'sidecars/claude-sidecar.ts'),
  outfileBase: path.join(binariesDir, `claude-sidecar-${targetTriple}`),
  productName: 'Claude Code Sidecar',
  bunTarget,
})

console.log(`[build-sidecars] Built desktop sidecar for ${targetTriple} (${bunTarget})`)


async function buildBundledExpertPacks() {
  const proc = Bun.spawn(['bun', 'run', path.join(repoRoot, 'scripts', 'build-expert-packs.ts')], {
    cwd: repoRoot,
    stdout: 'inherit',
    stderr: 'inherit',
  })
  const exitCode = await proc.exited
  if (exitCode !== 0) throw new Error(`[build-sidecars] build-expert-packs failed (exit ${exitCode})`)
}

async function buildBundledBrowserRuntime() {
  const platform = getPlaywrightHostPlatform(targetTriple)
  const cacheDir = path.join(desktopRoot, '.playwright-browsers', platform)
  const targetDir = path.join(binariesDir, 'browser-runtime', 'playwright')

  if (!hasManagedBrowserExecutable(cacheDir)) {
    await rm(cacheDir, { recursive: true, force: true })
    await mkdir(cacheDir, { recursive: true })
    const proc = Bun.spawn(['bunx', 'playwright', 'install', 'chromium'], {
      cwd: repoRoot,
      env: {
        ...process.env,
        PLAYWRIGHT_BROWSERS_PATH: cacheDir,
        PLAYWRIGHT_HOST_PLATFORM_OVERRIDE: platform,
      },
      stdout: 'inherit',
      stderr: 'inherit',
    })
    const exitCode = await proc.exited
    if (exitCode !== 0) throw new Error(`[build-sidecars] playwright chromium install failed (exit ${exitCode})`)
  }

  await rm(targetDir, { recursive: true, force: true })
  await mkdir(path.dirname(targetDir), { recursive: true })
  await cp(cacheDir, targetDir, { recursive: true })
  if (!hasManagedBrowserExecutable(targetDir)) {
    throw new Error(`[build-sidecars] managed Chromium runtime was not produced at ${targetDir}`)
  }
  console.log(`[build-sidecars] Copied managed Chromium runtime -> ${targetDir}`)
}

async function buildBundledPlaywrightRunner() {
  const runtimeDir = path.join(binariesDir, 'browser-runtime', 'playwright')
  const entrypoint = path.join(repoRoot, 'src', 'tools', 'PlaywrightTool', 'playwright-browser-runner.ts')
  const runnerPath = path.join(runtimeDir, PLAYWRIGHT_BROWSER_RUNNER_FILE)
  const runtimeNodeModulesDir = path.join(runtimeDir, 'node_modules')

  // Do not bundle Playwright itself. Bun inlines its internal __dirname and
  // require.resolve() calls as the build machine path (for example D:\a\...),
  // which makes a released runner try to load the CI checkout at user runtime.
  // Keep the runner portable: its bare require('playwright') resolves these
  // package copies beside the runner in the installed resource directory.
  await rm(runtimeNodeModulesDir, { recursive: true, force: true })
  await mkdir(runtimeNodeModulesDir, { recursive: true })
  for (const packageName of PLAYWRIGHT_RUNTIME_PACKAGES) {
    const sourcePackageDir = path.join(repoRoot, 'node_modules', packageName)
    const targetPackageDir = path.join(runtimeNodeModulesDir, packageName)
    if (!existsSync(path.join(sourcePackageDir, 'package.json'))) {
      throw new Error(`[build-sidecars] Missing required Playwright runtime package: ${sourcePackageDir}`)
    }
    await cp(sourcePackageDir, targetPackageDir, { recursive: true })
  }

  const result = await Bun.build({
    entrypoints: [entrypoint],
    outdir: runtimeDir,
    naming: PLAYWRIGHT_BROWSER_RUNNER_FILE,
    target: 'node',
    format: 'cjs',
    // Playwright serializes locator.evaluate/evaluateAll callbacks into the
    // page context. Bun identifier minification can leave renamed free
    // variables there (for example ReferenceError: Q is not defined).
    // Keep function identifiers stable in this tiny managed runner.
    minify: { whitespace: true, identifiers: false, syntax: true },
    external: PLAYWRIGHT_NODE_RUNNER_EXTERNALS,
  })
  const missingRuntimePackages = PLAYWRIGHT_RUNTIME_PACKAGES.filter(packageName =>
    !existsSync(path.join(runtimeNodeModulesDir, packageName, 'package.json')),
  )
  if (!result.success || !existsSync(runnerPath) || missingRuntimePackages.length > 0) {
    const logs = result.logs.map((log) => log.message).join('\n')
    throw new Error(`[build-sidecars] Failed to prepare the portable Node Playwright runner: ${logs || [runnerPath, ...missingRuntimePackages].join(', ')}`)
  }
  console.log(`[build-sidecars] Bundled portable Node Playwright runner -> ${runnerPath}`)
}

function getPlaywrightHostPlatform(triple: string): string {
  if (triple === 'x86_64-pc-windows-msvc') return 'win64'
  if (triple === 'aarch64-apple-darwin') return 'mac14-arm64'
  if (triple === 'x86_64-apple-darwin') return 'mac14'
  throw new Error(`[build-sidecars] Unsupported platform for bundled Chromium: ${triple}`)
}

function hasManagedBrowserExecutable(runtimeDir: string): boolean {
  if (!existsSync(runtimeDir)) return false
  try {
    return readdirSync(runtimeDir, { recursive: true }).some((entry) => /(?:^|[\\/])chrome(?:\.exe)?$/i.test(entry.replaceAll('\\', '/')))
  } catch {
    return false
  }
}
async function buildBundledGitRuntime() {
  const resourceDir = path.join(binariesDir, 'git-runtime')
  if (targetTriple !== 'x86_64-pc-windows-msvc') {
    // Keep the configured resource path present for macOS builds without shipping a Windows runtime.
    await mkdir(resourceDir, { recursive: true })
    await writeFile(path.join(resourceDir, '.keep'), '')
    return
  }

  const cacheRoot = path.join(desktopRoot, '.portable-git-runtime', 'win64')
  const cacheDir = path.join(cacheRoot, 'portable-git')
  const archivePath = path.join(cacheRoot, MANAGED_GIT_ARCHIVE)
  const targetDir = path.join(resourceDir, 'portable-git')

  if (!hasManagedGitRuntime(cacheDir)) {
    await rm(cacheDir, { recursive: true, force: true })
    await mkdir(cacheDir, { recursive: true })
    await mkdir(path.dirname(archivePath), { recursive: true })

    let archiveBytes: Uint8Array
    if (existsSync(archivePath)) {
      archiveBytes = await readFile(archivePath)
    } else {
      const response = await fetch(MANAGED_GIT_URL)
      if (!response.ok) throw new Error(`[build-sidecars] Portable Git download failed: ${response.status} ${response.statusText}`)
      archiveBytes = new Uint8Array(await response.arrayBuffer())
      await writeFile(archivePath, archiveBytes)
    }

    const actualSha256 = createHash('sha256').update(archiveBytes).digest('hex')
    if (actualSha256 !== MANAGED_GIT_SHA256) {
      await rm(archivePath, { force: true })
      throw new Error(`[build-sidecars] Portable Git checksum mismatch: expected ${MANAGED_GIT_SHA256}, got ${actualSha256}`)
    }

    const proc = Bun.spawn([archivePath, '-y', `-o${cacheDir}`], {
      cwd: repoRoot,
      stdout: 'inherit',
      stderr: 'inherit',
    })
    const exitCode = await proc.exited
    if (exitCode !== 0) throw new Error(`[build-sidecars] Portable Git extraction failed (exit ${exitCode})`)
    await waitForManagedGitRuntime(cacheDir)
  }

  await rm(targetDir, { recursive: true, force: true })
  await mkdir(path.dirname(targetDir), { recursive: true })
  await cp(cacheDir, targetDir, { recursive: true })
  if (!hasManagedGitRuntime(targetDir)) {
    throw new Error(`[build-sidecars] managed Portable Git runtime was not produced at ${targetDir}`)
  }
  console.log(`[build-sidecars] Copied managed Portable Git runtime -> ${targetDir}`)
}

function managedGitRuntimePaths(runtimeDir: string) {
  return {
    git: path.join(runtimeDir, 'cmd', 'git.exe'),
    bash: path.join(runtimeDir, 'bin', 'bash.exe'),
  }
}

function hasManagedGitRuntime(runtimeDir: string): boolean {
  const { git, bash } = managedGitRuntimePaths(runtimeDir)
  return existsSync(git) && existsSync(bash)
}

async function waitForManagedGitRuntime(runtimeDir: string): Promise<void> {
  const timeoutMs = 30_000
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (hasManagedGitRuntime(runtimeDir)) return
    await Bun.sleep(250)
  }
  throw new Error(`[build-sidecars] Portable Git extraction did not produce cmd/git.exe and bin/bash.exe within ${timeoutMs}ms`)
}

async function buildBundledNodeRuntime() {
  const resourceDir = path.join(binariesDir, 'node-runtime')
  if (targetTriple !== 'x86_64-pc-windows-msvc') {
    // Keep the configured resource path present for macOS builds without shipping a Windows runtime.
    await mkdir(resourceDir, { recursive: true })
    await writeFile(path.join(resourceDir, '.keep'), '')
    return
  }

  const cacheRoot = path.join(desktopRoot, '.managed-node-runtime', 'win-x64')
  const cacheDir = path.join(cacheRoot, MANAGED_NODE_DIRECTORY)
  const archivePath = path.join(cacheRoot, MANAGED_NODE_ARCHIVE)
  const targetDir = path.join(resourceDir, MANAGED_NODE_DIRECTORY)

  if (!hasManagedNodeRuntime(cacheDir)) {
    await rm(cacheDir, { recursive: true, force: true })
    await mkdir(cacheRoot, { recursive: true })

    let archiveBytes: Uint8Array
    if (existsSync(archivePath)) {
      archiveBytes = await readFile(archivePath)
    } else {
      const response = await fetch(MANAGED_NODE_URL)
      if (!response.ok) throw new Error(`[build-sidecars] Node runtime download failed: ${response.status} ${response.statusText}`)
      archiveBytes = new Uint8Array(await response.arrayBuffer())
      await writeFile(archivePath, archiveBytes)
    }

    const actualSha256 = createHash('sha256').update(archiveBytes).digest('hex')
    if (actualSha256 !== MANAGED_NODE_SHA256) {
      await rm(archivePath, { force: true })
      throw new Error(`[build-sidecars] Node runtime checksum mismatch: expected ${MANAGED_NODE_SHA256}, got ${actualSha256}`)
    }

    const escapePowerShellLiteral = (value: string) => value.replaceAll("'", "''")
    const proc = Bun.spawn(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command',
      `Expand-Archive -LiteralPath '${escapePowerShellLiteral(archivePath)}' -DestinationPath '${escapePowerShellLiteral(cacheRoot)}' -Force`,
    ], {
      cwd: repoRoot,
      stdout: 'inherit',
      stderr: 'inherit',
    })
    const exitCode = await proc.exited
    if (exitCode !== 0) throw new Error(`[build-sidecars] Node runtime extraction failed (exit ${exitCode})`)
  }

  if (hasManagedNodeRuntime(targetDir)) {
    console.log(`[build-sidecars] Reusing managed Node runtime -> ${targetDir}`)
    return
  }

  await rm(targetDir, { recursive: true, force: true })
  await mkdir(path.dirname(targetDir), { recursive: true })
  await cp(cacheDir, targetDir, { recursive: true })
  if (!hasManagedNodeRuntime(targetDir)) {
    throw new Error(`[build-sidecars] managed Node runtime was not produced at ${targetDir}`)
  }
  console.log(`[build-sidecars] Copied managed Node runtime -> ${targetDir}`)
}

function hasManagedNodeRuntime(runtimeDir: string): boolean {
  return ['node.exe', 'npm.cmd', 'npx.cmd'].every(entry => existsSync(path.join(runtimeDir, entry)))
}
async function copyBundledWorkflowPacks() {
  const sourceDir = path.join(repoRoot, 'src', 'server', 'packs')
  const targetDir = path.join(binariesDir, 'packs')
  await rm(targetDir, { recursive: true, force: true })
  await cp(sourceDir, targetDir, { recursive: true })
  console.log(`[build-sidecars] Copied bundled workflow packs -> ${targetDir}`)
}


function shouldCopyBundledRuntimeSource(source: string): boolean {
  return !/\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(source)
}

async function copyBundledSkills() {
  const sourceDir = path.join(repoRoot, 'src', 'skills', 'bundled')
  const targetDir = path.join(binariesDir, 'skills', 'bundled')
  await rm(targetDir, { recursive: true, force: true })
  await cp(sourceDir, targetDir, { recursive: true, filter: shouldCopyBundledRuntimeSource })
  console.log(`[build-sidecars] Copied bundled skills -> ${targetDir}`)
}

async function detectHostTriple() {
  const proc = Bun.spawn(['rustc', '-vV'], {
    cwd: repoRoot,
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  const exitCode = await proc.exited

  if (exitCode !== 0) {
    throw new Error(`[build-sidecars] rustc -vV failed: ${stderr || stdout}`)
  }

  const hostLine = stdout
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('host: '))

  if (!hostLine) {
    throw new Error('[build-sidecars] Could not detect Rust host triple')
  }

  return hostLine.replace('host: ', '')
}

function mapTargetTripleToBun(triple: string) {
  switch (triple) {
    case 'aarch64-apple-darwin':
      return 'bun-darwin-arm64'
    case 'x86_64-apple-darwin':
      return 'bun-darwin-x64'
    case 'x86_64-pc-windows-msvc':
      return 'bun-windows-x64'
    case 'aarch64-pc-windows-msvc':
      return 'bun-windows-arm64'
    case 'x86_64-unknown-linux-gnu':
      return 'bun-linux-x64-baseline'
    case 'aarch64-unknown-linux-gnu':
      return 'bun-linux-arm64'
    case 'x86_64-unknown-linux-musl':
      return 'bun-linux-x64-musl'
    case 'aarch64-unknown-linux-musl':
      return 'bun-linux-arm64-musl'
    default:
      throw new Error(`[build-sidecars] Unsupported target triple: ${triple}`)
  }
}

async function compileExecutable({
  entrypoint,
  outfileBase,
  productName,
  bunTarget,
}: {
  entrypoint: string
  outfileBase: string
  productName: string
  bunTarget: string
}) {
  const result = await Bun.build({
    entrypoints: [entrypoint],
    // minify whitespace + identifiers + dead-code 大概能省 5-15% 的二进制大小，
    // 代价是 stack trace 里的函数名变成短名 —— 终端用户场景可接受。
    minify: { whitespace: true, identifiers: true, syntax: true },
    sourcemap: 'none',
    target: 'bun',
    // 可选 npm 包：开 telemetry / 用 sharp 图像 / 用 Bedrock/Vertex 等
    // 替代 provider 时才需要，全部不在顶层 package.json 里。标 external
    // 让 bun build 跳过解析；运行时 import 在没装时自然失败，由 try/catch
    // 或 feature() gate 兜底。
    external: [
      // OpenTelemetry exporters（开 OTEL_* env 时才加载）
      '@opentelemetry/exporter-trace-otlp-grpc',
      '@opentelemetry/exporter-trace-otlp-http',
      '@opentelemetry/exporter-trace-otlp-proto',
      '@opentelemetry/exporter-logs-otlp-grpc',
      '@opentelemetry/exporter-logs-otlp-http',
      '@opentelemetry/exporter-logs-otlp-proto',
      '@opentelemetry/exporter-metrics-otlp-grpc',
      '@opentelemetry/exporter-metrics-otlp-http',
      '@opentelemetry/exporter-metrics-otlp-proto',
      '@opentelemetry/exporter-prometheus',
      // 替代 LLM provider —— 默认不用，用户自装
      '@aws-sdk/client-bedrock',
      '@aws-sdk/client-sts',
      '@anthropic-ai/bedrock-sdk',
      '@anthropic-ai/foundry-sdk',
      '@anthropic-ai/vertex-sdk',
      '@azure/identity',
      // ant-internal / 可选工具
      '@anthropic-ai/mcpb',
      'fflate',
      'sharp',
      'react-devtools-core',
    ],
    compile: {
      target: bunTarget,
      outfile: outfileBase,
      autoloadTsconfig: true,
      autoloadPackageJson: true,
      windows: {
        title: productName,
        publisher: 'Claude Code',
        description: productName,
        hideConsole: true,
      },
    },
  })

  if (!result.success) {
    const logs = result.logs.map((log) => log.message).join('\n')
    throw new Error(`[build-sidecars] Failed to compile ${productName}:\n${logs}`)
  }

  const outputPath = result.outputs[0]?.path ?? outfileBase
  console.log(`[build-sidecars] ${productName} -> ${outputPath}`)

  // macOS Apple System Policy (ASP) requires valid code signatures on all
  // executables. Bun-compiled binaries ship with an invalid/empty signature
  // that causes "load code signature error 4" and SIGKILL at launch.
  // Fix: strip the broken signature, then ad-hoc sign.
  if (process.platform === 'darwin') {
    await adHocSignMacBinary(outputPath)
  }
}

async function adHocSignMacBinary(outputPath: string) {
  console.log(`[build-sidecars] ad-hoc signing ${outputPath} for macOS ...`)
  const strip = Bun.spawn(['codesign', '--remove-signature', outputPath], {
    stdout: 'inherit',
    stderr: 'inherit',
  })
  await strip.exited

  const sign = Bun.spawn(
    ['codesign', '--sign', '-', '--force', '--timestamp=none', outputPath],
    { stdout: 'inherit', stderr: 'inherit' },
  )
  const signExit = await sign.exited
  if (signExit !== 0) {
    throw new Error(`[build-sidecars] ad-hoc codesign failed for ${outputPath} (exit ${signExit})`)
  }
  console.log(`[build-sidecars] ad-hoc signed ${outputPath}`)
}
