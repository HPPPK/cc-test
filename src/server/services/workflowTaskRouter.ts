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

type PhaseApplicabilityInput = {
  phase: {
    id: string
    appliesTo?: WorkflowLabel[]
    skipWhen?: WorkflowPhaseSkipPolicy
    modePolicy?: WorkflowPhaseModePolicy
  }
  labels: WorkflowLabel[]
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

  const primaryLabel = input.forcedLabel ?? classifyPrimaryLabel(normalized)
  const secondaryLabels = classifySecondaryLabels(normalized, primaryLabel)
  const effort = classifyEffort(normalized, primaryLabel, input.forcedLabel)
  const suggestedPath = suggestedPathFor(primaryLabel, effort)
  const confidence = confidenceFor(normalized, primaryLabel, input.forcedLabel)
  const rationale = rationaleFor(normalized, primaryLabel, secondaryLabels, effort)
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
  const skippedByLabel = input.phase.skipWhen?.labels?.find((label) => labelSet.has(label))
  if (skippedByLabel) {
    return {
      applies: false,
      reason: `Skipped because route includes label ${skippedByLabel}.`,
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

function classifyPrimaryLabel(normalized: string): WorkflowLabel {
  if (matches(normalized, ['duplicate', '重复', '一样', 'same as', 'already exists', '上次那个'])) return 'duplicate'
  if (matches(normalized, ['wontfix', "won't fix", '不修', '不做', '不处理'])) return 'wontfix'
  if (matches(normalized, ['invalid', '无效', '不合法', '不是需求'])) return 'invalid'
  if (matches(normalized, ['help wanted', '帮忙看', '需要帮助'])) return 'help-wanted'
  if (matches(normalized, ['good first issue', '新手', '入门任务'])) return 'good-first-issue'
  if (matches(normalized, ['500', 'error', 'exception', 'failed', 'failure', 'stack', 'bug', '报错', '控制台', '点击没反应', '没反应', '崩溃', '登录页'])) return 'bug'
  if (matches(normalized, ['readme', 'docs', 'documentation', '文档', '说明书', '帮我写 readme'])) return 'documentation'
  if (matches(normalized, ['ux copy', 'copywriting', 'microcopy', '文案', '按钮文字', '提示语'])) return 'ux-copy'
  if (matches(normalized, ['error handling', 'recovery hint', '错误处理', '异常处理', '错误提示'])) return 'error-handling'
  if (matches(normalized, ['test', 'tests', 'coverage', '测试', '回归'])) return 'test'
  if (matches(normalized, ['refactor', 'cleanup', '重构', '整理代码'])) return 'refactor'
  if (matches(normalized, ['mvp', 'saas', 'new product', '从零', '创建', '做一个', '开发一个', '记账 mvp'])) return 'new-product'
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
): string {
  const signals: string[] = []
  if (matches(normalized, ['500'])) signals.push('500 error')
  if (matches(normalized, ['readme'])) signals.push('README request')
  if (matches(normalized, ['mvp', 'saas'])) signals.push('MVP/product scope')
  if (matches(normalized, ['重复', 'duplicate', '一样'])) signals.push('duplicate wording')
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
