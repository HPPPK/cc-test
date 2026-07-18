import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { baselineCases } from './baseline/cases'
import { executeBaselineCase } from './baseline/execute'
import { executeDesktopSmoke } from './desktop-smoke/execute'
import { lanesForMode } from './modes'
import { executeProviderSmoke } from './provider-smoke/execute'
import { writeReport } from './reporter'
import type {
  CoverageMode,
  CoverageSuiteSummary,
  FeedbackType,
  ImpactSummary,
  LaneCategory,
  LaneDefinition,
  LaneResult,
  QualityGateOptions,
  QualityGateReport,
  ReportArtifact,
} from './types'

type LaneExecutor = (lane: LaneDefinition, options: QualityGateOptions) => Promise<LaneResult>

function nowId() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

async function output(cmd: string[], cwd: string) {
  const proc = Bun.spawn(cmd, {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  const code = await proc.exited
  if (code !== 0) {
    return null
  }
  return (stdout || stderr).trim()
}

function sanitizeId(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-')
}

function matchesLaneSelector(lane: LaneDefinition, selector: string) {
  const normalized = selector.trim()
  if (!normalized) return false
  if (normalized.endsWith('*')) {
    return lane.id.startsWith(normalized.slice(0, -1))
  }
  return lane.id === normalized
}

function filterLanesForOptions(lanes: LaneDefinition[], options: QualityGateOptions) {
  const only = options.onlyLaneSelectors?.filter(Boolean) ?? []
  const skip = options.skipLaneSelectors?.filter(Boolean) ?? []
  let selected = lanes

  if (only.length > 0) {
    selected = selected.filter((lane) => only.some((selector) => matchesLaneSelector(lane, selector)))
  }
  if (skip.length > 0) {
    selected = selected.filter((lane) => !skip.some((selector) => matchesLaneSelector(lane, selector)))
  }
  if (selected.length === 0) {
    throw new Error(`No quality gate lanes matched selectors. only=${only.join(',') || 'none'} skip=${skip.join(',') || 'none'}`)
  }

  return selected
}

async function pipeToLog(
  stream: ReadableStream<Uint8Array> | null,
  logPath: string,
  write: (chunk: Buffer) => void,
  signal: AbortSignal,
) {
  if (!stream) return
  const reader = stream.getReader()
  const cancel = () => {
    reader.cancel().catch(() => undefined)
  }
  signal.addEventListener('abort', cancel, { once: true })

  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read()
      if (done || !value) break
      const chunk = Buffer.from(value)
      appendFileSync(logPath, chunk)
      write(chunk)
    }
  } catch {
    // A completed command can leave grandchildren with inherited stdout/stderr
    // handles. The caller aborts only after a bounded post-exit drain window.
  } finally {
    signal.removeEventListener('abort', cancel)
  }
}

async function gitInfo(rootDir: string) {
  const sha = await output(['git', 'rev-parse', '--short', 'HEAD'], rootDir)
  const status = await output(['git', 'status', '--short'], rootDir)
  return {
    sha,
    dirty: Boolean(status),
  }
}

/**
 * Determines the feedback type for a quality gate report.
 * - 'fast' for fast mode (development signal only)
 * - 'full' for PR, baseline, and release modes (complete verification)
 */
export function determineFeedbackType(mode: QualityGateMode): FeedbackType {
  // Fast mode always produces 'fast' feedback (development signal only)
  // PR, baseline, and release modes produce 'full' feedback
  return mode === 'fast' ? 'fast' : 'full'
}

/**
 * Determines whether the report indicates PR readiness.
 * - Always false for fast mode (CA-002: Fast success is NEVER merge-ready)
 * - True for PR/release modes when all checks pass (no failures)
 * - Baseline mode is not merge-ready (it's for coverage tracking)
 */
export function determineReadyForMerge(
  mode: QualityGateMode,
  summary: { passed: number; failed: number; skipped: number },
  impact?: ImpactSummary,
): boolean {
  // Fast mode is NEVER merge-ready (CA-002)
  if (mode === 'fast') return false
  // Baseline mode is for coverage tracking, not PR readiness
  if (mode === 'baseline') return false
  // A policy-blocked impact report must prevent PR/release readiness even
  // when individual command lanes exit successfully.
  if (impact?.blocked) return false
  // PR and release modes are merge-ready when all checks pass (no failures)
  return summary.failed === 0
}

/**
 * Adjusts coverage command arguments based on the lane's coverage mode.
 * When coverageMode is 'changed-line', adds --changed flag for changed-line coverage.
 */
function adjustCoverageCommandForMode(
  command: string[],
  coverageMode: CoverageMode | undefined,
): string[] {
  if (coverageMode !== 'changed-line') {
    return command
  }
  // Add --changed flag for changed-line coverage if not already present
  if (command.includes('--changed')) {
    return command
  }
  // Insert --changed before the test files/patterns (after coverage flags)
  // For commands like 'bun run check:coverage', we need to pass through
  // For direct test commands, we add --changed after coverage flags
  const result = [...command]
  // Find where to insert --changed (after last --coverage* flag or at end)
  let insertIndex = result.length
  for (let i = result.length - 1; i >= 0; i--) {
    if (result[i].startsWith('--coverage')) {
      insertIndex = i + 1
      break
    }
  }
  result.splice(insertIndex, 0, '--changed')
  return result
}

async function runCommandLane(lane: LaneDefinition, options: QualityGateOptions): Promise<LaneResult> {
  const started = Date.now()
  let command = lane.command ?? []
  const artifactRoot = options.runOutputDir ?? join(options.rootDir, 'artifacts', 'quality-runs', options.runId ?? 'current')
  const logPath = join(artifactRoot, 'logs', `${sanitizeId(lane.id)}.log`)

  // Adjust coverage command for coverageMode (changed-line vs full)
  if (lane.id === 'coverage' && lane.coverageMode) {
    command = adjustCoverageCommandForMode(command, lane.coverageMode)
  }

  if (options.dryRun) {
    mkdirSync(dirname(logPath), { recursive: true })
    const skipReasonText = lane.coverageMode === 'changed-line'
      ? 'dry run (changed-line coverage)'
      : 'dry run'
    writeFileSync(logPath, `$ ${command.join(' ')}\n[quality-gate] skipped: ${skipReasonText}\n`)
    return {
      id: lane.id,
      title: lane.title,
      status: 'skipped',
      command,
      durationMs: Date.now() - started,
      skipReason: 'dry run',
      logPath,
    }
  }

  mkdirSync(dirname(logPath), { recursive: true })
  writeFileSync(logPath, `$ ${command.join(' ')}\n`)

  // Check impact-required checks for lanes that have impactRequiredCheck defined
  // This applies to PR, fast, and release modes that use impact-based selection
  if (lane.impactRequiredCheck) {
    const requiredChecks = readImpactRequiredChecks(options)
    if (!requiredChecks) {
      const error = `Impact report unavailable before ${lane.impactRequiredCheck}`
      appendFileSync(logPath, `[quality-gate] failed: ${error}\n`)
      return {
        id: lane.id,
        title: lane.title,
        status: 'failed',
        command,
        durationMs: Date.now() - started,
        error,
        logPath,
      }
    }

    const requiredCheck = normalizeImpactCheck(lane.impactRequiredCheck)
    if (!requiredChecks.includes(requiredCheck)) {
      const skipReason = `${requiredCheck} not required by impact report`
      appendFileSync(logPath, `[quality-gate] skipped: ${skipReason}\n`)
      return {
        id: lane.id,
        title: lane.title,
        status: 'skipped',
        command,
        durationMs: Date.now() - started,
        skipReason,
        logPath,
      }
    }
  }

  const streamLogs = process.env.QUALITY_GATE_STREAM_LOGS === '1'
  const writeStdout = streamLogs ? (chunk: Buffer) => process.stdout.write(chunk) : () => {}
  const writeStderr = streamLogs ? (chunk: Buffer) => process.stderr.write(chunk) : () => {}
  const proc = Bun.spawn(command, {
    cwd: options.rootDir,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  // Start consuming both pipes before waiting for process exit. Otherwise a
  // verbose test command can fill its OS pipe buffer and never reach exit.
  const drainController = new AbortController()
  const logPumps = Promise.all([
    pipeToLog(proc.stdout, logPath, writeStdout, drainController.signal),
    pipeToLog(proc.stderr, logPath, writeStderr, drainController.signal),
  ])
  const exitCode = await proc.exited
  await Promise.race([
    logPumps,
    new Promise<void>((resolve) => setTimeout(resolve, 1_000)),
  ])
  drainController.abort()
  await logPumps

  return {
    id: lane.id,
    title: lane.title,
    status: exitCode === 0 ? 'passed' : 'failed',
    command,
    durationMs: Date.now() - started,
    exitCode,
    logPath,
  }
}

async function runBaselineCaseLane(lane: LaneDefinition, options: QualityGateOptions): Promise<LaneResult> {
  const started = Date.now()

  if (!options.allowLive) {
    return {
      id: lane.id,
      title: lane.title,
      status: 'skipped',
      durationMs: Date.now() - started,
      skipReason: 'live baseline cases require --allow-live',
    }
  }

  const caseId = lane.baselineCaseId ?? lane.id.replace(/^baseline:/, '').split(':')[0]
  const testCase = baselineCases.find((candidate) => candidate.id === caseId)
  if (!testCase) {
    return {
      id: lane.id,
      title: lane.title,
      status: 'failed',
      durationMs: Date.now() - started,
      error: `Unknown baseline case: ${caseId}`,
    }
  }

  const artifactRoot = options.runOutputDir ?? join(options.rootDir, 'artifacts', 'quality-runs', options.runId ?? 'current')
  return executeBaselineCase(
    testCase,
    options.rootDir,
    join(artifactRoot, 'cases', lane.id.replace(/[^a-zA-Z0-9._-]+/g, '-')),
    lane.baselineTarget,
  )
}

async function runLane(lane: LaneDefinition, options: QualityGateOptions): Promise<LaneResult> {
  if (lane.kind === 'baseline-case') {
    return runBaselineCaseLane(lane, options)
  }
  if (lane.kind === 'desktop-smoke') {
    const started = Date.now()

    if (!options.allowLive) {
      return {
        id: lane.id,
        title: lane.title,
        status: 'skipped',
        durationMs: Date.now() - started,
        skipReason: 'desktop agent-browser smoke requires --allow-live',
      }
    }

    const artifactRoot = options.runOutputDir ?? join(options.rootDir, 'artifacts', 'quality-runs', options.runId ?? 'current')
    return executeDesktopSmoke(
      options.rootDir,
      join(artifactRoot, 'cases', lane.id.replace(/[^a-zA-Z0-9._-]+/g, '-')),
      lane.id,
      lane.title,
      lane.baselineTarget,
    )
  }

  if (lane.kind === 'provider-smoke') {
    const started = Date.now()

    if (!options.allowLive) {
      return {
        id: lane.id,
        title: lane.title,
        status: 'skipped',
        durationMs: Date.now() - started,
        skipReason: 'provider smoke requires --allow-live',
      }
    }

    const artifactRoot = options.runOutputDir ?? join(options.rootDir, 'artifacts', 'quality-runs', options.runId ?? 'current')
    return executeProviderSmoke(
      options.rootDir,
      join(artifactRoot, 'cases', lane.id.replace(/[^a-zA-Z0-9._-]+/g, '-')),
      lane.id,
      lane.title,
      lane.baselineTarget,
    )
  }

  return runCommandLane(lane, options)
}

function summarize(results: LaneResult[]) {
  return {
    passed: results.filter((result) => result.status === 'passed').length,
    failed: results.filter((result) => result.status === 'failed').length,
    skipped: results.filter((result) => result.status === 'skipped').length,
  }
}

function defaultCategoryForLane(lane: LaneDefinition): LaneCategory {
  if (lane.category) return lane.category
  if (lane.id === 'impact-report') return 'scope'
  if (lane.id === 'coverage') return 'coverage'
  if (lane.id === 'native-checks') return 'native'
  if (lane.kind === 'baseline-case') return 'integration'
  if (lane.kind === 'provider-smoke' || lane.kind === 'desktop-smoke') return 'smoke'
  if (lane.id.includes('test') || lane.id.includes('checks')) return 'unit'
  return 'governance'
}

function withLaneMetadata(lane: LaneDefinition, result: LaneResult): LaneResult {
  return {
    ...result,
    description: lane.description,
    category: defaultCategoryForLane(lane),
    live: Boolean(lane.live),
  }
}

function readText(path: string | undefined) {
  if (!path || !existsSync(path)) return null
  return readFileSync(path, 'utf8')
}

function readSection(lines: string[], heading: string) {
  const items: string[] = []
  let active = false

  for (const line of lines) {
    if (line.startsWith('## ')) {
      active = line.trim() === `## ${heading}`
      continue
    }

    if (!active) continue
    if (line.startsWith('- ')) {
      items.push(line.slice(2).trim())
    }
  }

  return items
}

function normalizeImpactCheck(value: string) {
  return value.replace(/`/g, '').replace(/\s+/g, ' ').trim()
}

function impactReportLogPath(options: QualityGateOptions) {
  const artifactRoot = options.runOutputDir ?? join(options.rootDir, 'artifacts', 'quality-runs', options.runId ?? 'current')
  return join(artifactRoot, 'logs', 'impact-report.log')
}

function readImpactRequiredChecks(options: QualityGateOptions) {
  const log = readText(impactReportLogPath(options))
  if (!log) return null
  return readSection(log.split(/\r?\n/), 'Required local checks').map(normalizeImpactCheck)
}

function splitSummaryList(value: string | undefined) {
  if (!value || value === 'none') return []
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

function parseRiskLevel(value: string | undefined): import('./types').RiskLevel | undefined {
  if (value === 'low' || value === 'medium' || value === 'high') {
    return value
  }
  return undefined
}

function parseEscalatedChecks(value: string | undefined): string[] | undefined {
  if (!value || value === '(none)') return undefined
  const checks = splitSummaryList(value)
  return checks.length > 0 ? checks : undefined
}

function parseImpactSummary(results: LaneResult[]): ImpactSummary | undefined {
  const impact = results.find((result) => result.id === 'impact-report')
  const log = readText(impact?.logPath)
  if (!log) return undefined

  const lines = log.split(/\r?\n/)
  const findValue = (label: string) => {
    const prefix = `${label}:`
    return lines.find((line) => line.startsWith(prefix))?.slice(prefix.length).trim()
  }

  const changedFiles = Number(findValue('Changed files'))

  return {
    ...(Number.isFinite(changedFiles) ? { changedFiles } : {}),
    areas: splitSummaryList(findValue('Areas')),
    labels: splitSummaryList(findValue('Labels')),
    blocked: findValue('Blocked') === 'yes' ? true : findValue('Blocked') === 'no' ? false : undefined,
    requiredChecks: readSection(lines, 'Required local checks'),
    testCoverageSignals: readSection(lines, 'Test coverage signals'),
    riskNotes: readSection(lines, 'Risk notes'),
  }
}

function parseRiskAssessment(results: LaneResult[]): {
  riskLevel?: import('./types').RiskLevel
  escalatedChecks?: string[]
} {
  const impact = results.find((result) => result.id === 'impact-report')
  const log = readText(impact?.logPath)
  if (!log) return {}

  const lines = log.split(/\r?\n/)
  const findValue = (label: string) => {
    const prefix = `${label}:`
    return lines.find((line) => line.startsWith(prefix))?.slice(prefix.length).trim()
  }

  const riskLevel = parseRiskLevel(findValue('- Level'))
  const escalatedChecks = parseEscalatedChecks(findValue('- Escalated checks'))

  return {
    ...(riskLevel ? { riskLevel } : {}),
    ...(escalatedChecks ? { escalatedChecks } : {}),
  }
}

function coverageReportPathFromLog(results: LaneResult[]) {
  const coverage = results.find((result) => result.id === 'coverage')
  const log = readText(coverage?.logPath)
  if (!log) return null
  return log.match(/Coverage report:\s*(.+coverage-report\.md)/)?.[1]?.trim() ?? null
}

function parseCoverageSummary(results: LaneResult[]) {
  const reportPath = coverageReportPathFromLog(results)
  if (!reportPath) return undefined

  const jsonPath = reportPath.replace(/coverage-report\.md$/, 'coverage-report.json')
  if (!existsSync(jsonPath)) return undefined

  const parsed = JSON.parse(readFileSync(jsonPath, 'utf8')) as {
    suites?: Array<CoverageSuiteSummary & {
      summary?: Pick<CoverageSuiteSummary, 'lines' | 'functions' | 'branches' | 'statements'>
    }>
    failures?: string[]
  }

  return {
    reportPath,
    suites: (parsed.suites ?? []).map((suite) => ({
      id: suite.id,
      title: suite.title,
      status: suite.status,
      lines: suite.lines ?? suite.summary?.lines,
      functions: suite.functions ?? suite.summary?.functions,
      branches: suite.branches ?? suite.summary?.branches,
      statements: suite.statements ?? suite.summary?.statements,
    })),
    failures: parsed.failures ?? [],
  }
}

function collectReportArtifacts(outputDir: string, results: LaneResult[]): ReportArtifact[] {
  const artifacts: ReportArtifact[] = [
    { title: 'Quality report markdown', path: join(outputDir, 'report.md') },
    { title: 'Quality report JSON', path: join(outputDir, 'report.json') },
    { title: 'Quality report JUnit', path: join(outputDir, 'junit.xml') },
  ]

  const coveragePath = coverageReportPathFromLog(results)
  if (coveragePath) {
    artifacts.push({ title: 'Coverage report markdown', path: coveragePath })
    artifacts.push({ title: 'Coverage report JSON', path: coveragePath.replace(/coverage-report\.md$/, 'coverage-report.json') })
  }

  return artifacts
}

function enforceReleaseLiveLanes(
  options: QualityGateOptions,
  lanes: LaneDefinition[],
  results: LaneResult[],
) {
  if (options.mode !== 'release' || options.dryRun) {
    return results
  }

  return results.map((result, index) => {
    if (result.status !== 'skipped' || !lanes[index]?.live) {
      return result
    }

    return {
      ...result,
      status: 'failed' as const,
      error: result.skipReason ?? 'release live lane was skipped',
      skipReason: undefined,
    }
  })
}

export async function runQualityGate(options: QualityGateOptions) {
  return runQualityGateLanes(options, lanesForMode(options.mode, options.baselineTargets))
}

export async function runQualityGateLanes(
  options: QualityGateOptions,
  lanes: LaneDefinition[],
  executeLane: LaneExecutor = runLane,
) {
  const runId = options.runId ?? nowId()
  const startedAt = new Date().toISOString()
  const artifactsRoot = options.artifactsDir ?? join(options.rootDir, 'artifacts', 'quality-runs')
  const outputDir = join(artifactsRoot, runId)
  mkdirSync(outputDir, { recursive: true })
  const selectedLanes = filterLanesForOptions(lanes, options)

  const runOptions = { ...options, runId, runOutputDir: outputDir }
  const rawResults: LaneResult[] = []
  for (const lane of selectedLanes) {
    const result = await executeLane(lane, runOptions)
    rawResults.push(withLaneMetadata(lane, result))
  }
  const results = enforceReleaseLiveLanes(options, selectedLanes, rawResults)

  // Parse risk assessment from impact-report for escalation metadata
  const riskAssessment = parseRiskAssessment(results)

  const impact = parseImpactSummary(results)
  const summary = summarize(results)

  const report: QualityGateReport = {
    schemaVersion: 1,
    runId,
    mode: options.mode,
    dryRun: options.dryRun,
    allowLive: options.allowLive,
    startedAt,
    finishedAt: new Date().toISOString(),
    rootDir: options.rootDir,
    git: await gitInfo(options.rootDir),
    results,
    impact,
    coverage: parseCoverageSummary(results),
    artifacts: collectReportArtifacts(outputDir, results),
    summary,
    // CA-002: feedbackType distinguishes fast (development signal) from full (PR readiness)
    feedbackType: determineFeedbackType(options.mode),
    // CA-002: readyForMerge is always false for fast mode, true for PR/release when all checks pass
    readyForMerge: determineReadyForMerge(options.mode, summary, impact),
    // Escalation metadata from risk assessment
    ...(riskAssessment.riskLevel ? { riskLevel: riskAssessment.riskLevel } : {}),
    ...(riskAssessment.escalatedChecks ? { escalatedChecks: riskAssessment.escalatedChecks } : {}),
  }

  writeReport(report, outputDir)
  return { report, outputDir }
}
