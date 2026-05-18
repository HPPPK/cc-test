export type QualityGateMode = 'pr' | 'baseline' | 'release' | 'fast'

export type LaneKind = 'command' | 'baseline-case' | 'desktop-smoke' | 'provider-smoke'

export type LaneCategory =
  | 'scope'
  | 'governance'
  | 'unit'
  | 'coverage'
  | 'integration'
  | 'smoke'
  | 'native'
  | 'docs'

/**
 * Feedback type for quality gate reports.
 * - 'fast': Development signal only, never merge-ready
 * - 'full': Complete verification, can indicate PR readiness
 */
export type FeedbackType = 'fast' | 'full'

/**
 * Risk level for change assessment.
 * Used for determining escalation of heavy checks.
 */
export type RiskLevel = 'low' | 'medium' | 'high'

/**
 * Coverage mode for coverage lanes.
 * - 'changed-line': Only measure coverage for changed lines (PR mode)
 * - 'full': Measure full coverage (baseline/release mode)
 */
export type CoverageMode = 'changed-line' | 'full'

/**
 * Risk trigger configuration for lane escalation.
 * Defines when a lane should run based on risk assessment.
 */
export type RiskTrigger = {
  riskLevels: RiskLevel[]
  escalatedChecks?: string[]
}

export type LaneDefinition = {
  id: string
  title: string
  description: string
  kind: LaneKind
  command?: string[]
  impactRequiredCheck?: string
  baselineCaseId?: string
  baselineTarget?: BaselineTarget
  requiredForModes: QualityGateMode[]
  category?: LaneCategory
  live?: boolean
  /**
   * Coverage mode for this lane.
   * PR mode lanes use 'changed-line'; baseline/release use 'full'.
   */
  coverageMode?: CoverageMode
  /**
   * Risk trigger configuration for conditional execution.
   * Lane runs only when riskLevel matches one of the specified levels.
   */
  riskTrigger?: RiskTrigger
  /**
   * Execution kind for the lane.
   * 'sequential': Run tests one at a time (default for smoke)
   * 'parallel': Run tests in parallel (default for unit tests)
   */
  executionKind?: 'sequential' | 'parallel'
  /**
   * Timeout in milliseconds for the lane.
   */
  timeoutMs?: number
  /**
   * Lane dependencies - this lane runs only after specified lanes complete.
   */
  dependsOn?: string[]
}

export type BaselineCase = {
  id: string
  title: string
  description: string
  fixture: string
  prompt: string
  mode: 'ui' | 'websocket'
  requiredCapabilities: Array<'model' | 'file-edit' | 'shell' | 'permission' | 'browser'>
  timeoutMs: number
  verify: {
    commands: string[][]
    requiredFiles?: string[]
    expectedFiles?: string[]
    forbiddenFiles?: string[]
    transcriptAssertions?: string[]
  }
}

export type BaselineTarget = {
  providerId: string | null
  modelId: string
  label: string
}

export type LaneStatus = 'passed' | 'failed' | 'skipped'

export type LaneResult = {
  id: string
  title: string
  description?: string
  category?: LaneCategory
  live?: boolean
  status: LaneStatus
  command?: string[]
  durationMs: number
  exitCode?: number
  skipReason?: string
  error?: string
  artifactDir?: string
  logPath?: string
}

export type ImpactSummary = {
  changedFiles?: number
  areas: string[]
  labels: string[]
  blocked?: boolean
  requiredChecks: string[]
  testCoverageSignals: string[]
  riskNotes: string[]
}

export type CoverageMetricSummary = {
  pct: number
  covered: number
  total: number
}

export type CoverageSuiteSummary = {
  id: string
  title: string
  status: string
  lines?: CoverageMetricSummary
  functions?: CoverageMetricSummary
  branches?: CoverageMetricSummary
  statements?: CoverageMetricSummary
}

export type ReportArtifact = {
  title: string
  path: string
}

export type QualityGateOptions = {
  mode: QualityGateMode
  dryRun: boolean
  allowLive: boolean
  baselineTargets: BaselineTarget[]
  rootDir: string
  artifactsDir?: string
  runOutputDir?: string
  runId?: string
  onlyLaneSelectors?: string[]
  skipLaneSelectors?: string[]
}

export type QualityGateReport = {
  schemaVersion: 1
  runId: string
  mode: QualityGateMode
  dryRun: boolean
  allowLive: boolean
  startedAt: string
  finishedAt: string
  rootDir: string
  git: {
    sha: string | null
    dirty: boolean
  }
  results: LaneResult[]
  impact?: ImpactSummary
  coverage?: {
    reportPath: string
    suites: CoverageSuiteSummary[]
    failures: string[]
  }
  artifacts: ReportArtifact[]
  summary: {
    passed: number
    failed: number
    skipped: number
  }
  /**
   * Feedback type indicating report purpose.
   * - 'fast': Development signal (fast mode)
   * - 'full': Complete verification (pr/baseline/release mode)
   * CA-002: Fast feedback is NEVER merge-ready.
   */
  feedbackType?: FeedbackType
  /**
   * PR readiness indicator.
   * - Always false for fast mode (CA-002)
   * - True for PR mode when all required checks pass
   * - True for release mode when all required checks pass
   */
  readyForMerge?: boolean
  /**
   * Risk level of the change.
   * Populated by risk assessment from impact-report.
   */
  riskLevel?: RiskLevel
  /**
   * Escalated checks triggered by risk assessment.
   * Lists heavy checks that were run due to high-risk paths.
   */
  escalatedChecks?: string[]
}

/**
 * Fast lane test selection output from impact-report.
 * Used by fast mode to run only relevant tests based on changed files.
 */
export type FastLaneTestSelection = {
  /**
   * Core smoke tests that always run.
   */
  coreSmoke: string[]
  /**
   * Selected tests based on changed areas.
   */
  selectedTests: {
    server?: string[]
    desktop?: string[]
    adapters?: string[]
    docs?: string[]
  }
  /**
   * Skipped test areas with reasons.
   */
  skipped: {
    area: string
    reason: string
  }[]
  /**
   * Overall risk level of the change.
   */
  riskLevel: RiskLevel
  /**
   * Escalated checks triggered by risk assessment.
   */
  escalatedChecks?: string[]
}

/**
 * Risk assessment result from change-policy evaluation.
 * Used for determining which heavy checks to run.
 */
export type RiskAssessment = {
  /**
   * Overall risk level of the change.
   */
  riskLevel: RiskLevel
  /**
   * Escalated checks to run (undefined if no escalation needed).
   */
  escalatedChecks: string[] | undefined
  /**
   * Guidance for medium-risk changes.
   * Explains what additional verification might be helpful.
   */
  riskGuidance: string | undefined
  /**
   * Explanation for why heavy checks were skipped.
   * Populated for low-risk changes.
   */
  skipExplanation: string | undefined
}
