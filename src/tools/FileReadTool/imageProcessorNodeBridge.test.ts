import { describe, expect, test } from 'bun:test'
import { createRequire } from 'node:module'
import sharp from 'sharp'
import { createNodeImageProcessor } from './imageProcessorNodeBridge.js'

const require = createRequire(import.meta.url)
const processImage = createNodeImageProcessor(process.env.CLAUDE_BUNDLED_NODE_EXECUTABLE || 'node', require.resolve('sharp'))
describe('desktop Node image processor bridge', () => {
  test('returns actual metadata and bounded encoded pixels without modifying the source', async () => {
    const source = await sharp({ create: { width: 300, height: 200, channels: 3, background: '#f0a030' } }).png().toBuffer()
    const original = Buffer.from(source)
    expect(await processImage(source).metadata()).toMatchObject({ width: 300, height: 200, format: 'png' })
    const jpeg = await processImage(source).resize(90, 60).jpeg({ quality: 70 }).toBuffer()
    expect(await sharp(jpeg).metadata()).toMatchObject({ width: 90, height: 60, format: 'jpeg' })
    const webp = await processImage(source).resize(75, 50).webp().toBuffer()
    expect(await sharp(webp).metadata()).toMatchObject({ width: 75, height: 50, format: 'webp' })
    expect(source).toEqual(original)
  })
  test('also supports the image creator used by Read', async () => {
    const image = await processImage({ create: { width: 12, height: 8, channels: 3, background: { r: 255, g: 170, b: 187 } } }).png().toBuffer()
    expect(await sharp(image).metadata()).toMatchObject({ width: 12, height: 8 })
  })
  test('rejects invalid input and missing executables instead of claiming preview success', async () => {
    await expect(processImage(Buffer.from('not an image')).toBuffer()).rejects.toThrow('IMAGE_PROCESSOR_UNAVAILABLE')
    await expect(createNodeImageProcessor('missing-uiux-node-runtime.exe', require.resolve('sharp'))(Buffer.from('image')).metadata()).rejects.toThrow()
  })
})
