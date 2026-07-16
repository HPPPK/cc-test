import { describe, expect, test } from 'bun:test'
import { inputSchema, normalizeSubagentType } from './AgentTool.js'

describe('Agent workflow task scheduling input', () => {
  test('accepts a complete structured workflow task plan', () => {
    const result = inputSchema().parse({
      description: 'Implement API and docs',
      prompt: 'Do the assigned part of the implementation.',
      run_in_background: true,
      workflow_parallel_plan: {
        task_id: 'api',
        tasks: [
          {
            id: 'api',
            depends_on: [],
            write_scopes: ['src/server/api/**'],
            resource_claims: [],
            execution_mode: 'write',
          },
          {
            id: 'docs',
            depends_on: ['api'],
            write_scopes: ['docs/**'],
            resource_claims: [],
            execution_mode: 'write',
          },
        ],
      },
    })

    expect(result.workflow_parallel_plan).toEqual({
      task_id: 'api',
      tasks: [
        {
          id: 'api',
          depends_on: [],
          write_scopes: ['src/server/api/**'],
          resource_claims: [],
          execution_mode: 'write',
        },
        {
          id: 'docs',
          depends_on: ['api'],
          write_scopes: ['docs/**'],
          resource_claims: [],
          execution_mode: 'write',
        },
      ],
    })
  })
})


describe('Agent subagent type normalization', () => {
  test('treats blank subagent_type values as omitted so the default agent can be used', () => {
    expect(normalizeSubagentType(undefined)).toBeUndefined()
    expect(normalizeSubagentType('')).toBeUndefined()
    expect(normalizeSubagentType('  \t ')).toBeUndefined()
    expect(normalizeSubagentType(' general-purpose ')).toBe('general-purpose')
  })
})
