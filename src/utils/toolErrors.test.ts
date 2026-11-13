import { expect, test } from 'bun:test'
import { z } from 'zod/v4'
import { formatZodValidationError } from './toolErrors.js'

test('tool validation errors tell the model which required and unknown fields to repair', () => {
  const parsed = z.strictObject({ command: z.string(), timeout: z.number() }).safeParse({ timeout: 'slow', invented: true })
  if (parsed.success) throw new Error('Expected invalid tool arguments')
  const message = formatZodValidationError('Bash', parsed.error)
  expect(message).toContain('command')
  expect(message).toContain('invented')
  expect(message).toContain('timeout')
  expect(message).toContain('number')
})
