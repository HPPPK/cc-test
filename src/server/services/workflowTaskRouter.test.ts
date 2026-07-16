import { describe, expect, test } from 'bun:test'
import {
  WORKFLOW_EFFORT_MODES,
  WORKFLOW_LABELS,
  isTerminalWorkflowLabel,
  phaseAppliesToRoute,
  routeWorkflowTask,
  terminalLabelRequiresConfirmation,
} from './workflowTaskRouter.js'

describe('workflow task router', () => {
  test('exports canonical labels and effort modes', () => {
    expect(WORKFLOW_LABELS).toEqual([
      'new-product',
      'enhancement',
      'bug',
      'documentation',
      'refactor',
      'test',
      'question',
      'duplicate',
      'invalid',
      'wontfix',
      'help-wanted',
      'good-first-issue',
      'ux-copy',
      'error-handling',
    ])
    expect(WORKFLOW_EFFORT_MODES).toEqual(['auto', 'light', 'standard', 'heavy'])
  })

  test.each([
    [
      '创建一个 SaaS 记账 MVP',
      'new-product',
      ['standard', 'heavy'],
      ['route', 'working-backwards', 'spec', 'plan', 'task-breakdown', 'implement', 'verify-review', 'ship-handoff'],
    ],
    [
      '登录页点击没反应，控制台有 500',
      'bug',
      ['standard'],
      ['route', 'reproduce-debug', 'plan', 'implement', 'verify-review'],
    ],
    [
      '帮我写 README',
      'documentation',
      ['light', 'standard'],
      ['route', 'spec', 'verify-review', 'ship-handoff'],
    ],
  ] as const)('classifies %s', (
    request,
    expectedPrimaryLabel,
    expectedEfforts,
    expectedPath,
  ) => {
    const result = routeWorkflowTask({ request })

    expect(result.primaryLabel).toBe(expectedPrimaryLabel)
    expect(expectedEfforts).toContain(result.effort)
    expect(result.confidence).toBeGreaterThanOrEqual(0.6)
    expect(result.rationale).toEqual(expect.any(String))
    expect(result.suggestedPath).toEqual(expect.arrayContaining(expectedPath))
  })

  test('uses supplied errors logs and files to strengthen bug routing', () => {
    const result = routeWorkflowTask({
      request: 'The login page button does nothing.',
      selectedFiles: ['desktop/src/pages/Login.tsx'],
      errors: 'POST /api/login failed with HTTP 500',
      testOutput: 'LoginForm.test.tsx failed',
    })

    expect(result.primaryLabel).toBe('bug')
    expect(result.secondaryLabels).toContain('test')
    expect(result.effort).toBe('standard')
    expect(result.suggestedPath).toContain('reproduce-debug')
    expect(result.rationale).toMatch(/500|test/i)
  })

  test.each(['duplicate', 'invalid', 'wontfix'] as const)('terminal label %s requires confirmation before stop', (label) => {
    const result = routeWorkflowTask({ request: '这和上次那个需求一样', forcedLabel: label })

    expect(isTerminalWorkflowLabel(label)).toBe(true)
    expect(terminalLabelRequiresConfirmation(label)).toBe(true)
    expect(result.primaryLabel).toBe(label)
    expect(result.terminalReason).toEqual(expect.any(String))
    expect(result.suggestedPath).toEqual(['route'])
  })

  test('evaluates phase applicability for labels and effort', () => {
    expect(phaseAppliesToRoute({
      phase: {
        id: 'implement',
        appliesTo: ['new-product', 'enhancement', 'bug'],
        skipWhen: {
          labels: ['documentation'],
          efforts: ['light'],
        },
      },
      labels: ['documentation'],
      effort: 'light',
    })).toMatchObject({
      applies: false,
      reason: expect.stringContaining('label'),
    })

    expect(phaseAppliesToRoute({
      phase: {
        id: 'verify-review',
        appliesTo: ['documentation', 'bug'],
        modePolicy: {
          light: 'Run lightweight review only.',
          standard: 'Run standard checks.',
          heavy: 'Run full regression checks.',
        },
      },
      labels: ['bug'],
      effort: 'heavy',
    })).toEqual({
      applies: true,
      reason: null,
      modePolicy: 'Run full regression checks.',
    })
  })
})
