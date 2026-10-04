import { spawn } from 'node:child_process'
import type { SharpFunction, SharpInstance, SharpCreator } from './imageProcessor.js'

const BOOTSTRAP = [
  'const sharp = require(process.argv[1]); const request = JSON.parse(process.argv[2]);',
  "const chunks = []; process.stdin.on('data', chunk => chunks.push(chunk));",
  "process.stdin.on('end', async () => { try {",
  'let image = sharp(request.create || Buffer.concat(chunks));',
  'for (const [method, args] of request.steps) image = image[method](...args);',
  'const result = request.metadata ? Buffer.from(JSON.stringify(await image.metadata())) : await image.toBuffer();',
  'process.stdout.write(result);',
  '} catch (error) { process.stderr.write(String(error.message)); process.exitCode = 1; } });',
].join('\n')

/** Reuse installed desktop Node instead of Bun executable native-module resolution. */
export function createNodeImageProcessor(nodeExecutable: string, sharpEntry: string): SharpFunction & SharpCreator {
  return ((input: Buffer | { create: unknown }) => {
    const steps: Array<[string, unknown[]]> = []
    const execute = (metadata: boolean): Promise<Buffer> => new Promise((resolve, reject) => {
      const child = spawn(nodeExecutable, ['--eval', BOOTSTRAP, sharpEntry, JSON.stringify({
        metadata, steps, ...(!Buffer.isBuffer(input) ? { create: input } : {}),
      })], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' } })
      const chunks: Buffer[] = []; let bytes = 0; let errorText = ''; let settled = false
      const finish = (error?: Error) => {
        if (settled) return
        settled = true; clearTimeout(timer)
        if (error) { child.kill(); reject(error) } else resolve(Buffer.concat(chunks))
      }
      const timer = setTimeout(() => finish(new Error('IMAGE_PROCESSOR_TIMEOUT: image preview exceeded 30 seconds')), 30_000)
      child.stdout.on('data', (chunk: Buffer) => {
        bytes += chunk.length
        if (bytes > 25 * 1024 * 1024) finish(new Error('Image processor output exceeds 25MB'))
        else chunks.push(chunk)
      })
      child.stderr.on('data', chunk => { errorText = (errorText + chunk.toString()).slice(0, 4000) })
      child.on('error', error => finish(error))
      child.stdin.on('error', error => finish(error))
      child.on('close', code => finish(code === 0 ? undefined : new Error('IMAGE_PROCESSOR_UNAVAILABLE: ' + errorText)))
      child.stdin.end(Buffer.isBuffer(input) ? input : undefined)
    })
    const pipeline: SharpInstance = {
      metadata: async () => JSON.parse((await execute(true)).toString('utf8')),
      resize: (...args) => { steps.push(['resize', args]); return pipeline },
      png: (...args) => { steps.push(['png', args]); return pipeline },
      jpeg: (...args) => { steps.push(['jpeg', args]); return pipeline },
      webp: (...args) => { steps.push(['webp', args]); return pipeline },
      toBuffer: () => execute(false),
    }
    return pipeline
  }) as SharpFunction & SharpCreator
}
