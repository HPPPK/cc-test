import { getSessionId } from '../../bootstrap/state.js'
import { closePlaywrightBrowserSession } from '../../tools/PlaywrightTool/nodeBridge.js'
import { resolvePlaywrightSessionKey } from '../../tools/PlaywrightTool/PlaywrightTool.js'

function isEnabled(env: NodeJS.ProcessEnv): boolean {
  return env.CC_JIANGXIA_EXPERT_CLOSE_PLAYWRIGHT_WHEN_AGENT_DONE === '1'
    || env.CC_HAHA_EXPERT_CLOSE_PLAYWRIGHT_WHEN_AGENT_DONE === '1'
}

/**
 * Expert-only lifecycle cleanup. The normal Playwright tool remains reusable;
 * a package must explicitly opt in before a completed delegated agent closes
 * its own isolated browser context.
 */
export async function closeCompletedExpertAgentPlaywrightBrowser(
  agentId: string,
  options: {
    env?: NodeJS.ProcessEnv
    rootSessionId?: string
    closeSession?: (sessionKey: string) => Promise<void>
  } = {},
): Promise<boolean> {
  const env = options.env ?? process.env
  if (!agentId || !isEnabled(env)) return false

  const sessionKey = resolvePlaywrightSessionKey(
    { agentId },
    { rootSessionId: options.rootSessionId ?? getSessionId() },
  )
  await (options.closeSession ?? closePlaywrightBrowserSession)(sessionKey)
  return true
}
