import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

type ImageProcessorMockState = {
  metadata: { width?: number; height?: number; format?: string }
  resizeCalls: Array<{ width: number; height: number }>
  outputBuffer: Buffer
}

const mockStateKey = '__ccJiangxiaImageProcessorMock'

function getMockState(): ImageProcessorMockState {
  return (globalThis as unknown as Record<string, ImageProcessorMockState>)[
    mockStateKey
  ]
}

function setMockState(state: ImageProcessorMockState): void {
  const globals = globalThis as unknown as Record<
    string,
    ImageProcessorMockState
  >
  globals[mockStateKey] = state
}

mock.module('./imageProcessor.js', () => ({
  getImageProcessor: async () => {
    return () => {
      const instance = {
        metadata: async () => getMockState().metadata,
        resize: (width: number, height: number) => {
          getMockState().resizeCalls.push({ width, height })
          return instance
        },
        jpeg: () => instance,
        png: () => instance,
        webp: () => instance,
        toBuffer: async () => getMockState().outputBuffer,
      }
      return instance
    }
  },
}))

const { readImageWithTokenBudget } = await import('./FileReadTool.js')

function makePngLikeBuffer(size: number): Buffer {
  const buffer = Buffer.alloc(size)
  buffer[0] = 0x89
  buffer[1] = 0x50
  buffer[2] = 0x4e
  buffer[3] = 0x47
  return buffer
}

describe('readImageWithTokenBudget', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'file-read-image-test-'))
    setMockState({
      metadata: { width: 1920, height: 1080, format: 'png' },
      resizeCalls: [],
      outputBuffer: Buffer.from('encoded'),
    })
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  test('does not over-compress ordinary screenshots using base64 length as token count', async () => {
    const imageBuffer = makePngLikeBuffer(24_000)
    const filePath = join(tempDir, 'screenshot.png')
    await writeFile(filePath, imageBuffer)

    const result = await readImageWithTokenBudget(filePath, 3_000)

    expect(result.file.base64).toBe(imageBuffer.toString('base64'))
    expect(result.file.dimensions).toEqual({
      originalWidth: 1920,
      originalHeight: 1080,
      displayWidth: 1920,
      displayHeight: 1080,
    })
    expect(getMockState().resizeCalls).toEqual([])
  })
})
