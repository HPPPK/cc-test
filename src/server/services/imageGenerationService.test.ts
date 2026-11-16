import { withFetchPreconnect } from '../__tests__/fixtureAssertions.js'
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

function makeService(
  fetchImpl: Parameters<typeof withFetchPreconnect>[0],
  savedProvider: SavedProvider | null = provider,
  userSettings: Record<string, unknown> = {
    imageGeneration: { enabled: true, providerId: provider.id, model: 'gpt-image-2' },
  },
) {
  return new ImageGenerationService({
    providerService: {
      async getProvider(providerId) {
        if (!savedProvider || providerId !== savedProvider.id) throw new Error('Provider not found')
        return savedProvider
      },
    },
    settingsService: {
      async getUserSettings() {
        return userSettings
      },
    },
    fetch: withFetchPreconnect(fetchImpl),
    now: () => new Date('2026-08-03T08:00:00.000Z'),
  })
}

describe('ImageGenerationService', () => {
  test('never falls back to the active chat Provider when image generation is not explicitly configured', async () => {
    const service = makeService(async () => new Response('unexpected'), provider, {})

    const result = await service.preflight({})

    expect(result).toMatchObject({
      status: 'unavailable',
      availability: 'unavailable',
      errorCode: 'IMAGE_GENERATION_NOT_CONFIGURED',
    })
  })

  test('returns an explicit unavailable result when the user-selected image Provider no longer exists', async () => {
    const service = makeService(
      async () => new Response('unexpected'),
      null,
      { imageGeneration: { enabled: true, providerId: provider.id, model: 'gpt-image-2' } },
    )

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

    const result = await service.preflight({})

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

    const result = await service.preflight({})

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

    const result = await service.preflight({})

    expect(result).toMatchObject({
      status: 'unavailable',
      availability: 'unavailable',
      errorCode: 'IMAGE_MODEL_UNAVAILABLE',
    })
  })

  test('writes a real PNG, prompt, and report from an SSE image response', async () => {
    const requestCapture: { body: Record<string, unknown> | null } = { body: null }
    const service = makeService(async (input, init) => {
      expect(String(input)).toBe('https://relay.example.test/v1/images/generations')
      requestCapture.body = JSON.parse(String(init?.body)) as Record<string, unknown>
      return new Response(
        `event: image_generation.partial_image\ndata: {"partial_image_b64":"${PIXEL_PNG_BASE64}"}\n\nevent: image_generation.completed\ndata: {"b64_json":"${PIXEL_PNG_BASE64}"}\n\ndata: [DONE]\n\n`,
        { headers: { 'content-type': 'text/event-stream' } },
      )
    })

    const result = await service.generate({
      prompt: 'A tiny blue test square',
      workDir: tempDir,
      fileName: '../safe-image.png',
    })

    expect(requestCapture.body).toEqual({
      model: 'gpt-image-2',
      prompt: 'A tiny blue test square',
      size: '1536x1024',
      quality: 'high',
      n: 1,
      output_format: 'png',
      stream: true,
      partial_images: 3,
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

    const result = await service.generate({ prompt: 'A PNG', workDir: tempDir })

    expect(result.status).toBe('generated')
    expect(await fs.stat(result.imagePath!)).toMatchObject({ size: Buffer.from(PIXEL_PNG_BASE64, 'base64').length })
  })

  test('never delivers a preview as a completed image when the stream ends early', async () => {
    const service = makeService(async () => new Response(
      `event: image_generation.partial_image\ndata: {"partial_image_b64":"${PIXEL_PNG_BASE64}"}\n\n`,
      { headers: { 'content-type': 'text/event-stream' } },
    ))

    const result = await service.generate({ prompt: 'A kitten', workDir: tempDir })

    expect(result).toMatchObject({ status: 'failed', errorCode: 'IMAGE_RESPONSE_INCOMPLETE' })
    await expect(fs.access(path.join(tempDir, 'output', 'imagegen'))).rejects.toThrow()
  })

  test('delivers the final SSE frame without waiting for the connection to close', async () => {
    let cancelled = false
    const encoder = new TextEncoder()
    const frame = `event: image_generation.completed\r\ndata: {"b64_json":"${PIXEL_PNG_BASE64}"}\r\n\r\n`
    const service = makeService(async () => new Response(new ReadableStream({
      start(controller) {
        // Boundaries can split a field name, the image, or CRLF.
        for (let i = 0; i < frame.length; i += 7) controller.enqueue(encoder.encode(frame.slice(i, i + 7)))
      },
      cancel() { cancelled = true },
    }), { headers: { 'content-type': 'text/event-stream' } }))

    const result = await Promise.race([
      service.generate({ prompt: 'A kitten', workDir: tempDir }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Waited for EOF after final image')), 200)),
    ])

    expect(result.status).toBe('generated')
    expect(cancelled).toBe(true)
  })

  test('returns a safe connection-reset diagnosis before response headers', async () => {
    const service = makeService(async () => { throw Object.assign(new Error('test-key-not-a-secret'), { code: 'ECONNRESET' }) })

    const result = await service.generate({ prompt: 'A kitten', workDir: tempDir })

    expect(result).toMatchObject({ status: 'failed', errorCode: 'IMAGE_PROVIDER_CONNECTION_RESET' })
    expect(result.message).toContain('before response headers')
    expect(JSON.stringify(result)).not.toContain(provider.apiKey)
  })

  test('handles a socket reset while receiving the image instead of throwing', async () => {
    const service = makeService(async () => new Response(new ReadableStream({
      start(controller) { controller.error(Object.assign(new Error('test-key-not-a-secret'), { code: 'ECONNRESET' })) },
    }), { headers: { 'content-type': 'text/event-stream' } }))

    const result = await service.generate({ prompt: 'A kitten', workDir: tempDir })

    expect(result).toMatchObject({ status: 'failed', errorCode: 'IMAGE_PROVIDER_CONNECTION_RESET' })
    expect(result.message).toContain('while receiving image data')
    expect(JSON.stringify(result)).not.toContain(provider.apiKey)
  })

  test('distinguishes a timed out request from a generic network failure', async () => {
    const service = makeService(async () => { throw new DOMException('expired', 'TimeoutError') })
    expect(await service.generate({ prompt: 'A kitten', workDir: tempDir })).toMatchObject({
      status: 'failed', errorCode: 'IMAGE_PROVIDER_TIMEOUT',
    })
  })

  test('reports an upstream SSE error without exposing its raw contents or a preview', async () => {
    const service = makeService(async () => new Response(
      `data: {"type":"image_generation.partial_image","partial_image_b64":"${PIXEL_PNG_BASE64}"}\n\ndata: {"type":"error","error":{"message":"test-key-not-a-secret"}}\n\n`,
      { headers: { 'content-type': 'text/event-stream' } },
    ))
    const result = await service.generate({ prompt: 'A kitten', workDir: tempDir })
    expect(result).toMatchObject({ status: 'failed', errorCode: 'IMAGE_PROVIDER_STREAM_ERROR' })
    expect(JSON.stringify(result)).not.toContain(provider.apiKey)
  })

  test('maps an unavailable relay model to a clear error without creating a placeholder', async () => {
    const service = makeService(async () => new Response('{"error":{"message":"No available channel for model gpt-image-2"}}', { status: 503 }))

    const result = await service.generate({ prompt: 'A puppy', workDir: tempDir })

    expect(result).toMatchObject({
      status: 'unavailable',
      availability: 'unavailable',
      errorCode: 'IMAGE_MODEL_UNAVAILABLE',
    })
    await expect(fs.access(path.join(tempDir, 'output', 'imagegen'))).rejects.toThrow()
  })

  test('rejects a non-image Base64 payload and never writes it as a PNG', async () => {
    const service = makeService(async () => Response.json({ data: [{ b64_json: Buffer.from('not-an-image').toString('base64') }] }))

    const result = await service.generate({ prompt: 'A valid image', workDir: tempDir })

    expect(result).toMatchObject({ status: 'failed', errorCode: 'IMAGE_RESPONSE_INVALID_IMAGE' })
    await expect(fs.access(path.join(tempDir, 'output', 'imagegen'))).rejects.toThrow()
  })
})
