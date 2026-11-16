import { expect, test } from 'bun:test'
import type { FilesPersistedEventData } from './types.js'
import { SDKFilesPersistedEventSchema } from '../../entrypoints/sdk/coreSchemas.js'

test('persistence results use the implemented SDK wire fields', () => {
  const result: FilesPersistedEventData = {
    files: [{ filename: '/outputs/report.txt', file_id: 'file_1' }],
    failed: [{ filename: '/outputs/missing.txt', error: 'upload failed' }],
  }
  const envelope = { type: 'system', subtype: 'files_persisted', ...result, processed_at: '2026-11-10T00:00:00Z', uuid: 'message', session_id: 'session' } as const
  expect(SDKFilesPersistedEventSchema().parse(envelope)).toEqual(envelope)
})
test('no-output result remains a valid persistence event', () => {
  const result: FilesPersistedEventData = { files: [], failed: [] }
  expect(SDKFilesPersistedEventSchema().safeParse({ type: 'system', subtype: 'files_persisted', ...result, processed_at: '2026-11-10T00:00:00Z', uuid: 'message', session_id: 'session' }).success).toBe(true)
})
