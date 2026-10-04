import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { Browser } from 'playwright'
import { z } from 'zod/v4'

import { PROTOTYPE_VIEWPORTS, renderPrototypePreviewInBrowser } from './prototypePreviewRenderer.js'

export const PROTOTYPE_PREVIEW_TOOL = 'PrototypePreview'
export { PROTOTYPE_VIEWPORTS }
const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex')
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/)
const screenshotSchema = z.object({
  path: z.string(),
  sha256: hashSchema,
  reviewSha256: hashSchema.optional(),
  viewport: z.enum(['desktop', 'tablet', 'mobile']),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  innerWidth: z.number(),
  innerHeight: z.number(),
  issues: z.array(z.string()),
})
export const prototypePreviewSchema = z.object({
  schemaVersion: z.literal(1),
  runId: z.string().uuid(),
  fidelity: z.enum(['low', 'mid', 'high']),
  screenId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
  source: z.object({ path: z.string(), sha256: hashSchema }),
  status: z.enum(['rendered', 'needs-work']),
  screenshots: z.array(screenshotSchema).min(1),
  blockedResources: z.array(z.string()),
  assets: z.array(z.object({ path: z.string(), sha256: hashSchema })).optional(),
  evidenceBoundary: z.literal('render-and-layout-only-not-visual-or-interaction-acceptance'),
})
export type PrototypePreviewReceipt = z.infer<typeof prototypePreviewSchema>
export type PrototypePreviewScreenshot = PrototypePreviewReceipt['screenshots'][number]
export async function renderPrototypePreview(options: { workDir: string; fidelity?: 'low' | 'mid' | 'high'; screenId?: string; signal?: AbortSignal; launchBrowser?: () => Promise<Browser> }): Promise<PrototypePreviewReceipt> {
  if (options.launchBrowser) return renderPrototypePreviewInBrowser({ ...options, launchBrowser: options.launchBrowser })
  const { runPrototypePreviewWithNode } = await import('./prototypePreviewNodeBridge.js')
  const receipt = await runPrototypePreviewWithNode(options)
  // The Read host may downsample photo-heavy PNGs. Bind its exact review payload
  // as well as the original PNG, rather than rejecting legitimate compression.
  const { readImageWithTokenBudget } = await import('../../tools/FileReadTool/FileReadTool.js')
  for (const shot of receipt.screenshots) {
    const review = await readImageWithTokenBudget(shot.path)
    if (sha(await readFile(shot.path)) !== shot.sha256) throw new Error('PREVIEW_PNG_CHANGED_BEFORE_READ')
    shot.reviewSha256 = sha(Buffer.from(review.file.base64, 'base64'))
  }
  return receipt
}

export function formatPrototypePreviewReceipt(receipt:PrototypePreviewReceipt):string { return '<prototype-preview-receipt>'+JSON.stringify(receipt)+'</prototype-preview-receipt>' }
export function parsePrototypePreviewReceipt(content:unknown):PrototypePreviewReceipt|null {
  if(typeof content!=='string') return null
  const match=content.match(/<prototype-preview-receipt>([\s\S]*?)<\/prototype-preview-receipt>/)
  try {
    const parsed=prototypePreviewSchema.safeParse(JSON.parse(match?.[1] || 'null'))
    if(!parsed.success) return null
    const r=parsed.data, expected=r.fidelity==='high'?PROTOTYPE_VIEWPORTS:PROTOTYPE_VIEWPORTS.slice(0,1)
    if(r.screenshots.length!==expected.length || expected.some(v=>!r.screenshots.some(s=>s.viewport===v.viewport&&s.width===v.width&&s.height===v.height))) return null
    return r
  } catch { return null }
}
export function imageMatchesPreview(content:unknown,screenshot:PrototypePreviewScreenshot):boolean {
  if(Array.isArray(content)) return content.some(block=>imageMatchesPreview(block,screenshot))
  if(!content || typeof content!=='object') return false
  const block=content as {type?:string;source?:{type?:string;data?:string};content?:unknown}
  if(block.type==='image'&&block.source?.type==='base64'&&typeof block.source.data==='string') return [screenshot.sha256, screenshot.reviewSha256].includes(sha(Buffer.from(block.source.data,'base64')))
  return block.content ? imageMatchesPreview(block.content,screenshot) : false
}
