import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadBundledImageProcessor } from './bundledImageProcessor.js'

const dirs: string[] = []
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }) })
describe('packaged image processor', () => {
  test('leaves source CLI resolution unchanged without an app root', () => {
    expect(loadBundledImageProcessor(undefined)).toBeNull()
  })
  test('does not silently resolve a missing runtime from the project node_modules', async () => {
    const root = await mkdtemp(join(tmpdir(), 'image-runtime-missing-')); dirs.push(root)
    expect(() => loadBundledImageProcessor(root)).toThrow('IMAGE_PROCESSOR_UNAVAILABLE')
  })
  test('loads only the exact app-owned package, including a Chinese path', async () => {
    const root = await mkdtemp(join(tmpdir(), '图片-runtime-')); dirs.push(root)
    const pkg = join(root, 'binaries', 'image-runtime', 'node_modules', 'sharp')
    await mkdir(pkg, { recursive: true })
    await writeFile(join(pkg, 'package.json'), JSON.stringify({ name: 'sharp', main: 'index.cjs' }))
    await writeFile(join(pkg, 'index.cjs'), 'module.exports = () => ({ metadata: async () => ({ width: 3, height: 2 }) })')
    const sharp = loadBundledImageProcessor(root)!
    expect(await sharp(Buffer.from('test')).metadata()).toEqual({ width: 3, height: 2 })
  })
  test('rejects invalid native module exports with a recoverable diagnostic', async () => {
    const root = await mkdtemp(join(tmpdir(), 'image-runtime-invalid-')); dirs.push(root)
    const pkg = join(root, 'binaries', 'image-runtime', 'node_modules', 'sharp')
    await mkdir(pkg, { recursive: true })
    await writeFile(join(pkg, 'package.json'), JSON.stringify({ name: 'sharp', main: 'index.cjs' }))
    await writeFile(join(pkg, 'index.cjs'), 'module.exports = {}')
    expect(() => loadBundledImageProcessor(root)).toThrow('IMAGE_PROCESSOR_UNAVAILABLE')
  })
})
