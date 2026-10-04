import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { renderPrototypePreview, formatPrototypePreviewReceipt, parsePrototypePreviewReceipt, imageMatchesPreview } from './prototypePreviewService.js'

const dirs: string[] = []
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')
const fakePng = (width: number, height: number) => { const b = Buffer.from(png); b.writeUInt32BE(width,16); b.writeUInt32BE(height,20); return b }
async function setup(options: { delayed?: boolean; overflow?: boolean; mutate?: boolean } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'prototype-preview-')); dirs.push(root)
  await writeFile(path.join(root, '03-high-fidelity.html'), '<h1>current</h1>')
  const widths: number[] = []; let closed = false
  const launchBrowser = async () => ({
    newContext: async ({ viewport }: any) => {
      widths.push(viewport.width)
      return { route: async () => {}, close: async () => {}, newPage: async () => ({
        setDefaultTimeout() {}, goto: async () => {},
        evaluate: async (_fn: unknown, kind?: string) => kind === 'measure' ? { innerWidth: viewport.width, innerHeight: viewport.height, scrollWidth: viewport.width, issues: options.overflow ? ['text clipped on right'] : [] } : undefined,
        screenshot: async ({ path: p }: any) => {
          if (options.delayed) await Bun.sleep(25)
          if (options.mutate) await writeFile(path.join(root, '03-high-fidelity.html'), '<h1>changed while rendering</h1>')
          await writeFile(p, fakePng(viewport.width, viewport.height))
        },
      }) }
    }, close: async () => { closed = true },
  })
  return { root, launchBrowser: launchBrowser as any, widths, isClosed: () => closed }
}
afterEach(async () => { for (const dir of dirs.splice(0)) { if (path.dirname(dir) !== path.resolve(tmpdir()) || !path.basename(dir).startsWith('prototype-preview-')) throw new Error('Unsafe test cleanup'); await rm(dir,{recursive:true,force:true}) } })

describe('controlled prototype preview', () => {
  it('waits for all PNG writes and binds exact viewport, HTML and PNG hashes', async () => {
    const s=await setup({delayed:true}); const r=await renderPrototypePreview({workDir:s.root,fidelity:'high',launchBrowser:s.launchBrowser})
    expect(s.widths).toEqual([1440,1024,390]); expect(s.isClosed()).toBe(true)
    expect(r.screenshots).toHaveLength(3)
    expect(r.source.sha256).toBe(createHash('sha256').update('<h1>current</h1>').digest('hex'))
    for(const image of r.screenshots) expect(image.sha256).toBe(createHash('sha256').update(await readFile(image.path)).digest('hex'))
    expect(parsePrototypePreviewReceipt(formatPrototypePreviewReceipt(r))).toEqual(r)
  })
  it('uses distinct render paths so an earlier Read cannot silently become final evidence', async () => {
    const s=await setup(); const a=await renderPrototypePreview({workDir:s.root,launchBrowser:s.launchBrowser}); const b=await renderPrototypePreview({workDir:s.root,launchBrowser:s.launchBrowser})
    expect(a.screenshots[0]!.path).not.toBe(b.screenshots[0]!.path)
    const shot=a.screenshots[0]!; const bytes=await readFile(shot.path)
    expect(imageMatchesPreview([{type:'image',source:{type:'base64',data:bytes.toString('base64')}}],shot)).toBe(true)
    expect(imageMatchesPreview([{type:'image',source:{type:'base64',data:png.toString('base64')}}],shot)).toBe(false)
    expect(imageMatchesPreview('image saved',shot)).toBe(false)
  })
  it('reports measured layout failures without claiming visual acceptance', async () => {
    const s=await setup({overflow:true}); const r=await renderPrototypePreview({workDir:s.root,launchBrowser:s.launchBrowser})
    expect(r.status).toBe('needs-work'); expect(r.screenshots[2]!.issues).toContain('text clipped on right')
  })
  it('rejects a source changed while rendering and closes its browser', async () => {
    const s=await setup({mutate:true}); await expect(renderPrototypePreview({workDir:s.root,launchBrowser:s.launchBrowser})).rejects.toThrow('HTML_CHANGED_DURING_RENDER'); expect(s.isClosed()).toBe(true)
  })
  it('rejects an output path occupied by a file', async () => {
    const s=await setup(); await mkdir(path.join(s.root,'imgs')); await writeFile(path.join(s.root,'imgs','qa'),'not a directory')
    await expect(renderPrototypePreview({workDir:s.root,launchBrowser:s.launchBrowser})).rejects.toThrow()
  })
  it('does not accept malformed receipts or words claiming screenshot success', () => {
    expect(parsePrototypePreviewReceipt('Screenshot written: high-mobile-390x844.png')).toBeNull()
    expect(parsePrototypePreviewReceipt('<prototype-preview-receipt>{"schemaVersion":1}</prototype-preview-receipt>')).toBeNull()
  })
})
