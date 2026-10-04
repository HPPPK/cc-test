import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join, isAbsolute, resolve, relative } from 'node:path'
import type { SharpFunction } from './imageProcessor.js'
import { createNodeImageProcessor } from './imageProcessorNodeBridge.js'

/** Keep native Sharp/DLL files on disk: Bun cannot discover Sharp's dynamic .node requires. */
export function loadBundledImageProcessor(appRoot: string | undefined, nodeExecutable = process.env.CLAUDE_BUNDLED_NODE_EXECUTABLE): SharpFunction | null {
  if (!appRoot) return null
  try {
    if (!isAbsolute(appRoot)) throw new Error('Desktop app root must be absolute')
    const packagePath = join(appRoot, 'binaries', 'image-runtime', 'node_modules', 'sharp')
    // Absolute entry prevents resolving a different package from the user's task cwd.
    const requireRuntime = createRequire(join(appRoot, 'image-runtime-loader.cjs'))
    const manifest = JSON.parse(readFileSync(join(packagePath, 'package.json'), 'utf8'))
    const entry = resolve(packagePath, manifest.main)
    if (relative(packagePath, entry).startsWith('..') || isAbsolute(relative(packagePath, entry))) throw new Error('Invalid Sharp entry')
    if (nodeExecutable) return createNodeImageProcessor(nodeExecutable, entry)
    const imported = requireRuntime(entry)
    const sharp = typeof imported === 'function' ? imported : imported.default
    if (typeof sharp !== 'function') throw new Error('Invalid Sharp export')
    return sharp
  } catch (cause) {
    const error = new Error('IMAGE_PROCESSOR_UNAVAILABLE: Desktop image runtime could not be loaded. Repair/rebuild the desktop image runtime, then Read the existing image again; do not regenerate it or change the image Provider.', { cause })
    error.name = 'ImageProcessorUnavailableError'
    throw error
  }
}
