import { expect, test } from 'bun:test'
import { loadOptionalNativeImageProcessor } from './imageProcessor.js'

test('native image loading rejects missing and malformed exports for the existing sharp fallback', async () => {
  expect(await loadOptionalNativeImageProcessor(async () => { throw new Error('not installed') })).toBeNull()
  expect(await loadOptionalNativeImageProcessor(async () => ({ sharp: {} }))).toBeNull()
  const sharp = () => { throw new Error('fixture function is never invoked while loading') }
  expect(await loadOptionalNativeImageProcessor(async () => ({ sharp }))).toBe(sharp)
  expect(await loadOptionalNativeImageProcessor(async () => ({ default: sharp }))).toBe(sharp)
})
