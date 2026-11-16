import { test, expect } from 'bun:test'
import { mkdtempSync, writeFileSync, symlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { z } from 'zod/v4'
import { isOwnBrowserResultReadable, ownBrowserResultRecoveryPath, constrainWorkerWriteTool, workerOutputInstruction } from './expertWorkerRecovery.js'

test('researchers may read only their own real browser result files, never sibling files or symlinks', () => {
  const directory = mkdtempSync(join(tmpdir(), 'expert-results-'))
  try {
    writeFileSync(join(directory, 'own.txt'), 'original page')
    writeFileSync(join(directory, 'sibling.txt'), 'private sibling page')
    symlinkSync(join(directory, 'sibling.txt'), join(directory, 'link.txt'))
    const options = { directory, ownedToolUseIds: new Set(['own', 'link']) }
    expect(isOwnBrowserResultReadable({ file_path: join(directory, 'own.txt') }, options)).toBe(true)
    expect(isOwnBrowserResultReadable({ file_path: join(directory, 'sibling.txt') }, options)).toBe(false)
    expect(isOwnBrowserResultReadable({ file_path: join(directory, 'link.txt') }, options)).toBe(false)
    expect(isOwnBrowserResultReadable({ file_path: join(directory, '../own.txt') }, options)).toBe(false)
    expect(isOwnBrowserResultReadable({}, options)).toBe(false)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

test('worker Write accepts equivalent authorized path spellings and does not change the shared tool', () => {
  const tool = { name: 'Write', inputSchema: z.strictObject({ file_path: z.string(), content: z.string() }) } as any
  const path = 'commercialization-research/07-report-field-absorption.md'
  const scoped = constrainWorkerWriteTool(tool, path)
  expect(scoped.inputSchema.safeParse({ file_path: resolve(path), content: '# real content' }).success).toBe(true)
  expect(scoped.inputSchema.safeParse({ file_path: path, content: '# real content' }).success).toBe(true)
  expect(scoped.inputSchema.safeParse({ file_path: 'commercialization-research/07-field-absorption.md', content: '# wrong path' }).success).toBe(false)
  expect(tool.inputSchema.safeParse({ file_path: 'unrelated.md', content: '#' }).success).toBe(true)
  expect(workerOutputInstruction(path)).toContain(path)
  expect(workerOutputInstruction(path)).toContain('Do not Read your output before')
})


test('a mistyped parent directory gets an exact owned-file hint without reading it or widening access', () => {
  const directory = mkdtempSync(join(tmpdir(), 'expert-result-hint-'))
  try {
    writeFileSync(join(directory, 'call_own.txt'), 'original page')
    symlinkSync(join(directory, 'call_own.txt'), join(directory, 'call_link.txt'))
    const options = { directory, ownedToolUseIds: new Set(['call_own', 'call_missing', 'call_link']) }
    const wrong = { file_path: join(directory, 'wrong-parent/call_own.txt') }
    expect(isOwnBrowserResultReadable(wrong, options)).toBe(false)
    expect(ownBrowserResultRecoveryPath(wrong, options)).toBe(join(directory, 'call_own.txt'))
    for (const name of ['call_sibling', 'call_missing', 'call_link']) expect(ownBrowserResultRecoveryPath({ file_path: '/wrong/' + name + '.txt' }, options)).toBeUndefined()
    expect(ownBrowserResultRecoveryPath({}, options)).toBeUndefined()
  } finally { rmSync(directory, { recursive: true, force: true }) }
})


test('equivalent worker Write paths resolve against its session root, never the application directory', () => {
  const tool = { name: 'Write', inputSchema: z.strictObject({ file_path: z.string(), content: z.string() }) } as any
  const root = join(tmpdir(), 'expert-session-work')
  const target = 'commercialization-research/05-evidence-review.md'
  const schema = constrainWorkerWriteTool(tool, target, root).inputSchema
  for (const file_path of [target, join(root, target)]) expect(schema.safeParse({ file_path, content: '# saved' }).success).toBe(true)
  for (const file_path of [resolve(target), join(root, '../outside.md'), 'commercialization-research/06-browser-audit.md']) {
    expect(schema.safeParse({ file_path, content: '# forbidden' }).success).toBe(false)
  }
})
