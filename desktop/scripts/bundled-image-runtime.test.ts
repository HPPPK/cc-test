import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { copyBundledImageRuntime, imageRuntimeTarget } from './bundled-image-runtime.js'
import sharp from 'sharp'
import { loadBundledImageProcessor } from '../../src/tools/FileReadTool/bundledImageProcessor.js'
const dirs: string[] = []
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }) })
describe('bundled image runtime', () => {
  test('maps native targets and refuses unknown targets', () => {
    expect(imageRuntimeTarget('x86_64-pc-windows-msvc')).toBe('win32-x64')
    expect(imageRuntimeTarget('aarch64-apple-darwin')).toBe('darwin-arm64')
    expect(() => imageRuntimeTarget('unknown')).toThrow('Unsupported')
  })
  test('ships a working native processor outside the source dependency tree', async () => {
    const appRoot = await mkdtemp(path.join(tmpdir(), '独立-image-runtime-')); dirs.push(appRoot)
    const triple = process.platform === 'win32' ? 'x86_64-pc-windows-msvc' : process.platform === 'darwin' ? (process.arch === 'arm64' ? 'aarch64' : 'x86_64') + '-apple-darwin' : (process.arch === 'arm64' ? 'aarch64' : 'x86_64') + '-unknown-linux-gnu'
    const receipt = await copyBundledImageRuntime(path.resolve(import.meta.dir, '../..'), appRoot, triple)
    expect(receipt.packages['@img/sharp-' + receipt.target]).toBeTruthy()
    const packagedSharp = loadBundledImageProcessor(appRoot, process.env.CLAUDE_BUNDLED_NODE_EXECUTABLE || 'node')!
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#e48720' } }).png().toBuffer()
    expect((await packagedSharp(png).metadata()).width).toBe(8)
    expect((await packagedSharp(png).resize(2, 2).jpeg({quality:80}).toBuffer()).length).toBeGreaterThan(0)
  }, 30000)
  test('build and native resources include the image runtime', async () => {
    const script = await readFile(new URL('./build-sidecars.ts', import.meta.url), 'utf8')
    const config = JSON.parse(await readFile(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'))
    expect(script).toContain('await copyBundledImageRuntime(')
    expect(config.bundle.resources).toContain('binaries/image-runtime')
  })
})
