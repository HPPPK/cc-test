import React from 'react'
import { expect, test } from 'bun:test'
import { ThemeProvider } from '../ink.js'
import { TerminalSizeContext } from '../ink/components/TerminalSizeContext.js'
import { renderToScreen } from '../ink/render-to-screen.js'
import { cellAt } from '../ink/screen.js'
import { AppStoreContext, getDefaultAppState } from '../state/AppState.js'
import { createStore } from '../state/store.js'
import { BackgroundHint } from './BashTool/UI.js'
import { renderToolResultMessage as grepResult } from './GrepTool/UI.js'
import { renderToolResultMessage as lspResult } from './LSPTool/UI.js'
import { renderToolResultMessage as stopResult } from './TaskStopTool/UI.js'

function text(node: React.ReactNode) {
  const { screen } = renderToScreen(<TerminalSizeContext.Provider value={{ columns: 120, rows: 40 }}><AppStoreContext.Provider value={createStore(getDefaultAppState())}><ThemeProvider>{node}</ThemeProvider></AppStoreContext.Provider></TerminalSizeContext.Provider>, 120)
  return Array.from({ length: screen.height }, (_, y) => Array.from({ length: screen.width }, (_, x) => cellAt(screen, x, y)?.char ?? ' ').join('')).join('\n')
}

test('search summary distinguishes matching lines, matches and files', () => {
  expect(text(grepResult({ mode: 'content', numFiles: 1, filenames: ['report.txt'], numLines: 2, content: 'first evidence\nsecond evidence' }, [], { verbose: false }))).toContain('Found 2 lines')
  expect(text(grepResult({ mode: 'count', numFiles: 1, filenames: ['report.txt'], numMatches: 3 }, [], { verbose: false }))).toContain('Found 3 matches')
})

test('LSP summaries omit redundant single-file counts and preserve verbose evidence', () => {
  const result = { operation: 'findReferences' as const, filePath: 'source.ts', result: 'source.ts:10:reader\nsource.ts:20:reader', resultCount: 2, fileCount: 1 }
  const summary = text(lspResult(result, [], { verbose: false }))
  expect(summary).toContain('2 references')
  expect(summary).not.toContain('across')
  expect(text(lspResult({ ...result, fileCount: 2 }, [], { verbose: false }))).toContain('across 2 files')
  expect(text(lspResult(result, [], { verbose: true }))).toContain('source.ts:10:reader')
})

test('stopped task display truncates long commands while verbose output retains all lines', () => {
  const output = { message: 'stopped', task_id: 'fixture', task_type: 'local_bash', command: 'first command\nsecond command\nthird command' }
  const compact = text(stopResult(output, [], { verbose: false }))
  expect(compact).toContain('first command')
  expect(compact).not.toContain('third command')
  expect(compact).toContain('stopped')
  expect(text(stopResult(output, [], { verbose: true }))).toContain('third command')
})

test('background task hint advertises its action and respects the explicit disable switch', () => {
  const previous = process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS
  try {
    delete process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS
    expect(text(<BackgroundHint />)).toContain('run in background')
    process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS = '1'
    expect(text(<BackgroundHint />).trim()).toBe('')
  } finally {
    if (previous === undefined) delete process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS
    else process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS = previous
  }
})
