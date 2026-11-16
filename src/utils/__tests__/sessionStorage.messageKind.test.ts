import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { extractFirstPromptFromChunk, getFirstMeaningfulUserMessageTextContent, loadTranscriptFile, loadTranscriptFromFile, removeExtraFields } from '../sessionStorage.js'
import { extractFirstPromptFromHead } from '../sessionStoragePortable.js'

const dirs: string[] = []
afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))) })
const record = (uuid: string, metadata: Record<string, unknown> = {}) => ({ type: 'user', uuid, parentUuid: null, sessionId: '11111111-1111-4111-8111-111111111111', timestamp: '2026-11-10T00:00:00Z', message: { role: 'user', content: 'This session is being continued from a previous conversation.' }, ...metadata }) as any

describe('session provenance in-memory upgrade', () => {
  test('loads old JSONL fixture additively and never rewrites its bytes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'session-kind-')); dirs.push(dir)
    const path = join(dir, 'fixture.jsonl')
    const raw = [record('summary', { isCompactSummary: true, isMeta: false }), record('human', { parentUuid: 'summary' })].map(entry => JSON.stringify(entry)).join('\n') + '\n'
    await writeFile(path, raw)
    const loaded = await loadTranscriptFile(path)
    expect(loaded.messages.get('summary' as any)).toMatchObject({ messageKind: 'context_summary', isCompactSummary: true, isMeta: false })
    expect(loaded.messages.get('human' as any)).toMatchObject({ messageKind: 'user_input' })
    expect(await readFile(path, 'utf8')).toBe(raw)
  })
  test('upgrades old JSON import and excludes synthetic turns from visible counts', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'session-kind-')); dirs.push(dir)
    const path = join(dir, 'fixture.json')
    const raw = JSON.stringify([record('summary', { isCompactSummary: true }), record('notification', { isMeta: true }), record('human')])
    await writeFile(path, raw)
    const loaded = await loadTranscriptFromFile(path)
    expect(loaded.messages.map(message => message.messageKind)).toEqual(['context_summary', 'internal_notification', 'user_input'])
    expect(loaded.messageCount).toBe(1)
    expect(await readFile(path, 'utf8')).toBe(raw)
  })
  test('serialization boundary upgrades a copy without mutating input', () => {
    const old = record('summary', { isCompactSummary: true })
    expect(removeExtraFields([old])[0]).toMatchObject({ messageKind: 'context_summary' })
    expect(old).not.toHaveProperty('messageKind')
  })
  test('portable and full title scans preserve human pasted internal-looking text', () => {
    const human = record('human', { messageKind: 'user_input', isMeta: true, message: { role: 'user', content: '<task-notification>example pasted by a human</task-notification>' } })
    const summary = record('summary', { isCompactSummary: true })
    const head = [summary, human].map(entry => JSON.stringify(entry)).join('\n')
    expect(extractFirstPromptFromHead(head)).toBe(human.message.content)
    expect(extractFirstPromptFromChunk(head)).toBe(human.message.content)
    expect(getFirstMeaningfulUserMessageTextContent([summary, human])).toBe(human.message.content)
  })
})
