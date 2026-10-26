type FindingKind = 'factual-error' | 'source-error' | 'supported-omission' | 'optional'
type ReviewFinding = { fieldId: string; kind: FindingKind; reason: string }
type Period = 'month' | 'year' | 'one-time'
type Calculation = { fieldId: string; amount: number; amountPeriod: Period; allowance: number; allowancePeriod: Period; unitsPerTask: number; reportedCost: number }
export type ExpertReportReviewContract = {
  version: 1
  findings: ReviewFinding[]
  calculations: Calculation[]
  requiredFields: string[]
  calculationMismatches: Array<{ fieldId: string; expectedCost: number; reportedCost: number }>
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
}

function invalid(detail: string): never {
  throw new Error(`08 复核契约无效：${detail}。请由同一轮 F 改写原 08 文件并重试审计；不要新增研究或复核轮次。`)
}

/** Decisions come from typed findings and enumerated calculations, never prose keywords. */
export function parseExpertReportReviewContract(content: string, fieldIds: readonly string[]): ExpertReportReviewContract {
  const blocks = [...content.matchAll(/^```expert-report-review[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gm)]
  if (blocks.length !== 1 || [...content.matchAll(/^```/gm)].length !== 2) invalid('必须恰好包含一个 expert-report-review JSON 代码块')
  if (blocks[0]![1]!.length > 200_000) invalid('JSON 内容过长')
  let value: unknown
  try { value = JSON.parse(blocks[0]![1]!) } catch { invalid('JSON 无法解析') }
  if (!record(value) || !exactKeys(value, ['version', 'findings', 'calculations']) || value.version !== 1
    || !Array.isArray(value.findings) || value.findings.length > 64 || !Array.isArray(value.calculations) || value.calculations.length > 64) invalid('只允许 version:1、findings 数组和 calculations 数组，每组最多 64 项')
  const knownFields = new Set(fieldIds)
  const required = new Set<string>()
  const findings: ReviewFinding[] = value.findings.map(item => {
    if (!record(item) || !exactKeys(item, ['fieldId', 'kind', 'reason']) || typeof item.fieldId !== 'string' || !knownFields.has(item.fieldId)
      || typeof item.kind !== 'string' || !['factual-error', 'source-error', 'supported-omission', 'optional'].includes(item.kind)
      || typeof item.reason !== 'string' || !item.reason.trim() || item.reason.length > 2000 || /<!|<\/?[a-zA-Z][^>]*>/.test(item.reason)) invalid('finding 必须引用真实母版字段、允许的 kind 和非空证据理由（最多 2000 字符，不含 HTML）')
    if (item.kind !== 'optional') required.add(item.fieldId)
    return item as ReviewFinding
  })
  const calculationMismatches: ExpertReportReviewContract['calculationMismatches'] = []
  const calculations: Calculation[] = value.calculations.map(item => {
    if (!record(item) || !exactKeys(item, ['fieldId', 'amount', 'amountPeriod', 'allowance', 'allowancePeriod', 'unitsPerTask', 'reportedCost'])
      || typeof item.fieldId !== 'string' || !knownFields.has(item.fieldId)) invalid('calculation 必须使用真实母版字段和规定的全部属性')
    for (const key of ['amount', 'allowance', 'unitsPerTask', 'reportedCost']) {
      const number = item[key]
      if (typeof number !== 'number' || !Number.isFinite(number) || number < 0 || number > 1e12
        || ((key === 'allowance' || key === 'unitsPerTask') && number === 0)) invalid('计算金额必须有限非负，配额和任务用量必须为正，数值不得超过 1e12')
    }
    if (typeof item.amountPeriod !== 'string' || typeof item.allowancePeriod !== 'string' || !['month', 'year', 'one-time'].includes(item.amountPeriod) || !['month', 'year', 'one-time'].includes(item.allowancePeriod)) invalid('计算周期只允许 month、year、one-time')
    if ((item.amountPeriod === 'one-time') !== (item.allowancePeriod === 'one-time')) invalid('一次性金额与周期配额不可换算；请用 source-error finding 标明该字段的成本缺少可比依据')
    const calculation = item as Calculation
    const denominator = calculation.allowance * (calculation.amountPeriod === 'year' && calculation.allowancePeriod === 'month' ? 12
      : calculation.amountPeriod === 'month' && calculation.allowancePeriod === 'year' ? 1 / 12 : 1)
    const expectedCost = calculation.amount / denominator * calculation.unitsPerTask
    if (!Number.isFinite(expectedCost)) invalid('计算结果超出有限数值范围')
    if (Math.abs(calculation.reportedCost - expectedCost) > Math.max(0.005, expectedCost * 0.005)) {
      required.add(calculation.fieldId)
      calculationMismatches.push({ fieldId: calculation.fieldId, expectedCost, reportedCost: calculation.reportedCost })
    }
    return calculation
  })
  return { version: 1, findings, calculations, requiredFields: [...required], calculationMismatches }
}
