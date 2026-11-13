import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'bun:test'

const serverIndex = readFileSync(path.resolve(import.meta.dirname, '..', 'index.ts'), 'utf8')

describe('desktop server shell bootstrap', () => {
  it('resolves Git Bash before serving desktop tool requests', () => {
    expect(serverIndex).toContain("import { setShellIfWindows } from '../utils/windowsPaths.js'")
    const startServerOffset = serverIndex.indexOf('export function startServer')
    const shellBootstrapOffset = serverIndex.indexOf('setShellIfWindows()', startServerOffset)
    const serverBindOffset = serverIndex.indexOf('Bun.serve', startServerOffset)

    expect(startServerOffset).toBeGreaterThanOrEqual(0)
    expect(shellBootstrapOffset).toBeGreaterThan(startServerOffset)
    expect(shellBootstrapOffset).toBeLessThan(serverBindOffset)
  })
})
