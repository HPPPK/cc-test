import { describe, expect, test } from 'bun:test'
import { studentSevenStageRequest } from './__fixtures__/studentSevenStageRequest.js'
import {
  WORKFLOW_EFFORT_MODES,
  WORKFLOW_LABELS,
  isTerminalWorkflowLabel,
  phaseAppliesToRoute,
  routeWorkflowTask,
  terminalLabelRequiresConfirmation,
} from './workflowTaskRouter.js'

describe('workflow task router', () => {
  test.each([
    '创建一个全新的学生管理系统，不必重复索要已给授权',
    '创建一个全新的学生管理系统，不做数据库迁移，需要登录页、测试和README文档',
    '这不是重复需求，请创建一个全新的学生管理系统',
    '不要标记duplicate，请从零开发学生管理系统',
    'Build a new student management system. Do not mark this as duplicate or invalid.',
  ])('keeps product creation as the main action: %s', (request) => {
    const result = routeWorkflowTask({ request })
    expect(result.primaryLabel).toBe('new-product')
    expect(result.terminalReason).toBeUndefined()
    expect(result.effort).not.toBe('light')
    expect(result.suggestedPath).toContain('implement')
  })

  test('preserves every selected canonical phase for the full student system request', async () => {
    const request = studentSevenStageRequest
    const result = routeWorkflowTask({ request, logs: 'duplicate test failed', selectedFiles: ['invalid.test.ts'] })
    const template = await Bun.file(new URL('../../../workflows/efficient-constrained-dev-debug-workflow-v5/workflows/efficient-constrained-dev-debug-workflow-v5.workflow.json', import.meta.url)).json()
    const kept = template.phases.filter((phase: Parameters<typeof phaseAppliesToRoute>[0]['phase']) => phaseAppliesToRoute({
      phase, labels: [result.primaryLabel, ...result.secondaryLabels], primaryLabel: result.primaryLabel, effort: result.effort,
    }).applies)
    expect(result.primaryLabel).toBe('new-product')
    expect(result.rationale).not.toContain('duplicate wording')
    expect(kept.map((phase: { id: string }) => phase.id)).toEqual(template.phases.map((phase: { id: string }) => phase.id))
    expect(kept).toHaveLength(7)
  })

  test.each([
    ['这和上次那个需求一样，按重复需求关闭', 'duplicate'],
    ['This request is a duplicate of issue #123', 'duplicate'],
    ['duplicate', 'duplicate'],
    ['这个请求无效，不是需求', 'invalid'],
    ['invalid', 'invalid'],
    ['不是需求', 'invalid'],
    ['该问题不修复，按 wontfix 关闭', 'wontfix'],
    ['这个需求不做了', 'wontfix'],
    ['wontfix', 'wontfix'],
    ['不修', 'wontfix'],
  ] as const)('retains explicit terminal classification: %s', (request, label) => {
    expect(routeWorkflowTask({ request }).primaryLabel).toBe(label)
  })

  test('does not classify diagnostic metadata as a decision to stop', () => {
    const result = routeWorkflowTask({ request: '优化学生列表筛选', logs: 'duplicate invalid wontfix', selectedFiles: ['duplicate.md'] })
    expect(result.primaryLabel).toBe('enhancement')
    expect(result.terminalReason).toBeUndefined()
  })

  test('explains an explicit duplicate classification with a duplicate signal', () => {
    expect(routeWorkflowTask({ request: 'This request is a duplicate of issue #123' }).rationale).toContain('duplicate wording')
  })

  test('keeps full-flow refactoring distinct from new product creation', () => {
    const result = routeWorkflowTask({ request: '重构现有学生系统，完整七阶段，补充测试及文档' })
    expect(result.primaryLabel).toBe('refactor')
    expect(result.effort).not.toBe('light')
    expect(result.suggestedPath).toContain('task-breakdown')
  })

  test('does not confuse fixing product-creation errors with creating a new product', () => {
    expect(routeWorkflowTask({ request: '修复创建学生管理系统时出现的报错，补回归测试' }).primaryLabel).toBe('bug')
  })

  test('rejects conflicting explicit complete flow and forced terminal classification', () => {
    expect(() => routeWorkflowTask({ request: '创建学生系统，完整七阶段', forcedLabel: 'duplicate' })).toThrow('WORKFLOW_ROUTE_CONFLICT')
  })
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
    expect(expectedEfforts.some(effort => effort === result.effort)).toBe(true)
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
        id: 'implement',
        appliesTo: ['new-product', 'enhancement', 'bug'],
        skipWhen: {
          labels: ['documentation'],
        },
      },
      labels: ['new-product', 'documentation'],
      primaryLabel: 'new-product',
      effort: 'standard',
    })).toEqual({
      applies: true,
      reason: null,
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
