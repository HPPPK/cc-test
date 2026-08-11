import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { ProviderService } from './providerService.js'
import { SettingsService } from './settingsService.js'
import type { SavedProvider } from '../types/provider.js'

const IMAGE_REQUEST_TIMEOUT_MS = 10 * 60 * 1000
const MAX_IMAGE_BYTES = 25 * 1024 * 1024
const DEFAULT_IMAGE_MODEL = 'gpt-image-2'

export type ImageQuality = 'auto' | 'low' | 'medium' | 'high'
export type ImageOutputFormat = 'png' | 'jpeg' | 'webp'

type ImageProvider = Pick<SavedProvider, 'id' | 'name' | 'baseUrl' | 'apiKey'>

export type ImageGenerationDependencies = {
  providerService?: Pick<ProviderService, 'getProvider' | 'listProviders'>
  settingsService?: Pick<SettingsService, 'getUserSettings'>
  fetch?: typeof globalThis.fetch
  now?: () => Date
}

export type ImageGenerationInput = {
  providerId?: string
  model?: string
  prompt?: string
  size?: string
  quality?: ImageQuality
  outputFormat?: ImageOutputFormat
  workDir?: string
  fileName?: string
}

export type ImageGenerationAvailability = 'available' | 'unavailable' | 'unverified'

export type ImageGenerationResult = {
  status: 'available' | 'unavailable' | 'unverified' | 'generated' | 'failed'
  availability: ImageGenerationAvailability
  model: string
  providerId?: string
  providerName?: string
  endpoint?: string
  message: string
  errorCode?: string
  imagePath?: string
  promptPath?: string
  reportPath?: string
  mimeType?: string
  bytes?: number
}

type ResolvedImageConfig = {
  provider: ImageProvider
  endpoint: string
  model: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeBaseUrl(value: string): string {
  const base = value.trim().replace(/\/+$/, '')
  return base.endsWith('/v1') ? base : `${base}/v1`
}

function outputMimeType(format: ImageOutputFormat): string {
  if (format === 'jpeg') return 'image/jpeg'
  if (format === 'webp') return 'image/webp'
  return 'image/png'
}

function sanitizeFileName(value: string | undefined, format: ImageOutputFormat, now: Date): string {
  const fallback = `image-${now.toISOString().replace(/[:.]/g, '-').replace('T', '-')}`
  const candidate = (value ?? fallback)
    .trim()
    .replace(/[\\/]+/g, '-')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/\.+/g, '.')
    .slice(0, 96)
  const stem = (candidate || fallback).replace(/\.[^.]+$/, '') || fallback
  return `${stem}.${format}`
}

function imageBase64FromJson(value: unknown): string | null {
  if (!isRecord(value)) return null
  for (const key of ['b64_json', 'partial_image_b64', 'result']) {
    const candidate = value[key]
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  const data = value.data
  if (Array.isArray(data)) {
    for (const entry of data) {
      const found = imageBase64FromJson(entry)
      if (found) return found
    }
  }
  if (isRecord(data)) return imageBase64FromJson(data)
  return null
}

function lastImageBase64FromSse(text: string): string | null {
  let currentData: string[] = []
  let latest: string | null = null
  const flush = () => {
    if (currentData.length === 0) return
    const raw = currentData.join('\n')
    currentData = []
    if (raw === '[DONE]') return
    try {
      const found = imageBase64FromJson(JSON.parse(raw))
      if (found) latest = found
    } catch {
      // A malformed upstream event cannot be used as image data.
    }
  }

  for (const line of text.split(/\r?\n/)) {
    if (!line) {
      flush()
    } else if (line.startsWith('data:')) {
      currentData.push(line.slice(5).trimStart())
    }
  }
  flush()
  return latest
}

function getModelIds(payload: unknown): string[] | null {
  if (!isRecord(payload) || !Array.isArray(payload.data)) return null
  return payload.data.flatMap((entry) => isRecord(entry) && typeof entry.id === 'string' ? [entry.id] : [])
}

function classifyImageApiFailure(status: number): { errorCode: string; availability: ImageGenerationAvailability } {
  if (status === 401 || status === 403) {
    return { errorCode: 'IMAGE_PROVIDER_AUTH_FAILED', availability: 'unavailable' }
  }
  if (status === 404) {
    return { errorCode: 'IMAGE_ENDPOINT_OR_MODEL_UNAVAILABLE', availability: 'unavailable' }
  }
  if (status === 429) {
    return { errorCode: 'IMAGE_PROVIDER_RATE_LIMITED', availability: 'unverified' }
  }
  if (status >= 500) {
    return { errorCode: 'IMAGE_PROVIDER_UNAVAILABLE', availability: 'unverified' }
  }
  return { errorCode: 'IMAGE_PROVIDER_REJECTED_REQUEST', availability: 'unverified' }
}

function normalizeBase64Image(value: string): string | null {
  const normalized = value.replace(/\s+/g, '')
  if (!normalized || normalized.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    return null
  }
  return normalized
}

function hasExpectedImageSignature(image: Buffer, format: ImageOutputFormat): boolean {
  if (format === 'png') {
    return image.length >= 8 && image.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  }
  if (format === 'jpeg') {
    return image.length >= 3 && image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff
  }
  return image.length >= 12
    && image.subarray(0, 4).equals(Buffer.from('RIFF'))
    && image.subarray(8, 12).equals(Buffer.from('WEBP'))
}

export class ImageGenerationService {
  private readonly providerService: Pick<ProviderService, 'getProvider' | 'listProviders'>
  private readonly settingsService: Pick<SettingsService, 'getUserSettings'>
  private readonly fetchImpl: typeof globalThis.fetch
  private readonly now: () => Date

  constructor(dependencies: ImageGenerationDependencies = {}) {
    this.providerService = dependencies.providerService ?? new ProviderService()
    this.settingsService = dependencies.settingsService ?? new SettingsService()
    this.fetchImpl = dependencies.fetch ?? globalThis.fetch
    this.now = dependencies.now ?? (() => new Date())
  }

  private async resolveProvider(providerId?: string): Promise<ImageProvider | null> {
    try {
      if (providerId) return await this.providerService.getProvider(providerId)
      const { activeId } = await this.providerService.listProviders()
      return activeId ? await this.providerService.getProvider(activeId) : null
    } catch {
      // A stale session provider id must never leak an internal provider error or credential details.
      return null
    }
  }

  private async resolveConfig(input: ImageGenerationInput): Promise<ResolvedImageConfig | ImageGenerationResult> {
    const provider = await this.resolveProvider(input.providerId)
    if (!provider) {
      return {
        status: 'unavailable',
        availability: 'unavailable',
        model: asString(input.model) ?? DEFAULT_IMAGE_MODEL,
        message: 'No provider is bound to this Agent session. Select or restart with a configured provider before generating an image.',
        errorCode: 'IMAGE_PROVIDER_NOT_CONFIGURED',
      }
    }

    const settings = await this.settingsService.getUserSettings()
    const env = isRecord(settings.env) ? settings.env : {}
    const configuredBaseUrl = asString(env.OPENAI_IMAGE_BASE_URL) ?? asString(env.OPENAI_BASE_URL)
    const configuredModel = asString(env.OPENAI_IMAGE_MODEL)
    const model = asString(input.model) ?? configuredModel ?? DEFAULT_IMAGE_MODEL
    const endpoint = `${normalizeBaseUrl(configuredBaseUrl ?? provider.baseUrl)}/images/generations`

    return { provider, endpoint, model }
  }

  private async probeImageEndpoint({ provider, endpoint, model }: ResolvedImageConfig): Promise<ImageGenerationResult> {
    try {
      // This intentionally omits prompt. A compatible Images API validates the model
      // before rejecting the missing required prompt, so it proves a route without
      // requesting a billable image or manufacturing a local substitute.
      const response = await this.fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ model }),
        signal: AbortSignal.timeout(20_000),
      })
      const detail = (await response.text().catch(() => '')).toLowerCase()
      const confirmsModel = /prompt.*(required|missing)|missing.*prompt|required.*prompt/.test(detail)
      const noChannel = /model_not_found|no available channel|model.*not found/.test(detail)

      if (confirmsModel) {
        return {
          status: 'available',
          availability: 'available',
          model,
          providerId: provider.id,
          providerName: provider.name,
          endpoint,
          message: `Provider accepted ${model} at the Images API and rejected only the intentionally missing prompt. No image was generated.`,
        }
      }
      if (noChannel || response.status === 404) {
        return {
          status: 'unavailable',
          availability: 'unavailable',
          model,
          providerId: provider.id,
          providerName: provider.name,
          endpoint,
          message: `The configured provider has no available image channel for ${model}. No image was generated.`,
          errorCode: 'IMAGE_MODEL_UNAVAILABLE',
        }
      }
      const failure = classifyImageApiFailure(response.status)
      return {
        status: failure.availability === 'unavailable' ? 'unavailable' : 'unverified',
        availability: failure.availability,
        model,
        providerId: provider.id,
        providerName: provider.name,
        endpoint,
        message: `Image capability probe was inconclusive (HTTP ${response.status}). No image was generated.`,
        errorCode: failure.errorCode === 'IMAGE_ENDPOINT_OR_MODEL_UNAVAILABLE'
          ? 'IMAGE_PREFLIGHT_INCONCLUSIVE'
          : failure.errorCode,
      }
    } catch {
      return {
        status: 'unverified',
        availability: 'unverified',
        model,
        providerId: provider.id,
        providerName: provider.name,
        endpoint,
        message: 'Image capability probe could not reach the provider. No image was generated.',
        errorCode: 'IMAGE_PREFLIGHT_NETWORK_ERROR',
      }
    }
  }

  async preflight(input: ImageGenerationInput): Promise<ImageGenerationResult> {
    const resolved = await this.resolveConfig(input)
    if (!('provider' in resolved)) return resolved

    const { provider, endpoint, model } = resolved
    const modelsEndpoint = endpoint.replace(/\/images\/generations$/, '/models')
    try {
      const response = await this.fetchImpl(modelsEndpoint, {
        headers: { Authorization: `Bearer ${provider.apiKey}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(20_000),
      })
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          return {
            status: 'unavailable',
            availability: 'unavailable',
            model,
            providerId: provider.id,
            providerName: provider.name,
            endpoint,
            message: `Image capability preflight could not authenticate to the provider (HTTP ${response.status}).`,
            errorCode: 'IMAGE_PROVIDER_AUTH_FAILED',
          }
        }
        return this.probeImageEndpoint(resolved)
      }
      const ids = getModelIds(await response.json().catch(() => null))
      if (ids?.includes(model)) {
        return {
          status: 'available',
          availability: 'available',
          model,
          providerId: provider.id,
          providerName: provider.name,
          endpoint,
          message: `Provider lists ${model} for image generation.`,
        }
      }
      return this.probeImageEndpoint(resolved)
    } catch {
      return this.probeImageEndpoint(resolved)
    }
  }

  async generate(input: ImageGenerationInput): Promise<ImageGenerationResult> {
    const prompt = asString(input.prompt)
    if (!prompt) {
      return {
        status: 'failed',
        availability: 'unverified',
        model: asString(input.model) ?? DEFAULT_IMAGE_MODEL,
        message: 'A non-empty image prompt is required.',
        errorCode: 'IMAGE_PROMPT_REQUIRED',
      }
    }
    if (!input.workDir || !path.isAbsolute(input.workDir)) {
      return {
        status: 'failed',
        availability: 'unverified',
        model: asString(input.model) ?? DEFAULT_IMAGE_MODEL,
        message: 'An absolute session workspace is required for image delivery.',
        errorCode: 'IMAGE_WORKDIR_REQUIRED',
      }
    }

    const resolved = await this.resolveConfig(input)
    if (!('provider' in resolved)) return resolved
    const { provider, endpoint, model } = resolved
    const format = input.outputFormat ?? 'png'
    const quality = input.quality ?? 'high'
    const size = asString(input.size) ?? '1536x1024'
    const outputDirectory = path.join(path.resolve(input.workDir), 'output', 'imagegen')
    const fileName = sanitizeFileName(input.fileName, format, this.now())
    const imagePath = path.join(outputDirectory, fileName)
    const relative = path.relative(outputDirectory, imagePath)
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      return {
        status: 'failed',
        availability: 'unverified',
        model,
        providerId: provider.id,
        providerName: provider.name,
        endpoint,
        message: 'The requested output name is not safe.',
        errorCode: 'IMAGE_OUTPUT_PATH_INVALID',
      }
    }

    let response: Response
    try {
      response = await this.fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream, application/json',
        },
        body: JSON.stringify({
          model,
          prompt,
          size,
          quality,
          n: 1,
          output_format: format,
          stream: true,
          partial_images: 0,
        }),
        signal: AbortSignal.timeout(IMAGE_REQUEST_TIMEOUT_MS),
      })
    } catch {
      return {
        status: 'failed',
        availability: 'unverified',
        model,
        providerId: provider.id,
        providerName: provider.name,
        endpoint,
        message: 'Image API request could not reach the provider.',
        errorCode: 'IMAGE_PROVIDER_NETWORK_ERROR',
      }
    }

    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).toLowerCase()
      const isKnownMissingModel = /model_not_found|no available channel|model.*not found/.test(detail)
      const failure = isKnownMissingModel
        ? { errorCode: 'IMAGE_MODEL_UNAVAILABLE', availability: 'unavailable' as const }
        : classifyImageApiFailure(response.status)
      return {
        status: failure.availability === 'unavailable' ? 'unavailable' : 'failed',
        availability: failure.availability,
        model,
        providerId: provider.id,
        providerName: provider.name,
        endpoint,
        message: isKnownMissingModel
          ? `The configured provider has no available channel for ${model}. Enable an image model in the relay, then retry.`
          : `Image API request failed with HTTP ${response.status}.`,
        errorCode: failure.errorCode,
      }
    }

    const body = await response.text()
    let imageBase64: string | null = null
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
    if (contentType.includes('text/event-stream') || body.includes('data:')) {
      imageBase64 = lastImageBase64FromSse(body)
    } else {
      try {
        imageBase64 = imageBase64FromJson(JSON.parse(body))
      } catch {
        imageBase64 = null
      }
    }

    if (!imageBase64) {
      return {
        status: 'failed',
        availability: 'unverified',
        model,
        providerId: provider.id,
        providerName: provider.name,
        endpoint,
        message: 'Image API completed without a Base64 image payload. No local placeholder was created.',
        errorCode: 'IMAGE_RESPONSE_MISSING_DATA',
      }
    }

    const normalizedBase64 = normalizeBase64Image(imageBase64)
    if (!normalizedBase64) {
      return {
        status: 'failed',
        availability: 'unverified',
        model,
        providerId: provider.id,
        providerName: provider.name,
        endpoint,
        message: 'Image API returned invalid Base64 image data.',
        errorCode: 'IMAGE_RESPONSE_INVALID_DATA',
      }
    }

    const image = Buffer.from(normalizedBase64, 'base64')
    if (image.length === 0 || image.length > MAX_IMAGE_BYTES) {
      return {
        status: 'failed',
        availability: 'unverified',
        model,
        providerId: provider.id,
        providerName: provider.name,
        endpoint,
        message: 'Image API returned an empty or oversized image payload.',
        errorCode: 'IMAGE_RESPONSE_SIZE_INVALID',
      }
    }
    if (!hasExpectedImageSignature(image, format)) {
      return {
        status: 'failed',
        availability: 'unverified',
        model,
        providerId: provider.id,
        providerName: provider.name,
        endpoint,
        message: `Image API payload was not a valid ${format} image. No local placeholder was created.`,
        errorCode: 'IMAGE_RESPONSE_INVALID_IMAGE',
      }
    }

    const promptPath = imagePath.replace(/\.[^.]+$/, '.prompt.md')
    const reportPath = imagePath.replace(/\.[^.]+$/, '.report.json')
    const report = {
      generatedAt: this.now().toISOString(),
      source: 'provider-image-api',
      model,
      size,
      quality,
      outputFormat: format,
      stream: true,
      endpoint,
      imagePath,
      promptPath,
      bytes: image.length,
    }
    await fs.mkdir(outputDirectory, { recursive: true })
    await fs.writeFile(imagePath, image)
    await fs.writeFile(promptPath, prompt, 'utf8')
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8')

    return {
      status: 'generated',
      availability: 'available',
      model,
      providerId: provider.id,
      providerName: provider.name,
      endpoint,
      message: `Generated a real provider image at ${imagePath}.`,
      imagePath,
      promptPath,
      reportPath,
      mimeType: outputMimeType(format),
      bytes: image.length,
    }
  }
}
