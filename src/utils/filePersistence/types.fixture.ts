import type { FilesPersistedEventData } from './types.js'
import type { SDKFilesPersistedEvent } from '../../entrypoints/sdk/coreTypes.js'
const persistence: FilesPersistedEventData = { files: [{ filename: '/outputs/result.txt', file_id: 'file_1' }], failed: [{ filename: '/outputs/failed.txt', error: 'upload failed' }] }
const envelope: SDKFilesPersistedEvent = { type: 'system', subtype: 'files_persisted', ...persistence, processed_at: '2026-11-10T00:00:00Z', uuid: 'message', session_id: 'session' }
// @ts-expect-error output wire fields use filename/file_id, never phantom filePath/fileId
const invalid: FilesPersistedEventData = { persisted: [{ filePath: 'output', fileId: 'id' }], failed: [] }
void [persistence, envelope, invalid]
