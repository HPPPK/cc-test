import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { ImageGenerationService } from './imageGenerationService.js'
import type { SavedProvider } from '../types/provider.js'

const PIXEL_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL9WQAAAABJRU5ErkJggg=='

let tempDir = ''

const provider: SavedProvider = {
  id: 'provider-image-test',
  presetId: 'custom',
  name: 'Image Test Provider',
  apiKey: 'test-key-not-a-secret',
  baseUrl: 'https://relay.example.test',
  apiFormat: 'openai_chat',
  models: { main: 'gpt-5.6-terra', haiku: 'gpt-5.6-terra', sonnet: 'gpt-5.6-terra', opus: 'gpt-5.6-terra' },
}

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'image-generation-service-'))
})

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true })
})

function makeService(fetchImpl: typeof globalThis.fetch, savedProvider: SavedProvider | null = provider) {
  return new ImageGenerationService({
    providerService: {
      async getProvider() {
        if (!savedProvider) throw new Error('Provider not found')
        return savedProvider
      },
      async listProviders() {
        return { providers: savedProvider ? [savedProvider] : [], activeId: savedProvider?.id ?? null }
      },
    },
    settingsService: {
      async getUserSettings() {
        return {}
      },
    },
    fetch: fetchImpl,
    now: () => new Date('2026-08-03T08:00:00.000Z'),
  })
}

describe('ImageGenerationService', () => {
  test('returns an explicit unavailable result when no Provider is bound', async () => {
    const service = makeService(async () => new Response('unexpected'), null)

    const result = await service.preflight({})

    expect(result).toMatchObject({
      status: 'unavailable',
      availability: 'unavailable',
      errorCode: 'IMAGE_PROVIDER_NOT_CONFIGURED',
    })
  })

  test('marks the image model available when the Provider catalog lists it', async () => {
    const service = makeService(async (input) => {
      expect(String(input)).toBe('https://relay.example.test/v1/models')
      return Response.json({ data: [{ id: 'gpt-image-2' }] })
    })

    const result = await service.preflight({ providerId: provider.id })

    expect(result).toMatchObject({
      status: 'available',
      availability: 'available',
      model: 'gpt-image-2',
      endpoint: 'https://relay.example.test/v1/images/generations',
    })
  })

  test('uses a prompt-less Images API probe to prove an unlisted model is available without generating an image', async () => {
    const service = makeService(async (input, init) => {
      if (String(input).endsWith('/models')) return Response.json({ data: [{ id: 'gpt-5.6-terra' }] })
      expect(JSON.parse(String(init?.body))).toEqual({ model: 'gpt-image-2' })
      return new Response('{"error":{"message":"prompt is required"}}', { status: 400 })
    })

    const result = await service.preflight({ providerId: provider.id })

    expect(result).toMatchObject({
      status: 'available',
      availability: 'available',
      model: 'gpt-image-2',
    })
    expect(result.message).toContain('No image was generated')
  })

  test('reports a relay without an image channel as unavailable without generating an image', async () => {
    const service = makeService(async (input) => {
      if (String(input).endsWith('/models')) return Response.json({ data: [{ id: 'gpt-5.6-terra' }] })
      return new Response('{"error":{"message":"No available channel for model gpt-image-2"}}', { status: 503 })
    })

    const result = await service.preflight({ providerId: provider.id })

    expect(result).toMatchObject({
      status: 'unavailable',
      availability: 'unavailable',
      errorCode: 'IMAGE_MODEL_UNAVAILABLE',
    })
  })

  test('writes a real PNG, prompt, and report from an SSE image response', async () => {
    let requestBody: Record<string, unknown> | null = null
    const service = makeService(async (input, init) => {
      expect(String(input)).toBe('https://relay.example.test/v1/images/generations')
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      return new Response(
        `event: image_generation.partial_image\ndata: {"partial_image_b64":"${PIXEL_PNG_BASE64}"}\n\nevent: image_generation.completed\ndata: {"b64_json":"${PIXEL_PNG_BASE64}"}\n\ndata: [DONE]\n\n`,
        { headers: { 'content-type': 'text/event-stream' } },
      )
    })

    const result = await service.generate({
      providerId: provider.id,
      prompt: 'A tiny blue test square',
      workDir: tempDir,
      fileName: '../safe-image.png',
    })

    expect(requestBody).toEqual({
      model: 'gpt-image-2',
      prompt: 'A tiny blue test square',
      size: '1536x1024',
      quality: 'high',
      n: 1,
      output_format: 'png',
      stream: true,
      partial_images: 0,
    })
    expect(result).toMatchObject({ status: 'generated', availability: 'available', mimeType: 'image/png' })
    expect(result.imagePath).toContain(path.join('output', 'imagegen'))
    expect(result.imagePath).not.toContain('..')
    expect(await fs.readFile(result.imagePath!)).toEqual(Buffer.from(PIXEL_PNG_BASE64, 'base64'))
    expect(await fs.readFile(result.promptPath!, 'utf8')).toBe('A tiny blue test square')
    expect(JSON.parse(await fs.readFile(result.reportPath!, 'utf8'))).toMatchObject({
      source: 'provider-image-api',
      stream: true,
      model: 'gpt-image-2',
    })
  })

  test('writes a real image from a non-stream JSON response', async () => {
    const service = makeService(async () => Response.json({ data: [{ b64_json: PIXEL_PNG_BASE64 }] }))

    const result = await service.generate({ providerId: provider.id, prompt: 'A PNG', workDir: tempDir })

    expect(result.status).toBe('generated')
    expect(await fs.stat(result.imagePath!)).toMatchObject({ size: Buffer.from(PIXEL_PNG_BASE64, 'base64').length })
  })

  test('maps an unavailable relay model to a clear error without creating a placeholder', async () => {
    const service = makeService(async () => new Response('{"error":{"message":"No available channel for model gpt-image-2"}}', { status: 503 }))

    const result = await service.generate({ providerId: provider.id, prompt: 'A puppy', workDir: tempDir })

    expect(result).toMatchObject({
      status: 'unavailable',
      availability: 'unavailable',
      errorCode: 'IMAGE_MODEL_UNAVAILABLE',
    })
    await expect(fs.access(path.join(tempDir, 'output', 'imagegen'))).rejects.toThrow()
  })

  test('rejects a non-image Base64 payload and never writes it as a PNG', async () => {
    const service = makeService(async () => Response.json({ data: [{ b64_json: Buffer.from('not-an-image').toString('base64') }] }))

    const result = await service.generate({ providerId: provider.id, prompt: 'A valid image', workDir: tempDir })

    expect(result).toMatchObject({ status: 'failed', errorCode: 'IMAGE_RESPONSE_INVALID_IMAGE' })
    await expect(fs.access(path.join(tempDir, 'output', 'imagegen'))).rejects.toThrow()
  })
})
