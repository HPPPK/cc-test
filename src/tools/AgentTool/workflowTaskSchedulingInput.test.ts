import { describe, expect, test } from 'bun:test'
import { inputSchema, normalizeSubagentType, resolveAgentWorkflowState, resolveWorkflowSubagentType, resolveWorkflowTaskIsolation } from './AgentTool.js'
import { validateWorkflowTaskSchedule } from './workflowTaskScheduling.js'

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

  test('keeps matching legacy workflow-role aliases on the general-purpose worker path', () => {
    expect(resolveWorkflowSubagentType('coder', 'coder')).toBe('general-purpose')
    expect(resolveWorkflowSubagentType('reviewer', 'general-purpose')).toBe('general-purpose')
    expect(() => resolveWorkflowSubagentType('reviewer', 'qa')).toThrow('workflow_role requires subagent_type=general-purpose.')
  })

  test('keeps scheduled workflow tasks in the current project unless the tool call explicitly requests isolation', () => {
    expect(resolveWorkflowTaskIsolation(true, undefined, 'worktree')).toBeUndefined()
    expect(resolveWorkflowTaskIsolation(true, 'worktree', undefined)).toBe('worktree')
    expect(resolveWorkflowTaskIsolation(false, undefined, 'worktree')).toBe('worktree')
  })
})


describe('Agent workflow roles', () => {
  test('accepts an explicit reviewer role for a normal workflow subagent', () => {
    const result = inputSchema().parse({
      description: 'Review implementation',
      prompt: 'Review the scoped diff and report findings.',
      subagent_type: 'general-purpose',
      workflow_role: 'reviewer',
    })

    expect(result.workflow_role).toBe('reviewer')
  })

  test('rejects leader as a runnable worker role', () => {
    const result = inputSchema().safeParse({
      description: 'Lead workflow',
      prompt: 'Coordinate the phase.',
      workflow_role: 'leader',
    })

    expect(result.success).toBe(false)
  })
})

describe('Agent workflow state bridge', () => {
  test('prefers the active Desktop workflow state over stale CLI phase state', async () => {
    const originalFetch = globalThis.fetch
    const originalServerUrl = process.env.CC_JIANGXIA_DESKTOP_SERVER_URL
    const originalSessionId = process.env.CC_JIANGXIA_WORKFLOW_SESSION_ID
    const state = {
      mode: 'workflow',
      sessionId: 'workflow session/1',
      activePhaseId: 'delegate-implement',
      phases: [],
      template: {
        phases: [{
          id: 'delegate-implement',
          subagentPolicy: { maxParallel: 4 },
        }],
      },
    }
    const calls: string[] = []
    process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = 'http://127.0.0.1:4567/'
    process.env.CC_JIANGXIA_WORKFLOW_SESSION_ID = 'workflow session/1'
    globalThis.fetch = (async (input: string | URL | Request) => {
      calls.push(String(input))
      return new Response(JSON.stringify({ state }), { status: 200 })
    }) as typeof fetch

    try {
      const staleCliWorkflow = {
        ...state,
        activePhaseId: 'route-context',
        phases: [{ id: 'route-context', status: 'running', artifactPointers: [] }],
      }
      const resolved = await resolveAgentWorkflowState(staleCliWorkflow)
      expect(resolved).toEqual(state)
      await expect(validateWorkflowTaskSchedule(resolved, {
        taskId: 'parallel-implementation',
        tasks: [{
          id: 'parallel-implementation',
          dependsOn: [],
          writeScopes: ['src/**'],
          resourceClaims: [],
          executionMode: 'write',
        }],
      })).resolves.toBeUndefined()
      expect(calls).toEqual(['http://127.0.0.1:4567/api/sessions/workflow%20session%2F1/workflow'])
    } finally {
      globalThis.fetch = originalFetch
      if (originalServerUrl === undefined) delete process.env.CC_JIANGXIA_DESKTOP_SERVER_URL
      else process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = originalServerUrl
      if (originalSessionId === undefined) delete process.env.CC_JIANGXIA_WORKFLOW_SESSION_ID
      else process.env.CC_JIANGXIA_WORKFLOW_SESSION_ID = originalSessionId
    }
  })
})
