import React from 'react'
import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ThemeProvider } from '../../ink.js'
import { TerminalSizeContext } from '../../ink/components/TerminalSizeContext.js'
import { renderToScreen } from '../../ink/render-to-screen.js'
import { cellAt } from '../../ink/screen.js'
import { AppStoreContext, getDefaultAppState } from '../../state/AppState.js'
import { createStore } from '../../state/store.js'
import { renderToolResultMessage, renderToolUseRejectedMessage } from './UI.js'

function text(node: React.ReactNode) {
  const state = getDefaultAppState()
  const store = createStore({ ...state, settings: { ...state.settings, syntaxHighlightingDisabled: true } })
  const { screen } = renderToScreen(<TerminalSizeContext.Provider value={{ columns: 120, rows: 40 }}><AppStoreContext.Provider value={store}><ThemeProvider>{node}</ThemeProvider></AppStoreContext.Provider></TerminalSizeContext.Provider>, 120)
  return Array.from({ length: screen.height }, (_, y) => Array.from({ length: screen.width }, (_, x) => cellAt(screen, x, y)?.char ?? ' ').join('')).join('\n')
}

test('created-file result renders the written line count, path, and actual content preview', () => {
  const output = text(renderToolResultMessage({ type: 'create', filePath: '/tmp/render-contract.txt', content: 'first evidence\nsecond evidence\n', structuredPatch: [], originalFile: null }, [], { verbose: true }))
  expect(output).toContain('Wrote 2 lines')
  expect(output).toContain('/tmp/render-contract.txt')
  expect(output).toContain('first evidence')
  expect(output).toContain('second evidence')
})

test('rejected writes preview proposed content while preserving existing file bytes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'write-rejection-render-'))
  const file = join(dir, 'report.txt')
  try {
    await writeFile(file, 'original evidence\n')
    const output = text(renderToolUseRejectedMessage({ file_path: file, content: 'proposed evidence\n' }, { verbose: true }))
    expect(output).toContain('User rejected write to')
    expect(output).toContain('proposed evidence')
    expect(await readFile(file, 'utf8')).toBe('original evidence\n')
  } finally { await rm(dir, { recursive: true, force: true }) }
})
