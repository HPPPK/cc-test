import { describe, expect, it } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { runPrototypePreviewWithNode, PROTOTYPE_PREVIEW_RUNNER } from './prototypePreviewNodeBridge.js'

describe('prototype preview Node deployment contract', () => {
  it('ships a separate Node runner using external Playwright, not Bun Chromium pipes', async () => {
    const build = await readFile('desktop/scripts/build-sidecars.ts', 'utf8')
    const runner = await readFile('src/tools/PrototypePreviewTool/prototype-preview-runner.ts', 'utf8')
    expect(build).toContain(PROTOTYPE_PREVIEW_RUNNER)
    expect(build).toContain("'PrototypePreviewTool', 'prototype-preview-runner.ts'")
    expect(runner).toContain('renderPrototypePreviewInBrowser')
    expect(runner).toContain('chromium.launch')
  })
  it('does not launch a browser when the operation was already aborted', async () => {
    const abort = new AbortController(); abort.abort()
    await expect(runPrototypePreviewWithNode({ workDir: 'missing', signal: abort.signal })).rejects.toThrow()
  })
})
