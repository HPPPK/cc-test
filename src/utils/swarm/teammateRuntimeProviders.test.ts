import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { ProviderService } from '../../server/services/providerService.js'
import {
  buildTeammateRuntimeProviderContent,
  getTeammateRuntimeProviderRoster,
} from './teammateRuntimeProviders.js'

let tmpDir: string
let originalConfigDir: string | undefined

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-providers-test-'))
  originalConfigDir = process.env.CLAUDE_CONFIG_DIR
  process.env.CLAUDE_CONFIG_DIR = tmpDir
})

afterEach(async () => {
  if (originalConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR
  } else {
    process.env.CLAUDE_CONFIG_DIR = originalConfigDir
  }
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('teammate runtime provider roster', () => {
  test('formats provider and model IDs without leaking secrets', () => {
    const content = buildTeammateRuntimeProviderContent({
      activeId: 'provider-a',
      providers: [
        {
          id: 'provider-a',
          name: 'OpenRouter "prod"\nsecret',
          models: {
            main: 'openai/gpt-5.4',
            haiku: 'openai/gpt-5.4-mini',
            sonnet: 'openai/gpt-5.4',
            opus: 'anthropic/claude-opus-4.7',
          },
        },
      ],
    })

    expect(content).toContain('## Teammate runtime providers')
    expect(content).toContain('provider_id="provider-a"')
    expect(content).toContain('model_id="openai/gpt-5.4" (main/sonnet)')
    expect(content).toContain('model_id="openai/gpt-5.4-mini" (haiku)')
    expect(content).toContain('provider_name="OpenRouter \\"prod\\"\\nsecret"')
    expect(content).toContain('provider_id=null')
    expect(content).not.toContain('api.example.com')
    expect(content).not.toContain('sk-')
  })

  test('reads the current persisted provider roster', async () => {
    const providerService = new ProviderService()
    const provider = await providerService.addProvider({
      presetId: 'custom',
      name: 'Test Provider',
      baseUrl: 'https://secret.example.com',
      apiKey: 'sk-secret-key',
      apiFormat: 'anthropic',
      notes: 'private provider notes',
      models: {
        main: 'provider/main',
        haiku: 'provider/haiku',
        sonnet: 'provider/sonnet',
        opus: 'provider/opus',
      },
    })
    await providerService.activateProvider(provider.id)

    const roster = await getTeammateRuntimeProviderRoster()

    expect(roster.fingerprint).toHaveLength(64)
    expect(roster.content).toContain(`provider_id="${provider.id}"`)
    expect(roster.content).toContain('model_id="provider/main" (main)')
    expect(roster.content).not.toContain('sk-secret-key')
    expect(roster.content).not.toContain('https://secret.example.com')
    expect(roster.content).not.toContain('private provider notes')
  })
})
