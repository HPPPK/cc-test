export type WorkflowPhaseDisplaySummary = {
  status?: string
  activePhaseId: string | null
  activePhaseIndex: number
  phaseCount: number
  phaseNames?: string[]
}

const CHINESE_PHASE_NAMES: Record<string, string> = {
  route: '任务路由',
  'route-context': '应用基础确认',
  routing: '任务路由',
  discussion: '需求讨论',
  brainstorm: '头脑风暴',
  brainstorming: '头脑风暴',
  scope: '范围确认',
  'mini-scope': '轻量范围确认',
  requirements: '需求澄清',
  'requirements-clarification': '需求澄清',
  specify: '规格澄清',
  spec: '规格说明',
  'technical-design': '技术设计',
  design: '设计方案',
  'working-backwards': '反向需求梳理',
  prfaq: 'PRFAQ 需求梳理',
  plan: '制定计划',
  planning: '制定计划',
  'task-breakdown': '任务拆分',
  implement: '开始执行',
  implementation: '开始执行',
  build: '开始执行',
  execute: '开始执行',
  'execute-with-coder-subagent': '调用编码子代理执行',
  'minimal-fix-with-coder-subagent': '最小修复执行',
  debug: '调试定位',
  'reproduce-debug': '复现与调试',
  'reproduce-root-cause': '复现与根因定位',
  'problem-investigation': '问题排查',
  verify: '检查验证',
  verification: '检查验证',
  'verify-review': '检查与复审',
  'verify-handoff': '验证与交付检查',
  'regression-scenario-validation-preview': '回归场景验证与预览',
  preview: '本地预览',
  'run-preview': '本地预览',
  release: '发布准备',
  ship: '完成交付',
  'ship-handoff': '完成交付',
  handoff: '交付说明',
  finish: '完成收尾',
  'preview-if-needed-finish': '按需预览并收尾',
  'finish-memory-update': '完成并更新项目记忆',
  'inherit-context-debug-intake': '继承上下文与调试信息收集',
  'inherit-context-mini-scope': '继承上下文与轻量范围确认',
}

export function formatWorkflowPhaseSummary(workflow: WorkflowPhaseDisplaySummary): string {
  if (workflow.status === 'completed') {
    return workflow.phaseCount > 0
      ? `全部 ${workflow.phaseCount} 步已完成`
      : '工作流已完成'
  }

  const displayName = resolveWorkflowPhaseDisplayName(workflow)
  const index = Math.max(workflow.activePhaseIndex + 1, 1)
  if (!displayName) {
    return workflow.phaseCount > 0
      ? `第 ${index} 步`
      : `第 ${index} 步`
  }

  return workflow.phaseCount > 0
    ? `第 ${index} 步：${displayName}`
    : `第 ${index} 步：${displayName}`
}

export function resolveWorkflowPhaseDisplayName(workflow: WorkflowPhaseDisplaySummary): string {
  const phaseName = workflow.activePhaseIndex >= 0
    ? workflow.phaseNames?.[workflow.activePhaseIndex]
    : undefined
  const rawName = phaseName || workflow.activePhaseId || ''
  if (!rawName) return '无活动阶段'
  if (containsCjk(rawName)) return compactChinesePhaseName(rawName)

  const phaseKey = normalizePhaseKey(rawName)
  const idKey = workflow.activePhaseId ? normalizePhaseKey(workflow.activePhaseId) : ''
  const chinese = CHINESE_PHASE_NAMES[idKey] || CHINESE_PHASE_NAMES[phaseKey]
  const english = humanizeWorkflowPhaseValue(rawName)
  return chinese && chinese.toLowerCase() !== english.toLowerCase()
    ? `${chinese}（${english}）`
    : english
}

function compactChinesePhaseName(value: string): string {
  const beforeSlash = value.split('/')[0]?.trim() || value
  return beforeSlash.length > 16 ? `${beforeSlash.slice(0, 16)}…` : beforeSlash
}

function normalizePhaseKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\+/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function containsCjk(value: string): boolean {
  return /[\u3400-\u9fff]/.test(value)
}

function humanizeWorkflowPhaseValue(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}
