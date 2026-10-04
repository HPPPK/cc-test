import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'
import { PlaywrightTool } from './PlaywrightTool.js'
import * as nodeBridge from './nodeBridge.js'
import * as runtime from './runtime.js'

const envKeys = ['CC_JIANGXIA', 'CC_HAHA'].flatMap(prefix => [
  'UIUX_IMAGE_ONLY_DELIVERY',
  'EXPERT_PLAYWRIGHT_CDP_ENDPOINT',
  'EXPERT_MANAGED_PLAYWRIGHT_PRESENTATION',
  'EXPERT_FORCE_VISIBLE_PLAYWRIGHT',
  'EXPERT_BROWSER_HUMAN_VERIFICATION_HANDOFF',
  'EXPERT_SHARED_PLAYWRIGHT_SESSION_ID',
  'EXPERT_SESSION_ID',
  'DESKTOP_SERVER_URL',
].map(suffix => prefix + '_' + suffix))
let savedEnv: Map<string, string | undefined>

const managedExecutable = 'C:/test-runtime/chrome.exe'
const pageResult = {
  url: 'https://example.com/pricing',
  title: 'Pricing',
  text: 'Public pricing evidence',
  links: [],
  steps: [{ index: 0, type: 'navigate' as const, outcome: 'success' as const, url: 'https://example.com/pricing' }],
  accessLimited: false,
}
const input = () => PlaywrightTool.inputSchema.parse({
  actions: [{ type: 'navigate', url: pageResult.url }, { type: 'extract' }],
  visible: false,
})
const context = (agentId?: string) => ({ agentId, abortController: new AbortController() }) as never

function expertEnvironment() {
  process.env.CC_JIANGXIA_EXPERT_SHARED_PLAYWRIGHT_SESSION_ID = 'research-session'
  process.env.CC_JIANGXIA_EXPERT_MANAGED_PLAYWRIGHT_PRESENTATION = 'assistable_background'
  process.env.CC_JIANGXIA_EXPERT_BROWSER_HUMAN_VERIFICATION_HANDOFF = '1'
}

beforeEach(() => {
  savedEnv = new Map(envKeys.map(key => [key, process.env[key]]))
  for (const key of envKeys) delete process.env[key]
  spyOn(runtime, 'isPlaywrightRuntimeInstalled').mockReturnValue(true)
  spyOn(runtime, 'isPlaywrightRuntimeAvailable').mockReturnValue(true)
  spyOn(runtime, 'resolvePlaywrightExecutablePath').mockReturnValue(managedExecutable)
  spyOn(nodeBridge, 'isPlaywrightNodeBridgeAvailable').mockReturnValue(true)
})

afterEach(() => {
  mock.restore()
  for (const [key, value] of savedEnv) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe('PlaywrightTool validation and execution mode', () => {
  test('ordinary chat validates and reaches the managed runner without UIUX settings', async () => {
    const runner = spyOn(nodeBridge, 'runPlaywrightWithNodeBridge').mockResolvedValue(pageResult)
    const request = input()
    await expect(PlaywrightTool.validateInput(request)).resolves.toEqual({ result: true })
    const result = await PlaywrightTool.call(request, context())
    expect(result.data.text).toBe(pageResult.text)
    expect(runner).toHaveBeenCalledTimes(1)
    expect(runner.mock.calls[0]?.[1]).toMatchObject({ executablePath: managedExecutable, visible: false, slowMoMs: 350 })
    expect(runner.mock.calls[0]?.[1].connection).toBeUndefined()
  })

  test('all three research agents retain a headed shared browser and human verification', async () => {
    expertEnvironment()
    const runner = spyOn(nodeBridge, 'runPlaywrightWithNodeBridge').mockResolvedValue(pageResult)
    for (const agentId of ['competitors', 'user-needs', 'channels']) {
      const request = input()
      await expect(PlaywrightTool.validateInput(request)).resolves.toEqual({ result: true })
      expect((await PlaywrightTool.call(request, context(agentId))).data.text).toBe(pageResult.text)
    }
    expect(runner).toHaveBeenCalledTimes(3)
    expect(new Set(runner.mock.calls.map(call => call[0])).size).toBe(3)
    for (const [, request] of runner.mock.calls) {
      expect(request).toMatchObject({
        executablePath: managedExecutable,
        sharedContextKey: 'expert:research-session',
        visible: true,
        presentation: 'assistable_background',
        preserveHumanVerificationPage: true,
      })
      expect(request.connection).toBeUndefined()
    }
  })

  test('non-UIUX CDP sessions can validate and run without managed Chromium', async () => {
    expertEnvironment()
    process.env.CC_JIANGXIA_EXPERT_PLAYWRIGHT_CDP_ENDPOINT = 'http://127.0.0.1:9222'
    spyOn(runtime, 'isPlaywrightRuntimeInstalled').mockReturnValue(false)
    spyOn(runtime, 'isPlaywrightRuntimeAvailable').mockReturnValue(false)
    spyOn(runtime, 'resolvePlaywrightExecutablePath').mockReturnValue(null)
    const runner = spyOn(nodeBridge, 'runPlaywrightWithNodeBridge').mockResolvedValue(pageResult)
    await expect(PlaywrightTool.validateInput(input())).resolves.toEqual({ result: true })
    await PlaywrightTool.call(input(), context('competitors'))
    expect(runner.mock.calls[0]?.[1]).toMatchObject({
      connection: { kind: 'cdp', endpoint: 'http://127.0.0.1:9222' },
      preserveHumanVerificationPage: true,
    })
    expect(runner.mock.calls[0]?.[1].executablePath).toBeUndefined()
  })

  test.each(['http://127.0.0.1:9222', 'https://remote.example:9222'])('UIUX validation ignores inherited CDP endpoint %s and uses its managed runtime', async endpoint => {
    process.env.CC_JIANGXIA_UIUX_IMAGE_ONLY_DELIVERY = '1'
    process.env.CC_JIANGXIA_EXPERT_PLAYWRIGHT_CDP_ENDPOINT = endpoint
    await expect(PlaywrightTool.validateInput(input())).resolves.toEqual({ result: true })
  })

  test.each(['http://127.0.0.1:9222', 'https://remote.example:9222'])('UIUX execution also ignores inherited CDP endpoint %s', async endpoint => {
    expertEnvironment()
    process.env.CC_JIANGXIA_UIUX_IMAGE_ONLY_DELIVERY = '1'
    process.env.CC_JIANGXIA_EXPERT_PLAYWRIGHT_CDP_ENDPOINT = endpoint
    const runner = spyOn(nodeBridge, 'runPlaywrightWithNodeBridge').mockResolvedValue(pageResult)
    const result = await PlaywrightTool.call(input(), context('uiux-research'))
    expect(result.data.text).toBe(pageResult.text)
    expect(runner).toHaveBeenCalledTimes(1)
    expect(runner.mock.calls[0]?.[1]).toMatchObject({
      executablePath: managedExecutable,
      sharedContextKey: 'expert:research-session:uiux-headless',
      visible: false,
      slowMoMs: 0,
      preserveHumanVerificationPage: false,
    })
    expect(runner.mock.calls[0]?.[1].connection).toBeUndefined()
    expect(runner.mock.calls[0]?.[1].presentation).toBeUndefined()
  })

  test('an invalid CDP endpoint remains rejected in validation and execution for other sessions', async () => {
    process.env.CC_JIANGXIA_EXPERT_PLAYWRIGHT_CDP_ENDPOINT = 'https://remote.example:9222'
    const runner = spyOn(nodeBridge, 'runPlaywrightWithNodeBridge').mockResolvedValue(pageResult)
    const validation = await PlaywrightTool.validateInput(input())
    expect(validation).toMatchObject({ result: false, message: expect.stringContaining('not a permitted local CDP endpoint') })
    expect((await PlaywrightTool.call(input(), context())).data.error).toContain('not a permitted local CDP endpoint')
    expect(runner).not.toHaveBeenCalled()
  })

  test('UIUX still requires managed Chromium even if a CDP endpoint was inherited', async () => {
    process.env.CC_JIANGXIA_UIUX_IMAGE_ONLY_DELIVERY = '1'
    process.env.CC_JIANGXIA_EXPERT_PLAYWRIGHT_CDP_ENDPOINT = 'http://127.0.0.1:9222'
    spyOn(runtime, 'isPlaywrightRuntimeInstalled').mockReturnValue(false)
    spyOn(runtime, 'isPlaywrightRuntimeAvailable').mockReturnValue(false)
    spyOn(runtime, 'resolvePlaywrightExecutablePath').mockReturnValue(null)
    const runner = spyOn(nodeBridge, 'runPlaywrightWithNodeBridge').mockResolvedValue(pageResult)
    await expect(PlaywrightTool.validateInput(input())).resolves.toMatchObject({ result: false, message: expect.stringContaining('managed Chromium runtime is not installed') })
    expect((await PlaywrightTool.call(input(), context())).data.error).toContain('managed Playwright Chromium executable is unavailable')
    expect(runner).not.toHaveBeenCalled()
  })

  test('missing Node runner remains a structured validation failure rather than an undefined variable', async () => {
    spyOn(nodeBridge, 'isPlaywrightNodeBridgeAvailable').mockReturnValue(false)
    await expect(PlaywrightTool.validateInput(input())).resolves.toMatchObject({ result: false, message: expect.stringContaining('managed Node runner is not installed') })
  })
})
