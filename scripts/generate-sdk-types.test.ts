import { describe, expect, test } from 'bun:test'
import { generateSchemaAliases, generateSdkTypes } from './generate-sdk-types.js'

describe('SDK schema type generation', () => {
  test('committed aliases match current source schemas', async () => {
    expect(await generateSdkTypes(true)).toBe(true)
  })
  test('discovers new schema exports without a manually frozen list', () => {
    const source = `export const ExampleSchema = lazySchema(() => z.object({ name: z.string() }))\nconst PrivateSchema = lazySchema(() => z.string())`
    const result = generateSchemaAliases(source, './example.js', true)
    expect(result).toContain('export type Example = z.output<ReturnType<typeof schemas.ExampleSchema>>')
    expect(result).not.toContain('export type Private')
    expect(generateSchemaAliases(source, './example.js', true)).toBe(result)
  })
  test('composed unions retain specialized external message payloads', () => {
    const result = generateSchemaAliases(`export const SDKMessageSchema = lazySchema(() => z.union([SDKUserMessageSchema(), SDKAssistantMessageSchema()]),)`, './coreSchemas.js', true)
    expect(result).toContain('export type SDKMessage = SDKUserMessage | SDKAssistantMessage')
  })
})
