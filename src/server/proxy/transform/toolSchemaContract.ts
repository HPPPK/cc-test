import type { AnthropicRequest, OpenAITool } from './types.js'

type AnthropicTool = NonNullable<AnthropicRequest['tools']>[number]

export class ToolSchemaContractError extends Error {
  readonly code = 'INVALID_STRICT_TOOL_SCHEMA'

  constructor(readonly toolName: string, readonly schemaPath: string, reason: string) {
    super(`Tool "${toolName}" cannot use strict: true at ${schemaPath}: ${reason}. Supply a compatible schema or set strict: false.`)
    this.name = 'ToolSchemaContractError'
  }
}

const unsupportedKeywords = ['allOf', 'oneOf', 'not', 'if', 'then', 'else', 'dependentRequired', 'dependentSchemas', 'patternProperties']
const schemaTypes = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'])

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Validate structural strict-mode requirements without changing tool semantics.
 * Provider/model-specific keyword and size limits remain the upstream's contract.
 */
function assertStrictSchema(tool: AnthropicTool): void {
  const root = tool.input_schema
  const visited = new Set<object>()
  const fail = (path: string, reason: string): never => { throw new ToolSchemaContractError(tool.name, path, reason) }
  const visit = (value: unknown, path: string): void => {
    if (!isObject(value)) fail(path, 'expected a JSON Schema object')
    const schema = value as Record<string, unknown>
    if (visited.has(schema)) return
    visited.add(schema)
    for (const keyword of unsupportedKeywords) {
      if (keyword in schema) fail(`${path}.${keyword}`, `${keyword} is unsupported by the strict schema subset`)
    }
    if ('$ref' in schema) {
      const ref = schema.$ref
      if (typeof ref !== 'string' || !(ref === '#' || ref.startsWith('#/'))) fail(`${path}.$ref`, 'only local schema references can be checked')
      let target: unknown = root
      for (const token of (ref as string).slice(2).split('/').filter(Boolean)) {
        const key = token.replace(/~1/g, '/').replace(/~0/g, '~')
        target = isObject(target) ? target[key] : undefined
      }
      if (!isObject(target)) fail(`${path}.$ref`, 'the local schema reference does not resolve')
      visit(target, `${path}.$ref`)
    }
    if ('anyOf' in schema) {
      if (!Array.isArray(schema.anyOf) || schema.anyOf.length === 0) fail(`${path}.anyOf`, 'expected at least one schema branch')
      const branches = schema.anyOf as unknown[]
      branches.forEach((branch, index) => visit(branch, `${path}.anyOf[${index}]`))
    }
    const types = Array.isArray(schema.type) ? schema.type : schema.type === undefined ? [] : [schema.type]
    if (types.some((type) => typeof type !== 'string' || !schemaTypes.has(type))) fail(`${path}.type`, 'unsupported schema type')
    if (types.length === 0 && !('$ref' in schema) && !('anyOf' in schema)) fail(path, 'an explicit type, local reference, or anyOf is required')
    if (types.includes('object')) {
      if (schema.additionalProperties !== false) fail(`${path}.additionalProperties`, 'every object must set additionalProperties to false')
      if (!isObject(schema.properties)) fail(`${path}.properties`, 'every object must declare its properties')
      const properties = schema.properties as Record<string, unknown>
      const names = Object.keys(properties)
      const required = schema.required
      if (!Array.isArray(required) || required.length !== names.length || new Set(required).size !== names.length || names.some((name) => !required.includes(name))) {
        fail(`${path}.required`, 'all declared properties must be required; represent optional values with null')
      }
      for (const [name, property] of Object.entries(properties)) visit(property, `${path}.properties.${name}`)
    }
    if (types.includes('array')) visit(schema.items, `${path}.items`)
    for (const keyword of ['$defs', 'definitions']) {
      if (keyword in schema) {
        if (!isObject(schema[keyword])) fail(`${path}.${keyword}`, 'expected a map of schema definitions')
        for (const [name, definition] of Object.entries(schema[keyword] as Record<string, unknown>)) visit(definition, `${path}.${keyword}.${name}`)
      }
    }
  }
  if (root.type !== 'object' || 'anyOf' in root) fail('$', 'the root must be an object and cannot use anyOf')
  visit(root, '$')
}

export function toOpenAIFunctionDefinition(tool: AnthropicTool): OpenAITool['function'] {
  if (tool.strict === true) assertStrictSchema(tool)
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.input_schema,
    ...(tool.strict === undefined ? {} : { strict: tool.strict }),
  }
}
