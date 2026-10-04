import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { readImageWithTokenBudget } from './FileReadTool.js'

const MAX_REVIEW_PREVIEW_BYTES = 192 * 1024

describe('readImageWithTokenBudget real image processor', () => {
  let tempDir = ''

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true })
  })

  test('turns a real provider-sized PNG into a bounded visual preview', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'file-read-real-image-'))
    const filePath = join(tempDir, 'provider-generated.png')
    const width = 1536
    const height = 1024
    const pixels = Buffer.allocUnsafe(width * height * 3)

    for (let index = 0; index < pixels.length; index += 1) {
      pixels[index] = (index * 37 + Math.floor(index / 3) * 17) % 256
    }

    await sharp(pixels, { raw: { width, height, channels: 3 } })
      .png({ compressionLevel: 0 })
      .toFile(filePath)

    expect((await stat(filePath)).size).toBeGreaterThan(MAX_REVIEW_PREVIEW_BYTES)

    const result = await readImageWithTokenBudget(filePath)
    const previewBytes = Buffer.from(result.file.base64, 'base64').length

    expect(previewBytes).toBeLessThanOrEqual(MAX_REVIEW_PREVIEW_BYTES)
    expect(result.file.originalSize).toBeGreaterThan(MAX_REVIEW_PREVIEW_BYTES)
    expect(result.file.dimensions).toEqual(expect.objectContaining({
      originalWidth: width,
      originalHeight: height,
    }))
  })
})
