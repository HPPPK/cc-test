import { describe, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { getPlaywrightExecutablePathFromRuntimeDir } from '../../tools/PlaywrightTool/runtime.js'
import {
  ConversationService,
  removeSessionRuntimePromptFile,
  writeSessionRuntimePromptFile,
} from './conversationService.js'

type CliArgBuilder = {
  buildSessionCliArgs(
    sessionId: string,
    sdkUrl: string,
    shouldResume: boolean,
    options?: {
      disallowedTools?: string[]
      expertSystemPrompt?: string
      appendSystemPromptFile?: string
      expertRuntimeActive?: boolean
    },
  ): string[]
}

type ChildEnvBuilder = {
  buildChildEnv(
    workDir: string,
    sdkUrl?: string,
    options?: {
      expertSystemPrompt?: string
      expertSessionId?: string
      expertSharedPlaywrightSessionId?: string
      expertPlaywrightCdpEndpoint?: string
      expertForceVisiblePlaywright?: boolean
      expertBrowserHumanVerificationHandoff?: boolean
      expertBrowserVerificationFallbackSearchEngines?: Array<'Google' | '百度' | 'Bing' | '360'>
      expertClosePlaywrightWhenAgentDone?: boolean
      expertForbidSubagentAskUserQuestion?: boolean
      expertTemplateFillWrite?: boolean
      expertResearchDeliveryPolicy?: {
        questionId: string
        acceptedChoiceId: string
        continueChoiceIds: string[]
        pauseChoiceIds: string[]
      }
      appendSystemPromptFile?: string
      expertRuntimeActive?: boolean
    },
  ): Promise<Record<string, string>>
}

describe('ConversationService expert tool policy', () => {
  test('passes a de-duplicated expert deny list to the spawned CLI', () => {
    const service = new ConversationService() as unknown as CliArgBuilder

    const args = service.buildSessionCliArgs('expert-session', 'ws://127.0.0.1:57420', false, {
      disallowedTools: ['WebFetch', 'WebSearch', 'Bash', 'WebFetch'],
    })

    expect(args).toContain('--disallowed-tools')
    expect(args[args.indexOf('--disallowed-tools') + 1]).toBe('WebFetch,WebSearch,Bash')
  })

  test('passes a full expert runtime through a short hidden prompt-file argument', () => {
    const service = new ConversationService() as unknown as CliArgBuilder
    const expertSystemPrompt = `<expert-runtime>${'template body\n'.repeat(10_000)}</expert-runtime>`
    const promptFile = 'C:\\Temp\\cc-jiangxia-runtime-prompts\\expert-session.md'

    const args = service.buildSessionCliArgs('expert-session', 'ws://127.0.0.1:57420', false, {
      appendSystemPromptFile: promptFile,
    })

    expect(args).toContain('--append-system-prompt-file')
    expect(args[args.indexOf('--append-system-prompt-file') + 1]).toBe(promptFile)
    expect(args).not.toContain('--append-system-prompt')
    expect(args).not.toContain(expertSystemPrompt)
  })

  test('forwards the bundled Playwright runtime to ordinary Desktop CLI sessions', async () => {
    const runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-jiangxia-playwright-child-env-'))
    const nodeExecutable = path.join(runtimeDir, process.platform === 'win32' ? 'node.exe' : 'node')
    const previousRuntimeDir = process.env.CLAUDE_BROWSER_RUNTIME_DIR
    const previousNodeExecutable = process.env.CLAUDE_BUNDLED_NODE_EXECUTABLE

    try {
      await fs.writeFile(nodeExecutable, '')
      process.env.CLAUDE_BROWSER_RUNTIME_DIR = runtimeDir
      process.env.CLAUDE_BUNDLED_NODE_EXECUTABLE = nodeExecutable

      const service = new ConversationService() as unknown as ChildEnvBuilder
      const childEnv = await service.buildChildEnv(process.cwd(), 'ws://127.0.0.1:57420/sdk/test')

      expect(childEnv.CLAUDE_BROWSER_RUNTIME_DIR).toBe(runtimeDir)
      expect(childEnv.CLAUDE_BUNDLED_NODE_EXECUTABLE).toBe(nodeExecutable)
    } finally {
      if (previousRuntimeDir === undefined) delete process.env.CLAUDE_BROWSER_RUNTIME_DIR
      else process.env.CLAUDE_BROWSER_RUNTIME_DIR = previousRuntimeDir
      if (previousNodeExecutable === undefined) delete process.env.CLAUDE_BUNDLED_NODE_EXECUTABLE
      else process.env.CLAUDE_BUNDLED_NODE_EXECUTABLE = previousNodeExecutable
      await fs.rm(runtimeDir, { recursive: true, force: true })
    }
  })

  test('keeps the visual-QA renderer environment when an Expert prompt is moved to a hidden file', async () => {
    const runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-jiangxia-browser-runtime-'))
    const chromiumDir = path.join(runtimeDir, 'chromium-test', 'chrome-win')
    const executable = path.join(chromiumDir, process.platform === 'win32' ? 'chrome.exe' : 'chrome')
    const configDir = path.join(runtimeDir, 'empty-config')
    const previousRuntimeDir = process.env.CLAUDE_BROWSER_RUNTIME_DIR
    const previousConfigDir = process.env.CLAUDE_CONFIG_DIR

    try {
      await fs.mkdir(chromiumDir, { recursive: true })
      await fs.mkdir(configDir, { recursive: true })
      await fs.writeFile(executable, '')
      process.env.CLAUDE_CONFIG_DIR = configDir
      process.env.CLAUDE_BROWSER_RUNTIME_DIR = runtimeDir

      const service = new ConversationService() as unknown as ChildEnvBuilder
      const childEnv = await service.buildChildEnv(process.cwd(), 'ws://127.0.0.1:57420/sdk/test', {
        // This is the launchOptions shape after startSession moved the full
        // prompt to appendSystemPromptFile. The marker must retain the Expert
        // classification for local visual QA.
        appendSystemPromptFile: path.join(runtimeDir, 'expert-runtime.md'),
        expertRuntimeActive: true,
      })

      const expectedExecutable = getPlaywrightExecutablePathFromRuntimeDir(runtimeDir)
      expect(expectedExecutable).toBe(executable)
      expect(childEnv.CC_JIANGXIA_VISUAL_QA_BROWSER_EXECUTABLE).toBe(expectedExecutable)
    } finally {
      if (previousRuntimeDir === undefined) delete process.env.CLAUDE_BROWSER_RUNTIME_DIR
      else process.env.CLAUDE_BROWSER_RUNTIME_DIR = previousRuntimeDir
      if (previousConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR
      else process.env.CLAUDE_CONFIG_DIR = previousConfigDir
      await fs.rm(runtimeDir, { recursive: true, force: true })
    }
  })
  test('forwards a shared Playwright session key only when an Expert explicitly opts in', async () => {
    const service = new ConversationService() as unknown as ChildEnvBuilder
    const ordinaryEnv = await service.buildChildEnv(process.cwd(), 'ws://127.0.0.1:57420/sdk/test')
    const optedInEnv = await service.buildChildEnv(process.cwd(), 'ws://127.0.0.1:57420/sdk/test', {
      expertSharedPlaywrightSessionId: 'expert-session-123',
    })

    expect(ordinaryEnv.CC_JIANGXIA_EXPERT_SHARED_PLAYWRIGHT_SESSION_ID).toBeUndefined()
    expect(ordinaryEnv.CC_HAHA_EXPERT_SHARED_PLAYWRIGHT_SESSION_ID).toBeUndefined()
    expect(optedInEnv.CC_JIANGXIA_EXPERT_SHARED_PLAYWRIGHT_SESSION_ID).toBe('expert-session-123')
    expect(optedInEnv.CC_HAHA_EXPERT_SHARED_PLAYWRIGHT_SESSION_ID).toBe('expert-session-123')
    expect(optedInEnv.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_WRITE).toBeUndefined()
  })
  test('forwards a research-delivery policy only for the active Expert child process', async () => {
    const service = new ConversationService() as unknown as ChildEnvBuilder
    const ordinaryEnv = await service.buildChildEnv(process.cwd(), 'ws://127.0.0.1:57420/sdk/test')
    const expertEnv = await service.buildChildEnv(process.cwd(), 'ws://127.0.0.1:57420/sdk/test', {
      expertSessionId: 'expert-session-123',
      expertResearchDeliveryPolicy: {
        questionId: 'research-delivery:commercialization-report',
        acceptedChoiceId: 'accept_current_scope',
        continueChoiceIds: ['provide_material_and_continue'],
        pauseChoiceIds: ['pause_research'],
      },
    })

    expect(ordinaryEnv.CC_JIANGXIA_EXPERT_RESEARCH_DELIVERY_POLICY).toBeUndefined()
    expect(ordinaryEnv.CC_HAHA_EXPERT_RESEARCH_DELIVERY_POLICY).toBeUndefined()
    expect(JSON.parse(expertEnv.CC_JIANGXIA_EXPERT_RESEARCH_DELIVERY_POLICY ?? '')).toEqual({
      questionId: 'research-delivery:commercialization-report',
      acceptedChoiceId: 'accept_current_scope',
      continueChoiceIds: ['provide_material_and_continue'],
      pauseChoiceIds: ['pause_research'],
    })
    expect(expertEnv.CC_HAHA_EXPERT_RESEARCH_DELIVERY_POLICY).toBe(expertEnv.CC_JIANGXIA_EXPERT_RESEARCH_DELIVERY_POLICY)
  })
  test('forwards browser-verification handoff and delegated-Ask isolation only when an Expert package opts in', async () => {
    const service = new ConversationService() as unknown as ChildEnvBuilder
    const ordinaryEnv = await service.buildChildEnv(process.cwd(), 'ws://127.0.0.1:57420/sdk/test')
    const optedInEnv = await service.buildChildEnv(process.cwd(), 'ws://127.0.0.1:57420/sdk/test', {
      expertSessionId: 'expert-session-123',
      expertBrowserHumanVerificationHandoff: true,
      expertBrowserVerificationFallbackSearchEngines: ['Google', '百度', 'Bing', '360'],
      expertClosePlaywrightWhenAgentDone: true,
      expertForbidSubagentAskUserQuestion: true,
    })

    expect(ordinaryEnv.CC_JIANGXIA_EXPERT_BROWSER_HUMAN_VERIFICATION_HANDOFF).toBeUndefined()
    expect(ordinaryEnv.CC_JIANGXIA_EXPERT_BROWSER_VERIFICATION_FALLBACK_ENGINES).toBeUndefined()
    expect(ordinaryEnv.CC_JIANGXIA_EXPERT_CLOSE_PLAYWRIGHT_WHEN_AGENT_DONE).toBeUndefined()
    expect(ordinaryEnv.CC_JIANGXIA_EXPERT_FORBID_SUBAGENT_ASK_USER_QUESTION).toBeUndefined()
    expect(optedInEnv.CC_JIANGXIA_EXPERT_SESSION_ID).toBe('expert-session-123')
    expect(optedInEnv.CC_JIANGXIA_EXPERT_BROWSER_HUMAN_VERIFICATION_HANDOFF).toBe('1')
    expect(JSON.parse(optedInEnv.CC_JIANGXIA_EXPERT_BROWSER_VERIFICATION_FALLBACK_ENGINES ?? '')).toEqual(['Google', '百度', 'Bing', '360'])
    expect(optedInEnv.CC_HAHA_EXPERT_BROWSER_VERIFICATION_FALLBACK_ENGINES).toBe(optedInEnv.CC_JIANGXIA_EXPERT_BROWSER_VERIFICATION_FALLBACK_ENGINES)
    expect(optedInEnv.CC_JIANGXIA_EXPERT_CLOSE_PLAYWRIGHT_WHEN_AGENT_DONE).toBe('1')
    expect(optedInEnv.CC_JIANGXIA_EXPERT_FORBID_SUBAGENT_ASK_USER_QUESTION).toBe('1')
    expect(optedInEnv.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_WRITE).toBeUndefined()
  })

  test('pins Desktop-managed providers to the local proxy instead of stale alternate cloud routing', async () => {
    const configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-jiangxia-provider-env-'))
    const managedRouteKeys = [
      'CLAUDE_CODE_USE_BEDROCK',
      'CLAUDE_CODE_USE_VERTEX',
      'CLAUDE_CODE_USE_FOUNDRY',
      'CLAUDE_CODE_USE_AZURE_OPENAI',
      'ANTHROPIC_FOUNDRY_RESOURCE',
      'AZURE_OPENAI_BASE_URL',
    ] as const
    const previousEnv = new Map(managedRouteKeys.map((key) => [key, process.env[key]]))
    const previousConfigDir = process.env.CLAUDE_CONFIG_DIR

    try {
      process.env.CLAUDE_CONFIG_DIR = configDir
      for (const key of managedRouteKeys) process.env[key] = 'stale-provider-routing'

      const service = new ConversationService() as unknown as ChildEnvBuilder & {
        providerService: { getProviderRuntimeEnv(providerId: string): Promise<Record<string, string>> }
      }
      service.providerService = {
        async getProviderRuntimeEnv(providerId) {
          expect(providerId).toBe('desktop-provider')
          return {
            ANTHROPIC_BASE_URL: 'http://127.0.0.1:45678/proxy/providers/desktop-provider',
            ANTHROPIC_API_KEY: 'proxy-managed',
            ANTHROPIC_MODEL: 'saved-model',
          }
        },
      }

      const childEnv = await service.buildChildEnv(process.cwd(), 'ws://127.0.0.1:45678/sdk/test', {
        providerId: 'desktop-provider',
        model: 'selected-model',
      })

      expect(childEnv.ANTHROPIC_BASE_URL).toBe('http://127.0.0.1:45678/proxy/providers/desktop-provider')
      expect(childEnv.ANTHROPIC_API_KEY).toBe('proxy-managed')
      expect(childEnv.ANTHROPIC_MODEL).toBe('selected-model')
      expect(childEnv.CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST).toBe('1')
      expect(childEnv.CLAUDE_CODE_USE_BEDROCK).toBe('0')
      expect(childEnv.CLAUDE_CODE_USE_VERTEX).toBe('0')
      expect(childEnv.CLAUDE_CODE_USE_FOUNDRY).toBe('0')
      expect(childEnv.CLAUDE_CODE_USE_AZURE_OPENAI).toBe('0')
      expect(childEnv.ANTHROPIC_FOUNDRY_RESOURCE).toBeUndefined()
      expect(childEnv.AZURE_OPENAI_BASE_URL).toBeUndefined()
    } finally {
      if (previousConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR
      else process.env.CLAUDE_CONFIG_DIR = previousConfigDir
      for (const key of managedRouteKeys) {
        const value = previousEnv.get(key)
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
      await fs.rm(configDir, { recursive: true, force: true })
    }
  })


  test('forwards CDP only when the active Expert session supplied a local authorized endpoint', async () => {
    const service = new ConversationService() as unknown as ChildEnvBuilder
    const ordinaryEnv = await service.buildChildEnv(process.cwd(), 'ws://127.0.0.1:57420/sdk/test')
    expect(ordinaryEnv.CC_JIANGXIA_EXPERT_PLAYWRIGHT_CDP_ENDPOINT).toBeUndefined()
    expect(ordinaryEnv.CC_JIANGXIA_EXPERT_FORCE_VISIBLE_PLAYWRIGHT).toBeUndefined()
    expect(ordinaryEnv.CC_JIANGXIA_EXPERT_MANAGED_PLAYWRIGHT_PRESENTATION).toBeUndefined()

    const expertEnv = await service.buildChildEnv(process.cwd(), 'ws://127.0.0.1:57420/sdk/test', {
      expertPlaywrightCdpEndpoint: 'http://127.0.0.1:9222',
      expertManagedPlaywrightPresentation: 'assistable_background',
      expertForceVisiblePlaywright: true,
    })
    expect(expertEnv.CC_JIANGXIA_EXPERT_PLAYWRIGHT_CDP_ENDPOINT).toBe('http://127.0.0.1:9222')
    expect(expertEnv.CC_JIANGXIA_EXPERT_MANAGED_PLAYWRIGHT_PRESENTATION).toBe('assistable_background')
    expect(expertEnv.CC_JIANGXIA_EXPERT_FORCE_VISIBLE_PLAYWRIGHT).toBe('1')
  })

  test('writes and removes a session-scoped hidden runtime prompt file', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-jiangxia-runtime-prompt-test-'))
    const content = '<expert-runtime>full template and skills</expert-runtime>'

    try {
      const promptFile = await writeSessionRuntimePromptFile('expert-session', content, directory)
      expect(promptFile.startsWith(directory)).toBe(true)
      expect(await fs.readFile(promptFile, 'utf8')).toBe(content)

      await removeSessionRuntimePromptFile(promptFile)
      await expect(fs.access(promptFile)).rejects.toThrow()
    } finally {
      await fs.rm(directory, { recursive: true, force: true })
    }
  })
})
