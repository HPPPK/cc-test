#!/usr/bin/env bun

import { existsSync, readFileSync, appendFileSync } from 'node:fs'
import type { FastLaneTestSelection, RiskLevel } from '../quality-gate/types.js'

export type ChangeArea =
  | 'desktop'
  | 'server'
  | 'adapters'
  | 'docs'
  | 'release'
  | 'cli-core'

export type ChangePolicyResult = {
  files: string[]
  labels: string[]
  areas: ChangeArea[]
  areaLabels: string[]
  blocked: boolean
  blockingReason: string | null
  blockingReasons: string[]
  cliCoreFiles: string[]
  coveragePolicyFiles: string[]
  missingTestSignals: string[]
  checks: {
    desktop: boolean
    server: boolean
    adapters: boolean
    desktopNative: boolean
    docs: boolean
    coverage: boolean
  }
  /**
   * Risk level of the change.
   * CA-005: High-risk paths escalate to the right checks.
   */
  riskLevel: RiskLevel
  /**
   * Escalated checks triggered by high-risk paths.
   * Undefined when no escalation is needed.
   */
  escalatedChecks: string[] | undefined
  /**
   * Guidance for medium-risk changes.
   * Suggests additional verification that might be helpful.
   */
  riskGuidance: string | undefined
  /**
   * Explanation for why heavy checks were skipped.
   * Populated for low-risk changes.
   */
  skipExplanation: string | undefined
}

const ALLOW_CLI_CORE_LABEL = 'allow-cli-core-change'
const ALLOW_MISSING_TESTS_LABEL = 'allow-missing-tests'
const ALLOW_COVERAGE_BASELINE_LABEL = 'allow-coverage-baseline-change'

const areaLabels: Record<ChangeArea, string> = {
  desktop: 'area:desktop',
  server: 'area:server',
  adapters: 'area:adapters',
  docs: 'area:docs',
  release: 'area:release',
  'cli-core': 'area:cli-core',
}

const cliCorePrefixes = [
  'bin/',
  'src/entrypoints/',
  'src/screens/',
  'src/components/',
  'src/commands/',
  'src/tools/',
  'src/utils/',
]

const desktopNativeExactPaths = new Set([
  'bun.lock',
  'package.json',
  'desktop/bun.lock',
  'desktop/package.json',
  'desktop/package-lock.json',
  'desktop/src-tauri/Cargo.lock',
  'desktop/src-tauri/Cargo.toml',
  'desktop/src-tauri/tauri.conf.json',
])

const docsExactPaths = new Set([
  'README.md',
  'README.en.md',
  'package.json',
  'package-lock.json',
  '.github/workflows/deploy-docs.yml',
])

const releaseExactPaths = new Set([
  '.github/workflows/pr-quality.yml',
  '.github/workflows/pr-triage.yml',
  '.github/workflows/release-desktop.yml',
  '.github/workflows/build-desktop-dev.yml',
  'scripts/pr/change-policy.ts',
  'scripts/pr/change-policy.test.ts',
  'scripts/pr/check-pr.ts',
  'scripts/pr/run-server-tests.ts',
  'scripts/release.ts',
  'desktop/src-tauri/tauri.conf.json',
  'desktop/src-tauri/Cargo.toml',
  'desktop/src-tauri/Cargo.lock',
])

const coveragePolicyExactPaths = new Set([
  'scripts/quality-gate/coverage-baseline.json',
  'scripts/quality-gate/coverage-thresholds.json',
])

function normalizePath(path: string) {
  return path.trim().replace(/\\/g, '/').replace(/^\.\//, '')
}

function startsWithAny(path: string, prefixes: string[]) {
  return prefixes.some((prefix) => path.startsWith(prefix))
}

function isCliCorePath(path: string) {
  return startsWithAny(path, cliCorePrefixes)
}

export function areasForPath(path: string): ChangeArea[] {
  const areas = new Set<ChangeArea>()

  if (path.startsWith('desktop/')) {
    areas.add('desktop')
  }

  if (path.startsWith('src/server/')) {
    areas.add('server')
  }

  if (path.startsWith('adapters/')) {
    areas.add('adapters')
  }

  if (
    path.startsWith('docs/') ||
    path.startsWith('release-notes/') ||
    docsExactPaths.has(path)
  ) {
    areas.add('docs')
  }

  if (releaseExactPaths.has(path)) {
    areas.add('release')
  }

  if (isCliCorePath(path)) {
    areas.add('cli-core')
  }

  return [...areas]
}

// --- Fast-lane test selection helpers ---

/** 高风险路径模式：Tauri/native 代码 */
const HIGH_RISK_TAURI_PATTERN = /^desktop\/src-tauri\//

/** 高风险路径模式：Provider/运行时选择器 */
const HIGH_RISK_PROVIDER_PATTERN = /\/provider-selector\./

/** 高风险路径模式：Provider 服务 */
const HIGH_RISK_PROVIDER_SERVICE_PATTERN = /^src\/server\/services\/(provider|conversation)Service\.ts$/

/** 高风险路径模式：WebSearchTool 后端 */
const HIGH_RISK_WEB_SEARCH_PATTERN = /^src\/tools\/WebSearchTool\/backend\.ts$/

/** 高风险路径模式：WebSocket 处理器 */
const HIGH_RISK_WEBSOCKET_PATTERN = /^src\/server\/ws\//

/** 高风险路径模式：会话服务 */
const HIGH_RISK_CONVERSATION_PATTERN = /^src\/server\/services\/conversation/

/** 高风险路径模式：CI/发布工作流 */
const HIGH_RISK_RELEASE_PATTERN = /^\.github\/workflows\/(release(-.*)?\.yml|build-desktop|pr-quality)/

/** 高风险路径模式：发布脚本 */
const HIGH_RISK_RELEASE_SCRIPT_PATTERN = /^scripts\/(release|pr\/change-policy)\.ts$/

/** 中等风险路径模式：Desktop 状态/API 层 */
const MEDIUM_RISK_DESKTOP_API_PATTERN = /^desktop\/src\/(api|stores|hooks)\//

/** 中等风险路径模式：服务器路由/工具/中间件 */
const MEDIUM_RISK_SERVER_PATTERN = /^src\/server\/(routes|utils|middleware)\//

/** 中等风险路径模式：适配器实现 */
const MEDIUM_RISK_ADAPTER_PATTERN = /^adapters\/[^/]+\/[^.]+\.ts$/

/** 各区域对应的测试文件 glob 模式 */
const AREA_TEST_PATTERNS: Record<string, string[]> = {
  server: [
    'src/server/**/*.test.*',
    'src/server/**/__tests__/**',
  ],
  desktop: [
    'desktop/src/**/*.test.*',
    'desktop/src/**/*.spec.*',
  ],
  adapters: [
    'adapters/**/*.test.*',
    'adapters/**/__tests__/**',
  ],
  docs: [
    'docs/**/*.test.*',
  ],
}

/** 核心 smoke 测试集：始终运行，验证系统基础设施完整性 */
const CORE_SMOKE_PATTERNS = [
  'scripts/pr/change-policy.test.ts',
  'scripts/quality-gate/quarantine.test.ts',
  'scripts/quality-gate/fast-mode.test.ts',
  'scripts/quality-gate/layered-pr.test.ts',
]

/** 可选的测试区域（不含 release 和 cli-core，它们由专门的门控处理） */
const SELECTABLE_AREAS: readonly string[] = ['server', 'desktop', 'adapters', 'docs']

/**
 * 评估变更文件的风险等级。
 * - high: Tauri/native、Provider/运行时、CI/发布工作流、WebSocket/会话服务
 * - medium: Desktop 状态/API 层、服务器路由/工具/中间件、适配器实现
 * - low: 其余变更（文档、测试、fixture 等）
 */
function assessRiskLevel(normalizedFiles: string[]): {
  riskLevel: RiskLevel
  escalatedChecks: string[]
  riskGuidance: string | undefined
  skipExplanation: string | undefined
} {
  const escalatedChecks: string[] = []
  const guidanceHints: string[] = []

  // 高风险：Tauri/native 代码
  const hasTauri = normalizedFiles.some((f) => HIGH_RISK_TAURI_PATTERN.test(f))
  if (hasTauri) {
    escalatedChecks.push('native-checks')
  }

  // 高风险：Provider 服务和运行时选择器
  const hasProviderService = normalizedFiles.some((f) => HIGH_RISK_PROVIDER_SERVICE_PATTERN.test(f))
  const hasProviderSelector = normalizedFiles.some((f) => HIGH_RISK_PROVIDER_PATTERN.test(f))
  const hasWebSearchBackend = normalizedFiles.some((f) => HIGH_RISK_WEB_SEARCH_PATTERN.test(f))
  const hasWebSocket = normalizedFiles.some((f) => HIGH_RISK_WEBSOCKET_PATTERN.test(f))
  const hasConversation = normalizedFiles.some((f) => HIGH_RISK_CONVERSATION_PATTERN.test(f))

  if (hasProviderService || hasProviderSelector || hasWebSearchBackend || hasWebSocket || hasConversation) {
    escalatedChecks.push('live-provider-checks')
  }

  // 高风险：CI/发布工作流和脚本
  const hasReleaseWorkflow = normalizedFiles.some((f) => HIGH_RISK_RELEASE_PATTERN.test(f))
  const hasReleaseScript = normalizedFiles.some((f) => HIGH_RISK_RELEASE_SCRIPT_PATTERN.test(f))
  if (hasReleaseWorkflow || hasReleaseScript) {
    escalatedChecks.push('release-gates')
  }

  // 高风险返回
  if (escalatedChecks.length > 0) {
    return {
      riskLevel: 'high',
      escalatedChecks,
      riskGuidance: undefined,
      skipExplanation: undefined,
    }
  }

  // 中等风险：Desktop 状态/API 层
  const hasMediumDesktop = normalizedFiles.some((f) => MEDIUM_RISK_DESKTOP_API_PATTERN.test(f))
  if (hasMediumDesktop) {
    guidanceHints.push('state management and API layer changes may benefit from integration testing')
  }

  // 中等风险：服务器路由/工具/中间件
  const hasMediumServer = normalizedFiles.some((f) => MEDIUM_RISK_SERVER_PATTERN.test(f))
  if (hasMediumServer) {
    guidanceHints.push('server route/utility changes may benefit from integration testing')
  }

  // 中等风险：适配器实现
  const hasMediumAdapter = normalizedFiles.some((f) => MEDIUM_RISK_ADAPTER_PATTERN.test(f))
  if (hasMediumAdapter) {
    guidanceHints.push('adapter implementation changes should verify provider compatibility')
  }

  // 中等风险返回
  if (guidanceHints.length > 0) {
    return {
      riskLevel: 'medium',
      escalatedChecks: [],
      riskGuidance: guidanceHints.join('; '),
      skipExplanation: undefined,
    }
  }

  // 低风险返回
  return {
    riskLevel: 'low',
    escalatedChecks: [],
    riskGuidance: undefined,
    skipExplanation: 'low-risk change: heavy checks (native, live-provider, release-gates) are not required.',
  }
}

/**
 * 基于变更文件选择 fast-lane 测试集。
 *
 * 使用 `areasForPath()` 将每个文件分类到区域，然后为每个受影响区域
 * 选择对应的测试模式。始终包含核心 smoke 测试集。
 *
 * CA-003: 跳过的区域必须通过影响/风险评估解释
 * CA-005: 高风险路径升级到正确的检查
 */
export function selectFastLaneTests(inputFiles: string[]): FastLaneTestSelection {
  const normalizedFiles = [...new Set(inputFiles.map(normalizePath).filter(Boolean))].sort()

  // 收集所有受影响区域
  const touchedAreas = new Set<string>()
  for (const file of normalizedFiles) {
    for (const area of areasForPath(file)) {
      touchedAreas.add(area)
    }
  }

  // 选择可测试区域的测试模式
  const selectedTests: FastLaneTestSelection['selectedTests'] = {}
  for (const area of SELECTABLE_AREAS) {
    if (touchedAreas.has(area)) {
      const key = area as keyof typeof selectedTests
      selectedTests[key] = AREA_TEST_PATTERNS[area] ?? []
    }
  }

  // 构建跳过区域的说明（CA-003）
  const skipped: FastLaneTestSelection['skipped'] = []
  for (const area of SELECTABLE_AREAS) {
    if (!touchedAreas.has(area)) {
      skipped.push({
        area,
        reason: `No files changed in the ${area} area; skipping ${area} test lane.`,
      })
    }
  }

  // 风险评估（CA-005）
  const { riskLevel, escalatedChecks } = assessRiskLevel(normalizedFiles)

  return {
    coreSmoke: [...CORE_SMOKE_PATTERNS],
    selectedTests,
    skipped,
    riskLevel,
    escalatedChecks: escalatedChecks.length > 0 ? escalatedChecks : undefined,
  }
}

function hasMatchingTest(files: string[], predicate: (file: string) => boolean) {
  return files.some((file) => (
    predicate(file) &&
    (/\.test\.[cm]?[jt]sx?$/.test(file) || file.includes('/__tests__/'))
  ))
}

function changedProductionFiles(files: string[], predicate: (file: string) => boolean) {
  return files.filter((file) => (
    predicate(file) &&
    !/\.test\.[cm]?[jt]sx?$/.test(file) &&
    !file.includes('/__tests__/') &&
    !file.includes('/fixtures/')
  ))
}

function missingTestSignals(files: string[]) {
  const signals: string[] = []
  const desktopProd = changedProductionFiles(files, (file) => file.startsWith('desktop/src/'))
  const serverProd = changedProductionFiles(files, (file) => file.startsWith('src/server/'))
  const adapterProd = changedProductionFiles(files, (file) => file.startsWith('adapters/'))
  const agentRuntimeProd = changedProductionFiles(files, (file) => (
    file.startsWith('src/tools/') ||
    file.startsWith('src/utils/')
  ))

  if (desktopProd.length > 0 && !hasMatchingTest(files, (file) => file.startsWith('desktop/src/'))) {
    signals.push('Desktop product files changed without a desktop test file in the PR.')
  }
  if (serverProd.length > 0 && !hasMatchingTest(files, (file) => file.startsWith('src/server/'))) {
    signals.push('Server product files changed without a server test file in the PR.')
  }
  if (adapterProd.length > 0 && !hasMatchingTest(files, (file) => file.startsWith('adapters/'))) {
    signals.push('Adapter product files changed without an adapter test file in the PR.')
  }
  if (agentRuntimeProd.length > 0 && !hasMatchingTest(files, (file) => file.startsWith('src/tools/') || file.startsWith('src/utils/'))) {
    signals.push('Agent/runtime product files changed without a tools/utils test file in the PR.')
  }

  return signals
}

export function evaluateChangePolicy(
  inputFiles: string[],
  inputLabels: string[] = [],
): ChangePolicyResult {
  const files = [...new Set(inputFiles.map(normalizePath).filter(Boolean))].sort()
  const labels = [...new Set(inputLabels.map((label) => label.trim()).filter(Boolean))].sort()
  const areas = new Set<ChangeArea>()

  for (const file of files) {
    for (const area of areasForPath(file)) {
      areas.add(area)
    }
  }

  const cliCoreFiles = files.filter(isCliCorePath)
  const hasCliCoreChange = cliCoreFiles.length > 0
  const hasCliCoreOverride = labels.includes(ALLOW_CLI_CORE_LABEL)
  const coveragePolicyFiles = files.filter((file) => coveragePolicyExactPaths.has(file))
  const hasCoveragePolicyOverride = labels.includes(ALLOW_COVERAGE_BASELINE_LABEL)
  const missingTests = missingTestSignals(files)
  const hasMissingTestsOverride = labels.includes(ALLOW_MISSING_TESTS_LABEL)
  const blockingReasons: string[] = []

  if (hasCliCoreChange && !hasCliCoreOverride) {
    blockingReasons.push(`CLI core changes require the ${ALLOW_CLI_CORE_LABEL} label and maintainer approval.`)
  }
  if (missingTests.length > 0 && !hasMissingTestsOverride) {
    blockingReasons.push(`Production code changes require matching tests or the ${ALLOW_MISSING_TESTS_LABEL} maintainer override.`)
  }
  if (coveragePolicyFiles.length > 0 && !hasCoveragePolicyOverride) {
    blockingReasons.push(`Coverage baseline or threshold changes require the ${ALLOW_COVERAGE_BASELINE_LABEL} label and maintainer approval.`)
  }
  const blocked = blockingReasons.length > 0

  const touchesDesktopNative = files.some((file) => (
    file.startsWith('desktop/') ||
    file.startsWith('adapters/') ||
    file.startsWith('src/server/') ||
    desktopNativeExactPaths.has(file)
  ))

  const touchesDocs = files.some((file) => (
    file.startsWith('docs/') ||
    file.startsWith('release-notes/') ||
    docsExactPaths.has(file)
  ))
  const touchesCoverage = files.some((file) => (
    file.startsWith('desktop/src/') ||
    file.startsWith('src/server/') ||
    file.startsWith('src/tools/') ||
    file.startsWith('src/utils/') ||
    file.startsWith('adapters/') ||
    file.startsWith('scripts/quality-gate/') ||
    file === 'package.json' ||
    file === 'desktop/package.json' ||
    file === 'desktop/bun.lock'
  ))

  const orderedAreas = [...areas].sort()

  // 风险评估（CA-005）
  const riskAssessment = assessRiskLevel(files)

  return {
    files,
    labels,
    areas: orderedAreas,
    areaLabels: orderedAreas.map((area) => areaLabels[area]),
    blocked,
    blockingReason: blockingReasons[0] ?? null,
    blockingReasons,
    cliCoreFiles,
    coveragePolicyFiles,
    missingTestSignals: missingTests,
    checks: {
      desktop: areas.has('desktop') || areas.has('server'),
      server: areas.has('server') || files.some((file) => file.startsWith('src/tools/') || file.startsWith('src/utils/')),
      adapters: areas.has('adapters'),
      desktopNative: touchesDesktopNative,
      docs: touchesDocs,
      coverage: touchesCoverage,
    },
    riskLevel: riskAssessment.riskLevel,
    escalatedChecks: riskAssessment.escalatedChecks.length > 0 ? riskAssessment.escalatedChecks : undefined,
    riskGuidance: riskAssessment.riskGuidance,
    skipExplanation: riskAssessment.skipExplanation,
  }
}

function parseArgs(argv: string[]) {
  const args = new Map<string, string>()

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg.startsWith('--')) {
      continue
    }

    const next = argv[index + 1]
    if (next && !next.startsWith('--')) {
      args.set(arg, next)
      index += 1
    } else {
      args.set(arg, 'true')
    }
  }

  return args
}

function readListFile(path: string) {
  if (!existsSync(path)) {
    throw new Error(`Missing file: ${path}`)
  }

  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function formatSummary(result: ChangePolicyResult) {
  const lines = [
    'PR change policy',
    `  Areas: ${result.areas.length ? result.areas.join(', ') : 'none'}`,
    `  Labels: ${result.labels.length ? result.labels.join(', ') : 'none'}`,
    `  Checks: desktop=${result.checks.desktop}, server=${result.checks.server}, adapters=${result.checks.adapters}, desktopNative=${result.checks.desktopNative}, docs=${result.checks.docs}, coverage=${result.checks.coverage}`,
  ]

  if (result.cliCoreFiles.length > 0) {
    lines.push('  CLI core files:')
    for (const file of result.cliCoreFiles) {
      lines.push(`    - ${file}`)
    }
  }

  if (result.coveragePolicyFiles.length > 0) {
    lines.push('  Coverage policy files:')
    for (const file of result.coveragePolicyFiles) {
      lines.push(`    - ${file}`)
    }
  }

  if (result.missingTestSignals.length > 0) {
    lines.push('  Missing test signals:')
    for (const signal of result.missingTestSignals) {
      lines.push(`    - ${signal}`)
    }
  }

  if (result.blockingReasons.length > 0) {
    lines.push('  Blocked:')
    for (const reason of result.blockingReasons) {
      lines.push(`    - ${reason}`)
    }
  }

  return lines.join('\n')
}

function writeGithubOutputs(result: ChangePolicyResult) {
  const outputPath = process.env.GITHUB_OUTPUT
  if (!outputPath) {
    return
  }

  const outputs = {
    areas: result.areas.join(','),
    area_labels: result.areaLabels.join(','),
    blocked: String(result.blocked),
    desktop_checks: String(result.checks.desktop),
    server_checks: String(result.checks.server),
    adapter_checks: String(result.checks.adapters),
    desktop_native_checks: String(result.checks.desktopNative),
    docs_checks: String(result.checks.docs),
    coverage_checks: String(result.checks.coverage),
  }

  appendFileSync(
    outputPath,
    Object.entries(outputs)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') + '\n',
  )
}

if (import.meta.main) {
  const args = parseArgs(process.argv.slice(2))
  const filesPath = args.get('--files')
  const labelsPath = args.get('--labels-file')
  const labelsArg = args.get('--labels')

  if (!filesPath) {
    console.error('Usage: bun run scripts/pr/change-policy.ts --files <changed-files.txt> [--labels-file <labels.txt>]')
    process.exit(2)
  }

  const files = readListFile(filesPath)
  const labels = labelsPath
    ? readListFile(labelsPath)
    : labelsArg?.split(',').map((label) => label.trim()).filter(Boolean) ?? []

  const result = evaluateChangePolicy(files, labels)
  console.log(formatSummary(result))
  writeGithubOutputs(result)

  if (result.blocked) {
    process.exit(1)
  }
}
