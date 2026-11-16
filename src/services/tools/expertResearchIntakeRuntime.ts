import { getJiangxiaEnvValue } from '../../utils/appIdentity.js'
import { isExpertIntakeLocalTool } from '../../utils/expertResearchIntakePolicy.js'
import { expertLocalRequest } from './expertLocalTransport.js'
type Dependencies = { env?: NodeJS.ProcessEnv; fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>; timeoutMs?: number }
export async function requestExpertIntake(action: string, body: unknown, deps: Dependencies = {}): Promise<any> {
  const env = deps.env ?? process.env
  const server = getJiangxiaEnvValue('DESKTOP_SERVER_URL', env)?.trim()
  const session = getJiangxiaEnvValue('EXPERT_SESSION_ID', env)?.trim()
  if (!server || !session) throw new Error('EXPERT_INTAKE_UNAVAILABLE: Expert session identity is unavailable.')
  let response: Response
  let payload: any
  let phase = 'request'
  try {
    const retry = action === 'intake-admission' || (action === 'scope-assessment' && (body as { action?: unknown } | null)?.action === 'inspect')
    const timeoutMs = deps.timeoutMs ?? 10_000
    const signal = AbortSignal.timeout(timeoutMs * (retry ? 2 : 1))
    response = await expertLocalRequest(`${server}/api/sessions/${encodeURIComponent(session)}/expert/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal }, { fetchImpl: deps.fetchImpl, retry, timeoutMs })
    phase = 'response-json'
    payload = await response.json()
  } catch (error) {
    const failure = error as { name?: string; code?: string; cause?: { code?: string } }
    const rawCode = failure?.cause?.code ?? failure?.code ?? failure?.name
    const code = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'AbortError', 'TimeoutError', 'SyntaxError', 'TypeError'].includes(rawCode ?? '') ? rawCode : 'LOCAL_REQUEST_FAILED'
    throw new Error('EXPERT_INTAKE_UNAVAILABLE: Local scope confirmation failed; phase=' + phase + '; cause=' + code + '. Saved user answers remain stored. Retry scope inspect in this same session; if the host returns clear/delegated and requiresAssessment=false, reuse its confirmed decisions and continue. Do not ask answered questions again or claim the question was not delivered. Research remains blocked until actual host admission succeeds.')
  }
  if (!response.ok) throw new Error(payload?.message ?? payload?.error?.message ?? 'EXPERT_INTAKE_REQUIRED: Resolve the current user-owned scope decision.')
  return payload
}
export async function guardExpertIntakeToolCall(input: Dependencies & { toolName: string; input?: unknown; agentId?: string }): Promise<void> {
  const env = input.env ?? process.env
  if (getJiangxiaEnvValue('EXPERT_TEMPLATE_FILL_DELIVERY', env) !== 'cli-only') return
  if (isExpertIntakeLocalTool(input.toolName)) return
  const result = await requestExpertIntake('intake-admission', { toolName: input.toolName, input: input.input, agentId: input.agentId }, input)
  if (result?.allowed !== true) throw new Error('EXPERT_INTAKE_UNAVAILABLE: The host did not confirm admission. Preserve saved answers, inspect scope and retry admission; do not repeat answered questions.')
}
