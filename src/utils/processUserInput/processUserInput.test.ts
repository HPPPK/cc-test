import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { processUserInput } from './processUserInput.js'
import * as hooks from '../hooks.js'
import * as images from '../imageResizer.js'
import { runWithRuntimeEnv } from '../runtimeEnv.js'

function commandInput(metadata: Record<string, unknown> = {}) {
  return {
    input: '/fixture', mode: 'prompt', skipAttachments: true,
    context: {
      options: { commands: [{
        type: 'local', name: 'fixture', description: 'test',
        load: async () => ({ call: async () => ({ type: 'text', value: 'generated status' }) }),
      }], isNonInteractiveSession: true },
      getAppState: () => ({ toolPermissionContext: { mode: 'default' } }),
    },
    setToolJSX: () => {},
    ...metadata,
  } as any
}

const runInput = (metadata?: Record<string, unknown>) => runWithRuntimeEnv(
  { ANTHROPIC_API_KEY: 'fixture-only-not-a-key' },
  () => processUserInput(commandInput(metadata)),
)

const restores: Array<() => void> = []
afterEach(() => { for (const restore of restores.splice(0)) restore() })

describe('processUserInput provenance', () => {
  test('propagates runtime metadata only to the input and preserves generated output identity', async () => {
    const result = await runInput({ messageKind: 'context_summary', isCompactSummary: true, isSynthetic: true })
    expect(result.messages.map(message => message.messageKind)).toEqual(['internal_notification', 'context_summary', 'system_event'])
    expect(result.messages[1]).toMatchObject({ isCompactSummary: true, isSynthetic: true })
    expect(result.messages[2]?.isCompactSummary).not.toBe(true)
  })

  test('marks generated hook stops internal while retaining the input provenance', async () => {
    const hook = spyOn(hooks, 'executeUserPromptSubmitHooks').mockImplementation(async function* () { yield { preventContinuation: true, stopReason: 'fixture hook' } } as any)
    restores.push(() => hook.mockRestore())
    const result = await runWithRuntimeEnv({ ANTHROPIC_API_KEY: 'fixture-only-not-a-key' }, () => processUserInput(commandInput({ input: 'human prompt' })))
    expect(result.messages.map(message => message.messageKind)).toEqual(['user_input', 'internal_notification'])
    expect(result.shouldQuery).toBe(false)
  })

  test('marks generated image metadata independently from the human command', async () => {
    const resize = spyOn(images, 'maybeResizeAndDownsampleImageBlock').mockImplementation(async (block: any) => ({ block, dimensions: { originalWidth: 24, originalHeight: 68, displayWidth: 12, displayHeight: 34 } }) as any)
    restores.push(() => resize.mockRestore())
    const result = await runInput({ input: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AA==' } }, { type: 'text', text: '/fixture' }] })
    expect(result.messages.at(-1)).toMatchObject({ messageKind: 'internal_notification', isMeta: true })
    expect(result.messages[1]?.messageKind).toBe('user_input')
  })

  test('retains strong task-notification provenance on legacy input without flags', async () => {
    const hook = spyOn(hooks, 'executeUserPromptSubmitHooks').mockImplementation(async function* () {} as any)
    restores.push(() => hook.mockRestore())
    const result = await runInput({ input: 'runtime status', mode: 'task-notification' })
    expect(result.messages[0]?.messageKind).toBe('internal_notification')
  })

  test('retains an explicitly human command independently of visibility flags', async () => {
    const result = await runInput({ messageKind: 'user_input', isMeta: true })
    expect(result.messages[1]).toMatchObject({ messageKind: 'user_input', isMeta: true })
    expect(result.messages[2]?.messageKind).toBe('system_event')
  })
})

test('remote terminal-only command preserves human provenance but blocks local execution', async () => {
  const input = commandInput({ bridgeOrigin: true, skipSlashCommands: true, messageKind: 'user_input', isSynthetic: true })
  input.context.options.commands[0].type = 'local-jsx'
  const call = spyOn(input.context.options.commands[0], 'load')
  try {
    const result = await runWithRuntimeEnv({ ANTHROPIC_API_KEY: 'fixture-only-not-a-key' }, () => processUserInput(input))
    expect(call).not.toHaveBeenCalled()
    expect(result.shouldQuery).toBe(false)
    expect(result.messages[0]).toMatchObject({ messageKind: 'user_input', isSynthetic: true, message: { content: '/fixture' } })
    expect(result.messages[1]?.messageKind).toBe('system_event')
    expect(result.resultText).toContain("isn't available over Remote Control")
  } finally { call.mockRestore() }
})

test('shell dispatch propagates scheduled origin without reclassifying its output', async () => {
  const { BashTool } = await import('../../tools/BashTool/BashTool.js')
  const call = spyOn(BashTool, 'call').mockResolvedValue({ data: { stdout: 'scheduled output', stderr: '', interrupted: false } } as any)
  try {
    const result = await runInput({ input: 'echo fixture', mode: 'bash', messageKind: 'internal_notification', isSynthetic: true })
    expect(call).toHaveBeenCalledTimes(1)
    expect(result.messages[1]).toMatchObject({ messageKind: 'internal_notification', isSynthetic: true })
    expect(result.messages.at(-1)?.messageKind).toBe('system_event')
    expect(JSON.stringify(result.messages.at(-1))).toContain('scheduled output')
  } finally { call.mockRestore() }
})
