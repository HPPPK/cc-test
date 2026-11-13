import { getJiangxiaEnvValue } from '../../utils/appIdentity.js'
type Dependencies = { env?: NodeJS.ProcessEnv; fetchImpl?: (url: string, init?: RequestInit) => Promise<Response> }
export async function requestExpertIntake(action: string, body: unknown, deps: Dependencies = {}): Promise<any> {
  const env = deps.env ?? process.env
  const server = getJiangxiaEnvValue('DESKTOP_SERVER_URL', env)?.trim()
  const session = getJiangxiaEnvValue('EXPERT_SESSION_ID', env)?.trim()
  if (!server || !session) throw new Error('EXPERT_INTAKE_UNAVAILABLE: Expert session identity is unavailable.')
  let response: Response
  let payload: any
  try {
    response = await (deps.fetchImpl ?? fetch)(`${server}/api/sessions/${encodeURIComponent(session)}/expert/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) })
    payload = await response.json()
  } catch { throw new Error('EXPERT_INTAKE_UNAVAILABLE: The host could not verify intake admission. Preserve existing materials and retry after the session connection recovers.') }
  if (!response.ok) throw new Error(payload.message ?? payload.error?.message ?? 'EXPERT_INTAKE_REQUIRED: Resolve the current user-owned scope decision.')
  return payload
}
export async function guardExpertIntakeToolCall(input: Dependencies & { toolName: string; input?: unknown; agentId?: string }): Promise<void> {
  const env = input.env ?? process.env
  if (getJiangxiaEnvValue('EXPERT_TEMPLATE_FILL_DELIVERY', env) !== 'cli-only') return
  await requestExpertIntake('intake-admission', { toolName: input.toolName, input: input.input, agentId: input.agentId }, input)
}
