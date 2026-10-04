import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import type { Browser } from 'playwright'
import type { PrototypePreviewReceipt, PrototypePreviewScreenshot } from './prototypePreviewService.js'
export const PROTOTYPE_VIEWPORTS = [
  { viewport: 'desktop', width: 1440, height: 1000 },
  { viewport: 'tablet', width: 1024, height: 900 },
  { viewport: 'mobile', width: 390, height: 844 },
] as const
const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex')
const origin = 'https://prototype.invalid'
const mime: Record<string,string> = {'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff','.ico':'image/x-icon'}

function inside(root:string, file:string) { const relative=path.relative(root,file); return relative !== '..' && !relative.startsWith('..'+path.sep) && !path.isAbsolute(relative) }
async function safeDirectory(root:string, dir:string) {
  // Check each existing ancestor before mkdir so a symlink cannot redirect writes.
  let parent=root
  for(const part of path.relative(root,dir).split(path.sep)) {
    parent=path.join(parent,part)
    try { if(!inside(root,await realpath(parent))) throw new Error('PREVIEW_PATH_OUTSIDE_WORKDIR') }
    catch(error) { if((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; await mkdir(parent) }
  }
  if(!inside(root,await realpath(dir))) throw new Error('PREVIEW_PATH_OUTSIDE_WORKDIR')
}

export async function renderPrototypePreviewInBrowser(options:{workDir:string;fidelity?:'low'|'mid'|'high';screenId?:string;signal?:AbortSignal;launchBrowser:()=>Promise<Browser>}):Promise<PrototypePreviewReceipt> {
  if (options.screenId && !/^[A-Za-z0-9_-]{1,64}$/.test(options.screenId)) throw new Error('INVALID_SCREEN_ID')
  const root=await realpath(options.workDir)
  const fidelity=options.fidelity || 'high'
  const file={low:'01-low-fidelity.html',mid:'02-mid-fidelity.html',high:'03-high-fidelity.html'}[fidelity]
  const sourcePath=await realpath(path.join(root,file))
  if(!inside(root,sourcePath)) throw new Error('PREVIEW_PATH_OUTSIDE_WORKDIR')
  if((await stat(sourcePath)).size > 5_000_000) throw new Error('PREVIEW_HTML_TOO_LARGE')
  const sourceBytes=await readFile(sourcePath), sourceHash=sha(sourceBytes)
  const runId=randomUUID(), outputDir=path.join(root,'imgs','qa',runId)
  await safeDirectory(root,outputDir)
  options.signal?.throwIfAborted()
  const browser=await options.launchBrowser()
  const abort=()=>{ void browser.close().catch(()=>{}) }
  options.signal?.addEventListener('abort',abort,{once:true})
  const blockedResources=new Set<string>(), screenshots:PrototypePreviewScreenshot[]=[]
  const assets = new Map<string, { bytes: Buffer; sha256: string }>()
  let assetBytes = 0
  try {
    options.signal?.throwIfAborted()
    for(const viewport of fidelity==='high'?PROTOTYPE_VIEWPORTS:PROTOTYPE_VIEWPORTS.slice(0,1)) {
      const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},deviceScaleFactor:1,serviceWorkers:'block',acceptDownloads:false,reducedMotion:'reduce'})
      try {
        await context.route('**/*',async route=>{
          try {
            const url=new URL(route.request().url())
            if(url.origin!==origin || !['GET','HEAD'].includes(route.request().method())) throw new Error('network denied')
            const relative=decodeURIComponent(url.pathname).replace(/^\/+/,'')
            if(relative.split('/').some(p=>p.startsWith('.') || p==='node_modules')) throw new Error('private asset denied')
            const target=path.resolve(root,relative)
            if(!inside(root,target) || !mime[path.extname(target).toLowerCase()]) throw new Error('asset denied')
            const resolved=await realpath(target)
            if(!inside(root,resolved) || (await stat(resolved)).size>20_000_000) throw new Error('asset outside workdir or too large')
            // Freeze local assets across viewports, just like the source HTML.
            if (resolved !== sourcePath && !assets.has(resolved)) {
              if (assets.size >= 64) throw new Error('local asset count exceeded')
              const bytes = await readFile(resolved)
              assetBytes += bytes.length
              if (assetBytes > 40_000_000) throw new Error('local asset budget exceeded')
              assets.set(resolved, { bytes, sha256: sha(bytes) })
            }
            await route.fulfill({body:resolved===sourcePath?sourceBytes:assets.get(resolved)!.bytes,contentType:mime[path.extname(target).toLowerCase()],headers:{'Content-Security-Policy': "connect-src 'none'; form-action 'none'; frame-src 'none'; object-src 'none'"}})
          } catch {
            if (blockedResources.size < 50) blockedResources.add(route.request().url().split('?')[0]!.slice(0, 256))
            await route.abort()
          }
        })
        const page=await context.newPage()
        page.setDefaultTimeout(10_000)
        await page.goto(origin+'/'+file+(options.screenId?'?screen='+options.screenId+'&export=1':''),{waitUntil:'load',timeout:15_000})
        if (options.screenId) {
          const screen = page.locator('[data-screen-id="'+options.screenId+'"]')
          await screen.waitFor({ state: 'visible', timeout: 5000 })
          await screen.scrollIntoViewIfNeeded()
        }
        await page.evaluate(async()=>{ await document.fonts.ready; await new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))) })
        const measurement=await page.evaluate((_kind)=>{
          const width=window.innerWidth, issues:string[]=[]
          if(document.documentElement.scrollWidth>width+1) issues.push('document horizontal overflow')
          for(const el of Array.from(document.querySelectorAll('h1,h2,h3,p,button,a,input,select,textarea,[role="button"]'))) {
            const rect=el.getBoundingClientRect(), style=getComputedStyle(el)
            if(!rect.width || !rect.height || style.visibility==='hidden' || style.display==='none' || !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue
            if(rect.left < -1 || rect.right > width+1) issues.push((el.tagName+' '+(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0,60))+': horizontally clipped')
          }
          return {innerWidth:width,innerHeight:window.innerHeight,scrollWidth:document.documentElement.scrollWidth,issues:[...new Set(issues)].slice(0,30)}
        },'measure')
        const pngPath=path.join(outputDir,(fidelity==='high'?'high':fidelity)+'-'+viewport.viewport+'-'+viewport.width+'x'+viewport.height+'.png')
        await page.screenshot({path:pngPath,type:'png',fullPage:false,animations:'disabled',timeout:15_000})
        const bytes=await readFile(pngPath)
        if(bytes.length<24 || bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a' || bytes.readUInt32BE(16)!==viewport.width || bytes.readUInt32BE(20)!==viewport.height) throw new Error('PREVIEW_PNG_DIMENSIONS_INVALID')
        if(measurement.innerWidth!==viewport.width || measurement.innerHeight!==viewport.height) measurement.issues.push('CSS viewport differs from requested dimensions')
        screenshots.push({...viewport,path:pngPath,sha256:sha(bytes),innerWidth:measurement.innerWidth,innerHeight:measurement.innerHeight,issues:measurement.issues})
      } finally { await context.close() }
    }
    if(await realpath(path.join(root,file)) !== sourcePath || sha(await readFile(sourcePath))!==sourceHash) throw new Error('HTML_CHANGED_DURING_RENDER: rerender the final revision')
    for (const [file, asset] of assets) {
      if (!inside(root, await realpath(file)) || sha(await readFile(file)) !== asset.sha256) throw new Error('ASSET_CHANGED_DURING_RENDER')
    }
    return {assets:[...assets].map(([file, asset])=>({path:file,sha256:asset.sha256})),schemaVersion:1,runId,fidelity,...(options.screenId?{screenId:options.screenId}:{}),source:{path:sourcePath,sha256:sourceHash},screenshots,blockedResources:[...blockedResources],status:screenshots.some(s=>s.issues.length)||blockedResources.size?'needs-work':'rendered',evidenceBoundary:'render-and-layout-only-not-visual-or-interaction-acceptance'}
  } finally { options.signal?.removeEventListener('abort',abort); await browser.close() }
}

