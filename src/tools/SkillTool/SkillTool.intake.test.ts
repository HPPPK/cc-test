import { afterEach, expect, spyOn, test } from 'bun:test'
import { withFetchPreconnect } from '../../server/__tests__/fixtureAssertions.js'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as commands from '../../commands.js'
import * as usage from '../../utils/suggestions/skillUsageTracking.js'
import * as skillHooks from '../../utils/hooks/registerSkillHooks.js'
import { getInvokedSkills } from '../../bootstrap/state.js'
import { SkillTool } from './SkillTool.js'
import { callToolFixture, createToolContextFixture } from '../toolFixtures.test.js'
import type { Command } from '../../types/command.js'

const cleanups: (() => void | Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })

async function fixture() {
  const originalInvoked = getInvokedSkills().get(':intake-fixture')
  cleanups.push(() => {
    if (originalInvoked) getInvokedSkills().set(':intake-fixture', originalInvoked)
    else getInvokedSkills().delete(':intake-fixture')
  })
  const usageSpy = spyOn(usage, 'recordSkillUsage').mockImplementation(() => {})
  cleanups.push(() => usageSpy.mockRestore())
  const hookSpy = spyOn(skillHooks, 'registerSkillHooks').mockImplementation(() => {})
  cleanups.push(() => hookSpy.mockRestore())
  const dir = await mkdtemp(join(tmpdir(), 'skill-intake-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  const raw = 'Ask the user to confirm scope first.\n!`touch /never-execute`\n$ARGUMENTS\n${CLAUDE_SESSION_ID}'
  await writeFile(join(dir, 'SKILL.md'), '---\ncontext: fork\nmodel: test-model\n---\n' + raw)
  let processed = 0
  const command = {
    type: 'prompt', name: 'intake-fixture', source: 'userSettings', loadedFrom: 'skills',
    description: 'Intake instructions', contentLength: raw.length, progressMessage: 'Loading',
    skillRoot: dir, context: 'fork', model: 'test-model', allowedTools: ['Bash'],
    hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: 'touch /never-hook' }] }] },
    getPromptForCommand: async () => { processed++; throw new Error('Must not process dynamic skill content before intake') },
  } as unknown as Command
  const getCommands = spyOn(commands, 'getCommands').mockResolvedValue([command])
  cleanups.push(() => getCommands.mockRestore())
  const builtInNames = spyOn(commands, 'builtInCommandNames').mockReturnValue(new Set())
  cleanups.push(() => builtInNames.mockRestore())
  for (const [key, value] of Object.entries({
    CC_JIANGXIA_EXPERT_TEMPLATE_FILL_DELIVERY: 'cli-only',
    CC_JIANGXIA_DESKTOP_SERVER_URL: 'http://intake-fixture.invalid',
    CC_JIANGXIA_EXPERT_SESSION_ID: 'fixture-session',
  })) {
    const old = process.env[key]
    process.env[key] = value
    cleanups.push(() => { if (old === undefined) delete process.env[key]; else process.env[key] = old })
  }
  return { raw, command, processed: () => processed, usageSpy, hookSpy }
}

test('unresolved intake loads local instructions without fork, dynamic expansion, hooks, or model/tool overrides for main and subagent', async () => {
  const { raw, processed, usageSpy, hookSpy } = await fixture()
  const admissions: unknown[] = []
  const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(withFetchPreconnect(async (_url, init) => {
    admissions.push(JSON.parse(String(init?.body)))
    return new Response(JSON.stringify({ message: 'EXPERT_INTAKE_REQUIRED: Confirm the target user.' }), { status: 409 })
  }))
  cleanups.push(() => fetchSpy.mockRestore())
  for (const agentId of [undefined, 'research-worker']) {
    const context = createToolContextFixture({ agentId: agentId as never })
    const result = await callToolFixture(SkillTool, { skill: 'intake-fixture', args: 'must stay unexpanded' }, context)
    expect(result.data).toEqual({ success: true, commandName: 'intake-fixture', status: 'inline' })
    expect(JSON.stringify(result.newMessages)).toContain(raw.replace(/\n/g, '\\n'))
    expect(result.contextModifier).toBeUndefined()
  }
  expect(processed()).toBe(0)
  expect(usageSpy).not.toHaveBeenCalled()
  expect(hookSpy).not.toHaveBeenCalled()
  expect(admissions).toEqual([
    { toolName: 'Skill:execute', input: { skill: 'intake-fixture', args: 'must stay unexpanded' } },
    { toolName: 'Skill:execute', input: { skill: 'intake-fixture', args: 'must stay unexpanded' }, agentId: 'research-worker' },
  ])
})

test('intake host failures fail closed before skill prompt processing', async () => {
  const { processed } = await fixture()
  const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(withFetchPreconnect(async () => { throw new Error('offline') }))
  cleanups.push(() => fetchSpy.mockRestore())
  await expect(callToolFixture(SkillTool, { skill: 'intake-fixture' })).rejects.toThrow('EXPERT_INTAKE_UNAVAILABLE')
  expect(processed()).toBe(0)
})

test('unresolved intake rejects MCP skills, absent roots and missing instruction files without invoking loaders', async () => {
  const { command, processed } = await fixture()
  const prompt = command as Command & { type: 'prompt' }
  const root = prompt.skillRoot
  const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(withFetchPreconnect(async () => new Response(JSON.stringify({ message: 'EXPERT_INTAKE_REQUIRED: Confirm scope.' }), { status: 409 })))
  cleanups.push(() => fetchSpy.mockRestore())
  for (const patch of [
    { source: 'mcp', loadedFrom: 'mcp', skillRoot: root },
    { source: 'userSettings', loadedFrom: 'skills', skillRoot: undefined },
    { source: 'userSettings', loadedFrom: 'skills', skillRoot: 'relative/skill' },
  ]) {
    Object.assign(prompt, patch)
    await expect(callToolFixture(SkillTool, { skill: 'intake-fixture' })).rejects.toThrow('Only registered local SKILL.md')
  }
  Object.assign(prompt, { source: 'userSettings', loadedFrom: 'skills', skillRoot: join(root!, 'missing') })
  await expect(callToolFixture(SkillTool, { skill: 'intake-fixture' })).rejects.toThrow('ENOENT')
  expect(processed()).toBe(0)
})

test('admitted and nonexpert skills preserve normal prompt execution', async () => {
  const { command } = await fixture()
  const prompt = command as Command & { type: 'prompt' }
  prompt.context = 'inline'
  prompt.hooks = undefined
  prompt.model = undefined
  prompt.allowedTools = undefined
  let processed = 0
  prompt.getPromptForCommand = async args => { processed++; return [{ type: 'text', text: 'Normal expanded arguments: ' + args }] }
  const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(withFetchPreconnect(async () => new Response(JSON.stringify({ allowed: true }), { status: 200 })))
  cleanups.push(() => fetchSpy.mockRestore())
  for (const expert of [true, false]) {
    if (!expert) delete process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_DELIVERY
    const result = await callToolFixture(SkillTool, { skill: 'intake-fixture', args: 'normal-args' })
    expect(result.data.success).toBe(true)
    expect(JSON.stringify(result.newMessages)).toContain('Normal expanded arguments: normal-args')
    expect(result.contextModifier).toBeFunction()
  }
  expect(processed).toBe(2)
  expect(fetchSpy).toHaveBeenCalledTimes(1)
})
