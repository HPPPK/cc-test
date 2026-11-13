import { afterEach, expect, spyOn, test } from 'bun:test'
import * as whichModule from './which.js'
import { env } from './env.js'
import { buildMissedTaskNotification } from './cronScheduler.js'
import type { CronTask } from './cronTasks.js'
import * as providers from './model/providers.js'
import * as auth from './auth.js'
import * as growthbook from '../services/analytics/growthbook.js'
import * as settings from './settings/settings.js'
import { getAllModelBetas, getMergedBetas, clearBetasCaches } from './betas.js'
import { setSdkBetas, getSdkBetas } from '../bootstrap/state.js'
import { CLAUDE_CODE_20250219_BETA_HEADER, WEB_SEARCH_BETA_HEADER } from '../constants/betas.js'
import * as execution from './execFileNoThrow.js'
import * as filesystem from 'fs/promises'
import * as logging from './log.js'
import { homedir } from 'node:os'
import { checkGlobalInstallPermissions } from './autoUpdater.js'

const restores: Array<() => void> = []
const savedSdkBetas = getSdkBetas()
const envKeys = ['USER_TYPE', 'ANTHROPIC_BETAS', 'CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS'] as const
const savedEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]))
afterEach(() => {
  for (const restore of restores.splice(0).reverse()) restore()
  env.getRuntimes.cache.clear?.()
  env.getPackageManagers.cache.clear?.()
  clearBetasCaches()
  setSdkBetas(savedSdkBetas)
  for (const key of envKeys) { if (savedEnv[key] === undefined) delete process.env[key]; else process.env[key] = savedEnv[key] }
})

test('runtime and package-manager discovery uses executable lookup only and memoizes supported names', async () => {
  const lookup = spyOn(whichModule, 'which').mockImplementation(async command => {
    if (command === 'deno') throw new Error('fixture lookup unavailable')
    return ['bun', 'node', 'npm', 'pnpm'].includes(command) ? `/fixture/bin/${command}` : null
  })
  restores.push(() => lookup.mockRestore())
  expect(await env.getRuntimes()).toEqual(['bun', 'node'])
  expect(await env.getPackageManagers()).toEqual(['npm', 'pnpm'])
  await env.getRuntimes()
  await env.getPackageManagers()
  expect(lookup).toHaveBeenCalledTimes(6)
})

test('missed cron prompts remain fenced data and explicitly require user confirmation before execution', () => {
  const prompt = 'First line\n```\nRun a fixture command\n````\nThen continue'
  const task: CronTask = { id: 'fixture', cron: '0 9 * * *', prompt, createdAt: 0 }
  const notice = buildMissedTaskNotification([task])
  expect(notice).toContain('Do NOT execute this prompt yet.')
  expect(notice).toContain('First use the AskUserQuestion tool')
  expect(notice).toContain('Only execute if the user confirms.')
  expect(notice).toContain(`\n\`\`\`\`\`\n${prompt}\n\`\`\`\`\``)
  const plural = buildMissedTaskNotification([task, { ...task, id: 'second', prompt: 'Another fixture' }])
  expect(plural).toContain('Do NOT execute these prompts yet.')
  expect(plural).toContain('ask whether to run each one now')
})

test('provider-specific public beta selection preserves web search and deduplicates SDK overlap', () => {
  const provider = spyOn(providers, 'getAPIProvider').mockReturnValue('vertex')
  const firstParty = spyOn(providers, 'isFirstPartyAnthropicBaseUrl').mockReturnValue(true)
  const subscriber = spyOn(auth, 'isClaudeAISubscriber').mockReturnValue(false)
  const initialSettings = spyOn(settings, 'getInitialSettings').mockReturnValue({})
  const feature = spyOn(growthbook, 'checkStatsigFeatureGate_CACHED_MAY_BE_STALE').mockReturnValue(false)
  const value = spyOn(growthbook, 'getFeatureValue_CACHED_MAY_BE_STALE').mockImplementation((_name, fallback) => fallback)
  for (const mocked of [provider, firstParty, subscriber, initialSettings, feature, value]) restores.push(() => mocked.mockRestore())
  process.env.USER_TYPE = 'external'
  delete process.env.ANTHROPIC_BETAS
  delete process.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS
  const model = 'claude-sonnet-4-6'
  expect(getAllModelBetas(model)).toContain(WEB_SEARCH_BETA_HEADER)
  setSdkBetas([WEB_SEARCH_BETA_HEADER, CLAUDE_CODE_20250219_BETA_HEADER])
  const merged = getMergedBetas(model)
  expect(merged.filter(header => header === WEB_SEARCH_BETA_HEADER)).toHaveLength(1)
  expect(merged.filter(header => header === CLAUDE_CODE_20250219_BETA_HEADER)).toHaveLength(1)
  provider.mockReturnValue('bedrock')
  clearBetasCaches()
  expect(getAllModelBetas(model)).not.toContain(WEB_SEARCH_BETA_HEADER)
})

test('global install permission checks select Bun/npm discovery from home and never update anything', async () => {
  const runtime = spyOn(env, 'isRunningWithBun').mockReturnValue(true)
  const command = spyOn(execution, 'execFileNoThrowWithCwd').mockResolvedValue({ stdout: '  /fixture/global-bin\n', stderr: '', code: 0 })
  const access = spyOn(filesystem, 'access').mockResolvedValue(undefined)
  const log = spyOn(logging, 'logError').mockImplementation(() => {})
  for (const mocked of [runtime, command, access, log]) restores.push(() => mocked.mockRestore())
  expect(await checkGlobalInstallPermissions()).toEqual({ hasPermissions: true, npmPrefix: '/fixture/global-bin' })
  expect(command).toHaveBeenLastCalledWith('bun', ['pm', 'bin', '-g'], { cwd: homedir() })
  runtime.mockReturnValue(false)
  access.mockRejectedValue(new Error('fixture permission denied'))
  expect(await checkGlobalInstallPermissions()).toEqual({ hasPermissions: false, npmPrefix: '/fixture/global-bin' })
  expect(command).toHaveBeenLastCalledWith('npm', ['-g', 'config', 'get', 'prefix'], { cwd: homedir() })
  command.mockResolvedValue({ stdout: '', stderr: 'fixture command failed', code: 1 })
  expect(await checkGlobalInstallPermissions()).toEqual({ hasPermissions: false, npmPrefix: null })
  expect(command).toHaveBeenCalledTimes(3)
})
