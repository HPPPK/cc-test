import { test, expect } from 'bun:test'
import { resolveAgentPermissionPromptPolicy } from './runAgent.js'

test('Desktop-bound file-first workers relay permission requests instead of silently auto-denying', () => {
  expect(resolveAgentPermissionPromptPolicy({ isAsync: true, desktopExpertBound: true })).toEqual({ shouldAvoidPermissionPrompts: false, awaitAutomatedChecksBeforePrompt: true })
})
test('ordinary background workers remain headless; explicit no-prompt policy is preserved', () => {
  expect(resolveAgentPermissionPromptPolicy({ isAsync: true, desktopExpertBound: false }).shouldAvoidPermissionPrompts).toBe(true)
  expect(resolveAgentPermissionPromptPolicy({ isAsync: true, desktopExpertBound: true, canShowPermissionPrompts: false }).shouldAvoidPermissionPrompts).toBe(true)
  expect(resolveAgentPermissionPromptPolicy({ isAsync: true, desktopExpertBound: false, agentPermissionMode: 'bubble' }).shouldAvoidPermissionPrompts).toBe(false)
  expect(resolveAgentPermissionPromptPolicy({ isAsync: false, desktopExpertBound: false }).shouldAvoidPermissionPrompts).toBe(false)
})

import { getEmptyToolPermissionContext } from '../../Tool.js'
import { hasPermissionsToUseTool } from '../../utils/permissions/permissions.js'
import { FileWriteTool } from '../FileWriteTool/FileWriteTool.js'
import { PlaywrightTool } from '../PlaywrightTool/PlaywrightTool.js'
import { createAssistantMessage } from '../../utils/messages.js'

test('real permission engine asks through relay and still respects explicit denial', async () => {
  const policy = resolveAgentPermissionPromptPolicy({ isAsync: true, desktopExpertBound: true })
  const permissions = { ...getEmptyToolPermissionContext(), mode: 'default' as const, ...policy }
  const context: any = { getAppState: () => ({ toolPermissionContext: permissions, tasks: {}, sessionHooks: new Map() }), options: { isNonInteractiveSession: true }, abortController: new AbortController(), setAppState() {} }
  const assistant = createAssistantMessage({ content: 'permission boundary fixture' })
  const input = { actions: [{ type: 'navigate', url: 'https://example.org/docs' }, { type: 'extract' }] }
  expect((await hasPermissionsToUseTool(PlaywrightTool, input, context, assistant, 'relay-playwright')).behavior).toBe('ask')
  permissions.alwaysDenyRules = { ...permissions.alwaysDenyRules, session: ['Playwright', 'Write'] }
  expect((await hasPermissionsToUseTool(PlaywrightTool, input, context, assistant, 'denied-playwright')).behavior).toBe('deny')
  expect((await hasPermissionsToUseTool(FileWriteTool, { file_path: 'test.md', content: 'fixture' }, context, assistant, 'denied-write')).behavior).toBe('deny')
}, 30000)

test('reproduces the old background auto-denial before applying relay policy', async () => {
  const permission = { ...getEmptyToolPermissionContext(), mode: 'default' as const, shouldAvoidPermissionPrompts: true }
  const context: any = { getAppState: () => ({ toolPermissionContext: permission, tasks: {}, sessionHooks: new Map() }), options: { isNonInteractiveSession: true }, abortController: new AbortController(), setAppState() {} }
  const assistant = createAssistantMessage({ content: 'observed runtime failure' })
  const input = { actions: [{ type: 'navigate', url: 'https://example.org/docs' }, { type: 'extract' }] }
  const before = await hasPermissionsToUseTool(PlaywrightTool, input, context, assistant, 'before')
  expect(before).toMatchObject({ behavior: 'deny', decisionReason: { type: 'asyncAgent' } })
  permission.shouldAvoidPermissionPrompts = resolveAgentPermissionPromptPolicy({ isAsync: true, desktopExpertBound: true }).shouldAvoidPermissionPrompts
  expect((await hasPermissionsToUseTool(PlaywrightTool, input, context, assistant, 'after')).behavior).toBe('ask')
}, 30000)
