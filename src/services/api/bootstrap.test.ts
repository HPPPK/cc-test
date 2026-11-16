import { expect, test } from 'bun:test'
import { bootstrapResponseSchema } from './bootstrap.js'

test('bootstrap accepts open client data and optional model descriptions with the installed Zod API', () => {
  const parsed = bootstrapResponseSchema().parse({ client_data: { future: { preserved: true } }, additional_model_options: [{ model: 'fixture', name: 'Fixture', description: 'Test model' }] })
  expect(parsed.client_data).toEqual({ future: { preserved: true } })
  expect(parsed.additional_model_options).toEqual([{ value: 'fixture', label: 'Fixture', description: 'Test model' }])
})
