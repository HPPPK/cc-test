import {
  WORKFLOW_EFFORT_MODES,
  WORKFLOW_LABELS,
  type EffortMode,
  type WorkflowLabel,
  type WorkflowPhaseModePolicy,
  type WorkflowPhaseSkipPolicy,
  type WorkflowTaskRouterInput,
  type WorkflowTaskRouterResult,
} from './workflowTypes.js'

export {
  WORKFLOW_EFFORT_MODES,
  WORKFLOW_LABELS,
}

const TERMINAL_LABELS = new Set<WorkflowLabel>(['duplicate', 'invalid', 'wontfix'])
const NON_ACTIONABLE_LABELS = new Set<WorkflowLabel>(['question', 'duplicate', 'invalid', 'wontfix'])

export class WorkflowRouteConflictError extends Error {
  readonly code = 'WORKFLOW_ROUTE_CONFLICT'
}

type PhaseApplicabilityInput = {
  phase: {
    id: string
    appliesTo?: WorkflowLabel[]
    skipWhen?: WorkflowPhaseSkipPolicy
    modePolicy?: WorkflowPhaseModePolicy
  }
  labels: WorkflowLabel[]
  /** Primary task classification. Secondary labels add context but cannot skip a required phase. */
  primaryLabel?: WorkflowLabel
  effort: EffortMode
}

type PhaseApplicabilityResult = {
  applies: boolean
  reason: string | null
  modePolicy?: string
}

export function isTerminalWorkflowLabel(label: WorkflowLabel): boolean {
  return TERMINAL_LABELS.has(label)
}

export function terminalLabelRequiresConfirmation(label: WorkflowLabel): boolean {
  return TERMINAL_LABELS.has(label)
}

export function routeWorkflowTask(input: WorkflowTaskRouterInput): WorkflowTaskRouterResult {
  const corpus = [
    input.request,
    input.selectedFiles?.join('\n'),
    input.errors,
    input.logs,
    input.testOutput,
    input.repoMetadata ? JSON.stringify(input.repoMetadata) : '',
  ].filter(Boolean).join('\n')
  const normalized = corpus.toLowerCase()
  const request = input.request.toLowerCase()
  const completeFlow = requestsCompleteDevelopmentWorkflow(request)
  if (completeFlow && input.forcedLabel && NON_ACTIONABLE_LABELS.has(input.forcedLabel)) {
    throw new WorkflowRouteConflictError('WORKFLOW_ROUTE_CONFLICT: A complete development workflow cannot use a non-actionable forced label. Choose an actionable label or remove the complete-flow request.')
  }

  const primaryLabel = input.forcedLabel ?? classifyPrimaryLabel(request, normalized)
  const secondaryLabels = classifySecondaryLabels(normalized, primaryLabel)
  const inferredEffort = classifyEffort(normalized, primaryLabel, input.forcedLabel)
  const effort = completeFlow && inferredEffort === 'light' ? 'standard' : inferredEffort
  const suggestedPath = suggestedPathFor(completeFlow ? 'enhancement' : primaryLabel, effort)
  const confidence = confidenceFor(normalized, primaryLabel, input.forcedLabel)
  const rationale = rationaleFor(normalized, primaryLabel, secondaryLabels, effort, request)
  const terminalReason = TERMINAL_LABELS.has(primaryLabel)
    ? terminalReasonFor(primaryLabel)
    : undefined

  return {
    primaryLabel,
    secondaryLabels,
    effort,
    confidence,
    rationale,
    suggestedPath,
    ...(terminalReason ? { terminalReason } : {}),
  }
}

export function phaseAppliesToRoute(input: PhaseApplicabilityInput): PhaseApplicabilityResult {
  const labelSet = new Set(input.labels)
  const primaryLabel = input.primaryLabel ?? input.labels[0]
  const skippedByLabel = primaryLabel && input.phase.skipWhen?.labels?.includes(primaryLabel)
  if (skippedByLabel) {
    return {
      applies: false,
      reason: `Skipped because primary route label is ${skippedByLabel}.`,
    }
  }

  if (input.phase.skipWhen?.efforts?.includes(input.effort)) {
    return {
      applies: false,
      reason: `Skipped because effort is ${input.effort}.`,
    }
  }

  if (input.phase.appliesTo?.length && !input.phase.appliesTo.some((label) => labelSet.has(label))) {
    return {
      applies: false,
      reason: `Skipped because no selected label matches phase applicability.`,
    }
  }

  const modePolicy = input.effort === 'auto' ? undefined : input.phase.modePolicy?.[input.effort]
  return {
    applies: true,
    reason: null,
    ...(modePolicy ? { modePolicy } : {}),
  }
}

/** Explicit complete-flow requests affect path selection, not the requested type of work. */
export function requestsCompleteDevelopmentWorkflow(request: string): boolean {
  return positiveRequestClauses(request.toLowerCase()).some(clause =>
    /(?:完整|全部|全套|所有)[^。；;!?！？\n]{0,16}(?:七|7)\s*(?:个)?阶段|(?:完整|全套)[^。；;!?！？\n]{0,8}(?:开发)?(?:工作流|流程)|(?:complete|full|all)\s+(?:seven|7)[ -]stage(?:s|\b)/.test(clause))
}

function positiveRequestClauses(request: string): string[] {
  return request.split(/[。；;!?！？\n，,]|\.\s+/).map(clause => clause.trim()).filter(clause =>
    clause && !/^(?:请)?(?:不必|不要|不得|无需|不用|不能|禁止|不做|不因)|^(?:please\s+)?(?:do not|don't|never|without)\b/.test(clause))
}

function explicitTerminalLabel(request: string): WorkflowLabel | null {
  if (/^(?:重复需求|重复问题)[。.!！\s]*$/.test(request.trim())) return 'duplicate'
  if (/^(?:无效|不是需求)[。.!！\s]*$/.test(request.trim())) return 'invalid'
  if (/^(?:不修(?:复|了)?|不做(?:了)?|不处理(?:了)?)[。.!！\s]*$/.test(request.trim())) return 'wontfix'
  for (const clause of positiveRequestClauses(request)) {
    // A negative classification is not a decision to stop. Only request text can authorize one.
    if (/(?:不是|并非|不算|不要|不应|不能)|\b(?:not|never|don't)\b/.test(clause)) continue
    if (/^(?:duplicate|invalid|wontfix|won't fix)[.!。！\s]*$/.test(clause)) return clause.startsWith('duplicate') ? 'duplicate' : clause.startsWith('invalid') ? 'invalid' : 'wontfix'
    if (/(?:按|标记为?|归类为?|判定为?)[^。；;]{0,12}(?:duplicate|重复需求|重复问题)|(?:这|该|此|本).{0,18}(?:需求|请求|问题).{0,12}(?:重复|一样)|这和上次那个需求一样|\b(?:this|the)\s+(?:request|issue|task)\s+(?:is\s+)?(?:a\s+)?duplicate\b/.test(clause)) return 'duplicate'
    if (/(?:按|标记为?|归类为?|判定为?)[^。；;]{0,12}(?:invalid|无效)|(?:这|该|此|本).{0,12}(?:需求|请求|问题)(?:是|为)?无效|\b(?:this|the)\s+(?:request|issue|task)\s+is\s+invalid\b/.test(clause)) return 'invalid'
    if (/(?:按|标记为?|归类为?)[^。；;]{0,12}(?:wontfix|won't fix)|(?:这|该|此|本).{0,12}(?:需求|请求|问题)(?:决定)?(?:不修复|不处理了|不做了)|\b(?:we|i)\s+(?:won't|will not)\s+(?:fix|implement)\s+(?:this|the)\s+(?:issue|request|task)\b/.test(clause)) return 'wontfix'
  }
  return null
}

function classifyPrimaryLabel(request: string, normalized: string): WorkflowLabel {
  const terminal = explicitTerminalLabel(request)
  if (terminal) return terminal
  const clauses = positiveRequestClauses(request)
  // Main requested work outranks incidental deliverables such as login, tests and README.
  if (clauses.some(clause => /^(?:(?:请你?|帮我|我需要你?|我想要?|我要|需要你?|麻烦你?|please|can you)\s*)*(?:创建|开发|构建|搭建|做一个|实现一个|交付一个|从零).{0,60}(?:系统|应用|产品|平台|网站|工具|\bapp\b|mvp|saas)|^(?:please\s+|can you\s+|i (?:want|need) you to\s+)*(?:build|create|develop)\b.{0,70}\b(?:system|application|app|product|platform|website|tool|mvp|saas)\b/.test(clause))) return 'new-product'
  if (clauses.some(clause => /^(?:请|帮我|需要|我要|我想)?\s*(?:重构|整理代码|refactor\b|cleanup\b)/.test(clause))) return 'refactor'
  if (clauses.some(clause => /^(?:请|帮我|需要|我要|我想)?\s*(?:新增|增加|优化|enhance\b|improve\b|add\b)/.test(clause))) return 'enhancement'
  if (matches(normalized, ['help wanted', '帮忙看', '需要帮助'])) return 'help-wanted'
  if (matches(normalized, ['good first issue', '新手', '入门任务'])) return 'good-first-issue'
  if (matches(normalized, ['500', 'error', 'exception', 'failed', 'failure', 'stack', 'bug', '报错', '控制台', '点击没反应', '没反应', '崩溃', '登录页'])) return 'bug'
  if (matches(normalized, ['readme', 'docs', 'documentation', '文档', '说明书', '帮我写 readme'])) return 'documentation'
  if (matches(normalized, ['ux copy', 'copywriting', 'microcopy', '文案', '按钮文字', '提示语'])) return 'ux-copy'
  if (matches(normalized, ['error handling', 'recovery hint', '错误处理', '异常处理', '错误提示'])) return 'error-handling'
  if (matches(normalized, ['test', 'tests', 'coverage', '测试', '回归'])) return 'test'
  if (matches(normalized, ['refactor', 'cleanup', '重构', '整理代码'])) return 'refactor'
  if (matches(clauses.join('\n'), ['mvp', 'saas', 'new product', '从零', '创建', '做一个', '开发一个', '记账 mvp'])) return 'new-product'
  if (matches(normalized, ['enhance', 'enhancement', 'improve', 'feature', '新增', '增加', '优化'])) return 'enhancement'
  if (matches(normalized, ['question', '请问', '怎么', '如何', '?', '？'])) return 'question'
  return 'enhancement'
}

function classifySecondaryLabels(normalized: string, primary: WorkflowLabel): WorkflowLabel[] {
  const labels = new Set<WorkflowLabel>()
  if (primary !== 'test' && matches(normalized, ['test', 'tests', 'coverage', '测试', '回归'])) labels.add('test')
  if (primary !== 'documentation' && matches(normalized, ['readme', 'docs', 'documentation', '文档'])) labels.add('documentation')
  if (primary !== 'ux-copy' && matches(normalized, ['copywriting', 'microcopy', '文案', '提示语'])) labels.add('ux-copy')
  if (primary !== 'error-handling' && matches(normalized, ['error handling', '错误处理', '异常处理', '错误提示'])) labels.add('error-handling')
  if (primary !== 'refactor' && matches(normalized, ['refactor', 'cleanup', '重构'])) labels.add('refactor')
  if (primary !== 'bug' && matches(normalized, ['500', 'error', 'failed', '报错'])) labels.add('bug')
  return [...labels]
}

function classifyEffort(normalized: string, primary: WorkflowLabel, forcedLabel?: WorkflowLabel): EffortMode {
  if (forcedLabel && NON_ACTIONABLE_LABELS.has(forcedLabel)) return 'light'
  if (primary === 'question' || TERMINAL_LABELS.has(primary) || primary === 'good-first-issue') return 'light'
  if (primary === 'documentation' || primary === 'ux-copy') {
    return matches(normalized, ['full', 'site', '全量', '完整', '全部']) ? 'standard' : 'light'
  }
  if (primary === 'error-handling') return 'standard'
  if (primary === 'new-product') {
    return matches(normalized, ['saas', 'mvp', 'payment', 'billing', 'backend', '数据库', '记账']) ? 'heavy' : 'standard'
  }
  if (primary === 'bug') {
    return matches(normalized, ['500', 'production', 'prod', '线上', 'crash', '崩溃']) ? 'standard' : 'standard'
  }
  if (primary === 'test' || primary === 'refactor') {
    return matches(normalized, ['large', 'major', '全量', '架构']) ? 'heavy' : 'standard'
  }
  return 'standard'
}

function suggestedPathFor(label: WorkflowLabel, effort: EffortMode): string[] {
  if (TERMINAL_LABELS.has(label)) return ['route']
  if (label === 'question') return ['route', 'ship-handoff']
  if (label === 'bug') return ['route', 'reproduce-debug', 'plan', 'implement', 'verify-review', 'ship-handoff']
  if (label === 'documentation' || label === 'ux-copy') return ['route', 'spec', 'verify-review', 'ship-handoff']
  if (label === 'error-handling') return ['route', 'spec', 'plan', 'implement', 'verify-review', 'ship-handoff']
  if (label === 'refactor' || label === 'test') return ['route', 'spec', 'plan', 'implement', 'verify-review', 'ship-handoff']
  const base = ['route', 'working-backwards', 'spec', 'plan', 'task-breakdown', 'implement', 'verify-review', 'ship-handoff']
  return effort === 'light' ? base.filter((phase) => phase !== 'task-breakdown') : base
}

function confidenceFor(normalized: string, label: WorkflowLabel, forcedLabel?: WorkflowLabel): number {
  if (forcedLabel) return 0.95
  if (label === 'enhancement' && normalized.trim().length < 12) return 0.55
  if (label === 'bug' && matches(normalized, ['500', '报错', 'error', 'failed'])) return 0.86
  if (label === 'new-product' && matches(normalized, ['mvp', 'saas', '创建', '做一个'])) return 0.82
  if (label === 'documentation' && matches(normalized, ['readme', '文档', 'docs'])) return 0.84
  if (TERMINAL_LABELS.has(label)) return 0.88
  return 0.68
}

function rationaleFor(
  normalized: string,
  primary: WorkflowLabel,
  secondaryLabels: WorkflowLabel[],
  effort: EffortMode,
  request: string,
): string {
  const signals: string[] = []
  if (matches(normalized, ['500'])) signals.push('500 error')
  if (matches(normalized, ['readme'])) signals.push('README request')
  if (matches(normalized, ['mvp', 'saas'])) signals.push('MVP/product scope')
  if (primary === 'duplicate' && explicitTerminalLabel(request) === 'duplicate') signals.push('duplicate wording')
  if (matches(normalized, ['test', '测试'])) signals.push('test evidence')

  const signalText = signals.length ? ` Signals: ${signals.join(', ')}.` : ''
  const secondaryText = secondaryLabels.length ? ` Secondary labels: ${secondaryLabels.join(', ')}.` : ''
  return `Routed as ${primary} with ${effort} effort.${signalText}${secondaryText}`
}

function terminalReasonFor(label: WorkflowLabel): string {
  if (label === 'duplicate') return 'The request appears to duplicate existing work; confirm before stopping this workflow as duplicate.'
  if (label === 'invalid') return 'The request appears invalid or not actionable; confirm before stopping this workflow as invalid.'
  return 'The request appears intentionally out of scope; confirm before stopping this workflow as wontfix.'
}

function matches(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle.toLowerCase()))
}
