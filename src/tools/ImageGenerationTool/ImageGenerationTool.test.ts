import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { findToolByName } from '../../Tool.js'
import { getAllBaseTools } from '../../tools.js'
import { ImageGenerationTool } from './ImageGenerationTool.js'

const PIXEL_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL9WQAAAABJRU5ErkJggg=='
let originalServerUrl: string | undefined
let originalProviderId: string | undefined
let server: ReturnType<typeof Bun.serve> | null = null
let tempDir = ''

beforeEach(async () => {
  originalServerUrl = process.env.CC_JIANGXIA_DESKTOP_SERVER_URL
  originalProviderId = process.env.CC_JIANGXIA_PROVIDER_ID
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'image-generation-tool-'))
})

afterEach(async () => {
  server?.stop(true)
  server = null
  if (originalServerUrl === undefined) delete process.env.CC_JIANGXIA_DESKTOP_SERVER_URL
  else process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = originalServerUrl
  if (originalProviderId === undefined) delete process.env.CC_JIANGXIA_PROVIDER_ID
  else process.env.CC_JIANGXIA_PROVIDER_ID = originalProviderId
  await fs.rm(tempDir, { recursive: true, force: true })
})

function toolContext() {
  return { abortController: new AbortController() } as Parameters<typeof ImageGenerationTool.call>[1]
}

describe('ImageGenerationTool', () => {
  test('is registered as an always-loaded application-wide base tool', () => {
    expect(findToolByName(getAllBaseTools(), 'image_generation')).toBe(ImageGenerationTool)
  })

  test('uses a strict object schema and requires a prompt for a paid generation call', () => {
    expect(ImageGenerationTool.inputSchema.safeParse({ operation: 'preflight' }).success).toBe(true)
    expect(ImageGenerationTool.inputSchema.safeParse({ operation: 'generate' }).success).toBe(false)
    expect(ImageGenerationTool.inputSchema.safeParse({ operation: 'generate', prompt: 'A rendered image', apiKey: 'never' }).success).toBe(false)
    expect(ImageGenerationTool.alwaysLoad).toBe(true)
  })

  test('requires bundled Hallmark and Playwright review before HTML/CSS fallback delivery', async () => {
    const prompt = await ImageGenerationTool.prompt()

    expect(prompt).toContain('skill="hallmark"')
    expect(prompt).toContain('Playwright to render real PNGs')
    expect(prompt).toContain('browser-rendered visual artifact')
  })

  test('sends a read-only preflight through the desktop server without requesting a fallback choice', async () => {
    let received: { path?: string; body?: unknown } = {}
    server = Bun.serve({
      port: 0,
      fetch: async (request) => {
        received = { path: new URL(request.url).pathname, body: await request.json() }
        return Response.json({
          status: 'unavailable', availability: 'unavailable', model: 'gpt-image-2', message: 'No image channel is configured.', errorCode: 'IMAGE_MODEL_UNAVAILABLE',
        })
      },
    })
    process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = `http://127.0.0.1:${server.port}`
    process.env.CC_JIANGXIA_PROVIDER_ID = 'bound-provider'

    const result = await ImageGenerationTool.call({ operation: 'preflight' }, toolContext(), null as never, null as never)

    const block = ImageGenerationTool.mapToolResultToToolResultBlockParam(result.data, 'image-call')

    expect(ImageGenerationTool.isReadOnly({ operation: 'preflight' })).toBe(true)
    expect(result.data).toMatchObject({ status: 'unavailable', errorCode: 'IMAGE_MODEL_UNAVAILABLE' })
    expect(result.data.fallback).toBeUndefined()
    expect(typeof block.content).toBe('string')
    expect(block.content).not.toContain('AskUserQuestion')
    expect(received).toEqual({ path: '/api/images/preflight', body: { providerId: 'bound-provider' } })
  })

  test('sends a generation prompt to the desktop server and returns an inline visual result only for a real saved image', async () => {
    const imagePath = path.join(tempDir, 'generated.png')
    await fs.writeFile(imagePath, Buffer.from(PIXEL_PNG_BASE64, 'base64'))
    let received: { path?: string; body?: Record<string, unknown> } = {}
    server = Bun.serve({
      port: 0,
      fetch: async (request) => {
        received = { path: new URL(request.url).pathname, body: await request.json() as Record<string, unknown> }
        return Response.json({
          status: 'generated', availability: 'available', model: 'gpt-image-2', message: 'Generated a real provider image.',
          imagePath, promptPath: `${imagePath}.prompt.md`, reportPath: `${imagePath}.report.json`, mimeType: 'image/png', bytes: 70,
        })
      },
    })
    process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = `http://127.0.0.1:${server.port}`
    process.env.CC_JIANGXIA_PROVIDER_ID = 'bound-provider'

    const result = await ImageGenerationTool.call({
      operation: 'generate', prompt: 'Luxury tea on stone, editorial composition', size: '1536x1024', quality: 'high', output_format: 'png', file_name: 'tea.png',
    }, toolContext(), null as never, null as never)
    const block = ImageGenerationTool.mapToolResultToToolResultBlockParam(result.data, 'image-call')

    expect(ImageGenerationTool.isReadOnly({ operation: 'generate', prompt: 'x' })).toBe(false)
    expect(received.path).toBe('/api/images/generate')
    expect(received.body).toMatchObject({
      providerId: 'bound-provider', prompt: 'Luxury tea on stone, editorial composition', size: '1536x1024', quality: 'high', outputFormat: 'png', fileName: 'tea.png',
    })
    expect((received.body?.workDir as string).length).toBeGreaterThan(0)
    expect(result.data.fallback).toBeUndefined()
    expect(block.type).toBe('tool_result')
    expect(Array.isArray(block.content)).toBe(true)
    expect((block.content as Array<{ type: string }>).map(item => item.type)).toEqual(['text', 'image'])
  })

  test('requires AskUserQuestion fallback choices after a real image model is unavailable', async () => {
    server = Bun.serve({
      port: 0,
      fetch: () => Response.json({
        status: 'unavailable', availability: 'unavailable', model: 'gpt-image-2',
        message: 'The configured provider has no available image channel for gpt-image-2. No image was generated.',
        errorCode: 'IMAGE_MODEL_UNAVAILABLE',
      }),
    })
    process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = `http://127.0.0.1:${server.port}`

    const result = await ImageGenerationTool.call({ operation: 'generate', prompt: 'A real image' }, toolContext(), null as never, null as never)
    const block = ImageGenerationTool.mapToolResultToToolResultBlockParam(result.data, 'image-call')

    expect(result.data).toMatchObject({
      status: 'unavailable',
      errorCode: 'IMAGE_MODEL_UNAVAILABLE',
      fallback: {
        required: true,
        reason: 'The configured provider has no available image channel for gpt-image-2. No image was generated.',
        errorCode: 'IMAGE_MODEL_UNAVAILABLE',
        htmlCssWorkflow: {
          requiredSkill: 'hallmark',
          requiredBrowserTool: 'Playwright',
          stages: ['design', 'render', 'audit', 'revise-and-rerender'],
        },
        choices: [
          { id: 'python_programmatic_image' },
          { id: 'html_css_visual_artifact' },
          { id: 'no_fallback' },
        ],
      },
    })
    expect(typeof block.content).toBe('string')
    expect(block.content).toContain('AskUserQuestion')
    expect(block.content).toContain('IMAGE_MODEL_UNAVAILABLE')
    expect(block.content).toContain('Python 程序化生成图')
    expect(block.content).toContain('HTML/CSS 视觉稿')
    expect(block.content).toContain('Skill with skill="hallmark"')
    expect(block.content).toContain('render the result with Playwright')
    expect(block.content).not.toContain('Generated a real provider image')
  })

  test('requires AskUserQuestion fallback choices after a failed generation request', async () => {
    server = Bun.serve({
      port: 0,
      fetch: () => Response.json({
        status: 'failed', availability: 'unverified', model: 'gpt-image-2',
        message: 'The image provider request timed out before an image was returned.',
        errorCode: 'IMAGE_PROVIDER_TIMEOUT',
      }),
    })
    process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = `http://127.0.0.1:${server.port}`

    const result = await ImageGenerationTool.call({ operation: 'generate', prompt: 'A real image' }, toolContext(), null as never, null as never)
    const block = ImageGenerationTool.mapToolResultToToolResultBlockParam(result.data, 'image-call')

    expect(result.data).toMatchObject({
      status: 'failed',
      errorCode: 'IMAGE_PROVIDER_TIMEOUT',
      fallback: { required: true, errorCode: 'IMAGE_PROVIDER_TIMEOUT' },
    })
    expect(typeof block.content).toBe('string')
    expect(block.content).toContain('MANDATORY NEXT ACTION: Call AskUserQuestion now.')
    expect(block.content).toContain('Do not start a Python or HTML/CSS fallback')
  })

  test('requires a fallback choice when the desktop image service is absent', async () => {
    delete process.env.CC_JIANGXIA_DESKTOP_SERVER_URL

    const result = await ImageGenerationTool.call({ operation: 'generate', prompt: 'A real image' }, toolContext(), null as never, null as never)
    const block = ImageGenerationTool.mapToolResultToToolResultBlockParam(result.data, 'image-call')

    expect(result.data).toMatchObject({
      status: 'unavailable',
      errorCode: 'IMAGE_DESKTOP_SERVER_UNAVAILABLE',
      fallback: { required: true, errorCode: 'IMAGE_DESKTOP_SERVER_UNAVAILABLE' },
    })
    expect(typeof block.content).toBe('string')
    expect(block.content).toContain('AskUserQuestion')
  })
})
