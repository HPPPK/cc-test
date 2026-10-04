import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { ConversationService } from '../services/conversationService.js'
import { ProviderService } from '../services/providerService.js'
import { resetTerminalShellEnvironmentCacheForTests } from '../../utils/terminalShellEnvironment.js'
import { getPlaywrightRuntimeDir } from '../../tools/PlaywrightTool/runtime.js'

describe('ConversationService', () => {
  let tmpDir: string
  let originalConfigDir: string | undefined
  let originalApiKey: string | undefined
  let originalAuthToken: string | undefined
  let originalBaseUrl: string | undefined
  let originalModel: string | undefined
  let originalEntrypoint: string | undefined
  let originalOAuthToken: string | undefined
  let originalProviderManagedByHost: string | undefined
  let originalDiagnosticsFile: string | undefined
  let originalHome: string | undefined
  let originalPath: string | undefined
  let originalShell: string | undefined
  let originalZdotdir: string | undefined
  let originalDisableTerminalShellEnv: string | undefined
  let originalWorkflowSessionId: string | undefined
  let originalAutoMemoryPathOverride: string | undefined

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-jiangxia-conversation-service-'))
    originalConfigDir = process.env.CLAUDE_CONFIG_DIR
    originalApiKey = process.env.ANTHROPIC_API_KEY
    originalAuthToken = process.env.ANTHROPIC_AUTH_TOKEN
    originalBaseUrl = process.env.ANTHROPIC_BASE_URL
    originalModel = process.env.ANTHROPIC_MODEL
    originalEntrypoint = process.env.CLAUDE_CODE_ENTRYPOINT
    originalOAuthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN
    originalProviderManagedByHost = process.env.CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST
    originalDiagnosticsFile = process.env.CLAUDE_CODE_DIAGNOSTICS_FILE
    originalHome = process.env.HOME
    originalPath = process.env.PATH
    originalShell = process.env.SHELL
    originalZdotdir = process.env.ZDOTDIR
    originalDisableTerminalShellEnv = process.env.CC_JIANGXIA_DISABLE_TERMINAL_SHELL_ENV
    originalWorkflowSessionId = process.env.CC_JIANGXIA_WORKFLOW_SESSION_ID
    originalAutoMemoryPathOverride = process.env.CLAUDE_COWORK_MEMORY_PATH_OVERRIDE

    process.env.CLAUDE_CONFIG_DIR = tmpDir
    process.env.ANTHROPIC_API_KEY = 'stale-parent-api-key'
    process.env.ANTHROPIC_AUTH_TOKEN = 'test-token'
    process.env.ANTHROPIC_BASE_URL = 'https://example.invalid/anthropic'
    process.env.ANTHROPIC_MODEL = 'test-model'
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'inherited-parent-oauth-token'
    // Clear inherited CLAUDE_CODE_ENTRYPOINT so tests can assert whether
    // buildChildEnv injects it or not without interference from the shell env.
    delete process.env.CLAUDE_CODE_ENTRYPOINT
    delete process.env.CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST
    delete process.env.CLAUDE_CODE_DIAGNOSTICS_FILE
    process.env.CC_JIANGXIA_WORKFLOW_SESSION_ID = 'stale-parent-workflow-session'
    process.env.CLAUDE_COWORK_MEMORY_PATH_OVERRIDE = 'C:\\stale-parent-memory\\'
    process.env.CC_JIANGXIA_DISABLE_TERMINAL_SHELL_ENV = '1'
    resetTerminalShellEnvironmentCacheForTests()
  })

  afterEach(async () => {
    if (originalConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR
    else process.env.CLAUDE_CONFIG_DIR = originalConfigDir

    if (originalApiKey === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = originalApiKey

    if (originalAuthToken === undefined) delete process.env.ANTHROPIC_AUTH_TOKEN
    else process.env.ANTHROPIC_AUTH_TOKEN = originalAuthToken

    if (originalBaseUrl === undefined) delete process.env.ANTHROPIC_BASE_URL
    else process.env.ANTHROPIC_BASE_URL = originalBaseUrl

    if (originalModel === undefined) delete process.env.ANTHROPIC_MODEL
    else process.env.ANTHROPIC_MODEL = originalModel

    if (originalEntrypoint === undefined) delete process.env.CLAUDE_CODE_ENTRYPOINT
    else process.env.CLAUDE_CODE_ENTRYPOINT = originalEntrypoint

    if (originalOAuthToken === undefined) delete process.env.CLAUDE_CODE_OAUTH_TOKEN
    else process.env.CLAUDE_CODE_OAUTH_TOKEN = originalOAuthToken

    if (originalProviderManagedByHost === undefined) delete process.env.CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST
    else process.env.CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST = originalProviderManagedByHost

    if (originalDiagnosticsFile === undefined) delete process.env.CLAUDE_CODE_DIAGNOSTICS_FILE
    else process.env.CLAUDE_CODE_DIAGNOSTICS_FILE = originalDiagnosticsFile

    if (originalHome === undefined) delete process.env.HOME
    else process.env.HOME = originalHome

    if (originalPath === undefined) delete process.env.PATH
    else process.env.PATH = originalPath

    if (originalShell === undefined) delete process.env.SHELL
    else process.env.SHELL = originalShell

    if (originalZdotdir === undefined) delete process.env.ZDOTDIR
    else process.env.ZDOTDIR = originalZdotdir

    if (originalDisableTerminalShellEnv === undefined) delete process.env.CC_JIANGXIA_DISABLE_TERMINAL_SHELL_ENV
    else process.env.CC_JIANGXIA_DISABLE_TERMINAL_SHELL_ENV = originalDisableTerminalShellEnv

    if (originalWorkflowSessionId === undefined) delete process.env.CC_JIANGXIA_WORKFLOW_SESSION_ID
    else process.env.CC_JIANGXIA_WORKFLOW_SESSION_ID = originalWorkflowSessionId

    if (originalAutoMemoryPathOverride === undefined) delete process.env.CLAUDE_COWORK_MEMORY_PATH_OVERRIDE
    else process.env.CLAUDE_COWORK_MEMORY_PATH_OVERRIDE = originalAutoMemoryPathOverride

    resetTerminalShellEnvironmentCacheForTests()
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  async function writeFakeZsh(filePath: string) {
    await fs.writeFile(
      filePath,
      [
        '#!/bin/sh',
        'command=',
        'while [ "$#" -gt 0 ]; do',
        '  if [ "$1" = "-c" ]; then',
        '    shift',
        '    command="$1"',
        '    break',
        '  fi',
        '  shift',
        'done',
        'if [ -f "$HOME/.zshrc" ]; then',
        '  . "$HOME/.zshrc" </dev/null >/dev/null 2>/dev/null || true',
        'fi',
        'exec /bin/sh -c "$command"',
        '',
      ].join('\n'),
      { mode: 0o755 },
    )
  }

  test('buildUserContent sends uploaded image data as a multimodal image block', () => {
    const service = new ConversationService() as any
    const imageData = Buffer.from('screenshot-bytes').toString('base64')

    const content = service.buildUserContent('Inspect this screenshot', 'vision-session', [{
      type: 'image',
      name: 'checkout.png',
      mimeType: 'image/png',
      data: `data:image/png;base64,${imageData}`,
    }]) as Array<Record<string, unknown>>

    expect(content).toEqual([
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: imageData,
        },
      },
      { type: 'text', text: 'Inspect this screenshot' },
    ])
  })

  test('buildUserContent reads path-only PNG attachments as multimodal images', async () => {
    const service = new ConversationService() as any
    const imagePath = path.join(tmpDir, 'native-screenshot.png')
    const imageData = Buffer.from('native-screenshot-bytes')
    await fs.writeFile(imagePath, imageData)

    const content = service.buildUserContent('Review the image', 'vision-session', [{
      type: 'file',
      name: 'native-screenshot.png',
      path: imagePath,
    }]) as Array<Record<string, unknown>>

    expect(content).toEqual([
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: imageData.toString('base64'),
        },
      },
      { type: 'text', text: 'Review the image' },
    ])
  })

  test('buildUserContent keeps non-image files as local path references', async () => {
    const service = new ConversationService() as any
    const filePath = path.join(tmpDir, 'notes.txt')
    await fs.writeFile(filePath, 'notes')

    const content = service.buildUserContent('Read this file', 'file-session', [{
      type: 'file',
      name: 'notes.txt',
      path: filePath,
    }]) as Array<Record<string, unknown>>

    expect(content).toEqual([
      { type: 'text', text: `@"${filePath}" Read this file` },
    ])
  })

  test('buildUserContent never creates an image block from malformed image data', () => {
    const service = new ConversationService() as any

    const content = service.buildUserContent('Use the valid prompt text', 'broken-image-session', [{
      type: 'image',
      name: 'broken.png',
      mimeType: 'image/png',
      data: 'data:image/png;base64,not-valid-base64!',
    }]) as Array<Record<string, unknown>>

    expect(content).toEqual([
      { type: 'text', text: 'Use the valid prompt text' },
    ])
  })

  test('keeps inherited provider env when no desktop provider config exists', async () => {
    const service = new ConversationService() as any
    const env = (await service.buildChildEnv('D:\\workspace\\code\\myself_code\\cc-jiangxia')) as Record<string, string>

    expect(env.ANTHROPIC_AUTH_TOKEN).toBe('test-token')
    expect(env.ANTHROPIC_BASE_URL).toBe('https://example.invalid/anthropic')
    expect(env.ANTHROPIC_MODEL).toBe('test-model')
    expect(env.CLAUDE_CODE_DIAGNOSTICS_FILE).toBe(path.join(tmpDir, 'cc-jiangxia', 'diagnostics', 'cli-diagnostics.jsonl'))
    expect(env.CLAUDE_COWORK_MEMORY_PATH_OVERRIDE).toBe(
      `${path.join(tmpDir, 'projects', 'D--workspace-code-myself-code-cc-jiangxia', 'memory')}${path.sep}`,
    )
    await expect(fs.stat(path.dirname(env.CLAUDE_CODE_DIAGNOSTICS_FILE))).resolves.toBeTruthy()
  })

  test('buildChildEnv pins desktop memory to the current sanitized project directory', async () => {
    const service = new ConversationService() as any
    const workDir = path.join(tmpDir, 'workspace', 'myself_code', 'claude-code-jiangxia')
    await fs.mkdir(workDir, { recursive: true })

    const env = (await service.buildChildEnv(workDir)) as Record<string, string>

    expect(env.CLAUDE_COWORK_MEMORY_PATH_OVERRIDE).toBe(
      `${path.join(tmpDir, 'projects', sanitizeMemoryPath(workDir), 'memory')}${path.sep}`,
    )
    expect(env.CLAUDE_COWORK_MEMORY_PATH_OVERRIDE).toContain('myself-code')
    expect(env.CLAUDE_COWORK_MEMORY_PATH_OVERRIDE).not.toContain('myself_code')
  })

  test('buildChildEnv inherits exported terminal shell variables for desktop CLI sessions', async () => {
    const shellPath = path.join(tmpDir, 'zsh')
    const nodeBin = path.join(tmpDir, 'node-bin')
    const nvmDir = path.join(tmpDir, '.nvm')
    await fs.mkdir(nodeBin, { recursive: true })
    await fs.mkdir(nvmDir, { recursive: true })
    await writeFakeZsh(shellPath)
    await fs.writeFile(
      path.join(tmpDir, '.zshrc'),
      [
        `export NVM_DIR="${nvmDir}"`,
        `export PATH="${nodeBin}:$PATH"`,
        '',
      ].join('\n'),
    )

    delete process.env.CC_JIANGXIA_DISABLE_TERMINAL_SHELL_ENV
    process.env.HOME = tmpDir
    process.env.SHELL = shellPath
    process.env.PATH = '/usr/bin:/bin'
    delete process.env.ZDOTDIR
    resetTerminalShellEnvironmentCacheForTests()

    const service = new ConversationService() as any
    const env = (await service.buildChildEnv(tmpDir)) as Record<string, string>

    expect(env.NVM_DIR).toBe(nvmDir)
    expect(env.PATH.split(path.delimiter)[0]).toBe(nodeBin)
    expect(env.PATH.split(path.delimiter)).toContain('/usr/bin')
  })

  test('strips inherited provider env when desktop provider config exists', async () => {
    const ccJiangxiaDir = path.join(tmpDir, 'cc-jiangxia')
    await fs.mkdir(ccJiangxiaDir, { recursive: true })
    await fs.writeFile(
      path.join(ccJiangxiaDir, 'providers.json'),
      JSON.stringify({ activeId: null, providers: [] }),
      'utf-8',
    )

    const service = new ConversationService() as any
    const env = (await service.buildChildEnv('D:\\workspace\\code\\myself_code\\cc-jiangxia')) as Record<string, string>

    expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined()
    expect(env.ANTHROPIC_BASE_URL).toBeUndefined()
    expect(env.ANTHROPIC_MODEL).toBeUndefined()
  })

  test('buildChildEnv injects CLAUDE_CODE_OAUTH_TOKEN when official mode + Jiangxia oauth token exists', async () => {
    const ccJiangxiaDir = path.join(tmpDir, 'cc-jiangxia')
    await fs.mkdir(ccJiangxiaDir, { recursive: true })
    await fs.writeFile(
      path.join(ccJiangxiaDir, 'settings.json'),
      JSON.stringify({ env: {} }),
      'utf-8',
    )

    const { jiangxiaOAuthService } = await import('../services/jiangxiaOAuthService.js')
    await jiangxiaOAuthService.saveTokens({
      accessToken: 'jiangxia-fresh-token',
      refreshToken: 'jiangxia-refresh-xxx',
      expiresAt: Date.now() + 30 * 60_000,
      scopes: ['user:inference'],
      subscriptionType: 'max',
    })

    const service = new ConversationService() as any
    const env = (await service.buildChildEnv('/tmp')) as Record<string, string>

    expect(env.CLAUDE_CODE_ENTRYPOINT).toBe('claude-desktop')
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe('jiangxia-fresh-token')
  })

  test('buildChildEnv does NOT inject CLAUDE_CODE_OAUTH_TOKEN when not official mode', async () => {
    const ccJiangxiaDir = path.join(tmpDir, 'cc-jiangxia')
    await fs.mkdir(ccJiangxiaDir, { recursive: true })
    await fs.writeFile(
      path.join(ccJiangxiaDir, 'settings.json'),
      JSON.stringify({ env: { ANTHROPIC_AUTH_TOKEN: 'custom-provider-token' } }),
      'utf-8',
    )

    const { jiangxiaOAuthService } = await import('../services/jiangxiaOAuthService.js')
    await jiangxiaOAuthService.saveTokens({
      accessToken: 'jiangxia-token-should-not-be-used',
      refreshToken: null,
      expiresAt: null,
      scopes: [],
      subscriptionType: null,
    })

    const service = new ConversationService() as any
    const env = (await service.buildChildEnv('/tmp')) as Record<string, string>

    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined()
    expect(env.CLAUDE_CODE_ENTRYPOINT).toBeUndefined()
  })

  test('buildChildEnv injects explicit provider runtime env for session-scoped providers', async () => {
    const providerService = new ProviderService()
    const provider = await providerService.addProvider({
      presetId: 'custom',
      name: 'Packy',
      apiKey: 'provider-key',
      baseUrl: 'https://api.packy.example',
      apiFormat: 'openai_chat',
      models: {
        main: 'kimi-k2.6',
        haiku: '',
        sonnet: '',
        opus: '',
      },
    })

    const service = new ConversationService() as any
    const env = (await service.buildChildEnv('/tmp', undefined, {
      providerId: provider.id,
    })) as Record<string, string>

    expect(env.ANTHROPIC_BASE_URL).toBe(`http://127.0.0.1:3456/proxy/providers/${provider.id}`)
    expect(env.ANTHROPIC_API_KEY).toBe('proxy-managed')
    expect(env.ANTHROPIC_MODEL).toBe('kimi-k2.6')
    expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('kimi-k2.6')
    expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('kimi-k2.6')
    expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('kimi-k2.6')
    expect(env.CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST).toBe('1')
    expect(env.CC_JIANGXIA_PROVIDER_ID).toBe(provider.id)
    expect(env.CC_HAHA_PROVIDER_ID).toBe(provider.id)
    expect(env.CLAUDE_CODE_ENTRYPOINT).toBeUndefined()
  })

  test('buildChildEnv uses the session-selected model for session-scoped providers', async () => {
    const providerService = new ProviderService()
    const provider = await providerService.addProvider({
      presetId: 'custom',
      name: 'Switchable',
      apiKey: 'provider-key',
      baseUrl: 'https://api.switchable.example',
      apiFormat: 'openai_chat',
      models: {
        main: 'old-provider-main',
        haiku: 'new-provider-haiku',
        sonnet: 'new-provider-sonnet',
        opus: 'new-provider-opus',
      },
    })

    const service = new ConversationService() as any
    const env = (await service.buildChildEnv('/tmp', undefined, {
      providerId: provider.id,
      model: 'new-provider-sonnet',
    })) as Record<string, string>

    expect(env.ANTHROPIC_BASE_URL).toBe(`http://127.0.0.1:3456/proxy/providers/${provider.id}`)
    expect(env.ANTHROPIC_MODEL).toBe('new-provider-sonnet')
  })

  test('buildChildEnv clears stale api key for bearer-token providers', async () => {
    const providerService = new ProviderService()
    const provider = await providerService.addProvider({
      presetId: 'jiekouai',
      name: 'Jiekou',
      apiKey: 'provider-key',
      baseUrl: 'https://api.jiekou.ai/anthropic',
      apiFormat: 'anthropic',
      models: {
        main: 'claude-sonnet-4-6',
        haiku: 'claude-haiku-4-5-20251001',
        sonnet: 'claude-sonnet-4-6',
        opus: 'claude-opus-4-7',
      },
    })

    const service = new ConversationService() as any
    const env = (await service.buildChildEnv('/tmp', undefined, {
      providerId: provider.id,
      model: 'claude-sonnet-4-6',
    })) as Record<string, string>

    expect(env.ANTHROPIC_BASE_URL).toBe('https://api.jiekou.ai/anthropic')
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe('provider-key')
    expect(env.ANTHROPIC_API_KEY).toBe('')
    expect(env.ANTHROPIC_MODEL).toBe('claude-sonnet-4-6')
    expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL_SUPPORTED_CAPABILITIES).toBe('none')
  })

  test('buildChildEnv can force official auth even when a custom default provider exists', async () => {
    const ccJiangxiaDir = path.join(tmpDir, 'cc-jiangxia')
    await fs.mkdir(ccJiangxiaDir, { recursive: true })
    await fs.writeFile(
      path.join(ccJiangxiaDir, 'settings.json'),
      JSON.stringify({ env: { ANTHROPIC_AUTH_TOKEN: 'custom-provider-token' } }),
      'utf-8',
    )

    const { jiangxiaOAuthService } = await import('../services/jiangxiaOAuthService.js')
    await jiangxiaOAuthService.saveTokens({
      accessToken: 'forced-official-token',
      refreshToken: 'forced-official-refresh',
      expiresAt: Date.now() + 30 * 60_000,
      scopes: ['user:inference'],
      subscriptionType: 'max',
    })

    const service = new ConversationService() as any
    const env = (await service.buildChildEnv('/tmp', undefined, {
      providerId: null,
    })) as Record<string, string>

    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
    expect(env.CLAUDE_CODE_ENTRYPOINT).toBe('claude-desktop')
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe('forced-official-token')
  })

  test('buildChildEnv does not leak inherited CLAUDE_CODE_OAUTH_TOKEN when official token is unavailable', async () => {
    const ccJiangxiaDir = path.join(tmpDir, 'cc-jiangxia')
    await fs.mkdir(ccJiangxiaDir, { recursive: true })
    await fs.writeFile(
      path.join(ccJiangxiaDir, 'settings.json'),
      JSON.stringify({ env: {} }),
      'utf-8',
    )

    const service = new ConversationService() as any
    const env = (await service.buildChildEnv('/tmp')) as Record<string, string>

    expect(env.CLAUDE_CODE_ENTRYPOINT).toBe('claude-desktop')
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined()
  })

  test('buildChildEnv injects desktop Computer Use host bundle id for sdk sessions', async () => {
    const service = new ConversationService() as any
    const env = (await service.buildChildEnv(
      '/tmp',
      'ws://127.0.0.1:3456/sdk/test-session?token=test-token',
    )) as Record<string, string>

    expect(env.CC_JIANGXIA_COMPUTER_USE_HOST_BUNDLE_ID).toBe(
      'com.claude-code-jiangxia.desktop',
    )
    expect(env.CC_JIANGXIA_DESKTOP_SERVER_URL).toBe('http://127.0.0.1:3456')
    expect(env.CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING).toBe('1')
  })

  test('passes a template-fill Expert session ID only to the desktop SDK child environment', async () => {
    const service = new ConversationService() as any
    const env = (await service.buildChildEnv(
      '/tmp',
      'ws://127.0.0.1:3456/sdk/test-session?token=test-token',
      {
        expertSessionId: 'template-fill-session',
        expertTemplateFillWrite: true,
      },
    )) as Record<string, string>

    expect(env.CC_JIANGXIA_EXPERT_SESSION_ID).toBe('template-fill-session')
    expect(env.CC_HAHA_EXPERT_SESSION_ID).toBe('template-fill-session')
    expect(env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_WRITE).toBe('1')
    expect(env.CC_HAHA_EXPERT_TEMPLATE_FILL_WRITE).toBe('1')
  })

  test('passes an opted-in Expert template-fill output root only to the desktop SDK child environment', async () => {
    const service = new ConversationService() as any
    const env = (await service.buildChildEnv(
      'C:\session\selected',
      'ws://127.0.0.1:3456/sdk/test-session?token=test-token',
      {
        expertSessionId: 'template-fill-session',
        expertTemplateFillWrite: true,
        expertTemplateFillOutputRoot: 'C:\session\selected',
      },
    )) as Record<string, string>

    expect(env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT).toBe('C:\session\selected')
    expect(env.CC_HAHA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT).toBe('C:\session\selected')
  })

  test('reports SDK connection authorization status reasons', () => {
    const service = new ConversationService() as any
    service.sessions.set('sdk-test-session', {
      proc: { kill() {}, exited: Promise.resolve(0) },
      outputCallbacks: [],
      workDir: tmpDir,
      permissionMode: 'default',
      sdkToken: 'expected-token',
      sdkSocket: null,
      pendingOutbound: [],
      startupPending: false,
      startupExitCode: null,
      stdoutLines: [],
      stderrLines: [],
      outputDrain: Promise.resolve(),
      sdkMessages: [],
      initMessage: null,
      pendingPermissionRequests: new Map(),
    })

    expect(service.getSdkConnectionAuthStatus('missing-session', 'expected-token')).toEqual({
      authorized: false,
      reason: 'session-missing',
    })
    expect(service.getSdkConnectionAuthStatus('sdk-test-session', null)).toEqual({
      authorized: false,
      reason: 'token-missing',
    })
    expect(service.getSdkConnectionAuthStatus('sdk-test-session', 'stale-token')).toEqual({
      authorized: false,
      reason: 'token-mismatch',
    })
    expect(service.getSdkConnectionAuthStatus('sdk-test-session', 'expected-token')).toEqual({
      authorized: true,
      reason: 'authorized',
    })
  })

  test('uses bun entrypoint fallback on Windows dev mode', () => {
    const service = new ConversationService() as any
    const args = service.resolveCliArgs(['--print'])

    if (process.platform === 'win32') {
      expect(args[0]).toBe(process.execPath)
      expect(args[1]).toBe('--preload')
      expect(args[2]).toContain('preload.ts')
      expect(args[3]).toContain(path.join('src', 'entrypoints', 'cli.tsx'))
    } else {
      expect(args[0]).toContain(path.join('bin', 'claude-jiangxia'))
    }
  })

  test('buildSessionCliArgs enables partial assistant messages for desktop streaming', () => {
    const service = new ConversationService() as any
    const args = service.buildSessionCliArgs(
      '123e4567-e89b-12d3-a456-426614174000',
      'ws://127.0.0.1:3456/sdk/test-session?token=test-token',
      false,
      { permissionMode: 'bypassPermissions' },
    ) as string[]

    expect(args).toContain('--include-partial-messages')
    expect(args).toContain('--sdk-url')
    expect(args).toContain('--replay-user-messages')
  })

  test('buildSessionCliArgs preserves workflow read-only tool denies in bypass mode', () => {
    const service = new ConversationService() as any
    const args = service.buildSessionCliArgs(
      '123e4567-e89b-12d3-a456-426614174000',
      'ws://127.0.0.1:3456/sdk/test-session?token=test-token',
      false,
      {
        permissionMode: 'bypassPermissions',
        disallowedTools: ['Write', 'Edit', 'MultiEdit', 'Bash', 'PowerShell', 'Agent'],
      },
    ) as string[]

    const denyIndex = args.indexOf('--disallowed-tools')
    expect(denyIndex).toBeGreaterThan(-1)
    expect(args[denyIndex + 1]).toBe('Write,Edit,MultiEdit,Bash,PowerShell,Agent')
    expect(args).toContain('--dangerously-skip-permissions')
  })

  test('buildSessionCliArgs appends the authoritative workflow runtime instruction', () => {
    const service = new ConversationService() as any
    const workflowSystemPrompt = 'Workflow protocol tools are registered for this active runtime binding.'
    const args = service.buildSessionCliArgs(
      '123e4567-e89b-12d3-a456-426614174000',
      'ws://127.0.0.1:3456/sdk/workflow-session?token=test-token',
      false,
      { workflowSessionId: 'workflow-session', workflowSystemPrompt },
    ) as string[]

    const promptIndex = args.indexOf('--append-system-prompt')
    expect(promptIndex).toBeGreaterThan(-1)
    expect(args[promptIndex + 1]).toBe(workflowSystemPrompt)
  })

  test('buildChildEnv passes workflow context to desktop SDK CLI sessions only', async () => {
    const service = new ConversationService() as any
    const sdkEnv = (await service.buildChildEnv(
      '/tmp',
      'ws://127.0.0.1:3456/sdk/workflow-session?token=test-token',
      { workflowSessionId: 'workflow-session' },
    )) as Record<string, string>
    const dialogueEnv = (await service.buildChildEnv('/tmp')) as Record<string, string>

    expect(sdkEnv.CC_JIANGXIA_WORKFLOW_SESSION_ID).toBe('workflow-session')
    expect(sdkEnv.CC_JIANGXIA_DESKTOP_SERVER_URL).toBe('http://127.0.0.1:3456')
    expect(sdkEnv.CLAUDE_COWORK_MEMORY_PATH_OVERRIDE).toBeUndefined()
    expect(dialogueEnv.CC_JIANGXIA_WORKFLOW_SESSION_ID).toBeUndefined()
    expect(dialogueEnv.CLAUDE_COWORK_MEMORY_PATH_OVERRIDE).toBeTruthy()
  })

  test('buildChildEnv gives template-fill Expert sessions this app bundled CLI instead of PATH claude', async () => {
    const service = new ConversationService() as any
    const originalCliPath = process.env.CLAUDE_CLI_PATH
    const originalAppRoot = process.env.CLAUDE_APP_ROOT
    try {
      // In this Bun test process there is no sidecar executable, so this is the
      // development fallback. Packaged desktop runs prefer process.execPath.
      process.env.CLAUDE_CLI_PATH = 'C:\\portable\\claude-sidecar.exe'
      process.env.CLAUDE_APP_ROOT = 'C:\\portable\\app-root'
      resetTerminalShellEnvironmentCacheForTests()

      const env = (await service.buildChildEnv(
        '/tmp',
        'ws://127.0.0.1:3456/sdk/expert-session?token=test-token',
        { expertSessionId: 'expert-session', expertTemplateFillWrite: true },
      )) as Record<string, string>

      expect(env.CLAUDE_CLI_PATH).toBe('C:\\portable\\claude-sidecar.exe')
      expect(env.CLAUDE_APP_ROOT).toBe('C:\\portable\\app-root')
      expect(env.CC_JIANGXIA_EXPERT_SESSION_ID).toBe('expert-session')
      expect(env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_WRITE).toBe('1')
    } finally {
      if (originalCliPath === undefined) delete process.env.CLAUDE_CLI_PATH
      else process.env.CLAUDE_CLI_PATH = originalCliPath
      if (originalAppRoot === undefined) delete process.env.CLAUDE_APP_ROOT
      else process.env.CLAUDE_APP_ROOT = originalAppRoot
      resetTerminalShellEnvironmentCacheForTests()
    }
  })

  test('buildChildEnv exposes the installed Playwright renderer to standard Expert sessions only', async () => {
    const browserExecutable = path.join(
      getPlaywrightRuntimeDir(tmpDir),
      'chromium-test',
      'chrome.exe',
    )
    await fs.mkdir(path.dirname(browserExecutable), { recursive: true })
    await fs.writeFile(browserExecutable, 'placeholder browser executable')

    const service = new ConversationService() as any
    const expertEnv = (await service.buildChildEnv(
      '/tmp',
      'ws://127.0.0.1:3456/sdk/expert-session?token=test-token',
      { expertSystemPrompt: '<expert-runtime />' },
    )) as Record<string, string>
    const ordinaryEnv = (await service.buildChildEnv(
      '/tmp',
      'ws://127.0.0.1:3456/sdk/ordinary-session?token=test-token',
    )) as Record<string, string>

    expect(expertEnv.CC_JIANGXIA_VISUAL_QA_BROWSER_EXECUTABLE).toBe(browserExecutable)
    expect(expertEnv.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_WRITE).toBeUndefined()
    expect(ordinaryEnv.CC_JIANGXIA_VISUAL_QA_BROWSER_EXECUTABLE).toBeUndefined()
  })

  test('buildChildEnv falls back to the Sidecar-bundled visual QA browser for Expert sessions', async () => {
    const bundledRuntimeDir = path.join(tmpDir, 'bundled-browser-runtime')
    const browserExecutable = path.join(
      bundledRuntimeDir,
      'chromium-test',
      'chrome.exe',
    )
    await fs.mkdir(path.dirname(browserExecutable), { recursive: true })
    await fs.writeFile(browserExecutable, 'placeholder bundled browser executable')
    const originalBundledBrowserRuntime = process.env.CLAUDE_BROWSER_RUNTIME_DIR
    try {
      process.env.CLAUDE_BROWSER_RUNTIME_DIR = bundledRuntimeDir
      const service = new ConversationService() as any
      const expertEnv = (await service.buildChildEnv(
        '/tmp',
        'ws://127.0.0.1:3456/sdk/expert-session?token=test-token',
        { expertSystemPrompt: '<expert-runtime />' },
      )) as Record<string, string>

      expect(expertEnv.CC_JIANGXIA_VISUAL_QA_BROWSER_EXECUTABLE).toBe(browserExecutable)
    } finally {
      if (originalBundledBrowserRuntime === undefined) delete process.env.CLAUDE_BROWSER_RUNTIME_DIR
      else process.env.CLAUDE_BROWSER_RUNTIME_DIR = originalBundledBrowserRuntime
    }
  })

  test('buildChildEnv asks desktop SDK sessions to wait briefly for MCP tools', async () => {
    const service = new ConversationService() as any
    const env = (await service.buildChildEnv(
      '/tmp',
      'ws://127.0.0.1:3456/sdk/test-session?token=test-token',
    )) as Record<string, string>

    expect(env.CC_JIANGXIA_DESKTOP_AWAIT_MCP).toBe('1')
    expect(env.CC_JIANGXIA_DESKTOP_AWAIT_MCP_TIMEOUT_MS).toBe('5000')
  })

  test('buildSessionCliArgs forwards the selected runtime model and effort to the CLI process', () => {
    const service = new ConversationService() as any
    const args = service.buildSessionCliArgs(
      '123e4567-e89b-12d3-a456-426614174000',
      'ws://127.0.0.1:3456/sdk/test-session?token=test-token',
      false,
      {
        model: 'model-b-opus',
        effort: 'max',
      },
    ) as string[]

    expect(args).toContain('--model')
    expect(args).toContain('model-b-opus')
    expect(args).toContain('--effort')
    expect(args).toContain('max')
  })

  test('buildSessionCliArgs starts pending desktop worktrees through the native CLI flag', () => {
    const service = new ConversationService() as any
    const args = service.buildSessionCliArgs(
      '123e4567-e89b-12d3-a456-426614174000',
      'ws://127.0.0.1:3456/sdk/test-session?token=test-token',
      false,
      undefined,
      {
        requestedWorkDir: '/tmp/source-repo',
        repoRoot: '/tmp/source-repo',
        branch: 'feature/rail',
        worktree: true,
        baseRef: 'feature/rail',
        worktreeSlug: 'desktop-feature-rail-123e4567',
      },
    ) as string[]

    expect(args).toContain('--worktree')
    expect(args).toContain('desktop-feature-rail-123e4567')
    expect(args).toContain('--worktree-base-ref')
    expect(args).toContain('feature/rail')
  })
})

function sanitizeMemoryPath(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, '-')
}
