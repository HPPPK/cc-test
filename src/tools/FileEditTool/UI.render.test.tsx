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
import { getPatchForDisplay } from '../../utils/diff.js'
import { renderToolResultMessage, renderToolUseRejectedMessage } from './UI.js'

function text(node: React.ReactNode) {
  const state = getDefaultAppState()
  const store = createStore({ ...state, settings: { ...state.settings, syntaxHighlightingDisabled: true } })
  const { screen } = renderToScreen(<TerminalSizeContext.Provider value={{ columns: 120, rows: 40 }}><AppStoreContext.Provider value={store}><ThemeProvider>{node}</ThemeProvider></AppStoreContext.Provider></TerminalSizeContext.Provider>, 120)
  return Array.from({ length: screen.height }, (_, y) => Array.from({ length: screen.width }, (_, x) => cellAt(screen, x, y)?.char ?? ' ').join('')).join('\n')
}

test('edit result renders both removed and added evidence from the actual structured patch', () => {
  const filePath = '/tmp/edit-render-contract.txt'
  const originalFile = 'before evidence\nkeep context\n'
  const structuredPatch = getPatchForDisplay({ filePath, fileContents: originalFile, edits: [{ old_string: 'before evidence', new_string: 'after evidence', replace_all: false }] })
  const output = text(renderToolResultMessage({ filePath, originalFile, oldString: 'before evidence', newString: 'after evidence', structuredPatch, userModified: false, replaceAll: false }, [], { verbose: true }))
  expect(output).toContain('before evidence')
  expect(output).toContain('after evidence')
  expect(output).toContain('keep context')
})

test('rejected edits identify the target and leave its content unchanged while loading the diff', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'edit-rejection-render-'))
  const file = join(dir, 'report.txt')
  try {
    await writeFile(file, 'before evidence\n')
    const output = text(renderToolUseRejectedMessage({ file_path: file, old_string: 'before evidence', new_string: 'after evidence' }, { columns: 120, messages: [], progressMessagesForMessage: [], theme: 'dark', tools: [], verbose: true }))
    expect(output).toContain('User rejected update to')
    expect(output).toContain('report.txt')
    expect(await readFile(file, 'utf8')).toBe('before evidence\n')
  } finally { await rm(dir, { recursive: true, force: true }) }
})
