import { expect, test } from 'bun:test'
import { getEmptyToolPermissionContext } from '../../Tool.js'
import { resolveAgentToolPermissionContext } from './agentPermissionContext.js'

test.each(['default', 'plan', 'dontAsk', 'acceptEdits', 'bypassPermissions'] as const)('tool pools and actual workers inherit the same parent mode without an implicit acceptEdits fallback: %s', mode => {
  const parent = { ...getEmptyToolPermissionContext(), mode, shouldAvoidPermissionPrompts: true }
  expect(resolveAgentToolPermissionContext(parent)).toBe(parent)
  expect(resolveAgentToolPermissionContext(parent).mode).toBe(mode)
})

test('explicit agent modes preserve established parent acceptEdits and bypass precedence and all rules', () => {
  const parent = { ...getEmptyToolPermissionContext(), mode: 'default' as const, alwaysDenyRules: { session: ['Write'] } }
  expect(resolveAgentToolPermissionContext(parent, 'plan')).toEqual({ ...parent, mode: 'plan' })
  expect(resolveAgentToolPermissionContext({ ...parent, mode: 'acceptEdits' }, 'plan').mode).toBe('acceptEdits')
  expect(resolveAgentToolPermissionContext({ ...parent, mode: 'bypassPermissions' }, 'plan').mode).toBe('bypassPermissions')
})
