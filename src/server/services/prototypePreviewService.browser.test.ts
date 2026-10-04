import { describe, expect, it } from 'bun:test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { renderPrototypePreview, imageMatchesPreview } from './prototypePreviewService.js'
import { resolvePlaywrightExecutablePath } from '../../tools/PlaywrightTool/runtime.js'
import { readImageWithTokenBudget } from '../../tools/FileReadTool/FileReadTool.js'
import sharp from 'sharp'
import { randomBytes } from 'node:crypto'

describe.skipIf(!resolvePlaywrightExecutablePath())('prototype preview real installed Chromium and image Read', () => {
  it('measures CSS viewports and detects cropped text; Read returns the matching image', async () => {
    const workDir = path.resolve('artifacts/prototype-preview-browser', crypto.randomUUID())
    await mkdir(workDir, { recursive: true })
    const html = '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;padding:24px;font:18px sans-serif}main{max-width:1100px;margin:auto}h1{font-size:36px}button{padding:16px}</style><main><h1>最终版本 / 前后对比 / 原图与修复结果</h1><p>这是用于浏览器回归的页面，不是用户原型。</p><button>开始体验</button></main>'
    await writeFile(path.join(workDir, '03-high-fidelity.html'), html)
    const first = await renderPrototypePreview({ workDir })
    expect(first.status).toBe('rendered')
    expect(first.screenshots.map(s => s.innerWidth)).toEqual([1440, 1024, 390])
    for (const shot of first.screenshots) {
      const read = await readImageWithTokenBudget(shot.path)
      expect(imageMatchesPreview([{ type: 'image', source: { type: 'base64', data: read.file.base64 } }], shot)).toBe(true)
      expect((await readFile(shot.path)).readUInt32BE(16)).toBe(shot.width)
    }
    await writeFile(path.join(workDir, '03-high-fidelity.html'), html.replace('h1{font-size:36px}', 'h1{font-size:36px;width:900px}html,body{overflow-x:hidden}'))
    const cropped = await renderPrototypePreview({ workDir })
    expect(cropped.status).toBe('needs-work')
    expect(cropped.screenshots[2]!.issues.join(' ')).toContain('horizontally clipped')
    expect(cropped.source.sha256).not.toBe(first.source.sha256)
    expect(cropped.screenshots[2]!.sha256).not.toBe(first.screenshots[2]!.sha256)
    // Real photo-sized/noisy payload exercises the normal Read compression path.
    const noise = await sharp(randomBytes(1000 * 700 * 3), { raw: { width: 1000, height: 700, channels: 3 } }).png().toBuffer()
    await writeFile(path.join(workDir, 'noise.png'), noise)
    const exportHtml = html.replace('<main>', '<main data-screen-id="S01">').replace('</main>', '<img src="noise.png" alt="test texture" style="max-width:100%"></main><section data-screen-id="S02"><h2>第二屏 / 明细</h2></section>')
    await writeFile(path.join(workDir, '03-high-fidelity.html'), exportHtml)
    const textured = await renderPrototypePreview({ workDir })
    expect(textured.assets).toHaveLength(1)
    expect(textured.screenshots[0]!.reviewSha256).not.toBe(textured.screenshots[0]!.sha256)
    const imageRead = await readImageWithTokenBudget(textured.screenshots[0]!.path)
    expect(imageMatchesPreview([{ type: 'image', source: { type: 'base64', data: imageRead.file.base64 } }], textured.screenshots[0]!)).toBe(true)
    const secondScreen = await renderPrototypePreview({ workDir, screenId: 'S02' })
    expect(secondScreen.screenId).toBe('S02')
    await writeFile(path.join(workDir, 'receipt.json'), JSON.stringify({ first, cropped, textured, secondScreen }, null, 2))
    console.log('Real-browser evidence:', workDir)
  }, 90_000)
})
