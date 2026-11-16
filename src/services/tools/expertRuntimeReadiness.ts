import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { buildClaudeCliArgs, resolveClaudeCliLauncher } from '../../utils/desktopBundledCli.js'
import { getJiangxiaEnvValue } from '../../utils/appIdentity.js'

const execute = promisify(execFile)
type Input = {
  tools: readonly { name: string; isEnabled: () => boolean }[]
  agentId?: string
  env?: NodeJS.ProcessEnv
  execPath?: string
  run?: (argv: string[], env: NodeJS.ProcessEnv) => Promise<boolean>
}

export class ExpertRuntimeReadinessError extends Error {
  constructor(readonly code: string, message: string) {
    super(`${code}: ${message}`)
    this.name = 'ExpertRuntimeReadinessError'
  }
}

/** Check inside the actual CLI, where browser availability is authoritative.
 * No persisted status is introduced: retrying the same session rechecks readiness.
 */
export async function assertExpertRuntimeReadiness(input: Input): Promise<void> {
  const env = input.env ?? process.env
  if (input.agentId || getJiangxiaEnvValue('EXPERT_TEMPLATE_FILL_DELIVERY', env) !== 'cli-only') return
  const enabled = new Set(input.tools.filter(tool => tool.isEnabled()).map(tool => tool.name))
  if (!enabled.has('Playwright')) {
    throw new ExpertRuntimeReadinessError('EXPERT_RUNTIME_BROWSER_UNAVAILABLE',
      '内置浏览器当前不可用，调研尚未开始或已暂停；已有材料保留。请检查 App 的浏览器运行组件，恢复后在原会话重试。不会继续生成缺少浏览取证的报告。')
  }
  const launcher = resolveClaudeCliLauncher({ cliPath: env.CLAUDE_CLI_PATH, execPath: input.execPath })
  const unavailable = () => new ExpertRuntimeReadinessError('EXPERT_RUNTIME_CLI_UNAVAILABLE',
    '固定模板报告 CLI 当前不可用，执行已暂停；已有材料保留。请检查 App 的内置命令和会话连接，恢复后在原会话重试。不会试探其他命令、使用 Write 生成 HTML 或自动重做调研。')
  const sessionId = getJiangxiaEnvValue('EXPERT_SESSION_ID', env)?.trim()
  if ((!enabled.has('Bash') && !enabled.has('PowerShell')) || !launcher || !sessionId) throw unavailable()
  const argv = buildClaudeCliArgs(launcher, ['expert-template-fill', '--schema', '--session-id', sessionId], env.CLAUDE_APP_ROOT)
  const run = input.run ?? (async (args: string[], childEnv: NodeJS.ProcessEnv) => {
    await execute(args[0]!, args.slice(1), { env: childEnv, timeout: 10_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true })
    return true
  })
  try {
    if (!await run(argv, env)) throw unavailable()
  } catch {
    // Do not forward subprocess stderr: it may contain config, tokens or paths.
    throw unavailable()
  }
}
