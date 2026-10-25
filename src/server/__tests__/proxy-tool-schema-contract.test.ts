import { describe, expect, test } from 'bun:test'
import { anthropicToOpenaiChat } from '../proxy/transform/anthropicToOpenaiChat.js'
import { anthropicToOpenaiResponses } from '../proxy/transform/anthropicToOpenaiResponses.js'
import type { AnthropicRequest } from '../proxy/transform/types.js'

const closedSchema = {
  type: 'object',
  properties: {
    query: { type: 'string' },
    options: {
      type: 'object',
      properties: { limit: { type: ['integer', 'null'] } },
      required: ['limit'],
      additionalProperties: false,
    },
  },
  required: ['query', 'options'],
  additionalProperties: false,
}

const converters = {
  chat: (body: AnthropicRequest) => anthropicToOpenaiChat(body).tools?.[0]?.function,
  responses: (body: AnthropicRequest) => anthropicToOpenaiResponses(body).tools?.[0],
}

for (const [protocol, convert] of Object.entries(converters)) {
  describe(`${protocol} tool schema contract`, () => {
    function request(input_schema: Record<string, unknown>, strict?: boolean): AnthropicRequest {
      return {
        model: 'fixture-model', max_tokens: 100,
        messages: [{ role: 'user', content: 'Search' }],
        tools: [{ name: 'search', description: 'Search documents', input_schema, ...(strict === undefined ? {} : { strict }) }],
      }
    }

    test('preserves explicit strict true with nested closed objects and required nullable fields', () => {
      const body = request(closedSchema, true)
      expect(convert(body)).toMatchObject({ name: 'search', strict: true, parameters: closedSchema })
      expect(body.tools?.[0]?.input_schema).toEqual(closedSchema)
    })

    test('preserves strict false for optional and open schemas without rewriting them', () => {
      const schema = { type: 'object', properties: { query: { type: 'string' } } }
      expect(convert(request(schema, false))).toMatchObject({ strict: false, parameters: schema })
    })

    test('does not opt existing unspecified schemas into strict mode', () => {
      expect(convert(request({ type: 'object', properties: { query: { type: 'string' } } }))).not.toHaveProperty('strict')
    })

    test.each([
      ['optional property', { ...closedSchema, required: ['query'] }, '$.required'],
      ['open root', { ...closedSchema, additionalProperties: true }, '$.additionalProperties'],
      ['open nested object', { ...closedSchema, properties: { query: { type: 'object', additionalProperties: { type: 'string' } } }, required: ['query'] }, '$.properties.query.additionalProperties'],
      ['nested array object', { ...closedSchema, properties: { query: { type: 'array', items: { type: 'object', properties: {} } } }, required: ['query'] }, '$.properties.query.items.additionalProperties'],
      ['root union', { anyOf: [closedSchema, closedSchema] }, '$'],
      ['unknown value', { ...closedSchema, properties: { query: {} }, required: ['query'] }, '$.properties.query'],
      ['unsupported composition', { ...closedSchema, allOf: [closedSchema] }, '$.allOf'],
    ])('rejects explicit strict true for %s with a repairable tool and schema path', (_label, schema, path) => {
      expect(() => convert(request(schema, true))).toThrow('search')
      expect(() => convert(request(schema, true))).toThrow(path)
      expect(() => convert(request(schema, true))).toThrow('strict: false')
    })

    test('preserves nested anyOf, arrays, local definitions and recursive references', () => {
      const schema = {
        type: 'object', properties: { rows: { type: 'array', items: { $ref: '#/$defs/row' } } },
        required: ['rows'], additionalProperties: false,
        $defs: { row: {
          type: 'object', properties: { value: { anyOf: [{ type: 'string' }, { type: 'null' }] }, next: { anyOf: [{ $ref: '#/$defs/row' }, { type: 'null' }] } },
          required: ['value', 'next'], additionalProperties: false,
        } },
      }
      expect(convert(request(schema, true))).toMatchObject({ strict: true, parameters: schema })
    })

    test.each([
      ['unresolved reference', { $ref: '#/$defs/missing' }, '$ref'],
      ['external reference', { $ref: 'https://example.com/schema' }, '$ref'],
      ['empty union', { anyOf: [] }, 'anyOf'],
      ['boolean schema', false, 'properties.query'],
      ['unsupported type', { type: 'undefined' }, 'type'],
      ['missing array items', { type: 'array' }, 'items'],
      ['missing object properties', { type: 'object', additionalProperties: false }, 'properties'],
      ['duplicate required names', { type: 'object', properties: { x: { type: 'string' }, y: { type: 'string' } }, required: ['x', 'x'], additionalProperties: false }, 'required'],
      ['invalid definitions', { type: 'string', $defs: [] }, '$defs'],
    ])('rejects malformed nested %s without changing schemas', (_label, value, path) => {
      const schema = { type: 'object', properties: { query: value }, required: ['query'], additionalProperties: false }
      const original = JSON.stringify(schema)
      expect(() => convert(request(schema, true))).toThrow(path)
      expect(JSON.stringify(schema)).toBe(original)
    })

    test('keeps examples and provider metadata outside tool parameter schemas and arguments', () => {
      const body = request(closedSchema, true)
      Object.assign(body.tools![0]!, { input_examples: [{ query: 'example' }], cache_control: { type: 'ephemeral' }, provider_metadata: { signature: 'opaque' } })
      body.thinking = { type: 'enabled', budget_tokens: 4096 }
      body.messages = [{ role: 'assistant', content: [
        { type: 'thinking', thinking: 'Reasoning', signature: 'opaque' },
        { type: 'tool_use', id: 'call-1', name: 'search', input: { query: 'actual', options: { limit: null } } },
      ] }]
      const tool = convert(body)!
      expect(tool.parameters).toEqual(closedSchema)
      expect(tool).not.toHaveProperty('input_examples')
      expect(tool).not.toHaveProperty('cache_control')
      expect(tool).not.toHaveProperty('provider_metadata')
      const chat = anthropicToOpenaiChat(body, { roundTripReasoningContent: true })
      expect(chat.messages[0]?.tool_calls?.[0]?.function.arguments).toBe('{"query":"actual","options":{"limit":null}}')
      expect(chat.messages[0]?.reasoning_content).toBe('Reasoning')
      const responses = anthropicToOpenaiResponses(body)
      expect(responses.input.find((item) => item.type === 'function_call')).toMatchObject({ arguments: '{"query":"actual","options":{"limit":null}}' })
      expect(responses.reasoning).toEqual({ effort: 'medium' })
    })
  })
}
