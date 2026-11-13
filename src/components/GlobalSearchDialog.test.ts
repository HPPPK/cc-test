import { expect, test } from 'bun:test'
import { parseRipgrepLine } from './GlobalSearchDialog.js'

test('search matches retain Unicode paths, numeric lines, and colon-containing text', () => {
  expect(parseRipgrepLine('src/报告.ts:42:key: value')).toEqual({ file: 'src/报告.ts', line: 42, text: 'key: value' })
  expect(parseRipgrepLine('C:\\work\\report.ts:7:')).toEqual({ file: 'C:\\work\\report.ts', line: 7, text: '' })
  expect(parseRipgrepLine('not a search match')).toBeNull()
  expect(parseRipgrepLine(':3:missing path')).toBeNull()
})
