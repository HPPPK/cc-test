import { randomUUID } from 'node:crypto'

type Dependencies = { env?: NodeJS.ProcessEnv; fetchImpl?: (url: string, init?: RequestInit) => Promise<Response> }
const stop = 'EXPERT_RESEARCH_BUDGET_EXHAUSTED: Save existing evidence and explicit gaps to the assigned Markdown, Read back, submit the real audit and return; continue D/E/F without further research.'
function value(env: NodeJS.ProcessEnv, suffix: string): string | undefined { return env['CC_JIANGXIA_' + suffix] ?? env['CC_HAHA_' + suffix] ?? env[suffix] }
function configured(env: NodeJS.ProcessEnv): boolean { return value(env, 'EXPERT_TEMPLATE_FILL_WRITE') === '1' && value(env, 'EXPERT_TEMPLATE_FILL_DELIVERY') === 'cli-only' }
async function reserve(body: Record<string, unknown>, deps: Dependencies): Promise<void> {
  const env = deps.env ?? process.env
  const server = value(env, 'DESKTOP_SERVER_URL')?.trim()
  const session = value(env, 'EXPERT_SESSION_ID')?.trim()
  if (!server || !session) throw new Error(stop + ' Budget service identity is unavailable.')
  try {
    const response = await (deps.fetchImpl ?? fetch)(`${server}/api/sessions/${encodeURIComponent(session)}/expert/research-budget`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) })
    const payload = await response.json() as { allowed?: boolean; reason?: string }
    if (!response.ok || payload.allowed !== true) throw new Error(payload.reason ?? 'Research budget reservation was rejected.')
  } catch (error) { throw new Error(stop + ' ' + (error instanceof Error ? error.message : String(error))) }
}
export async function reserveExpertResearcherStart(input: Dependencies & { agentId: string; agentType: string; artifactPath?: string; expertId?: string }): Promise<void> {
  if (input.agentType !== 'expert-evidence-researcher') return
  if (input.expertId !== 'commercialization-research-report') return
  await reserve({ action: 'reserve-researcher', agentId: input.agentId, artifactPath: input.artifactPath }, input)
}
/** Ignore only literal JSON stdin of a recognized report CLI command.
 * Shell code before/after it remains visible; unquoted heredocs can expand shell
 * substitutions and must never receive this treatment.
 */
function withoutLiteralReportStdin(command: string): string {
  const lines = command.split('\n')
  const result: string[] = []
  for (let index = 0; index < lines.length; index++) {
    const header = lines[index]
    result.push(header)
    const cli = /(?:^|[;&|])\s*(?:(?:bun|node)\s+(?:run\s+)?)?(?:["']?[^\s;&|]*[\/])?(?:cc-jiangxia|claude-jiangxia)["']?\s+expert-template-fill\b/.test(header)
    const marker = cli && /--data-stdin\b/.test(header) ? header.match(/<<(-?)\s*(['"])([A-Za-z_][A-Za-z0-9_]*)\2/) : null
    if (!marker) continue
    let end = index + 1
    while (end < lines.length && (marker[1] ? lines[end].replace(/^\t+/, '') : lines[end]) !== marker[3]) end++
    if (end === lines.length) continue
    try {
      const payload = JSON.parse(lines.slice(index + 1, end).join('\n'))
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) continue
    } catch { continue }
    index = end
  }
  return result.join('\n')
}

/** A recognizable bypass guard, not an arbitrary-shell/network security sandbox. */
export function isExpertPublicResearchCall(toolName: string, input: unknown): boolean {
  if (/playwright|web[_-]?fetch|web[_-]?search|browser|(?:^|__)search(?:_|$)|(?:^|__)fetch(?:_|$)/i.test(toolName)) return true
  if (!/^(?:Bash|Shell|PowerShell)$/i.test(toolName)) return false
  const command = withoutLiteralReportStdin(input && typeof input === 'object' && 'command' in input ? String(input.command) : '')
  return /\bgit\s+(?:clone|fetch|ls-remote)\b|\bgh\s+api\b|\b(?:curl|wget|httpie|Invoke-WebRequest|Invoke-RestMethod|playwright|puppeteer|selenium)\b|\b(?:fetch|urlopen|requests\.(?:get|post|request)|https?\.(?:get|request))\s*\(/i.test(command)
}
export async function guardExpertResearchToolCall(input: Dependencies & { toolName: string; input?: unknown; agentId?: string; agentType?: string }): Promise<void> {
  const env = input.env ?? process.env
  if (!configured(env) || !isExpertPublicResearchCall(input.toolName, input.input)) return
  // No root reservation: the canonical API denies root public research and
  // reviewer network work, while the parent's report-generation Bash still works.
  await reserve({ action: 'reserve-browser', agentId: input.agentId ?? '', requestId: randomUUID() }, input)
}
