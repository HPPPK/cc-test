export type ExpertTemplateFillOutputPolicy = {
  mode: 'session-workdir-direct'
}

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Reads only the opt-in output-root contract. Omitted or legacy output
 * protocols retain their existing CLI working-directory behavior.
 */
export function resolveExpertTemplateFillOutputPolicy(
  outputProtocolContent?: string,
): ExpertTemplateFillOutputPolicy | undefined {
  if (!outputProtocolContent?.trim()) return undefined

  let document: unknown
  try {
    document = JSON.parse(outputProtocolContent)
  } catch {
    return undefined
  }
  if (!isRecord(document) || !isRecord(document.primaryOutput)) return undefined
  const autoDestination = document.primaryOutput.autoDestination
  if (!isRecord(autoDestination) || autoDestination.mode !== 'session-workdir-direct') return undefined

  return { mode: 'session-workdir-direct' }
}

/**
 * Resolves the only permitted write root for an opted-in output protocol.
 * Returning undefined preserves legacy Expert behavior; an opted-in pack without
 * a persisted session workDir must fail rather than guessing a machine path.
 */
export function resolveExpertTemplateFillOutputRoot(
  policy: ExpertTemplateFillOutputPolicy | undefined,
  workDir: string | undefined,
): string | undefined {
  if (policy?.mode !== 'session-workdir-direct') return undefined
  const normalized = workDir?.trim()
  if (!normalized) {
    throw new Error('当前专家会话缺少 session.workDir，无法按窗口选中的目录写入报告。请先选择工作目录并重新进入专家 Mode。')
  }
  return normalized
}
