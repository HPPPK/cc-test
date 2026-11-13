import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import * as compact from '../../services/compact/compact.js'
import { createUserMessage } from '../messages.js'
import { runWithRuntimeEnv } from '../runtimeEnv.js'
import * as attachments from '../attachments.js'
import * as skillUsage from '../suggestions/skillUsageTracking.js'
import { processPromptSlashCommand, processSlashCommand } from './processSlashCommand.js'

function contextFor(command: Record<string, unknown>) {
  return {
    options: { commands: [command], isNonInteractiveSession: false },
    messages: [],
  } as any
}

const local = {
  type: 'local', name: 'example', description: 'test',
  isEnabled: () => true, isHidden: false,
  load: async () => ({ call: async () => ({ type: 'text', value: 'Command result' }) }),
}

const runSlash: typeof processSlashCommand = (...args) => runWithRuntimeEnv({ ANTHROPIC_API_KEY: 'fixture-only-not-a-key' }, () => processSlashCommand(...args))

let usage: ReturnType<typeof spyOn>
beforeEach(() => { usage = spyOn(skillUsage, 'recordSkillUsage').mockImplementation(() => {}) })
afterEach(() => usage.mockRestore())

let restoreCompact: (() => void) | undefined
afterEach(() => { restoreCompact?.(); restoreCompact = undefined })

describe('slash command provenance', () => {
  test('keeps a human command distinct from the generated result', async () => {
    const result = await runSlash('/example value', [], [], [], contextFor(local), () => {})
    expect(result.messages.map(message => message.messageKind)).toEqual(['internal_notification', 'user_input', 'system_event'])
  })

  test('marks generated validation failures as events', async () => {
    const result = await runSlash('/example', [], [], [], contextFor({ ...local, userInvocable: false }), () => {})
    expect(result.messages.map(message => message.messageKind)).toEqual(['internal_notification', 'user_input', 'system_event'])
  })

  test('keeps system-display command input human and its output a system event', async () => {
    const result = await runSlash('/example', [], [], [], contextFor({
      ...local, type: 'local-jsx',
      load: async () => ({ call: async (done: any) => { done('status', { display: 'system' }); return null } }),
    }), () => {})
    expect(result.messages.map(message => message.messageKind)).toEqual(['user_input', 'system_event'])
  })

  test('leaves retained historical human messages unchanged during compaction', async () => {
    const retained = createUserMessage({ content: 'historical input', messageKind: 'user_input', uuid: '11111111-1111-4111-8111-111111111111' })
    const build = spyOn(compact, 'buildPostCompactMessages').mockImplementation((result: any) => result.messagesToKeep)
    restoreCompact = () => build.mockRestore()
    const result = await runSlash('/example', [], [], [], contextFor({
      ...local, load: async () => ({ call: async () => ({ type: 'compact', compactionResult: { messagesToKeep: [retained] }, displayText: 'compacted' }) }),
    }), () => {}, undefined, undefined, undefined, { messageKind: 'context_summary', isCompactSummary: true })
    expect(result.messages.find(message => message.uuid === retained.uuid)).toBe(retained)
    expect(result.messages.find(message => message.uuid === retained.uuid)?.messageKind).toBe('user_input')
    expect(result.messages.some(message => message.messageKind === 'context_summary')).toBe(true)
  })

  test('marks model-invoked skill loading and expanded instructions as internal', async () => {
    const attachment = spyOn(attachments, 'getAttachmentMessages').mockImplementation(async function* () {} as any)
    try {
      const command = { ...local, type: 'prompt', userInvocable: false, getPromptForCommand: async () => [{ type: 'text', text: 'expanded skill instructions' }] }
      const result = await processPromptSlashCommand('example', '', [command] as any, contextFor(command))
      expect(result.messages.slice(0, 2).map(message => message.messageKind)).toEqual(['internal_notification', 'internal_notification'])
      expect(result.messages[1]).toMatchObject({ isMeta: true })
    } finally { attachment.mockRestore() }
  })

  test('keeps hidden generated local-jsx context separate from typed input and output', async () => {
    const result = await runSlash('/example', [], [], [], contextFor({
      ...local, type: 'local-jsx',
      load: async () => ({ call: async (done: any) => { done('status', { metaMessages: ['next model context'] }); return null } }),
    }), () => {})
    expect(result.messages.map(message => message.messageKind)).toEqual(['internal_notification', 'user_input', 'system_event', 'internal_notification'])
    expect(result.messages.at(-1)).toMatchObject({ isMeta: true })
  })
})

describe('slash input, validation and expanded command boundaries', () => {
  test('invalid syntax is generated guidance rather than invented human input', async () => {
    const result = await runSlash('/', [], [], [], contextFor(local), () => {})
    expect(result.shouldQuery).toBe(false)
    expect(result.messages.at(-1)).toMatchObject({ messageKind: 'system_event' })
    expect(result.resultText).toContain('Commands are in the form')
  })

  test('unknown skill preserves arguments only as generated warning', async () => {
    const result = await runSlash('/missing-fixture-skill argument', [], [], [], contextFor(local), () => {})
    expect(result.shouldQuery).toBe(false)
    expect(result.messages.at(-2)?.messageKind).toBe('system_event')
    expect(result.messages.at(-1)).toMatchObject({ type: 'system', messageKind: 'system_event' })
    expect(result.resultText).toContain('Unknown skill')
  })

  test('absolute path input remains human text with independent visibility flags', async () => {
    const result = await runSlash('/no/such/fixture-path.txt', [], [], [], contextFor(local), () => {}, '22222222-2222-4222-8222-222222222222', false, undefined,
      { messageKind: 'user_input', isVisibleInTranscriptOnly: true })
    expect(result.shouldQuery).toBe(true)
    expect(result.messages[0]).toMatchObject({ uuid: '22222222-2222-4222-8222-222222222222', messageKind: 'user_input', isVisibleInTranscriptOnly: true,
      message: { content: '/no/such/fixture-path.txt' } })
  })

  test('empty local-jsx output is generated and does not inherit scheduled input provenance', async () => {
    const result = await runSlash('/example', [], [], [], contextFor({ ...local, type: 'local-jsx',
      load: async () => ({ call: async (done: any) => { done(); return null } }),
    }), () => {}, undefined, false, undefined, { messageKind: 'internal_notification', isSynthetic: true })
    expect(result.messages[1]).toMatchObject({ messageKind: 'internal_notification', isSynthetic: true })
    expect(result.messages[2]?.messageKind).toBe('system_event')
    expect(result.messages[2]?.isSynthetic).not.toBe(true)
    expect(JSON.stringify(result.messages[2])).toContain('local-command-stdout')
  })

  test.each(['error', 'abort'] as const)('prompt %s keeps origin separate from generated failure', async kind => {
    const { AbortError } = await import('../errors.js')
    const result = await runSlash('/example argument', [], [], [], contextFor({ ...local, type: 'prompt',
      getPromptForCommand: async () => { throw kind === 'abort' ? new AbortError() : new Error('fixture expansion failed') },
    }), () => {}, undefined, false, undefined, { messageKind: 'internal_notification', isSynthetic: true })
    expect(result.shouldQuery).toBe(false)
    expect(result.messages[1]).toMatchObject({ messageKind: 'internal_notification', isSynthetic: true })
    expect(result.messages[2]?.messageKind).toBe(kind === 'abort' ? 'internal_notification' : 'system_event')
    expect(result.messages[2]?.isSynthetic).not.toBe(true)
    if (kind === 'error') expect(JSON.stringify(result.messages[2])).toContain('fixture expansion failed')
    else expect(JSON.stringify(result.messages[2])).toContain('interrupted')
  })

  test('typed skill input stays human while expanded instructions remain internal', async () => {
    const attachment = spyOn(attachments, 'getAttachmentMessages').mockImplementation(async function* () {} as any)
    try {
      const result = await runSlash('/example argument', [], [], [], contextFor({ ...local, type: 'prompt',
        getPromptForCommand: async () => [{ type: 'text', text: 'fixture expanded instructions' }],
      }), () => {})
      expect(result.shouldQuery).toBe(true)
      expect(result.messages.slice(0, 2).map(message => message.messageKind)).toEqual(['user_input', 'internal_notification'])
      expect(result.messages[1]).toMatchObject({ isMeta: true })
      expect(JSON.stringify(result.messages[1])).toContain('fixture expanded instructions')
    } finally { attachment.mockRestore() }
  })

  test('forked command keeps human request separate from generated subagent result', async () => {
    const fork = await import('../forkedAgent.js')
    const runner = await import('../../tools/AgentTool/runAgent.js')
    const ui = await import('../../tools/AgentTool/UI.js')
    const prepare = spyOn(fork, 'prepareForkedCommandContext').mockResolvedValue({
      skillContent: 'fixture skill', modifiedGetAppState: () => ({}),
      baseAgent: { agentType: 'fixture-worker' }, promptMessages: [],
    } as any)
    const execute = spyOn(runner, 'runAgent').mockImplementation(async function* () {} as any)
    const render = spyOn(ui, 'renderToolUseProgressMessage').mockReturnValue(null as any)
    try {
      const result = await runSlash('/example argument', [], [], [], contextFor({ ...local, type: 'prompt', context: 'fork' }), () => {})
      expect(execute).toHaveBeenCalledTimes(1)
      expect(result.messages.map(message => message.messageKind)).toEqual(['internal_notification', 'user_input', 'system_event'])
      expect(JSON.stringify(result.messages[1])).toContain('/example argument')
      expect(JSON.stringify(result.messages[2])).toContain('Command completed')
      expect(result.shouldQuery).toBe(false)
    } finally { render.mockRestore(); execute.mockRestore(); prepare.mockRestore() }
  })
})

test('malformed custom display metadata becomes generated guidance without inventing a human instruction', async () => {
  const { MalformedCommandError } = await import('../errors.js')
  const result = await runSlash('/example argument', [], [], [], contextFor({
    ...local,
    userFacingName: () => { throw new MalformedCommandError('Plugin display metadata is invalid') },
  }), () => {})
  expect(result.shouldQuery).toBe(false)
  expect(result.messages.every(message => message.messageKind !== 'user_input')).toBe(true)
  expect(result.messages.at(-1)).toMatchObject({ type: 'user', messageKind: 'system_event', message: { content: 'Plugin display metadata is invalid' } })
})
