import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SavedProvider } from '../types/provider'
import type { ProviderExportRequest, ProviderSecretFreeBundle } from '../types/providerImportExport'

const {
  providersApiMock,
  chatStoreState,
  runtimeStoreState,
  setSessionRuntimeMock,
  setSelectionMock,
} = vi.hoisted(() => ({
  providersApiMock: {
    list: vi.fn(),
    presets: vi.fn(),
    authStatus: vi.fn(),
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    activate: vi.fn(),
    activateOfficial: vi.fn(),
    test: vi.fn(),
    testConfig: vi.fn(),
    exportProviders: vi.fn(),
  },
  chatStoreState: {
    sessions: {} as Record<string, { connectionState: string; chatState: string }>,
    setSessionRuntime: vi.fn(),
  },
  runtimeStoreState: {
    selections: {} as Record<string, { providerId: string | null; modelId: string }>,
    setSelection: vi.fn(),
  },
  setSessionRuntimeMock: vi.fn(),
  setSelectionMock: vi.fn(),
}))

vi.mock('../api/providers', () => ({
  providersApi: providersApiMock,
}))

vi.mock('./chatStore', () => ({
  useChatStore: {
    getState: () => ({
      ...chatStoreState,
      setSessionRuntime: setSessionRuntimeMock,
    }),
  },
}))

vi.mock('./sessionRuntimeStore', () => ({
  useSessionRuntimeStore: {
    getState: () => ({
      ...runtimeStoreState,
      setSelection: setSelectionMock,
    }),
  },
}))

vi.mock('./settingsStore', () => ({
  useSettingsStore: {
    getState: () => ({
      setModel: vi.fn(),
      fetchAll: vi.fn(),
    }),
  },
}))

function makeProvider(overrides: Partial<SavedProvider> = {}): SavedProvider {
  return {
    id: 'provider-a',
    presetId: 'custom',
    name: 'Provider A',
    apiKey: 'key-a',
    baseUrl: 'https://example.invalid/api',
    apiFormat: 'anthropic',
    models: {
      main: 'model-main',
      haiku: 'model-haiku',
      sonnet: 'model-sonnet',
      opus: 'model-opus',
    },
    ...overrides,
  }
}

function makeSecretFreeBundle(): ProviderSecretFreeBundle {
  return {
    schemaVersion: 1,
    kind: 'cc-jiangxia-provider-bundle',
    exportedAt: '2026-06-10T00:00:00.000Z',
    containsSecrets: false,
    providers: [
      {
        sourceProviderId: 'provider-a',
        name: 'Provider A',
        presetId: 'custom',
        baseUrl: 'https://example.invalid/api',
        apiFormat: 'anthropic',
        models: {
          main: 'model-main',
          haiku: 'model-haiku',
          sonnet: 'model-sonnet',
          opus: 'model-opus',
        },
        credential: {
          status: 'redacted',
        },
      },
    ],
  }
}

async function getProviderStoreWithExportAction() {
  const { useProviderStore } = await import('./providerStore')
  return useProviderStore.getState() as ReturnType<typeof useProviderStore.getState> & {
    exportProviders: (input: ProviderExportRequest) => Promise<ProviderSecretFreeBundle>
  }
}

describe('providerStore runtime refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    chatStoreState.sessions = {}
    runtimeStoreState.selections = {}
    providersApiMock.list.mockResolvedValue({ providers: [], activeId: null })
  })

  it('reapplies an updated active provider to idle connected sessions using default runtime', async () => {
    const provider = makeProvider()
    providersApiMock.update.mockResolvedValue({ provider })
    providersApiMock.list.mockResolvedValue({ providers: [provider], activeId: provider.id })
    chatStoreState.sessions = {
      'session-a': { connectionState: 'connected', chatState: 'idle' },
    }

    const { useProviderStore } = await import('./providerStore')
    await useProviderStore.getState().updateProvider(provider.id, { apiKey: 'new-key' })

    expect(setSelectionMock).toHaveBeenCalledWith('session-a', {
      providerId: provider.id,
      modelId: 'model-main',
    })
    expect(setSessionRuntimeMock).toHaveBeenCalledWith('session-a', {
      providerId: provider.id,
      modelId: 'model-main',
    }, { force: true })
  })

  it('keeps an explicit provider model selection when the model still exists', async () => {
    const provider = makeProvider()
    providersApiMock.update.mockResolvedValue({ provider })
    providersApiMock.list.mockResolvedValue({ providers: [provider], activeId: null })
    chatStoreState.sessions = {
      'session-a': { connectionState: 'connected', chatState: 'idle' },
    }
    runtimeStoreState.selections = {
      'session-a': { providerId: provider.id, modelId: 'model-opus' },
    }

    const { useProviderStore } = await import('./providerStore')
    await useProviderStore.getState().updateProvider(provider.id, { apiKey: 'new-key' })

    expect(setSessionRuntimeMock).toHaveBeenCalledWith('session-a', {
      providerId: provider.id,
      modelId: 'model-opus',
    }, { force: true })
  })

  it('does not restart busy sessions while a provider update is saved', async () => {
    const provider = makeProvider()
    providersApiMock.update.mockResolvedValue({ provider })
    providersApiMock.list.mockResolvedValue({ providers: [provider], activeId: provider.id })
    chatStoreState.sessions = {
      'session-a': { connectionState: 'connected', chatState: 'streaming' },
      'session-b': { connectionState: 'disconnected', chatState: 'idle' },
    }

    const { useProviderStore } = await import('./providerStore')
    await useProviderStore.getState().updateProvider(provider.id, { apiKey: 'new-key' })

    expect(setSelectionMock).not.toHaveBeenCalled()
    expect(setSessionRuntimeMock).not.toHaveBeenCalled()
  })
})

describe('providerStore provider export', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    chatStoreState.sessions = {}
    runtimeStoreState.selections = {}
    providersApiMock.list.mockResolvedValue({ providers: [], activeId: null })
  })

  it('calls the secret-free export API with selected provider request shape', async () => {
    providersApiMock.exportProviders.mockResolvedValue({ bundle: makeSecretFreeBundle() })

    const store = await getProviderStoreWithExportAction()
    await store.exportProviders({ providerIds: ['provider-a'], all: false })

    expect(providersApiMock.exportProviders).toHaveBeenCalledWith({
      providerIds: ['provider-a'],
      all: false,
    })
    const [request] = providersApiMock.exportProviders.mock.calls[0] ?? []
    expect(request).toBeDefined()
    expect(request).not.toHaveProperty('includeSecrets')
    expect(request).not.toHaveProperty('activeId')
    expect(request).not.toHaveProperty('defaultProviderId')
  })

  it('returns the secret-free provider bundle from export', async () => {
    const bundle = makeSecretFreeBundle()
    providersApiMock.exportProviders.mockResolvedValue({ bundle })

    const store = await getProviderStoreWithExportAction()
    const result = await store.exportProviders({ all: true })

    expect(result).toEqual(bundle)
  })

  it('does not activate providers or mutate activeId while exporting', async () => {
    const activeProvider = makeProvider()
    providersApiMock.list.mockResolvedValue({
      providers: [activeProvider],
      activeId: activeProvider.id,
    })
    providersApiMock.exportProviders.mockResolvedValue({ bundle: makeSecretFreeBundle() })

    const { useProviderStore } = await import('./providerStore')
    await useProviderStore.getState().fetchProviders()

    const store = await getProviderStoreWithExportAction()
    await store.exportProviders({ all: true })

    expect(providersApiMock.activate).not.toHaveBeenCalled()
    expect(providersApiMock.activateOfficial).not.toHaveBeenCalled()
    expect(useProviderStore.getState().activeId).toBe(activeProvider.id)
  })
})
