import { createInterface } from 'node:readline'
import { chromium } from 'playwright'
import { renderPrototypePreviewInBrowser } from '../../server/services/prototypePreviewRenderer.js'

const abort = new AbortController()
const lines = createInterface({ input: process.stdin })
let started = false
lines.on('line', async line => {
  if (started) { if (line === 'abort') abort.abort(); return }
  started = true
  try {
    const request = JSON.parse(line) as { workDir: string; fidelity: 'low' | 'mid' | 'high'; screenId?: string; executablePath: string }
    const receipt = await renderPrototypePreviewInBrowser({
      workDir: request.workDir, fidelity: request.fidelity, screenId: request.screenId, signal: abort.signal,
      launchBrowser: () => chromium.launch({ executablePath: request.executablePath, headless: true, timeout: 20_000 }),
    })
    process.stdout.write(JSON.stringify({ receipt }) + '\n')
  } catch (error) {
    process.stdout.write(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) + '\n')
    process.exitCode = 1
  } finally { lines.close(); process.stdin.destroy() }
})
