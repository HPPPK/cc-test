import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadTranscriptFile } from '../sessionStorage.js'

test('malformed preserved-segment UUID metadata leaves legacy records and disk bytes unchanged', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'preserved-contract-'))
  const file = join(directory, 'fixture.jsonl')
  const uuid = '11111111-1111-4111-8111-111111111111'
  const boundary = '22222222-2222-4222-8222-222222222222'
  const records = [
    { type: 'user', uuid, parentUuid: null, timestamp: '2026-01-01', message: { role: 'user', content: 'legacy' } },
    { type: 'system', subtype: 'compact_boundary', uuid: boundary, parentUuid: null, timestamp: '2026-01-01', content: 'compacted', compactMetadata: { trigger: 'auto', preTokens: 4, preservedSegment: { headUuid: 'invalid-head', tailUuid: uuid, anchorUuid: boundary } } },
  ]
  const raw = records.map(value => JSON.stringify(value)).join('\n') + '\n'
  try {
    await writeFile(file, raw)
    const loaded = await loadTranscriptFile(file)
    expect(loaded.messages.get(uuid)?.parentUuid).toBeNull()
    expect(loaded.messages.size).toBe(2)
    expect(await readFile(file, 'utf8')).toBe(raw)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

const ids = {
  stale: '00000000-0000-4000-8000-000000000001',
  head: '00000000-0000-4000-8000-000000000002',
  tail: '00000000-0000-4000-8000-000000000003',
  boundary: '00000000-0000-4000-8000-000000000004',
  anchor: '00000000-0000-4000-8000-000000000005',
  continuation: '00000000-0000-4000-8000-000000000006',
} as const

async function withTranscript(records: readonly unknown[], check: (path: string, raw: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'preserved-chain-'))
  const file = join(directory, 'fixture.jsonl')
  const raw = records.map(value => JSON.stringify(value)).join('\n') + '\n'
  try {
    await writeFile(file, raw)
    await check(file, raw)
    expect(await readFile(file, 'utf8')).toBe(raw)
  } finally { await rm(directory, { recursive: true, force: true }) }
}

function userRecord(uuid: string, parentUuid: string | null, content = 'fixture') {
  return { type: 'user', uuid, parentUuid, timestamp: '2026-01-01T00:00:00Z', message: { role: 'user', content } }
}
function boundaryRecord() {
  return { type: 'system', subtype: 'compact_boundary', uuid: ids.boundary, parentUuid: null, timestamp: '2026-01-01T00:00:00Z', content: 'compacted', compactMetadata: { trigger: 'auto', preTokens: 400, preservedSegment: { headUuid: ids.head, tailUuid: ids.tail, anchorUuid: ids.anchor } } }
}

test('valid preserved history relinks both endpoints and clears stale assistant usage in memory', async () => {
  const { createAssistantMessage } = await import('../messages.js')
  const assistant = createAssistantMessage({ content: 'retained response' })
  await withTranscript([
    userRecord(ids.stale, null),
    userRecord(ids.head, ids.stale),
    { ...assistant, uuid: ids.tail, parentUuid: ids.head, message: { ...assistant.message, usage: { ...assistant.message.usage, input_tokens: 400, output_tokens: 20 } } },
    boundaryRecord(),
    userRecord(ids.anchor, ids.boundary, 'compaction summary'),
    userRecord(ids.continuation, ids.anchor, 'next prompt'),
  ], async file => {
    const { messages } = await loadTranscriptFile(file)
    expect(messages.has(ids.stale)).toBe(false)
    expect(messages.get(ids.head)?.parentUuid).toBe(ids.anchor)
    expect(messages.get(ids.continuation)?.parentUuid).toBe(ids.tail)
    const tail = messages.get(ids.tail)
    if (tail?.type !== 'assistant') throw new Error('Expected preserved assistant')
    expect(tail.message.usage.input_tokens).toBe(0)
    expect(tail.message.usage.output_tokens).toBe(0)
    expect(messages.has(ids.anchor)).toBe(true)
  })
})

test('valid UUIDs with a broken preserved chain never prune or partially relink history', async () => {
  await withTranscript([
    userRecord(ids.stale, null),
    userRecord(ids.tail, null),
    boundaryRecord(),
    userRecord(ids.anchor, ids.boundary),
    userRecord(ids.continuation, ids.anchor),
  ], async file => {
    const { messages } = await loadTranscriptFile(file)
    expect(messages.size).toBe(5)
    expect(messages.get(ids.tail)?.parentUuid).toBeNull()
    expect(messages.get(ids.continuation)?.parentUuid).toBe(ids.anchor)
    expect(messages.has(ids.stale)).toBe(true)
  })
})

test('imported transcript counts visible assistant responses without counting generated assistant notices', async () => {
  const { createAssistantMessage, createUserMessage } = await import('../messages.js')
  const { loadTranscriptFromFile } = await import('../sessionStorage.js')
  const directory = await mkdtemp(join(tmpdir(), 'visible-assistant-'))
  const file = join(directory, 'fixture.json')
  const response = createAssistantMessage({ content: 'visible answer' })
  const records = [
    createUserMessage({ content: 'human prompt' }),
    response,
    { ...createAssistantMessage({ content: 'generated notice' }), messageKind: 'system_event' },
    { ...createAssistantMessage({ content: 'hidden summary' }), messageKind: 'context_summary' },
    { ...createAssistantMessage({ content: 'hidden notification' }), messageKind: 'internal_notification' },
    createAssistantMessage({ content: [{ type: 'tool_use', id: 'fixture-tool', name: 'Read', input: {} }] }),
  ]
  const raw = JSON.stringify(records)
  try {
    await writeFile(file, raw)
    const loaded = await loadTranscriptFromFile(file)
    expect(loaded.messageCount).toBe(2)
    expect(loaded.messages).toHaveLength(6)
    expect(await readFile(file, 'utf8')).toBe(raw)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('unresolved tool lookup returns the latest matching assistant and stops once its result arrives', async () => {
  const { dirname, relative, isAbsolute } = await import('node:path')
  const { mkdir } = await import('node:fs/promises')
  const { createAssistantMessage, createUserMessage } = await import('../messages.js')
  const { findUnresolvedToolUse, getTranscriptPath, resetProjectForTesting } = await import('../sessionStorage.js')
  const previousConfig = process.env.CLAUDE_CONFIG_DIR
  const directory = await mkdtemp(join(tmpdir(), 'unresolved-tool-'))
  try {
    process.env.CLAUDE_CONFIG_DIR = directory
    resetProjectForTesting()
    const file = getTranscriptPath()
    const fixtureRelativePath = relative(directory, file)
    if (fixtureRelativePath.startsWith('..') || isAbsolute(fixtureRelativePath)) throw new Error('Fixture path must remain inside the temporary config root')
    await mkdir(dirname(file), { recursive: true })
    const previousTool = createAssistantMessage({ content: [{ type: 'tool_use', id: 'tool-fixture', name: 'Read', input: { file_path: 'earlier' } }] })
    const tool = createAssistantMessage({ content: [{ type: 'tool_use', id: 'tool-fixture', name: 'Read', input: { file_path: 'latest' } }] })
    const raw = JSON.stringify({ ...previousTool, parentUuid: null }) + '\n' + JSON.stringify({ ...tool, parentUuid: previousTool.uuid }) + '\n'
    await writeFile(file, raw)
    expect((await findUnresolvedToolUse('tool-fixture'))?.uuid).toBe(tool.uuid)
    expect(await findUnresolvedToolUse('missing-tool')).toBeNull()
    const result = createUserMessage({ content: [{ type: 'tool_result', tool_use_id: 'tool-fixture', content: 'done' }] })
    await writeFile(file, raw + JSON.stringify({ ...result, parentUuid: tool.uuid }) + '\n')
    expect(await findUnresolvedToolUse('tool-fixture')).toBeNull()
  } finally {
    resetProjectForTesting()
    if (previousConfig === undefined) delete process.env.CLAUDE_CONFIG_DIR
    else process.env.CLAUDE_CONFIG_DIR = previousConfig
    await rm(directory, { recursive: true, force: true })
  }
})
