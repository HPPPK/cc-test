import { expect, test } from 'bun:test'
import { getNativeClipboardModule } from './imagePaste.js'

test('clipboard export validation uses fixtures without touching the real clipboard', () => {
  expect(getNativeClipboardModule({})).toBeNull()
  expect(() => getNativeClipboardModule({ getNativeModule: () => ({ readClipboardImage: true }) })).toThrow('clipboard')
  const empty = getNativeClipboardModule({ getNativeModule: () => ({ hasClipboardImage: () => false, readClipboardImage: () => null }) })
  expect(empty?.hasClipboardImage?.()).toBe(false)
  expect(empty?.readClipboardImage?.(2000, 2000)).toBeNull()
  const image = { png: Buffer.from('fixture'), width: 10, height: 8, originalWidth: 20, originalHeight: 16 }
  const valid = getNativeClipboardModule({ getNativeModule: () => ({ readClipboardImage: () => image }) })
  expect(valid?.readClipboardImage?.(2000, 2000)).toBe(image)
  const invalidAvailability = getNativeClipboardModule({ getNativeModule: () => ({ hasClipboardImage: () => 'yes' }) })
  expect(() => invalidAvailability?.hasClipboardImage?.()).toThrow('availability result')
  const malformed = getNativeClipboardModule({ getNativeModule: () => ({ readClipboardImage: () => ({ png: 'not bytes', width: 1, height: 1, originalWidth: 1, originalHeight: 1 }) }) })
  expect(() => malformed?.readClipboardImage?.(2000, 2000)).toThrow('clipboard')
})
