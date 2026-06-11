import { beforeEach, describe, expect, mock, test } from 'bun:test'

type ImageProcessorMockState = {
  metadata: { width?: number; height?: number; format?: string }
  resizeCalls: Array<{ width: number; height: number }>
  encodeCalls: Array<{ format: string; options?: unknown }>
  outputBuffer: Buffer
  outputBuffers?: Buffer[]
  processorError?: Error
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

mock.module('../../tools/FileReadTool/imageProcessor.js', () => ({
  getImageProcessor: async () => {
    if (getMockState().processorError) {
      throw getMockState().processorError
    }
    return () => {
      const instance = {
        metadata: async () => getMockState().metadata,
        resize: (width: number, height: number) => {
          getMockState().resizeCalls.push({ width, height })
          return instance
        },
        jpeg: (options?: unknown) => {
          getMockState().encodeCalls.push({ format: 'jpeg', options })
          return instance
        },
        png: (options?: unknown) => {
          getMockState().encodeCalls.push({ format: 'png', options })
          return instance
        },
        webp: (options?: unknown) => {
          getMockState().encodeCalls.push({ format: 'webp', options })
          return instance
        },
        toBuffer: async () => {
          const state = getMockState()
          return state.outputBuffers?.shift() ?? state.outputBuffer
        },
      }
      return instance
    }
  },
}))

const {
  ImageResizeError,
  downsampleImageBufferToVisionTokenBudget,
  maybeResizeAndDownsampleImageBuffer,
} = await import('../imageResizer.js')

const LARGE_ENCODED_BUFFER = Buffer.alloc(4 * 1024 * 1024)

function pngHeader(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(24)
  buffer[0] = 0x89
  buffer[1] = 0x50
  buffer[2] = 0x4e
  buffer[3] = 0x47
  buffer.writeUInt32BE(width, 16)
  buffer.writeUInt32BE(height, 20)
  return buffer
}

describe('imageResizer', () => {
  beforeEach(() => {
    setMockState({
      metadata: { width: 3000, height: 1000, format: 'png' },
      resizeCalls: [],
      encodeCalls: [],
      outputBuffer: Buffer.from('encoded'),
    })
  })

  test('downsamples images by vision token pixel budget', async () => {
    const result = await downsampleImageBufferToVisionTokenBudget(
      Buffer.from('image'),
      5_000_000,
      'png',
      1_000,
    )

    expect(result.mediaType).toBe('png')
    expect(result.dimensions).toEqual({
      originalWidth: 3000,
      originalHeight: 1000,
      displayWidth: 1500,
      displayHeight: 500,
    })
    expect(getMockState().resizeCalls[0]).toEqual({
      width: 1500,
      height: 500,
    })
  })

  test('keeps readable screenshots at original dimensions when size and limits allow', async () => {
    setMockState({
      metadata: { width: 1920, height: 1080, format: 'png' },
      resizeCalls: [],
      outputBuffer: Buffer.from('encoded'),
    })
    const imageBuffer = Buffer.alloc(24_000)

    const result = await maybeResizeAndDownsampleImageBuffer(
      imageBuffer,
      imageBuffer.length,
      'png',
    )

    expect(result.buffer).toBe(imageBuffer)
    expect(result.dimensions).toEqual({
      originalWidth: 1920,
      originalHeight: 1080,
      displayWidth: 1920,
      displayHeight: 1080,
    })
    expect(getMockState().resizeCalls).toEqual([])
  })

  test('throws a user-facing error for empty image buffers', async () => {
    await expect(
      maybeResizeAndDownsampleImageBuffer(Buffer.alloc(0), 0, 'png'),
    ).rejects.toThrow(ImageResizeError)
  })

  test('compresses images with missing dimensions when the payload is too large', async () => {
    setMockState({
      metadata: { format: 'jpg' },
      resizeCalls: [],
      encodeCalls: [],
      outputBuffer: Buffer.from('compressed-jpeg'),
    })

    const result = await maybeResizeAndDownsampleImageBuffer(
      Buffer.from('image'),
      4 * 1024 * 1024,
      'jpg',
    )

    expect(result).toEqual({
      buffer: Buffer.from('compressed-jpeg'),
      mediaType: 'jpeg',
    })
    expect(getMockState().encodeCalls).toEqual([
      { format: 'jpeg', options: { quality: 80 } },
    ])
  })

  test('keeps images with missing dimensions when the payload already fits', async () => {
    setMockState({
      metadata: { format: 'webp' },
      resizeCalls: [],
      encodeCalls: [],
      outputBuffer: Buffer.from('unused'),
    })

    const imageBuffer = Buffer.from('small-image')
    const result = await maybeResizeAndDownsampleImageBuffer(
      imageBuffer,
      imageBuffer.length,
      'webp',
    )

    expect(result).toEqual({ buffer: imageBuffer, mediaType: 'webp' })
    expect(getMockState().encodeCalls).toEqual([])
  })

  test('tries lossless png/webp before jpeg when only payload size is too large', async () => {
    setMockState({
      metadata: { width: 1200, height: 900, format: 'png' },
      resizeCalls: [],
      encodeCalls: [],
      outputBuffer: Buffer.from('unused'),
      outputBuffers: [
        LARGE_ENCODED_BUFFER,
        LARGE_ENCODED_BUFFER,
        Buffer.from('jpeg-fits'),
      ],
    })

    const result = await maybeResizeAndDownsampleImageBuffer(
      Buffer.from('large-png'),
      4 * 1024 * 1024,
      'png',
    )

    expect(result.mediaType).toBe('jpeg')
    expect(result.buffer).toEqual(Buffer.from('jpeg-fits'))
    expect(getMockState().resizeCalls).toEqual([])
    expect(getMockState().encodeCalls.map((call) => call.format)).toEqual([
      'png',
      'webp',
      'jpeg',
    ])
  })

  test('resizes images that exceed hard dimension limits', async () => {
    setMockState({
      metadata: { width: 4000, height: 1000, format: 'webp' },
      resizeCalls: [],
      encodeCalls: [],
      outputBuffer: Buffer.from('resized-webp'),
    })

    const result = await maybeResizeAndDownsampleImageBuffer(
      Buffer.from('wide-webp'),
      4 * 1024 * 1024,
      'webp',
    )

    expect(result.mediaType).toBe('webp')
    expect(result.dimensions).toEqual({
      originalWidth: 4000,
      originalHeight: 1000,
      displayWidth: 2000,
      displayHeight: 500,
    })
    expect(getMockState().resizeCalls[0]).toEqual({ width: 2000, height: 500 })
  })

  test('uses readable jpeg fallback when hard and soft candidates are too large', async () => {
    setMockState({
      metadata: { width: 6000, height: 6000, format: 'png' },
      resizeCalls: [],
      encodeCalls: [],
      outputBuffer: Buffer.from('unused'),
      outputBuffers: [
        LARGE_ENCODED_BUFFER,
        LARGE_ENCODED_BUFFER,
        LARGE_ENCODED_BUFFER,
        LARGE_ENCODED_BUFFER,
        LARGE_ENCODED_BUFFER,
        LARGE_ENCODED_BUFFER,
        LARGE_ENCODED_BUFFER,
        LARGE_ENCODED_BUFFER,
        Buffer.from('readable-jpeg'),
      ],
    })

    const result = await maybeResizeAndDownsampleImageBuffer(
      Buffer.from('huge-png'),
      4 * 1024 * 1024,
      'png',
    )

    expect(result.mediaType).toBe('jpeg')
    expect(result.dimensions?.displayWidth).toBe(1568)
    expect(result.dimensions?.displayHeight).toBe(1568)
    expect(getMockState().resizeCalls).toContainEqual({
      width: 2000,
      height: 2000,
    })
    expect(getMockState().resizeCalls).toContainEqual({
      width: 1568,
      height: 1568,
    })
  })

  test('falls back to raw image data when processing fails but size and dimensions fit', async () => {
    setMockState({
      metadata: {},
      resizeCalls: [],
      encodeCalls: [],
      outputBuffer: Buffer.from('unused'),
      processorError: new Error('Native image processor module not available'),
    })
    const imageBuffer = pngHeader(100, 100)

    const result = await maybeResizeAndDownsampleImageBuffer(
      imageBuffer,
      imageBuffer.length,
      'jpeg',
    )

    expect(result).toEqual({ buffer: imageBuffer, mediaType: 'png' })
  })

  test('rejects oversized png dimensions when processing fails', async () => {
    setMockState({
      metadata: {},
      resizeCalls: [],
      encodeCalls: [],
      outputBuffer: Buffer.from('unused'),
      processorError: new Error('pixel limit exceeded'),
    })

    await expect(
      maybeResizeAndDownsampleImageBuffer(pngHeader(4000, 3000), 24, 'png'),
    ).rejects.toThrow(/dimensions exceed/)
  })

  test('downsamples token-budget images again for readable fallback', async () => {
    setMockState({
      metadata: { width: 6000, height: 6000, format: 'jpeg' },
      resizeCalls: [],
      encodeCalls: [],
      outputBuffer: Buffer.from('unused'),
      outputBuffers: [
        LARGE_ENCODED_BUFFER,
        LARGE_ENCODED_BUFFER,
        LARGE_ENCODED_BUFFER,
        Buffer.from('readable-token-jpeg'),
      ],
    })

    const result = await downsampleImageBufferToVisionTokenBudget(
      Buffer.from('image'),
      4 * 1024 * 1024,
      'jpeg',
      6_000,
    )

    expect(result.mediaType).toBe('jpeg')
    expect(result.dimensions?.displayWidth).toBe(1568)
    expect(result.dimensions?.displayHeight).toBe(1568)
  })

  test('throws when token-budget downsampling cannot produce a safe candidate', async () => {
    setMockState({
      metadata: { width: 1000, height: 1000, format: 'webp' },
      resizeCalls: [],
      encodeCalls: [],
      outputBuffer: LARGE_ENCODED_BUFFER,
    })

    await expect(
      downsampleImageBufferToVisionTokenBudget(
        Buffer.from('image'),
        4 * 1024 * 1024,
        'webp',
        100,
      ),
    ).rejects.toThrow(/Unable to downsample image/)
  })
})
