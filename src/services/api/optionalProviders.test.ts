import { expect, test } from 'bun:test'
import { loadOptionalProviderModule } from './client.js'

test('unavailable optional provider identifies the selected package without contacting it', async () => {
  const cause = new Error('fixture module unavailable')
  await expect(loadOptionalProviderModule('@anthropic-ai/bedrock-sdk', async () => { throw cause })).rejects.toThrow('OPTIONAL_INTEGRATION_UNAVAILABLE: @anthropic-ai/bedrock-sdk')
})
test('available optional loader preserves its typed module result', async () => {
  const module = { supported: true }
  expect(await loadOptionalProviderModule('fixture-only', async () => module)).toBe(module)
})
