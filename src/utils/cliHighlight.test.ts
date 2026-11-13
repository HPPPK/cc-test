import { expect, test } from 'bun:test'
import stripAnsi from 'strip-ansi'
import { getCliHighlightPromise, getLanguageName } from './cliHighlight.js'

test('the restored highlighter dependency exposes real ANSI output and language metadata', async () => {
  const highlighter = await getCliHighlightPromise()
  expect(highlighter).not.toBeNull()
  if (!highlighter) throw new Error('Expected installed highlighter')
  expect(highlighter.supportsLanguage('typescript')).toBe(true)
  const code = 'const count: number = 1'
  expect(stripAnsi(highlighter.highlight(code, { language: 'typescript' }))).toBe(code)
  expect(await getLanguageName('source.ts')).toBe('TypeScript')
})
