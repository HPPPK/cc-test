import type { Message } from '../../types/message.js'
import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { BashTool } from '../../tools/BashTool/BashTool.js'
import { processBashCommand } from './processBashCommand.js'

let call: ReturnType<typeof spyOn> | undefined
afterEach(() => call?.mockRestore())
const context = { options: { verbose: false } } as any

function lastUserContent(messages: Message[]) {
  const last = messages.at(-1)
  if (last?.type !== 'user') throw new Error('Expected shell output user-role envelope')
  return last.message.content
}

describe('bash command provenance', () => {
  test('keeps typed shell input human and successful output generated', async () => {
    call = spyOn(BashTool, 'call').mockResolvedValue({ data: { stdout: 'result', stderr: '', interrupted: false } } as any)
    const result = await processBashCommand('echo fixture', [], [], context, () => {})
    expect(call).toHaveBeenCalledTimes(1)
    expect(result.messages.map(message => message.messageKind)).toEqual(['internal_notification', 'user_input', 'system_event'])
    expect(lastUserContent(result.messages)).toContain('<bash-stdout>')
  })

  test('keeps failed shell output generated', async () => {
    call = spyOn(BashTool, 'call').mockRejectedValue(new Error('fixture failure'))
    const result = await processBashCommand('echo fixture', [], [], context, () => {})
    expect(call).toHaveBeenCalledTimes(1)
    expect(result.messages.map(message => message.messageKind)).toEqual(['internal_notification', 'user_input', 'system_event'])
    expect(lastUserContent(result.messages)).toContain('fixture failure')
  })
})

test('nonzero shell exit preserves real stdout/stderr as generated events', async () => {
  const { ShellError } = await import('../errors.js')
  call = spyOn(BashTool, 'call').mockRejectedValue(new ShellError('partial <output>', 'fixture & failure', 2, false))
  const result = await processBashCommand('fixture-command', [], [], context, () => {}, { messageKind: 'internal_notification', isSynthetic: true })
  expect(result.shouldQuery).toBe(false)
  expect(result.messages[1]).toMatchObject({ messageKind: 'internal_notification', isSynthetic: true })
  expect(result.messages.at(-1)).toMatchObject({ messageKind: 'system_event' })
  expect(lastUserContent(result.messages)).toBe('<bash-stdout>partial &lt;output&gt;</bash-stdout><bash-stderr>fixture &amp; failure</bash-stderr>')
  expect(result.messages.at(-1)?.isSynthetic).not.toBe(true)
})
