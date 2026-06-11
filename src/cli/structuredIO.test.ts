import { describe, expect, it } from 'bun:test'
import { StructuredIO } from './structuredIO.js'

async function* inputLines(lines: string[]) {
  for (const line of lines) {
    yield line
  }
}

describe('StructuredIO environment updates', () => {
  it('applies and unsets runtime environment variables from stdin control messages', async () => {
    const keyToSet = 'CC_JIANGXIA_TEST_RUNTIME_ENV'
    const keyToUnset = 'CC_JIANGXIA_TEST_RUNTIME_ENV_REMOVED'
    const originalSet = process.env[keyToSet]
    const originalUnset = process.env[keyToUnset]
    process.env[keyToUnset] = 'old-value'

    try {
      const io = new StructuredIO(inputLines([
        `${JSON.stringify({
          type: 'update_environment_variables',
          variables: {
            [keyToSet]: 'new-value',
            [keyToUnset]: null,
          },
        })}\n`,
      ]))

      await io.structuredInput.next()

      expect(process.env[keyToSet]).toBe('new-value')
      expect(process.env[keyToUnset]).toBeUndefined()
    } finally {
      if (originalSet === undefined) delete process.env[keyToSet]
      else process.env[keyToSet] = originalSet
      if (originalUnset === undefined) delete process.env[keyToUnset]
      else process.env[keyToUnset] = originalUnset
    }
  })
})
