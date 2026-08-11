type ExpertSubagentRuntimeSkill = {
  skillId: string
  title: string
  path: string
  sha256: string
  content: string
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
  input: { agentId: string; agentType: string; entries: unknown },
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
