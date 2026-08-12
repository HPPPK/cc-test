import type { ExpertResearchAuditEntry } from '../../server/services/expertResearchCompletionService.js'

type ExpertSubagentRuntimeSkill = {
  skillId: string
  title: string
  path: string
  sha256: string
  content: string
}

export type ExpertSubagentResearchEvidenceContext = {
  expertId: string
  packId: string
  packVersion: string
  reviewerEvidenceOnly: true
  records: Array<{
    agentId: string
    agentType: string
    recordedAt: string
    content: string
    entries: ExpertResearchAuditEntry[]
  }>
}

export type ExpertSubagentSkillContext = {
  expertId: string
  packId: string
  packVersion: string
  skills: ExpertSubagentRuntimeSkill[]
}

type Dependencies = {
  env: NodeJS.ProcessEnv
  fetch: typeof globalThis.fetch
}

const MAX_TOTAL_SKILL_CHARACTERS = 32_000
const REQUEST_TIMEOUT_MS = 2_000

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function resolveServerUrl(env: NodeJS.ProcessEnv): string | undefined {
  const value = nonEmptyString(env.CC_JIANGXIA_DESKTOP_SERVER_URL ?? env.DESKTOP_SERVER_URL)
  if (!value) return undefined
  try {
    return new URL(value).toString().replace(/\/$/, '')
  } catch {
    return undefined
  }
}

function normalizeContext(value: unknown): ExpertSubagentSkillContext | undefined {
  if (!isRecord(value)) return undefined
  const expertId = nonEmptyString(value.expertId)
  const packId = nonEmptyString(value.packId)
  const packVersion = nonEmptyString(value.packVersion)
  if (!expertId || !packId || !packVersion || !Array.isArray(value.skills)) return undefined

  let total = 0
  const skills: ExpertSubagentRuntimeSkill[] = []
  for (const rawSkill of value.skills) {
    if (!isRecord(rawSkill)) continue
    const skillId = nonEmptyString(rawSkill.skillId)
    const title = nonEmptyString(rawSkill.title)
    const path = nonEmptyString(rawSkill.path)
    const sha256 = nonEmptyString(rawSkill.sha256)
    const content = nonEmptyString(rawSkill.content)
    if (!skillId || !title || !path || !sha256 || !content) continue
    if (total + content.length > MAX_TOTAL_SKILL_CHARACTERS) break
    total += content.length
    skills.push({ skillId, title, path, sha256, content })
  }
  return { expertId, packId, packVersion, skills }
}

function normalizeEvidenceContext(value: unknown): ExpertSubagentResearchEvidenceContext | undefined {
  if (!isRecord(value)) return undefined
  const expertId = nonEmptyString(value.expertId)
  const packId = nonEmptyString(value.packId)
  const packVersion = nonEmptyString(value.packVersion)
  if (!expertId || !packId || !packVersion || value.reviewerEvidenceOnly !== true || !Array.isArray(value.records)) return undefined
  const records: ExpertSubagentResearchEvidenceContext['records'] = []
  let total = 0
  for (const rawRecord of value.records.slice(-16)) {
    if (!isRecord(rawRecord)) continue
    const agentId = nonEmptyString(rawRecord.agentId)
    const agentType = nonEmptyString(rawRecord.agentType)
    const recordedAt = nonEmptyString(rawRecord.recordedAt)
    const content = nonEmptyString(rawRecord.content)
    if (!agentId || !agentType || !recordedAt || !content || !Array.isArray(rawRecord.entries)) continue
    if (total + content.length > 96_000) break
    total += content.length
    records.push({
      agentId,
      agentType,
      recordedAt,
      content,
      entries: rawRecord.entries.filter(isRecord).map((entry) => ({
        target: nonEmptyString(entry.target) ?? '',
        status: nonEmptyString(entry.status) as ExpertResearchAuditEntry['status'],
        ...(entry.kind === 'search' || entry.kind === 'url' ? { kind: entry.kind } : {}),
        ...(nonEmptyString(entry.searchEngine) ? { searchEngine: nonEmptyString(entry.searchEngine) as ExpertResearchAuditEntry['searchEngine'] } : {}),
        ...(nonEmptyString(entry.query) ? { query: nonEmptyString(entry.query) } : {}),
        ...(nonEmptyString(entry.finalUrl) ? { finalUrl: nonEmptyString(entry.finalUrl) } : {}),
        ...(nonEmptyString(entry.detail) ? { detail: nonEmptyString(entry.detail) } : {}),
      })).filter((entry) => entry.target && entry.status),
    })
  }
  return { expertId, packId, packVersion, reviewerEvidenceOnly: true, records }
}

/** Loads bounded upstream researcher evidence only for the ZIP-designated reviewer. */
export async function loadExpertSubagentResearchEvidenceContext(
  agentType: string,
  dependencies: Dependencies = { env: process.env, fetch: globalThis.fetch },
): Promise<ExpertSubagentResearchEvidenceContext | undefined> {
  if (!agentType.startsWith('expert-')) return undefined
  const sessionId = nonEmptyString(
    dependencies.env.CC_JIANGXIA_EXPERT_SESSION_ID ?? dependencies.env.EXPERT_SESSION_ID,
  )
  const serverUrl = resolveServerUrl(dependencies.env)
  if (!sessionId || !serverUrl) return undefined
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await dependencies.fetch(
      `${serverUrl}/api/sessions/${encodeURIComponent(sessionId)}/expert/subagent-research-evidence-context?agentType=${encodeURIComponent(agentType)}`,
      { signal: controller.signal },
    )
    if (!response.ok) return undefined
    return normalizeEvidenceContext(await response.json())
  } catch {
    return undefined
  } finally {
    clearTimeout(timeout)
  }
}

/** Formats facts, raw observations, and audit status without asking the reviewer to rediscover files. */
export function formatExpertSubagentResearchEvidenceContext(
  context: ExpertSubagentResearchEvidenceContext | undefined,
): string | undefined {
  if (!context) return undefined
  const records = context.records.map((record) => {
    const audit = record.entries.map((entry) => {
      const target = entry.kind === 'search'
        ? `search ${JSON.stringify(entry.query ?? entry.target)}${entry.searchEngine ? ` [engine=${entry.searchEngine}]` : ''}`
        : entry.target
      return `- ${entry.status}: ${target}${entry.finalUrl ? ` [final_url=${entry.finalUrl}]` : ''}${entry.detail ? ` — ${entry.detail}` : ''}`
    }).join('\n')
    return [
      `## Upstream research handoff: ${record.agentType}/${record.agentId}`,
      `Recorded: ${record.recordedAt}`,
      'Researcher report:',
      record.content,
      'Playwright audit:',
      audit || '- No valid Playwright audit was retained.',
    ].join('\n')
  }).join('\n\n---\n\n')
  return [
    '<expert-subagent-research-evidence>',
    `The active Expert ZIP ${context.packId}@${context.packVersion} has provided the completed upstream research handoffs below.`,
    'This is the material you must review. Do not use Read to search the work directory and do not call Playwright to rediscover it.',
    'Treat only opened URL audit entries and the supplied report text as candidate evidence. access_limited, failed, and pending entries can support only a limitation statement.',
    'For each important finding, state whether it is usable and where it should go: include, merge, internal-only, or exclude. Do not downgrade supplied opened evidence to evidence_gap merely because no local file exists.',
    records || 'No upstream researcher handoff was retained. Report that this reviewer has no reviewable upstream evidence.',
    '</expert-subagent-research-evidence>',
  ].join('\n')
}

/**
 * Loads only the selected Expert ZIP's declared delegated-agent Skills from the
 * local Desktop service. This is session-scoped and does not read user files,
 * history, provider configuration, or global Skills.
 */
export async function loadExpertSubagentSkillContext(
  agentType: string,
  dependencies: Dependencies = { env: process.env, fetch: globalThis.fetch },
): Promise<ExpertSubagentSkillContext | undefined> {
  if (!agentType.startsWith('expert-')) return undefined
  const sessionId = nonEmptyString(
    dependencies.env.CC_JIANGXIA_EXPERT_SESSION_ID ?? dependencies.env.EXPERT_SESSION_ID,
  )
  const serverUrl = resolveServerUrl(dependencies.env)
  if (!sessionId || !serverUrl) return undefined

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await dependencies.fetch(
      `${serverUrl}/api/sessions/${encodeURIComponent(sessionId)}/expert/subagent-skill-context?agentType=${encodeURIComponent(agentType)}`,
      { signal: controller.signal },
    )
    if (!response.ok) return undefined
    return normalizeContext(await response.json())
  } catch {
    return undefined
  } finally {
    clearTimeout(timeout)
  }
}

/** Creates a meta prompt that makes package-local methods available without the global Skill tool. */
export function formatExpertSubagentSkillContext(
  context: ExpertSubagentSkillContext | undefined,
): string | undefined {
  if (!context || context.skills.length === 0) return undefined
  const skills = context.skills.map((skill) => [
    `## Package Skill: ${skill.title} (${skill.skillId})`,
    `Source: ${skill.path} (sha256:${skill.sha256})`,
    skill.content,
  ].join('\n')).join('\n\n---\n\n')
  return [
    '<expert-subagent-package-skills>',
    `The active Expert ZIP ${context.packId}@${context.packVersion} has preloaded the following package-local Skills for this delegated task.`,
    'Apply these instructions directly. Do not call the global Skill tool and do not use Read to locate ZIP Skills: they are already present below.',
    skills,
    '</expert-subagent-package-skills>',
  ].join('\n')
}


/**
 * Sends transcript-derived browser audit data to the active Expert Runtime.
 * This is transport only: the server decides whether the selected ZIP declared
 * a completion contract. Ordinary agents and Experts without that contract are
 * unaffected, and no model-callable tool is introduced.
 */
export async function recordExpertSubagentResearchAudit(
  input: { agentId: string; agentType: string; entries: unknown; content?: unknown },
  dependencies: Dependencies = { env: process.env, fetch: globalThis.fetch },
): Promise<void> {
  if (!input.agentType.startsWith('expert-')) return
  const sessionId = nonEmptyString(
    dependencies.env.CC_JIANGXIA_EXPERT_SESSION_ID ?? dependencies.env.EXPERT_SESSION_ID,
  )
  const serverUrl = resolveServerUrl(dependencies.env)
  if (!sessionId || !serverUrl) return
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await dependencies.fetch(
      `${serverUrl}/api/sessions/${encodeURIComponent(sessionId)}/expert/research-audit`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
        signal: controller.signal,
      },
    )
    // Never throw: Expert delivery remains server-gated. Log so a silent
    // persistence miss (e.g. reviewer finished but researchCompletion empty)
    // is diagnosable without breaking the subagent.
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      console.error(
        `[expert-research-audit] failed to persist audit for ${input.agentType}/${input.agentId}: HTTP ${response.status}${detail ? ` ${detail.slice(0, 240)}` : ''}`,
      )
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    console.error(
      `[expert-research-audit] transport failed for ${input.agentType}/${input.agentId}: ${detail}`,
    )
  } finally {
    clearTimeout(timeout)
  }
}
