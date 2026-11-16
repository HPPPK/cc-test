import { expect, test } from 'bun:test'
import { toolObservableInput } from './toolObservableInput.js'
import { expandPath } from './path.js'

test('keeps invalid path bytes intact when observer enrichment fails before serialization', () => {
  const raw = { file_path: 'src/bad\0path.ts', nested: { unchanged: true } }
  const before = JSON.stringify(raw)
  const errors: unknown[] = []
  const observed = toolObservableInput(raw, copy => {
    const nested = copy.nested as { unchanged: boolean }
    nested.unchanged = false
    copy.file_path = expandPath(copy.file_path as string)
  }, error => errors.push(error))
  expect(observed).toBeUndefined()
  expect(JSON.stringify(raw)).toBe(before)
  expect(errors).toHaveLength(1)
  expect(String(errors[0])).toContain('Path contains null bytes')
  expect(() => expandPath(raw.file_path)).toThrow('Path contains null bytes')
})

test('preserves added legacy fields but keeps overwrite-only inputs cache-stable', () => {
  const raw = { to: 'worker', message: 'Continue' }
  expect(toolObservableInput(raw, copy => { copy.recipient = copy.to }, () => {})).toEqual({ ...raw, recipient: 'worker' })
  expect(raw).toEqual({ to: 'worker', message: 'Continue' })
  expect(toolObservableInput({ file_path: './test.ts' }, copy => { copy.file_path = '/absolute/test.ts' }, () => {})).toBeUndefined()
})
