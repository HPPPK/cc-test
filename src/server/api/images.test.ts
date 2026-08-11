import { describe, expect, test } from 'bun:test'
import { createImagesApiHandler } from './images.js'
import type { ImageGenerationResult } from '../services/imageGenerationService.js'

const preflightResult: ImageGenerationResult = {
  status: 'unverified',
  availability: 'unverified',
  model: 'gpt-image-2',
  message: 'Catalog does not list the image model.',
  errorCode: 'IMAGE_MODEL_NOT_LISTED',
}

function request(path: string, body: unknown, method = 'POST') {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  })
}

describe('images API', () => {
  test('passes an explicitly scoped preflight to the image service', async () => {
    let received: unknown
    const handle = createImagesApiHandler({
      async preflight(input) {
        received = input
        return preflightResult
      },
      async generate() {
        throw new Error('not expected')
      },
    })

    const response = await handle(
      request('/api/images/preflight', { providerId: 'session-provider', model: 'gpt-image-2' }),
      new URL('http://localhost/api/images/preflight'),
      ['api', 'images', 'preflight'],
    )

    expect(response.status).toBe(200)
    expect(received).toEqual({ providerId: 'session-provider', model: 'gpt-image-2' })
    expect(await response.json()).toEqual(preflightResult)
  })

  test('accepts generation options but keeps the Provider key out of the request contract', async () => {
    let received: unknown
    const generated: ImageGenerationResult = {
      status: 'generated',
      availability: 'available',
      model: 'gpt-image-2',
      message: 'Generated image.',
      imagePath: 'C:/workspace/output/imagegen/example.png',
      mimeType: 'image/png',
      bytes: 123,
    }
    const handle = createImagesApiHandler({
      async preflight() {
        throw new Error('not expected')
      },
      async generate(input) {
        received = input
        return generated
      },
    })

    const response = await handle(
      request('/api/images/generate', {
        providerId: 'session-provider',
        prompt: 'Editorial product image',
        size: '1536x1024',
        quality: 'high',
        outputFormat: 'png',
        workDir: 'C:/workspace',
        fileName: 'example.png',
      }),
      new URL('http://localhost/api/images/generate'),
      ['api', 'images', 'generate'],
    )

    expect(response.status).toBe(200)
    expect(received).toEqual({
      providerId: 'session-provider',
      prompt: 'Editorial product image',
      size: '1536x1024',
      quality: 'high',
      outputFormat: 'png',
      workDir: 'C:/workspace',
      fileName: 'example.png',
    })
    expect(await response.json()).toEqual(generated)
  })

  test('rejects missing prompt, extra fields, and unsupported routes before the service is invoked', async () => {
    let calls = 0
    const handle = createImagesApiHandler({
      async preflight() {
        calls += 1
        return preflightResult
      },
      async generate() {
        calls += 1
        return preflightResult
      },
    })

    const missingPrompt = await handle(
      request('/api/images/generate', { workDir: 'C:/workspace' }),
      new URL('http://localhost/api/images/generate'),
      ['api', 'images', 'generate'],
    )
    const secretAttempt = await handle(
      request('/api/images/generate', { prompt: 'x', workDir: 'C:/workspace', apiKey: 'do-not-accept' }),
      new URL('http://localhost/api/images/generate'),
      ['api', 'images', 'generate'],
    )
    const unknown = await handle(
      request('/api/images/unknown', {}),
      new URL('http://localhost/api/images/unknown'),
      ['api', 'images', 'unknown'],
    )

    expect(missingPrompt.status).toBe(400)
    expect(secretAttempt.status).toBe(400)
    expect(unknown.status).toBe(404)
    expect(calls).toBe(0)
  })
})
