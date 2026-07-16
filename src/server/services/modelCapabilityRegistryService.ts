import { ProviderService } from './providerService.js'
import type { ApiFormat, ProviderAuthStrategy, SavedProvider } from '../types/provider.js'

export type ModelCapabilityName =
  | 'textInput'
  | 'imageInput'
  | 'audioInput'
  | 'videoInput'
  | 'fileTextInput'
  | 'pdfInput'
  | 'toolCalling'
  | 'structuredOutput'
  | 'jsonMode'
  | 'longContext'
  | 'codeReasoning'

export type ModelCapabilities = Record<ModelCapabilityName, boolean>

export type ModelCapabilityDefinition = {
  provider: string | null
  modelId: string
  displayName?: string
  capabilities: ModelCapabilities
  limits?: {
    maxContextTokens?: number | null
    maxImageSizeBytes?: number | null
    [key: string]: unknown
  }
  source: 'registry' | 'provider-metadata' | 'provider-default' | 'custom' | 'unknown'
  lastVerifiedAt?: string | null
}

export type ModelCapabilityLookup = {
  provider?: string | null
  modelId?: string | null
}

export type ModelCapabilityRequirements = {
  required?: Partial<Record<ModelCapabilityName, boolean>> | string[]
  optional?: Partial<Record<ModelCapabilityName, boolean>> | string[]
  [key: string]: unknown
}

export type ModelCapabilityRequirementIssue = {
  capability: ModelCapabilityName
  required: boolean
  actual: boolean
  severity: 'error' | 'warning'
  message: string
}

export type ModelCapabilityRequirementResult = {
  ok: boolean
  blockers: ModelCapabilityRequirementIssue[]
  warnings: ModelCapabilityRequirementIssue[]
}

export const DEFAULT_MODEL_CAPABILITIES: ModelCapabilities = {
  textInput: true,
  imageInput: false,
  audioInput: false,
  videoInput: false,
  fileTextInput: true,
  pdfInput: false,
  toolCalling: true,
  structuredOutput: false,
  jsonMode: false,
  longContext: false,
  codeReasoning: true,
}

const VISION_MODEL_CAPABILITIES: ModelCapabilities = {
  ...DEFAULT_MODEL_CAPABILITIES,
  imageInput: true,
  pdfInput: true,
  structuredOutput: true,
  jsonMode: true,
  longContext: true,
}

const TEXT_MODEL_CAPABILITIES: ModelCapabilities = {
  ...DEFAULT_MODEL_CAPABILITIES,
  structuredOutput: true,
  jsonMode: true,
  longContext: true,
}

const REGISTERED_MODEL_CAPABILITIES: ModelCapabilityDefinition[] = [
  {
    provider: 'official',
    modelId: 'claude-opus-4-7',
    displayName: 'Opus 4.7',
    capabilities: VISION_MODEL_CAPABILITIES,
    source: 'registry',
  },
  {
    provider: 'official',
    modelId: 'claude-sonnet-4-6',
    displayName: 'Sonnet 4.6',
    capabilities: VISION_MODEL_CAPABILITIES,
    source: 'registry',
  },
  {
    provider: 'official',
    modelId: 'claude-haiku-4-5',
    displayName: 'Haiku 4.5',
    capabilities: VISION_MODEL_CAPABILITIES,
    source: 'registry',
  },
  {
    provider: 'openai',
    modelId: 'gpt-5.5',
    displayName: 'GPT-5.5',
    capabilities: VISION_MODEL_CAPABILITIES,
    source: 'registry',
  },
  {
    provider: 'deepseek',
    modelId: 'deepseek-chat',
    displayName: 'DeepSeek Chat',
    capabilities: TEXT_MODEL_CAPABILITIES,
    source: 'registry',
  },
]

const providerService = new ProviderService()
const PROVIDER_CAPABILITY_CACHE_TTL_MS = 5 * 60 * 1000
const providerCapabilityCache = new Map<string, { expiresAt: number; capability: ModelCapabilityDefinition }>()

const CAPABILITY_NAMES = new Set<ModelCapabilityName>([
  'textInput',
  'imageInput',
  'audioInput',
  'videoInput',
  'fileTextInput',
  'pdfInput',
  'toolCalling',
  'structuredOutput',
  'jsonMode',
  'longContext',
  'codeReasoning',
])

function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

function cloneCapabilities(capabilities: ModelCapabilities): ModelCapabilities {
  return { ...capabilities }
}

export function getModelCapability(lookup: ModelCapabilityLookup): ModelCapabilityDefinition {
  const provider = normalize(lookup.provider ?? 'official') || 'official'
  const modelId = normalize(lookup.modelId)
  const exact = REGISTERED_MODEL_CAPABILITIES.find((entry) =>
    normalize(entry.provider ?? 'official') === provider && normalize(entry.modelId) === modelId
  )
  const providerAgnostic = exact ?? REGISTERED_MODEL_CAPABILITIES.find((entry) =>
    normalize(entry.modelId) === modelId && entry.provider === null
  )

  if (providerAgnostic) {
    return {
      ...providerAgnostic,
      capabilities: cloneCapabilities(providerAgnostic.capabilities),
    }
  }

  return {
    provider: lookup.provider ?? null,
    modelId: lookup.modelId ?? '',
    capabilities: cloneCapabilities(DEFAULT_MODEL_CAPABILITIES),
    source: 'unknown',
    lastVerifiedAt: null,
  }
}

export async function resolveModelCapability(lookup: ModelCapabilityLookup): Promise<ModelCapabilityDefinition> {
  const registered = getModelCapability(lookup)
  const modelId = (lookup.modelId ?? '').trim()
  if (!modelId) return registered

  const provider = await resolveProviderForCapabilityLookup(lookup.provider)
  if (!provider) return registered

  const cacheKey = `${provider.id}:${modelId}`.toLowerCase()
  const cached = providerCapabilityCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return { ...cached.capability, capabilities: cloneCapabilities(cached.capability.capabilities) }
  }

  const metadataCapability = await fetchProviderModelMetadataCapability(provider, modelId).catch(() => null)
  if (!metadataCapability) return registered

  const capability: ModelCapabilityDefinition = {
    provider: provider.id,
    modelId,
    displayName: metadataCapability.displayName ?? registered.displayName,
    capabilities: metadataCapability.capabilities,
    limits: metadataCapability.limits ?? registered.limits,
    source: 'provider-metadata',
    lastVerifiedAt: new Date().toISOString(),
  }
  providerCapabilityCache.set(cacheKey, {
    expiresAt: Date.now() + PROVIDER_CAPABILITY_CACHE_TTL_MS,
    capability,
  })
  return { ...capability, capabilities: cloneCapabilities(capability.capabilities) }
}

export type ProviderMetadataCapability = {
  displayName?: string
  capabilities: ModelCapabilities
  limits?: ModelCapabilityDefinition['limits']
}

async function resolveProviderForCapabilityLookup(providerId: string | null | undefined): Promise<SavedProvider | null> {
  try {
    if (providerId && normalize(providerId) !== 'official') {
      return await providerService.getProvider(providerId)
    }
    const { providers, activeId } = await providerService.listProviders()
    return activeId ? providers.find((provider) => provider.id === activeId) ?? null : null
  } catch {
    return null
  }
}

async function fetchProviderModelMetadataCapability(provider: SavedProvider, modelId: string): Promise<ProviderMetadataCapability | null> {
  const base = provider.baseUrl.replace(/\/$/, '')
  const format = provider.apiFormat ?? 'anthropic'
  const authStrategy = provider.authStrategy ?? 'api_key'
  const headers = buildModelMetadataHeaders(provider.apiKey, format, authStrategy)
  const endpoints = buildModelMetadataEndpoints(base, format, modelId)

  for (const endpoint of endpoints) {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(5000),
    }).catch(() => null)
    if (!response?.ok) continue
    const body = await response.json().catch(() => null) as unknown
    const modelMetadata = extractModelMetadata(body, modelId)
    if (!modelMetadata) continue
    const capability = capabilityFromProviderMetadata(modelMetadata)
    if (capability) return capability
  }

  return null
}

function buildModelMetadataEndpoints(base: string, format: ApiFormat, modelId: string): string[] {
  const encoded = encodeURIComponent(modelId)
  if (format === 'openai_chat' || format === 'openai_responses') {
    return [`${base}/v1/models/${encoded}`, `${base}/v1/models`]
  }
  return [`${base}/v1/models/${encoded}`, `${base}/v1/models`]
}

function buildModelMetadataHeaders(apiKey: string, format: ApiFormat, authStrategy: ProviderAuthStrategy): Record<string, string> {
  if (format === 'openai_chat' || format === 'openai_responses') {
    return { Authorization: `Bearer ${apiKey}` }
  }
  return {
    'anthropic-version': '2023-06-01',
    ...buildAnthropicMetadataAuthHeaders(apiKey, authStrategy),
  }
}

function buildAnthropicMetadataAuthHeaders(apiKey: string, authStrategy: ProviderAuthStrategy): Record<string, string> {
  switch (authStrategy) {
    case 'api_key':
      return { 'x-api-key': apiKey }
    case 'auth_token':
    case 'auth_token_empty_api_key':
      return { Authorization: `Bearer ${apiKey}` }
    case 'dual_same_token':
      return { 'x-api-key': apiKey, Authorization: `Bearer ${apiKey}` }
    case 'dual_dummy':
      return { 'x-api-key': 'dummy', Authorization: 'Bearer dummy' }
  }
}

function extractModelMetadata(body: unknown, modelId: string): Record<string, unknown> | null {
  if (!body || typeof body !== 'object') return null
  const record = body as Record<string, unknown>
  if (typeof record.id === 'string' || typeof record.name === 'string' || typeof record.model === 'string') {
    return record
  }
  const data = Array.isArray(record.data)
    ? record.data
    : Array.isArray(record.models)
      ? record.models
      : []
  const normalizedModelId = normalize(modelId)
  const match = data.find((entry): entry is Record<string, unknown> => {
    if (!entry || typeof entry !== 'object') return false
    const candidate = entry as Record<string, unknown>
    return [candidate.id, candidate.name, candidate.model].some((value) => typeof value === 'string' && normalize(value) === normalizedModelId)
  })
  return match ?? null
}

export function capabilityFromProviderMetadata(metadata: Record<string, unknown>): ProviderMetadataCapability | null {
  const text = collectCapabilityTokens(metadata).join(' ').toLowerCase()
  const explicitImage = readBooleanCapability(metadata, [
    'imageInput',
    'image_input',
    'vision',
    'images',
    'image',
    'multimodal',
    'supports_vision',
    'supportsVision',
  ])
  const hasImageToken = /\b(image|images|vision|visual|multimodal)\b/.test(text)
  const hasPdfToken = /\b(pdf|document)\b/.test(text)
  const hasToolToken = /\b(tool|tools|function|function_calling|tool_calling)\b/.test(text)
  const hasJsonToken = /\b(json|structured|structured_output)\b/.test(text)
  const hasLongContextToken = /\b(long_context|long-context|large_context|1m|200k|128k)\b/.test(text)

  if (explicitImage === null && !hasImageToken && !hasPdfToken && !hasToolToken && !hasJsonToken && !hasLongContextToken) {
    return null
  }

  const capabilities: ModelCapabilities = {
    ...DEFAULT_MODEL_CAPABILITIES,
    imageInput: explicitImage ?? hasImageToken,
    pdfInput: hasPdfToken || explicitImage === true || hasImageToken,
    toolCalling: hasToolToken || DEFAULT_MODEL_CAPABILITIES.toolCalling,
    structuredOutput: hasJsonToken,
    jsonMode: hasJsonToken,
    longContext: hasLongContextToken,
  }

  const displayName = [metadata.display_name, metadata.displayName, metadata.name]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
  return {
    ...(displayName && { displayName }),
    capabilities,
    limits: extractCapabilityLimits(metadata),
  }
}

function collectCapabilityTokens(value: unknown, depth = 0): string[] {
  if (depth > 4 || value == null) return []
  if (typeof value === 'string') return [value]
  if (typeof value === 'boolean' || typeof value === 'number') return []
  if (Array.isArray(value)) return value.flatMap((entry) => collectCapabilityTokens(entry, depth + 1))
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => [key, ...collectCapabilityTokens(entry, depth + 1)])
  }
  return []
}

function readBooleanCapability(metadata: Record<string, unknown>, names: string[]): boolean | null {
  const wanted = new Set(names.map(normalizeCapabilityKey))
  const stack: unknown[] = [metadata]
  while (stack.length > 0) {
    const value = stack.pop()
    if (!value || typeof value !== 'object') continue
    if (Array.isArray(value)) {
      stack.push(...value)
      continue
    }
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (wanted.has(normalizeCapabilityKey(key)) && typeof entry === 'boolean') {
        return entry
      }
      if (entry && typeof entry === 'object') stack.push(entry)
    }
  }
  return null
}

function normalizeCapabilityKey(value: string): string {
  return value.replace(/[\s_-]/g, '').toLowerCase()
}

function extractCapabilityLimits(metadata: Record<string, unknown>): ModelCapabilityDefinition['limits'] | undefined {
  const maxContextTokens = readNumberFromMetadata(metadata, ['context_length', 'contextWindow', 'max_context_tokens', 'maxInputTokens'])
  const maxImageSizeBytes = readNumberFromMetadata(metadata, ['max_image_size_bytes', 'maxImageSizeBytes'])
  if (maxContextTokens == null && maxImageSizeBytes == null) return undefined
  return {
    ...(maxContextTokens != null && { maxContextTokens }),
    ...(maxImageSizeBytes != null && { maxImageSizeBytes }),
  }
}

function readNumberFromMetadata(metadata: Record<string, unknown>, names: string[]): number | null {
  const wanted = new Set(names.map(normalizeCapabilityKey))
  const stack: unknown[] = [metadata]
  while (stack.length > 0) {
    const value = stack.pop()
    if (!value || typeof value !== 'object') continue
    if (Array.isArray(value)) {
      stack.push(...value)
      continue
    }
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (wanted.has(normalizeCapabilityKey(key)) && typeof entry === 'number' && Number.isFinite(entry)) {
        return entry
      }
      if (entry && typeof entry === 'object') stack.push(entry)
    }
  }
  return null
}

function normalizeRequirementSet(value: ModelCapabilityRequirements['required']): Array<{ capability: ModelCapabilityName; expected: boolean }> {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is ModelCapabilityName => typeof item === 'string' && CAPABILITY_NAMES.has(item as ModelCapabilityName))
      .map((capability) => ({ capability, expected: true }))
  }
  if (!value || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([capability, expected]) => {
    if (!CAPABILITY_NAMES.has(capability as ModelCapabilityName)) return []
    if (typeof expected !== 'boolean') return []
    return [{ capability: capability as ModelCapabilityName, expected }]
  })
}

function issueFor(
  capability: ModelCapabilityName,
  expected: boolean,
  actual: boolean,
  severity: 'error' | 'warning',
): ModelCapabilityRequirementIssue {
  return {
    capability,
    required: expected,
    actual,
    severity,
    message: `Model capability ${capability} must be ${expected}, but current model reports ${actual}.`,
  }
}

export function evaluateModelCapabilityRequirements(
  capability: ModelCapabilityDefinition,
  requirements: ModelCapabilityRequirements | null | undefined,
): ModelCapabilityRequirementResult {
  const blockers = normalizeRequirementSet(requirements?.required).flatMap(({ capability: name, expected }) => {
    const actual = capability.capabilities[name]
    return actual === expected ? [] : [issueFor(name, expected, actual, 'error')]
  })
  const warnings = normalizeRequirementSet(requirements?.optional).flatMap(({ capability: name, expected }) => {
    const actual = capability.capabilities[name]
    return actual === expected ? [] : [issueFor(name, expected, actual, 'warning')]
  })

  return {
    ok: blockers.length === 0,
    blockers,
    warnings,
  }
}

export function listRegisteredModelCapabilities(): ModelCapabilityDefinition[] {
  return REGISTERED_MODEL_CAPABILITIES.map((entry) => ({
    ...entry,
    capabilities: cloneCapabilities(entry.capabilities),
    limits: entry.limits ? { ...entry.limits } : undefined,
  }))
}
